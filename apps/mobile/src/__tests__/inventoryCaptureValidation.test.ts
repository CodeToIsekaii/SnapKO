import {
  getVolumeWeightFeedback,
  parseNumericField,
} from "../screens/inventoryCaptureValidation";

describe("getVolumeWeightFeedback", () => {
  it("returns invalid feedback when gross weight is lower than tare", () => {
    expect(
      getVolumeWeightFeedback({
        baseUnit: "ml",
        inputUnit: "g",
        quantity: 20,
        tareWeight: 30,
        density: 1,
      }),
    ).toEqual({ kind: "invalid" });
  });

  it("returns converted net ml for valid volume ingredients weighed in grams", () => {
    expect(
      getVolumeWeightFeedback({
        baseUnit: "ml",
        inputUnit: "g",
        quantity: 130,
        tareWeight: 30,
        density: 1,
      }),
    ).toEqual({ kind: "converted", netMl: 100 });
  });

  it("returns null for non-volume ingredients or non-weight input", () => {
    expect(
      getVolumeWeightFeedback({
        baseUnit: "kg",
        inputUnit: "g",
        quantity: 130,
        tareWeight: 30,
        density: 1,
      }),
    ).toBeNull();

    expect(
      getVolumeWeightFeedback({
        baseUnit: "ml",
        inputUnit: "chai",
        quantity: 1,
        tareWeight: 30,
        density: 1,
      }),
    ).toBeNull();
  });
});

describe("parseNumericField", () => {
  it("parses dot and comma decimals", () => {
    expect(parseNumericField("2.5")).toBe(2.5);
    expect(parseNumericField("2,5")).toBe(2.5);
  });

  it("falls back to zero for empty or non-number text", () => {
    expect(parseNumericField("")).toBe(0);
    expect(parseNumericField("abc")).toBe(0);
  });
});
