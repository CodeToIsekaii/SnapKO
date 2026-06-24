import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInventoryItemValue,
  formatWarehouseInventoryQuantity,
  isActiveInventoryRow,
} from "./inventoryValue";

test("isActiveInventoryRow excludes archived inventory rows", () => {
  assert.equal(isActiveInventoryRow({ archived: 1 }), false);
  assert.equal(isActiveInventoryRow({ archived: true }), false);
  assert.equal(isActiveInventoryRow({ archived: 0 }), true);
  assert.equal(isActiveInventoryRow({ archived: null }), true);
  assert.equal(isActiveInventoryRow({}), true);
});

test("calculateInventoryItemValue prices warehouse by whole purchase packs and bar by loose unit cost", () => {
  assert.equal(
    calculateInventoryItemValue({
      base_unit: "kg",
      warehouse_qty: 2,
      bar_qty: 0.237,
      unit_cost: 1000,
      last_purchase_price: 700000,
      last_purchase_qty: 500,
      last_purchase_unit: "g",
    }),
    2800237,
  );
});

test("formatWarehouseInventoryQuantity displays whole purchase packs", () => {
  assert.equal(
    formatWarehouseInventoryQuantity({
      base_unit: "kg",
      warehouse_qty: 2,
      last_purchase_price: 700000,
      last_purchase_qty: 500,
      last_purchase_unit: "g",
    }),
    "4 hàng nguyên (500 g/hàng)",
  );
});
