// packages/shared/src/constants/inventory-models.ts
// Inventory Model Types per .antigravityrules Section C

/**
 * Inventory Models define how a business manages stock locations
 */
export const InventoryModel = {
  /**
   * MODEL A: Single Storage
   * - Only 1 storage_area
   * - No transfers needed
   * - Import adds directly, Sales deduct directly
   */
  SIMPLE: "SIMPLE",

  /**
   * MODEL B: Warehouse + Bar (PRIORITY FOCUS)
   * - 2 storage_areas: STORAGE (Kho Tổng) + SERVICE (Quầy Bar)
   * - Enables Transfer logic
   * - Imports route to Warehouse or Bar
   * - Sales deduct from Bar only
   */
  STANDARD: "STANDARD",

  /**
   * MODEL C: Multi-Store Chain
   * - Multiple Stores, Central Kitchen
   * - Inter-store transfers allowed
   */
  CHAIN: "CHAIN",
} as const;

export type InventoryModelType =
  (typeof InventoryModel)[keyof typeof InventoryModel];

/**
 * Default model for new businesses
 */
export const DEFAULT_INVENTORY_MODEL: InventoryModelType =
  InventoryModel.STANDARD;

/**
 * Model B (STANDARD) configuration
 */
export const STANDARD_MODEL_CONFIG = {
  /**
   * Default areas created for STANDARD model
   */
  defaultAreas: [
    { name: "Kho Tổng", type: "STORAGE" as const, isDefault: true },
    { name: "Quầy Bar", type: "SERVICE" as const, isDefault: false },
  ],

  /**
   * Import destinations
   */
  importDestinations: {
    WAREHOUSE: "Kho Tổng",
    URGENT_TO_BAR: "Quầy Bar",
  },
} as const;
