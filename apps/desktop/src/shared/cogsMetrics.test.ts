import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStockCheckValueSeries,
  calculateInventoryValueChange,
} from "./cogsMetrics";

test("calculateInventoryValueChange returns positive percent from the latest two snapshots", () => {
  assert.equal(
    calculateInventoryValueChange([
      { date: "2026-06-10", warehouse: 1000, bar: 500 },
      { date: "2026-06-11", warehouse: 1200, bar: 600 },
    ]),
    20,
  );
});

test("calculateInventoryValueChange returns negative percent when inventory value decreases", () => {
  assert.equal(
    calculateInventoryValueChange([
      { date: "2026-06-10", warehouse: 2000, bar: 0 },
      { date: "2026-06-11", warehouse: 1500, bar: 0 },
    ]),
    -25,
  );
});

test("calculateInventoryValueChange uses date order when snapshots are not already sorted", () => {
  assert.equal(
    calculateInventoryValueChange([
      { date: "2026-06-11", warehouse: 1500, bar: 0 },
      { date: "2026-06-10", warehouse: 1000, bar: 0 },
    ]),
    50,
  );
});

test("calculateInventoryValueChange returns zero without a valid previous value", () => {
  assert.equal(calculateInventoryValueChange([{ warehouse: 1000, bar: 0 }]), 0);
  assert.equal(
    calculateInventoryValueChange([
      { date: "2026-06-10", warehouse: 0, bar: 0 },
      { date: "2026-06-11", warehouse: 1000, bar: 0 },
    ]),
    0,
  );
});

test("buildStockCheckValueSeries uses stock full log dates instead of synthetic desktop snapshot dates", () => {
  const series = buildStockCheckValueSeries(
    [
      {
        id: "warehouse-0906",
        type: "STOCK",
        location: "WAREHOUSE",
        created_at: "2026-06-09T16:07:02.314Z",
        ai_parsed_json: {
          check_type: "FULL",
          items: [
            {
              ingredient_id: "matcha",
              quantity: 2,
              unit_cost: 1000,
            },
          ],
        },
      },
    ],
    [
      {
        id: "matcha",
        unit_cost: 1000,
        base_unit: "kg",
        last_purchase_price: 700000,
        last_purchase_qty: 500,
        last_purchase_unit: "g",
      },
    ],
  );

  assert.deepEqual(series, [
    {
      month: "09/06",
      date: "2026-06-09",
      fullDate: "09/06/2026",
      warehouse: 2800000,
      bar: 0,
    },
  ]);
});
