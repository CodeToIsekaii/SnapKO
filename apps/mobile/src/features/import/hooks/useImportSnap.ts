/**
 * useImportSnap - Hook for Import Workflow (Snap 1)
 * Per .antigravityrules Section D.1
 *
 * Flow:
 * 1. Capture invoice photo
 * 2. Call AI to parse items
 * 3. User reviews/edits
 * 4. Queue for sync (calculate COGS)
 */

import { useState, useCallback } from "react";
import {
  parseInvoiceWithAI,
  type ParsedInvoiceItem,
  type ParsedInvoiceResponse,
} from "../../../services/aiService";
import { syncQueue, type SyncActionType } from "../../../services/syncQueue";

interface ImportState {
  isCapturing: boolean;
  isProcessing: boolean;
  isParsed: boolean;
  isSaving: boolean;
  error: string | null;
  // AI results
  invoiceNumber?: string;
  supplierName?: string;
  invoiceDate?: string;
  totalAmount?: number;
  items: ParsedInvoiceItem[];
  confidence: number;
  // User selections
  targetAreaId?: string;
  localImagePath?: string;
}

const initialState: ImportState = {
  isCapturing: false,
  isProcessing: false,
  isParsed: false,
  isSaving: false,
  error: null,
  items: [],
  confidence: 0,
};

export interface UseImportSnapReturn {
  state: ImportState;
  // Actions
  startCapture: () => void;
  processImage: (imageUri: string, businessId: string) => Promise<void>;
  updateItem: (index: number, updates: Partial<ParsedInvoiceItem>) => void;
  removeItem: (index: number) => void;
  addItem: (item: ParsedInvoiceItem) => void;
  setTargetArea: (areaId: string) => void;
  confirmAndSave: (businessId: string) => Promise<string | null>;
  reset: () => void;
}

export function useImportSnap(): UseImportSnapReturn {
  const [state, setState] = useState<ImportState>(initialState);

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
        // Call AI service to parse invoice
        const result: ParsedInvoiceResponse = await parseInvoiceWithAI(
          imageUri,
          businessId
        );

        if (!result.success) {
          throw new Error(result.error || "Không thể đọc hóa đơn");
        }

        setState((prev) => ({
          ...prev,
          isProcessing: false,
          isParsed: true,
          invoiceNumber: result.invoice_number,
          supplierName: result.supplier_name,
          invoiceDate: result.invoice_date,
          totalAmount: result.total_amount,
          items: result.items,
          confidence: result.confidence,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: error instanceof Error ? error.message : "Lỗi không xác định",
        }));
      }
    },
    []
  );

  const updateItem = useCallback(
    (index: number, updates: Partial<ParsedInvoiceItem>) => {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item, i) =>
          i === index ? { ...item, ...updates, user_confirmed: true } : item
        ) as ParsedInvoiceItem[],
      }));
    },
    []
  );

  const removeItem = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }, []);

  const addItem = useCallback((item: ParsedInvoiceItem) => {
    setState((prev) => ({
      ...prev,
      items: [...prev.items, { ...item, user_confirmed: true }],
    }));
  }, []);

  const setTargetArea = useCallback((areaId: string) => {
    setState((prev) => ({ ...prev, targetAreaId: areaId }));
  }, []);

  const confirmAndSave = useCallback(
    async (businessId: string): Promise<string | null> => {
      setState((prev) => ({ ...prev, isSaving: true, error: null }));

      try {
        // Prepare data for sync
        const importData = {
          business_id: businessId,
          target_area_id: state.targetAreaId,
          invoice_number: state.invoiceNumber,
          supplier_name: state.supplierName,
          invoice_date: state.invoiceDate,
          total_amount: state.totalAmount,
          items_json: state.items,
          ai_confidence: state.confidence,
          created_at: new Date().toISOString(),
        };

        // Queue for sync - this is the key offline-first pattern
        const queueId = await syncQueue.queueAction("IMPORT", importData, {
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
    updateItem,
    removeItem,
    addItem,
    setTargetArea,
    confirmAndSave,
    reset,
  };
}
