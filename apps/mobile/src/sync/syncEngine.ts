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

const SYNC_TASK_NAME = "SNAPKO_BACKGROUND_SYNC";

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
  listener: (status: SyncStatus) => void
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
  log: Omit<PendingSyncLog, "synced" | "sync_error">
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
    ]
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
    "SELECT COUNT(*) as count FROM pending_sync_logs WHERE synced = 0"
  );
  syncStatus.pendingCount = result?.count ?? 0;
  notifyStatusChange();
}

// Upload image to Supabase Storage and return URL
// Enhanced: Uses business_id folder structure for RLS compliance
export async function uploadImageToStorage(
  localUri: string,
  businessId?: string
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
          }
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
  db: SQLite.SQLiteDatabase
): Promise<{ synced: number; failed: number }> {
  if (syncStatus.isSyncing) {
    return { synced: 0, failed: 0 };
  }

  syncStatus.isSyncing = true;
  notifyStatusChange();

  try {
    // Get unsynced logs
    const rows = await db.getAllAsync<
      PendingSyncLog & { local_image_path: string | null }
    >(
      "SELECT * FROM pending_sync_logs WHERE synced = 0 ORDER BY created_at ASC LIMIT 50"
    );

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
            `[SyncEngine] Image upload failed for ${row.id}, will retry later`
          );
          await db.runAsync(
            "UPDATE pending_sync_logs SET sync_error = ? WHERE id = ?",
            ["Image upload failed", row.id]
          );
          continue;
        }

        // Mark image for cleanup after successful sync
        markImageForCleanup(row.id, row.local_image_path);
      }

      // Step 2: Prepare log data with uploaded image URL
      const existingPhotos = JSON.parse(
        (row.source_photo_urls as unknown as string) || "[]"
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

    // Step 3: Call sync-up API
    const response = await fetch(`${Env.SUPABASE_URL}/functions/v1/sync-up`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${Env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ logs: logsForSync }),
    });

    const result = await response.json();

    let syncedCount = 0;
    let failedCount = 0;

    if (result.results && Array.isArray(result.results)) {
      for (const r of result.results) {
        if (r.success) {
          await db.runAsync(
            "UPDATE pending_sync_logs SET synced = 1, sync_error = NULL, local_image_path = NULL WHERE id = ?",
            [r.id]
          );
          // Step 4: Cleanup local image after DB sync confirmed
          await cleanupLocalImage(r.id);
          syncedCount++;
        } else {
          await db.runAsync(
            "UPDATE pending_sync_logs SET sync_error = ? WHERE id = ?",
            [r.error || "Unknown error", r.id]
          );
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
          "SELECT business_id FROM local_profiles LIMIT 1"
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
      `[SyncEngine] Sync complete: ${syncedCount} synced, ${failedCount} failed`
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
    }
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
    const db = await SQLite.openDatabaseAsync("snapko.db");
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

// Cleanup
export function cleanupSyncEngine(): void {
  stopNetworkListener();
  stopAppStateListener();
}
