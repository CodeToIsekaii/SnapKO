/**
 * SnapKO Desktop - Sync Engine (migrated to BE-SnapKO)
 *
 * Pull: GET /ingredients, GET /recipes (recipes include nested ingredients)
 * Push: POST/PATCH /recipes (bidirectional recipe sync)
 * Auth: apiFetch handles backend tokens + 401 refresh automatically
 */

import { getDatabase } from "./database";
import { apiFetch } from "./apiClient";

// ─── Types ─────────────────────────────────────────────────────────────────
type BackendIngredient = {
  id: string;
  businessId: string;
  name: string;
  baseUnit: string | null;
  stockCheckUnit?: string | null;
  warehouseQty?: number | null;
  barQty?: number | null;
  unitCost?: number | null;
  density?: number | null;
  tareWeight?: number | null;
  unitWeight?: number | null;
  unitWeightUnit?: string | null;
  minThreshold?: number | null;
  createdAt: string;
  archived?: boolean | null;
  deletedAt?: string | null;
  itemType?: string | null;
  trackingMode?: string | null;
  allowableVariance?: number | null;
  type?: string | null;
  isBatchItem?: boolean | null;
  batchYieldQty?: number | null;
  batchYieldUnit?: string | null;
  lastPurchasePrice?: number | null;
  lastPurchaseQty?: number | null;
  lastPurchaseUnit?: string | null;
  shelfLifeDays?: number | null;
  batchComponents?: Array<{
    id: string;
    childId: string;
    quantity: number;
    unit: string;
  }> | null;
};

type BackendRecipeIngredient = {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unit: string | null;
};

type BackendRecipe = {
  id: string;
  businessId: string;
  name: string;
  price: number | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ingredients?: BackendRecipeIngredient[];
  recipeIngredients?: BackendRecipeIngredient[];
};

const isApiNotFound = (err: any) =>
  err?.status === 404 || err?.message?.includes("404");

/**
 * Pull ingredients from backend to local SQLite.
 * Single-flight + 2s TTL cache — multiple callers (Dashboard auto-sync, realtime
 * stock signal, realtime master-data signal, renderer refresh) overlap within
 * ~100ms of each stock change, wasting 3× identical GET /ingredients. Share one
 * in-flight promise; reuse result if called again within 2s.
 */
let pullIngredientsInFlight: Promise<{ success: boolean; synced: number; error?: string }> | null = null;
let pullIngredientsCachedAt = 0;
let pullIngredientsCached: { success: boolean; synced: number; error?: string } | null = null;
// 10 min cache — realtime signal bypasses via invalidatePullCache() when mutations land.
// Background polling (Dashboard mount, fallback timer) reuses cached result.
const PULL_INGREDIENTS_TTL_MS = 10 * 60 * 1000;

export async function pullIngredients(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (pullIngredientsCached && Date.now() - pullIngredientsCachedAt < PULL_INGREDIENTS_TTL_MS) {
    return pullIngredientsCached;
  }
  if (pullIngredientsInFlight) return pullIngredientsInFlight;

  pullIngredientsInFlight = (async () => {
    const result = await pullIngredientsImpl();
    pullIngredientsCached = result;
    pullIngredientsCachedAt = Date.now();
    return result;
  })().finally(() => {
    pullIngredientsInFlight = null;
  });

  return pullIngredientsInFlight;
}

