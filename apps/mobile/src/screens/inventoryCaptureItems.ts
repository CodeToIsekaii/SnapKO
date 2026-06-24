export type InventoryCaptureItemIdentity = {
  clientKey?: string | null;
  linkedIngredientId?: string | null;
  ingredient_id?: string | null;
  recipeId?: string | null;
  recipe_id?: string | null;
  rawName?: string | null;
  raw_name?: string | null;
  ingredient_name?: string | null;
  originalName?: string | null;
  original_name?: string | null;
  stt?: string | number | null;
  rowIndex?: number | null;
  row_index?: number | null;
  sourcePage?: number | null;
  source_page?: number | null;
};

export function createInventoryCaptureItemKey(
  item: InventoryCaptureItemIdentity,
  fallbackIndex: number,
): string {
  if (item.clientKey) return item.clientKey;

  const name =
    item.rawName ||
    item.raw_name ||
    item.ingredient_name ||
    item.originalName ||
    item.original_name ||
    "item";
  const id = item.linkedIngredientId || item.ingredient_id || item.recipeId || item.recipe_id || "";
  const row = item.stt ?? item.rowIndex ?? item.row_index ?? fallbackIndex;
  const page = item.sourcePage ?? item.source_page ?? "";

  return [id, name, row, page, fallbackIndex]
    .map((part) => encodeURIComponent(String(part ?? "")))
    .join(":");
}

export function updateInventoryCaptureItemByKey<T extends { clientKey: string }>(
  items: T[],
  clientKey: string,
  update: Partial<T> | ((item: T) => T),
): T[] {
  return items.map((item) => {
    if (item.clientKey !== clientKey) return item;
    return typeof update === "function" ? update(item) : { ...item, ...update };
  });
}

export function removeInventoryCaptureItemByKey<T extends { clientKey: string }>(
  items: T[],
  clientKey: string,
): T[] {
  return items.filter((item) => item.clientKey !== clientKey);
}
