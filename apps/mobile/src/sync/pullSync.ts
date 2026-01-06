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

    // DEFENSIVE: Ensure db is not null before any operations
    if (!db) {
      console.error("[PullSync] Database not ready yet, skipping stock sync");
      throw new Error("Database not initialized");
    }

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

    // DEFENSIVE: Ensure db is not null before any operations
    if (!db) {
      console.error(
        "[PullSync] Database not ready yet, skipping ingredient sync"
      );
      throw new Error("Database not initialized");
    }

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
    // FORCE FULL SYNC: Removed .gte('created_at', safeSyncTime) to ensure backfilled data is fetched
    const { data: ingredients, error } = await supabase
      .from("ingredients")
      .select("*");

    if (error) {
      console.error("[PullSync] Ingredients fetch error:", error);
      throw error;
    }

    if (!ingredients || ingredients.length === 0) {
      console.log("[PullSync] No new ingredient changes");
      return { synced: 0 };
    }

    // Upsert to local SQLite (with new batch item columns + inventory config)
    // FIX: Use ON CONFLICT to preserve local-only fields when server doesn't return them
    for (const ing of ingredients) {
      const aliases = ing.aliases ? JSON.stringify(ing.aliases) : "[]";

      await db.runAsync(
        `INSERT INTO local_ingredients 
        (id, business_id, name, base_unit, min_threshold, average_unit_cost, unit_cost,
         density, tare_weight, aliases, archived, warehouse_qty, bar_qty, 
         is_batch_item, batch_yield_qty, batch_yield_unit,
         type, item_type, tracking_mode, allowable_variance, unit_weight, unit_weight_unit,
         created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          name = excluded.name,
          base_unit = excluded.base_unit,
          unit_cost = excluded.unit_cost,
          warehouse_qty = excluded.warehouse_qty,
          bar_qty = excluded.bar_qty,
          created_at = excluded.created_at,
          -- Server-managed fields that should sync:
          min_threshold = COALESCE(excluded.min_threshold, min_threshold),
          archived = COALESCE(excluded.archived, archived),
          density = COALESCE(excluded.density, density),
          tare_weight = COALESCE(excluded.tare_weight, tare_weight),
          aliases = excluded.aliases,
          average_unit_cost = excluded.average_unit_cost,
          is_batch_item = excluded.is_batch_item,
          batch_yield_qty = excluded.batch_yield_qty,
          batch_yield_unit = excluded.batch_yield_unit,
          -- Inventory config fields:
          type = COALESCE(excluded.type, type),
          item_type = COALESCE(excluded.item_type, item_type),
          tracking_mode = COALESCE(excluded.tracking_mode, tracking_mode),
          allowable_variance = COALESCE(excluded.allowable_variance, allowable_variance),
          unit_weight = COALESCE(excluded.unit_weight, unit_weight),
          unit_weight_unit = COALESCE(excluded.unit_weight_unit, unit_weight_unit)
        `,
        [
          ing.id,
          ing.business_id ?? null,
          ing.name,
          ing.base_unit ?? null,
          ing.min_threshold ?? 0,
          ing.average_unit_cost ?? 0,
          ing.unit_cost ?? 0,
          ing.density ?? null,
          ing.tare_weight ?? null,
          aliases, // Bound as string "[]" or '["foo"]'
          ing.archived ? 1 : 0,
          ing.warehouse_qty ?? 0,
          ing.bar_qty ?? 0,
          ing.is_batch_item ? 1 : 0,
          ing.batch_yield_qty ?? null,
          ing.batch_yield_unit ?? null,
          // New inventory config fields:
          ing.type ?? "raw_material",
          ing.item_type ?? "STOCK",
          ing.tracking_mode ?? "STRICT",
          ing.allowable_variance ?? 0,
          ing.unit_weight ?? null,
          ing.unit_weight_unit ?? null,
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
    console.error("[PullSync] Ingredients error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest recipes from Supabase
 */
export async function pullLatestRecipes(): Promise<{ synced: number }> {
  try {
    const db = await getDB();

    // Fetch all active recipes
    const { data: recipes, error } = await supabase
      .from("recipes")
      .select(
        "id, business_id, name, price, category, is_active, created_at, updated_at"
      );

    if (error) {
      console.error("[PullSync] Recipes fetch error:", error);
      throw error;
    }

    if (!recipes || recipes.length === 0) {
      console.log("[PullSync] No recipes to sync");
      return { synced: 0 };
    }

    // Fetch recipe ingredients
    const { data: recipeIngredients, error: riError } = await supabase
      .from("recipe_ingredients")
      .select("id, recipe_id, ingredient_id, quantity, unit");

    if (riError) throw riError;

    // Upsert recipes and ingredients
    // DEBUG: Log raw recipe data from server
    console.log(
      "[PullSync] Recipes from server:",
      recipes.map((r) => ({ id: r.id, name: r.name, is_active: r.is_active }))
    );

    for (const recipe of recipes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_recipes 
        (id, business_id, name, price, category, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipe.id,
          recipe.business_id,
          recipe.name,
          recipe.price,
          recipe.category,
          recipe.is_active ? 1 : 0,
          recipe.created_at,
          recipe.updated_at || recipe.created_at,
        ]
      );

      // Delete old ingredients for this recipe
      await db.runAsync(
        "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?",
        [recipe.id]
      );

      // Insert new ingredients
      const ings = (recipeIngredients || []).filter(
        (ri: any) => ri.recipe_id === recipe.id
      );
      for (const ri of ings) {
        await db.runAsync(
          `INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [ri.id, ri.recipe_id, ri.ingredient_id, ri.quantity, ri.unit]
        );
      }
    }

    console.log(`[PullSync] Synced ${recipes.length} recipes`);
    return { synced: recipes.length };
  } catch (err) {
    console.error("[PullSync] Recipes error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest batch recipes (semi-finished products)
 */
export async function pullLatestBatchRecipes(): Promise<{ synced: number }> {
  try {
    const db = await getDB();

    const { data: batchRecipes, error } = await supabase
      .from("batch_recipes")
      .select("*");

    if (error) {
      console.error("[PullSync] Batch recipes fetch error:", error);
      throw error;
    }

    if (!batchRecipes || batchRecipes.length === 0) {
      console.log("[PullSync] No batch recipes to sync");
      return { synced: 0 };
    }

    for (const batch of batchRecipes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO local_batch_recipes 
        (id, business_id, output_ingredient_id, name, yield_qty, yield_unit, instructions, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batch.id,
          batch.business_id,
          batch.output_ingredient_id,
          batch.name,
          batch.yield_qty,
          batch.yield_unit,
          batch.instructions,
          1, // Defaulting to 1 (active) since Supabase doesn't have this column yet
          batch.created_at,
        ]
      );
    }

    console.log(`[PullSync] Synced ${batchRecipes.length} batch recipes`);
    return { synced: batchRecipes.length };
  } catch (err) {
    console.error("[PullSync] Batch recipes error:", err);
    return { synced: 0 };
  }
}

/**
 * Full pull - stock, ingredients, recipes, batch recipes
 */
export async function pullAllData(): Promise<{
  stock: number;
  ingredients: number;
  recipes: number;
  batchRecipes: number;
}> {
  const stockResult = await pullLatestStock();
  const ingredientsResult = await pullLatestIngredients();
  const recipesResult = await pullLatestRecipes();
  const batchRecipesResult = await pullLatestBatchRecipes();

  console.log("[PullSync] Full sync complete:", {
    stock: stockResult.synced,
    ingredients: ingredientsResult.synced,
    recipes: recipesResult.synced,
    batchRecipes: batchRecipesResult.synced,
  });

  return {
    stock: stockResult.synced,
    ingredients: ingredientsResult.synced,
    recipes: recipesResult.synced,
    batchRecipes: batchRecipesResult.synced,
  };
}
