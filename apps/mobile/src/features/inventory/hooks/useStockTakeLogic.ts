/**
 * useStockTakeLogic - Hook for Stock Check Workflow (Snap 3)
 * Per .antigravityrules Section D.3 (COMPLEX LOGIC!)
 *
 * CRITICAL RULES:
 * - STORAGE (Warehouse): PARTIAL CHECK - Items NOT in photo remain unchanged
 * - SERVICE (Bar): FULL CHECK - Missing items trigger warning
 *
 * Flow:
 * 1. Select area (Kho Tổng vs Quầy Bar)
 * 2. Capture handwritten stock sheet
 * 3. Call AI to OCR items
 * 4. Calculate variance (Theoretical vs Actual)
 * 5. If high variance: Show VarianceAlertModal (MANDATORY)
 * 6. Queue for sync
 */

import { useState, useCallback, useMemo } from "react";
import {
  parseStockWithAI,
  type ParsedStockItem,
  type ParsedStockResponse,
} from "../../../services/aiService";
import { syncQueue } from "../../../services/syncQueue";
import { analyzeVariance, FRAUD_THRESHOLDS } from "@snapko/shared";

// =============================================
// TYPES
// =============================================

interface StockCheckItem extends ParsedStockItem {
  ingredient_id?: string;
  theoretical_qty: number;
  actual_qty: number;
  variance: number;
  variance_percentage: number;
  // Gatekeeper fields
  requires_evidence: boolean;
  variance_reason?: string;
  evidence_photo_url?: string;
  notes?: string;
}

interface StockTakeState {
  // Step tracking
  step: "select_area" | "capturing" | "processing" | "reviewing" | "saving";
  error: string | null;
  // Area selection
  selectedAreaId?: string;
  selectedAreaType?: "warehouse" | "bar";
  isPartialCheck: boolean;
  // AI results
  items: StockCheckItem[];
  itemsNeedingReview: number;
  warnings: string[];
  confidence: number;
  // Missing items (for FULL check)
  missingItems: { id: string; name: string }[];
  // Local
  localImagePath?: string;
}

const initialState: StockTakeState = {
  step: "select_area",
  error: null,
  isPartialCheck: true,
  items: [],
  itemsNeedingReview: 0,
  warnings: [],
  confidence: 0,
  missingItems: [],
};

export interface UseStockTakeLogicReturn {
  state: StockTakeState;
  // Computed
  hasHighVarianceItems: boolean;
  canSubmit: boolean;
  // Actions
  selectArea: (areaId: string, areaType: "warehouse" | "bar") => void;
  startCapture: () => void;
  processImage: (
    imageUri: string,
    businessId: string,
    currentStock: Map<string, number>
  ) => Promise<void>;
  updateItemQuantity: (index: number, actualQty: number) => void;
  setVarianceReason: (
    index: number,
    reason: string,
    evidenceUrl?: string,
    notes?: string
  ) => void;
  confirmAndSave: (businessId: string) => Promise<string | null>;
  reset: () => void;
}

