/**
 * SnapKO Sync Engine - 3-Layer Strategy
 * Layer 1: Instant sync on confirm (if online)
 * Layer 2: Network change listener (sync when back online)
 * Layer 3: AppState listener (sync when app comes to foreground)
 * Layer 4: Background task fallback (15 min intervals)
 */

import * as SQLite from "expo-sqlite";
import { File } from "expo-file-system";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import { Env } from "../env";

import { supabase } from "../lib/supabase";

const SYNC_TASK_NAME = "SNAPKO_BACKGROUND_SYNC";

// --- MASTER DATA SYNC (Mobile -> Cloud) ---
// See implementation_plan.md for architecture

export const addToSyncQueue = async (
  tableName: "recipes" | "ingredients",
  action: "UPSERT" | "DELETE",
  data: any,
) => {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    // A. Optimistic Update (Handled by Caller for React State)
    // NOTE: If caller hasn't updated SQLite, they should do it before calling this.

    // B. Push to Queue
    const payload = JSON.stringify(data);
    await db.runAsync(
      `INSERT INTO local_sync_queue (action, table_name, payload, status) VALUES (?, ?, ?, 'PENDING')`,
      [action, tableName, payload],
    );

    // C. Trigger Sync Immediately if Online
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      processSyncQueue();
    }
  } catch (error) {
    console.error("addToSyncQueue Error:", error);
  }
};

export const processSyncQueue = async () => {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    const pendingItems = await db.getAllAsync<{
      id: number;
      action: string;
      table_name: string;
      payload: string;
    }>(
      `SELECT * FROM local_sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC`,
    );

    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      try {
        const payload = JSON.parse(item.payload);
        let error = null;

        if (item.action === "UPSERT") {
          // SELF-HEAL: Fix malformed aliases (Legacy bug: stored as JSON string but Supabase expects Array)
          if (payload.aliases && typeof payload.aliases === "string") {
            try {
              const parsedAliases = JSON.parse(payload.aliases);
              if (Array.isArray(parsedAliases)) {
                payload.aliases = parsedAliases;
                console.log(
                  `[SyncEngine] 🩹 Self-healed aliases for item ${item.id}`,
                );
              }
            } catch (e) {
              console.warn(
                `[SyncEngine] Failed to heal aliases for item ${item.id}`,
                e,
              );
            }
          }

          const { error: err } = await supabase
            .from(item.table_name)
            .upsert(payload);
          error = err;
        } else if (item.action === "DELETE") {
          const { error: err } = await supabase
            .from(item.table_name)
            .delete()
            .eq("id", payload.id);
          error = err;
        }

        // Graceful handling for Permission Denied (Staff trying to create items)
        if (error && error.code === "42501") {
          console.warn(
            `[SyncEngine] ⚠️ Permission denied for item ${item.id} (Role restricted). Skipping.`,
          );
          error = null; // Clear error to allow removal from queue
        }

        if (error) throw error;

        // Success -> Remove from queue
        await db.runAsync(`DELETE FROM local_sync_queue WHERE id = ?`, [
          item.id,
        ]);
      } catch (err) {
        console.error(`Sync failed item ${item.id}:`, err);
        // Keep PENDING to retry later
      }
    }
  } catch (err) {
    console.error("processSyncQueue Error:", err);
  }
};

