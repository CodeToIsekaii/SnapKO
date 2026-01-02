/**
 * SnapKO Auth & Invite Validation Schemas
 * Shared across Mobile, Desktop, and Edge Functions
 *
 * Usage:
 *   import { loginSchema, inviteJoinSchema } from '@snapko/shared/schemas';
 *   const result = loginSchema.safeParse({ email, password });
 */

import { z } from "zod";

// ================== LOGIN SCHEMA (Owner) ==================

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email là bắt buộc")
    .email("Email không hợp lệ")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(6, "Mật khẩu tối thiểu 6 ký tự")
    .max(72, "Mật khẩu quá dài"), // bcrypt limit
});

export type LoginInput = z.infer<typeof loginSchema>;

// ================== REGISTER SCHEMA (Owner) ==================

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email là bắt buộc")
      .email("Email không hợp lệ")
      .transform((v) => v.toLowerCase().trim()),
    password: z
      .string()
      .min(6, "Mật khẩu tối thiểu 6 ký tự")
      .max(72, "Mật khẩu quá dài"),
    confirmPassword: z.string(),
    businessName: z
      .string()
      .min(2, "Tên quán tối thiểu 2 ký tự")
      .max(100, "Tên quán quá dài")
      .optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ================== INVITE CODE SCHEMA (Step 1) ==================

export const inviteCodeSchema = z.object({
  inviteCode: z
    .string()
    .length(6, "Mã mời phải có 6 ký tự")
    .regex(/^[A-Z0-9]+$/, "Mã mời chỉ gồm chữ in hoa và số")
    .transform((v) => v.toUpperCase().trim()),
});

export type InviteCodeInput = z.infer<typeof inviteCodeSchema>;

// ================== INVITE JOIN SCHEMA (Step 2 - Staff Info) ==================

// Vietnamese phone regex: starts with 0, 10-11 digits total
const vietnamesePhoneRegex = /^0[0-9]{9,10}$/;

export const inviteJoinSchema = z.object({
  inviteCode: z
    .string()
    .length(6, "Mã mời phải có 6 ký tự")
    .regex(/^[A-Z0-9]+$/, "Mã mời không hợp lệ")
    .transform((v) => v.toUpperCase().trim()),
  fullName: z
    .string()
    .min(2, "Họ tên tối thiểu 2 ký tự")
    .max(100, "Họ tên quá dài")
    .transform((v) => v.trim()),
  phoneNumber: z
    .string()
    .transform((v) => v.replace(/\s+/g, "")) // Remove whitespace
    .refine((v) => vietnamesePhoneRegex.test(v), {
      message: "Số điện thoại không hợp lệ (VD: 0901234567)",
    }),
  password: z
    .string()
    .min(6, "Mật khẩu tối thiểu 6 ký tự")
    .max(72, "Mật khẩu quá dài"),
});

export type InviteJoinInput = z.infer<typeof inviteJoinSchema>;

// ================== HELPER FUNCTIONS ==================

/**
 * Validate and return errors for form fields
 * @returns Object with field names as keys and error messages as values
 */
export function getFieldErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Record<string, string> {
  const result = schema.safeParse(data);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return errors;
}

/**
 * Get first error message from validation result
 */
export function getFirstError<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): string | null {
  const result = schema.safeParse(data);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
}
