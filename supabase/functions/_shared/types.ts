/**
 * Shared Types for Edge Functions
 * Common interfaces used across AI parsing functions
 */

// ============================================
// Base Ingredient Item (common across all parsers)
// ============================================

export interface BaseIngredientItem {
  ingredient_name: string;
  quantity: number;
  unit: string;
  confidence: number;
}

// ============================================
// Invoice Parsing Types
// ============================================

export interface InvoiceItem extends BaseIngredientItem {
  unit_price: number;
  total_price: number;
}

export interface ParsedInvoice {
  invoice_number?: string;
  supplier_name?: string;
  invoice_date?: string;
  total_amount?: number;
  items: InvoiceItem[];
  overall_confidence: number;
  raw_text?: string;
}

// ============================================
// Handwriting/Stock Sheet Parsing Types
// ============================================

export interface StockItem {
  ingredient_name: string;
  stock_qty: number; // Main quantity (e.g., 2 hộp)
  import_qty: number; // Import from warehouse
  unit?: string; // Main unit (e.g., hộp)
  partial_qty?: number; // Partial quantity (e.g., 150 from "150g")
  partial_unit?: string; // Partial unit (e.g., "g")
  merged_qty?: number; // Final merged quantity in base unit (calculated)
  confidence: number;
  needs_review: boolean;
  raw_text?: string;
}

export interface ParsedStockSheet {
  check_type?: "warehouse" | "bar";
  items: StockItem[];
  overall_confidence: number;
  raw_text?: string;
  warnings: string[];
}

// ============================================
// Recipe Parsing Types
// ============================================

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface ParsedRecipe {
  name: string;
  category: string;
  price: number | null;
  ingredients: RecipeIngredient[];
  confidence: number;
}

// ============================================
// Menu Parsing Types
// ============================================

export interface MenuItem {
  name: string;
  price: number;
  category?: string;
  description?: string;
}

export interface ParsedMenu {
  items: MenuItem[];
  overall_confidence: number;
}

// ============================================
// Common Response Types
// ============================================

export interface AIParseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  confidence?: number;
}

// ============================================
// Database Ingredient Match
// ============================================

export interface IngredientMatch {
  id: string;
  name: string;
  base_unit: string;
  similarity_score: number;
}
