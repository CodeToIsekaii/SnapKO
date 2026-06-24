import {
  createSingleFlight,
  normalizeMasterDataPayload,
} from "../sync/masterDataQueue";

describe("master data sync queue helpers", () => {
  it("shares one in-flight queue run across concurrent triggers", async () => {
    let release: (() => void) | undefined;
    const operation = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const run = createSingleFlight(operation);

    const first = run();
    const second = run();

    expect(operation).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    release?.();
    await Promise.all([first, second]);

    await run();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("normalizes ingredient queue payloads for the backend DTO", () => {
    expect(
      normalizeMasterDataPayload("ingredients", {
        id: "ingredient-1",
        stock_check_unit: "kg",
        shelf_life_days: 7,
        base_unit: "g",
        unit_cost: 120,
        min_threshold: 5,
        is_batch_item: false,
        updated_at: "2026-06-13T00:00:00.000Z",
      }),
    ).toEqual({
      id: "ingredient-1",
      stockCheckUnit: "kg",
      shelfLifeDays: 7,
      baseUnit: "g",
      unitCost: 120,
      minThreshold: 5,
      isBatchItem: false,
    });
  });

  it("normalizes recipe queue payloads for partial patches", () => {
    expect(
      normalizeMasterDataPayload("recipes", {
        id: "recipe-1",
        is_active: false,
        updated_at: "2026-06-13T00:00:00.000Z",
      }),
    ).toEqual({
      id: "recipe-1",
      isActive: false,
    });
  });
});
