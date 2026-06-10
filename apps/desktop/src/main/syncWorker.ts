/**
 * SnapKO Desktop - Sync Worker
 *
 * Processes local_sync_queue (offline-first queue) and pushes changes
 * to BE-SnapKO. Replaces legacy direct-to-Supabase pushes.
 */

import { getDatabase } from "./database";
import { apiFetch, getStoredRefreshToken } from "./apiClient";

// UUID helper
const isValidUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const isLegacyArchivePayload = (data: any) =>
  typeof data?.archived === "boolean" &&
  Object.keys(data).every((key) => ["id", "archived", "updated_at"].includes(key));

const isApiNotFound = (err: any) =>
  err?.status === 404 || err?.message?.includes("404");

// Convert snake_case ingredient payload → camelCase DTO for backend
function ingredientToApiPayload(data: any): {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  const aliases = Array.isArray(data.aliases)
    ? data.aliases
    : typeof data.aliases === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(data.aliases);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const base = {
    name: data.name,
    aliases,
    baseUnit: data.base_unit ?? undefined,
    stockCheckUnit:
      data.stock_check_unit === null ? null : data.stock_check_unit ?? undefined,
    unitCost: data.unit_cost ?? undefined,
    minThreshold: data.min_threshold ?? undefined,
    type: data.type ?? undefined,
    itemType: data.item_type ?? undefined,
    trackingMode: data.tracking_mode ?? undefined,
    allowableVariance: data.allowable_variance ?? undefined,
    unitWeight: data.unit_weight ?? undefined,
    unitWeightUnit:
      data.unit_weight_unit === null ? null : data.unit_weight_unit ?? undefined,
    density: data.density ?? undefined,
    shelfLifeDays:
      data.shelf_life_days === null
        ? null
        : data.shelf_life_days === undefined
          ? undefined
          : Number(data.shelf_life_days),
    lastPurchasePrice: data.last_purchase_price ?? undefined,
    lastPurchaseQty: data.last_purchase_qty ?? undefined,
    lastPurchaseUnit: data.last_purchase_unit ?? undefined,
  };

  // Strip undefined (Zod prefers absent keys over undefined)
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) stripped[k] = v;
  }

  // Include client-generated id in POST payload so backend uses the same UUID
  const createPayload = isValidUUID(data.id) ? { id: data.id, ...stripped } : stripped;

  return { create: createPayload, update: stripped };
}

function recipeToApiPayload(data: any, ingredients: any[]) {
  const ings = ingredients
    .filter((ri) => ri.recipe_id === data.id)
    .map((ri) => ({
      ingredientId: ri.ingredient_id,
      quantity: ri.quantity,
      unit: ri.unit ?? undefined,
    }));

  const payload: Record<string, unknown> = {
    name: data.name,
    price: data.price ?? 0,
    category: data.category ?? undefined,
    batchYield: data.batch_yield ?? undefined,
    isActive: data.is_active === undefined ? true : !!data.is_active,
    ingredients: ings,
  };

  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) stripped[k] = v;
  }
  return stripped;
}

// Module-level lock — prevent concurrent processQueue() (network listener +
// periodic timer + manual triggers all call this). Retry loops were 422-spamming
// the backend because nothing dedupes overlapping runs.
let processingInFlight = false;

