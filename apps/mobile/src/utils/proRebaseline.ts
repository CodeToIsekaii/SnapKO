import type { SQLiteDatabase } from "expo-sqlite";

const KEYS = {
  lastSubscriptionStatus: "last_subscription_status",
  lastSubscriptionExpiresAt: "last_subscription_expires_at",
  requiresProRebaseline: "requires_pro_rebaseline",
  rebaselineWarehouseDone: "rebaseline_warehouse_done",
  rebaselineBarDone: "rebaseline_bar_done",
};

export interface ProRebaselineState {
  required: boolean;
  warehouseDone: boolean;
  barDone: boolean;
}

export function getProRebaselineBannerMessage(
  state: ProRebaselineState,
): string {
  return state.warehouseDone
    ? "Kho tổng đã xong. Cần kiểm riêng Bar để hoàn tất khôi phục Kho Kép."
    : "Cần kiểm lại Kho tổng và Bar để khôi phục Kho Kép.";
}

async function getMeta(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM local_metadata WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

async function setMeta(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO local_metadata (key, value, updated_at)
     VALUES (?, ?, datetime('now'))`,
    [key, value],
  );
}

function isTrue(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function getProRebaselineState(
  db: SQLiteDatabase,
): Promise<ProRebaselineState> {
  const [required, warehouseDone, barDone] = await Promise.all([
    getMeta(db, KEYS.requiresProRebaseline),
    getMeta(db, KEYS.rebaselineWarehouseDone),
    getMeta(db, KEYS.rebaselineBarDone),
  ]);

  return {
    required: isTrue(required),
    warehouseDone: isTrue(warehouseDone),
    barDone: isTrue(barDone),
  };
}

export async function markProRebaselineWarehouseDone(
  db: SQLiteDatabase,
): Promise<void> {
  await setMeta(db, KEYS.rebaselineWarehouseDone, "1");
}

export async function markProRebaselineBarDone(
  db: SQLiteDatabase,
): Promise<void> {
  await setMeta(db, KEYS.rebaselineBarDone, "1");
  await setMeta(db, KEYS.requiresProRebaseline, "0");
}

export async function updateProRebaselineFromSubscription(
  db: SQLiteDatabase,
  input: {
    effectiveTier: string | null;
    subscriptionStatus: string | null;
    subscriptionExpiresAt?: string | null;
  },
): Promise<void> {
  const effectiveTier = String(input.effectiveTier ?? "FREE").toUpperCase();
  const subscriptionStatus = String(
    input.subscriptionStatus ?? "EXPIRED",
  ).toUpperCase();
  const lastStatus = await getMeta(db, KEYS.lastSubscriptionStatus);
  const currentStateIsExpired =
    effectiveTier === "FREE" || subscriptionStatus === "EXPIRED";
  const currentStateIsPaidActive =
    (effectiveTier === "PRO" || effectiveTier === "CHAIN") &&
    (subscriptionStatus === "ACTIVE" || subscriptionStatus === "WARNING");

  if (currentStateIsPaidActive && lastStatus === "EXPIRED") {
    const current = await getProRebaselineState(db);
    if (!current.required) {
      await setMeta(db, KEYS.requiresProRebaseline, "1");
      await setMeta(db, KEYS.rebaselineWarehouseDone, "0");
      await setMeta(db, KEYS.rebaselineBarDone, "0");
    }
  }

  await setMeta(
    db,
    KEYS.lastSubscriptionStatus,
    currentStateIsExpired ? "EXPIRED" : subscriptionStatus,
  );
  await setMeta(
    db,
    KEYS.lastSubscriptionExpiresAt,
    input.subscriptionExpiresAt ?? "",
  );
}
