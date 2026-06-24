/**
 * AI Service — calls BE-SnapKO /ai/parse.
 * Backend owns scan quota, model policy, and AI provider selection.
 * Per .antigravityrules: Uses expo-image-manipulator for compression before upload.
 */

import * as ImageManipulator from "expo-image-manipulator";
import { File } from "expo-file-system";
import { api } from "./api";
import { isExpectedNetworkError } from "../screens/inventoryCaptureError";

// =============================================
// SCAN QUOTA
// =============================================

export class QuotaExceededError extends Error {
  canWatchAd: boolean;
  adRewardScans: number;
  maxAdRewardsPerDay: number;
  scansRemaining?: number;

  constructor(data: {
    canWatchAd: boolean;
    adRewardScans: number;
    maxAdRewardsPerDay: number;
    scansRemaining?: number;
  }) {
    super("QUOTA_EXCEEDED");
    this.canWatchAd = data.canWatchAd;
    this.adRewardScans = data.adRewardScans;
    this.maxAdRewardsPerDay = data.maxAdRewardsPerDay;
    this.scansRemaining = data.scansRemaining;
  }
}

function quotaErrorFromApiError(err: any): QuotaExceededError | null {
  const status = err?.status ?? err?.response?.status;
  const data = err?.data ?? err?.response?.data ?? {};
  const code =
    typeof data === "object" && data !== null
      ? (data as any).error ?? (data as any).message
      : undefined;

  if (status !== 429 || code !== "QUOTA_EXCEEDED") return null;

  return new QuotaExceededError({
    canWatchAd: data?.canWatchAd ?? false,
    adRewardScans: data?.adRewardScans ?? 0,
    maxAdRewardsPerDay: data?.maxAdRewardsPerDay ?? 0,
    scansRemaining: data?.remaining,
  });
}

function logUnexpectedAiError(label: string, error: unknown): void {
  if (isExpectedNetworkError(error)) return;
  console.error(label, error);
}

// =============================================
// IMAGE COMPRESSION
// =============================================

const IMAGE_CONFIG = {
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.7,
  format: ImageManipulator.SaveFormat.JPEG,
};

// =============================================
// TYPES — Match backend /ai/parse responses
// =============================================

export interface ParsedInvoiceItem {
  ingredient_id?: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: number;
}

export interface ParsedInvoiceResponse extends AiResponseMetadata {
  success: boolean;
  invoice_number?: string;
  supplier_name?: string;
  invoice_date?: string;
  total_amount?: number;
  items: ParsedInvoiceItem[];
  confidence: number;
  error?: string;
}

export interface ParsedSalesItem {
  menu_item_name: string;
  raw_name?: string;
  matched_recipe_name?: string | null;
  recipe_id?: string;
  quantity_sold: number;
  unit_price?: number;
  total_revenue?: number | null;
  confidence: number;
  row_index?: number;
  expected_revenue?: number | null;
  revenue_deviation?: number | null;
  recipe_price?: number | null;
  internal_inconsistent?: boolean;
  menu_price_differs?: boolean;
}

export interface DeductedItem {
  ingredient_id: string;
  ingredient_name: string;
  deducted_qty: number;
  unit: string;
  unit_cost?: number;
}

export interface ParsedSalesResponse extends AiResponseMetadata {
  success: boolean;
  report_date?: string;
  shift?: string;
  total_revenue?: number;
  items_sold: ParsedSalesItem[];
  items_deducted: DeductedItem[];
  confidence: number;
  qty_mismatch?: { expected: number; got: number; diff: number } | null;
  revenue_mismatch?: { expected: number; got: number; diff: number } | null;
  order_suspicious?: boolean;
  used_raw_ocr_parser?: boolean;
  raw_ocr_text?: string | null;
  error?: string;
}

export interface ParsedStockItem {
  ingredient_id?: string;
  ingredient_name: string;
  quantity: number;
  import_qty?: number;
  unit?: string;
  confidence: number;
  needs_review: boolean;
  raw_text?: string;
  stt?: string | number;
  original_name?: string;
  source_page?: number;
  review_reason?: string;
}

export interface ParsedStockResponse extends AiResponseMetadata {
  success: boolean;
  check_type?: "warehouse" | "bar";
  items: ParsedStockItem[];
  confidence: number;
  items_needing_review: number;
  warnings: string[];
  raw_ocr_text?: string | null;
  used_raw_ocr_parser?: boolean;
  missing_row_numbers?: number[];
  duplicate_row_numbers?: number[];
  error?: string;
}