// --- DOWNSTREAM SYNC (Cloud -> Mobile) ---
export const fetchMasterDataUpdates = async () => {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    // Get last sync time
    const settings = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'last_sync_time'`,
    );
    const lastSyncTime = settings?.value || "1970-01-01T00:00:00Z";
    const now = new Date().toISOString();

    console.log(`[Sync] Fetching updates since ${lastSyncTime}...`);

    // 1. Pull Recipes
    const { data: recipes, error: rError } = await supabase
      .from("recipes")
      .select(
        "id, business_id, name, price, category, is_active, created_at, updated_at",
      )
      .gt("updated_at", lastSyncTime);

    if (recipes && recipes.length > 0) {
      console.log(`[Sync] Pulled ${recipes.length} updated recipes`);
      for (const r of recipes) {
        await db.runAsync(
          `INSERT OR REPLACE INTO local_recipes (id, business_id, name, price, category, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.business_id,
            r.name,
            r.price,
            r.category,
            r.is_active ? 1 : 0,
            r.created_at,
            r.updated_at,
          ],
        );
      }
    }

    // 2. Pull Ingredients
    const { data: ingredients, error: iError } = await supabase
      .from("ingredients")
      .select("*")
      .gt("updated_at", lastSyncTime);

    // NOTE: We only sync basic columns here.
    // Ideally we should sync all columns, but let's stick to core ones for safety.
    if (ingredients && ingredients.length > 0) {
      console.log(`[Sync] Pulled ${ingredients.length} updated ingredients`);
      for (const i of ingredients) {
        // Check if column exists or use default
        await db.runAsync(
          `INSERT OR REPLACE INTO local_ingredients (id, business_id, name, base_unit, min_threshold, average_unit_cost, unit_cost, density, tare_weight, archived, warehouse_qty, bar_qty, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            i.id,
            i.business_id,
            i.name,
            i.base_unit,
            i.min_threshold ?? 0,
            i.average_unit_cost ?? 0,
            i.unit_cost ?? 0,
            i.density ?? 1,
            i.tare_weight ?? 0,
            i.archived ? 1 : 0,
            i.warehouse_qty ?? 0,
            i.bar_qty ?? 0,
            i.created_at,
          ],
        );
      }
    }

    // 3. Update Timestamp
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_sync_time', ?)`,
      [now],
    );

    return true;
  } catch (error) {
    console.error("Fetch Updates Error:", error);
    return false;
  }
};

// Types
export interface PendingSyncLog {
  id: string;
  ingredient_id: string | null;
  location: "WAREHOUSE" | "BAR";
  type: "IMPORT" | "TRANSFER" | "AUDIT" | "WASTE" | "LENT";
  ai_parsed_quantity: number | null;
  ai_confidence_score: number | null;
  final_confirmed_quantity: number | null;
  quantity_change_base: number | null;
  unit_cost_at_time: number | null;
  source_photo_urls: string[];
  local_image_path: string | null; // Local image path (before upload)
  ai_parsed_json: string | null;
  staff_note: string | null;
  is_verified: boolean;
  diff_percentage: number | null;
  created_at: string;
  synced: boolean;
  sync_error: string | null;
  // New ingredient support
  is_new_ingredient: boolean;
  new_ingredient_name: string | null;
  new_ingredient_unit: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
}

// Global state
let syncStatus: SyncStatus = {
  isOnline: true,
  pendingCount: 0,
  lastSyncAt: null,
  isSyncing: false,
};

let statusListeners: Array<(status: SyncStatus) => void> = [];

// Notify all listeners of status change
function notifyStatusChange() {
  statusListeners.forEach((listener) => listener({ ...syncStatus }));
}

