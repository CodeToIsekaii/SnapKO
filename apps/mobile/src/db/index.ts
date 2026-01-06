/**
 * Mobile Database Setup - Local SQLite
 */

import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null; // Mutex lock

// Schema version - INCREMENT THIS to force database reset
// v8: Fixed InventoryService to use shared getDB
// v9: Added archived column to local_ingredients for soft delete sync
// v10: Added type, item_type, tracking_mode, allowable_variance, unit_weight, unit_weight_unit
const SCHEMA_VERSION = 10;

/**
 * Initialize local SQLite database with all tables
 * Uses mutex lock to prevent concurrent initialization
 */
export async function initLocalDb(): Promise<SQLite.SQLiteDatabase> {
  // Return existing database if already initialized
  if (db) return db;

  // If initialization is in progress, wait for it
  if (initPromise) return initPromise;

  // Start initialization with lock
  initPromise = (async () => {
    db = await SQLite.openDatabaseAsync("snapko.db");

    // Check schema version and migrate if needed
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_info (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

    const versionRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM schema_info WHERE key = 'version'"
    );
    const currentVersion = versionRow ? parseInt(versionRow.value) : 0;

    if (currentVersion < SCHEMA_VERSION) {
      console.log(
        `[DB] Migrating from v${currentVersion} to v${SCHEMA_VERSION}...`
      );

      // Drop old tables to recreate with new schema
      await db.execAsync(`
      DROP TABLE IF EXISTS local_profiles;
      DROP TABLE IF EXISTS local_storage_areas;
      DROP TABLE IF EXISTS local_stock_levels;
      DROP TABLE IF EXISTS local_transfer_logs;
      DROP TABLE IF EXISTS local_inventory_logs;
      DROP TABLE IF EXISTS local_waste_logs;
      DROP TABLE IF EXISTS pending_sync_logs;
      DROP TABLE IF EXISTS local_ingredients;
      DROP TABLE IF EXISTS local_import_logs;
      DROP TABLE IF EXISTS local_sales_logs;
      DROP TABLE IF EXISTS local_metadata;
      DROP TABLE IF EXISTS local_recipes;
      DROP TABLE IF EXISTS local_recipe_ingredients;
      DROP TABLE IF EXISTS local_batch_recipes;
    `);

      // Update version
      await db.runAsync(
        "INSERT OR REPLACE INTO schema_info (key, value) VALUES ('version', ?)",
        [SCHEMA_VERSION.toString()]
      );

      console.log(`[DB] Migration complete!`);
    }

    // Dynamic migration: Add archived column if missing (for users who already have DB)
    try {
      await db.runAsync(
        "ALTER TABLE local_ingredients ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
      );
      console.log("[DB] Added archived column to local_ingredients");
    } catch {
      // Column already exists, ignore error
    }

    // Create all tables (will be no-op if they exist)
    await db.execAsync(`
    PRAGMA journal_mode = WAL;

    -- Profiles (minimal data) with inventory_model
    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      full_name TEXT,
      phone_number TEXT,
      inventory_model TEXT NOT NULL DEFAULT 'STANDARD',
      created_at TEXT NOT NULL
    );

    -- Storage Areas (Kho Tổng, Quầy Bar)
    CREATE TABLE IF NOT EXISTS local_storage_areas (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'STORAGE',
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Stock Levels (quantity per area)
    CREATE TABLE IF NOT EXISTS local_stock_levels (
      id TEXT PRIMARY KEY NOT NULL,
      ingredient_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      last_counted_at TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      UNIQUE(ingredient_id, area_id)
    );

    -- Transfer Logs (internal moves)
    CREATE TABLE IF NOT EXISTS local_transfer_logs (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      from_area_id TEXT NOT NULL,
      to_area_id TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      transfer_ticket_photo_url TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Inventory logs with area_id (offline first)
    -- Updated per .antigravityrules: Added is_flagged + flag_reason for anti-fraud
    CREATE TABLE IF NOT EXISTS local_inventory_logs (
      id TEXT PRIMARY KEY NOT NULL,
      area_id TEXT,
      is_partial_check INTEGER NOT NULL DEFAULT 0,
      ai_raw_json TEXT,
      confirmed_json TEXT,
      is_flagged INTEGER NOT NULL DEFAULT 0,  -- Anti-fraud: TRUE if suspicious
      flag_reason TEXT,                       -- 'SUSPICIOUS_PERFECT_MATCH', 'LAZY_COUNTING'
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Waste logs (NEW per updated .antigravityrules)
    -- Records items marked as Broken/Spilled during shortage check
    CREATE TABLE IF NOT EXISTS local_waste_logs (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT NOT NULL, -- 'BROKEN', 'EXPIRED', 'SPILLED', 'THEFT_CONFIRMED'
      notes TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Pending sync queue with area_id
    -- Drop old table to reset schema (temporary fix for NOT NULL constraint)
    DROP TABLE IF EXISTS pending_sync_logs;
    CREATE TABLE IF NOT EXISTS pending_sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      log_type TEXT NOT NULL DEFAULT 'inventory',
      ingredient_id TEXT,
      area_id TEXT,
      location TEXT DEFAULT 'mobile',
      type TEXT DEFAULT 'STOCK',
      ai_parsed_quantity REAL,
      ai_confidence_score REAL,
      final_confirmed_quantity REAL,
      quantity_change_base REAL,
      unit_cost_at_time REAL,
      source_photo_urls TEXT NOT NULL DEFAULT '[]',
      local_image_path TEXT,
      ai_parsed_json TEXT,
      staff_note TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0,
      diff_percentage REAL,
      variance_reason TEXT,
      evidence_photo_url TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT
    );

    -- Local ingredients cache (with batch item support + inventory config)
    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      name TEXT NOT NULL,
      base_unit TEXT,
      min_threshold REAL NOT NULL DEFAULT 0,
      average_unit_cost REAL NOT NULL DEFAULT 0,
      unit_cost REAL,
      density REAL,
      tare_weight REAL,
      aliases TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      warehouse_qty REAL NOT NULL DEFAULT 0,
      bar_qty REAL NOT NULL DEFAULT 0,
      is_batch_item INTEGER NOT NULL DEFAULT 0,
      batch_yield_qty REAL,
      batch_yield_unit TEXT,
      -- New columns for inventory config (synced from Desktop)
      type TEXT NOT NULL DEFAULT 'raw_material',
      item_type TEXT NOT NULL DEFAULT 'STOCK',
      tracking_mode TEXT NOT NULL DEFAULT 'STRICT',
      allowable_variance REAL NOT NULL DEFAULT 0,
      unit_weight REAL,
      unit_weight_unit TEXT,
      created_at TEXT NOT NULL
    );

    -- Recipes (menu items)
    CREATE TABLE IF NOT EXISTS local_recipes (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_recipe_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL,
      ingredient_id TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      FOREIGN KEY (recipe_id) REFERENCES local_recipes(id) ON DELETE CASCADE
    );

    -- Batch Recipes (semi-finished products / pre-made syrups)
    CREATE TABLE IF NOT EXISTS local_batch_recipes (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      output_ingredient_id TEXT NOT NULL,
      name TEXT NOT NULL,
      yield_qty REAL NOT NULL,
      yield_unit TEXT NOT NULL,
      instructions TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (output_ingredient_id) REFERENCES local_ingredients(id)
    );

    -- Import logs (Snap 1)
    CREATE TABLE IF NOT EXISTS local_import_logs (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      target_area_id TEXT,
      invoice_number TEXT,
      supplier_name TEXT,
      invoice_date TEXT,
      total_amount REAL,
      invoice_photo_url TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      ai_confidence REAL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Sales logs (Snap 2)
    CREATE TABLE IF NOT EXISTS local_sales_logs (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      report_date TEXT NOT NULL,
      shift TEXT,
      total_revenue REAL,
      report_photo_url TEXT,
      items_sold_json TEXT NOT NULL DEFAULT '[]',
      items_deducted_json TEXT NOT NULL DEFAULT '[]',
      ai_confidence REAL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    -- Metadata table for sync timestamps (Signal Pattern)
    CREATE TABLE IF NOT EXISTS local_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_ingredients_business ON local_ingredients(business_id);
    CREATE INDEX IF NOT EXISTS idx_stock_levels_ingredient ON local_stock_levels(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_stock_levels_area ON local_stock_levels(area_id);
    CREATE INDEX IF NOT EXISTS idx_storage_areas_business ON local_storage_areas(business_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_business ON local_recipes(business_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON local_recipe_ingredients(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_batch_recipes_output ON local_batch_recipes(output_ingredient_id);
  `);

    return db;
  })();

  return initPromise;
}

