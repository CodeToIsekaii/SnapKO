import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparisonRows,
  getMetricTone,
  isMissingMonthlyComparisonEndpointError,
} from "./monthlyComparison";

test("buildComparisonRows pairs current rows with previous values by name", () => {
  assert.deepEqual(
    buildComparisonRows(
      [
        { name: "Matcha Latte", totalQty: 2, totalRevenue: 100000 },
        { name: "Cold Brew", totalQty: 1, totalRevenue: 50000 },
      ],
      [{ name: "Matcha Latte", totalQty: 1, totalRevenue: 80000 }],
      "totalRevenue",
    ),
    [
      {
        name: "Matcha Latte",
        currentValue: 100000,
        previousValue: 80000,
        changePct: 25,
      },
      {
        name: "Cold Brew",
        currentValue: 50000,
        previousValue: null,
        changePct: null,
      },
    ],
  );
});

test("getMetricTone treats shrinkage increases as bad and missing data as neutral", () => {
  assert.equal(
    getMetricTone({
      current: 20000,
      previous: 10000,
      changePct: 100,
      direction: "up",
      goodDirection: "down",
      dataQuality: "ok",
    }),
    "bad",
  );

  assert.equal(
    getMetricTone({
      current: null,
      previous: 10000,
      changePct: null,
      direction: "flat",
      goodDirection: "up",
      dataQuality: "missing",
    }),
    "neutral",
  );
});

test("isMissingMonthlyComparisonEndpointError detects stale backend route errors only", () => {
  assert.equal(
    isMissingMonthlyComparisonEndpointError(
      new Error(
        "Error invoking remote method 'reports:get': ApiFetchError: Cannot GET /reports/monthly-comparison",
      ),
    ),
    true,
  );
  assert.equal(
    isMissingMonthlyComparisonEndpointError({
      message: "Cannot GET /reports/monthly-comparison",
    }),
    true,
  );
  assert.equal(
    isMissingMonthlyComparisonEndpointError(new Error("FEATURE_LOCKED")),
    false,
  );
});