// Subscribe to sync status updates
export function subscribeSyncStatus(
  listener: (status: SyncStatus) => void,
): () => void {
  statusListeners.push(listener);
  listener({ ...syncStatus }); // Immediate callback
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

// Get current sync status
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

// Initialize enhanced SQLite schema for sync
export async function initSyncSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
      local_image_path TEXT,
      ai_parsed_json TEXT,
      staff_note TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0,
      diff_percentage REAL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT,
      is_new_ingredient INTEGER NOT NULL DEFAULT 0,
      new_ingredient_name TEXT,
      new_ingredient_unit TEXT
    );

    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      base_unit TEXT,
      unit_cost REAL NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_local_ingredients_archived ON local_ingredients(archived);
  `);
}

// Add a log to the pending queue
export async function addPendingLog(
  db: SQLite.SQLiteDatabase,
  log: Omit<PendingSyncLog, "synced" | "sync_error">,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO pending_sync_logs 
     (id, ingredient_id, location, type, ai_parsed_quantity, ai_confidence_score,
      final_confirmed_quantity, quantity_change_base, unit_cost_at_time,
      source_photo_urls, ai_parsed_json, staff_note, is_verified, diff_percentage,
      created_at, synced, sync_error, is_new_ingredient, new_ingredient_name, new_ingredient_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    [
      log.id,
      log.ingredient_id,
      log.location,
      log.type,
      log.ai_parsed_quantity,
      log.ai_confidence_score,
      log.final_confirmed_quantity,
      log.quantity_change_base,
      log.unit_cost_at_time,
      JSON.stringify(log.source_photo_urls),
      log.ai_parsed_json,
      log.staff_note,
      log.is_verified ? 1 : 0,
      log.diff_percentage,
      log.created_at,
      log.is_new_ingredient ? 1 : 0,
      log.new_ingredient_name,
      log.new_ingredient_unit,
    ],
  );

  // Update pending count
  await updatePendingCount(db);

  // Layer 1: Try instant sync
  if (syncStatus.isOnline) {
    syncPendingLogs(db);
  }
}

// Update pending count in status
async function updatePendingCount(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM pending_sync_logs WHERE synced = 0",
  );
  syncStatus.pendingCount = result?.count ?? 0;
  notifyStatusChange();
}

// Upload image to Supabase Storage and return URL
// Enhanced: Uses business_id folder structure for RLS compliance
export async function uploadImageToStorage(
  localUri: string,
  businessId?: string,
): Promise<string | null> {
  try {
    // Read image as base64 using new File API
    const file = new File(localUri);
    const base64 = await file.base64();

    // Generate path with business_id for RLS
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2);
    const folder = businessId ? `${businessId}/inventory` : "inventory";
    const fileName = `${folder}/${timestamp}_${randomSuffix}.jpg`;

    // Retry with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(
          `${Env.SUPABASE_URL}/storage/v1/object/receipts/${fileName}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Env.SUPABASE_ANON_KEY}`,
              apikey: Env.SUPABASE_ANON_KEY,
              "Content-Type": "image/jpeg",
              "x-upsert": "true",
            },
            body: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
          },
        );

        if (response.ok) {
          return `${Env.SUPABASE_URL}/storage/v1/object/public/receipts/${fileName}`;
        }

        const errorText = await response.text();
        lastError = new Error(`Upload failed: ${errorText}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    console.error("Upload failed after 3 attempts:", lastError);
    return null;
  } catch (err) {
    console.error("Image upload error:", err);
    return null;
  }
}

// Track local images pending cleanup (only after full sync success)
const pendingCleanupPaths: Map<string, string> = new Map(); // logId -> localPath

// Mark image for cleanup (call before sync)
export function markImageForCleanup(logId: string, localPath: string): void {
  pendingCleanupPaths.set(logId, localPath);
}

// Cleanup local image after successful sync (call after DB sync confirmed)
export async function cleanupLocalImage(logId: string): Promise<void> {
  const localPath = pendingCleanupPaths.get(logId);
  if (localPath) {
    try {
      const file = new File(localPath);
      if (file.exists) {
        file.delete();
        console.log(`[SyncEngine] Cleaned up local image: ${localPath}`);
      }
      pendingCleanupPaths.delete(logId);
    } catch (err) {
      console.warn(`[SyncEngine] Failed to cleanup image: ${err}`);
    }
  }
}

