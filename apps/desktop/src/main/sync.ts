/**
 * SnapKO Desktop - Sync Engine
 *
 * Implements ONE-WAY SYNC (Server → Client) for Week 1
 * Per Plan: Desktop = Read-only viewer, no push sync yet
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDatabase } from "./database";
import { Env } from "../env";

// Sync client instance (initialized when auth token is set)
let syncClient: SupabaseClient | null = null;
let currentToken: string | null = null;

// Environment variables (validated via Zod in env.ts)
const SUPABASE_URL = Env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.VITE_SUPABASE_ANON_KEY;

/**
 * Set auth token and initialize sync client
 * Called from renderer after login or token refresh
 */
export function setAuthToken(token: string | null): boolean {
  if (!token) {
    syncClient = null;
    currentToken = null;
    console.log("[Sync] Auth token cleared");
    return true;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[Sync] Missing Supabase env vars");
    return false;
  }

  currentToken = token;
  syncClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  console.log("[Sync] Auth token set, sync client initialized");
  return true;
}

/**
 * Get current sync client (for use by other modules)
 */
export function getSyncClient(): SupabaseClient | null {
  return syncClient;
}

/**
 * Check if sync client is ready
 */
export function isSyncReady(): boolean {
  return syncClient !== null;
}

/**
 * Pull ingredients from Supabase to local SQLite
 */
export async function pullIngredients(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, synced: 0, error: "Not authenticated" };
  }

  try {
    const db = getDatabase();

    // Fetch ingredients from Supabase (user's business only via RLS)
    const { data: ingredients, error } = await syncClient
      .from("ingredients")
      .select(
        "id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, created_at, archived, min_threshold"
      );

    if (error) {
      throw new Error(error.message);
    }

    if (!ingredients || ingredients.length === 0) {
      return { success: true, synced: 0 };
    }

    // Upsert to local SQLite in a transaction
    // FIX: Use ON CONFLICT to preserve local-only fields if server returns NULL
    const stmt = db.prepare(`
      INSERT INTO local_ingredients 
      (id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, created_at, min_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_id = excluded.business_id,
        name = excluded.name,
        base_unit = excluded.base_unit,
        warehouse_qty = excluded.warehouse_qty,
        bar_qty = excluded.bar_qty,
        unit_cost = excluded.unit_cost,
        created_at = excluded.created_at,
        min_threshold = COALESCE(excluded.min_threshold, min_threshold)
      -- NOTE: density, archived NOT updated here to avoid accidental overrides unless returned
    `);

    const transaction = db.transaction(() => {
      for (const ing of ingredients) {
        stmt.run(
          ing.id,
          ing.business_id,
          ing.name,
          ing.base_unit,
          ing.warehouse_qty ?? 0,
          ing.bar_qty ?? 0,
          ing.unit_cost ?? 0,
          ing.created_at,
          ing.min_threshold ?? 0
        );
      }
    });

    transaction();

    console.log(`[Sync] Pulled ${ingredients.length} ingredients`);
    return { success: true, synced: ingredients.length };
  } catch (err: any) {
    console.error("[Sync] Pull ingredients error:", err);
    return { success: false, synced: 0, error: err.message };
  }
}

/**
 * Pull recipes from Supabase to local SQLite
 */
