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
import { api } from "../services/api";
import { fetchSyncPull, invalidatePullCache } from "./pullSync";
import { syncLegacyQtyLocal } from "../db/stockLevelHelper";
import {
  createSingleFlight,
  normalizeMasterDataPayload,
  type MasterDataTable,
} from "./masterDataQueue";
import {
  buildSyncPushLog,
  findDuplicatePendingSalesLogs,
  type PendingSyncLog,
  type PendingSyncLogRow,
  type SyncStatus,
} from "./syncUtils";

export {
  buildSyncPushLog,
  buildSalesPendingFingerprint,
  findDuplicatePendingSalesLogs,
  toApiBoolean,
} from "./syncUtils";
export type { PendingSyncLog, SyncStatus } from "./syncUtils";

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

const processSyncQueueImpl = async () => {
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

    let anySuccess = false;

    for (const item of pendingItems) {
      try {
        const rawPayload = JSON.parse(item.payload) as Record<string, unknown>;
        const payload = normalizeMasterDataPayload(
          item.table_name as MasterDataTable,
          rawPayload,
        );
        let error = null;

        if (item.action === "UPSERT") {
          const basePath =
            item.table_name === "recipes" ? "/recipes" : "/ingredients";
          try {
            if (payload.id) {
              // Recipes may intentionally PATCH a tiny payload like { id, aliases }.
              // Backend must preserve price/ingredients when those fields are omitted.
              await api.patch(`${basePath}/${payload.id}`, payload);
            } else {
              await api.post(basePath, payload);
            }
          } catch (err: any) {
            if (/403|permission/i.test(String(err?.message))) {
              console.warn(
                `[SyncEngine] ⚠️ Permission denied for item ${item.id}. Skipping.`,
              );
            } else {
              error = err;
            }
          }
        } else if (item.action === "DELETE") {
          const basePath =
            item.table_name === "recipes" ? "/recipes" : "/ingredients";
          try {
            await api.delete(`${basePath}/${payload.id}`);
          } catch (err: any) {
            if (/403|permission/i.test(String(err?.message))) {
              console.warn(
                `[SyncEngine] ⚠️ Permission denied for item ${item.id}. Skipping.`,
              );
            } else {
              error = err;
            }
          }
        }

        if (error) throw error;

        // Success -> Remove from queue
        await db.runAsync(`DELETE FROM local_sync_queue WHERE id = ?`, [
          item.id,
        ]);
        anySuccess = true;
      } catch (err) {
        console.error(`Sync failed item ${item.id}:`, err);
        // Keep PENDING to retry later
      }
    }

    // Server state changed -> next pull must be fresh (skip 5s cache)
    if (anySuccess) invalidatePullCache();
  } catch (err) {
    console.error("processSyncQueue Error:", err);
  }
};