// Sync pending logs to server
// Enhanced: Upload local images first, then sync data
export async function syncPendingLogs(
  db: SQLite.SQLiteDatabase,
): Promise<{ synced: number; failed: number }> {
  if (syncStatus.isSyncing) {
    return { synced: 0, failed: 0 };
  }

  syncStatus.isSyncing = true;
  notifyStatusChange();

  try {
    // FIX: Migrate old logs with invalid location="mobile" to "BAR"
    await db.runAsync(
      `UPDATE pending_sync_logs SET location = 'BAR' WHERE location = 'mobile' AND synced = 0`,
    );
    // FIX: Migrate old logs with invalid type values
    await db.runAsync(
      `UPDATE pending_sync_logs SET type = 'LENT' WHERE type = 'LOAN' AND synced = 0`,
    );
    await db.runAsync(
      `UPDATE pending_sync_logs SET type = 'WASTE' WHERE type = 'MARKETING' AND synced = 0`,
    );

    // Get unsynced logs
    const rows = await db.getAllAsync<
      PendingSyncLog & { local_image_path: string | null }
    >(
      "SELECT * FROM pending_sync_logs WHERE synced = 0 ORDER BY created_at ASC LIMIT 50",
    );

    console.log("[SyncEngine] Pending logs count:", rows.length);

    if (rows.length === 0) {
      syncStatus.isSyncing = false;
      notifyStatusChange();
      return { synced: 0, failed: 0 };
    }

    // Process each log: upload image first, then prepare for sync
    const logsForSync: any[] = [];

    for (const row of rows) {
      let imageUrl: string | null = null;

      // Step 1: Upload local image if exists
      if (row.local_image_path) {
        console.log(`[SyncEngine] Uploading image for log ${row.id}...`);
        imageUrl = await uploadImageToStorage(row.local_image_path);

        if (!imageUrl) {
          // Image upload failed - skip this log, retry later
          console.warn(
            `[SyncEngine] Image upload failed for ${row.id}, will retry later`,
          );
          await db.runAsync(
            "UPDATE pending_sync_logs SET sync_error = ? WHERE id = ?",
            ["Image upload failed", row.id],
          );
          continue;
        }

        // Mark image for cleanup after successful sync
        markImageForCleanup(row.id, row.local_image_path);
      }

      // Step 2: Prepare log data with uploaded image URL
      const existingPhotos = JSON.parse(
        (row.source_photo_urls as unknown as string) || "[]",
      );
      const sourcePhotos = imageUrl
        ? [...existingPhotos, imageUrl]
        : existingPhotos;

      logsForSync.push({
        id: row.id,
        ingredient_id: row.ingredient_id,
        location: row.location,
        type: row.type,
        ai_parsed_quantity: row.ai_parsed_quantity,
        ai_confidence_score: row.ai_confidence_score,
        final_confirmed_quantity: row.final_confirmed_quantity,
        quantity_change_base: row.quantity_change_base,
        unit_cost_at_time: row.unit_cost_at_time,
        source_photos: sourcePhotos,
        ai_parsed_json: row.ai_parsed_json
          ? JSON.parse(row.ai_parsed_json)
          : null,
        staff_note: row.staff_note,
        is_verified: row.is_verified,
        diff_percentage: row.diff_percentage,
        created_at: row.created_at,
      });
    }

    if (logsForSync.length === 0) {
      syncStatus.isSyncing = false;
      notifyStatusChange();
      return { synced: 0, failed: rows.length };
    }

    // Step 3: Get user access token for authenticated sync
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      console.warn("[SyncEngine] No access token, cannot sync");
      syncStatus.isSyncing = false;
      notifyStatusChange();
      return { synced: 0, failed: rows.length };
    }

    // Step 4: Call sync-up API with user's access token
    const response = await fetch(`${Env.BACKEND_URL}/sync/up`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ logs: logsForSync }),
    });

    console.log("[SyncEngine] sync-up response status:", response.status);
    const result = await response.json();
    console.log(
      "[SyncEngine] sync-up result:",
      JSON.stringify(result).slice(0, 500),
    );

    let syncedCount = 0;
    let failedCount = 0;

    if (result.results && Array.isArray(result.results)) {
      for (const r of result.results) {
        if (r.success) {
          await db.runAsync(
            "UPDATE pending_sync_logs SET synced = 1, sync_error = NULL, local_image_path = NULL WHERE id = ?",
            [r.id],
          );
          // Step 4: Cleanup local image after DB sync confirmed
          await cleanupLocalImage(r.id);
          syncedCount++;
        } else {
          // Check for permanent failures (foreign key = ingredient deleted on server)
          const isPermanentFailure =
            r.error &&
            (r.error.includes("foreign key constraint") ||
              r.error.includes("violates foreign key") ||
              r.error.includes("is not present in table"));

          if (isPermanentFailure) {
            // Mark as synced with error note - stop retrying
            console.warn(
              `[SyncEngine] ⚠️ Marking log ${r.id} as permanently failed:`,
              r.error,
            );
            await db.runAsync(
              "UPDATE pending_sync_logs SET synced = 1, sync_error = ? WHERE id = ?",
              [`PERMANENT_FAILURE: ${r.error}`, r.id],
            );
          } else {
            // Temporary failure - will retry later
            await db.runAsync(
              "UPDATE pending_sync_logs SET sync_error = ? WHERE id = ?",
              [r.error || "Unknown error", r.id],
            );
          }
          failedCount++;
        }
      }
    }

    syncStatus.lastSyncAt = new Date().toISOString();
    await updatePendingCount(db);

    // 🔔 Ring the bell to notify other devices (Signal Pattern)
    if (syncedCount > 0) {
      try {
        const profile = await db.getFirstAsync<{ business_id: string }>(
          "SELECT business_id FROM local_profiles LIMIT 1",
        );
        if (profile?.business_id) {
          const { triggerStockUpdateSignal } = await import("./realtimeSync");
          await triggerStockUpdateSignal(profile.business_id);
        }
      } catch (signalErr) {
        console.warn("[SyncEngine] Failed to trigger signal:", signalErr);
      }
    }

    console.log(
      `[SyncEngine] Sync complete: ${syncedCount} synced, ${failedCount} failed`,
    );
    return { synced: syncedCount, failed: failedCount };
  } catch (err) {
    console.error("Sync error:", err);
    return { synced: 0, failed: 0 };
  } finally {
    syncStatus.isSyncing = false;
    notifyStatusChange();
  }
}

