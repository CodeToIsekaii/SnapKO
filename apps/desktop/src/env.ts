/**
 * Environment Variables Wrapper for Desktop App
 *
 * Per .antigravityrules: "NEVER access environment variables directly in UI code.
 * MUST create and use src/env.ts with Zod validation."
 *
 * Desktop uses Vite's import.meta.env.VITE_* prefix
 */

import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_ANON_KEY is required"),
});

// Parse and validate env vars at startup
const _env = schema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  console.error("Check your .env file has these variables:");
  console.error("  VITE_SUPABASE_URL=https://your-project.supabase.co");
  console.error("  VITE_SUPABASE_ANON_KEY=your-anon-key");
  throw new Error("Invalid environment variables - check console for details");
}

/**
 * Type-safe environment variables
 * Access via: Env.VITE_SUPABASE_URL, Env.VITE_SUPABASE_ANON_KEY
 */
export const Env = _env.data;

// Type export for consumers
export type EnvType = z.infer<typeof schema>;
