import { convertToIngredientBase } from "./units";

export type PurchasePackInput = {
  baseUnit?: string | null;
  base_unit?: string | null;
  density?: number | null;
  unitWeight?: number | null;
  unit_weight?: number | null;
  unitWeightUnit?: string | null;
  unit_weight_unit?: string | null;
  lastPurchasePrice?: number | null;
  last_purchase_price?: number | null;
  lastPurchaseQty?: number | null;
  last_purchase_qty?: number | null;
  lastPurchaseUnit?: string | null;
  last_purchase_unit?: string | null;
};

export type PurchasePack = {
  baseQty: number;
  baseUnit: string;
  price: number;
  purchaseQty: number;
  purchaseUnit: string;
};

export type WholePackValidation = {
  valid: boolean;
  pack: PurchasePack | null;
  packCount: number | null;
  lowerPackCount: number | null;
  upperPackCount: number | null;
  lowerBaseQty: number | null;
  upperBaseQty: number | null;
};

const WHOLE_PACK_TOLERANCE = 1e-6;

function toFiniteNumber(value: number | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function getPurchasePack(input: PurchasePackInput): PurchasePack | null {
  const baseUnit = (input.baseUnit ?? input.base_unit ?? "").trim();
  const purchaseUnit = (
    input.lastPurchaseUnit ??
    input.last_purchase_unit ??
    baseUnit
  ).trim();
  const price = toFiniteNumber(
    input.lastPurchasePrice ?? input.last_purchase_price,
  );
  const purchaseQty = toFiniteNumber(
    input.lastPurchaseQty ?? input.last_purchase_qty,
  );

  if (!baseUnit || !purchaseUnit || price <= 0 || purchaseQty <= 0) {
    return null;
  }

  const converted = convertToIngredientBase(
    purchaseQty,
    purchaseUnit,
    baseUnit,
    input.density,
    input.unitWeight ?? input.unit_weight,
    input.unitWeightUnit ?? input.unit_weight_unit,
  );

  if (typeof converted !== "number" || !Number.isFinite(converted) || converted <= 0) {
    return null;
  }

  return {
    baseQty: roundQuantity(converted),
    baseUnit,
    price,
    purchaseQty,
    purchaseUnit,
  };
}

export function getPurchasePackCount(
  quantityInBase: number,
  input: PurchasePackInput,
): number | null {
  const pack = getPurchasePack(input);
  if (!pack) return null;
  return roundQuantity(toFiniteNumber(quantityInBase) / pack.baseQty);
}

export function calculateWarehousePackValue(
  quantityInBase: number,
  input: PurchasePackInput,
): number | null {
  const pack = getPurchasePack(input);
  if (!pack) return null;
  return getPurchasePackCount(quantityInBase, input)! * pack.price;
}

export function validateWholePurchasePackQuantity(
  quantityInBase: number,
  input: PurchasePackInput,
): WholePackValidation {
  const pack = getPurchasePack(input);
  if (!pack) {
    return {
      valid: true,
      pack: null,
      packCount: null,
      lowerPackCount: null,
      upperPackCount: null,
      lowerBaseQty: null,
      upperBaseQty: null,
    };
  }

  const packCount = roundQuantity(toFiniteNumber(quantityInBase) / pack.baseQty);
  const nearestPackCount = Math.round(packCount);
  const valid = Math.abs(packCount - nearestPackCount) <= WHOLE_PACK_TOLERANCE;
  const lowerPackCount = Math.floor(packCount);
  const upperPackCount = Math.ceil(packCount);

  return {
    valid,
    pack,
    packCount,
    lowerPackCount,
    upperPackCount,
    lowerBaseQty: roundQuantity(lowerPackCount * pack.baseQty),
    upperBaseQty: roundQuantity(upperPackCount * pack.baseQty),
  };
}