export async function processQueue() {
  if (processingInFlight) return;
  if (!getStoredRefreshToken()) {
    // User not logged in — nothing to push yet
    return;
  }

  const db = getDatabase();

  // Exponential backoff on retries: skip items whose next-retry-time hasn't arrived.
  // last_attempt_at is stored in seconds since epoch in the existing queue row.
  const nowSec = Math.floor(Date.now() / 1000);
  const queueItems = db
    .prepare(
      `SELECT * FROM local_sync_queue
       WHERE status = 'PENDING'
         AND (last_attempt_at IS NULL
              OR last_attempt_at + (30 * retry_count * retry_count) < ?)
       ORDER BY id ASC LIMIT 50`
    )
    .all(nowSec) as any[];

  if (queueItems.length === 0) return;

  processingInFlight = true;
  console.log(`[SyncWorker] Processing ${queueItems.length} queue items...`);

  try {
  for (const item of queueItems) {
    try {
      const data = JSON.parse(item.payload);

      // Route by table + action
      if (item.table_name === "ingredients") {
        if (item.action === "UPSERT") {
          // Old desktop builds queued { id, archived } as UPSERT. Treat those
          // queue rows as explicit archive/restore actions.
          if (isLegacyArchivePayload(data)) {
            if (!isValidUUID(data.id)) {
              console.warn(`[SyncWorker] Skipping archive state for non-UUID ingredient: ${data.id}`);
            } else if (data.archived) {
              await apiFetch(`/ingredients/${data.id}`, { method: "DELETE" });
            } else {
              await apiFetch(`/ingredients/${data.id}/restore`, { method: "POST" });
            }
            db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(item.id);
            continue;
          }

          // Partial payloads (soft delete / restore) don't carry full fields.
          // Always merge from local DB so we have the canonical record.
          const localItem = db
            .prepare("SELECT * FROM local_ingredients WHERE id = ?")
            .get(data.id) as any;

          const merged = localItem ? { ...localItem, ...data } : data;

          if (!merged.name) {
            console.warn(
              `[SyncWorker] Skipping ingredient with no name: ${data.id}`
            );
            db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(
              item.id
            );
            continue;
          }

          const { create, update } = ingredientToApiPayload(merged);

          if (isValidUUID(merged.id)) {
            // Try PATCH first; if 404, POST as new
            try {
              await apiFetch(`/ingredients/${merged.id}`, {
                method: "PATCH",
                body: JSON.stringify(update),
              });
            } catch (err: any) {
              if (isApiNotFound(err)) {
                await apiFetch("/ingredients", {
                  method: "POST",
                  body: JSON.stringify(create),
                });
              } else {
                throw err;
              }
            }
          } else {
            // Non-UUID local ID → create new on server
            await apiFetch("/ingredients", {
              method: "POST",
              body: JSON.stringify(create),
            });
          }
        } else if (item.action === "DELETE") {
          if (isValidUUID(data.id)) {
            await apiFetch(`/ingredients/${data.id}`, {
              method: "DELETE",
            });
          } else {
            console.warn(
              `[SyncWorker] Skipping DELETE of non-UUID ingredient: ${data.id}`
            );
          }
        } else if (item.action === "RESTORE") {
          if (isValidUUID(data.id)) {
            await apiFetch(`/ingredients/${data.id}/restore`, {
              method: "POST",
            });
          } else {
            console.warn(
              `[SyncWorker] Skipping RESTORE of non-UUID ingredient: ${data.id}`
            );
          }
        }
      } else if (item.table_name === "recipes") {
        if (!isValidUUID(data.id)) {
          console.warn(`[SyncWorker] Skipping invalid recipe ID: ${data.id}`);
          db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(item.id);
          continue;
        }

        if (item.action === "UPSERT") {
          const localRecipe = db
            .prepare("SELECT * FROM local_recipes WHERE id = ?")
            .get(data.id) as any;

          const merged = localRecipe ? { ...localRecipe, ...data } : data;

          if (!merged.name) {
            console.warn(
              `[SyncWorker] Skipping recipe with no name: ${data.id}`
            );
            db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(
              item.id
            );
            continue;
          }

          const localIngredients = db
            .prepare("SELECT * FROM local_recipe_ingredients WHERE recipe_id = ?")
            .all(data.id) as any[];

          const payload = recipeToApiPayload(merged, localIngredients);
          const isSynced = !!localRecipe?.is_synced;

          if (!isSynced) {
            // First-time sync — POST with client UUID so server adopts it
            const createPayload = isValidUUID(merged.id)
              ? { id: merged.id, ...payload }
              : payload;
            await apiFetch("/recipes", {
              method: "POST",
              body: JSON.stringify(createPayload),
            });
            db.prepare("UPDATE local_recipes SET is_synced = 1 WHERE id = ?").run(merged.id);
          } else {
            // Already on server — PATCH; if 404 (deleted server-side), recreate via POST
            try {
              await apiFetch(`/recipes/${merged.id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
              });
            } catch (err: any) {
              if (isApiNotFound(err)) {
                const createPayload = isValidUUID(merged.id)
                  ? { id: merged.id, ...payload }
                  : payload;
                await apiFetch("/recipes", {
                  method: "POST",
                  body: JSON.stringify(createPayload),
                });
              } else {
                throw err;
              }
            }
          }
        } else if (item.action === "DELETE") {
          // Soft delete by setting isActive=false
          await apiFetch(`/recipes/${data.id}`, {
            method: "PATCH",
            body: JSON.stringify({ isActive: false }),
          });
        }
      } else if (item.table_name === "batch_recipes") {
        // Future implementation
      }

      db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(item.id);
      console.log(`[SyncWorker] Item ${item.id} synced successfully.`);
    } catch (err: any) {
      console.error(`[SyncWorker] Failed item ${item.id}:`, err);

      const retryCount = (item.retry_count || 0) + 1;
      let newStatus = "PENDING";

      if (retryCount > 5) {
        newStatus = "ERROR";
        console.error(
          `[SyncWorker] Item ${item.id} moved to DEAD LETTER. Payload:`,
          item.payload
        );
      }

      db.prepare(
        "UPDATE local_sync_queue SET retry_count = ?, status = ?, last_attempt_at = ? WHERE id = ?"
      ).run(retryCount, newStatus, Math.floor(Date.now() / 1000), item.id);
    }
  }
  } finally {
    processingInFlight = false;
  }
}
