/**
 * SnapKO Desktop - Local Database Module
 * Uses better-sqlite3 for high-performance local-first data storage
 */

import Database from "better-sqlite3";
import { app, ipcMain } from "electron";
import { join } from "node:path";

let db: Database.Database | null = null;
let authClient: any = null;
let currentBusinessId: string | null = null;

// Set Supabase client for Cloud queries (staff profiles)
export function setDatabaseSupabaseClient(client: any) {
  authClient = client;
}

// Set Business ID and Backfill Logic
export function setDatabaseBusinessId(id: string) {
  currentBusinessId = id;
  console.log(`[Database] Business ID set to: ${id}`);

  if (!db) return;

  const database = db; // Local ref for TypeScript null-safety in closure

  try {
    const transaction = database.transaction(() => {
      // --- STEP 1: BACKFILL & FIX DATA ---
      // Fix Business ID for all tables
      database
        .prepare(
          "UPDATE local_ingredients SET business_id = ? WHERE business_id IS NULL"
        )
        .run(id);
      database
        .prepare(
          "UPDATE local_recipes SET business_id = ? WHERE business_id IS NULL"
        )
        .run(id);
      // db.prepare("UPDATE batch_recipes SET business_id = ? WHERE business_id IS NULL").run(id);

      // Fix Aliases (Use '[]' for empty/null)
      database
        .prepare(
          "UPDATE local_ingredients SET aliases = '[]' WHERE aliases IS NULL OR aliases = ''"
        )
        .run();

      // --- STEP 2: FLUSH QUEUE ---
      // Delete all PENDING/FAILED items to avoid conflicts
      database
        .prepare("DELETE FROM local_sync_queue WHERE status != 'DONE'")
        .run();

      // Flush Legacy/Bad Queue Items (Double check)
      database
        .prepare(
          "DELETE FROM local_sync_queue WHERE table_name = 'recipes' AND payload LIKE '%\"id\":\"recipe_%'"
        )
        .run();

      // --- STEP 3: RE-QUEUE V2 ---
      const migrationKey = "fix_requeue_v2_done";
      const checkMig = database
        .prepare("SELECT value FROM local_system_meta WHERE key = ?")
        .get(migrationKey);

      if (!checkMig) {
        console.log("[Database] Starting Re-queue V2...");
        const ingredients = database
          .prepare("SELECT * FROM local_ingredients WHERE business_id = ?")
          .all(id);

        const insertQueue = database.prepare(
          "INSERT INTO local_sync_queue (action, table_name, payload, status) VALUES (?, ?, ?, ?)"
        );

        for (const item of ingredients as any[]) {
          insertQueue.run(
            "UPSERT",
            "ingredients",
            JSON.stringify(item),
            "PENDING"
          );
        }

        // Mark done
        database
          .prepare(
            "INSERT OR REPLACE INTO local_system_meta (key, value) VALUES (?, ?)"
          )
          .run(migrationKey, "true");
      }
    });

    transaction();
  } catch (err) {
    console.error(`[Database] Error setting business ID: ${err}`);
  }
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
      density REAL NOT NULL DEFAULT 1,
      tare_weight REAL NOT NULL DEFAULT 0,
      min_threshold REAL NOT NULL DEFAULT 0,
      unit_weight REAL,
      unit_weight_unit TEXT,
      aliases TEXT,
      archived INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS local_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL, -- 'UPSERT', 'DELETE'
      table_name TEXT NOT NULL, -- 'ingredients', 'recipes', 'batch_recipes'
      payload TEXT NOT NULL, -- JSON String
      status TEXT DEFAULT 'PENDING', -- 'PENDING', 'FAILED', 'ERROR'
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_recipes (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_recipe_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL,
      ingredient_id TEXT,
      quantity REAL NOT NULL,
      unit TEXT,
      FOREIGN KEY (recipe_id) REFERENCES local_recipes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_ingredients_business ON local_ingredients(business_id);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_inventory_stats(date);
    CREATE INDEX IF NOT EXISTS idx_recipes_business ON local_recipes(business_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON local_recipe_ingredients(recipe_id);
  `);

  // Migration: Add missing columns if table already exists
  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN density REAL NOT NULL DEFAULT 1`
    );
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN tare_weight REAL NOT NULL DEFAULT 0`
    );
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN min_threshold REAL NOT NULL DEFAULT 0`
    );
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(`ALTER TABLE local_ingredients ADD COLUMN aliases TEXT`);
  } catch (e) {
    /* Column already exists */
  }

  // Migration: Add unit_weight columns for AI conversion
  try {
    db.exec(`ALTER TABLE local_ingredients ADD COLUMN unit_weight REAL`);
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(`ALTER TABLE local_ingredients ADD COLUMN unit_weight_unit TEXT`);
  } catch (e) {
    /* Column already exists */
  }

  // Migration: Add archived column for soft delete
  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN archived INTEGER DEFAULT 0`
    );
  } catch (e) {
    /* Column already exists */
  }

  // Migration: Add type column for ingredient categorization
  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN type TEXT NOT NULL DEFAULT 'raw_material'`
    );
  } catch (e) {
    /* Column already exists */
  }

  // Migration: Add inventory config columns
  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN item_type TEXT NOT NULL DEFAULT 'STOCK'`
    );
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'STRICT'`
    );
  } catch (e) {
    /* Column already exists */
  }

  try {
    db.exec(
      `ALTER TABLE local_ingredients ADD COLUMN allowable_variance REAL NOT NULL DEFAULT 0`
    );
  } catch (e) {
    /* Column already exists */
  }

  // Create System Meta table for migration flags
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_system_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  console.log("[Database] Initialized at:", dbPath);

  // Run daily snapshot on startup
  runDailySnapshot(db);

  // Run One-time Migration: Legacy Data -> Sync Queue
  runQueueMigration(db);

  // Recovery: Reset Dead Letters (ERROR) to PENDING on startup
  runResetDeadLetters(db);

  // LOG RETENTION: Auto-prune on startup
  try {
    const row = db
      .prepare(
        "SELECT value FROM local_system_meta WHERE key = 'log_retention_days'"
      )
      .get() as { value: string } | undefined;
    let days = row ? parseInt(row.value) : 0;

    if (!days) {
      // Check role
      const profile = db
        .prepare("SELECT role FROM local_profiles LIMIT 1")
        .get() as { role: string } | undefined;
      // Staff: 10 days default (lighter). Owner: 30 days.
      days = profile?.role === "STAFF" ? 10 : 30;
    }

    if (days > 0) {
      console.log(`[Database] Auto-pruning logs older than ${days} days...`);
      const info = db
        .prepare(
          `DELETE FROM pending_sync_logs 
         WHERE synced = 1 
         AND created_at < date('now', '-' || ? || ' days')`
        )
        .run(days.toString());
      console.log(`[Database] Pruned ${info.changes} logs.`);
    }
  } catch (e) {
    console.error(`[Database] Auto-prune failed: ${e}`);
  }

  return db;
}

