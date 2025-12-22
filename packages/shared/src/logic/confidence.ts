/**
 * SnapKO AI Confidence Utilities
 * Shared logic for confidence scoring and highlighting
 */

export const CONFIDENCE_THRESHOLD = 85;

/**
 * AI parsed item with confidence
 */
export interface AiParsedItem {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost?: number | null;
}

/**
 * Check if an item has low confidence (needs review)
 */
export function isLowConfidence(item: AiParsedItem): boolean {
  return item.confidence < CONFIDENCE_THRESHOLD;
}

/**
 * Get confidence level category for UI styling
 */
export function getConfidenceLevel(
  confidence: number
): "high" | "medium" | "low" {
  if (confidence >= 85) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

/**
 * Get confidence color for UI
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 85) return "#22C55E"; // green
  if (confidence >= 60) return "#F59E0B"; // amber/yellow
  return "#EF4444"; // red
}

/**
 * Get confidence background color for highlighting
 */
export function getConfidenceBackground(confidence: number): string {
  if (confidence >= 85) return "transparent";
  if (confidence >= 60) return "rgba(245, 158, 11, 0.15)"; // yellow bg
  return "rgba(239, 68, 68, 0.15)"; // red bg
}

/**
 * Filter items that need review (low confidence)
 */
export function getItemsNeedingReview(items: AiParsedItem[]): AiParsedItem[] {
  return items.filter(isLowConfidence);
}

/**
 * Calculate average confidence for a list of items
 */
export function calculateAverageConfidence(items: AiParsedItem[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, item) => acc + item.confidence, 0);
  return Math.round(sum / items.length);
}

/**
 * Check if all items have acceptable confidence
 */
export function allItemsAcceptable(items: AiParsedItem[]): boolean {
  return items.every((item) => item.confidence >= CONFIDENCE_THRESHOLD);
}

/**
 * Sort items by confidence (lowest first for review)
 */
export function sortByConfidenceAsc(items: AiParsedItem[]): AiParsedItem[] {
  return [...items].sort((a, b) => a.confidence - b.confidence);
}

/**
 * Get summary stats for AI parse result
 */
export function getParseStats(items: AiParsedItem[]): {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  averageConfidence: number;
} {
  const highConfidence = items.filter((i) => i.confidence >= 85).length;
  const mediumConfidence = items.filter(
    (i) => i.confidence >= 60 && i.confidence < 85
  ).length;
  const lowConfidence = items.filter((i) => i.confidence < 60).length;

  return {
    total: items.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    averageConfidence: calculateAverageConfidence(items),
  };
}
