export type MasterDataTable = "ingredients" | "recipes";

const INGREDIENT_FIELD_MAP: Record<string, string> = {
  base_unit: "baseUnit",
  stock_check_unit: "stockCheckUnit",
  last_purchase_price: "lastPurchasePrice",
  last_purchase_qty: "lastPurchaseQty",
  last_purchase_unit: "lastPurchaseUnit",
  unit_cost: "unitCost",
  min_threshold: "minThreshold",
  item_type: "itemType",
  tracking_mode: "trackingMode",
  allowable_variance: "allowableVariance",
  unit_weight: "unitWeight",
  unit_weight_unit: "unitWeightUnit",
  shelf_life_days: "shelfLifeDays",
  is_batch_item: "isBatchItem",
  batch_yield_qty: "batchYieldQty",
  batch_yield_unit: "batchYieldUnit",
};

const RECIPE_FIELD_MAP: Record<string, string> = {
  is_active: "isActive",
};

const INGREDIENT_FIELDS = new Set([
  "id",
  "name",
  "aliases",
  "baseUnit",
  "stockCheckUnit",
  "lastPurchasePrice",
  "lastPurchaseQty",
  "lastPurchaseUnit",
  "unitCost",
  "minThreshold",
  "type",
  "itemType",
  "trackingMode",
  "allowableVariance",
  "unitWeight",
  "unitWeightUnit",
  "density",
  "shelfLifeDays",
  "isBatchItem",
  "batchYieldQty",
  "batchYieldUnit",
  "components",
]);

const RECIPE_FIELDS = new Set([
  "id",
  "name",
  "aliases",
  "price",
  "category",
  "isActive",
  "ingredients",
]);

export function createSingleFlight<TArgs extends unknown[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let inFlight: Promise<TResult> | null = null;

  return (...args: TArgs): Promise<TResult> => {
    if (inFlight) return inFlight;

    let operationPromise: Promise<TResult>;
    try {
      operationPromise = operation(...args);
    } catch (error) {
      operationPromise = Promise.reject(error);
    }
    const sharedPromise = operationPromise.finally(() => {
      if (inFlight === sharedPromise) {
        inFlight = null;
      }
    });
    inFlight = sharedPromise;
    return sharedPromise;
  };
}

function normalizeAliases(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

export function normalizeMasterDataPayload(
  table: MasterDataTable,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const fieldMap =
    table === "ingredients" ? INGREDIENT_FIELD_MAP : RECIPE_FIELD_MAP;
  const allowedFields =
    table === "ingredients" ? INGREDIENT_FIELDS : RECIPE_FIELDS;
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = fieldMap[key] ?? key;
    if (!allowedFields.has(normalizedKey)) continue;
    normalized[normalizedKey] =
      normalizedKey === "aliases" ? normalizeAliases(value) : value;
  }

  return normalized;
}
