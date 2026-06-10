/**
 * useSalesSnap - Hook for Sales Workflow (Snap 2)
 * Per .antigravityrules Section D.2
 *
 * Flow:
 * 1. Capture POS Z-Report photo
 * 2. Call AI to parse menu items sold
 * 3. Calculate ingredient deductions from recipes
 * 4. Queue for sync (deduct from SERVICE area)
 */

import { useState, useCallback } from "react";
import {
  parseSalesWithAI,
  QuotaExceededError,
  type ParsedSalesItem,
  type DeductedItem,
  type ParsedSalesResponse,
} from "../../../services/aiService";
import { syncQueue } from "../../../services/syncQueue";

interface SalesState {
  isCapturing: boolean;
  isProcessing: boolean;
  isParsed: boolean;
  isSaving: boolean;
  error: string | null;
  quotaExceeded: { canWatchAd: boolean; adRewardScans: number; maxAdRewardsPerDay: number } | null;
  // AI results
  reportDate?: string;
  shift?: string;
  totalRevenue?: number;
  itemsSold: ParsedSalesItem[];
  itemsDeducted: DeductedItem[];
  confidence: number;
  qtyMismatch?: { expected: number; got: number; diff: number } | null;
  revenueMismatch?: { expected: number; got: number; diff: number } | null;
  orderSuspicious?: boolean;
  rawOcrText?: string | null;
  // Local
  localImagePath?: string;
}

const initialState: SalesState = {
  isCapturing: false,
  isProcessing: false,
  isParsed: false,
  isSaving: false,
  error: null,
  quotaExceeded: null,
  itemsSold: [],
  itemsDeducted: [],
  confidence: 0,
};

export interface UseSalesSnapReturn {
  state: SalesState;
  // Actions
  startCapture: () => void;
  processImage: (imageUri: string, businessId: string) => Promise<void>;
  updateSoldItem: (index: number, updates: Partial<ParsedSalesItem>) => void;
  removeSoldItem: (index: number) => void;
  clearQuotaExceeded: () => void;
  confirmAndSave: (businessId: string) => Promise<string | null>;
  reset: () => void;
}

export function useSalesSnap(): UseSalesSnapReturn {
  const [state, setState] = useState<SalesState>(initialState);

  const startCapture = useCallback(() => {
    setState((prev) => ({ ...prev, isCapturing: true, error: null }));
  }, []);

  const processImage = useCallback(
    async (imageUri: string, businessId: string) => {
      setState((prev) => ({
        ...prev,
        isCapturing: false,
        isProcessing: true,
        error: null,
        localImagePath: imageUri,
      }));

      try {
        const result: ParsedSalesResponse = await parseSalesWithAI(
          imageUri,
          businessId
        );

        if (!result.success) {
          throw new Error(result.error || "Không thể đọc báo cáo");
        }

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          isParsed: true,
          reportDate: result.report_date,
          shift: result.shift,
          totalRevenue: result.total_revenue,
          itemsSold: [...result.items_sold].sort((a, b) => (a.row_index ?? 0) - (b.row_index ?? 0)),
          itemsDeducted: result.items_deducted,
          confidence: result.confidence,
          qtyMismatch: result.qty_mismatch,
          revenueMismatch: result.revenue_mismatch,
          orderSuspicious: result.order_suspicious,
          rawOcrText: result.raw_ocr_text,
        }));
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            quotaExceeded: {
              canWatchAd: error.canWatchAd,
              adRewardScans: error.adRewardScans,
              maxAdRewardsPerDay: error.maxAdRewardsPerDay,
            },
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            error: error instanceof Error ? error.message : "Lỗi không xác định",
          }));
        }
      }
    },
    []
  );

  const clearQuotaExceeded = useCallback(() => {
    setState((prev) => ({ ...prev, quotaExceeded: null }));
  }, []);

  const updateSoldItem = useCallback(
    (index: number, updates: Partial<ParsedSalesItem>) => {
      setState((prev) => ({
        ...prev,
        itemsSold: prev.itemsSold.map((item, i) =>
          i === index ? { ...item, ...updates } : item
        ),
      }));
    },
    []
  );

  const removeSoldItem = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      itemsSold: prev.itemsSold.filter((_, i) => i !== index),
    }));
  }, []);

  const confirmAndSave = useCallback(
    async (businessId: string): Promise<string | null> => {
      setState((prev) => ({ ...prev, isSaving: true, error: null }));

      try {
        const salesData = {
          business_id: businessId,
          report_date: state.reportDate,
          shift: state.shift,
          total_revenue: state.totalRevenue,
          items_sold_json: state.itemsSold,
          items_deducted_json: state.itemsDeducted,
          ai_confidence: state.confidence,
          created_at: new Date().toISOString(),
        };

        const queueId = await syncQueue.queueAction("SALES", salesData, {
          localImagePath: state.localImagePath,
        });

        setState(initialState);
        return queueId;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          error: error instanceof Error ? error.message : "Lỗi khi lưu",
        }));
        return null;
      }
    },
    [state]
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    startCapture,
    processImage,
    updateSoldItem,
    removeSoldItem,
    confirmAndSave,
    reset,
    clearQuotaExceeded,
  };
}
