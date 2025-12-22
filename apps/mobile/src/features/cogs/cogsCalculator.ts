/**
 * COGS Calculator - Business logic for Cost of Goods Sold
 * Pure functions for calculating recipe costs
 */

import type { SQLiteDatabase } from "expo-sqlite";

export interface RecipeIngredientLocal {
  ingredient_id: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

/**
 * Calculate COGS for a recipe by ID
 */
export async function calculateRecipeCOGS(
  db: SQLiteDatabase,
  recipeId: string
): Promise<{ cogs: number; ingredientCount: number }> {
  try {
    const ingredients = await db.getAllAsync<{
      ingredient_id: string;
      quantity: number;
      unit: string;
    }>("SELECT * FROM local_recipe_ingredients WHERE recipe_id = ?", [
      recipeId,
    ]);

    let totalCogs = 0;
    for (const ri of ingredients) {
      const ing = await db.getFirstAsync<{ unit_cost: number }>(
        "SELECT unit_cost FROM local_ingredients WHERE id = ?",
        [ri.ingredient_id]
      );
      if (ing) {
        totalCogs += ri.quantity * ing.unit_cost;
      }
    }

    return {
      cogs: totalCogs,
      ingredientCount: ingredients.length,
    };
  } catch {
    return { cogs: 0, ingredientCount: 0 };
  }
}

/**
 * Calculate gross profit for a recipe
 */
export function calculateGrossProfit(
  sellingPrice: number,
  cogs: number
): number {
  return sellingPrice - cogs;
}

/**
 * Calculate gross profit margin percentage
 */
export function calculateMargin(sellingPrice: number, cogs: number): number {
  if (sellingPrice <= 0) return 0;
  return ((sellingPrice - cogs) / sellingPrice) * 100;
}

/**
 * Deduct inventory when a recipe is sold (with unit conversion)
 */
export async function deductInventoryForSale(
  db: SQLiteDatabase,
  recipeId: string,
  quantity: number = 1
): Promise<{ success: boolean; error?: string; deducted: string[] }> {
  try {
    const recipeIngredients = await db.getAllAsync<{
      ingredient_id: string;
      quantity: number;
      unit: string;
    }>("SELECT * FROM local_recipe_ingredients WHERE recipe_id = ?", [
      recipeId,
    ]);

    const deducted: string[] = [];

    for (const ri of recipeIngredients) {
      // Get ingredient with its base unit
      const ing = await db.getFirstAsync<{
        id: string;
        name: string;
        base_unit: string;
        bar_qty: number;
      }>(
        "SELECT id, name, base_unit, bar_qty FROM local_ingredients WHERE id = ?",
        [ri.ingredient_id]
      );

      if (!ing) continue;

      // Calculate deduction with unit conversion
      let deductAmount = ri.quantity * quantity;

      // Unit conversion: if recipe uses different unit than inventory
      if (ri.unit.toLowerCase() !== ing.base_unit.toLowerCase()) {
        // Convert recipe unit to inventory unit
        const converted = convertRecipeToInventoryUnit(
          deductAmount,
          ri.unit,
          ing.base_unit
        );
        if (converted !== null) {
          deductAmount = converted;
        }
        // If conversion fails, use as-is (same base assumption)
      }

      await db.runAsync(
        "UPDATE local_ingredients SET bar_qty = MAX(0, bar_qty - ?) WHERE id = ?",
        [deductAmount, ri.ingredient_id]
      );

      deducted.push(
        `${ing.name}: -${deductAmount.toFixed(2)} ${ing.base_unit}`
      );
    }

    return { success: true, deducted };
  } catch (err) {
    return { success: false, error: String(err), deducted: [] };
  }
}

/**
 * Convert recipe unit to inventory unit
 * Handles: kg↔g, l↔ml
 */
function convertRecipeToInventoryUnit(
  amount: number,
  recipeUnit: string,
  inventoryUnit: string
): number | null {
  const CONVERSIONS: Record<string, Record<string, number>> = {
    g: { kg: 0.001, g: 1 },
    kg: { g: 1000, kg: 1 },
    ml: { l: 0.001, lít: 0.001, ml: 1 },
    l: { ml: 1000, l: 1 },
    lít: { ml: 1000, lít: 1, l: 1 },
  };

  const from = recipeUnit.toLowerCase().trim();
  const to = inventoryUnit.toLowerCase().trim();

  if (from === to) return amount;

  const fromTable = CONVERSIONS[from];
  if (fromTable && fromTable[to] !== undefined) {
    return amount * fromTable[to];
  }

  return null; // Incompatible units
}

/**
 * Get all recipes with their COGS calculated
 */
export async function getAllRecipesWithCOGS(db: SQLiteDatabase): Promise<
  Array<{
    id: string;
    name: string;
    price: number;
    cogs: number;
    profit: number;
    margin: number;
  }>
> {
  const recipes = await db.getAllAsync<{
    id: string;
    name: string;
    price: number;
  }>("SELECT id, name, price FROM local_recipes ORDER BY name");

  const result = [];
  for (const r of recipes) {
    const { cogs } = await calculateRecipeCOGS(db, r.id);
    const profit = calculateGrossProfit(r.price, cogs);
    const margin = calculateMargin(r.price, cogs);
    result.push({ ...r, cogs, profit, margin });
  }

  return result;
}
