// packages/shared/src/schemas/invoice.ts
// Invoice/Import-related Zod schemas and types

import { z } from "zod";

// =============================================
// INVOICE ITEM (Parsed from AI)
// =============================================

export const InvoiceItemSchema = z.object({
  // Matched ingredient (if found in DB)
  ingredient_id: z.string().uuid().optional(),

  // Raw parsed data from AI
  ingredient_name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unit_price: z.number().min(0),
  total_price: z.number().min(0),

  // AI confidence for this specific item
  confidence: z.number().min(0).max(100).default(0),

  // Whether user has confirmed/edited this item
  user_confirmed: z.boolean().default(false),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

// =============================================
// IMPORT LOG SCHEMA (Inbound Inventory)
// =============================================

export const ImportLogSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),

  // Invoice metadata
  invoice_number: z.string().optional(),
  supplier_name: z.string().optional(),
  invoice_date: z.string().optional(), // ISO date
  total_amount: z.number().min(0).optional(),

  // Photo evidence
  invoice_photo_url: z.string().url().optional(),

  // Parsed items
  items: z.array(InvoiceItemSchema).default([]),

  // AI metadata
  ai_confidence: z.number().min(0).max(100).optional(),

  // Audit
  created_by: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type ImportLog = z.infer<typeof ImportLogSchema>;

// =============================================
// AI PARSE INVOICE REQUEST/RESPONSE
// =============================================

export const AIParseInvoiceRequestSchema = z.object({
  image_base64: z.string(),
  business_id: z.string().uuid(),
  // Existing ingredients for matching
  existing_ingredients: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        base_unit: z.string(),
      })
    )
    .optional(),
});

export type AIParseInvoiceRequest = z.infer<typeof AIParseInvoiceRequestSchema>;

export const AIParseInvoiceResponseSchema = z.object({
  success: z.boolean(),

  // Parsed data
  invoice_number: z.string().optional(),
  supplier_name: z.string().optional(),
  invoice_date: z.string().optional(),
  total_amount: z.number().optional(),

  items: z.array(InvoiceItemSchema).default([]),

  // Overall confidence
  confidence: z.number().min(0).max(100),

  // Raw for debugging
  raw_text: z.string().optional(),

  error: z.string().optional(),
});

export type AIParseInvoiceResponse = z.infer<
  typeof AIParseInvoiceResponseSchema
>;
