// packages/shared/src/schemas/sales.ts
// Sales/POS-related Zod schemas and types

import { z } from "zod";

// =============================================
// SOLD ITEM (Parsed from POS Report)
// =============================================

export const SoldItemSchema = z.object({
  // Menu item info
  menu_item_name: z.string(),
  recipe_id: z.string().uuid().optional(), // Linked recipe if matched

  // Quantity sold
  quantity_sold: z.number().int().positive(),

  // Revenue (if available)
  unit_price: z.number().min(0).optional(),
  total_revenue: z.number().min(0).optional(),

  // AI confidence
  confidence: z.number().min(0).max(100).default(0),

  // User confirmation
  user_confirmed: z.boolean().default(false),
});

export type SoldItem = z.infer<typeof SoldItemSchema>;

// =============================================
// DEDUCTED INGREDIENT (Calculated from Recipes)
// =============================================

export const DeductedIngredientSchema = z.object({
  ingredient_id: z.string().uuid(),
  ingredient_name: z.string(),
  deducted_qty: z.number().min(0),
  unit: z.string(),

  // Cost calculation
  unit_cost: z.number().min(0).optional(),
  total_cost: z.number().min(0).optional(),
});

export type DeductedIngredient = z.infer<typeof DeductedIngredientSchema>;

// =============================================
// SALES LOG SCHEMA (Outbound Sales)
// =============================================

export const SalesLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  // Report metadata
  report_date: z.string(), // ISO date
  shift: z.enum(["morning", "afternoon", "evening", "full_day"]).optional(),
  total_revenue: z.number().min(0).optional(),

  // Photo evidence
  report_photo_url: z.string().url().optional(),

  // Parsed sold items
  items_sold: z.array(SoldItemSchema).default([]),

  // Calculated deductions from recipes
  items_deducted: z.array(DeductedIngredientSchema).default([]),

  // AI metadata
  ai_confidence: z.number().min(0).max(100).optional(),

  // Audit
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type SalesLog = z.infer<typeof SalesLogSchema>;

// =============================================
// AI PARSE SALES REQUEST/RESPONSE
// =============================================

export const AIParseSalesRequestSchema = z.object({
  image_base64: z.string(),
  business_id: z.string().uuid(),
  // Existing recipes for matching
  existing_recipes: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
      })
    )
    .optional(),
});

export type AIParseSalesRequest = z.infer<typeof AIParseSalesRequestSchema>;

export const AIParseSalesResponseSchema = z.object({
  success: z.boolean(),

  // Parsed data
  report_date: z.string().optional(),
  total_revenue: z.number().optional(),

  items_sold: z.array(SoldItemSchema).default([]),

  // Overall confidence
  confidence: z.number().min(0).max(100),

  error: z.string().optional(),
});

export type AIParseSalesResponse = z.infer<typeof AIParseSalesResponseSchema>;
