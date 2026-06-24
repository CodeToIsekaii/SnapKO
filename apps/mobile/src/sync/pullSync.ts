/**
 * Smart Pull Sync - Fetches changes from BE-SnapKO via single /sync/pull call.
 * Backend returns camelCase; we map to snake_case for local SQLite tables.
 */

import { api } from "../services/api";
import { getDB } from "../db";
import { syncLegacyQtyLocal } from "../db/stockLevelHelper";
import {
  normalizeJsonArrayForSql,
  normalizeNullableJsonForSql,
} from "./sqliteJson";

function isNetworkRequestFailure(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Network request failed");
}

interface SyncPullResponse {
  ingredients: any[];
  recipes: any[]; // each includes `ingredients` (recipe_ingredients)
  storageAreas: any[];
  stockLevels: any[];
  recentLogs: any[];
  activePendingLends: any[];
}

function normalizeSyncPullResponse(raw: any): SyncPullResponse | null {
  const candidate = raw?.ingredients ? raw : raw?.data?.ingredients ? raw.data : null;
  if (!candidate) {
    console.warn("[PullSync] Unexpected /sync/pull shape:", raw);
    return null;
  }

  return {
    ingredients: candidate.ingredients ?? [],
    recipes: candidate.recipes ?? [],
    storageAreas: candidate.storageAreas ?? [],
    stockLevels: candidate.stockLevels ?? [],
    recentLogs: candidate.recentLogs ?? [],
    activePendingLends: candidate.activePendingLends ?? [],
  };
}

const inFlight = new Map<string, Promise<SyncPullResponse | null>>();
const cached = new Map<string, { data: SyncPullResponse; at: number }>();
const CACHE_TTL_MS = 5000;

