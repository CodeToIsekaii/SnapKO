/**
 * useStockTakeLogic - Hook for Stock Check Workflow (Snap 3)
 * Per UPDATED .antigravityrules Section D.3 - "Smart 3-Snap Workflow"
 *
 * IMPLICIT TRANSFER LOGIC (Critical!):
 * The AI reads BOTH "Tồn cuối" (Closing Stock) AND "Nhập" (Import from Warehouse)
 *
 * 4-Step Calculation per user guidance:
 * 1. Stock Start = Current system stock for Bar
 * 2. Import_Qty = AI reads from "Nhập" column (0 if empty)
 * 3. Theoretical (New) = Stock Start + Import_Qty
 * 4. Variance = Actual (Tồn cuối) - Theoretical (New)
 *
 * VARIANCE THRESHOLDS:
 * - < 2%: Log silently (acceptable waste)
 * - 2-15%: Yellow Warning Modal
 * - > 15%: Red Critical Modal + Haptic
 */

import { useState, useCallback, useMemo } from "react";
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";
import {
  parseStockWithAI,
  type ParsedStockItem,
  type ParsedStockResponse,
} from "../../../services/aiService";
import { syncQueue } from "../../../services/syncQueue";
import { getDb } from "../../../db";
import { checkPerfectScoreTrap } from "@snapko/shared";

// =============================================
// VARIANCE THRESHOLDS (per updated .antigravityrules)
// =============================================
export const VARIANCE_THRESHOLDS = {
  SILENT: 2, // < 2%: Log silently
  WARNING: 15, // 2-15%: Yellow warning
  CRITICAL: 15, // > 15%: Red critical + Haptic
} as const;

// =============================================
// TYPES
// =============================================

interface StockCheckItem extends ParsedStockItem {
  ingredient_id?: string;
  // Stock calculation fields (4-step logic)
  stock_start: number; // Step 1: Current system stock
  import_qty: number; // Step 2: AI-detected import from Warehouse
  theoretical_after_import: number; // Step 3: stock_start + import_qty
  actual_qty: number; // From AI: Tồn cuối
  variance: number; // Step 4: actual - theoretical_after_import
  variance_percentage: number;
  // Variance type
  variance_type: "surplus" | "shortage" | "ok";
  // Gatekeeper fields (tiered)
  requires_reason: boolean; // 2-15%: Need reason
  requires_evidence: boolean; // > 15%: Need reason + photo
  variance_reason?: string;
  evidence_photo_url?: string;
  notes?: string;
}

interface StockTakeState {
  step: "select_area" | "capturing" | "processing" | "reviewing" | "saving";
  error: string | null;
  selectedAreaId?: string;
  selectedAreaType?: "warehouse" | "bar";
  isPartialCheck: boolean;
  items: StockCheckItem[];
  itemsNeedingReview: number;
  warnings: string[];
  confidence: number;
  missingItems: { id: string; name: string }[];
  localImagePath?: string;
  // Implicit Transfer tracking
  hasImplicitTransfers: boolean;
  itemsWithImport: StockCheckItem[];
  // Anti-Fraud tracking
  isPerfectScoreTrap: boolean;
  perfectScoreShown: boolean;
}

const initialState: StockTakeState = {
  step: "select_area",
  error: null,
  isPartialCheck: false, // Always full check for Bar
  items: [],
  itemsNeedingReview: 0,
  warnings: [],
  confidence: 0,
  missingItems: [],
  hasImplicitTransfers: false,
  itemsWithImport: [],
  isPerfectScoreTrap: false,
  perfectScoreShown: false,
};

export interface UseStockTakeLogicReturn {
  state: StockTakeState;
  // Computed
  hasHighVarianceItems: boolean;
  hasCriticalVariance: boolean;
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

  // Computed: Check if any items require action (>= 2%)
  const hasHighVarianceItems = useMemo(() => {
    return state.items.some(
      (item) => item.requires_reason || item.requires_evidence
    );
  }, [state.items]);

  // Computed: Check if any items have critical variance (> 15%)
  const hasCriticalVariance = useMemo(() => {
    return state.items.some((item) => item.requires_evidence);
  }, [state.items]);

  // Computed: Can submit
  const canSubmit = useMemo(() => {
    // All items needing evidence must have it
    const evidenceItems = state.items.filter((item) => item.requires_evidence);
    const evidenceOk = evidenceItems.every(
      (item) => item.variance_reason && item.evidence_photo_url
    );

    // All items needing reason (but not evidence) must have reason
    const reasonItems = state.items.filter(
      (item) => item.requires_reason && !item.requires_evidence
    );
    const reasonOk = reasonItems.every((item) => item.variance_reason);

    return evidenceOk && reasonOk;
  }, [state.items]);

