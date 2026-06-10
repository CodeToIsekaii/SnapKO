import { SQLiteDatabase } from "expo-sqlite";

/** Upsert a stock_levels row and sync the legacy cache columns on local_ingredients. */
export async function upsertStockLevel(
  db: SQLiteDatabase,
  ingredientId: string,
  areaId: string,
  newQty: number,
  lastCountedAt?: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_stock_levels (id, ingredient_id, area_id, quantity, last_counted_at, synced)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 0)
     ON CONFLICT(ingredient_id, area_id) DO UPDATE SET
       quantity = excluded.quantity,
       last_counted_at = COALESCE(excluded.last_counted_at, last_counted_at),
       synced = 0`,
    [ingredientId, areaId, newQty, lastCountedAt ?? null],
  );
  await syncLegacyQtyLocal(db, ingredientId);
}

/** Increment (or decrement via negative delta) a stock_levels row. */
export async function incrementStockLevel(
  db: SQLiteDatabase,
  ingredientId: string,
  areaId: string,
  delta: number,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_stock_levels (id, ingredient_id, area_id, quantity, synced)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, 0)
     ON CONFLICT(ingredient_id, area_id) DO UPDATE SET
       quantity = quantity + excluded.quantity,
       synced = 0`,
    [ingredientId, areaId, delta],
  );
  await syncLegacyQtyLocal(db, ingredientId);
}

/**
 * Recomputes local_ingredients.warehouse_qty and bar_qty from the SUM
 * of active local_stock_levels grouped by area type.
 * STORAGE areas → warehouse_qty, SERVICE areas → bar_qty.
 */
export async function syncLegacyQtyLocal(
  db: SQLiteDatabase,
  ingredientId: string,
): Promise<void> {
  const rows = await db.getAllAsync<{ type: string; total: number }>(
    `SELECT sa.type, COALESCE(SUM(sl.quantity), 0) AS total
     FROM local_stock_levels sl
     JOIN local_storage_areas sa ON sa.id = sl.area_id
     WHERE sl.ingredient_id = ? AND sa.is_active = 1
     GROUP BY sa.type`,
    [ingredientId],
  );

  let warehouseQty = 0;
  let barQty = 0;
  for (const row of rows) {
    if (row.type === "STORAGE") warehouseQty = row.total;
    else if (row.type === "SERVICE") barQty = row.total;
  }

  await db.runAsync(
    `UPDATE local_ingredients SET warehouse_qty = ?, bar_qty = ? WHERE id = ?`,
    [warehouseQty, barQty, ingredientId],
  );
}

/**
 * Returns the area_id for the default STORAGE area, or null if none exists.
 */
export async function resolveLocalStorageAreaId(
  db: SQLiteDatabase,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM local_storage_areas
     WHERE type = 'STORAGE' AND is_active = 1
     ORDER BY is_default DESC LIMIT 1`,
  );
  return row?.id ?? null;
}

/**
 * Returns the area_id for the default SERVICE area, or null if none exists.
 */
export async function resolveLocalServiceAreaId(
  db: SQLiteDatabase,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM local_storage_areas
     WHERE type = 'SERVICE' AND is_active = 1
     ORDER BY is_default DESC LIMIT 1`,
  );
  return row?.id ?? null;
}

/**
 * Maps a legacy location string ('WAREHOUSE' | 'BAR') to a local area_id.
 */
export async function resolveLocalAreaByLocation(
  db: SQLiteDatabase,
  location: string,
): Promise<string | null> {
  const type = location === "BAR" ? "SERVICE" : "STORAGE";
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM local_storage_areas
     WHERE type = ? AND is_active = 1
     ORDER BY is_default DESC LIMIT 1`,
    [type],
  );
  return row?.id ?? null;
}
