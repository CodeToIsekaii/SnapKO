import { getDatabase } from "./database";
import { getSyncClient } from "./sync";

/**
 * Sync Worker - Process Queue
 * Reads from local_sync_queue and pushes to Supabase
 * Running interval: 5-10s
 */
export async function processQueue() {
  const db = getDatabase();
  const supabase = getSyncClient();

  if (!supabase) {
    // Basic check, suppress log to avoid spamming if user not logged in
    return;
  }

  // 1. Fetch pending items (FIFO)
  // Lock mechanism is implicitly handled by single-threaded Node.js loop + sequential processing
  const queueItems = db
    .prepare(
      "SELECT * FROM local_sync_queue WHERE status = 'PENDING' ORDER BY id ASC LIMIT 50"
    )
    .all() as any[];

  if (queueItems.length === 0) return;

  console.log(`[SyncWorker] Processing ${queueItems.length} queue items...`);

  for (const item of queueItems) {
    try {
      const data = JSON.parse(item.payload);
      let error: any = null;

      // 2. Route by Table & Action
      if (item.table_name === "ingredients") {
        if (item.action === "UPSERT") {
          // FIX: Ensure business_id is present for RLS compliance
          // Soft delete/restore operations queue partial payloads without business_id or other required fields
          // Check if this is a partial payload (only has id, archived, updated_at)
          const isPartialPayload =
            Object.keys(data).length <= 3 && data.id && "archived" in data;

          if (isPartialPayload || !data.business_id || !data.name) {
            // Fetch full record from local DB
            const localItem = db
              .prepare("SELECT * FROM local_ingredients WHERE id = ?")
              .get(data.id) as any;

            if (localItem) {
              // Merge local record with update
              Object.assign(data, localItem, data); // data overrides localItem
            } else {
              console.warn(
                `[SyncWorker] Local ingredient not found: ${data.id}`
              );
            }
          }

          // FIX: Parse JSON fields from SQLite TEXT to proper types
          if (data.aliases && typeof data.aliases === "string") {
            try {
              data.aliases = JSON.parse(data.aliases);
            } catch {
              data.aliases = [];
            }
          }
          if (!data.aliases) {
            data.aliases = [];
          }

          const { error: upsertErr } = await supabase
            .from("ingredients")
            .upsert(data);
          error = upsertErr;
        } else if (item.action === "DELETE") {
          // Soft delete - update archived flag
          // FIX: Include business_id to satisfy RLS "WITH CHECK" policy
          const localItem = db
            .prepare("SELECT business_id FROM local_ingredients WHERE id = ?")
            .get(data.id) as any;

          const updatePayload: any = { archived: true };
          if (localItem && localItem.business_id) {
            updatePayload.business_id = localItem.business_id;
          }

          const { error: deleteErr } = await supabase
            .from("ingredients")
            .update(updatePayload)
            .eq("id", data.id);
          error = deleteErr;
        }
      } else if (item.table_name === "recipes") {
        // UUID Validation - Skip legacy IDs
        const isValidUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            data.id
          );
        if (!isValidUUID) {
          console.warn(`[SyncWorker] Skipping invalid recipe ID: ${data.id}`);
          // Delete from queue to prevent retry loop
          db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(item.id);
          continue;
        }

        if (item.action === "UPSERT") {
          // FIX: Ensure business_id and required fields are present
          const isPartialPayload =
            Object.keys(data).length <= 3 && data.id && "is_active" in data;

          if (isPartialPayload || !data.business_id || !data.name) {
            const localRecipe = db
              .prepare("SELECT * FROM local_recipes WHERE id = ?")
              .get(data.id) as any;

            if (localRecipe) {
              Object.assign(data, localRecipe, data);
            } else {
              console.warn(`[SyncWorker] Local recipe not found: ${data.id}`);
            }
          }

          const { error: recipeErr } = await supabase
            .from("recipes")
            .upsert(data);
          error = recipeErr;
        } else if (item.action === "DELETE") {
          // Soft delete - update is_active flag
          // FIX: Include business_id for RLS consistency
          const localRecipe = db
            .prepare("SELECT business_id FROM local_recipes WHERE id = ?")
            .get(data.id) as any;

          const updatePayload: any = { is_active: false };
          if (localRecipe && localRecipe.business_id) {
            updatePayload.business_id = localRecipe.business_id;
          }

          const { error: deleteErr } = await supabase
            .from("recipes")
            .update(updatePayload)
            .eq("id", data.id);
          error = deleteErr;
        }
      } else if (item.table_name === "batch_recipes") {
        // Future implementation
      }

      if (error) {
        throw new Error(error.message);
      }

      // 3. Success -> Delete from queue
      db.prepare("DELETE FROM local_sync_queue WHERE id = ?").run(item.id);
      console.log(`[SyncWorker] Item ${item.id} synced successfully.`);
    } catch (err: any) {
      console.error(`[SyncWorker] Failed item ${item.id}:`, err);

      // 4. Retry Logic
      const retryCount = (item.retry_count || 0) + 1;
      let newStatus = "PENDING";

      // Dead Letter Policy: > 5 retries -> ERROR
      if (retryCount > 5) {
        newStatus = "ERROR";
        console.error(
          `[SyncWorker] Item ${item.id} moved to DEAD LETTER. Payload:`,
          item.payload
        );
      }

      db.prepare(
        "UPDATE local_sync_queue SET retry_count = ?, status = ? WHERE id = ?"
      ).run(retryCount, newStatus, item.id);
    }
  }
}
