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
  COUNT: ["cái", "lon", "chai", "hộp", "quả", "thùng", "gói"] as const,
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
 */
export function getUnitGroup(
  unit: string
): "WEIGHT" | "VOLUME" | "COUNT" | null {
  if (UNIT_TYPES.WEIGHT.includes(unit as WeightUnit)) return "WEIGHT";
  if (UNIT_TYPES.VOLUME.includes(unit as VolumeUnit)) return "VOLUME";
  if (UNIT_TYPES.COUNT.includes(unit as CountUnit)) return "COUNT";
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
  toUnit: string
): number {
  // Same unit → no conversion
  if (fromUnit === toUnit) return value;

  // Check if conversion is possible
  if (!canConvert(fromUnit, toUnit)) {
    console.warn(
      `Cannot convert ${fromUnit} to ${toUnit} - different unit groups`
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
  input: string
): { value: number; unit: string } | null {
  const match = input.match(
    /^([\d.,]+)\s*([a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]+)$/i
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
  density: number = 1
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
  type: "WEIGHT" | "VOLUME" | "COUNT"
): readonly string[] {
  return UNIT_TYPES[type];
}

/**
 * Get all available units
 */
export function getAllUnits(): string[] {
  return [...UNIT_TYPES.WEIGHT, ...UNIT_TYPES.VOLUME, ...UNIT_TYPES.COUNT];
}