  const selectArea = useCallback(
    (areaId: string, areaType: "warehouse" | "bar") => {
      setState((prev) => ({
        ...prev,
        selectedAreaId: areaId,
        selectedAreaType: areaType,
        isPartialCheck: false, // Always full check per updated rules
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
      currentStock: Map<string, number>
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
          "bar" // Always checking Bar per updated rules
        );

        if (!result.success) {
          throw new Error(result.error || "Không thể đọc phiếu kiểm");
        }

        // =============================================
        // 4-STEP IMPLICIT TRANSFER LOGIC
        // Per user guidance: Calculate variance AFTER implicit transfer
        // =============================================
        const processedItems: StockCheckItem[] = result.items.map((item) => {
          // Step 1: Stock Start = Current system stock for Bar
          const stockStart = item.ingredient_id
            ? currentStock.get(item.ingredient_id) || 0
            : 0;

          // Step 2: Import_Qty = AI reads from "Nhập" column (0 if empty)
          const aiItem = item as unknown as {
            import_qty?: number;
            stock_qty?: number;
          };
          const importQty = aiItem.import_qty || 0;

          // Step 3: Theoretical (New) = Stock Start + Import_Qty
          const theoreticalAfterImport = stockStart + importQty;

          // Step 4: Actual = AI đọc từ cột "Tồn cuối"
          const actualQty = aiItem.stock_qty || item.quantity || 0;

          // Step 4: Variance = Actual - Theoretical (New)
          const variance = actualQty - theoreticalAfterImport;
          const variancePercentage =
            theoreticalAfterImport > 0
              ? Math.abs((variance / theoreticalAfterImport) * 100)
              : 0;

          // Determine variance type
          let varianceType: "surplus" | "shortage" | "ok" = "ok";
          if (variance > 0) varianceType = "surplus";
          else if (variance < 0) varianceType = "shortage";

          // TIERED THRESHOLDS
          const requiresReason =
            variancePercentage >= VARIANCE_THRESHOLDS.SILENT &&
            variancePercentage <= VARIANCE_THRESHOLDS.WARNING;
          const requiresEvidence =
            variancePercentage > VARIANCE_THRESHOLDS.CRITICAL;

          return {
            ...item,
            ingredient_id: item.ingredient_id,
            stock_start: stockStart,
            import_qty: importQty,
            theoretical_after_import: theoreticalAfterImport,
            actual_qty: actualQty,
            variance,
            variance_percentage: Math.round(variancePercentage * 100) / 100,
            variance_type: varianceType,
            requires_reason: requiresReason,
            requires_evidence: requiresEvidence,
          };
        });

        // Find items with imports for Implicit Transfer creation
        const itemsWithImport = processedItems.filter(
          (item) => item.import_qty > 0
        );

        // Warnings
        const warnings = [...(result.warnings || [])];
        if (itemsWithImport.length > 0) {
          warnings.push(
            `Phát hiện ${itemsWithImport.length} nguyên liệu có nhập từ Kho Tổng. Transfer Log sẽ được tạo tự động.`
          );
        }

        setState((prev) => ({
          ...prev,
          step: "reviewing",
          items: processedItems,
          itemsNeedingReview: result.items_needing_review,
          warnings,
          confidence: result.confidence,
          missingItems: [],
          hasImplicitTransfers: itemsWithImport.length > 0,
          itemsWithImport,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          step: "select_area",
          error: error instanceof Error ? error.message : "Lỗi không xác định",
        }));
      }
    },
    []
  );

  const updateItemQuantity = useCallback((index: number, actualQty: number) => {
    setState((prev) => {
      const items = [...prev.items];
      const item = items[index];

      const variance = actualQty - item.theoretical_after_import;
      const variancePercentage =
        item.theoretical_after_import > 0
          ? Math.abs((variance / item.theoretical_after_import) * 100)
          : 0;

      let varianceType: "surplus" | "shortage" | "ok" = "ok";
      if (variance > 0) varianceType = "surplus";
      else if (variance < 0) varianceType = "shortage";

      const requiresReason =
        variancePercentage >= VARIANCE_THRESHOLDS.SILENT &&
        variancePercentage <= VARIANCE_THRESHOLDS.WARNING;
      const requiresEvidence =
        variancePercentage > VARIANCE_THRESHOLDS.CRITICAL;

      items[index] = {
        ...item,
        actual_qty: actualQty,
        variance,
        variance_percentage: Math.round(variancePercentage * 100) / 100,
        variance_type: varianceType,
        requires_reason: requiresReason,
        requires_evidence: requiresEvidence,
        // Clear if no longer required
        variance_reason:
          requiresReason || requiresEvidence ? item.variance_reason : undefined,
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
      if (!canSubmit) {
        setState((prev) => ({
          ...prev,
          error: "Vui lòng điền lý do cho các mục có chênh lệch cao",
        }));
        return null;
      }

      // =============================================
      // ANTI-FRAUD: Perfect Score Trap Check (MVP P1)
      // Per .antigravityrules Section 7.E.3
      // =============================================
      const trapResult = checkPerfectScoreTrap(
        state.items.map((item) => ({
          variance: item.variance,
          unit: item.unit || "",
        }))
      );

      let isFlagged = false;
      let flagReason: string | null = null;

      if (trapResult.isSuspicious) {
        // Show Toast/Alert message per .UXUIrules
        Alert.alert(
          "🧐 Số liệu quá hoàn hảo",
          `Bạn có chắc đã cân đo kỹ ${trapResult.perfectCount}/${trapResult.totalLiquidPowder} món định lượng không?\n\nNếu tiếp tục, phiếu này sẽ được đánh dấu để chủ quán kiểm tra.`,
          [
            {
              text: "Kiểm tra lại",
              style: "cancel",
              onPress: () => {
                setState((prev) => ({ ...prev, step: "reviewing" }));
              },
            },
            {
              text: "Tôi chắc chắn",
              style: "destructive",
              onPress: () => {
                // Mark as flagged and continue
                isFlagged = true;
                flagReason = "SUSPICIOUS_PERFECT_MATCH";
              },
            },
          ]
        );

        // If user chose "Kiểm tra lại", return early
        if (!isFlagged) {
          return null;
        }
      }

      // =============================================
      // ANTI-FRAUD: Haptic Feedback for Critical Variance (>15%)
      // Per .antigravityrules Section 7.E.2 Level 3
      // =============================================
      const hasCriticalItems = state.items.some(
        (item) => item.variance_percentage > VARIANCE_THRESHOLDS.CRITICAL
      );
      if (hasCriticalItems) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      setState((prev) => ({ ...prev, step: "saving", error: null }));

      try {
        const db = getDb();
        const now = new Date().toISOString();

        // Step 1: Create Implicit Transfer Logs for items with import
        if (state.hasImplicitTransfers && db) {
          const warehouseAreaId = "warehouse_default"; // TODO: Get from config
          const barAreaId = state.selectedAreaId || "bar_default";

          for (const item of state.itemsWithImport) {
            if (item.ingredient_id && item.import_qty > 0) {
              const transferId = `transfer_${Date.now()}_${Math.random()
                .toString(36)
                .substring(7)}`;

              await db.runAsync(
                `INSERT INTO local_transfer_logs 
                 (id, business_id, from_area_id, to_area_id, items_json, notes, created_at, synced)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                [
                  transferId,
                  businessId,
                  warehouseAreaId,
                  barAreaId,
                  JSON.stringify([
                    {
                      ingredient_id: item.ingredient_id,
                      ingredient_name: item.ingredient_name,
                      quantity: item.import_qty,
                    },
                  ]),
                  "Tự động tạo từ phiếu kiểm kho (Smart Sheet)",
                  now,
                ]
              );

              // Queue for sync
              await syncQueue.queueAction("TRANSFER", {
                transfer_id: transferId,
                business_id: businessId,
                from_area_id: warehouseAreaId,
                to_area_id: barAreaId,
                items: [
                  {
                    ingredient_id: item.ingredient_id,
                    quantity: item.import_qty,
                  },
                ],
              });
            }
          }
        }

        // Step 2: Create Waste Logs for items with shortage
        if (db) {
          const shortageItems = state.items.filter(
            (item) => item.variance_type === "shortage" && item.variance_reason
          );

          for (const item of shortageItems) {
            if (item.ingredient_id) {
              const wasteId = `waste_${Date.now()}_${Math.random()
                .toString(36)
                .substring(7)}`;

              await db.runAsync(
                `INSERT INTO local_waste_logs 
                 (id, business_id, ingredient_id, area_id, quantity, reason, notes, created_at, synced)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [
                  wasteId,
                  businessId,
                  item.ingredient_id,
                  state.selectedAreaId || "",
                  Math.abs(item.variance),
                  item.variance_reason || "UNKNOWN",
                  item.notes || null,
                  now,
                ]
              );
            }
          }
        }

        // Step 3: Queue stock take log for sync (with Anti-Fraud flags)
        const logData = {
          business_id: businessId,
          area_id: state.selectedAreaId,
          is_flagged: isFlagged, // Anti-fraud: flagged if Perfect Score Trap triggered
          flag_reason: flagReason, // 'SUSPICIOUS_PERFECT_MATCH', etc.
          items: state.items.map((item) => ({
            ingredient_id: item.ingredient_id,
            stock_start: item.stock_start,
            import_qty: item.import_qty,
            theoretical_after_import: item.theoretical_after_import,
            actual_qty: item.actual_qty,
            variance: item.variance,
            variance_percentage: item.variance_percentage,
            variance_reason: item.variance_reason,
          })),
          ai_confidence: state.confidence,
          created_at: now,
        };

        const queueId = await syncQueue.queueAction("STOCK_TAKE", logData, {
          localImagePath: state.localImagePath,
        });

        setState(initialState);
        return queueId;
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
    hasCriticalVariance,
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
