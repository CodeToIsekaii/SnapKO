/**
 * Theoretical Stock Calculator for Bar Variance Detection
 *
 * Formula: Theoretical Bar Stock = Starting Qty + Transfers - Recipe Consumption
 *
 * Technical Notes (per user feedback):
 * 1. Unit Conversion: All quantities normalized to ingredient's base_unit
 * 2. Time Boundary: Query SALES from last bar check timestamp, not just today
 * 3. MVP Assumption: Single closing check per day (can enhance later)
 */

import type { SQLiteDatabase } from "expo-sqlite";
import { convertToIngredientBase } from "@snapko/shared";

// =====================================
// TYPES
// =====================================

interface SalesLogItem {
  recipe_id?: string;
  mapped_id?: string;
  name: string;
  quantity: number;
}

interface RecipeIngredient {
  ingredient_id: string;
  quantity: number;
  unit: string;
}

interface LocalIngredient {
  id: string;
  name: string;
  base_unit: string;
  density: number | null;
  bar_qty: number;
  warehouse_qty: number;
}

export interface TheoreticalBreakdown {
  ingredientId: string;
  ingredientName: string;
  startingQty: number;
  transfersIn: number;
  salesConsumption: number;
  theoreticalQty: number;
  unit: string;
}

// =====================================
// QUERY FUNCTIONS
// =====================================

/**
 * Get SALES logs from the last bar stock check until now
 * Fixes Time Boundary issue: prevents double-counting if multiple checks per day
 */
export async function getSalesLogsSinceLastBarCheck(
  db: SQLiteDatabase,
): Promise<
  Array<{
    id: string;
    created_at: string;
    ai_parsed_json: string | null;
  }>
> {
  // Get timestamp of last BAR stock check
  const lastCheck = await db.getFirstAsync<{ created_at: string }>(
    `SELECT created_at FROM local_inventory_logs 
     WHERE type IN ('STOCK', 'STOCK_CHECK') AND location = 'BAR'
     ORDER BY created_at DESC LIMIT 1`,
  );

  const sinceTimestamp = lastCheck?.created_at || "1970-01-01T00:00:00.000Z";

  console.log(
    `[TheoreticalStock] Querying SALES logs since last bar check: ${sinceTimestamp}`,
  );

  const salesLogs = await db.getAllAsync<{
    id: string;
    created_at: string;
    ai_parsed_json: string | null;
  }>(
    `SELECT id, created_at, ai_parsed_json FROM local_inventory_logs 
     WHERE type = 'SALES' AND created_at > ?
     ORDER BY created_at ASC`,
    [sinceTimestamp],
  );

  console.log(`[TheoreticalStock] Found ${salesLogs.length} SALES logs`);
  return salesLogs;
}

/**
 * Get transfer logs (TRANSFER type) since last bar check
 */
export async function getTransfersSinceLastBarCheck(
  db: SQLiteDatabase,
): Promise<Map<string, number>> {
  const lastCheck = await db.getFirstAsync<{ created_at: string }>(
    `SELECT created_at FROM local_inventory_logs 
     WHERE type IN ('STOCK', 'STOCK_CHECK') AND location = 'BAR'
     ORDER BY created_at DESC LIMIT 1`,
  );

  const sinceTimestamp = lastCheck?.created_at || "1970-01-01T00:00:00.000Z";

  // Query TRANSFER logs where destination is BAR
  const transfers = await db.getAllAsync<{
    ingredient_id: string;
    quantity_change_base: number;
  }>(
    `SELECT ingredient_id, quantity_change_base FROM local_inventory_logs 
     WHERE type = 'TRANSFER' AND location = 'BAR' AND created_at > ?`,
    [sinceTimestamp],
  );

  const transferMap = new Map<string, number>();
  for (const t of transfers) {
    if (t.ingredient_id) {
      const current = transferMap.get(t.ingredient_id) || 0;
      transferMap.set(t.ingredient_id, current + (t.quantity_change_base || 0));
    }
  }

  console.log(`[TheoreticalStock] Transfers: ${transferMap.size} ingredients`);
  return transferMap;
}

// =====================================
// CONSUMPTION CALCULATION
// =====================================

/**
 * Calculate theoretical consumption from SALES logs using recipe ingredients
 * Handles unit conversion to normalize all quantities to ingredient's base_unit
 */
