type InventoryQuantityInput = {
  base_unit?: string | null;
  stock_check_unit?: string | null;
  warehouse_qty?: number | null;
  bar_qty?: number | null;
  unit_cost?: number | null;
  density?: number | null;
  unit_weight?: number | null;
  unit_weight_unit?: string | null;
};

const WEIGHT_UNITS = new Set(["mg", "g", "kg"]);
const VOLUME_UNITS = new Set(["ml", "l", "lit", "liter", "litre", "lít"]);
const COUNT_UNITS = new Set([
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
]);

const FACTOR_TO_BASE: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  lit: 1000,
  liter: 1000,
  litre: 1000,
  "lít": 1000,
};

type UnitGroup = "weight" | "volume" | "count";

function toFiniteNumber(value: number | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? "").normalize("NFC").trim().toLowerCase();
}

function getUnitGroup(unit: string): UnitGroup | null {
  if (WEIGHT_UNITS.has(unit)) return "weight";
  if (VOLUME_UNITS.has(unit)) return "volume";
  if (COUNT_UNITS.has(unit)) return "count";
  return null;
}

function sameGroupConvert(value: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return value;

  const fromGroup = getUnitGroup(fromUnit);
  const toGroup = getUnitGroup(toUnit);
  if (!fromGroup || fromGroup !== toGroup || fromGroup === "count") {
    return null;
  }

  const fromFactor = FACTOR_TO_BASE[fromUnit];
  const toFactor = FACTOR_TO_BASE[toUnit];
  if (!fromFactor || !toFactor) return null;

  return (value * fromFactor) / toFactor;
}

function convertCrossFamily(
  value: number,
  fromUnit: string,
  toUnit: string,
  density: number,
): number | null {
  const fromGroup = getUnitGroup(fromUnit);
  const toGroup = getUnitGroup(toUnit);
  if (!fromGroup || !toGroup || !density || density <= 0) return null;

  if (fromGroup === "weight" && toGroup === "volume") {
    const grams = value * (FACTOR_TO_BASE[fromUnit] ?? 1);
    const milliliters = grams / density;
    return milliliters / (FACTOR_TO_BASE[toUnit] ?? 1);
  }

  if (fromGroup === "volume" && toGroup === "weight") {
    const milliliters = value * (FACTOR_TO_BASE[fromUnit] ?? 1);
    const grams = milliliters * density;
    return grams / (FACTOR_TO_BASE[toUnit] ?? 1);
  }

  return null;
}

function convertWithUnitWeight(
  value: number,
  fromUnit: string,
  toUnit: string,
  item: InventoryQuantityInput,
): number | null {
  const unitWeight = toFiniteNumber(item.unit_weight);
  const unitWeightUnit = normalizeUnit(item.unit_weight_unit) || "g";
  if (!unitWeight || unitWeight <= 0) return null;

  const fromGroup = getUnitGroup(fromUnit);
  const toGroup = getUnitGroup(toUnit);
  const unitWeightGroup = getUnitGroup(unitWeightUnit);
  if (!fromGroup || !toGroup || !unitWeightGroup || unitWeightGroup === "count") {
    return null;
  }

  if (fromGroup === "count" && toGroup !== "count") {
    const amountInUnitWeightUnit = value * unitWeight;
    return convertInventoryQuantity(
      amountInUnitWeightUnit,
      unitWeightUnit,
      toUnit,
      item,
    );
  }

  if (toGroup === "count" && fromGroup !== "count") {
    const comparable = convertInventoryQuantity(value, fromUnit, unitWeightUnit, item);
    return comparable / unitWeight;
  }

  return null;
}

export function convertInventoryQuantity(
  value: number,
  fromUnitRaw: string | null | undefined,
  toUnitRaw: string | null | undefined,
  item: InventoryQuantityInput = {},
): number {
  const fromUnit = normalizeUnit(fromUnitRaw);
  const toUnit = normalizeUnit(toUnitRaw);
  if (!fromUnit || !toUnit || fromUnit === toUnit) return value;

  const sameGroup = sameGroupConvert(value, fromUnit, toUnit);
  if (sameGroup !== null) return sameGroup;

  const density = toFiniteNumber(item.density);
  const crossFamily = convertCrossFamily(value, fromUnit, toUnit, density);
  if (crossFamily !== null) return crossFamily;

  const unitWeight = convertWithUnitWeight(value, fromUnit, toUnit, item);
  if (unitWeight !== null && Number.isFinite(unitWeight)) return unitWeight;

  return value;
}

export function getInventoryQuantitiesInBase(item: InventoryQuantityInput) {
  const warehouseQtyInBase = toFiniteNumber(item.warehouse_qty);
  const barQtyInBase = toFiniteNumber(item.bar_qty);

  return {
    warehouseQtyInBase,
    barQtyInBase,
    totalQtyInBase: warehouseQtyInBase + barQtyInBase,
  };
}

export function calculateInventoryItemValue(item: InventoryQuantityInput): number {
  const { totalQtyInBase } = getInventoryQuantitiesInBase(item);
  return totalQtyInBase * toFiniteNumber(item.unit_cost);
}

export function getInventoryDisplayUnits(item: InventoryQuantityInput) {
  return {
    warehouseUnit: item.base_unit || "",
    barUnit: item.stock_check_unit || item.base_unit || "",
  };
}

export function getInventoryDisplayQuantities(item: InventoryQuantityInput) {
  const baseUnit = item.base_unit || "";
  const { warehouseUnit, barUnit } = getInventoryDisplayUnits(item);
  const warehouseQty = toFiniteNumber(item.warehouse_qty);
  const barQty = toFiniteNumber(item.bar_qty);

  return {
    warehouseQty: convertInventoryQuantity(warehouseQty, baseUnit, warehouseUnit, item),
    barQty: convertInventoryQuantity(barQty, baseUnit, barUnit, item),
  };
}

function formatNumber(value: number, maximumFractionDigits = 3): string {
  return value.toLocaleString("vi-VN", {
    maximumFractionDigits,
  });
}

export function formatInventoryQuantity(
  value: number,
  unit: string,
  item: InventoryQuantityInput = {},
): string {
  const normalizedUnit = normalizeUnit(unit);
  const unitGroup = getUnitGroup(normalizedUnit);
  const unitWeight = toFiniteNumber(item.unit_weight);
  const unitWeightUnit = item.unit_weight_unit || "g";

  if (unitGroup === "count" && unitWeight > 0) {
    const wholeUnits = Math.trunc(value);
    const remainderInCountUnit = value - wholeUnits;
    const remainder = convertInventoryQuantity(
      remainderInCountUnit,
      unit,
      unitWeightUnit,
      {
        ...item,
        base_unit: unit,
      },
    );
    const roundedRemainder = Math.round((remainder + Number.EPSILON) * 1000) / 1000;

    if (wholeUnits > 0 && roundedRemainder > 0) {
      return `${formatNumber(wholeUnits, 0)} ${unit} ${formatNumber(
        roundedRemainder,
      )} ${unitWeightUnit}`;
    }
    if (wholeUnits > 0) {
      return `${formatNumber(wholeUnits, 0)} ${unit}`;
    }
    if (roundedRemainder > 0) {
      return `${formatNumber(roundedRemainder)} ${unitWeightUnit}`;
    }
  }

  const formatted = formatNumber(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