async function pullIngredientsImpl(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  try {
    const db = getDatabase();

    const ingredients = await apiFetch<BackendIngredient[]>("/ingredients?status=all");

    if (!ingredients || ingredients.length === 0) {
      return { success: true, synced: 0 };
    }

    const stmt = db.prepare(`
      INSERT INTO local_ingredients
      (id, business_id, name, base_unit, stock_check_unit, warehouse_qty, bar_qty, unit_cost, density, tare_weight,
       unit_weight, unit_weight_unit, created_at, min_threshold,
       type, item_type, tracking_mode, allowable_variance, is_batch_item, batch_yield_qty, batch_yield_unit,
       last_purchase_price, last_purchase_qty, last_purchase_unit, shelf_life_days, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_id = excluded.business_id,
        name = excluded.name,
        base_unit = excluded.base_unit,
        stock_check_unit = excluded.stock_check_unit,
        warehouse_qty = excluded.warehouse_qty,
        bar_qty = excluded.bar_qty,
        unit_cost = excluded.unit_cost,
        density = COALESCE(excluded.density, density),
        tare_weight = COALESCE(excluded.tare_weight, tare_weight),
        unit_weight = COALESCE(excluded.unit_weight, unit_weight),
        unit_weight_unit = COALESCE(excluded.unit_weight_unit, unit_weight_unit),
        created_at = excluded.created_at,
        min_threshold = COALESCE(excluded.min_threshold, min_threshold),
        type = excluded.type,
        item_type = excluded.item_type,
        tracking_mode = excluded.tracking_mode,
        allowable_variance = excluded.allowable_variance,
        is_batch_item = excluded.is_batch_item,
        batch_yield_qty = excluded.batch_yield_qty,
        batch_yield_unit = excluded.batch_yield_unit,
        last_purchase_price = excluded.last_purchase_price,
        last_purchase_qty = excluded.last_purchase_qty,
        last_purchase_unit = excluded.last_purchase_unit,
        shelf_life_days = excluded.shelf_life_days,
        archived = excluded.archived
    `);

    const upsertComponent = db.prepare(`
      INSERT INTO local_ingredient_components (id, parent_id, child_id, quantity, unit)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        child_id = excluded.child_id,
        quantity = excluded.quantity,
        unit = excluded.unit
    `);

    const deleteOldComponents = db.prepare(
      `DELETE FROM local_ingredient_components WHERE parent_id = ?`
    );

    const transaction = db.transaction(() => {
      for (const ing of ingredients) {
        stmt.run(
          ing.id,
          ing.businessId,
          ing.name,
          ing.baseUnit,
          ing.stockCheckUnit ?? (ing as any).stock_check_unit ?? null,
          ing.warehouseQty ?? 0,
          ing.barQty ?? 0,
          ing.unitCost ?? 0,
          ing.density ?? (ing as any).density ?? 1,
          ing.tareWeight ?? (ing as any).tare_weight ?? 0,
          ing.unitWeight ?? (ing as any).unit_weight ?? null,
          ing.unitWeightUnit ?? (ing as any).unit_weight_unit ?? null,
          ing.createdAt,
          ing.minThreshold ?? 0,
          ing.type ?? (ing.isBatchItem ? "semi_product" : "raw_material"),
          ing.itemType ?? "STOCK",
          ing.trackingMode ?? "STRICT",
          ing.allowableVariance ?? 0,
          ing.isBatchItem ? 1 : 0,
          ing.batchYieldQty ?? null,
          ing.batchYieldUnit ?? null,
          ing.lastPurchasePrice != null ? Number(ing.lastPurchasePrice) : null,
          ing.lastPurchaseQty != null ? Number(ing.lastPurchaseQty) : null,
          ing.lastPurchaseUnit ?? null,
          ing.shelfLifeDays != null
            ? Math.round(Number(ing.shelfLifeDays))
            : (ing as any).shelf_life_days != null
              ? Math.round(Number((ing as any).shelf_life_days))
              : null,
          ing.archived || ing.deletedAt ? 1 : 0
        );
        // Refresh components for batch items
        if (ing.isBatchItem && ing.batchComponents?.length) {
          deleteOldComponents.run(ing.id);
          for (const comp of ing.batchComponents) {
            const childId = comp.childId ?? (comp as any).childIngredientId ?? (comp as any).child_id;
            if (!childId) {
              console.warn(`[Sync] Skipping component with null childId for ingredient ${ing.id}`);
              continue;
            }
            upsertComponent.run(comp.id, ing.id, childId, comp.quantity, comp.unit);
          }
        }
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
 * Pull storage_areas and stock_levels from /sync/pull, upsert into local tables,
 * then recompute warehouse_qty/bar_qty cache columns.
 */
export async function pullStockLevels(): Promise<{ success: boolean; synced: number }> {
  try {
    const db = getDatabase();
    type SyncPullData = {
      storageAreas?: Array<{ id: string; businessId: string; name: string; type: string; isDefault: boolean; isActive: boolean }>;
      stockLevels?: Array<{ id: string; ingredientId: string; areaId?: string; storageAreaId?: string; quantity: number; lastCountedAt?: string; deletedAt?: string }>;
    };
    const raw = await apiFetch<SyncPullData | { success?: boolean; data?: SyncPullData }>("/sync/pull");
    const data = "data" in (raw as any) && (raw as any).data
      ? (raw as any).data as SyncPullData
      : raw as SyncPullData;
    if (!data) return { success: true, synced: 0 };

    const upsertArea = db.prepare(`
      INSERT INTO local_storage_areas (id, business_id, name, type, is_default, is_active, synced)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, type = excluded.type,
        is_default = excluded.is_default, is_active = excluded.is_active, synced = 1
    `);

    const upsertLevel = db.prepare(`
      INSERT INTO local_stock_levels (id, ingredient_id, area_id, quantity, last_counted_at, deleted_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(ingredient_id, area_id) DO UPDATE SET
        quantity = excluded.quantity, last_counted_at = excluded.last_counted_at,
        deleted_at = excluded.deleted_at, synced = 1
    `);

    const syncCache = db.prepare(`
      UPDATE local_ingredients SET
        warehouse_qty = COALESCE((
          SELECT SUM(sl.quantity) FROM local_stock_levels sl
          JOIN local_storage_areas sa ON sa.id = sl.area_id
          WHERE sl.ingredient_id = local_ingredients.id AND sa.type = 'STORAGE' AND (sa.is_active = 1 OR sa.is_active IS NULL) AND sl.deleted_at IS NULL
        ), warehouse_qty),
        bar_qty = COALESCE((
          SELECT SUM(sl.quantity) FROM local_stock_levels sl
          JOIN local_storage_areas sa ON sa.id = sl.area_id
          WHERE sl.ingredient_id = local_ingredients.id AND sa.type = 'SERVICE' AND (sa.is_active = 1 OR sa.is_active IS NULL) AND sl.deleted_at IS NULL
        ), bar_qty)
    `);

    const tx = db.transaction(() => {
      for (const sa of data.storageAreas ?? []) {
        // Treat null isActive as active (Prisma Boolean? defaults to true)
        upsertArea.run(sa.id, sa.businessId, sa.name, sa.type ?? 'STORAGE', sa.isDefault ? 1 : 0, sa.isActive !== false ? 1 : 0);
      }
      for (const sl of data.stockLevels ?? []) {
        const areaId = sl.areaId ?? sl.storageAreaId;
        if (!areaId) continue;
        upsertLevel.run(sl.id, sl.ingredientId, areaId, sl.quantity ?? 0, sl.lastCountedAt ?? null, sl.deletedAt ?? null);
      }
      syncCache.run();
    });

    tx();
    const synced = (data.stockLevels?.length ?? 0);
    console.log(`[Sync] Pulled ${data.storageAreas?.length ?? 0} areas, ${synced} stock levels`);
    return { success: true, synced };
  } catch (err: any) {
    console.error('[Sync] pullStockLevels error:', err);
    return { success: false, synced: 0 };
  }
}

/**
 * Pull recipes — single-flight + 2s TTL cache (same rationale as pullIngredients).
 */
let pullRecipesInFlight: Promise<{ success: boolean; synced: number; error?: string }> | null = null;
let pullRecipesCachedAt = 0;
let pullRecipesCached: { success: boolean; synced: number; error?: string } | null = null;

/**
 * Force next pullIngredients/pullRecipes to bypass cache. Call from realtime
 * handlers after confirmed mutations (sync_signal, inventory_logs INSERT).
 */
export function invalidatePullCache(): void {
  pullIngredientsCached = null;
  pullIngredientsCachedAt = 0;
  pullRecipesCached = null;
  pullRecipesCachedAt = 0;
}

export async function pullRecipes(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (pullRecipesCached && Date.now() - pullRecipesCachedAt < PULL_INGREDIENTS_TTL_MS) {
    return pullRecipesCached;
  }
  if (pullRecipesInFlight) return pullRecipesInFlight;

  pullRecipesInFlight = (async () => {
    const result = await pullRecipesImpl();
    pullRecipesCached = result;
    pullRecipesCachedAt = Date.now();
    return result;
  })().finally(() => {
    pullRecipesInFlight = null;
  });

  return pullRecipesInFlight;
}

async function pullRecipesImpl(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  try {
    const db = getDatabase();

    const recipes = await apiFetch<BackendRecipe[]>("/recipes");

    if (!recipes || recipes.length === 0) return { success: true, synced: 0 };

    const upsertRecipe = db.prepare(`
      INSERT INTO local_recipes
      (id, business_id, name, price, category, is_active, is_dirty, is_synced, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        business_id = excluded.business_id,
        name = excluded.name,
        price = excluded.price,
        category = excluded.category,
        is_active = excluded.is_active,
        is_dirty = 0,
        is_synced = 1,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);

    const deleteIngredients = db.prepare(
      "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?"
    );
    const insertIngredient = db.prepare(`
      INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit, is_dirty)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    const transaction = db.transaction(() => {
      for (const recipe of recipes) {
        upsertRecipe.run(
          recipe.id,
          recipe.businessId,
          recipe.name,
          recipe.price,
          recipe.category,
          recipe.isActive ? 1 : 0,
          recipe.createdAt,
          recipe.updatedAt
        );

        deleteIngredients.run(recipe.id);

        const ings = recipe.ingredients || recipe.recipeIngredients || [];
        for (const ri of ings) {
          insertIngredient.run(
            ri.id,
            recipe.id,
            ri.ingredientId,
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
 * Push local recipes to backend (bidirectional sync for active recipes).
 * PATCH existing recipes; if backend returns 404, create with the same client UUID.
 */
export async function pushRecipes(): Promise<{
  success: boolean;
  pushed: number;
  error?: string;
}> {
  try {
    const db = getDatabase();

    const recipes = db
      .prepare("SELECT * FROM local_recipes WHERE is_dirty = 1")
      .all() as any[];
    const recipeIngredients = db
      .prepare("SELECT * FROM local_recipe_ingredients")
      .all() as any[];

    let pushed = 0;
    let created = 0;
    let failed = 0;

    const isValidUUID = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id
      );

    const clearRecipeDirty = db.prepare(
      "UPDATE local_recipes SET is_dirty = 0 WHERE id = ?"
    );
    const clearIngDirty = db.prepare(
      "UPDATE local_recipe_ingredients SET is_dirty = 0 WHERE recipe_id = ?"
    );

    for (const recipe of recipes) {
      if (!isValidUUID(recipe.id)) {
        console.warn(`[Sync] Skipping legacy recipe ID: ${recipe.id}`);
        continue;
      }

      const ings = recipeIngredients
        .filter((ri: any) => ri.recipe_id === recipe.id)
        .map((ri: any) => ({
          ingredientId: ri.ingredient_id,
          quantity: ri.quantity,
          unit: ri.unit ?? undefined,
        }));
      const payload = {
        name: recipe.name,
        price: recipe.price,
        category: recipe.category,
        isActive: recipe.is_active === 1,
        ingredients: ings,
      };

      try {
        try {
          await apiFetch(`/recipes/${recipe.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        } catch (err: any) {
          if (!isApiNotFound(err)) throw err;
          await apiFetch("/recipes", {
            method: "POST",
            body: JSON.stringify({ id: recipe.id, ...payload }),
          });
          created++;
        }
        clearRecipeDirty.run(recipe.id);
        clearIngDirty.run(recipe.id);
        pushed++;
      } catch (err: any) {
        failed++;
        console.error(`[Sync] Push recipe error (${recipe.name}):`, err.message);
      }
    }

    console.log(`[Sync] Pushed ${pushed} recipes${created ? ` (${created} created)` : ""}${failed ? `, ${failed} failed` : ""}`);
    return { success: true, pushed };
  } catch (err: any) {
    console.error("[Sync] Push recipes error:", err);
    return { success: false, pushed: 0, error: err.message };
  }
}

/**
 * Full pull sync - ingredients + recipes. Single-flight: concurrent IPC
 * sync:pull calls share one pullAll() run.
 */
let pullAllInFlight: Promise<{ success: boolean; synced: number; error?: string }> | null = null;

export async function pullAll(opts?: { force?: boolean }): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (opts?.force) invalidatePullCache();
  if (pullAllInFlight) return pullAllInFlight;

  pullAllInFlight = pullAllImpl().finally(() => {
    pullAllInFlight = null;
  });
  return pullAllInFlight;
}

async function pullAllImpl(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  // Flush queue FIRST so DELETE / UPSERT changes land server-side before pull
  const { processQueue } = await import("./syncWorker");
  await processQueue();

  const pushResult = await pushRecipes();
  if (!pushResult.success) {
    console.warn("[Sync] Push recipes failed:", pushResult.error);
  }

  const ingredientsResult = await pullIngredients();
  if (!ingredientsResult.success) return ingredientsResult;

  const recipesResult = await pullRecipes();
  if (!recipesResult.success) return recipesResult;

  const stockResult = await pullStockLevels();
  if (!stockResult.success) {
    console.warn("[Sync] pullStockLevels failed — cache columns may be stale");
  }

  return {
    success: true,
    synced: ingredientsResult.synced + recipesResult.synced + stockResult.synced,
  };
}
