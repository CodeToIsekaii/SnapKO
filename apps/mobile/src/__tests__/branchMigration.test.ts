import {
  buildMigrationOutlets,
  moveAreaToNextOutlet,
} from "../screens/branchMigration";

describe("branch migration helpers", () => {
  it("keeps Kho and Bar from the same legacy branch in one outlet", () => {
    const result = buildMigrationOutlets([
      {
        id: "branch-1",
        migrationKey: "default-outlet",
        name: "Chi nhánh mặc định",
        code: "OUTLET-1",
        type: "OUTLET",
        isActive: true,
        storageAreas: [
          { id: "area-kho", name: "Kho" },
          { id: "area-bar", name: "Bar" },
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].storageAreaIds).toEqual(["area-kho", "area-bar"]);
    expect(result[1].storageAreaIds).toEqual([]);
  });

  it("moves one storage area to the next outlet without duplicating it", () => {
    const result = moveAreaToNextOutlet(
      [
        {
          migrationKey: "outlet-1",
          name: "Outlet 1",
          code: "OUTLET-1",
          storageAreaIds: ["area-kho", "area-bar"],
        },
        {
          migrationKey: "outlet-2",
          name: "Outlet 2",
          code: "OUTLET-2",
          storageAreaIds: [],
        },
      ],
      "area-bar",
    );

    expect(result[0].storageAreaIds).toEqual(["area-kho"]);
    expect(result[1].storageAreaIds).toEqual(["area-bar"]);
  });
});

