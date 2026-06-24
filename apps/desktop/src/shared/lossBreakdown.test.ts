import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLossBreakdown,
  buildLossLegendItems,
  dedupeLossLogs,
  hasLossBreakdownData,
} from "./lossBreakdown";

test("buildLossBreakdown calculates normalized WASTE log value", () => {
  const result = buildLossBreakdown(
    [
      {
        id: "log-1",
        type: "WASTE",
        ingredient_id: "ing-matcha",
        quantity_change_base: -2.5,
        unit_cost_at_time: 100000,
      },
    ],
    [{ id: "ing-matcha", name: "Bột Matcha", unit_cost: 90000 }],
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Bột Matcha");
  assert.equal(result[0].value, 250000);
  assert.equal(typeof result[0].color, "string");
});

test("buildLossBreakdown calculates batch WASTE item values with cost fallback", () => {
  const result = buildLossBreakdown(
    [
      {
        id: "log-1",
        type: "WASTE",
        ai_parsed_json: JSON.stringify({
          items: [
            {
              ingredient_id: "ing-foam",
              ingredient_name: "Foam Matcha",
              quantity: 3,
              unit_cost: 12000,
            },
            {
              ingredient_id: "ing-sugar",
              ingredient_name: "Đường",
              quantity: 2,
            },
          ],
        }),
      },
    ],
    [
      { id: "ing-foam", name: "Foam Matcha", unit_cost: 10000 },
      { id: "ing-sugar", name: "Đường Dalgona", unit_cost: 5000 },
    ],
  );

  assert.deepEqual(
    result.map((item) => ({ name: item.name, value: item.value })),
    [
      { name: "Foam Matcha", value: 36000 },
      { name: "Đường", value: 10000 },
    ],
  );
});

test("buildLossBreakdown skips zero quantity or zero cost rows", () => {
  const result = buildLossBreakdown(
    [
      {
        id: "log-zero-qty",
        type: "WASTE",
        ingredient_id: "ing-zero",
        quantity_change_base: 0,
        unit_cost_at_time: 10000,
      },
      {
        id: "log-zero-cost",
        type: "WASTE",
        ai_parsed_json: {
          items: [
            {
              ingredient_id: "ing-zero",
              ingredient_name: "Không tính",
              quantity: 4,
              unit_cost: 0,
            },
          ],
        },
      },
    ],
    [{ id: "ing-zero", name: "Không tính", unit_cost: 0 }],
  );

  assert.deepEqual(result, []);
});

test("hasLossBreakdownData treats rounded real values as data", () => {
  assert.equal(
    hasLossBreakdownData([{ name: "Bột Matcha", value: 500000, color: "#E07A2F" }]),
    true,
  );
  assert.equal(
    hasLossBreakdownData([{ name: "Không tính", value: 0, color: "#E07A2F" }]),
    false,
  );
});

test("buildLossLegendItems calculates compact percentages for a separate legend", () => {
  assert.deepEqual(
    buildLossLegendItems([
      { name: "Hao hụt", value: 500000, color: "#E07A2F" },
      { name: "Hỏng", value: 300000, color: "#E63946" },
      { name: "Mất", value: 100000, color: "#FFC857" },
    ]),
    [
      { name: "Hao hụt", value: 500000, color: "#E07A2F", percent: 56 },
      { name: "Hỏng", value: 300000, color: "#E63946", percent: 33 },
      { name: "Mất", value: 100000, color: "#FFC857", percent: 11 },
    ],
  );
});

test("dedupeLossLogs keeps one copy of the same persisted log id", () => {
  assert.deepEqual(
    dedupeLossLogs([
      { id: "same-log", type: "WASTE", quantity_change_base: -1 },
      { id: "same-log", type: "WASTE", quantity_change_base: -2 },
      { id: "other-log", type: "WASTE", quantity_change_base: -3 },
    ]).map((log) => ({
      id: log.id,
      quantity_change_base: log.quantity_change_base,
    })),
    [
      { id: "same-log", quantity_change_base: -1 },
      { id: "other-log", quantity_change_base: -3 },
    ],
  );
});
