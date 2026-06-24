export type InventoryModel = "SIMPLE" | "STANDARD" | "CHAIN";
export type CaptureMode = "import" | "sales" | "stock";
export type CaptureArea = "WAREHOUSE" | "BAR";

export type AuthRefreshStatus =
  | "authenticated"
  | "needs_setup"
  | "loading"
  | "pending"
  | "unauthenticated";

export function normalizeInventoryModel(value?: string | null): InventoryModel {
  const model = String(value ?? "").toUpperCase();
  if (model === "STANDARD" || model === "MODEL_B") return "STANDARD";
  if (model === "CHAIN") return "CHAIN";
  return "SIMPLE";
}

export function usesDualAreaFlow(model: InventoryModel): boolean {
  return model === "STANDARD" || model === "CHAIN";
}

export function resolveCaptureArea(
  model: InventoryModel,
  mode: CaptureMode,
  requestedArea?: CaptureArea,
): CaptureArea {
  if (requestedArea) return requestedArea;
  if (usesDualAreaFlow(model) && mode === "sales") return "BAR";
  return "WAREHOUSE";
}

export function shouldRefreshProfileAfterConfigSync(
  result: { success: boolean; inventoryModel: string | null },
  authStatus: AuthRefreshStatus
): boolean {
  return (
    result.success &&
    !!result.inventoryModel &&
    (authStatus === "authenticated" || authStatus === "needs_setup")
  );
}
