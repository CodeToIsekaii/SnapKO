export type LossBreakdownLog = {
  id: string;
  type?: string | null;
  ingredient_id?: string | null;
  ingredientId?: string | null;
  quantity_change_base?: number | null;
  quantityChangeBase?: number | null;
  unit_cost_at_time?: number | null;
  unitCostAtTime?: number | null;
  ai_parsed_json?: unknown;
  aiParsedJson?: unknown;
};

export type LossIngredientRow = {
  id: string;
  name?: string | null;
  unit_cost?: number | null;
  unitCost?: number | null;
};

export type LossPieItem = {
  name: string;
  value: number;
  color: string;
};

export type LossLegendItem = LossPieItem & {
  percent: number;
};

const LOSS_COLORS = [
  "#E07A2F",
  "#E63946",
  "#FFC857",
  "#6B8E23",
  "#3B82F6",
  "#8B5CF6",
];

function parseJsonObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function addLoss(
  totals: Map<string, { name: string; value: number }>,
  key: string,
  name: string,
  qty: unknown,
  unitCost: unknown,
) {
  const quantity = Math.abs(toFiniteNumber(qty) ?? 0);
  const cost = toFiniteNumber(unitCost) ?? 0;
  const value = quantity * cost;

  if (quantity <= 0 || cost <= 0 || value <= 0) return;

  const existing = totals.get(key) ?? { name, value: 0 };
  existing.value += value;
  totals.set(key, existing);
}

export function buildLossBreakdown(
  logs: LossBreakdownLog[],
  ingredients: LossIngredientRow[],
): LossPieItem[] {
  const ingredientMap = new Map(
    ingredients.map((ingredient) => [
      ingredient.id,
      {
        name: ingredient.name ?? "Unknown",
        unitCost: ingredient.unit_cost ?? ingredient.unitCost ?? 0,
      },
    ]),
  );
  const totals = new Map<string, { name: string; value: number }>();

  for (const log of logs) {
    if (String(log.type ?? "").toUpperCase() !== "WASTE") continue;

    const parsed = parseJsonObject(log.ai_parsed_json ?? log.aiParsedJson);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const logUnitCost = log.unit_cost_at_time ?? log.unitCostAtTime ?? null;

    if (items.length > 0) {
      for (const item of items) {
        const ingredientId = firstText(
          item?.ingredient_id,
          item?.ingredientId,
          item?.linkedIngredientId,
          item?.linked_ingredient_id,
        );
        const ingredient = ingredientId ? ingredientMap.get(ingredientId) : null;
        const name =
          firstText(
            item?.ingredient_name,
            item?.name,
            item?.rawName,
            item?.original_name,
            ingredient?.name,
          ) ?? "Unknown";
        const key = ingredientId ?? name;
        const unitCost = logUnitCost ?? item?.unit_cost ?? ingredient?.unitCost;

        addLoss(totals, key, name, item?.quantity, unitCost);
      }
      continue;
    }

    const ingredientId = log.ingredient_id ?? log.ingredientId ?? null;
    if (!ingredientId) continue;

    const ingredient = ingredientMap.get(ingredientId);
    addLoss(
      totals,
      ingredientId,
      ingredient?.name ?? "Unknown",
      log.quantity_change_base ?? log.quantityChangeBase,
      logUnitCost ?? ingredient?.unitCost,
    );
  }

  return Array.from(totals.values())
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({
      name: item.name,
      value: Math.round(item.value),
      color: LOSS_COLORS[index % LOSS_COLORS.length],
    }));
}

export function hasLossBreakdownData(
  data: Array<{ value: number; [key: string]: unknown }>,
): boolean {
  return data.reduce((sum, item) => sum + Number(item.value || 0), 0) > 0;
}

export function buildLossLegendItems(data: LossPieItem[]): LossLegendItem[] {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (total <= 0) return [];

  return data.map((item) => ({
    ...item,
    percent: Math.round((Number(item.value || 0) / total) * 100),
  }));
}

export function dedupeLossLogs<T extends LossBreakdownLog>(logs: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const log of logs) {
    if (seen.has(log.id)) continue;
    seen.add(log.id);
    result.push(log);
  }

  return result;
}
