import {
  buildStockSaveConfirmation,
  validateWarehousePurchasePacks,
} from "../features/inventory/services/stockSavePolicy";

const ingredients = [
  {
    id: "matcha",
    name: "Bột Matcha",
    base_unit: "kg",
    last_purchase_price: 700000,
    last_purchase_qty: 500,
    last_purchase_unit: "g",
  },
  {
    id: "milk",
    name: "Sữa",
    base_unit: "ml",
    last_purchase_price: 40000,
    last_purchase_qty: 1000,
    last_purchase_unit: "ml",
  },
];

describe("stock save policy", () => {
  it("rejects partial purchase packs for warehouse stock checks", () => {
    const violations = validateWarehousePurchasePacks(
      [{ linkedIngredientId: "matcha", quantity: 2.237, unit: "kg" }],
      ingredients,
    );

    expect(violations).toEqual([
      expect.objectContaining({
        ingredientId: "matcha",
        name: "Bột Matcha",
        packCount: 4.474,
        lowerPackCount: 4,
        upperPackCount: 5,
      }),
    ]);
  });

  it("allows partial bar quantities because bar can hold opened stock", () => {
    const confirmation = buildStockSaveConfirmation({
      areaType: "BAR",
      checkMode: "BAR",
      items: [{ linkedIngredientId: "matcha", quantity: 0.237, unit: "kg" }],
      ingredients,
    });

    expect(confirmation.zeroedIngredientIds).toEqual([]);
    expect(confirmation.requiresConfirmation).toBe(true);
  });

  it("does not zero uncounted warehouse items in spot checks", () => {
    const confirmation = buildStockSaveConfirmation({
      areaType: "WAREHOUSE",
      checkMode: "SPOT",
      items: [{ linkedIngredientId: "matcha", quantity: 2, unit: "kg" }],
      ingredients,
    });

    expect(confirmation.zeroedIngredientIds).toEqual([]);
    expect(confirmation.requiresConfirmation).toBe(true);
  });

  it("lists uncounted warehouse items that full checks will reset", () => {
    const confirmation = buildStockSaveConfirmation({
      areaType: "WAREHOUSE",
      checkMode: "FULL",
      items: [{ linkedIngredientId: "matcha", quantity: 2, unit: "kg" }],
      ingredients,
    });

    expect(confirmation.zeroedIngredientIds).toEqual(["milk"]);
    expect(confirmation.message).toContain("1 món không nhập sẽ về 0");
  });

  it("keeps explicitly skipped full-count items out of the zero reset list", () => {
    const confirmation = buildStockSaveConfirmation({
      areaType: "WAREHOUSE",
      checkMode: "FULL",
      items: [{ linkedIngredientId: "matcha", quantity: 2, unit: "kg" }],
      ingredients,
      preservedIngredientIds: ["milk"],
    });

    expect(confirmation.zeroedIngredientIds).toEqual([]);
    expect(confirmation.message).toContain("0 món không nhập sẽ về 0");
  });
});