// Layer 2: Network change listener
let netInfoUnsubscribe: (() => void) | null = null;

export function startNetworkListener(db: SQLite.SQLiteDatabase): void {
  if (netInfoUnsubscribe) return;

  netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const wasOffline = !syncStatus.isOnline;
    syncStatus.isOnline = state.isConnected ?? false;
    notifyStatusChange();

    // If we just came online, sync immediately
    if (wasOffline && syncStatus.isOnline && syncStatus.pendingCount > 0) {
      console.log("[SyncEngine] Network restored, syncing...");
      syncPendingLogs(db);
    }
  });
}

export function stopNetworkListener(): void {
  netInfoUnsubscribe?.();
  netInfoUnsubscribe = null;
}

// Layer 3: AppState listener
let appStateSubscription: { remove: () => void } | null = null;

export function startAppStateListener(db: SQLite.SQLiteDatabase): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener(
    "change",
    (nextState: AppStateStatus) => {
      if (
        nextState === "active" &&
        syncStatus.isOnline &&
        syncStatus.pendingCount > 0
      ) {
        console.log("[SyncEngine] App foregrounded, syncing...");
        syncPendingLogs(db);
      }
    },
  );
}

export function stopAppStateListener(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

// Layer 4: Background task (fallback)
TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  console.log("[SyncEngine] Background task running...");

  try {
    // Use shared DB instance to prevent conflicts
    const { getDB } = await import("../db");
    const db = await getDB();
    await initSyncSchema(db);

    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const result = await syncPendingLogs(db);

    if (result.synced > 0) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error("[SyncEngine] Background task error:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (status === BackgroundFetch.BackgroundFetchStatus.Available) {
      await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log("[SyncEngine] Background sync registered");
    } else {
      console.log("[SyncEngine] Background fetch not available:", status);
    }
  } catch (err) {
    // This is expected in Expo Go - background fetch only works in dev clients
    console.log("[SyncEngine] Background sync not available (Expo Go mode)");
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
  } catch {
    // Task might not be registered
  }
}

// Initialize all sync layers
export async function initSyncEngine(db: SQLite.SQLiteDatabase): Promise<void> {
  await initSyncSchema(db);
  await updatePendingCount(db);

  // Start listeners
  startNetworkListener(db);
  startAppStateListener(db);

  // Register background task
  await registerBackgroundSync();

  // Initial sync if online
  const state = await NetInfo.fetch();
  syncStatus.isOnline = state.isConnected ?? false;

  if (syncStatus.isOnline && syncStatus.pendingCount > 0) {
    syncPendingLogs(db);
  }

  console.log("[SyncEngine] Initialized, pending:", syncStatus.pendingCount);
}

// ============================================
// PENDING LENDS PUSH SYNC (LEND/RETURN FEATURE)
// ============================================

