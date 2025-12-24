// packages/shared/src/logic/fraud.ts
// Fraud Detection Thresholds and Logic
// Per .antigravityrules Section D (Anti-Fraud & Gatekeeper Logic)

import { VarianceReason } from "../schemas/inventory";

// =============================================
// CONFIGURABLE THRESHOLDS
// =============================================

export const FRAUD_THRESHOLDS = {
  /**
   * High Variance "Shock" Alert Threshold
   * If |Actual - Theoretical| > this percentage, block submission
   */
  HIGH_VARIANCE_PERCENTAGE: 15, // 15% default, configurable per business

  /**
   * Minimum threshold for low-value items
   * Don't trigger alerts for items worth less than this
   */
  MIN_VALUE_FOR_ALERT: 50000, // 50,000 VND

  /**
   * "Perfect Match" Suspicious Threshold
   * Flag if variance == 0 for more than N consecutive logs
   * (Only for measurement units: g, ml, kg)
   */
  PERFECT_MATCH_CONSECUTIVE_LIMIT: 3,

  /**
   * Risk level thresholds (percentage variance)
   */
  RISK_LEVELS: {
    low: 15, // 15-25%
    medium: 25, // 25-40%
    high: 40, // 40-60%
    critical: 60, // >60%
  },
} as const;

// =============================================
// MEASUREMENT UNITS THAT REQUIRE STRICT VALIDATION
// =============================================

export const STRICT_MEASUREMENT_UNITS = [
  "g",
  "gram",
  "gam",
  "kg",
  "kilogram",
  "ml",
  "milliliter",
  "l",
  "liter",
  "lít",
];

// =============================================
// VARIANCE ANALYSIS FUNCTIONS
// =============================================

export interface VarianceAnalysis {
  variance: number;
  variancePercentage: number;
  isHighVariance: boolean;
  riskLevel: "low" | "medium" | "high" | "critical" | "normal";
  requiresEvidence: boolean;
  requiresReason: boolean;
  isSuspiciouslyPerfect: boolean;
}

/**
 * Analyze variance between theoretical and actual quantity
 */
export function analyzeVariance(
  theoreticalQty: number,
  actualQty: number,
  unit: string,
  itemValue: number
): VarianceAnalysis {
  const variance = actualQty - theoreticalQty;
  const variancePercentage =
    theoreticalQty > 0 ? Math.abs((variance / theoreticalQty) * 100) : 0;

  // Check if high variance
  const isHighVariance =
    variancePercentage > FRAUD_THRESHOLDS.HIGH_VARIANCE_PERCENTAGE;

  // Determine risk level
  let riskLevel: VarianceAnalysis["riskLevel"] = "normal";
  if (variancePercentage > FRAUD_THRESHOLDS.RISK_LEVELS.critical) {
    riskLevel = "critical";
  } else if (variancePercentage > FRAUD_THRESHOLDS.RISK_LEVELS.high) {
    riskLevel = "high";
  } else if (variancePercentage > FRAUD_THRESHOLDS.RISK_LEVELS.medium) {
    riskLevel = "medium";
  } else if (variancePercentage > FRAUD_THRESHOLDS.RISK_LEVELS.low) {
    riskLevel = "low";
  }

  // Check if item is worth tracking
  const isValueSignificant = itemValue >= FRAUD_THRESHOLDS.MIN_VALUE_FOR_ALERT;

  // Check for suspiciously perfect match (0% variance)
  const isStrictUnit = STRICT_MEASUREMENT_UNITS.includes(unit.toLowerCase());
  const isSuspiciouslyPerfect = variancePercentage === 0 && isStrictUnit;

  return {
    variance,
    variancePercentage: Math.round(variancePercentage * 100) / 100,
    isHighVariance: isHighVariance && isValueSignificant,
    riskLevel,
    requiresEvidence: isHighVariance && isValueSignificant,
    requiresReason: isHighVariance && isValueSignificant,
    isSuspiciouslyPerfect,
  };
}

/**
 * Check if consecutive logs show suspicious "perfect match" pattern
 * (Variance Trap detection)
 */
export function checkVarianceTrap(
  recentLogs: Array<{ variance_percentage: number; ingredient_id: string }>
): boolean {
  if (recentLogs.length < FRAUD_THRESHOLDS.PERFECT_MATCH_CONSECUTIVE_LIMIT) {
    return false;
  }

  // Group by ingredient
  const byIngredient = new Map<string, number[]>();
  for (const log of recentLogs) {
    const arr = byIngredient.get(log.ingredient_id) || [];
    arr.push(log.variance_percentage);
    byIngredient.set(log.ingredient_id, arr);
  }

  // Check each ingredient for consecutive perfect matches
  for (const variances of byIngredient.values()) {
    const consecutivePerfect = variances.filter((v) => v === 0).length;
    if (
      consecutivePerfect >= FRAUD_THRESHOLDS.PERFECT_MATCH_CONSECUTIVE_LIMIT
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that a high-variance log has required fields
 */
export function validateHighVarianceLog(log: {
  variance_percentage?: number;
  variance_reason?: VarianceReason;
  evidence_photo_url?: string;
  notes?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const variancePct = log.variance_percentage ?? 0;
  const isHighVariance =
    Math.abs(variancePct) > FRAUD_THRESHOLDS.HIGH_VARIANCE_PERCENTAGE;

  if (!isHighVariance) {
    return { valid: true, errors: [] };
  }

  // Mandatory fields for high variance
  if (!log.variance_reason) {
    errors.push("Chênh lệch cao! Vui lòng chọn lý do.");
  }

  if (!log.evidence_photo_url) {
    errors.push("Chênh lệch cao! Vui lòng chụp ảnh bằng chứng.");
  }

  // If reason is OTHER, notes are required
  if (log.variance_reason === "OTHER" && !log.notes?.trim()) {
    errors.push("Vui lòng nhập ghi chú cho lý do 'Khác'.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================
// VARIANCE REASON DISPLAY TEXT (Vietnamese)
// =============================================

export const VARIANCE_REASON_LABELS: Record<VarianceReason, string> = {
  VOID_SALE: "Đơn hàng bị hủy (chưa ghi nhận)",
  FORGOT_IMPORT: "Quên ghi nhận nhập hàng",
  SPILLAGE: "Đổ/tràn",
  SPOILAGE: "Hỏng/hết hạn",
  THEFT_SUSPECTED: "Nghi ngờ mất cắp",
  MEASUREMENT_ERROR: "Sai số đo lường",
  RECIPE_CHANGED: "Công thức đã thay đổi",
  TRANSFER_MISSING: "Thiếu ghi chuyển kho",
  OTHER: "Lý do khác",
};
