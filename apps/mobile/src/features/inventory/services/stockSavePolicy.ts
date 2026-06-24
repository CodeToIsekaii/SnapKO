import {
  type PurchasePackInput,
  validateWholePurchasePackQuantity,
} from "@snapko/shared";

export type StockAreaType = "WAREHOUSE" | "BAR";
export type StockCheckMode = "FULL" | "SPOT" | "BAR" | undefined;

export type StockSaveItem = {
  linkedIngredientId?: string | null;
  quantity: number;
  unit?: string | null;
};

export type StockSaveIngredient = PurchasePackInput & {
  id: string;
  name: string;
  archived?: boolean | number | null;
};

export type WarehousePackViolation = {
  ingredientId: string;
  name: string;
  quantity: number;
  unit?: string | null;
  packCount: number;
  lowerPackCount: number;
  upperPackCount: number;
  lowerBaseQty: number;
  upperBaseQty: number;
  packQty: number;
  packUnit: string;
};

export type StockSaveConfirmation = {
  requiresConfirmation: boolean;
  title: string;
  message: string;
  zeroedIngredientIds: string[];
};

function isActiveIngredient(ingredient: StockSaveIngredient): boolean {
  return ingredient.archived !== true && ingredient.archived !== 1;
}

function ingredientMap(ingredients: StockSaveIngredient[]) {
  return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
}

export function validateWarehousePurchasePacks(
  items: StockSaveItem[],
  ingredients: StockSaveIngredient[],
): WarehousePackViolation[] {
  const byId = ingredientMap(ingredients);

  return items.flatMap((item) => {
    if (!item.linkedIngredientId) return [];
    const ingredient = byId.get(item.linkedIngredientId);
    if (!ingredient || !isActiveIngredient(ingredient)) return [];

    const validation = validateWholePurchasePackQuantity(
      item.quantity,
      ingredient,
    );
    if (validation.valid || !validation.pack || validation.packCount === null) {
      return [];
    }

    return [
      {
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: item.quantity,
        unit: item.unit,
        packCount: validation.packCount,
        lowerPackCount: validation.lowerPackCount ?? 0,
        upperPackCount: validation.upperPackCount ?? 0,
        lowerBaseQty: validation.lowerBaseQty ?? 0,
        upperBaseQty: validation.upperBaseQty ?? 0,
        packQty: validation.pack.purchaseQty,
        packUnit: validation.pack.purchaseUnit,
      },
    ];
  });
}

export function getFullWarehouseZeroedIngredientIds(
  items: StockSaveItem[],
  ingredients: StockSaveIngredient[],
  preservedIngredientIds: string[] = [],
): string[] {
  const countedIds = new Set(
    items
      .map((item) => item.linkedIngredientId)
      .filter((id): id is string => Boolean(id)),
  );
  const preservedIds = new Set(preservedIngredientIds);

  return ingredients
    .filter(isActiveIngredient)
    .filter((ingredient) => !countedIds.has(ingredient.id))
    .filter((ingredient) => !preservedIds.has(ingredient.id))
    .map((ingredient) => ingredient.id);
}

export function buildStockSaveConfirmation(params: {
  areaType: StockAreaType;
  checkMode: StockCheckMode;
  items: StockSaveItem[];
  ingredients: StockSaveIngredient[];
  preservedIngredientIds?: string[];
}): StockSaveConfirmation {
  const isWarehouseFull =
    params.areaType === "WAREHOUSE" && params.checkMode === "FULL";
  const zeroedIngredientIds = isWarehouseFull
    ? getFullWarehouseZeroedIngredientIds(
        params.items,
        params.ingredients,
        params.preservedIngredientIds,
      )
    : [];

  if (isWarehouseFull) {
    return {
      requiresConfirmation: true,
      title: "Xác nhận kiểm toàn phần Kho Tổng",
      message:
        `Bạn đã nhập ${params.items.length} món. ` +
        `${zeroedIngredientIds.length} món không nhập sẽ về 0. ` +
        "Chỉ tiếp tục nếu đã kiểm hết Kho Tổng.",
      zeroedIngredientIds,
    };
  }

  if (params.areaType === "WAREHOUSE") {
    return {
      requiresConfirmation: true,
      title: "Xác nhận kiểm một phần Kho Tổng",
      message:
        `Bạn sắp lưu ${params.items.length} món đã kiểm. ` +
        "Các món không nhập sẽ được giữ nguyên.",
      zeroedIngredientIds,
    };
  }

  return {
    requiresConfirmation: true,
    title: "Xác nhận kiểm Quầy Bar",
    message:
      `Bạn sắp lưu ${params.items.length} món đã kiểm ở Quầy Bar. ` +
      "Các món không nhập sẽ được giữ nguyên.",
    zeroedIngredientIds,
  };
}
