// src/features/inventory/services/inventory.service.ts
// SOLID: Service Layer - Single Responsibility (Database/API operations only)
// UI and Hooks must NOT call SQLite directly, always through this service

import * as SQLite from "expo-sqlite";

export interface IngredientData {
  id: string;
  name: string;
  base_unit: string;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  business_id?: string;
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

// Database singleton
let db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("snapko_mobile.db");
    await initTables();
  }
  return db;
}

async function initTables(): Promise<void> {
  if (!db) return;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      base_unit TEXT,
      warehouse_qty REAL NOT NULL DEFAULT 0,
      bar_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      business_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pending_sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      ingredient_id TEXT,
      location TEXT NOT NULL,
      type TEXT NOT NULL,
      ai_parsed_quantity REAL,
      final_confirmed_quantity REAL,
      diff_percentage REAL,
      local_image_path TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
      "SELECT * FROM local_ingredients ORDER BY name"
    );
    return result;
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
       (id, name, base_unit, warehouse_qty, bar_qty, unit_cost, business_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ingredient.id,
        ingredient.name,
        ingredient.base_unit || "",
        ingredient.warehouse_qty,
        ingredient.bar_qty,
        ingredient.unit_cost,
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
         (id, name, base_unit, warehouse_qty, bar_qty, unit_cost, business_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.name,
          item.base_unit || "",
          item.warehouse_qty || 0,
          item.bar_qty || 0,
          item.unit_cost || 0,
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
      "SELECT SUM((warehouse_qty + bar_qty) * unit_cost) as total FROM local_ingredients"
    );
    return result?.total || 0;
  },

  /**
   * Get low stock items (less than 10 units)
   */
  getLowStock: async (): Promise<IngredientData[]> => {
    const database = await getDB();
    return await database.getAllAsync<IngredientData>(
      "SELECT * FROM local_ingredients WHERE (warehouse_qty + bar_qty) < 10"
    );
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
  markError: async (id: string, error: string): Promise<void> => {
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
