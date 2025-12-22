/**
 * Unit Conversions for Inventory Management
 * Normalizes units for accurate COGS calculation and inventory deduction
 */

// Base unit conversions (to smallest unit)
const UNIT_TO_BASE: Record<string, { base: string; factor: number }> = {
  // Weight
  kg: { base: "g", factor: 1000 },
  g: { base: "g", factor: 1 },
  gram: { base: "g", factor: 1 },

  // Volume
  l: { base: "ml", factor: 1000 },
  lít: { base: "ml", factor: 1000 },
  ml: { base: "ml", factor: 1 },

  // Count
  chai: { base: "chai", factor: 1 },
  lon: { base: "lon", factor: 1 },
  hộp: { base: "hộp", factor: 1 },
  gói: { base: "gói", factor: 1 },
  quả: { base: "quả", factor: 1 },
  cái: { base: "cái", factor: 1 },
};

/**
 * Normalize quantity to base unit
 * @param quantity Amount in source unit
 * @param unit Source unit (e.g., "kg", "ml")
 * @returns { value: normalized amount, baseUnit: base unit string }
 */
export function normalizeToBase(
  quantity: number,
  unit: string
): { value: number; baseUnit: string } {
  const normalized = unit.toLowerCase().trim();
  const conversion = UNIT_TO_BASE[normalized];

  if (conversion) {
    return {
      value: quantity * conversion.factor,
      baseUnit: conversion.base,
    };
  }

  // Unknown unit, return as-is
  return { value: quantity, baseUnit: unit };
}

/**
 * Convert between units
 * @param quantity Amount in source unit
 * @param fromUnit Source unit
 * @param toUnit Target unit
 * @returns Converted quantity, or null if incompatible
 */
export function convertUnits(
  quantity: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = UNIT_TO_BASE[fromUnit.toLowerCase().trim()];
  const to = UNIT_TO_BASE[toUnit.toLowerCase().trim()];

  if (!from || !to) return null;
  if (from.base !== to.base) return null; // Incompatible units (can't convert kg to ml)

  // Convert: source → base → target
  const inBase = quantity * from.factor;
  return inBase / to.factor;
}

/**
 * Check if two units are compatible (same base)
 */
export function areUnitsCompatible(unit1: string, unit2: string): boolean {
  const u1 = UNIT_TO_BASE[unit1.toLowerCase().trim()];
  const u2 = UNIT_TO_BASE[unit2.toLowerCase().trim()];

  if (!u1 || !u2) return unit1.toLowerCase() === unit2.toLowerCase();
  return u1.base === u2.base;
}

/**
 * Get base unit for a given unit
 */
export function getBaseUnit(unit: string): string {
  const conversion = UNIT_TO_BASE[unit.toLowerCase().trim()];
  return conversion?.base ?? unit;
}

/**
 * Calculate deduction amount considering unit conversion
 * @param inventoryQty Current inventory quantity
 * @param inventoryUnit Inventory unit (e.g., "kg")
 * @param recipeQty Recipe requirement
 * @param recipeUnit Recipe unit (e.g., "g")
 * @returns Amount to deduct in inventory unit, or null if incompatible
 */
export function calculateDeduction(
  inventoryQty: number,
  inventoryUnit: string,
  recipeQty: number,
  recipeUnit: string
): { deductAmount: number; newQty: number } | null {
  // If same unit, simple subtraction
  if (inventoryUnit.toLowerCase() === recipeUnit.toLowerCase()) {
    return {
      deductAmount: recipeQty,
      newQty: Math.max(0, inventoryQty - recipeQty),
    };
  }

  // Convert recipe amount to inventory unit
  const converted = convertUnits(recipeQty, recipeUnit, inventoryUnit);
  if (converted === null) return null; // Incompatible units

  return {
    deductAmount: converted,
    newQty: Math.max(0, inventoryQty - converted),
  };
}
