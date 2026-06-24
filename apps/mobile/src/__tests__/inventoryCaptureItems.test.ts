import {
  createInventoryCaptureItemKey,
  removeInventoryCaptureItemByKey,
  updateInventoryCaptureItemByKey,
} from "../screens/inventoryCaptureItems";

type TestItem = {
  clientKey: string;
  rawName: string;
  quantity: number;
  unit: string;
};

describe("inventoryCaptureItems", () => {
  it("updates only the item matching clientKey", () => {
    const unchangedBefore: TestItem = {
      clientKey: "item-1",
      rawName: "Bột Matcha",
      quantity: 5,
      unit: "kg",
    };
    const changedBefore: TestItem = {
      clientKey: "item-2",
      rawName: "Bột Cacao",
      quantity: 2,
      unit: "kg",
    };

    const next = updateInventoryCaptureItemByKey(
      [unchangedBefore, changedBefore],
      "item-2",
      { quantity: 3 },
    );

    expect(next[0]).toBe(unchangedBefore);
    expect(next[1]).not.toBe(changedBefore);
    expect(next[1]).toEqual({ ...changedBefore, quantity: 3 });
  });

  it("removes only the item matching clientKey", () => {
    const items: TestItem[] = [
      { clientKey: "item-1", rawName: "A", quantity: 1, unit: "kg" },
      { clientKey: "item-2", rawName: "B", quantity: 2, unit: "kg" },
    ];

    expect(removeInventoryCaptureItemByKey(items, "item-1")).toEqual([
      items[1],
    ]);
  });

  it("creates stable keys from source identity fields", () => {
    const key = createInventoryCaptureItemKey(
      {
        ingredient_name: "Bột Cacao",
        ingredient_id: "ing-1",
        stt: 15,
        source_page: 2,
      },
      0,
    );

    expect(key).toBe("ing-1:B%E1%BB%99t%20Cacao:15:2:0");
  });
});
