/**
 * Mobile Database Setup - Local SQLite
 */

import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize local SQLite database with all tables
 */
export async function initLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync("snapko.db");

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
    CREATE TABLE IF NOT EXISTS pending_sync_logs (
      id TEXT PRIMARY KEY NOT NULL,
      log_type TEXT NOT NULL DEFAULT 'inventory',
      ingredient_id TEXT,
      area_id TEXT,
      location TEXT NOT NULL,
      type TEXT NOT NULL,
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

    -- Local ingredients cache
    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      name TEXT NOT NULL,
      base_unit TEXT,
      min_threshold REAL NOT NULL DEFAULT 0,
      average_unit_cost REAL NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_ingredients_business ON local_ingredients(business_id);
    CREATE INDEX IF NOT EXISTS idx_stock_levels_ingredient ON local_stock_levels(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_stock_levels_area ON local_stock_levels(area_id);
    CREATE INDEX IF NOT EXISTS idx_storage_areas_business ON local_storage_areas(business_id);
  `);

  return db;
}

/**
 * Get database instance
 */
export function getDb(): SQLite.SQLiteDatabase | null {
  return db;
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
