import { fullCountItemActions } from "../screens/inventoryCaptureItemActions";

describe("fullCountItemActions", () => {
  it("offers preserve, set-zero, and delete choices", () => {
    expect(fullCountItemActions.map((action) => action.id)).toEqual([
      "preserve",
      "zero",
      "delete",
    ]);
  });
});
