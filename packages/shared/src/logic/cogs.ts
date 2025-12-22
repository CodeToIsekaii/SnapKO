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
  recipe: Recipe,
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