export async function pullRecipes(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, synced: 0, error: "Not authenticated" };
  }

  try {
    const db = getDatabase();

    // Fetch recipes with ingredients (including inactive for sync consistency)
    const { data: recipes, error } = await syncClient
      .from("recipes")
      .select(
        "id, business_id, name, price, category, is_active, created_at, updated_at"
      );

    if (error) throw new Error(error.message);
    if (!recipes || recipes.length === 0) return { success: true, synced: 0 };

    // Fetch all recipe ingredients
    const { data: recipeIngredients, error: riError } = await syncClient
      .from("recipe_ingredients")
      .select("id, recipe_id, ingredient_id, quantity, unit");

    if (riError) throw new Error(riError.message);

    // Transaction: upsert with ON CONFLICT to preserve local changes
    const upsertRecipe = db.prepare(`
      INSERT INTO local_recipes 
      (id, business_id, name, price, category, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_id = excluded.business_id,
        name = excluded.name,
        price = excluded.price,
        category = excluded.category,
        is_active = excluded.is_active,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);

    const deleteIngredients = db.prepare(
      "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?"
    );
    const insertIngredient = db.prepare(`
      INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const recipe of recipes) {
        upsertRecipe.run(
          recipe.id,
          recipe.business_id,
          recipe.name,
          recipe.price,
          recipe.category,
          recipe.is_active ? 1 : 0,
          recipe.created_at,
          recipe.updated_at
        );

        deleteIngredients.run(recipe.id);

        const ings = (recipeIngredients || []).filter(
          (ri: any) => ri.recipe_id === recipe.id
        );
        for (const ri of ings) {
          insertIngredient.run(
            ri.id,
            ri.recipe_id,
            ri.ingredient_id,
            ri.quantity,
            ri.unit
          );
        }
      }
    });

    transaction();
    console.log(`[Sync] Pulled ${recipes.length} recipes`);
    return { success: true, synced: recipes.length };
  } catch (err: any) {
    console.error("[Sync] Pull recipes error:", err);
    return { success: false, synced: 0, error: err.message };
  }
}

/**
 * Push local recipes to Supabase (bidirectional sync)
 */
export async function pushRecipes(): Promise<{
  success: boolean;
  pushed: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, pushed: 0, error: "Not authenticated" };
  }

  try {
    const db = getDatabase();

    // Get local recipes
    const recipes = db
      .prepare("SELECT * FROM local_recipes WHERE is_active = 1")
      .all() as any[];
    const recipeIngredients = db
      .prepare("SELECT * FROM local_recipe_ingredients")
      .all() as any[];

    let pushed = 0;

    // UUID validation helper
    const isValidUUID = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );

    for (const recipe of recipes) {
      // Skip legacy recipe IDs (non-UUID format)
      if (!isValidUUID(recipe.id)) {
        console.warn(`[Sync] Skipping legacy recipe ID: ${recipe.id}`);
        continue;
      }

      // Upsert recipe to Supabase
      const { error: recipeError } = await syncClient.from("recipes").upsert({
        id: recipe.id,
        business_id: recipe.business_id,
        name: recipe.name,
        price: recipe.price,
        category: recipe.category,
        is_active: true,
      });

      if (recipeError) {
        console.error(
          `[Sync] Push recipe error (${recipe.name}):`,
          recipeError
        );
        continue;
      }

      // Delete existing ingredients for this recipe on cloud
      await syncClient
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipe.id);

      // Insert recipe ingredients
      const ings = recipeIngredients.filter(
        (ri: any) => ri.recipe_id === recipe.id
      );
      if (ings.length > 0) {
        const { error: ingError } = await syncClient
          .from("recipe_ingredients")
          .insert(
            ings.map((ri: any) => ({
              id: ri.id,
              recipe_id: ri.recipe_id,
              ingredient_id: ri.ingredient_id,
              quantity: ri.quantity,
              unit: ri.unit,
            }))
          );

        if (ingError) console.error(`[Sync] Push ingredients error:`, ingError);
      }

      pushed++;
    }

    console.log(`[Sync] Pushed ${pushed} recipes`);
    return { success: true, pushed };
  } catch (err: any) {
    console.error("[Sync] Push recipes error:", err);
    return { success: false, pushed: 0, error: err.message };
  }
}

/**
 * Full pull sync - ingredients + recipes
 */
export async function pullAll(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, synced: 0, error: "Not authenticated" };
  }

  // CRITICAL: Process queue FIRST to push DELETE actions before pulling
  // This prevents deleted items from being pulled back from server
  const { processQueue } = await import("./syncWorker");
  await processQueue();

  // Push local recipes (bidirectional)
  const pushResult = await pushRecipes();
  if (!pushResult.success) {
    console.warn("[Sync] Push recipes failed:", pushResult.error);
  }

  // Pull ingredients
  const ingredientsResult = await pullIngredients();
  if (!ingredientsResult.success) {
    return ingredientsResult;
  }

  // Pull recipes
  const recipesResult = await pullRecipes();
  if (!recipesResult.success) {
    return recipesResult;
  }

  return {
    success: true,
    synced: ingredientsResult.synced + recipesResult.synced,
  };
}