export async function fetchSyncPull(
  lastMasterDataUpdate?: string,
): Promise<SyncPullResponse | null> {
  const key = lastMasterDataUpdate ?? "";

  const cachedEntry = cached.get(key);
  if (cachedEntry && Date.now() - cachedEntry.at < CACHE_TTL_MS) {
    return cachedEntry.data;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const query = lastMasterDataUpdate
        ? `?lastMasterDataUpdate=${encodeURIComponent(lastMasterDataUpdate)}`
        : "";
      const raw = await api.get<any>(`/sync/pull${query}`);
      const data = normalizeSyncPullResponse(raw);
      if (data) {
        cached.set(key, { data, at: Date.now() });
        console.log("[PullSync] /sync/pull counts:", {
          ingredients: data.ingredients.length,
          recipes: data.recipes.length,
          stockLevels: data.stockLevels.length,
          recentLogs: data.recentLogs.length,
        });
      }
      return data;
    } catch (err) {
      if (isNetworkRequestFailure(err)) {
        console.log("[PullSync] /sync/pull skipped: backend unavailable.");
      } else {
        console.error("[PullSync] /sync/pull error:", err);
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function invalidatePullCache(): void {
  cached.clear();
}

async function upsertStockLevels(db: any, stockLevels: any[]): Promise<number> {
  if (!stockLevels?.length) return 0;
  const affected = new Set<string>();
  for (const stock of stockLevels) {
    const ingredientId = stock.ingredientId ?? stock.ingredient_id;
    await db.runAsync(
      `INSERT OR REPLACE INTO local_stock_levels
        (id, ingredient_id, area_id, quantity, last_counted_at, synced, deleted_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        stock.id,
        ingredientId,
        stock.storageAreaId ?? stock.areaId ?? stock.area_id ?? null,
        stock.quantity ?? stock.qty ?? 0,
        stock.lastCountedAt ?? stock.last_counted_at ?? null,
        stock.deletedAt ?? stock.deleted_at ?? null,
      ]
    );
    if (ingredientId) affected.add(ingredientId);
  }
  for (const ingredientId of affected) {
    await syncLegacyQtyLocal(db, ingredientId);
  }
  return stockLevels.length;
}

async function upsertStorageAreas(db: any, storageAreas: any[]): Promise<number> {
  if (!storageAreas?.length) return 0;

  const idsByBusiness = new Map<string, string[]>();
  for (const sa of storageAreas) {
    const businessId = sa.businessId ?? sa.business_id;
    if (!businessId || !sa.id) continue;

    await db.runAsync(
      `INSERT OR REPLACE INTO local_storage_areas
        (id, business_id, name, type, is_default, is_active, synced)
        VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        sa.id,
        businessId,
        sa.name,
        sa.type ?? "STORAGE",
        (sa.isDefault ?? sa.is_default) ? 1 : 0,
        (sa.isActive ?? sa.is_active ?? true) ? 1 : 0,
      ]
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
      [businessId, ...ids]
    );
  }

  return storageAreas.length;
}

async function upsertIngredients(db: any, ingredients: any[]): Promise<number> {
  if (!ingredients?.length) return 0;
  for (const ing of ingredients) {
    const aliases = ing.aliases ? JSON.stringify(ing.aliases) : "[]";
    await db.runAsync(
      `INSERT INTO local_ingredients
        (id, business_id, name, base_unit, stock_check_unit, min_threshold, average_unit_cost, unit_cost,
         density, tare_weight, aliases, archived, shelf_life_days, warehouse_qty, bar_qty,
         is_batch_item, batch_yield_qty, batch_yield_unit,
         type, item_type, tracking_mode, allowable_variance, unit_weight, unit_weight_unit,
         last_purchase_price, last_purchase_qty, last_purchase_unit,
         created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_id = excluded.business_id,
          name = excluded.name,
          base_unit = excluded.base_unit,
          stock_check_unit = excluded.stock_check_unit,
          unit_cost = excluded.unit_cost,
          shelf_life_days = excluded.shelf_life_days,
          warehouse_qty = excluded.warehouse_qty,
          bar_qty = excluded.bar_qty,
          created_at = excluded.created_at,
          min_threshold = COALESCE(excluded.min_threshold, min_threshold),
          archived = COALESCE(excluded.archived, archived),
          density = COALESCE(excluded.density, density),
          tare_weight = COALESCE(excluded.tare_weight, tare_weight),
          aliases = excluded.aliases,
          average_unit_cost = excluded.average_unit_cost,
          is_batch_item = excluded.is_batch_item,
          batch_yield_qty = excluded.batch_yield_qty,
          batch_yield_unit = excluded.batch_yield_unit,
          type = COALESCE(excluded.type, type),
          item_type = COALESCE(excluded.item_type, item_type),
          tracking_mode = COALESCE(excluded.tracking_mode, tracking_mode),
          allowable_variance = COALESCE(excluded.allowable_variance, allowable_variance),
          unit_weight = COALESCE(excluded.unit_weight, unit_weight),
          unit_weight_unit = COALESCE(excluded.unit_weight_unit, unit_weight_unit),
          last_purchase_price = excluded.last_purchase_price,
          last_purchase_qty = excluded.last_purchase_qty,
          last_purchase_unit = excluded.last_purchase_unit
        `,
      [
        ing.id,
        ing.businessId ?? ing.business_id ?? null,
        ing.name,
        ing.baseUnit ?? ing.base_unit ?? null,
        ing.stockCheckUnit ?? ing.stock_check_unit ?? null,
        ing.minThreshold ?? ing.min_threshold ?? 0,
        ing.averageUnitCost ?? ing.average_unit_cost ?? 0,
        ing.unitCost ?? ing.unit_cost ?? 0,
        ing.density ?? null,
        ing.tareWeight ?? ing.tare_weight ?? null,
        aliases,
        (ing.archived ?? ing.deletedAt ?? ing.deleted_at ?? false) ? 1 : 0,
        ing.shelfLifeDays ?? ing.shelf_life_days ?? null,
        ing.warehouseQty ?? ing.warehouse_qty ?? 0,
        ing.barQty ?? ing.bar_qty ?? 0,
        (ing.isBatchItem ?? ing.is_batch_item ?? false) ? 1 : 0,
        ing.batchYieldQty ?? ing.batch_yield_qty ?? null,
        ing.batchYieldUnit ?? ing.batch_yield_unit ?? null,
        ing.type ?? "raw_material",
        ing.itemType ?? ing.item_type ?? "STOCK",
        ing.trackingMode ?? ing.tracking_mode ?? "STRICT",
        ing.allowableVariance ?? ing.allowable_variance ?? 0,
        ing.unitWeight ?? ing.unit_weight ?? null,
        ing.unitWeightUnit ?? ing.unit_weight_unit ?? null,
        ing.lastPurchasePrice ?? ing.last_purchase_price ?? null,
        ing.lastPurchaseQty ?? ing.last_purchase_qty ?? null,
        ing.lastPurchaseUnit ?? ing.last_purchase_unit ?? null,
        ing.createdAt ?? ing.created_at ?? new Date().toISOString(),
      ]
    );

    // Store batch components if present (owner sees them; staff sees if shareRecipesWithStaff=true)
    const components: any[] = ing.batchComponents ?? ing.batch_components ?? [];
    if (components.length > 0) {
      await db.runAsync(
        `DELETE FROM local_ingredient_components WHERE parent_id = ?`,
        [ing.id]
      );
      for (const comp of components) {
        await db.runAsync(
          `INSERT OR REPLACE INTO local_ingredient_components (id, parent_id, child_id, quantity, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [
            comp.id,
            ing.id,
            comp.childIngredientId ?? comp.child_ingredient_id ?? comp.childId,
            comp.quantity,
            comp.unit,
          ]
        );
      }
    }
  }
  return ingredients.length;
}

async function upsertRecipes(db: any, recipes: any[]): Promise<number> {
  if (!recipes?.length) return 0;
  for (const recipe of recipes) {
    const aliases = recipe.aliases ? JSON.stringify(recipe.aliases) : "[]";
    await db.runAsync(
      `INSERT OR REPLACE INTO local_recipes
        (id, business_id, name, aliases, price, category, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipe.id,
        recipe.businessId ?? recipe.business_id,
        recipe.name,
        aliases,
        recipe.price,
        recipe.category,
        (recipe.isActive ?? recipe.is_active ?? false) ? 1 : 0,
        recipe.createdAt ?? recipe.created_at,
        recipe.updatedAt ?? recipe.updated_at ?? recipe.createdAt ?? recipe.created_at,
      ]
    );

    // Replace recipe ingredients (nested in response as `ingredients`)
    await db.runAsync(
      "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?",
      [recipe.id]
    );

    const ings = recipe.ingredients ?? [];
    for (const ri of ings) {
      await db.runAsync(
        `INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
           VALUES (?, ?, ?, ?, ?)`,
        [
          ri.id,
          ri.recipeId ?? ri.recipe_id ?? recipe.id,
          ri.ingredientId ?? ri.ingredient_id,
          ri.quantity,
          ri.unit,
        ]
      );
    }
  }
  return recipes.length;
}

async function upsertInventoryLogs(db: any, logs: any[]): Promise<number> {
  if (!logs?.length) return 0;
  for (const log of logs) {
    const sourcePhotoUrls = log.sourcePhotoUrls ?? log.source_photo_urls ?? [];
    const aiParsedJson = log.aiParsedJson ?? log.ai_parsed_json ?? null;

    await db.runAsync(
      `INSERT OR REPLACE INTO local_inventory_logs
        (id, ingredient_id, location, type, ai_parsed_quantity, ai_confidence_score,
         final_confirmed_quantity, quantity_change_base, unit_cost_at_time,
         source_photo_urls, ai_parsed_json, staff_note, is_verified, diff_percentage,
         created_at, created_by, business_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.ingredientId ?? log.ingredient_id ?? null,
        log.location || "",
        log.type,
        log.aiParsedQuantity ?? log.ai_parsed_quantity ?? null,
        log.aiConfidenceScore ?? log.ai_confidence_score ?? null,
        log.finalConfirmedQuantity ?? log.final_confirmed_quantity ?? null,
        log.quantityChangeBase ?? log.quantity_change_base ?? null,
        log.unitCostAtTime ?? log.unit_cost_at_time ?? null,
        normalizeJsonArrayForSql(sourcePhotoUrls),
        normalizeNullableJsonForSql(aiParsedJson),
        log.staffNote ?? log.staff_note ?? null,
        (log.isVerified ?? log.is_verified ?? false) ? 1 : 0,
        log.diffPercentage ?? log.diff_percentage ?? null,
        log.createdAt ?? log.created_at,
        log.createdById ?? log.created_by ?? null,
        log.businessId ?? log.business_id ?? null,
      ]
    );
  }
  return logs.length;
}

async function upsertPendingLends(db: any, lends: any[]): Promise<number> {
  if (!lends) return 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM local_pending_lends WHERE is_returned = 0");
    for (const lend of lends) {
      await db.runAsync(
        `INSERT INTO local_pending_lends (
            id, business_id, ingredient_id, ingredient_name, quantity, unit,
            source_location, lent_at, related_log_id, synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          lend.id,
          lend.businessId ?? lend.business_id,
          lend.ingredientId ?? lend.ingredient_id,
          lend.ingredient?.name ?? lend.ingredientName ?? lend.ingredient_name ?? "",
          lend.quantity,
          lend.unit,
          lend.sourceLocation ?? lend.source_location ?? null,
          lend.lentAt ?? lend.lent_at ?? null,
          lend.relatedLogId ?? lend.related_log_id ?? null,
        ]
      );
    }
  });
  return lends.length;
}

/**
 * Pull latest stock levels (via /sync/pull)
 */
export async function pullLatestStock(): Promise<{ synced: number }> {
  try {
    const db = await getDB();
    if (!db) throw new Error("Database not initialized");
    const pull = await fetchSyncPull();
    if (!pull) return { synced: 0 };

    await upsertStorageAreas(db, pull.storageAreas);
    const synced = await upsertStockLevels(db, pull.stockLevels);
    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_stock_sync', ?)",
      [new Date().toISOString()]
    );
    console.log(`[PullSync] Synced ${synced} stock changes`);
    return { synced };
  } catch (err) {
    console.error("[PullSync] Stock error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest ingredients (via /sync/pull)
 */
export async function pullLatestIngredients(): Promise<{ synced: number }> {
  try {
    const db = await getDB();
    if (!db) throw new Error("Database not initialized");
    const pull = await fetchSyncPull();
    if (!pull) return { synced: 0 };

    const synced = await upsertIngredients(db, pull.ingredients);
    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_ingredients_sync', ?)",
      [new Date().toISOString()]
    );
    console.log(`[PullSync] Synced ${synced} ingredient changes`);
    return { synced };
  } catch (err) {
    console.error("[PullSync] Ingredients error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest recipes (via /sync/pull, recipe_ingredients nested)
 */
export async function pullLatestRecipes(): Promise<{ synced: number }> {
  try {
    const db = await getDB();
    if (!db) throw new Error("Database not initialized");
    const pull = await fetchSyncPull();
    if (!pull) return { synced: 0 };

    const synced = await upsertRecipes(db, pull.recipes);
    console.log(`[PullSync] Synced ${synced} recipes`);
    return { synced };
  } catch (err) {
    console.error("[PullSync] Recipes error:", err);
    return { synced: 0 };
  }
}

/**
 * Pull latest batch recipes (NOT YET IN /sync/pull — TODO: extend backend)
 */
export async function pullLatestBatchRecipes(): Promise<{ synced: number }> {
  // TODO: Backend /sync/pull does not yet return batch_recipes.
  // When added, read pull.batchRecipes and upsert to local_batch_recipes.
  console.log("[PullSync] Batch recipes sync skipped (backend not ready)");
  return { synced: 0 };
}

/**
 * Pull latest inventory logs (via /sync/pull → recentLogs, last 50)
 */
export async function pullLatestInventoryLogs(): Promise<{ synced: number }> {
  try {
    const db = await getDB();
    if (!db) throw new Error("Database not initialized");
    const pull = await fetchSyncPull();
    if (!pull) return { synced: 0 };

    const synced = await upsertInventoryLogs(db, pull.recentLogs);
    console.log(`[PullSync] Synced ${synced} inventory logs`);
    return { synced };
  } catch (err) {
    console.error("[PullSync] Inventory logs error:", err);
    return { synced: 0 };
  }
}

/**
 * Full pull — single /sync/pull call, then write all tables.
 */
export async function pullAllData(): Promise<{
  stock: number;
  ingredients: number;
  recipes: number;
  batchRecipes: number;
  inventoryLogs: number;
}> {
  const result = {
    stock: 0,
    ingredients: 0,
    recipes: 0,
    batchRecipes: 0,
    inventoryLogs: 0,
  };

  try {
    const db = await getDB();
    if (!db) {
      console.error("[PullSync] Database not ready");
      return result;
    }

    const pull = await fetchSyncPull();
    if (!pull) return result;

    result.ingredients = await upsertIngredients(db, pull.ingredients);
    result.recipes = await upsertRecipes(db, pull.recipes);
    await upsertStorageAreas(db, pull.storageAreas);
    result.stock = await upsertStockLevels(db, pull.stockLevels);
    result.inventoryLogs = await upsertInventoryLogs(db, pull.recentLogs);
    await upsertPendingLends(db, pull.activePendingLends ?? []);

    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_ingredients_sync', ?)",
      [new Date().toISOString()]
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('last_stock_sync', ?)",
      [new Date().toISOString()]
    );

    console.log("[PullSync] Full sync complete:", result);
  } catch (err) {
    console.error("[PullSync] pullAllData error:", err);
  }

  return result;
}

/**
 * Pull pending lends (via /sync/pull → activePendingLends)
 * businessId param kept for back-compat; backend scopes by JWT.
 */
export async function pullPendingLends(_businessId: string): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;

    const pull = await fetchSyncPull();
    if (!pull) return;

    await upsertPendingLends(db, pull.activePendingLends ?? []);
    console.log(
      `[PullSync] Synced ${pull.activePendingLends?.length ?? 0} pending lends`
    );
  } catch (err) {
    console.error("[PullSync] Failed to pull pending lends:", err);
  }
}
