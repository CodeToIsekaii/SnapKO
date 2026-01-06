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
          // Sync full payload including unit_weight
          // Ensure Supabase Schema is updated!
          const { error: upsertErr } = await supabase
            .from("ingredients")
            .upsert(data);
          error = upsertErr;
        } else if (item.action === "DELETE") {
          // Soft delete - update archived flag
          const { error: deleteErr } = await supabase
            .from("ingredients")
            .update({ archived: true })
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
          const { error: recipeErr } = await supabase
            .from("recipes")
            .upsert(data);
          error = recipeErr;
        } else if (item.action === "DELETE") {
          // Soft delete - update is_active flag
          const { error: deleteErr } = await supabase
            .from("recipes")
            .update({ is_active: false })
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
