// src/features/inventory/services/inventory.service.ts
// SOLID: Service Layer - Single Responsibility (Database/API operations only)
// UI and Hooks must NOT call SQLite directly, always through this service

import { getDB } from "../../../db";
import { incrementStockLevel, resolveLocalAreaByLocation, syncLegacyQtyLocal } from "../../../db/stockLevelHelper";

export interface IngredientData {
  id: string;
  name: string;
  base_unit: string;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  density: number;
  tare_weight: number;
  business_id?: string;
  archived?: number;
}

export interface PendingLogData {
  id: string;
  ingredient_id?: string;
  location: string;
  type: string;
  ai_parsed_quantity?: number;
  final_confirmed_quantity?: number;
  diff_percentage?: number;
  local_image_path?: string;
  sync_status: "pending" | "syncing" | "synced" | "error";
  created_at: string;
}

// ==================== INVENTORY SERVICE ====================
export const InventoryService = {
  /**
   * Initialize database
   */
  init: async (): Promise<void> => {
    await getDB();
    console.log("[InventoryService] Database initialized");
  },

  /**
   * Get all ingredients
   */
  getAll: async (): Promise<IngredientData[]> => {
    const database = await getDB();
    const result = await database.getAllAsync<IngredientData>(
      "SELECT * FROM local_ingredients WHERE archived != 1 OR archived IS NULL ORDER BY name"
    );
    return result;
  },

  /**
   * Get recipe count (Active only)
   */
  getRecipeCount: async (): Promise<number> => {
    const database = await getDB();
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM local_recipes WHERE is_active = 1"
    );
    return result?.count || 0;
  },

  /**
   * Get ingredient by ID
   */
  getById: async (id: string): Promise<IngredientData | null> => {
    const database = await getDB();
    const result = await database.getFirstAsync<IngredientData>(
      "SELECT * FROM local_ingredients WHERE id = ?",
      [id]
    );
    return result || null;
  },

  /**
   * Upsert ingredient (insert or update)
   */
  upsert: async (ingredient: IngredientData): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      `INSERT OR REPLACE INTO local_ingredients 
       (id, name, base_unit, warehouse_qty, bar_qty, unit_cost, density, tare_weight, business_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ingredient.id,
        ingredient.name,
        ingredient.base_unit || "",
        ingredient.warehouse_qty,
        ingredient.bar_qty,
        ingredient.unit_cost,
        ingredient.density || 1,
        ingredient.tare_weight || 0,
        ingredient.business_id || "",
      ]
    );
  },

  /**
   * Bulk sync ingredients from server
   */
  syncFromServer: async (ingredients: IngredientData[]): Promise<number> => {
    const database = await getDB();
    let count = 0;

    for (const item of ingredients) {
      await database.runAsync(
        `INSERT OR REPLACE INTO local_ingredients 
         (id, name, base_unit, warehouse_qty, bar_qty, unit_cost, density, tare_weight, business_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.name,
          item.base_unit || "",
          item.warehouse_qty || 0,
          item.bar_qty || 0,
          item.unit_cost || 0,
          item.density || 1,
          item.tare_weight || 0,
          item.business_id || "",
        ]
      );
      count++;
    }

    return count;
  },

  /**
   * Calculate total inventory value
   */
  getTotalValue: async (): Promise<number> => {
    const database = await getDB();
    const result = await database.getFirstAsync<{ total: number }>(
      `SELECT SUM(sl_total.qty * i.unit_cost) AS total
       FROM local_ingredients i
       JOIN (
         SELECT sl.ingredient_id, SUM(sl.quantity) AS qty
         FROM local_stock_levels sl
         JOIN local_storage_areas sa ON sa.id = sl.area_id AND sa.is_active = 1
         GROUP BY sl.ingredient_id
       ) sl_total ON sl_total.ingredient_id = i.id
       WHERE (i.archived != 1 OR i.archived IS NULL)`
    );
    return result?.total || 0;
  },

  /**
   * Get low stock items (total across all areas < min_threshold, fallback 10)
   * Excludes archived/deleted ingredients
   */
  getLowStock: async (): Promise<IngredientData[]> => {
    const database = await getDB();
    return await database.getAllAsync<IngredientData>(
      `SELECT i.*
       FROM local_ingredients i
       LEFT JOIN (
         SELECT sl.ingredient_id, SUM(sl.quantity) AS total_qty
         FROM local_stock_levels sl
         JOIN local_storage_areas sa ON sa.id = sl.area_id AND sa.is_active = 1
         GROUP BY sl.ingredient_id
       ) sl_total ON sl_total.ingredient_id = i.id
       WHERE (i.archived != 1 OR i.archived IS NULL)
         AND COALESCE(sl_total.total_qty, 0) < 10`
    );
  },

  /**
   * Update unit cost using Weighted Average method
   * Formula: new_cost = (old_qty * old_cost + new_qty * new_cost) / (old_qty + new_qty)
   * Per .script Section 3.3: Cost Update (COGS)
   */
  updateCostWeightedAverage: async (
    ingredientId: string,
    newQuantity: number,
    newUnitCost: number
  ): Promise<number> => {
    const database = await getDB();

    // Get current ingredient data
    const current = await database.getFirstAsync<IngredientData>(
      "SELECT * FROM local_ingredients WHERE id = ?",
      [ingredientId]
    );

    if (!current) {
      console.warn(`[COGS] Ingredient ${ingredientId} not found`);
      return newUnitCost;
    }

    const oldQty = current.warehouse_qty + current.bar_qty;
    const oldCost = current.unit_cost;

    // Calculate weighted average
    // If no existing stock, use new cost directly
    if (oldQty <= 0) {
      return newUnitCost;
    }

    const totalQty = oldQty + newQuantity;
    const weightedCost =
      (oldQty * oldCost + newQuantity * newUnitCost) / totalQty;

    console.log(
      `[COGS] Weighted Average: (${oldQty} * ${oldCost} + ${newQuantity} * ${newUnitCost}) / ${totalQty} = ${weightedCost.toFixed(
        2
      )}`
    );

    return Math.round(weightedCost * 100) / 100; // Round to 2 decimals
  },

  /**
   * Add import (Nhập hàng) - Updates stock and COGS using weighted average
   * Per .script Section 3.3: COGS recalculation on import
   */
  addImport: async (
    ingredientId: string,
    quantity: number,
    unitCost: number,
    location: "WAREHOUSE" | "BAR" = "WAREHOUSE"
  ): Promise<void> => {
    const database = await getDB();

    // Calculate new weighted average cost
    const newCost = await InventoryService.updateCostWeightedAverage(
      ingredientId,
      quantity,
      unitCost
    );

    // Update unit_cost
    await database.runAsync(
      `UPDATE local_ingredients SET unit_cost = ? WHERE id = ?`,
      [newCost, ingredientId]
    );

    // Update stock via stock_levels (syncLegacyQtyLocal keeps cache in sync)
    const importAreaId = await resolveLocalAreaByLocation(database, location);
    if (importAreaId) {
      await incrementStockLevel(database, ingredientId, importAreaId, quantity);
    }

    console.log(
      `[Import] Added ${quantity} to ${location}, new COGS: ${newCost}`
    );
  },

  /**
   * Reset Warehouse Stock for uncounted items (FULL_COUNT mode)
   * Sets warehouse_qty = 0 for items NOT in the counted list
   */
  resetUncountedWarehouseStock: async (
    countedIngredientIds: string[]
  ): Promise<number> => {
    const database = await getDB();

    if (!database) return 0;

    try {
      // Find STORAGE area to zero out
      const storageArea = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM local_storage_areas WHERE type = 'STORAGE' AND is_active = 1 ORDER BY is_default DESC LIMIT 1`
      );
      if (!storageArea) return 0;

      // Fetch ingredient IDs that need zeroing
      let uncountedIds: string[];
      if (countedIngredientIds.length === 0) {
        const rows = await database.getAllAsync<{ id: string }>(
          `SELECT id FROM local_ingredients WHERE (archived != 1 OR archived IS NULL)`
        );
        uncountedIds = rows.map((r) => r.id);
      } else {
        const placeholders = countedIngredientIds.map(() => "?").join(",");
        const rows = await database.getAllAsync<{ id: string }>(
          `SELECT id FROM local_ingredients WHERE (archived != 1 OR archived IS NULL) AND id NOT IN (${placeholders})`,
          countedIngredientIds
        );
        uncountedIds = rows.map((r) => r.id);
      }

      for (const id of uncountedIds) {
        await database.runAsync(
          `INSERT OR REPLACE INTO local_stock_levels (id, ingredient_id, area_id, quantity, synced)
           VALUES (COALESCE((SELECT id FROM local_stock_levels WHERE ingredient_id=? AND area_id=?), lower(hex(randomblob(16)))), ?, ?, 0, 0)`,
          [id, storageArea.id, id, storageArea.id]
        );
        await syncLegacyQtyLocal(database, id);
      }

      console.log(`[FullCount] Reset ${uncountedIds.length} uncounted items to 0`);
      return uncountedIds.length;
    } catch (e) {
      console.error("[FullCount] Error resetting stock:", e);
      return 0;
    }
  },
};

// ==================== PENDING LOG SERVICE ====================
export const PendingLogService = {
  /**
   * Add a pending log
   */
  add: async (log: Omit<PendingLogData, "sync_status">): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      `INSERT INTO pending_sync_logs 
       (id, ingredient_id, location, type, ai_parsed_quantity, final_confirmed_quantity, 
        diff_percentage, local_image_path, sync_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        log.id,
        log.ingredient_id || null,
        log.location,
        log.type,
        log.ai_parsed_quantity || null,
        log.final_confirmed_quantity || null,
        log.diff_percentage || null,
        log.local_image_path || null,
        log.created_at,
      ]
    );
  },

  /**
   * Get all pending logs
   */
  getPending: async (): Promise<PendingLogData[]> => {
    const database = await getDB();
    return await database.getAllAsync<PendingLogData>(
      "SELECT * FROM pending_sync_logs WHERE sync_status = 'pending' ORDER BY created_at DESC"
    );
  },

  /**
   * Mark log as synced
   */
  markSynced: async (id: string): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      "UPDATE pending_sync_logs SET sync_status = 'synced' WHERE id = ?",
      [id]
    );
  },

  /**
   * Mark log as error
   */
  markError: async (id: string, _error: string): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      "UPDATE pending_sync_logs SET sync_status = 'error' WHERE id = ?",
      [id]
    );
  },

  /**
   * Get pending count
   */
  getPendingCount: async (): Promise<number> => {
    const database = await getDB();
    const result = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM pending_sync_logs WHERE sync_status = 'pending'"
    );
    return result?.count || 0;
  },

  /**
   * Clear synced logs
   */
  clearSynced: async (): Promise<void> => {
    const database = await getDB();
    await database.runAsync(
      "DELETE FROM pending_sync_logs WHERE sync_status = 'synced'"
    );
  },
};
