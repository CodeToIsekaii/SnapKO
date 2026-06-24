import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWarehousePackValue,
  getPurchasePack,
  validateWholePurchasePackQuantity,
} from "./purchase-pack";

test("getPurchasePack converts purchase quantity into ingredient base unit", () => {
  const pack = getPurchasePack({
    baseUnit: "kg",
    lastPurchasePrice: 700000,
    lastPurchaseQty: 500,
    lastPurchaseUnit: "g",
  });

  assert.deepEqual(pack, {
    baseQty: 0.5,
    baseUnit: "kg",
    price: 700000,
    purchaseQty: 500,
    purchaseUnit: "g",
  });
});

test("calculateWarehousePackValue prices whole packs from purchase pack fields", () => {
  assert.equal(
    calculateWarehousePackValue(2, {
      baseUnit: "kg",
      lastPurchasePrice: 700000,
      lastPurchaseQty: 500,
      lastPurchaseUnit: "g",
    }),
    2800000,
  );
});

test("validateWholePurchasePackQuantity rejects partial warehouse packs", () => {
  const validation = validateWholePurchasePackQuantity(2.237, {
    baseUnit: "kg",
    lastPurchasePrice: 700000,
    lastPurchaseQty: 500,
    lastPurchaseUnit: "g",
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.packCount, 4.474);
  assert.equal(validation.lowerPackCount, 4);
  assert.equal(validation.upperPackCount, 5);
  assert.equal(validation.lowerBaseQty, 2);
  assert.equal(validation.upperBaseQty, 2.5);
});

test("validateWholePurchasePackQuantity allows exact whole warehouse packs", () => {
  const validation = validateWholePurchasePackQuantity(2.5, {
    baseUnit: "kg",
    lastPurchasePrice: 700000,
    lastPurchaseQty: 500,
    lastPurchaseUnit: "g",
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.packCount, 5);
});