export type ParsedHandwritingItem = {
  ingredient_name: string;
  stock_qty: number;
  import_qty: number;
  unit: string;
  confidence: number;
  needs_review: boolean;
  ingredient_id?: string;
  linkedIngredientId?: string;
  raw_text?: string;
  stt?: string | number;
  original_name?: string;
  source_page?: number;
  review_reason?: string;
};

type AiParseType = "IMPORT" | "SALES" | "STOCK_CHECK" | "RECIPE";
export type AiQualityMode = "standard" | "high_accuracy";

export interface AiQuotaMetadata {
  used: number;
  quota: number;
  remaining: number;
}

export interface ConfirmAiResultResponse {
  charged: boolean;
  quota: AiQuotaMetadata;
}

interface AiParseRequest {
  type: AiParseType;
  image?: string;
  images?: string[];
  areaType?: "warehouse" | "bar" | "SERVICE" | "STORAGE";
  inventoryModel?: "SIMPLE" | "STANDARD" | "CHAIN";
  qualityMode?: AiQualityMode;
}

interface AiResponseMetadata {
  quota?: AiQuotaMetadata;
  quotaPreview?: AiQuotaMetadata;
  scanChargeToken?: string;
  qualityMode?: AiQualityMode;
  model?: string;
  canRetryHighAccuracy?: boolean;
}

// =============================================
// AI SERVICE
// =============================================

