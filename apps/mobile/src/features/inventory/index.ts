// src/features/inventory/index.ts - Barrel export
export {
  InventoryService,
  PendingLogService,
} from "./services/inventory.service";
export { useInventoryList } from "./hooks/useInventoryList";
export { useInventoryCapture } from "./hooks/useInventoryCapture";
export type {
  IngredientData,
  PendingLogData,
} from "./services/inventory.service";