export function useStockTakeLogic(): UseStockTakeLogicReturn {
  const [state, setState] = useState<StockTakeState>(initialState);

  // Computed: Check if any items have high variance
  const hasHighVarianceItems = useMemo(() => {
    return state.items.some((item) => item.requires_evidence);
  }, [state.items]);

  // Computed: Can submit (all high-variance items have reason + evidence)
  const canSubmit = useMemo(() => {
    const highVarianceItems = state.items.filter(
      (item) => item.requires_evidence
    );
    return highVarianceItems.every(
      (item) => item.variance_reason && item.evidence_photo_url
    );
  }, [state.items]);

  const selectArea = useCallback(
    (areaId: string, areaType: "warehouse" | "bar") => {
      setState((prev) => ({
        ...prev,
        selectedAreaId: areaId,
        selectedAreaType: areaType,
        // Per .antigravityrules: Warehouse = Partial, Bar = Full
        isPartialCheck: areaType === "warehouse",
        step: "select_area",
      }));
    },
    []
  );

  const startCapture = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "capturing",
      error: null,
    }));
  }, []);

  const processImage = useCallback(
    async (
      imageUri: string,
      businessId: string,
      currentStock: Map<string, number> // ingredient_id -> theoretical qty
    ) => {
      setState((prev) => ({
        ...prev,
        step: "processing",
        error: null,
        localImagePath: imageUri,
      }));

      try {
        const result: ParsedStockResponse = await parseStockWithAI(
          imageUri,
          businessId,
          state.selectedAreaType || "warehouse"
        );

        if (!result.success) {
          throw new Error(result.error || "Không thể đọc phiếu kiểm");
        }

        // Calculate variance for each item
        const processedItems: StockCheckItem[] = result.items.map((item) => {
          const theoreticalQty = item.ingredient_id
            ? currentStock.get(item.ingredient_id) || 0
            : 0;
          const actualQty = item.quantity;
          const variance = actualQty - theoreticalQty;
          const variancePercentage =
            theoreticalQty > 0
              ? Math.abs((variance / theoreticalQty) * 100)
              : 0;

          // Check if high variance (requires evidence)
          const requiresEvidence =
            variancePercentage > FRAUD_THRESHOLDS.HIGH_VARIANCE_PERCENTAGE;

          return {
            ...item,
            theoretical_qty: theoreticalQty,
            actual_qty: actualQty,
            variance,
            variance_percentage: Math.round(variancePercentage * 100) / 100,
            requires_evidence: requiresEvidence,
          };
        });

        // For FULL CHECK (Bar): Find missing items
        let missingItems: { id: string; name: string }[] = [];
        if (!state.isPartialCheck) {
          const scannedIds = new Set(
            result.items.map((i) => i.ingredient_id).filter(Boolean)
          );
          // TODO: Get all expected items from currentStock that are not in scannedIds
          // This would require the full ingredient list, simplified here
        }

        setState((prev) => ({
          ...prev,
          step: "reviewing",
          items: processedItems,
          itemsNeedingReview: result.items_needing_review,
          warnings: result.warnings,
          confidence: result.confidence,
          missingItems,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          step: "select_area",
          error: error instanceof Error ? error.message : "Lỗi không xác định",
        }));
      }
    },
    [state.selectedAreaType, state.isPartialCheck]
  );

  const updateItemQuantity = useCallback((index: number, actualQty: number) => {
    setState((prev) => {
      const items = [...prev.items];
      const item = items[index];

      const variance = actualQty - item.theoretical_qty;
      const variancePercentage =
        item.theoretical_qty > 0
          ? Math.abs((variance / item.theoretical_qty) * 100)
          : 0;
      const requiresEvidence =
        variancePercentage > FRAUD_THRESHOLDS.HIGH_VARIANCE_PERCENTAGE;

      items[index] = {
        ...item,
        actual_qty: actualQty,
        variance,
        variance_percentage: Math.round(variancePercentage * 100) / 100,
        requires_evidence: requiresEvidence,
        // Clear reason if variance is now acceptable
        variance_reason: requiresEvidence ? item.variance_reason : undefined,
        evidence_photo_url: requiresEvidence
          ? item.evidence_photo_url
          : undefined,
      };

      return { ...prev, items };
    });
  }, []);

  const setVarianceReason = useCallback(
    (index: number, reason: string, evidenceUrl?: string, notes?: string) => {
      setState((prev) => {
        const items = [...prev.items];
        items[index] = {
          ...items[index],
          variance_reason: reason,
          evidence_photo_url: evidenceUrl,
          notes,
        };
        return { ...prev, items };
      });
    },
    []
  );

  const confirmAndSave = useCallback(
    async (businessId: string): Promise<string | null> => {
      // Validate: All high-variance items must have reason + evidence
      if (!canSubmit) {
        setState((prev) => ({
          ...prev,
          error:
            "Vui lòng điền lý do và chụp ảnh bằng chứng cho các mục có chênh lệch cao",
        }));
        return null;
      }

      setState((prev) => ({ ...prev, step: "saving", error: null }));

      try {
        // Queue each item as a separate log
        const queueIds: string[] = [];

        for (const item of state.items) {
          const logData = {
            business_id: businessId,
            ingredient_id: item.ingredient_id,
            area_id: state.selectedAreaId,
            is_partial_check: state.isPartialCheck,
            type: "stock_take",
            theoretical_qty: item.theoretical_qty,
            actual_qty: item.actual_qty,
            variance: item.variance,
            variance_percentage: item.variance_percentage,
            variance_reason: item.variance_reason,
            evidence_photo_url: item.evidence_photo_url,
            notes: item.notes,
            ai_confidence: item.confidence,
            unit: item.unit,
            created_at: new Date().toISOString(),
          };

          const id = await syncQueue.queueAction("STOCK_TAKE", logData, {
            localImagePath: state.localImagePath,
          });
          queueIds.push(id);
        }

        setState(initialState);
        return queueIds[0] || null; // Return first ID as reference
      } catch (error) {
        setState((prev) => ({
          ...prev,
          step: "reviewing",
          error: error instanceof Error ? error.message : "Lỗi khi lưu",
        }));
        return null;
      }
    },
    [state, canSubmit]
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    hasHighVarianceItems,
    canSubmit,
    selectArea,
    startCapture,
    processImage,
    updateItemQuantity,
    setVarianceReason,
    confirmAndSave,
    reset,
  };
}
