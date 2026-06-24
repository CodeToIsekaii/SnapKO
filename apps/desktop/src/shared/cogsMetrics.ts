import {
  calculateWarehousePackValue,
  type InventoryQuantityInput,
} from "./inventoryValue";

export type InventoryValueSnapshot = {
  month?: string;
  date?: string;
  fullDate?: string;
  warehouse?: number | null;
  bar?: number | null;
};

export type StockCheckValueLog = {
  id?: string | null;
  type?: string | null;
  location?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  ai_parsed_json?: unknown;
  aiParsedJson?: unknown;
};

export type StockCheckValueIngredient = InventoryQuantityInput & {
  id: string;
};

type StockCheckValueSeriesRow = {
  month: string;
  date: string;
  fullDate: string;
  warehouse: number;
  bar: number;
};

function totalValue(snapshot: InventoryValueSnapshot): number {
  return Number(snapshot.warehouse ?? 0) + Number(snapshot.bar ?? 0);
}

function sortSnapshots(snapshots: InventoryValueSnapshot[]) {
  const allHaveDates = snapshots.every((snapshot) => Boolean(snapshot.date));
  if (!allHaveDates) return [...snapshots];

  return [...snapshots].sort(
    (a, b) =>
      new Date(a.date as string).getTime() -
      new Date(b.date as string).getTime(),
  );
}

export function calculateInventoryValueChange(
  snapshots: InventoryValueSnapshot[],
): number {
  const ordered = sortSnapshots(snapshots);
  if (ordered.length < 2) return 0;

  const current = totalValue(ordered[ordered.length - 1]);
  const previous = totalValue(ordered[ordered.length - 2]);

  if (previous <= 0) return 0;
  return ((current - previous) / previous) * 100;
}

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

function formatFullDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeType(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function getItemIngredientId(item: any): string | null {
  return (
    item?.ingredient_id ??
    item?.linkedIngredientId ??
    item?.linked_ingredient_id ??
    null
  );
}

function getItemQuantity(item: any): number {
  const qty = Number(item?.quantity ?? item?.stock_qty ?? 0);
  return Number.isFinite(qty) ? qty : 0;
}

function getItemUnitCost(
  item: any,
  ingredient: StockCheckValueIngredient | undefined,
): number {
  const cost = Number(item?.unit_cost ?? item?.unitCost ?? ingredient?.unit_cost ?? 0);
  return Number.isFinite(cost) ? cost : 0;
}

function calculateStockItemValue(
  item: any,
  ingredient: StockCheckValueIngredient | undefined,
  location: "WAREHOUSE" | "BAR",
): number {
  const quantity = getItemQuantity(item);
  const unitCost = getItemUnitCost(item, ingredient);

  if (location === "BAR") {
    return quantity * unitCost;
  }

  return (
    calculateWarehousePackValue(quantity, ingredient ?? {}) ??
    quantity * unitCost
  );
}

export function buildStockCheckValueSeries(
  logs: StockCheckValueLog[],
  ingredients: StockCheckValueIngredient[],
  limit = 6,
): StockCheckValueSeriesRow[] {
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const byDate = new Map<string, StockCheckValueSeriesRow>();

  for (const log of logs) {
    if (normalizeType(log.type) !== "STOCK") continue;

    const json = parseJson(log.aiParsedJson ?? log.ai_parsed_json);
    const location = normalizeType(log.location ?? json?.location);
    const checkType = normalizeType(json?.check_type ?? json?.checkType);
    const isBarCheck = location === "BAR" || checkType === "BAR";
    const isWarehouseFull = location !== "BAR" && checkType === "FULL";
    if (!isBarCheck && !isWarehouseFull) continue;

    const date = toDateKey(log.createdAt ?? log.created_at);
    if (!date || !Array.isArray(json?.items)) continue;

    const row =
      byDate.get(date) ??
      ({
        month: formatShortDate(date),
        date,
        fullDate: formatFullDate(date),
        warehouse: 0,
        bar: 0,
      } satisfies StockCheckValueSeriesRow);

    for (const item of json.items) {
      const ingredient = ingredientById.get(getItemIngredientId(item) ?? "");
      const value = calculateStockItemValue(
        item,
        ingredient,
        isBarCheck ? "BAR" : "WAREHOUSE",
      );
      if (isBarCheck) {
        row.bar += value;
      } else {
        row.warehouse += value;
      }
    }

    byDate.set(date, row);
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);
}