/**
 * Get database instance (async, ensures initialized)
 * Use this instead of openDatabaseAsync directly!
 * Includes mutex lock and retry logic to handle NullPointerException cases
 */
let isReinitializing = false;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  // Wait if another call is already re-initializing
  while (isReinitializing) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // If we have an existing db, verify it's still valid
  if (db) {
    try {
      // Quick health check - this will throw if db handle is invalid
      await db.getFirstAsync("SELECT 1");
      return db;
    } catch (err) {
      console.warn("[DB] Existing handle invalid, re-initializing...", err);
      // Reset state to force re-init
      db = null;
      initPromise = null;
    }
  }

  // Try to init with retries
  isReinitializing = true;
  let lastError: Error | null = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await initLocalDb();
      isReinitializing = false;
      return result;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[DB] Init attempt ${i + 1}/${MAX_RETRIES} failed:`, err);
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      // Force reset
      db = null;
      initPromise = null;
    }
  }

  isReinitializing = false;
  throw lastError || new Error("Failed to initialize database after retries");
}

/**
 * Get database instance (sync, may be null)
 * @deprecated Use getDB() instead
 */
export function getDb(): SQLite.SQLiteDatabase | null {
  return db;
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  if (db) {
    try {
      await db.closeAsync();
    } catch (e) {
      console.warn("DB Close error", e);
    }
    db = null;
    initPromise = null;
  }
}
