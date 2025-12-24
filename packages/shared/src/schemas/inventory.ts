// packages/shared/src/schemas/inventory.ts
// Inventory-related Zod schemas and types

import { z } from "zod";

// =============================================
// VARIANCE REASON - Required for Gatekeeper Logic
// =============================================

export const VarianceReasonEnum = z.enum([
  "VOID_SALE", // Voided sale not recorded
  "FORGOT_IMPORT", // Import not logged
  "SPILLAGE", // Accidental spillage
  "SPOILAGE", // Product expired/damaged
  "THEFT_SUSPECTED", // Potential theft
  "MEASUREMENT_ERROR", // Weighing/counting error
  "RECIPE_CHANGED", // Recipe modified but not updated
  "TRANSFER_MISSING", // Bar to warehouse transfer not logged
  "OTHER", // Other reason (requires notes)
]);

export type VarianceReason = z.infer<typeof VarianceReasonEnum>;

// =============================================
// INVENTORY LOG SCHEMA
// =============================================

export const InventoryLogSchema = z.object({
  id: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  business_id: z.string().uuid(),

  location: z.enum(["warehouse", "bar"]),
  type: z.enum(["stock_take", "adjustment", "transfer"]),

  // Quantities
  theoretical_qty: z.number().default(0),
  actual_qty: z.number().min(0),
  variance: z.number(), // actual - theoretical
  variance_percentage: z.number(), // (variance / theoretical) * 100

  // For high variance (> threshold) - MANDATORY
  variance_reason: VarianceReasonEnum.optional(),
  evidence_photo_url: z.string().url().optional(),
  notes: z.string().optional(),

  // AI confidence
  ai_confidence: z.number().min(0).max(100).optional(),

  // Metadata
  unit: z.string(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type InventoryLog = z.infer<typeof InventoryLogSchema>;

// =============================================
// PENDING SYNC LOG (Mobile Local Storage)
// =============================================

export const PendingSyncLogSchema = z.object({
  id: z.string(),
  log_type: z.enum(["inventory", "import", "sales"]),
  data_json: z.string(), // Stringified log data
  local_image_path: z.string().optional(),
  sync_status: z.enum(["pending", "syncing", "synced", "error"]),
  created_at: z.string().datetime(),
  error_message: z.string().optional(),
  retry_count: z.number().default(0),
});

export type PendingSyncLog = z.infer<typeof PendingSyncLogSchema>;

// =============================================
// FRAUD ALERT SCHEMA
// =============================================

export const FraudAlertTypeEnum = z.enum([
  "high_variance",
  "perfect_match",
  "pattern_anomaly",
  "missing_evidence",
]);

export const FraudRiskLevelEnum = z.enum(["low", "medium", "high", "critical"]);

export const FraudAlertSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  log_type: z.enum(["inventory_log", "import_log", "sales_log"]),
  log_id: z.string().uuid(),

  alert_type: FraudAlertTypeEnum,
  risk_level: FraudRiskLevelEnum,

  ingredient_id: z.string().uuid().optional(),
  variance_percentage: z.number().optional(),
  theoretical_qty: z.number().optional(),
  actual_qty: z.number().optional(),

  reason_selected: z.string().optional(),
  evidence_photo_url: z.string().url().optional(),
  notes: z.string().optional(),

  resolved_at: z.string().datetime().optional(),
  resolved_by: z.string().uuid().optional(),
  created_at: z.string().datetime(),
});

export type FraudAlert = z.infer<typeof FraudAlertSchema>;
