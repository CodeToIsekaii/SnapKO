// packages/shared/src/logic/stock-routing.ts
// Stock Routing Logic - Determines where items go based on Inventory Model
// Per .antigravityrules Section C & D

import {
  InventoryModel,
  type InventoryModelType,
} from "../constants/inventory-models";
import {
  StorageAreaType,
  AREA_BEHAVIOR,
  type StorageAreaTypeValue,
} from "../constants/storage-areas";

/**
 * Determine which area to route imported items to
 */
export function getImportDestination(
  inventoryModel: InventoryModelType,
  isUrgentToBar: boolean = false
): StorageAreaTypeValue {
  // SIMPLE model only has one area
  if (inventoryModel === InventoryModel.SIMPLE) {
    return StorageAreaType.STORAGE;
  }

  // STANDARD/CHAIN: Check user preference
  if (isUrgentToBar) {
    return StorageAreaType.SERVICE;
  }

  return AREA_BEHAVIOR.defaultImportDestination;
}

/**
 * Determine which area to deduct sales from
 */
export function getSalesDeductionArea(
  inventoryModel: InventoryModelType
): StorageAreaTypeValue {
  // SIMPLE model: deduct from the only storage
  if (inventoryModel === InventoryModel.SIMPLE) {
    return StorageAreaType.STORAGE;
  }

  // STANDARD/CHAIN: Always deduct from SERVICE (Bar)
  return AREA_BEHAVIOR.salesDeductFrom;
}

/**
 * Check if transfers are enabled for this model
 */
export function isTransferEnabled(inventoryModel: InventoryModelType): boolean {
  return inventoryModel !== InventoryModel.SIMPLE;
}

/**
 * Get stock check type for an area
 */
export function getStockCheckType(areaType: StorageAreaTypeValue): {
  isPartial: boolean;
  displayName: string;
} {
  const rules = AREA_BEHAVIOR.stockCheckRules[areaType];
  return {
    isPartial: rules.isPartialCheck,
    displayName: rules.displayName,
  };
}

/**
 * Validate if a transfer is allowed
 */
export interface TransferValidation {
  allowed: boolean;
  reason?: string;
}

export function validateTransfer(
  inventoryModel: InventoryModelType,
  fromAreaType: StorageAreaTypeValue,
  toAreaType: StorageAreaTypeValue,
  quantity: number
): TransferValidation {
  // Check if transfers are enabled
  if (!isTransferEnabled(inventoryModel)) {
    return {
      allowed: false,
      reason: "Chuyển kho không khả dụng với mô hình SIMPLE",
    };
  }

  // Quantity must be positive
  if (quantity <= 0) {
    return {
      allowed: false,
      reason: "Số lượng phải lớn hơn 0",
    };
  }

  // Cannot transfer to same area type (redundant, but good to check)
  if (fromAreaType === toAreaType) {
    return {
      allowed: false,
      reason: "Không thể chuyển sang cùng khu vực",
    };
  }

  return { allowed: true };
}

/**
 * Calculate theoretical quantity for an area
 * Used for variance checking
 */
export interface TheoreticalQuantity {
  area_id: string;
  ingredient_id: string;
  theoretical: number;
  basis: string; // Explanation of how it was calculated
}

export function explainTheoreticalBasis(
  areaType: StorageAreaTypeValue
): string {
  if (areaType === StorageAreaType.SERVICE) {
    return "Tính từ: Nhập vào + Chuyển vào - Bán ra (theo công thức)";
  }
  return "Tính từ: Nhập vào - Chuyển ra";
}
