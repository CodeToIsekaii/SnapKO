/**
 * Ingredient Validation Schemas
 * Used for creating/editing ingredients across Mobile & Desktop
 *
 * Usage:
 *   import { createIngredientSchema } from '@snapko/shared';
 *   const result = createIngredientSchema.safeParse(data);
 */

import { z } from "zod";

// Common units for F&B ingredients
export const INGREDIENT_UNITS = [
  "kg",
  "g",
  "lít",
  "ml",
  "chai",
  "lon",
  "hộp",
  "gói",
  "quả",
  "cái",
  "thùng",
] as const;

export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

// ================== CREATE INGREDIENT SCHEMA ==================

export const createIngredientSchema = z.object({
  name: z
    .string()
    .min(2, "Tên nguyên liệu tối thiểu 2 ký tự")
    .max(100, "Tên nguyên liệu quá dài")
    .transform((v) => v.trim()),
  baseUnit: z.string().min(1, "Vui lòng chọn đơn vị"),
  unitCost: z
    .number()
    .min(0, "Giá vốn không được âm")
    .max(999999999, "Giá vốn quá lớn"),
  // Density: g/ml (Default 1 for water-like liquids)
  density: z.number().min(0.1, "Tỷ trọng tối thiểu 0.1").default(1),
  // Tare Weight (g): weight of the empty container
  tareWeight: z.number().min(0, "Trọng lượng vỏ không được âm").default(0),
  // Aliases for AI recognition, comma-separated or array
  aliases: z.array(z.string()).optional().default([]),
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;

// ================== UPDATE INGREDIENT SCHEMA ==================

export const updateIngredientSchema = z.object({
  name: z
    .string()
    .min(2, "Tên nguyên liệu tối thiểu 2 ký tự")
    .max(100, "Tên nguyên liệu quá dài")
    .transform((v) => v.trim())
    .optional(),
  baseUnit: z.string().min(1).optional(),
  unitCost: z.number().min(0, "Giá vốn không được âm").optional(),
  density: z.number().min(0.1).optional(),
  tareWeight: z.number().min(0).optional(),
  aliases: z.array(z.string()).optional(),
  warehouseQty: z.number().min(0).optional(),
  barQty: z.number().min(0).optional(),
});

export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;

// ================== HELPER: Parse Aliases from Comma-Separated String ==================

export function parseAliases(aliasString: string): string[] {
  if (!aliasString || !aliasString.trim()) return [];
  return aliasString
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ================== HELPER: Format Number for VND Display ==================

export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + " đ";
}
