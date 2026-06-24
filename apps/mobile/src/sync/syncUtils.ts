export interface PendingSyncLog {
  id: string;
  ingredient_id: string | null;
  area_id?: string | null;
  location: "WAREHOUSE" | "BAR";
  type:
    | "IMPORT"
    | "TRANSFER"
    | "AUDIT"
    | "WASTE"
    | "LENT"
    | "SALES"
    | "STOCK"
    | "STOCK_CHECK";
  ai_parsed_quantity: number | null;
  ai_confidence_score: number | null;
  final_confirmed_quantity: number | null;
  quantity_change_base: number | null;
  unit_cost_at_time: number | null;
  source_photo_urls: string[];
  local_image_path: string | null;
  ai_parsed_json: string | null;
  staff_note: string | null;
  is_verified: boolean;
  diff_percentage: number | null;
  created_at: string;
  synced: boolean;
  sync_error: string | null;
  is_new_ingredient: boolean;
  new_ingredient_name: string | null;
  new_ingredient_unit: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
}

export interface PendingSyncLogRow
  extends Omit<
    PendingSyncLog,
    "is_verified" | "synced" | "is_new_ingredient"
  > {
  local_image_path: string | null;
  is_verified: boolean | number | string;
  synced: boolean | number | string;
  is_new_ingredient: boolean | number | string;
}

const SALES_DUPLICATE_WINDOW_MS = 15000;

function normalizeSalesFingerprintValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeSalesFingerprintNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000) / 1000;
}

export function toApiBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function buildSyncPushLog(
  row: PendingSyncLogRow,
  sourcePhotos: string[],
) {
  return {
    id: row.id,
    ingredient_id: row.ingredient_id,
    area_id: row.area_id ?? null,
    location: row.location,
    type: row.type,
    ai_parsed_quantity: row.ai_parsed_quantity,
    ai_confidence_score: row.ai_confidence_score,
    final_confirmed_quantity: row.final_confirmed_quantity,
    quantity_change_base: row.quantity_change_base,
    unit_cost_at_time: row.unit_cost_at_time,
    source_photos: sourcePhotos,
    ai_parsed_json: row.ai_parsed_json
      ? JSON.parse(row.ai_parsed_json)
      : null,
    staff_note: row.staff_note,
    is_verified: toApiBoolean(row.is_verified),
    diff_percentage: row.diff_percentage,
    created_at: row.created_at,
  };
}

function getSalesFingerprintItems(aiParsedJson: string | null): Array<{
  key: string;
  quantity: number;
  unit: string;
  unitCost: number;
}> | null {
  if (!aiParsedJson) return null;

  try {
    const parsed = JSON.parse(aiParsedJson);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.map((item: any) => ({
      key: normalizeSalesFingerprintValue(
        item?.recipe_id ?? item?.ingredient_id ?? item?.ingredient_name,
      ),
      quantity: normalizeSalesFingerprintNumber(item?.quantity),
      unit: normalizeSalesFingerprintValue(item?.unit),
      unitCost: normalizeSalesFingerprintNumber(item?.unit_cost),
    }));
  } catch {
    return null;
  }
}

export function buildSalesPendingFingerprint(log: {
  type: string;
  location: string;
  ai_parsed_json: string | null;
}): string | null {
  if (log.type !== "SALES") return null;

  const items = getSalesFingerprintItems(log.ai_parsed_json);
  if (!items?.length) return null;

  try {
    const parsed = log.ai_parsed_json ? JSON.parse(log.ai_parsed_json) : null;
    return JSON.stringify({
      type: log.type,
      location: log.location,
      totalRevenue: normalizeSalesFingerprintNumber(parsed?.total_revenue),
      totalItems: normalizeSalesFingerprintNumber(parsed?.total_items),
      items: items.sort((a, b) => {
        const byKey = a.key.localeCompare(b.key);
        if (byKey !== 0) return byKey;
        if (a.quantity !== b.quantity) return a.quantity - b.quantity;
        if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
        return a.unitCost - b.unitCost;
      }),
    });
  } catch {
    return null;
  }
}

export function findDuplicatePendingSalesLogs(
  rows: PendingSyncLogRow[],
): Array<{ duplicateId: string; canonicalId: string }> {
  const sortedRows = [...rows].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const canonicalByFingerprint = new Map<
    string,
    { id: string; createdAtMs: number }
  >();
  const duplicates: Array<{ duplicateId: string; canonicalId: string }> = [];

  for (const row of sortedRows) {
    const fingerprint = buildSalesPendingFingerprint(row);
    if (!fingerprint) continue;

    const createdAtMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdAtMs)) continue;

    const canonical = canonicalByFingerprint.get(fingerprint);
    if (
      canonical &&
      createdAtMs - canonical.createdAtMs <= SALES_DUPLICATE_WINDOW_MS
    ) {
      duplicates.push({ duplicateId: row.id, canonicalId: canonical.id });
      continue;
    }

    canonicalByFingerprint.set(fingerprint, {
      id: row.id,
      createdAtMs,
    });
  }

  return duplicates;
}