class AIService {
  async compressImage(uri: string): Promise<string> {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: IMAGE_CONFIG.maxWidth, height: IMAGE_CONFIG.maxHeight } }],
        { compress: IMAGE_CONFIG.quality, format: IMAGE_CONFIG.format },
      );
      return result.uri;
    } catch (error) {
      console.warn("[AIService] Image compression failed, using original URI:", error);
      return uri;
    }
  }

  async imageToBase64(uri: string): Promise<string> {
    const file = new File(uri);
    return file.base64();
  }

  private async parse<T>(body: AiParseRequest): Promise<T> {
    try {
      const res = await api.post<T>("/ai/parse", body);
      return res as T;
    } catch (err) {
      const quotaError = quotaErrorFromApiError(err);
      if (quotaError) throw quotaError;
      throw err;
    }
  }

  // =============================================
  // PUBLIC API
  // =============================================

  async parseInvoice(
    imageUri: string,
    _businessId: string,
    qualityMode: AiQualityMode = "standard",
  ): Promise<ParsedInvoiceResponse> {
    try {
      const compressedUri = await this.compressImage(imageUri);
      const base64 = await this.imageToBase64(compressedUri);
      return await this.parse<ParsedInvoiceResponse>({
        type: "IMPORT",
        image: base64,
        qualityMode,
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) throw error;
      logUnexpectedAiError("[AIService] parseInvoice error:", error);
      return {
        success: false,
        items: [],
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async parseSalesReport(
    imageUri: string,
    _businessId: string,
    qualityMode: AiQualityMode = "standard",
  ): Promise<ParsedSalesResponse> {
    try {
      const compressedUri = await this.compressImage(imageUri);
      const base64 = await this.imageToBase64(compressedUri);
      return await this.parse<ParsedSalesResponse>({
        type: "SALES",
        image: base64,
        qualityMode,
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) throw error;
      logUnexpectedAiError("[AIService] parseSalesReport error:", error);
      return {
        success: false,
        items_sold: [],
        items_deducted: [],
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async parseStockSheet(
    imageUri: string,
    _businessId: string,
    areaType: "warehouse" | "bar",
    inventoryModel: "SIMPLE" | "STANDARD" | "CHAIN" = "SIMPLE",
    qualityMode: AiQualityMode = "standard",
  ): Promise<ParsedStockResponse> {
    try {
      const compressedUri = await this.compressImage(imageUri);
      const base64 = await this.imageToBase64(compressedUri);
      return await this.parse<ParsedStockResponse>({
        type: "STOCK_CHECK",
        image: base64,
        areaType,
        inventoryModel,
        qualityMode,
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) throw error;
      logUnexpectedAiError("[AIService] parseStockSheet error:", error);
      return {
        success: false,
        items: [],
        confidence: 0,
        items_needing_review: 0,
        warnings: [error instanceof Error ? error.message : "Unknown error"],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Multi-image stock-take (multiple photos of 1 handwritten sheet).
   * Backend OCRs images in parallel, concatenates raw text, then Gemini Pro structures.
   */
  async parseHandwritingMulti(
    imagesBase64: string[],
    _businessId: string,
    inventoryModel: "STANDARD" | "SIMPLE" | "CHAIN",
    areaType: "SERVICE" | "STORAGE",
    qualityMode: AiQualityMode = "standard",
  ): Promise<{
    success: boolean;
    items: ParsedHandwritingItem[];
    error?: string;
    warnings?: string[];
    raw_ocr_text?: string | null;
    used_raw_ocr_parser?: boolean;
    missing_row_numbers?: number[];
    duplicate_row_numbers?: number[];
  } & AiResponseMetadata> {
    try {
      const res = await this.parse<ParsedStockResponse>({
        type: "STOCK_CHECK",
        images: imagesBase64,
        inventoryModel,
        areaType,
        qualityMode,
      });
      const items: ParsedHandwritingItem[] = (res.items ?? []).map((it) => ({
        ingredient_name: it.ingredient_name,
        stock_qty: it.quantity,
        import_qty: it.import_qty ?? 0,
        unit: it.unit ?? "",
        confidence: it.confidence,
        needs_review: it.needs_review,
        ingredient_id: it.ingredient_id,
        linkedIngredientId: it.ingredient_id,
        raw_text: it.raw_text,
        stt: it.stt,
        original_name: it.original_name,
        source_page: it.source_page,
        review_reason: it.review_reason,
      }));
      return {
        success: res.success,
        items,
        error: res.error,
        warnings: res.warnings,
        raw_ocr_text: res.raw_ocr_text,
        used_raw_ocr_parser: res.used_raw_ocr_parser,
        missing_row_numbers: res.missing_row_numbers,
        duplicate_row_numbers: res.duplicate_row_numbers,
        quota: res.quota ?? res.quotaPreview,
        quotaPreview: res.quotaPreview,
        scanChargeToken: res.scanChargeToken,
        qualityMode: res.qualityMode,
        model: res.model,
        canRetryHighAccuracy: res.canRetryHighAccuracy,
      };
    } catch (err: any) {
      if (err instanceof QuotaExceededError) throw err;
      logUnexpectedAiError("[AIService] parseHandwritingMulti error:", err);
      return { success: false, items: [], error: err.message };
    }
  }

  async parseInvoiceMulti(
    imagesBase64: string[],
    _businessId: string,
    qualityMode: AiQualityMode = "standard",
  ): Promise<ParsedInvoiceResponse> {
    try {
      return await this.parse<ParsedInvoiceResponse>({
        type: "IMPORT",
        images: imagesBase64,
        qualityMode,
      });
    } catch (err: any) {
      if (err instanceof QuotaExceededError) throw err;
      logUnexpectedAiError("[AIService] parseInvoiceMulti error:", err);
      return { success: false, items: [], confidence: 0, error: err.message };
    }
  }

  async parseSalesMulti(
    imagesBase64: string[],
    _businessId: string,
    qualityMode: AiQualityMode = "standard",
  ): Promise<ParsedSalesResponse> {
    try {
      return await this.parse<ParsedSalesResponse>({
        type: "SALES",
        images: imagesBase64,
        qualityMode,
      });
    } catch (err: any) {
      if (err instanceof QuotaExceededError) throw err;
      logUnexpectedAiError("[AIService] parseSalesMulti error:", err);
      return {
        success: false,
        items_sold: [],
        items_deducted: [],
        confidence: 0,
        error: err.message,
      };
    }
  }

  async confirmAiResultCharge(token: string): Promise<ConfirmAiResultResponse> {
    return api.post<ConfirmAiResultResponse>("/scans/confirm-ai-result", {
      token,
    });
  }

  /**
   * Fraud detection — migrated to BE-SnapKO /fraud/detect (Phase 2).
   */
  async runFraudDetection(
    businessId: string,
    checkTypes?: string[],
  ): Promise<{ success: boolean; alerts_generated: number; alerts: unknown[] }> {
    try {
      const res = await api.post<{ success: boolean; alerts_generated: number; alerts: unknown[] }>(
        "/fraud/detect",
        { businessId, checkTypes },
      );
      return res;
    } catch (error) {
      console.error("[AIService] runFraudDetection error:", error);
      return { success: false, alerts_generated: 0, alerts: [] };
    }
  }
}

// Singleton
export const aiService = new AIService();

// =============================================
// CONVENIENCE EXPORTS
// =============================================

export const parseInvoiceWithAI = aiService.parseInvoice.bind(aiService);
export const parseInvoiceMultiWithAI = aiService.parseInvoiceMulti.bind(aiService);
export const parseSalesWithAI = aiService.parseSalesReport.bind(aiService);
export const parseSalesMultiWithAI = aiService.parseSalesMulti.bind(aiService);
export const parseStockWithAI = aiService.parseStockSheet.bind(aiService);
export const parseHandwritingMultiWithAI = aiService.parseHandwritingMulti.bind(aiService);
export const confirmAiResultCharge = aiService.confirmAiResultCharge.bind(aiService);
