import type { SQLiteDatabase } from "expo-sqlite";
import type { InventoryModel } from "../../../contexts/inventoryModelState";

export type SalesGuardScope = "BAR" | "SIMPLE";
type StockCheckMode = "FULL" | "SPOT" | undefined;

interface SalesPrerequisiteResult {
  hasSales: boolean;
  since: string | null;
}

interface StockSalesGuardInput {
  inventoryModel: InventoryModel;
  area: "BAR" | "WAREHOUSE" | undefined;
  checkMode: StockCheckMode;
  isProRebaselineCheck: boolean;
}

export function getStockSalesGuardScope({
  inventoryModel,
  area,
  checkMode,
  isProRebaselineCheck,
}: StockSalesGuardInput): SalesGuardScope | null {
  if (checkMode === "SPOT" || inventoryModel === "SIMPLE") {
    return null;
  }
  if (isProRebaselineCheck && area === "BAR") {
    return "BAR";
  }
  return area === "BAR" ? "BAR" : null;
}

function scopeLocationFilter(scope: SalesGuardScope): string {
  if (scope === "BAR") {
    return "UPPER(COALESCE(location, 'WAREHOUSE')) = 'BAR'";
  }
  return "UPPER(COALESCE(location, 'WAREHOUSE')) != 'BAR'";
}

function getSalesAnchorTimestamp(since: string | null): string {
  if (since) return since;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.toISOString();
}

async function getLastStockCheckTimestamp(
  db: SQLiteDatabase,
  scope: SalesGuardScope,
): Promise<string | null> {
  const locationFilter = scopeLocationFilter(scope);
  const row = await db.getFirstAsync<{ created_at: string | null }>(
    `SELECT MAX(created_at) AS created_at
     FROM (
       SELECT created_at
       FROM pending_sync_logs
       WHERE UPPER(COALESCE(type, '')) IN ('STOCK', 'STOCK_CHECK') AND ${locationFilter}
       UNION ALL
       SELECT created_at
       FROM local_inventory_logs
       WHERE UPPER(COALESCE(type, '')) IN ('STOCK', 'STOCK_CHECK') AND ${locationFilter}
     )`,
  );

  return row?.created_at ?? null;
}

async function hasSalesAfter(
  db: SQLiteDatabase,
  since: string | null,
): Promise<boolean> {
  const anchor = getSalesAnchorTimestamp(since);

  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM (
        SELECT created_at
        FROM pending_sync_logs
        WHERE UPPER(COALESCE(type, '')) = 'SALES' AND created_at > ?
        UNION ALL
        SELECT created_at
        FROM local_inventory_logs
        WHERE UPPER(COALESCE(type, '')) = 'SALES' AND created_at > ?
      )
    `,
    [anchor, anchor],
  );
  return (row?.count ?? 0) > 0;
}

export async function checkSalesPrerequisite(
  db: SQLiteDatabase,
  scope: SalesGuardScope,
): Promise<SalesPrerequisiteResult> {
  const since = await getLastStockCheckTimestamp(db, scope);
  const hasSales = await hasSalesAfter(db, since);
  return { hasSales, since };
}
