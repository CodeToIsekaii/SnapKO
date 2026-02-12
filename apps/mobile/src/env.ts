/**
 * Environment Variables Wrapper for Mobile App
 *
 * Per .antigravityrules: "NEVER access environment variables directly in UI code.
 * MUST create and use src/env.ts with Zod validation."
 *
 * Usage: import { Env } from './env';
 */

import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url("EXPO_PUBLIC_SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, "EXPO_PUBLIC_SUPABASE_ANON_KEY is required"),
  EAS_PROJECT_ID: z.string().optional(),
  BACKEND_URL: z.string().url("EXPO_PUBLIC_BACKEND_URL must be a valid URL"),
});

// Parse and validate env vars at startup
const _env = schema.safeParse({
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL,
});

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  // In development, show what's missing
  if (__DEV__) {
    console.error("Check your .env file has these variables:");
    console.error(
      "  EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co",
    );
    console.error("  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key");
    console.error("  EXPO_PUBLIC_BACKEND_URL=http://your-ip:3000");
  }
  throw new Error("Invalid environment variables - check console for details");
}

/**
 * Type-safe environment variables
 * Access via: Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY
 */
export const Env = _env.data;

// Type export for consumers
export type EnvType = z.infer<typeof schema>;
