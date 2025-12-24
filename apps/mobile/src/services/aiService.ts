/**
 * AI Service - Wrapper for Edge Functions
 * Per .antigravityrules: Uses expo-image-manipulator for compression
 *
 * Flow:
 * 1. Capture image with Camera
 * 2. Compress using expo-image-manipulator
 * 3. Upload to Supabase Storage
 * 4. Call Edge Function with image URL
 * 5. Return typed response
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";

// =============================================
// CONFIGURATION
// =============================================

const SUPABASE_URL =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "";
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// Image compression settings
const IMAGE_CONFIG = {
  maxWidth: 1200,
  maxHeight: 1600,
  quality: 0.7, // 70% quality - balance between size and clarity
  format: ImageManipulator.SaveFormat.JPEG,
};

// =============================================
// TYPES - Match Edge Function responses
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

export interface ParsedInvoiceResponse {
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
  recipe_id?: string;
  quantity_sold: number;
  unit_price?: number;
  total_revenue?: number;
  confidence: number;
}

export interface DeductedItem {
  ingredient_id: string;
  ingredient_name: string;
  deducted_qty: number;
  unit: string;
  unit_cost?: number;
}

export interface ParsedSalesResponse {
  success: boolean;
  report_date?: string;
  shift?: string;
  total_revenue?: number;
  items_sold: ParsedSalesItem[];
  items_deducted: DeductedItem[];
  confidence: number;
  error?: string;
}

export interface ParsedStockItem {
  ingredient_id?: string;
  ingredient_name: string;
  quantity: number;
  unit?: string;
  confidence: number;
  needs_review: boolean;
  raw_text?: string;
}

export interface ParsedStockResponse {
  success: boolean;
  check_type?: "warehouse" | "bar";
  items: ParsedStockItem[];
  confidence: number;
  items_needing_review: number;
  warnings: string[];
  error?: string;
}

// =============================================
// AI SERVICE CLASS
// =============================================

class AIService {
  /**
   * Compress image before upload
   * Per .antigravityrules: Use expo-image-manipulator for compression
   */
  async compressImage(uri: string): Promise<string> {
    console.log("[AIService] Compressing image...");

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: IMAGE_CONFIG.maxWidth,
            height: IMAGE_CONFIG.maxHeight,
          },
        },
      ],
      {
        compress: IMAGE_CONFIG.quality,
        format: IMAGE_CONFIG.format,
      }
    );

    console.log(`[AIService] Compressed: ${uri} -> ${result.uri}`);
    return result.uri;
  }

  /**
   * Convert image to base64 for Edge Function
   */
  async imageToBase64(uri: string): Promise<string> {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as const,
    });
    return base64;
  }

  /**
   * Call Edge Function
   */
  private async callEdgeFunction<T>(
    functionName: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

    console.log(`[AIService] Calling ${functionName}...`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge function error: ${error}`);
    }

    const data = await response.json();
    console.log(`[AIService] ${functionName} response:`, data);

    return data as T;
  }

  // =============================================
  // PUBLIC API - Called by Hooks
  // =============================================

  /**
   * Parse supplier invoice (Snap 1)
   * Per .antigravityrules Section D.1
   */
  async parseInvoice(
    imageUri: string,
    businessId: string
  ): Promise<ParsedInvoiceResponse> {
    try {
      // 1. Compress image
      const compressedUri = await this.compressImage(imageUri);

      // 2. Convert to base64
      const base64 = await this.imageToBase64(compressedUri);

      // 3. Call Edge Function
      const result = await this.callEdgeFunction<ParsedInvoiceResponse>(
        "ai-parse-invoice",
        {
          image_base64: base64,
          business_id: businessId,
        }
      );

      return result;
    } catch (error) {
      console.error("[AIService] parseInvoice error:", error);
      return {
        success: false,
        items: [],
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse POS sales report (Snap 2)
   * Per .antigravityrules Section D.2
   */
  async parseSalesReport(
    imageUri: string,
    businessId: string
  ): Promise<ParsedSalesResponse> {
    try {
      const compressedUri = await this.compressImage(imageUri);
      const base64 = await this.imageToBase64(compressedUri);

      const result = await this.callEdgeFunction<ParsedSalesResponse>(
        "ai-parse-sales",
        {
          image_base64: base64,
          business_id: businessId,
        }
      );

      return result;
    } catch (error) {
      console.error("[AIService] parseSalesReport error:", error);
      return {
        success: false,
        items_sold: [],
        items_deducted: [],
        confidence: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Parse handwritten stock sheet (Snap 3)
   * Per .antigravityrules Section D.3
   *
   * @param areaType - "warehouse" (Partial) or "bar" (Full)
   */
  async parseStockSheet(
    imageUri: string,
    businessId: string,
    areaType: "warehouse" | "bar"
  ): Promise<ParsedStockResponse> {
    try {
      const compressedUri = await this.compressImage(imageUri);
      const base64 = await this.imageToBase64(compressedUri);

      const result = await this.callEdgeFunction<ParsedStockResponse>(
        "ai-parse-handwriting",
        {
          image_base64: base64,
          business_id: businessId,
          area_type: areaType,
        }
      );

      return result;
    } catch (error) {
      console.error("[AIService] parseStockSheet error:", error);
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
   * Trigger fraud detection (after sync)
   */
  async runFraudDetection(
    businessId: string,
    checkTypes?: string[]
  ): Promise<{
    success: boolean;
    alerts_generated: number;
    alerts: unknown[];
  }> {
    try {
      const result = await this.callEdgeFunction<{
        success: boolean;
        alerts_generated: number;
        alerts: unknown[];
      }>("fraud-detection", {
        business_id: businessId,
        check_types: checkTypes,
      });

      return result;
    } catch (error) {
      console.error("[AIService] runFraudDetection error:", error);
      return {
        success: false,
        alerts_generated: 0,
        alerts: [],
      };
    }
  }
}

// Singleton instance
export const aiService = new AIService();

// =============================================
// CONVENIENCE FUNCTIONS (for cleaner imports)
// =============================================

export const parseInvoiceWithAI = aiService.parseInvoice.bind(aiService);
export const parseSalesWithAI = aiService.parseSalesReport.bind(aiService);
export const parseStockWithAI = aiService.parseStockSheet.bind(aiService);
