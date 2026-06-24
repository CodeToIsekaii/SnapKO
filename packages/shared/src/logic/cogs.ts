/**
 * SnapKO COGS (Cost of Goods Sold) Calculations
 * Pure business logic - no UI dependencies
 */

import type {
  Ingredient,
  Recipe,
  RecipeIngredient,
  InventoryLog,
} from "@snapko/ts-types";

/**
 * Calculate COGS for a single recipe
 * @param recipe The recipe to calculate
 * @param recipeIngredients Ingredients in the recipe
 * @param ingredients All available ingredients with unit costs
 * @returns COGS in VND
 */
export function calculateRecipeCOGS(
  _recipe: Recipe,
  recipeIngredients: RecipeIngredient[],
  ingredients: Ingredient[]
): number {
  let totalCost = 0;

  for (const ri of recipeIngredients) {
    const ingredient = ingredients.find((i) => i.id === ri.ingredient_id);
    if (ingredient) {
      totalCost += ri.quantity_needed * ingredient.unit_cost;
    }
  }

  return totalCost;
}

/**
 * Calculate gross profit for a recipe
 * @param sellingPrice Selling price in VND
 * @param cogs Cost of goods sold in VND
 * @returns Gross profit in VND
 */
export function calculateGrossProfit(
  sellingPrice: number,
  cogs: number
): number {
  return sellingPrice - cogs;
}

/**
 * Calculate gross profit margin percentage
 * @param sellingPrice Selling price in VND
 * @param cogs Cost of goods sold in VND
 * @returns Margin percentage (0-100)
 */
export function calculateGrossProfitMargin(
  sellingPrice: number,
  cogs: number
): number {
  if (sellingPrice === 0) return 0;
  return ((sellingPrice - cogs) / sellingPrice) * 100;
}

/**
 * Calculate inventory value
 * @param ingredients All ingredients with quantities and unit costs
 * @returns Total inventory value in VND
 */
export function calculateInventoryValue(ingredients: Ingredient[]): number {
  return ingredients.reduce((total, ing) => {
    const totalQty = ing.warehouse_qty + ing.bar_qty;
    return total + totalQty * ing.unit_cost;
  }, 0);
}

/**
 * Calculate inventory value by location
 * @param ingredients All ingredients
 * @returns Object with warehouse and bar values
 */
export function calculateInventoryValueByLocation(ingredients: Ingredient[]): {
  warehouse: number;
  bar: number;
  total: number;
} {
  const warehouse = ingredients.reduce(
    (sum, ing) => sum + ing.warehouse_qty * ing.unit_cost,
    0
  );
  const bar = ingredients.reduce(
    (sum, ing) => sum + ing.bar_qty * ing.unit_cost,
    0
  );

  return {
    warehouse,
    bar,
    total: warehouse + bar,
  };
}

/**
 * Calculate total import cost from logs
 * @param logs Inventory logs filtered by type IMPORT
 * @returns Total import cost in VND
 */
export function calculateTotalImportCost(logs: InventoryLog[]): number {
  return logs
    .filter((log) => log.type === "IMPORT")
    .reduce((sum, log) => {
      const qty = log.final_confirmed_quantity ?? log.ai_parsed_quantity ?? 0;
      const cost = log.unit_cost_at_time ?? 0;
      return sum + qty * cost;
    }, 0);
}

/**
 * Calculate waste cost from logs
 * @param logs Inventory logs filtered by type WASTE
 * @returns Total waste cost in VND
 */
export function calculateWasteCost(logs: InventoryLog[]): number {
  return logs
    .filter((log) => log.type === "WASTE")
    .reduce((sum, log) => {
      const qty = Math.abs(
        log.final_confirmed_quantity ?? log.ai_parsed_quantity ?? 0
      );
      const cost = log.unit_cost_at_time ?? 0;
      return sum + qty * cost;
    }, 0);
}

/**
 * Calculate daily COGS summary
 * @param logs All inventory logs for the day
 * @returns Summary object
 */
export function calculateDailyCOGSSummary(logs: InventoryLog[]): {
  imports: number;
  waste: number;
  transfers: number;
  netCost: number;
} {
  const imports = calculateTotalImportCost(logs);
  const waste = calculateWasteCost(logs);
  const transfers = logs
    .filter((log) => log.type === "TRANSFER")
    .reduce((sum, log) => {
      const qty = Math.abs(log.final_confirmed_quantity ?? 0);
      const cost = log.unit_cost_at_time ?? 0;
      return sum + qty * cost;
    }, 0);

  return {
    imports,
    waste,
    transfers,
    netCost: imports - waste,
  };
}

// =============================================
// WEIGHTED AVERAGE COGS CALCULATION
// Per .antigravityrules Section C.1
// =============================================

/**
 * Calculate Weighted Average Cost on Import
 * Formula: ((OldQty * OldCost) + (ImportQty * ImportPrice)) / (OldQty + ImportQty)
 *
 * IMPORTANT: This is a PURE FUNCTION for client-side preview.
 * The actual update MUST use the Postgres function `update_ingredient_cost_on_import`
 * to ensure atomicity (transaction).
 */
export function calculateWeightedAverageCost(
  oldQty: number,
  oldCost: number,
  importQty: number,
  importPrice: number
): number {
  const totalQty = oldQty + importQty;

  if (totalQty <= 0) {
    return importPrice; // Edge case: no existing inventory
  }

  const newCost = (oldQty * oldCost + importQty * importPrice) / totalQty;

  return Math.round(newCost * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Preview import effect on inventory value
 */
export interface ImportPreview {
  ingredient_id: string;
  ingredient_name: string;

  old_qty: number;
  old_cost: number;
  old_value: number;

  import_qty: number;
  import_price: number;
  import_value: number;

  new_qty: number;
  new_cost: number;
  new_value: number;

  cost_change: number;
  cost_change_pct: number;
}

export function previewImportEffect(
  ingredient: {
    id: string;
    name: string;
    current_qty: number;
    current_cost: number;
  },
  importQty: number,
  importPrice: number
): ImportPreview {
  const oldValue = ingredient.current_qty * ingredient.current_cost;
  const importValue = importQty * importPrice;
  const newQty = ingredient.current_qty + importQty;
  const newCost = calculateWeightedAverageCost(
    ingredient.current_qty,
    ingredient.current_cost,
    importQty,
    importPrice
  );
  const newValue = newQty * newCost;
  const costChange = newCost - ingredient.current_cost;
  const costChangePct =
    ingredient.current_cost > 0
      ? (costChange / ingredient.current_cost) * 100
      : 0;

  return {
    ingredient_id: ingredient.id,
    ingredient_name: ingredient.name,
    old_qty: ingredient.current_qty,
    old_cost: ingredient.current_cost,
    old_value: oldValue,
    import_qty: importQty,
    import_price: importPrice,
    import_value: importValue,
    new_qty: newQty,
    new_cost: newCost,
    new_value: newValue,
    cost_change: Math.round(costChange * 10000) / 10000,
    cost_change_pct: Math.round(costChangePct * 100) / 100,
  };
}

/**
 * Calculate COGS percentage (Cost to Price ratio)
 */
export function calculateCOGSPercentage(
  cost: number,
  sellingPrice: number
): number {
  if (sellingPrice <= 0) return 0;
  return Math.round((cost / sellingPrice) * 10000) / 100;
}