export const processSyncQueue = createSingleFlight(processSyncQueueImpl);

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

    // Shared fetcher: in-flight dedup + 5s TTL cache across all /sync/pull consumers
    const pull = await fetchSyncPull(
      lastSyncTime !== "1970-01-01T00:00:00Z" ? lastSyncTime : undefined,
    );

    if (pull?.recipes?.length) {
      console.log(`[Sync] Pulled ${pull.recipes.length} updated recipes`);
      for (const r of pull.recipes) {
        const aliases = r.aliases ? JSON.stringify(r.aliases) : "[]";
        await db.runAsync(
          `INSERT OR REPLACE INTO local_recipes (id, business_id, name, aliases, price, category, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.businessId ?? r.business_id,
            r.name,
            aliases,
            r.price,
            r.category,
            (r.isActive ?? r.is_active) ? 1 : 0,
            r.createdAt ?? r.created_at,
            r.updatedAt ?? r.updated_at,
          ],
        );
      }
    }

    if (pull?.ingredients?.length) {
      console.log(
        `[Sync] Pulled ${pull.ingredients.length} updated ingredients`,
      );
      for (const i of pull.ingredients) {
        await db.runAsync(
          `INSERT INTO local_ingredients
            (id, business_id, name, base_unit, stock_check_unit, min_threshold, average_unit_cost,
             unit_cost, density, tare_weight, archived, shelf_life_days, warehouse_qty, bar_qty,
             unit_weight, unit_weight_unit, last_purchase_price, last_purchase_qty, last_purchase_unit,
             created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             business_id = excluded.business_id,
             name = excluded.name,
             base_unit = excluded.base_unit,
             stock_check_unit = excluded.stock_check_unit,
             min_threshold = COALESCE(excluded.min_threshold, min_threshold),
             average_unit_cost = excluded.average_unit_cost,
             unit_cost = excluded.unit_cost,
             density = COALESCE(excluded.density, density),
             tare_weight = COALESCE(excluded.tare_weight, tare_weight),
             archived = excluded.archived,
             shelf_life_days = excluded.shelf_life_days,
             warehouse_qty = excluded.warehouse_qty,
             bar_qty = excluded.bar_qty,
             unit_weight = COALESCE(excluded.unit_weight, unit_weight),
             unit_weight_unit = COALESCE(excluded.unit_weight_unit, unit_weight_unit),
             last_purchase_price = excluded.last_purchase_price,
             last_purchase_qty = excluded.last_purchase_qty,
             last_purchase_unit = excluded.last_purchase_unit,
             created_at = excluded.created_at`,
          [
            i.id,
            i.businessId ?? i.business_id,
            i.name,
            i.baseUnit ?? i.base_unit,
            i.stockCheckUnit ?? i.stock_check_unit ?? null,
            i.minThreshold ?? i.min_threshold ?? 0,
            i.averageUnitCost ?? i.average_unit_cost ?? 0,
            i.unitCost ?? i.unit_cost ?? 0,
            i.density ?? 1,
            i.tareWeight ?? i.tare_weight ?? 0,
            (i.archived ?? false) ? 1 : 0,
            i.shelfLifeDays ?? i.shelf_life_days ?? null,
            i.warehouseQty ?? i.warehouse_qty ?? 0,
            i.barQty ?? i.bar_qty ?? 0,
            i.unitWeight ?? i.unit_weight ?? null,
            i.unitWeightUnit ?? i.unit_weight_unit ?? null,
            i.lastPurchasePrice ?? i.last_purchase_price ?? null,
            i.lastPurchaseQty ?? i.last_purchase_qty ?? null,
            i.lastPurchaseUnit ?? i.last_purchase_unit ?? null,
            i.createdAt ?? i.created_at,
          ],
        );
      }
    }

    // Upsert storage areas and stock levels from server, then sync legacy cache
    if (pull?.storageAreas?.length) {
      const idsByBusiness = new Map<string, string[]>();
      for (const sa of pull.storageAreas) {
        const businessId = sa.businessId ?? sa.business_id;
        if (!businessId || !sa.id) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO local_storage_areas (id, business_id, name, type, is_default, is_active, synced)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [
            sa.id,
            businessId,
            sa.name,
            sa.type ?? "STORAGE",
            (sa.isDefault ?? sa.is_default) ? 1 : 0,
            (sa.isActive ?? sa.is_active ?? true) ? 1 : 0,
          ],
        );

        const existing = idsByBusiness.get(businessId) ?? [];
        existing.push(sa.id);
        idsByBusiness.set(businessId, existing);
      }

      for (const [businessId, ids] of idsByBusiness.entries()) {
        const placeholders = ids.map(() => "?").join(",");
        await db.runAsync(
          `UPDATE local_storage_areas
           SET is_active = 0, synced = 1
           WHERE business_id = ? AND id NOT IN (${placeholders})`,
          [businessId, ...ids],
        );
      }
    }

    if (pull?.stockLevels?.length) {
      const affectedIngredients = new Set<string>();
      for (const sl of pull.stockLevels) {
        const ingredientId = sl.ingredientId ?? sl.ingredient_id;
        const areaId = sl.areaId ?? sl.storageAreaId ?? sl.area_id;
        if (!ingredientId || !areaId) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO local_stock_levels (id, ingredient_id, area_id, quantity, last_counted_at, synced)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [sl.id, ingredientId, areaId, sl.quantity ?? 0, sl.lastCountedAt ?? sl.last_counted_at ?? null],
        );
        affectedIngredients.add(ingredientId);
      }
      for (const ingredientId of affectedIngredients) {
        await syncLegacyQtyLocal(db, ingredientId);
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
      stock_check_unit TEXT,
      unit_cost REAL NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      shelf_life_days INTEGER,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pending_synced ON pending_sync_logs(synced);
    CREATE INDEX IF NOT EXISTS idx_local_ingredients_archived ON local_ingredients(archived);
  `);
  try {
    await db.runAsync("ALTER TABLE local_ingredients ADD COLUMN stock_check_unit TEXT");
  } catch {
    // Column already exists.
  }
  try {
    await db.runAsync("ALTER TABLE pending_sync_logs ADD COLUMN area_id TEXT");
  } catch {
    // Column already exists.
  }
}

// Add a log to the pending queue
export async function addPendingLog(
  db: SQLite.SQLiteDatabase,
  log: Omit<PendingSyncLog, "synced" | "sync_error">,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO pending_sync_logs 
     (id, ingredient_id, area_id, location, type, ai_parsed_quantity, ai_confidence_score,
      final_confirmed_quantity, quantity_change_base, unit_cost_at_time,
      source_photo_urls, ai_parsed_json, staff_note, is_verified, diff_percentage,
      created_at, synced, sync_error, is_new_ingredient, new_ingredient_name, new_ingredient_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    [
      log.id,
      log.ingredient_id,
      log.area_id ?? null,
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

interface SyncPushResultItem {
  id: string;
  success: boolean;
  error?: string;
}

interface SyncPushResult {
  synced: number;
  total: number;
  results: SyncPushResultItem[];
}

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
    // Retry logs that old builds incorrectly marked as permanent failures
    // because SQLite returned boolean columns as 0/1 numbers.
    await db.runAsync(
      `UPDATE pending_sync_logs
       SET synced = 0, sync_error = NULL
       WHERE synced = 1
         AND sync_error LIKE 'PERMANENT_FAILURE: Invalid log payload: Invalid input: expected boolean%'`,
    );

    // Get unsynced logs
    const rows = await db.getAllAsync<PendingSyncLogRow>(
      "SELECT * FROM pending_sync_logs WHERE synced = 0 ORDER BY created_at ASC LIMIT 50",
    );

    console.log("[SyncEngine] Pending logs count:", rows.length);

    if (rows.length === 0) {
      syncStatus.isSyncing = false;
      notifyStatusChange();
      return { synced: 0, failed: 0 };
    }

    const duplicateSalesLogs = findDuplicatePendingSalesLogs(rows);
    const duplicateSalesIds = new Set(
      duplicateSalesLogs.map((duplicate) => duplicate.duplicateId),
    );
    let locallySkippedDuplicates = 0;

    for (const duplicate of duplicateSalesLogs) {
      await db.runAsync(
        "UPDATE pending_sync_logs SET synced = 1, sync_error = ? WHERE id = ?",
        [`SKIPPED_DUPLICATE_PENDING:${duplicate.canonicalId}`, duplicate.duplicateId],
      );
      locallySkippedDuplicates++;
    }

    const rowsToSync = rows.filter((row) => !duplicateSalesIds.has(row.id));

    // Process each log: upload image first, then prepare for sync
    const logsForSync: any[] = [];

    for (const row of rowsToSync) {
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

      logsForSync.push(buildSyncPushLog(row, sourcePhotos));
    }

    if (logsForSync.length === 0) {
      syncStatus.lastSyncAt =
        locallySkippedDuplicates > 0 ? new Date().toISOString() : syncStatus.lastSyncAt;
      await updatePendingCount(db);
      syncStatus.isSyncing = false;
      notifyStatusChange();
      return { synced: locallySkippedDuplicates, failed: rowsToSync.length };
    }

    const result = await api.post<SyncPushResult>("/sync/push", {
      logs: logsForSync,
    });
    console.log(
      "[SyncEngine] /sync/push result:",
      JSON.stringify(result).slice(0, 500),
    );

    let syncedCount = locallySkippedDuplicates;
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
              r.error.includes("is not present in table") ||
              r.error.includes("Invalid log payload") ||
              r.error.includes("already exists for another business"));

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
    } else {
      failedCount = logsForSync.length;
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
let lastAppStateSyncAt = 0;
const APP_STATE_SYNC_DEBOUNCE_MS = 30000;

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
        const now = Date.now();
        if (now - lastAppStateSyncAt < APP_STATE_SYNC_DEBOUNCE_MS) {
          return;
        }
        lastAppStateSyncAt = now;
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

    // TODO: BE-SnapKO /sync/push does not yet accept pendingLends payload.
    // Keeping Supabase direct-write as known gap until backend endpoint lands.
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
 * Pull pending lends from Supabase to local SQLite.
 * Single-flight locked: concurrent callers share the same in-flight promise to
 * avoid nested `withTransactionAsync` (SQLite allows only 1 transaction per
 * connection — nesting throws "cannot start a transaction within a transaction").
 */
let pullPendingLendsInFlight: Promise<{ pulled: number }> | null = null;

export async function pullPendingLends(
  businessId: string,
): Promise<{ pulled: number }> {
  if (pullPendingLendsInFlight) return pullPendingLendsInFlight;
  pullPendingLendsInFlight = pullPendingLendsImpl(businessId).finally(() => {
    pullPendingLendsInFlight = null;
  });
  return pullPendingLendsInFlight;
}

async function pullPendingLendsImpl(
  businessId: string,
): Promise<{ pulled: number }> {
  try {
    const { getDB } = await import("../db");
    const db = await getDB();

    // Fetch unreturned lends from shared /sync/pull cache
    let data: any[] | null = null;
    try {
      const pull = await fetchSyncPull();
      data = pull?.activePendingLends ?? [];
    } catch (err) {
      console.error("[SyncEngine] pullPendingLends query error:", err);
      return { pulled: 0 };
    }

    // NO withTransactionAsync here: pullSync.pullAllData() may hold a transaction on
    // the same db handle → nesting throws "cannot start a transaction within a
    // transaction". The outer single-flight lock (pullPendingLendsInFlight) prevents
    // concurrent calls to THIS function, and sequential `await`s below are race-safe
    // in JS. Atomicity trade-off is acceptable because INSERT OR REPLACE is idempotent.
    if (!data || data.length === 0) {
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
            lend.businessId ?? lend.business_id,
            lend.ingredientId ?? lend.ingredient_id,
            lend.ingredient?.name ??
              lend.ingredientName ??
              lend.ingredient_name ??
              "",
            Number(lend.quantity) || 0,
            lend.unit ?? "",
            lend.sourceLocation ?? lend.source_location ?? null,
            lend.lentAt ?? lend.lent_at ?? null,
            lend.returnedAt ?? lend.returned_at ?? null,
            (lend.returnedAt ?? lend.returned_at) ? 1 : 0,
            lend.returnLocation ?? lend.return_location ?? null,
            lend.relatedLogId ?? lend.related_log_id ?? null,
          ],
        );
        pulledCount++;
      } catch (itemError) {
        console.error("[SyncEngine] Pull item failed:", itemError);
      }
    }

    // Clean up local lends that are no longer in cloud (returned on another device).
    // Parameterized placeholders avoid SQL injection + let SQLite handle type binding.
    const cloudIds = data.map((l: any) => l.id);
    const placeholders = cloudIds.map(() => "?").join(",");
    await db.runAsync(
      `DELETE FROM local_pending_lends
       WHERE business_id = ? AND is_returned = 0 AND id NOT IN (${placeholders})`,
      [businessId, ...cloudIds],
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
