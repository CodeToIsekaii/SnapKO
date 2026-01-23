/**
 * Unit Conversion Utilities
 * Per .antigravityrules: Shared logic for Mobile & Desktop
 *
 * Supports:
 * - Weight: g ↔ kg
 * - Volume: ml ↔ l (lít)
 * - Count: chai, lon, hộp (no auto-conversion)
 */

// =============================================
// UNIT TYPES & GROUPS
// =============================================

export const UNIT_TYPES = {
  WEIGHT: ["g", "kg"] as const,
  VOLUME: ["ml", "l", "lít"] as const,
  COUNT: [
    "cái",
    "lon",
    "chai",
    "hộp",
    "quả",
    "thùng",
    "gói",
    "hũ",
    "bịch",
    "túi",
    "cây",
    "bó",
  ] as const,
} as const;

export type WeightUnit = (typeof UNIT_TYPES.WEIGHT)[number];
export type VolumeUnit = (typeof UNIT_TYPES.VOLUME)[number];
export type CountUnit = (typeof UNIT_TYPES.COUNT)[number];
export type AnyUnit = WeightUnit | VolumeUnit | CountUnit;

// =============================================
// CONVERSION RATES (to base unit)
// =============================================

/**
 * Conversion rates to base unit:
 * - Weight base: g (gram)
 * - Volume base: ml (milliliter)
 */
export const CONVERSION_RATES: Record<string, number> = {
  // Weight (base: g)
  g: 1,
  kg: 1000,

  // Volume (base: ml)
  ml: 1,
  l: 1000,
  lít: 1000,
};

// =============================================
// CONVERSION FUNCTIONS
// =============================================

/**
 * Get the unit group (WEIGHT, VOLUME, or COUNT)
 * Uses Unicode normalization to handle Vietnamese characters
 */
export function getUnitGroup(
  unit: string,
): "WEIGHT" | "VOLUME" | "COUNT" | null {
  // Normalize and trim to handle Unicode variations
  const normalizedUnit = unit.normalize("NFC").trim().toLowerCase();

  if (
    UNIT_TYPES.WEIGHT.some(
      (u) => u.normalize("NFC").toLowerCase() === normalizedUnit,
    )
  )
    return "WEIGHT";
  if (
    UNIT_TYPES.VOLUME.some(
      (u) => u.normalize("NFC").toLowerCase() === normalizedUnit,
    )
  )
    return "VOLUME";
  if (
    UNIT_TYPES.COUNT.some(
      (u) => u.normalize("NFC").toLowerCase() === normalizedUnit,
    )
  )
    return "COUNT";
  return null;
}

/**
 * Get the base unit for a given unit
 * Weight → g, Volume → ml, Count → same unit
 */
export function getUnitBase(unit: string): string {
  const group = getUnitGroup(unit);
  if (group === "WEIGHT") return "g";
  if (group === "VOLUME") return "ml";
  return unit; // COUNT units return themselves
}

/**
 * Check if two units can be converted
 */
export function canConvert(fromUnit: string, toUnit: string): boolean {
  if (fromUnit === toUnit) return true;
  const fromGroup = getUnitGroup(fromUnit);
  const toGroup = getUnitGroup(toUnit);
  return fromGroup === toGroup && fromGroup !== "COUNT";
}

/**
 * Convert a value from one unit to another
 *
 * @example
 * convertUnit(1.5, 'kg', 'g') // 1500
 * convertUnit(500, 'ml', 'l') // 0.5
 * convertUnit(10, 'chai', 'lon') // 10 (no conversion for COUNT)
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number {
  // Same unit → no conversion
  if (fromUnit === toUnit) return value;

  // Check if conversion is possible
  if (!canConvert(fromUnit, toUnit)) {
    console.warn(
      `Cannot convert ${fromUnit} to ${toUnit} - different unit groups`,
    );
    return value;
  }

  const fromRate = CONVERSION_RATES[fromUnit];
  const toRate = CONVERSION_RATES[toUnit];

  // COUNT units or unknown units → no conversion
  if (!fromRate || !toRate) {
    return value;
  }

  // Formula: (value * fromRate) / toRate
  // Example: 1.5kg → g: (1.5 * 1000) / 1 = 1500
  return (value * fromRate) / toRate;
}

/**
 * Convert to base unit (g for weight, ml for volume)
 */
