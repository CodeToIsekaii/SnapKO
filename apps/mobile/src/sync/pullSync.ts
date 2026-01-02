/**
 * Smart Pull Sync - Fetches changes from server with Clock Skew protection
 * Per Implementation Plan: 60s safety buffer to prevent missing data
 */

import { supabase } from "../lib/supabase";
import { getDB } from "../db";

const SAFETY_BUFFER_MS = 60000; // 60 seconds buffer for clock skew

/**
 * Pull latest stock levels with safety buffer
 */
export async function pullLatestStock(): Promise<{ synced: number }> {
  try {
    const db = await getDB();

    // Get last sync time from metadata
    const lastSyncRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM local_metadata WHERE key = 'last_stock_sync'"
    );
    const lastSyncTime = lastSyncRow?.value || "2000-01-01T00:00:00Z";

    // Apply safety buffer to prevent clock skew issues
    const safeSyncTime = new Date(
      new Date(lastSyncTime).getTime() - SAFETY_BUFFER_MS
    ).toISOString();

    console.log("[PullSync] Fetching stock changes since:", safeSyncTime);

    // Fetch updated stock levels (includes soft-deleted ones)
    const { data: stockLevels, error } = await supabase
      .from("stock_levels")
      .select("*")
      .gte("updated_at", safeSyncTime);

    if (error) {
      console.error("[PullSync] Stock fetch error:", error);
      throw error;
    }

    if (!stockLevels || stockLevels.length === 0) {
      console.log("[PullSync] No new stock changes");
      return { synced: 0 };
    }

    // Upsert to local SQLite (handles both updates and soft deletes)
    for (const stock of stockLevels) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_stock_levels 
        (id, ingredient_id, area_id, quantity, last_counted_at, synced, deleted_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [
          stock.id,
          stock.ingredient_id,
          stock.area_id,
          stock.quantity,
          stock.last_counted_at,
          stock.deleted_at,
        ]
      );
    }

    // Update last sync timestamp
    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_stock_sync', ?)",
      [new Date().toISOString()]
    );

    console.log(`[PullSync] Synced ${stockLevels.length} stock changes`);
    return { synced: stockLevels.length };
  } catch (err) {
    console.error("[PullSync] Error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest ingredients (master data) with safety buffer
 */
export async function pullLatestIngredients(): Promise<{ synced: number }> {
  try {
    const db = await getDB();

    const lastSyncRow = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM local_metadata WHERE key = 'last_ingredients_sync'"
    );
    const lastSyncTime = lastSyncRow?.value || "2000-01-01T00:00:00Z";

    // Apply safety buffer
    const safeSyncTime = new Date(
      new Date(lastSyncTime).getTime() - SAFETY_BUFFER_MS
    ).toISOString();

    console.log("[PullSync] Fetching ingredient changes since:", safeSyncTime);

    // Fetch all updated ingredients (including archived/deleted)
    const { data: ingredients, error } = await supabase
      .from("ingredients")
      .select("*")
      .gte("updated_at", safeSyncTime);

    if (error) {
      console.error("[PullSync] Ingredients fetch error:", error);
      throw error;
    }

    if (!ingredients || ingredients.length === 0) {
      console.log("[PullSync] No new ingredient changes");
      return { synced: 0 };
    }

    // Upsert to local SQLite
    for (const ing of ingredients) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_ingredients 
        (id, business_id, name, base_unit, min_threshold, average_unit_cost, archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ing.id,
          ing.business_id,
          ing.name,
          ing.base_unit,
          ing.min_threshold ?? 0,
          ing.average_unit_cost ?? 0,
          ing.archived ? 1 : 0,
          ing.created_at,
        ]
      );
    }

    // Update last sync timestamp
    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_ingredients_sync', ?)",
      [new Date().toISOString()]
    );

    console.log(`[PullSync] Synced ${ingredients.length} ingredient changes`);
    return { synced: ingredients.length };
  } catch (err) {
    console.error("[PullSync] Error:", err);
    return { synced: 0 };
  }
}

/**
 * Full pull - both stock and ingredients
 */
export async function pullAllData(): Promise<{
  stock: number;
  ingredients: number;
}> {
  const stockResult = await pullLatestStock();
  const ingredientsResult = await pullLatestIngredients();

  return {
    stock: stockResult.synced,
    ingredients: ingredientsResult.synced,
  };
}
