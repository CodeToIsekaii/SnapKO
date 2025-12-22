/**
 * SnapKO Desktop - Local Database Module
 * Uses better-sqlite3 for high-performance local-first data storage
 */

import Database from "better-sqlite3";
import { app, ipcMain } from "electron";
import { join } from "node:path";

let db: Database.Database | null = null;

// Get database path in user data directory
function getDatabasePath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "snapko.db");
}

// Initialize database with schema matching mobile SQLite
export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDatabasePath();
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma("journal_mode = WAL");

  // Create tables matching mobile schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      full_name TEXT,
      phone_number TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_inventory_logs (
      id TEXT PRIMARY KEY NOT NULL,
      ai_raw_json TEXT,
      confirmed_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pending_sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      ingredient_id TEXT,
      location TEXT NOT NULL,
      type TEXT NOT NULL,
      ai_parsed_quantity REAL,
      ai_confidence_score REAL,
      final_confirmed_quantity REAL,
      quantity_change_base REAL,
      unit_cost_at_time REAL,
      source_photo_urls TEXT NOT NULL DEFAULT '[]',
      ai_parsed_json TEXT,
      staff_note TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0,
      diff_percentage REAL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT
    );

    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      name TEXT NOT NULL,
      base_unit TEXT,
      warehouse_qty REAL NOT NULL DEFAULT 0,
      bar_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_ingredients_business ON local_ingredients(business_id);
  `);

  console.log("[Database] Initialized at:", dbPath);
  return db;
}

// Get database instance
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Close database
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log("[Database] Closed");
  }
}

// IPC handlers for renderer process
export function registerDatabaseIPC(): void {
  // Get all ingredients
  ipcMain.handle("db:getIngredients", () => {
    const database = getDatabase();
    return database
      .prepare("SELECT * FROM local_ingredients ORDER BY name")
      .all();
  });

  // Add/update ingredient
  ipcMain.handle(
    "db:upsertIngredient",
    (
      _event,
      ingredient: {
        id: string;
        business_id?: string;
        name: string;
        base_unit?: string;
        warehouse_qty?: number;
        bar_qty?: number;
        unit_cost?: number;
      }
    ) => {
      const database = getDatabase();
      const stmt = database.prepare(`
      INSERT OR REPLACE INTO local_ingredients 
      (id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
      stmt.run(
        ingredient.id,
        ingredient.business_id ?? null,
        ingredient.name,
        ingredient.base_unit ?? null,
        ingredient.warehouse_qty ?? 0,
        ingredient.bar_qty ?? 0,
        ingredient.unit_cost ?? 0
      );
      return { success: true };
    }
  );

  // Get pending sync logs
  ipcMain.handle("db:getPendingLogs", () => {
    const database = getDatabase();
    return database
      .prepare("SELECT * FROM pending_sync_logs WHERE synced = 0")
      .all();
  });

  // Add pending log
  ipcMain.handle(
    "db:addPendingLog",
    (
      _event,
      log: {
        id: string;
        ingredient_id?: string;
        location: string;
        type: string;
        ai_parsed_quantity?: number;
        final_confirmed_quantity?: number;
        diff_percentage?: number;
        created_at: string;
      }
    ) => {
      const database = getDatabase();
      const stmt = database.prepare(`
      INSERT INTO pending_sync_logs 
      (id, ingredient_id, location, type, ai_parsed_quantity, final_confirmed_quantity, 
       diff_percentage, created_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
      stmt.run(
        log.id,
        log.ingredient_id ?? null,
        log.location,
        log.type,
        log.ai_parsed_quantity ?? null,
        log.final_confirmed_quantity ?? null,
        log.diff_percentage ?? null,
        log.created_at
      );
      return { success: true };
    }
  );

  // Mark logs as synced
  ipcMain.handle("db:markSynced", (_event, ids: string[]) => {
    const database = getDatabase();
    const stmt = database.prepare(
      "UPDATE pending_sync_logs SET synced = 1 WHERE id = ?"
    );
    const transaction = database.transaction(() => {
      for (const id of ids) {
        stmt.run(id);
      }
    });
    transaction();
    return { success: true, count: ids.length };
  });

  // Get inventory logs for report/print
  ipcMain.handle("db:getInventoryLogs", (_event, limit = 50) => {
    const database = getDatabase();
    return database
      .prepare(
        `
      SELECT * FROM local_inventory_logs 
      ORDER BY created_at DESC 
      LIMIT ?
    `
      )
      .all(limit);
  });

  console.log("[Database] IPC handlers registered");
}
