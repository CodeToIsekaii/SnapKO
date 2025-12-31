/**
 * SnapKO Desktop - Local Database Module
 * Uses better-sqlite3 for high-performance local-first data storage
 */

import Database from "better-sqlite3";
import { app, ipcMain } from "electron";
import { join } from "node:path";

let db: Database.Database | null = null;
let authClient: any = null;

// Set Supabase client for Cloud queries (staff profiles)
export function setDatabaseSupabaseClient(client: any) {
  authClient = client;
}

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

    CREATE TABLE IF NOT EXISTS daily_inventory_stats (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL UNIQUE,
      total_value_warehouse REAL NOT NULL DEFAULT 0,
      total_value_bar REAL NOT NULL DEFAULT 0,
      total_items INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_ingredients_business ON local_ingredients(business_id);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_inventory_stats(date);
  `);

  console.log("[Database] Initialized at:", dbPath);

  // Run daily snapshot on startup
  runDailySnapshot(db);

  return db;
}

/**
 * Daily Snapshot Function (per user feedback)
 * Runs on app startup to capture daily inventory value
 */
export function runDailySnapshot(database: Database.Database): void {
  try {
    const today = new Date().toISOString().slice(0, 10); // "2025-12-23"

    // Check if today's snapshot already exists
    const existing = database
      .prepare("SELECT date FROM daily_inventory_stats WHERE date = ?")
      .get(today);

    if (!existing) {
      console.log("[Snapshot] Running daily inventory snapshot...");

      // Calculate total values
      const stats = database
        .prepare(
          `
        SELECT 
          SUM(warehouse_qty * unit_cost) as wh_val,
          SUM(bar_qty * unit_cost) as bar_val,
          COUNT(*) as item_count
        FROM local_ingredients
      `
        )
        .get() as {
        wh_val: number | null;
        bar_val: number | null;
        item_count: number;
      };

      // Insert snapshot
      database
        .prepare(
          `
        INSERT INTO daily_inventory_stats (id, date, total_value_warehouse, total_value_bar, total_items)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(
          `snapshot_${today}`,
          today,
          stats.wh_val || 0,
          stats.bar_val || 0,
          stats.item_count || 0
        );

      console.log(
        `[Snapshot] Saved: Warehouse=${stats.wh_val}, Bar=${stats.bar_val}, Items=${stats.item_count}`
      );
    } else {
      console.log("[Snapshot] Today's snapshot already exists, skipping.");
    }
  } catch (err) {
    console.error("[Snapshot] Error:", err);
  }
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
        density?: number;
        tare_weight?: number;
        min_threshold?: number;
      }
    ) => {
      const database = getDatabase();
      const stmt = database.prepare(`
      INSERT OR REPLACE INTO local_ingredients 
      (id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, density, tare_weight, min_threshold, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
      stmt.run(
        ingredient.id,
        ingredient.business_id ?? null,
        ingredient.name,
        ingredient.base_unit ?? null,
        ingredient.warehouse_qty ?? 0,
        ingredient.bar_qty ?? 0,
        ingredient.unit_cost ?? 0,
        ingredient.density ?? 1,
        ingredient.tare_weight ?? 0,
        ingredient.min_threshold ?? 0
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

  // ==================== WEEK 2: COGS REPORT ====================
  ipcMain.handle("db:getCOGSReport", () => {
    const database = getDatabase();

    // Get summary data
    const summaryRow = database
      .prepare(
        `
        SELECT 
          COUNT(*) as itemCount,
          SUM((warehouse_qty + bar_qty) * unit_cost) as totalValue,
          SUM(CASE WHEN (warehouse_qty + bar_qty) < 10 THEN 1 ELSE 0 END) as lowStockCount
        FROM local_ingredients
      `
      )
      .get() as {
      itemCount: number;
      totalValue: number;
      lowStockCount: number;
    };

    // Get monthly data from daily_inventory_stats (real data, not mock!)
    const monthlyData = database
      .prepare(
        `
        SELECT 
          date,
          total_value_warehouse as warehouse,
          total_value_bar as bar
        FROM daily_inventory_stats
        ORDER BY date DESC
        LIMIT 6
      `
      )
      .all() as Array<{ date: string; warehouse: number; bar: number }>;

    // Format for chart (reverse to show oldest first)
    const months = monthlyData.reverse().map((row) => ({
      name: new Date(row.date).toLocaleDateString("vi-VN", { month: "short" }),
      warehouse: row.warehouse,
      bar: row.bar,
    }));

    // If no historical data yet, use current values
    if (months.length === 0) {
      const currentWarehouse = database
        .prepare(
          "SELECT SUM(warehouse_qty * unit_cost) as val FROM local_ingredients"
        )
        .get() as { val: number };
      const currentBar = database
        .prepare(
          "SELECT SUM(bar_qty * unit_cost) as val FROM local_ingredients"
        )
        .get() as { val: number };

      months.push({
        name: new Date().toLocaleDateString("vi-VN", { month: "short" }),
        warehouse: currentWarehouse?.val || 0,
        bar: currentBar?.val || 0,
      });
    }

    // Mock loss data (TODO: Calculate from inventory_logs)
    const losses = [
      { name: "Hao hụt", value: 500000, color: "#E07A2F" },
      { name: "Hỏng", value: 300000, color: "#E63946" },
      { name: "Mất", value: 100000, color: "#FFC857" },
    ];

    return {
      summary: {
        totalValue: summaryRow?.totalValue || 0,
        itemCount: summaryRow?.itemCount || 0,
        lowStockCount: summaryRow?.lowStockCount || 0,
      },
      monthly: months,
      losses,
    };
  });

  // ==================== WEEK 2: STAFF MANAGEMENT ====================
  // FIXED: Fetch from Supabase Cloud (staff profiles created via invite-join Edge Function)
  ipcMain.handle("db:getStaffProfiles", async () => {
    try {
      if (!authClient) {
        console.error("[Database] No Supabase client for staff profiles");
        return [];
      }

      // Get current user from auth
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser();
      if (authError || !user) {
        console.error("[Database] No authenticated user:", authError?.message);
        return [];
      }

      // Get current user's business_id
      const { data: currentProfile, error: profileError } = await authClient
        .from("profiles")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("[Database] Profile query error:", profileError);
        return [];
      }

      if (!currentProfile?.business_id) {
        console.error("[Database] No business_id found for current user");
        return [];
      }

      // Fetch all staff profiles for this business from Cloud
      const { data: staffProfiles, error } = await authClient
        .from("profiles")
        .select(
          "id, business_id, role, status, full_name, phone_number, created_at"
        )
        .eq("business_id", currentProfile.business_id)
        .neq("role", "OWNER") // Exclude owner, get STAFF only
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Database] Fetch staff profiles error:", error);
        return [];
      }

      console.log(
        "[Database] Fetched staff profiles from Cloud:",
        staffProfiles?.length
      );
      return staffProfiles || [];
    } catch (err: any) {
      console.error("[Database] getStaffProfiles error:", err);
      return [];
    }
  });

  console.log("[Database] IPC handlers registered");
}
