/**
 * SnapKO Desktop - Sync Engine
 *
 * Implements ONE-WAY SYNC (Server → Client) for Week 1
 * Per Plan: Desktop = Read-only viewer, no push sync yet
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDatabase } from "./database";
import { Env } from "../env";

// Sync client instance (initialized when auth token is set)
let syncClient: SupabaseClient | null = null;
let currentToken: string | null = null;

// Environment variables (validated via Zod in env.ts)
const SUPABASE_URL = Env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.VITE_SUPABASE_ANON_KEY;

/**
 * Set auth token and initialize sync client
 * Called from renderer after login or token refresh
 */
export function setAuthToken(token: string | null): boolean {
  if (!token) {
    syncClient = null;
    currentToken = null;
    console.log("[Sync] Auth token cleared");
    return true;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[Sync] Missing Supabase env vars");
    return false;
  }

  currentToken = token;
  syncClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  console.log("[Sync] Auth token set, sync client initialized");
  return true;
}

/**
 * Get current sync client (for use by other modules)
 */
export function getSyncClient(): SupabaseClient | null {
  return syncClient;
}

/**
 * Check if sync client is ready
 */
export function isSyncReady(): boolean {
  return syncClient !== null;
}

/**
 * Pull ingredients from Supabase to local SQLite
 */
export async function pullIngredients(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, synced: 0, error: "Not authenticated" };
  }

  try {
    const db = getDatabase();

    // Fetch ingredients from Supabase (user's business only via RLS)
    const { data: ingredients, error } = await syncClient
      .from("ingredients")
      .select(
        "id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, created_at, archived"
      )
      .eq("archived", false);

    if (error) {
      throw new Error(error.message);
    }

    if (!ingredients || ingredients.length === 0) {
      return { success: true, synced: 0 };
    }

    // Upsert to local SQLite in a transaction
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO local_ingredients 
      (id, business_id, name, base_unit, warehouse_qty, bar_qty, unit_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const ing of ingredients) {
        stmt.run(
          ing.id,
          ing.business_id,
          ing.name,
          ing.base_unit,
          ing.warehouse_qty ?? 0,
          ing.bar_qty ?? 0,
          ing.unit_cost ?? 0,
          ing.created_at
        );
      }
    });

    transaction();

    console.log(`[Sync] Pulled ${ingredients.length} ingredients`);
    return { success: true, synced: ingredients.length };
  } catch (err: any) {
    console.error("[Sync] Pull error:", err);
    return { success: false, synced: 0, error: err.message };
  }
}

/**
 * Full pull sync - ingredients
 */
export async function pullAll(): Promise<{
  success: boolean;
  synced: number;
  error?: string;
}> {
  if (!syncClient) {
    return { success: false, synced: 0, error: "Not authenticated" };
  }

  const ingredientsResult = await pullIngredients();

  if (!ingredientsResult.success) {
    return ingredientsResult;
  }

  return {
    success: true,
    synced: ingredientsResult.synced,
  };
}
