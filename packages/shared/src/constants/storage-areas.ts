// packages/shared/src/constants/storage-areas.ts
// Storage Area Types per .antigravityrules Section C

/**
 * Storage Area Types
 */
export const StorageAreaType = {
  /**
   * STORAGE: Main warehouse, receiving dock, central storage
   * - Receives imports by default
   * - Source for transfers to SERVICE
   */
  STORAGE: "STORAGE",

  /**
   * SERVICE: Bar, kitchen prep line, service counter
   * - Where sales deductions happen
   * - Receives transfers from STORAGE
   */
  SERVICE: "SERVICE",
} as const;

export type StorageAreaTypeValue =
  (typeof StorageAreaType)[keyof typeof StorageAreaType];

/**
 * Default names for Vietnamese F&B
 */
export const DEFAULT_AREA_NAMES: Record<StorageAreaTypeValue, string> = {
  STORAGE: "Kho Tổng",
  SERVICE: "Quầy Bar",
};

/**
 * Area-specific behavior rules
 */
export const AREA_BEHAVIOR = {
  /**
   * Which area receives imports by default
   */
  defaultImportDestination: StorageAreaType.STORAGE,

  /**
   * Which area sales are deducted from
   */
  salesDeductFrom: StorageAreaType.SERVICE,

  /**
   * Stock check behaviors per area type
   */
  stockCheckRules: {
    [StorageAreaType.STORAGE]: {
      /**
       * Warehouse uses PARTIAL check
       * Items not in photo remain unchanged
       */
      isPartialCheck: true,
      displayName: "Kiểm kho (Kho Tổng)",
    },
    [StorageAreaType.SERVICE]: {
      /**
       * Bar uses FULL check
       * Missing items trigger warning
       */
      isPartialCheck: false,
      displayName: "Kiểm quầy (Quầy Bar)",
    },
  },
} as const;