export function toBaseUnit(value: number, unit: string): number {
  const baseUnit = getUnitBase(unit);
  return convertUnit(value, unit, baseUnit);
}

/**
 * Format value with smart unit display
 * Auto-converts large values to bigger units for readability
 *
 * @example
 * formatUnitDisplay(1500, 'g') // "1.5kg"
 * formatUnitDisplay(2500, 'ml') // "2.5l"
 * formatUnitDisplay(50, 'chai') // "50 chai"
 */
export function formatUnitDisplay(value: number, unit: string): string {
  // Weight: g → kg if >= 1000g
  if (unit === "g" && value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}kg`;
  }

  // Volume: ml → l if >= 1000ml
  if (unit === "ml" && value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}l`;
  }

  // Default format
  const formatted = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2);
  return `${formatted}${unit}`;
}

/**
 * Parse unit string with value
 *
 * @example
 * parseUnitValue("1.5kg") // { value: 1.5, unit: "kg" }
 * parseUnitValue("500ml") // { value: 500, unit: "ml" }
 */
export function parseUnitValue(
  input: string,
): { value: number; unit: string } | null {
  const match = input.match(
    /^([\d.,]+)\s*([a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+)$/i,
  );
  if (!match) return null;

  const value = parseFloat(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();

  if (isNaN(value)) return null;

  return { value, unit };
}

// =============================================
// TARE & DENSITY LOGIC (F&B ACCURACY)
// =============================================

/**
 * Calculate net volume (ml) from a weighed bottle
 * @param grossWeight Weighed value on scale
 * @param inputUnit Unit from scale (g or kg)
 * @param tareWeightGram Weight of empty bottle/container in GRAMS
 * @param density Liquid density in g/ml (e.g. 1.3 for syrup)
 * @returns Volume in ML, or error code (-1 for gross < tare)
 */
export function calculateNetVolume(
  grossWeight: number,
  inputUnit: string,
  tareWeightGram: number = 0,
  density: number = 1,
): number | null {
  const normalizedUnit = inputUnit.toLowerCase();

  // 1. Only allow weight units for this calc
  if (!UNIT_TYPES.WEIGHT.includes(normalizedUnit as WeightUnit)) {
    return null;
  }

  // 2. Normalize Gross to Grams
  const grossGram = normalizedUnit === "kg" ? grossWeight * 1000 : grossWeight;

  // 3. Safety Check: Gross must be >= Tare
  if (grossGram < tareWeightGram) {
    return -1; // Special error code for UI
  }

  // 4. Net Grams = Gross - Tare
  const netGram = grossGram - tareWeightGram;

  // 5. Volume (ml) = Net Weight / Density
  // Formula: ml = g / (g/ml)
  const volumeMl = netGram / (density || 1);

  return Number(volumeMl.toFixed(2));
}

// =============================================
// INGREDIENT UNIT HELPERS
// =============================================

/**
 * Get all units for a specific type
 */
export function getUnitsForType(
  type: "WEIGHT" | "VOLUME" | "COUNT",
): readonly string[] {
  return UNIT_TYPES[type];
}

/**
 * Get all available units
 */
export function getAllUnits(): string[] {
  return [...UNIT_TYPES.WEIGHT, ...UNIT_TYPES.VOLUME, ...UNIT_TYPES.COUNT];
}

// =============================================
// CROSS-FAMILY CONVERSION (Weight ↔ Volume)
// =============================================

/**
 * Check if conversion is cross-family (Weight ↔ Volume)
 */
export function isCrossFamilyConversion(
  fromUnit: string,
  toUnit: string,
): boolean {
  const fromGroup = getUnitGroup(fromUnit);
  const toGroup = getUnitGroup(toUnit);
  return (
    (fromGroup === "WEIGHT" && toGroup === "VOLUME") ||
    (fromGroup === "VOLUME" && toGroup === "WEIGHT")
  );
}

/**
 * Convert between Weight and Volume units using density
 *
 * Formula: Density = Mass(g) / Volume(ml)
 * - Weight → Volume: V = M / Density
 * - Volume → Weight: M = V × Density
 *
 * @example
 * crossFamilyConvert(1, 'kg', 'lít', 1.03) // 0.97 (1kg milk → 0.97L)
 * crossFamilyConvert(1, 'lít', 'kg', 1.03) // 1.03 (1L milk → 1.03kg)
 */
export function crossFamilyConvert(
  value: number,
  fromUnit: string,
  toUnit: string,
  density: number,
): number | "NEED_DENSITY" | "INVALID" {
  // Validate density
  if (!density || density <= 0) {
    return "NEED_DENSITY";
  }

  // Check if it's actually cross-family
  if (!isCrossFamilyConversion(fromUnit, toUnit)) {
    return "INVALID";
  }

  const isFromWeight = UNIT_TYPES.WEIGHT.includes(fromUnit as WeightUnit);
  const isToVolume = UNIT_TYPES.VOLUME.includes(toUnit as VolumeUnit);

  // Step 1: Convert to base unit (g or ml)
  let baseValue =
    fromUnit === "kg" || fromUnit === "lít" || fromUnit === "l"
      ? value * 1000
      : value;

  // Step 2: Apply density
  let convertedBaseValue: number;

  if (isFromWeight && isToVolume) {
    // Weight → Volume: V = M / Density
    convertedBaseValue = baseValue / density;
  } else {
    // Volume → Weight: M = V × Density
    convertedBaseValue = baseValue * density;
  }

  // Step 3: Convert to target unit
  return toUnit === "kg" || toUnit === "lít" || toUnit === "l"
    ? convertedBaseValue / 1000
    : convertedBaseValue;
}

// =============================================
// BATCH RECIPE HELPERS
// =============================================

/**
 * Get available units for smart dropdown in batch recipe
 * Shows all units in same family
 */
export function getUnitFamilyOptions(baseUnit: string): string[] {
  const group = getUnitGroup(baseUnit);
  if (group === "WEIGHT") return ["g", "kg"];
  if (group === "VOLUME") return ["ml", "lít"];
  return [baseUnit]; // Custom units: return itself
}

/**
 * Convert input value to ingredient's base unit
 * Used when saving batch recipe quantities
 *
 * @example
 * convertToIngredientBase(500, 'g', 'kg') // 0.5 (500g → 0.5 in kg base)
 */
export function convertToIngredientBase(
  inputValue: number,
  inputUnit: string,
  ingredientBaseUnit: string,
  density?: number,
): number | "NEED_DENSITY" {
  // Same unit, no conversion
  if (inputUnit === ingredientBaseUnit) {
    return inputValue;
  }

  // Same family, use standard conversion
  if (canConvert(inputUnit, ingredientBaseUnit)) {
    return convertUnit(inputValue, inputUnit, ingredientBaseUnit);
  }

  // Cross-family, need density
  if (isCrossFamilyConversion(inputUnit, ingredientBaseUnit)) {
    if (!density || density <= 0) {
      return "NEED_DENSITY";
    }
    const result = crossFamilyConvert(
      inputValue,
      inputUnit,
      ingredientBaseUnit,
      density,
    );
    return typeof result === "number" ? result : "NEED_DENSITY";
  }

  // Incompatible units (e.g., kg to chai)
  return inputValue;
}

// =============================================
// COUNT TO WEIGHT/VOLUME CONVERSION
// =============================================

/**
 * Convert COUNT units (hộp, chai, lon) to WEIGHT/VOLUME using unit_weight
 *
 * Example: Ingredient has base_unit = "hộp", unit_weight = 500, unit_weight_unit = "g"
 * Recipe uses 100g → 100 / 500 = 0.2 hộp
 *
 * @param value - Value in target unit (e.g., 100)
 * @param targetUnit - Target unit (e.g., "g")
 * @param baseUnit - Ingredient's base unit (e.g., "hộp")
 * @param unitWeight - Weight/volume per 1 COUNT unit (e.g., 500)
 * @param unitWeightUnit - Unit of unitWeight (e.g., "g")
 * @returns Value in base unit, or null if conversion not possible
 */
export function convertToCountUnit(
  value: number,
  targetUnit: string,
  baseUnit: string,
  unitWeight: number | null,
  unitWeightUnit: string | null,
): number | null {
  // If same unit, no conversion needed
  if (targetUnit === baseUnit) return value;

  // If base unit is not COUNT, can't use this function
  if (getUnitGroup(baseUnit) !== "COUNT") return null;

  // If no unit_weight defined, can't convert
  if (!unitWeight || !unitWeightUnit) return null;

  // Check if target unit is compatible with unit_weight_unit
  const targetGroup = getUnitGroup(targetUnit);
  const weightGroup = getUnitGroup(unitWeightUnit);

  if (targetGroup !== weightGroup) return null;

  // Convert target to unit_weight_unit first (e.g., 1kg → 1000g)
  const normalizedValue = convertUnit(value, targetUnit, unitWeightUnit);

  // Then divide by unit_weight to get COUNT units
  return normalizedValue / unitWeight;
}

/**
 * Calculate cost for an ingredient in a recipe
 * Handles all conversion scenarios: same family, cross-family (density), and COUNT (unit_weight)
 *
 * @param recipeQty - Quantity in recipe
 * @param recipeUnit - Unit used in recipe
 * @param ingredient - Full ingredient object with base_unit, unit_cost, density, unit_weight, unit_weight_unit
 * @returns Cost in currency units
 */
export function calculateIngredientCost(
  recipeQty: number,
  recipeUnit: string,
  ingredient: {
    base_unit: string;
    unit_cost: number;
    density?: number | null;
    unit_weight?: number | null;
    unit_weight_unit?: string | null;
  },
): number {
  // Same unit - simple multiplication
  if (recipeUnit === ingredient.base_unit) {
    return recipeQty * ingredient.unit_cost;
  }

  const baseUnitGroup = getUnitGroup(ingredient.base_unit);

  // Check if base unit is COUNT (hộp, chai, lon, bịch, etc.)
  if (baseUnitGroup === "COUNT") {
    let valueToConvert = recipeQty;
    let unitToConvert = recipeUnit;
    const unitWeightUnit = ingredient.unit_weight_unit ?? null;

    // Check if recipe unit and unit_weight_unit are in different families (e.g., g vs lít)
    // If so, use density to convert first
    if (unitWeightUnit) {
      const recipeUnitGroup = getUnitGroup(recipeUnit);
      const weightUnitGroup = getUnitGroup(unitWeightUnit);

      if (
        recipeUnitGroup !== weightUnitGroup &&
        (recipeUnitGroup === "WEIGHT" || recipeUnitGroup === "VOLUME")
      ) {
        // Cross-family: need to use density to convert first
        // e.g., 10g → ?ml using density=1.3 → 10/1.3 = 7.69ml
        const density = ingredient.density || 1;

        if (recipeUnitGroup === "WEIGHT" && weightUnitGroup === "VOLUME") {
          // g → ml: divide by density (g/ml)
          const mlEquivalent = recipeQty / density;
          // Normalize: convert mlEquivalent to unit_weight_unit (e.g., ml → lít)
          valueToConvert = convertUnit(mlEquivalent, "ml", unitWeightUnit);
          unitToConvert = unitWeightUnit;
        } else if (
          recipeUnitGroup === "VOLUME" &&
          weightUnitGroup === "WEIGHT"
        ) {
          // ml → g: multiply by density
          const gEquivalent = recipeQty * density;
          // Normalize: convert gEquivalent to unit_weight_unit (e.g., g → kg)
          valueToConvert = convertUnit(gEquivalent, "g", unitWeightUnit);
          unitToConvert = unitWeightUnit;
        }
      }
    }

    // Try to convert using unit_weight
    const countQty = convertToCountUnit(
      valueToConvert,
      unitToConvert,
      ingredient.base_unit,
      ingredient.unit_weight ?? null,
      ingredient.unit_weight_unit ?? null,
    );
    if (countQty !== null) {
      return countQty * ingredient.unit_cost;
    }
    // Can't convert - return 0 or original
    return 0;
  }

  // Check for cross-family conversion (weight ↔ volume)
  if (isCrossFamilyConversion(recipeUnit, ingredient.base_unit)) {
    const result = crossFamilyConvert(
      recipeQty,
      recipeUnit,
      ingredient.base_unit,
      ingredient.density || 1,
    );
    if (typeof result === "number") {
      return result * ingredient.unit_cost;
    }
    return 0;
  }

  // Same family conversion (g ↔ kg, ml ↔ l)
  const baseQty = convertUnit(recipeQty, recipeUnit, ingredient.base_unit);
  return baseQty * ingredient.unit_cost;
}
