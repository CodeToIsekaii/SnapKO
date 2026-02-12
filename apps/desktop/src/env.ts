/**
 * Environment Variables Wrapper for Desktop App
 *
 * Per .antigravityrules: "NEVER access environment variables directly in UI code.
 * MUST create and use src/env.ts with Zod validation."
 *
 * Works for both:
 * - Main process: uses dotenv + process.env
 * - Renderer process: uses import.meta.env
 */

import { z } from "zod";

// Detect if we're in main process (Node.js) or renderer (Vite)
const isMainProcess =
  typeof process !== "undefined" && process.versions?.electron;

// Load .env for main process
if (isMainProcess) {
  // Dynamic import to avoid bundling issues in renderer
  const { config } = require("dotenv");
  const { join } = require("node:path");
  // Use process.cwd() which is apps/desktop when running electron
  config({ path: join(process.cwd(), ".env") });
}

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a valid URL"),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "VITE_SUPABASE_ANON_KEY is required"),
  VITE_BACKEND_URL: z.string().url("VITE_BACKEND_URL must be a valid URL"),
});

// Get env vars from appropriate source
const envSource = isMainProcess
  ? {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
      VITE_BACKEND_URL: process.env.VITE_BACKEND_URL,
    }
  : {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
    };

// Parse and validate env vars at startup
const _env = schema.safeParse(envSource);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  console.error("Check your .env file has these variables:");
  console.error("  VITE_SUPABASE_URL=https://your-project.supabase.co");
  console.error("  VITE_SUPABASE_ANON_KEY=your-anon-key");
  console.error("  VITE_BACKEND_URL=http://localhost:5000");
  throw new Error("Invalid environment variables - check console for details");
}

/**
 * Type-safe environment variables
 * Access via: Env.VITE_SUPABASE_URL, Env.VITE_SUPABASE_ANON_KEY
 */
export const Env = _env.data;

// Type export for consumers
export type EnvType = z.infer<typeof schema>;
