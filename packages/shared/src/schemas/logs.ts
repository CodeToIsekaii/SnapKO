// packages/shared/src/schemas/logs.ts
// Unified Log Schemas for 3-Snap Workflow with Multi-Location
// Per .antigravityrules Section D

import { z } from "zod";
import { VarianceReasonEnum } from "./inventory";

// =============================================
// STORAGE AREA SCHEMA
// =============================================

export const StorageAreaSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["STORAGE", "SERVICE"]),
  store_code: z.string().optional(),
  address: z.string().optional(),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
});

export type StorageArea = z.infer<typeof StorageAreaSchema>;

// =============================================
// STOCK LEVEL SCHEMA
// =============================================

export const StockLevelSchema = z.object({
  id: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  area_id: z.string().uuid(),
  quantity: z.number().min(0),
  last_counted_at: z.string().datetime().optional(),
  last_counted_by: z.string().uuid().optional(),
});

export type StockLevel = z.infer<typeof StockLevelSchema>;

// =============================================
// IMPORT LOG SCHEMA (Snap 1 - Inbound)
// =============================================

export const ImportLogItemSchema = z.object({
  ingredient_id: z.string().uuid().optional(),
  ingredient_name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unit_price: z.number().min(0),
  total_price: z.number().min(0),
  confidence: z.number().min(0).max(100).default(0),
  user_confirmed: z.boolean().default(false),
});

export type ImportLogItem = z.infer<typeof ImportLogItemSchema>;

export const ImportLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  // Target area (NEW for multi-location)
  target_area_id: z.string().uuid().optional(),

  // Invoice metadata
  invoice_number: z.string().optional(),
  supplier_name: z.string().optional(),
  invoice_date: z.string().optional(),
  total_amount: z.number().min(0).optional(),

  // Photo
  invoice_photo_url: z.string().url().optional(),

  // Items
  items_json: z.array(ImportLogItemSchema).default([]),

  // AI
  ai_confidence: z.number().min(0).max(100).optional(),

  // Audit
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type ImportLog = z.infer<typeof ImportLogSchema>;

// =============================================
// SALES LOG SCHEMA (Snap 2 - Outbound)
// =============================================

export const SalesLogItemSchema = z.object({
  menu_item_name: z.string(),
  recipe_id: z.string().uuid().optional(),
  quantity_sold: z.number().int().positive(),
  unit_price: z.number().min(0).optional(),
  total_revenue: z.number().min(0).optional(),
  confidence: z.number().min(0).max(100).default(0),
});

export type SalesLogItem = z.infer<typeof SalesLogItemSchema>;

export const DeductedItemSchema = z.object({
  ingredient_id: z.string().uuid(),
  ingredient_name: z.string(),
  deducted_qty: z.number().min(0),
  unit: z.string(),
  unit_cost: z.number().min(0).optional(),
});

export type DeductedItem = z.infer<typeof DeductedItemSchema>;

export const SalesLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  // Report metadata
  report_date: z.string(),
  shift: z.enum(["morning", "afternoon", "evening", "full_day"]).optional(),
  total_revenue: z.number().min(0).optional(),

  // Photo
  report_photo_url: z.string().url().optional(),

  // Items
  items_sold_json: z.array(SalesLogItemSchema).default([]),
  items_deducted_json: z.array(DeductedItemSchema).default([]),

  // AI
  ai_confidence: z.number().min(0).max(100).optional(),

  // Audit
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type SalesLog = z.infer<typeof SalesLogSchema>;

// =============================================
// TRANSFER LOG SCHEMA (Internal Moves)
// =============================================

export const TransferItemSchema = z.object({
  ingredient_id: z.string().uuid(),
  ingredient_name: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string(),
});

export type TransferItem = z.infer<typeof TransferItemSchema>;

export const TransferLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  from_area_id: z.string().uuid(),
  to_area_id: z.string().uuid(),

  items_json: z.array(TransferItemSchema).default([]),

  transfer_ticket_photo_url: z.string().url().optional(),
  notes: z.string().optional(),

  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type TransferLog = z.infer<typeof TransferLogSchema>;

// =============================================
// INVENTORY LOG SCHEMA (Snap 3 - Stock Take)
// =============================================

export const InventoryLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  ingredient_id: z.string().uuid(),

  // Multi-location (NEW)
  area_id: z.string().uuid().optional(),
  is_partial_check: z.boolean().default(false),

  // Stock check data
  location: z.enum(["warehouse", "bar"]).optional(), // Legacy
  type: z.enum(["stock_take", "adjustment", "transfer"]),

  // Quantities
  theoretical_qty: z.number().default(0),
  actual_qty: z.number().min(0),
  variance: z.number(),
  variance_percentage: z.number(),

  // Gatekeeper fields
  variance_reason: VarianceReasonEnum.optional(),
  evidence_photo_url: z.string().url().optional(),
  notes: z.string().optional(),

  // AI
  ai_confidence: z.number().min(0).max(100).optional(),

  // Photo
  source_photo_url: z.string().url().optional(),

  // Audit
  unit: z.string(),
  created_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type InventoryLog = z.infer<typeof InventoryLogSchema>;
