import {
  normalizeInventoryModel,
  resolveCaptureArea,
  shouldRefreshProfileAfterConfigSync,
  usesDualAreaFlow,
} from "../contexts/inventoryModelState";

describe("inventory model state helpers", () => {
  it("preserves paid inventory models loaded from local profile", () => {
    expect(normalizeInventoryModel("STANDARD")).toBe("STANDARD");
    expect(normalizeInventoryModel("CHAIN")).toBe("CHAIN");
    expect(normalizeInventoryModel("MODEL_B")).toBe("STANDARD");
    expect(normalizeInventoryModel("SIMPLE")).toBe("SIMPLE");
    expect(normalizeInventoryModel(null)).toBe("SIMPLE");
  });

  it("refreshes auth profile after authenticated business config sync", () => {
    expect(
      shouldRefreshProfileAfterConfigSync(
        { success: true, inventoryModel: "STANDARD" },
        "authenticated"
      )
    ).toBe(true);

    expect(
      shouldRefreshProfileAfterConfigSync(
        { success: true, inventoryModel: "STANDARD" },
        "loading"
      )
    ).toBe(false);

    expect(
      shouldRefreshProfileAfterConfigSync(
        { success: false, inventoryModel: null },
        "authenticated"
      )
    ).toBe(false);
  });

  it("applies the same dual-area capture rules to STANDARD and CHAIN", () => {
    expect(usesDualAreaFlow("SIMPLE")).toBe(false);
    expect(usesDualAreaFlow("STANDARD")).toBe(true);
    expect(usesDualAreaFlow("CHAIN")).toBe(true);

    expect(resolveCaptureArea("STANDARD", "sales")).toBe("BAR");
    expect(resolveCaptureArea("CHAIN", "sales")).toBe("BAR");
    expect(resolveCaptureArea("STANDARD", "import")).toBe("WAREHOUSE");
    expect(resolveCaptureArea("CHAIN", "import")).toBe("WAREHOUSE");
  });

  it("preserves an explicitly selected capture area", () => {
    expect(resolveCaptureArea("CHAIN", "import", "BAR")).toBe("BAR");
    expect(resolveCaptureArea("STANDARD", "stock", "BAR")).toBe("BAR");
  });
});
