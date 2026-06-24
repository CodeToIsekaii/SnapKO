export type MigrationStorageArea = {
  id: string;
  name: string;
};

export type MigrationBranch = {
  id: string;
  migrationKey?: string | null;
  name: string;
  code?: string | null;
  type: "CENTRAL_WAREHOUSE" | "OUTLET";
  isActive: boolean;
  storageAreas?: MigrationStorageArea[];
};

export type MigrationOutlet = {
  migrationKey: string;
  name: string;
  code: string;
  storageAreaIds: string[];
};

export function buildMigrationOutlets(branches: MigrationBranch[]): MigrationOutlet[] {
  const outlets = branches
    .filter((branch) => branch.type === "OUTLET" && branch.isActive)
    .map((branch, index) => ({
      migrationKey: branch.migrationKey || `legacy-outlet-${branch.id}`,
      name: branch.name || `Outlet ${index + 1}`,
      code: branch.code || `OUTLET-${index + 1}`,
      storageAreaIds: (branch.storageAreas ?? []).map((area) => area.id),
    }));

  while (outlets.length < 2) {
    const index = outlets.length + 1;
    outlets.push({
      migrationKey: `new-outlet-${index}`,
      name: `Outlet ${index}`,
      code: `OUTLET-${index}`,
      storageAreaIds: [],
    });
  }
  return outlets;
}

export function moveAreaToNextOutlet(
  outlets: MigrationOutlet[],
  areaId: string,
): MigrationOutlet[] {
  if (outlets.length < 2) return outlets;
  const currentIndex = outlets.findIndex((outlet) => outlet.storageAreaIds.includes(areaId));
  if (currentIndex < 0) return outlets;
  const nextIndex = (currentIndex + 1) % outlets.length;

  return outlets.map((outlet, index) => ({
    ...outlet,
    storageAreaIds: outlet.storageAreaIds
      .filter((id) => id !== areaId)
      .concat(index === nextIndex ? areaId : []),
  }));
}