/**
 * Sync Recovery: Retry failed items on startup
 */
function runResetDeadLetters(db: Database.Database) {
  try {
    const stmt = db.prepare(
      "UPDATE local_sync_queue SET status = 'PENDING', retry_count = 0 WHERE status = 'ERROR'"
    );
    const info = stmt.run();
    if (info.changes > 0) {
      console.log(`[Sync] Reset ${info.changes} dead-letter items to PENDING.`);
    }
  } catch (err) {
    console.error("[Sync] Failed to reset dead letters:", err);
  }
}

/**
 * One-time Migration: Push all existing local data to Sync Queue
 * This ensures data created before the "Queue Update" gets synced to Cloud/Mobile.
 */
function runQueueMigration(db: Database.Database) {
  try {
    const MIGRATION_KEY = "queue_migration_v1_done";

    // Check if migration already ran
    const row = db
      .prepare("SELECT value FROM local_system_meta WHERE key = ?")
      .get(MIGRATION_KEY) as { value: string };
    if (row) {
      return;
    }

    console.log(
      "[Migration] Running one-time migration: Local Data -> Sync Queue..."
    );

    // 1. Migrate Ingredients
    const ingredients = db
      .prepare("SELECT * FROM local_ingredients")
      .all() as any[];

    if (ingredients.length > 0) {
      const queueStmt = db.prepare(
        "INSERT INTO local_sync_queue (action, table_name, payload) VALUES (?, ?, ?)"
      );
      const metaStmt = db.prepare(
        "INSERT INTO local_system_meta (key, value) VALUES (?, ?)"
      );

      const transaction = db.transaction(() => {
        let count = 0;
        for (const ing of ingredients) {
          queueStmt.run("UPSERT", "ingredients", JSON.stringify(ing));
          count++;
        }
        metaStmt.run(MIGRATION_KEY, "true");
        console.log(`[Migration] Queued ${count} ingredients for sync.`);
      });

      transaction();
      console.log("[Migration] Migration V1 Success!");
    } else {
      // Nothing to migrate, mark as done
      db.prepare(
        "INSERT INTO local_system_meta (key, value) VALUES (?, ?)"
      ).run(MIGRATION_KEY, "true");
    }
  } catch (err) {
    console.error("[Migration] Legacy Data Migration Failed:", err);
  }
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

/**
 * Clear all local data on logout
 * This prevents stale data from appearing when a new user logs in
 */
export function clearLocalData(): void {
  const database = getDatabase();
  try {
    console.log("[Database] Clearing local data on logout...");

    const transaction = database.transaction(() => {
      // Clear all user data tables
      database.prepare("DELETE FROM local_ingredients").run();
      database.prepare("DELETE FROM local_recipes").run();
      database.prepare("DELETE FROM local_recipe_ingredients").run();
      database.prepare("DELETE FROM local_profiles").run();
      database.prepare("DELETE FROM local_inventory_logs").run();
      database.prepare("DELETE FROM pending_sync_logs").run();
      database.prepare("DELETE FROM local_sync_queue").run();
      database.prepare("DELETE FROM daily_inventory_stats").run();
      // Reset migration flags so new user gets fresh sync
      database.prepare("DELETE FROM local_system_meta").run();
    });

    transaction();

    // Also reset businessId in memory
    currentBusinessId = null;

    console.log("[Database] Local data cleared successfully");
  } catch (err) {
    console.error("[Database] Failed to clear local data:", err);
  }
}

// IPC handlers for renderer process
export function registerDatabaseIPC(): void {
  // Get all ingredients
  ipcMain.handle(
    "db:getIngredients",
    (_event, options?: { includeArchived?: boolean }) => {
      const database = getDatabase();
      // If showHidden is true, show ONLY archived items
      if (options?.includeArchived) {
        return database
          .prepare(
            "SELECT * FROM local_ingredients WHERE archived = 1 ORDER BY name"
          )
          .all();
      }
      // Default: Show only active items
      return database
        .prepare(
          "SELECT * FROM local_ingredients WHERE archived != 1 OR archived IS NULL ORDER BY name"
        )
        .all();
    }
  );

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
        unit_weight?: number;
        unit_weight_unit?: string;
        type?: "raw_material" | "supply" | "semi_product";
        item_type?: "STOCK" | "PHANTOM";
        tracking_mode?: "STRICT" | "LOOSE";
        allowable_variance?: number;
      }
    ) => {
      const database = getDatabase();

      // SAFETY GUARD
      if (!ingredient.business_id) {
        if (!currentBusinessId) {
          throw new Error(
            "CRITICAL: Cannot save data. Missing Business ID (Not logged in?)."
          );
        }
        ingredient.business_id = currentBusinessId;
      }

      const transaction = database.transaction(() => {
        // 1. Local Upsert (includes type and inventory config)
        const stmt = database.prepare(`
          INSERT OR REPLACE INTO local_ingredients 
          (id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, density, tare_weight, min_threshold, unit_weight, unit_weight_unit, type, item_type, tracking_mode, allowable_variance, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          ingredient.min_threshold ?? 0,
          ingredient.unit_weight ?? null,
          ingredient.unit_weight_unit ?? null,
          ingredient.type ?? "raw_material",
          ingredient.item_type ?? "STOCK",
          ingredient.tracking_mode ?? "STRICT",
          ingredient.allowable_variance ?? 0
        );

        // 2. Add to Sync Queue
        const queueStmt = database.prepare(`
          INSERT INTO local_sync_queue (action, table_name, payload)
          VALUES (?, ?, ?)
        `);

        // Payload needs to match Supabase schema exactly
        // Convert camelCase to snake_case if needed (Supabase usually handles raw update if columns match)
        // Check database.ts schema vs Supabase schema
        // local: warehouse_qty, bar_qty. Supabase: same.
        // It seems safer to pass the ingredient object directly as payload,
        // SyncWorker will handle transformation if needed.
        queueStmt.run("UPSERT", "ingredients", JSON.stringify(ingredient));
      });

      try {
        transaction();
        return { success: true };
      } catch (err: any) {
        console.error("Upsert ingredient failed:", err);
        return { success: false, error: err.message };
      }
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

  // Fix Missing Business ID (Legacy Data Migration Fix)
  ipcMain.handle("db:fix-missing-business-id", (_event, businessId) => {
    if (!businessId) return { success: false, error: "Missing business_id" };

    const db = getDatabase();
    try {
      console.log(`[Database] Fixing missing business_id: ${businessId}`);

      const transaction = db.transaction(() => {
        // 1. Update null business_id
        const info = db
          .prepare(
            "UPDATE local_ingredients SET business_id = ? WHERE business_id IS NULL"
          )
          .run(businessId);
        console.log(
          `[Database] Updated ${info.changes} ingredients with business_id.`
        );

        // 2. Clear Sync Queue (remove bad payloads)
        db.prepare("DELETE FROM local_sync_queue").run();
        console.log("[Database] Cleared sync queue.");

        // 3. Reset Migration Flag
        db.prepare(
          "DELETE FROM local_system_meta WHERE key = 'queue_migration_v1_done'"
        ).run();
      });

      transaction();

      // 4. Re-run Migration immediately
      runQueueMigration(db);

      return { success: true };
    } catch (err: any) {
      console.error("[Database] Fix failed:", err);
      return { success: false, error: err.message };
    }
  });

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

  // Get inventory logs (Cloud-first for Desktop Dashboard)
  ipcMain.handle("db:getInventoryLogs", async (_event, limit = 50) => {
    // 1. Try fetching from Cloud (Supabase) if authenticated
    if (authClient) {
      try {
        const { data, error } = await authClient
          .from("inventory_logs")
          .select(
            `
            id,
            type,
            staff_note,
            quantity_change_base,
            created_at,
            created_by,
            profiles:created_by ( full_name )
          `
          )
          .eq("business_id", currentBusinessId) // Ensure RLS
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) {
          console.error("[Database] Failed to fetch cloud logs:", error);
          return [];
        }

        // Format for UI
        return data.map((log: any) => ({
          id: log.id,
          created_at: log.created_at,
          action: log.type || "UNKNOWN",
          staff_name: log.profiles?.full_name || "Unknown Staff",
          details: log.staff_note || "Không có chi tiết",
          quantity_change: log.quantity_change_base,
        }));
      } catch (err) {
        console.error("[Database] Cloud log fetch exception:", err);
        return [];
      }
    }

    // 2. Fallback
    return [];
  });

  // Log Retention
  ipcMain.handle("db:getRetentionDays", () => {
    const database = getDatabase();
    try {
      const row = database
        .prepare(
          "SELECT value FROM local_system_meta WHERE key = 'log_retention_days'"
        )
        .get() as { value: string };
      return row ? parseInt(row.value) : 30;
    } catch (e) {
      return 30;
    }
  });

  ipcMain.handle("db:setRetentionDays", (_event, days: number) => {
    const database = getDatabase();
    database
      .prepare(
        "INSERT OR REPLACE INTO local_system_meta (key, value) VALUES ('log_retention_days', ?)"
      )
      .run(days.toString());
    return { success: true };
  });

  ipcMain.handle("db:pruneLogs", (_event, days: number) => {
    const database = getDatabase();
    if (days <= 0) return { success: true };

    try {
      console.log(`[Database] Pruning logs older than ${days} days...`);
      const info = database
        .prepare(
          `DELETE FROM pending_sync_logs 
         WHERE synced = 1 
         AND created_at < date('now', '-' || ? || ' days')`
        )
        .run(days.toString());
      console.log(`[Database] Pruned ${info.changes} old logs.`);
      return { success: true, count: info.changes };
    } catch (err: any) {
      console.error("[Database] Prune logs failed:", err);
      return { success: false, error: err.message };
    }
  });

  // ==================== WEEK 2: COGS REPORT ====================
  ipcMain.handle("db:getCOGSReport", () => {
    const database = getDatabase();

    // Get summary data (exclude archived, use min_threshold for low stock)
    const summaryRow = database
      .prepare(
        `
        SELECT 
          COUNT(*) as itemCount,
          SUM((warehouse_qty + bar_qty) * unit_cost) as totalValue,
          SUM(CASE WHEN (warehouse_qty + bar_qty) < min_threshold AND min_threshold > 0 THEN 1 ELSE 0 END) as lowStockCount
        FROM local_ingredients
        WHERE archived != 1 OR archived IS NULL
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

  // ==================== RECIPES MANAGEMENT ====================
  // Get all recipes with their ingredients
  ipcMain.handle(
    "db:getRecipes",
    (_event, options?: { includeArchived?: boolean }) => {
      const database = getDatabase();
      let recipes;
      // If showHidden is true, show ONLY archived/inactive items
      if (options?.includeArchived) {
        recipes = database
          .prepare(
            "SELECT * FROM local_recipes WHERE is_active = 0 ORDER BY name"
          )
          .all() as any[];
      } else {
        // Default: Show only active items
        recipes = database
          .prepare(
            "SELECT * FROM local_recipes WHERE is_active = 1 ORDER BY name"
          )
          .all() as any[];
      }

      // Load ingredients for each recipe
      const getIngredientsStmt = database.prepare(`
      SELECT ri.*, i.name as ingredient_name, i.base_unit, i.unit_cost
      FROM local_recipe_ingredients ri
      LEFT JOIN local_ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ?
    `);

      return recipes.map((recipe) => {
        const ingredients = getIngredientsStmt.all(recipe.id) as any[];
        return {
          ...recipe,
          ingredients: ingredients.map((ing) => ({
            ingredient_id: ing.ingredient_id,
            name: ing.ingredient_name || "Unknown",
            quantity: ing.quantity,
            unit: ing.unit || ing.base_unit || "g",
            cost: ing.quantity * (ing.unit_cost || 0),
          })),
        };
      });
    }
  );

  // Upsert recipe (insert or update)
  ipcMain.handle(
    "db:upsertRecipe",
    (
      _event,
      recipe: {
        id: string;
        business_id?: string;
        name: string;
        price: number;
        category?: string;
        ingredients: Array<{
          ingredient_id: string;
          quantity: number;
          unit?: string;
        }>;
      }
    ) => {
      const database = getDatabase();

      // SAFETY GUARD
      if (!recipe.business_id) {
        if (!currentBusinessId) {
          throw new Error(
            "CRITICAL: Cannot save data. Missing Business ID (Not logged in?)."
          );
        }
        recipe.business_id = currentBusinessId;
      }

      const transaction = database.transaction(() => {
        // Upsert recipe
        database
          .prepare(
            `
          INSERT OR REPLACE INTO local_recipes 
          (id, business_id, name, price, category, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, COALESCE((SELECT created_at FROM local_recipes WHERE id = ?), datetime('now')), datetime('now'))
        `
          )
          .run(
            recipe.id,
            recipe.business_id || null,
            recipe.name,
            recipe.price || 0,
            recipe.category || null,
            recipe.id
          );

        // SAFETY GUARD: Skip sync for legacy IDs (recipe_...)
        // Only queue standard UUIDs to prevent "invalid input syntax for type uuid" error
        const isValidUUID = (id: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id
          );

        if (!isValidUUID(recipe.id)) {
          console.warn(
            `[Database] Skipping sync queue for legacy recipe ID: ${recipe.id}`
          );
          return;
        }

        // Add to Sync Queue
        const queueStmt = database.prepare(`
          INSERT INTO local_sync_queue (action, table_name, payload)
          VALUES (?, ?, ?)
        `);

        // Payload needs to match Supabase schema
        const payload = {
          id: recipe.id,
          business_id: recipe.business_id,
          name: recipe.name,
          price: recipe.price,
          category: recipe.category,
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        queueStmt.run("UPSERT", "recipes", JSON.stringify(payload));

        // Delete existing ingredients for this recipe
        database
          .prepare("DELETE FROM local_recipe_ingredients WHERE recipe_id = ?")
          .run(recipe.id);

        // Insert new ingredients
        const insertIngStmt = database.prepare(`
          INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const ing of recipe.ingredients || []) {
          const ingId = crypto.randomUUID(); // Use proper UUID for Supabase
          insertIngStmt.run(
            ingId,
            recipe.id,
            ing.ingredient_id,
            ing.quantity,
            ing.unit || null
          );
        }
      });

      transaction();
      console.log("[Database] Recipe saved:", recipe.name);
      return { success: true };
    }
  );

  // Delete recipe (soft delete)
  ipcMain.handle("db:deleteRecipe", (_event, recipeId: string) => {
    const database = getDatabase();
    database
      .prepare("UPDATE local_recipes SET is_active = 0 WHERE id = ?")
      .run(recipeId);

    // Also queue for sync (Use UPSERT with is_active=false for soft delete)
    const queueStmt = database.prepare(
      "INSERT INTO local_sync_queue (action, table_name, payload) VALUES (?, ?, ?)"
    );
    queueStmt.run(
      "UPSERT",
      "recipes",
      JSON.stringify({
        id: recipeId,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
    );

    console.log("[Database] Recipe deleted:", recipeId);
    return { success: true };
  });

  // Delete ingredient (soft delete using archived flag)
  ipcMain.handle("db:deleteIngredient", (_event, ingredientId: string) => {
    const database = getDatabase();
    database
      .prepare("UPDATE local_ingredients SET archived = 1 WHERE id = ?")
      .run(ingredientId);

    // Also queue for sync (Use UPSERT with archived=true for soft delete consistency)
    const queueStmt = database.prepare(
      "INSERT INTO local_sync_queue (action, table_name, payload) VALUES (?, ?, ?)"
    );
    queueStmt.run(
      "UPSERT",
      "ingredients",
      JSON.stringify({
        id: ingredientId,
        archived: true,
        updated_at: new Date().toISOString(),
      })
    );

    console.log("[Database] Ingredient archived:", ingredientId);
    return { success: true };
  });

  // Restore ingredient
  ipcMain.handle("db:restoreIngredient", (_event, ingredientId: string) => {
    const database = getDatabase();
    database
      .prepare("UPDATE local_ingredients SET archived = 0 WHERE id = ?")
      .run(ingredientId);

    // Queue sync
    const queueStmt = database.prepare(
      "INSERT INTO local_sync_queue (action, table_name, payload) VALUES (?, ?, ?)"
    );
    queueStmt.run(
      "UPSERT",
      "ingredients",
      JSON.stringify({
        id: ingredientId,
        archived: false,
        updated_at: new Date().toISOString(),
      })
    );

    console.log("[Database] Ingredient restored:", ingredientId);
    return { success: true };
  });

  // Restore recipe
  ipcMain.handle("db:restoreRecipe", (_event, recipeId: string) => {
    const database = getDatabase();
    database
      .prepare("UPDATE local_recipes SET is_active = 1 WHERE id = ?")
      .run(recipeId);

    // Queue sync
    const queueStmt = database.prepare(
      "INSERT INTO local_sync_queue (action, table_name, payload) VALUES (?, ?, ?)"
    );
    queueStmt.run(
      "UPSERT",
      "recipes",
      JSON.stringify({
        id: recipeId,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
    );

    console.log("[Database] Recipe restored:", recipeId);
    return { success: true };
  });

  console.log("[Database] IPC handlers registered");
}