export async function syncPendingLends(): Promise<{ synced: number }> {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    // Get unsynced lends
    const unsyncedLends = await db.getAllAsync<{
      id: string;
      business_id: string;
      ingredient_id: string;
      ingredient_name: string;
      quantity: number;
      unit: string;
      source_location: string;
      lent_at: string;
      returned_at: string | null;
      is_returned: number;
      return_location: string | null;
      related_log_id: string;
    }>("SELECT * FROM local_pending_lends WHERE synced = 0");

    if (unsyncedLends.length === 0) {
      return { synced: 0 };
    }

    console.log(
      `[SyncEngine] Pushing ${unsyncedLends.length} pending lends...`,
    );

    let syncedCount = 0;
    for (const lend of unsyncedLends) {
      try {
        const { error } = await supabase.from("pending_lends").upsert(
          {
            id: lend.id,
            business_id: lend.business_id,
            ingredient_id: lend.ingredient_id,
            ingredient_name: lend.ingredient_name,
            quantity: lend.quantity,
            unit: lend.unit,
            source_location: lend.source_location,
            lent_at: lend.lent_at,
            returned_at: lend.returned_at,
            is_returned: lend.is_returned === 1,
            return_location: lend.return_location,
            related_log_id: lend.related_log_id,
          },
          { onConflict: "id" },
        );

        if (error) {
          console.error("[SyncEngine] Pending lend sync error:", error);
        } else {
          // Mark as synced locally
          await db.runAsync(
            "UPDATE local_pending_lends SET synced = 1 WHERE id = ?",
            [lend.id],
          );
          syncedCount++;
        }
      } catch (itemError) {
        console.error("[SyncEngine] Item sync failed:", itemError);
      }
    }

    console.log(`[SyncEngine] Synced ${syncedCount} pending lends`);
    return { synced: syncedCount };
  } catch (err) {
    console.error("[SyncEngine] syncPendingLends error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull pending lends from Supabase to local SQLite
 * This enables cross-device visibility of lend reminders
 */
export async function pullPendingLends(
  businessId: string,
): Promise<{ pulled: number }> {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    // Fetch unreturned lends from Supabase
    const { data, error } = await supabase
      .from("pending_lends")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_returned", false);

    if (error) {
      console.error("[SyncEngine] pullPendingLends query error:", error);
      return { pulled: 0 };
    }

    if (!data || data.length === 0) {
      // Also clear local lends that might be stale (returned on another device)
      await db.runAsync(
        `DELETE FROM local_pending_lends WHERE business_id = ? AND is_returned = 0`,
        [businessId],
      );
      return { pulled: 0 };
    }

    console.log(`[SyncEngine] Pulling ${data.length} pending lends from cloud`);

    let pulledCount = 0;
    for (const lend of data) {
      try {
        await db.runAsync(
          `INSERT OR REPLACE INTO local_pending_lends 
           (id, business_id, ingredient_id, ingredient_name, quantity, unit, 
            source_location, lent_at, returned_at, is_returned, return_location, 
            related_log_id, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            lend.id,
            lend.business_id,
            lend.ingredient_id,
            lend.ingredient_name,
            lend.quantity,
            lend.unit,
            lend.source_location,
            lend.lent_at,
            lend.returned_at,
            lend.is_returned ? 1 : 0,
            lend.return_location,
            lend.related_log_id,
          ],
        );
        pulledCount++;
      } catch (itemError) {
        console.error("[SyncEngine] Pull item failed:", itemError);
      }
    }

    // Clean up local lends that are no longer in cloud (returned on another device)
    const cloudIds = data.map((l: any) => `'${l.id}'`).join(",");
    await db.runAsync(
      `DELETE FROM local_pending_lends 
       WHERE business_id = ? AND is_returned = 0 AND id NOT IN (${cloudIds})`,
      [businessId],
    );

    console.log(`[SyncEngine] Pulled ${pulledCount} pending lends`);
    return { pulled: pulledCount };
  } catch (err) {
    console.error("[SyncEngine] pullPendingLends error:", err);
    return { pulled: 0 };
  }
}

// Cleanup
export function cleanupSyncEngine(): void {
  stopNetworkListener();
  stopAppStateListener();
}