export async function calculateTheoreticalConsumption(
  db: SQLiteDatabase,
  salesLogs: Array<{ ai_parsed_json: string | null }>,
): Promise<Map<string, number>> {
  const consumptionMap = new Map<string, number>();

  for (const log of salesLogs) {
    if (!log.ai_parsed_json) continue;

    let soldItems: SalesLogItem[] = [];
    try {
      const parsed = JSON.parse(log.ai_parsed_json);
      // SALES logs may have items array or flat structure
      soldItems = parsed.items || parsed.recipes || [parsed];
    } catch {
      console.warn("[TheoreticalStock] Failed to parse SALES log JSON");
      continue;
    }

    for (const item of soldItems) {
      const recipeId = item.recipe_id || item.mapped_id;
      if (!recipeId) continue;

      // Get recipe ingredients
      const recipeIngredients = await db.getAllAsync<RecipeIngredient>(
        `SELECT ingredient_id, quantity, unit FROM local_recipe_ingredients WHERE recipe_id = ?`,
        [recipeId],
      );

      for (const ri of recipeIngredients) {
        // Get ingredient for unit conversion
        const ing = await db.getFirstAsync<LocalIngredient>(
          `SELECT id, name, base_unit, density FROM local_ingredients WHERE id = ?`,
          [ri.ingredient_id],
        );

        if (!ing) continue;

        // Calculate consumption with unit conversion
        const recipeQty = ri.quantity * (item.quantity || 1);

        // Convert recipe unit to ingredient's base unit
        let normalizedQty = recipeQty;
        if (ri.unit !== ing.base_unit) {
          const converted = convertToIngredientBase(
            recipeQty,
            ri.unit,
            ing.base_unit,
            ing.density || undefined,
          );
          if (typeof converted === "number") {
            normalizedQty = converted;
            console.log(
              `[TheoreticalStock] Converted ${recipeQty} ${ri.unit} → ${normalizedQty} ${ing.base_unit} for "${ing.name}"`,
            );
          }
        }

        const current = consumptionMap.get(ri.ingredient_id) || 0;
        consumptionMap.set(ri.ingredient_id, current + normalizedQty);
      }
    }
  }

  console.log(
    `[TheoreticalStock] Consumption calculated for ${consumptionMap.size} ingredients`,
  );
  return consumptionMap;
}

// =====================================
// MAIN FUNCTION
// =====================================

/**
 * Calculate theoretical bar stock for all ingredients
 * Returns detailed breakdown for UI display
 */
export async function calculateAllTheoreticalBarStock(
  db: SQLiteDatabase,
): Promise<{
  breakdowns: TheoreticalBreakdown[];
  hasSalesLogs: boolean;
  salesLogCount: number;
}> {
  // 1. Get SALES logs since last bar check
  const salesLogs = await getSalesLogsSinceLastBarCheck(db);
  const hasSalesLogs = salesLogs.length > 0;

  // 2. Calculate consumption from sales
  const consumptionMap = await calculateTheoreticalConsumption(db, salesLogs);

  // 3. Get transfers
  const transferMap = await getTransfersSinceLastBarCheck(db);

  // 4. Get all bar ingredients and calculate theoretical
  const ingredients = await db.getAllAsync<LocalIngredient>(
    `SELECT id, name, base_unit, density, bar_qty FROM local_ingredients WHERE archived = 0`,
  );

  const breakdowns: TheoreticalBreakdown[] = [];

  for (const ing of ingredients) {
    const consumption = consumptionMap.get(ing.id) || 0;
    const transfers = transferMap.get(ing.id) || 0;

    // Theoretical = Current bar_qty (which is our starting point) + transfers - consumption
    // Note: Current bar_qty already includes historical data
    // If we had a proper "starting qty" field, we'd use that instead
    const theoretical = ing.bar_qty + transfers - consumption;

    breakdowns.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      startingQty: ing.bar_qty, // Using current as starting (MVP assumption)
      transfersIn: transfers,
      salesConsumption: consumption,
      theoreticalQty: Math.max(0, theoretical), // Can't be negative
      unit: ing.base_unit,
    });
  }

  return {
    breakdowns,
    hasSalesLogs,
    salesLogCount: salesLogs.length,
  };
}

/**
 * Get theoretical stock for a single ingredient (for variance calculation)
 */
export async function getTheoreticalBarStock(
  db: SQLiteDatabase,
  ingredientId: string,
): Promise<number | null> {
  const { breakdowns } = await calculateAllTheoreticalBarStock(db);
  const found = breakdowns.find((b) => b.ingredientId === ingredientId);
  return found?.theoreticalQty ?? null;
}
