export type ComparisonDirection = "up" | "down" | "flat";
export type ComparisonDataQuality = "ok" | "missing";
export type ComparisonGoodDirection = "up" | "down";

export type ComparisonMetric = {
  current: number | null;
  previous: number | null;
  changePct: number | null;
  direction: ComparisonDirection;
  goodDirection: ComparisonGoodDirection;
  dataQuality: ComparisonDataQuality;
};

export type MetricTone = "good" | "bad" | "neutral";

type NamedValue = {
  name: string;
  totalQty?: number;
  totalRevenue?: number;
  lossQty?: number;
  lossVnd?: number;
};

export type ComparisonRow = {
  name: string;
  currentValue: number;
  previousValue: number | null;
  changePct: number | null;
};

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function buildComparisonRows<T extends NamedValue>(
  current: T[],
  previous: T[],
  valueKey: keyof T,
): ComparisonRow[] {
  const previousByName = new Map(previous.map((item) => [item.name, item]));

  return current.map((item) => {
    const currentValue = Number(item[valueKey] ?? 0);
    const previousValueRaw = previousByName.get(item.name)?.[valueKey];
    const previousValue =
      previousValueRaw == null ? null : Number(previousValueRaw);
    return {
      name: item.name,
      currentValue,
      previousValue,
      changePct:
        previousValue == null || previousValue <= 0
          ? null
          : roundOne(((currentValue - previousValue) / previousValue) * 100),
    };
  });
}

export function getMetricTone(metric: ComparisonMetric): MetricTone {
  if (metric.dataQuality === "missing" || metric.direction === "flat") {
    return "neutral";
  }
  return metric.direction === metric.goodDirection ? "good" : "bad";
}

export function isMissingMonthlyComparisonEndpointError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";

  return (
    message.includes("Cannot GET /reports/monthly-comparison") ||
    message.includes("apiFetch 404: /reports/monthly-comparison")
  );
}
