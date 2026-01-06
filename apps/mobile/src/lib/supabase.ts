/**
 * Supabase Client Singleton
 * Per .antigravityrules: Centralized in lib/supabase.ts
 *
 * Usage: import { supabase } from '@/lib/supabase';
 */

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Env } from "../env";

// Custom storage adapter for React Native using expo-secure-store
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error("SecureStore setItem error:", error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error("SecureStore removeItem error:", error);
    }
  },
};

/**
 * Supabase Client Singleton Instance
 * - Auth state persisted in SecureStore
 * - Auto-refresh tokens enabled
 */
export const supabase = createClient(Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for React Native
  },
});

/**
 * Helper to get current user ID
 */
export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Helper to get current user's business_id from profile
 */
export async function getCurrentBusinessId(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("business_id")
    .eq("id", userId)
    .single();

  return data?.business_id ?? null;
}

/**
 * Helper to check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return !!session;
}

/**
 * Sync business config from server to local SQLite
 * Fetches inventory_model from profiles table and updates local_profiles
 * Returns the inventory_model or null if not set
 */
export async function syncBusinessConfig(): Promise<{
  inventoryModel: string | null;
  businessName: string | null;
  businessId: string | null;
  success: boolean;
}> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.log("[syncBusinessConfig] No session");
      return {
        inventoryModel: null,
        businessName: null,
        businessId: null,
        success: false,
      };
    }

    // Fetch profile with inventory_model, role and business info
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        `
        inventory_model,
        business_id,
        role,
        businesses (
          name,
          inventory_model
        )
      `
      )
      .eq("id", session.user.id)
      .single();

    if (error) {
      console.error("[syncBusinessConfig] Query error:", error);
      return {
        inventoryModel: null,
        businessName: null,
        businessId: null,
        success: false,
      };
    }

    console.log(
      "[syncBusinessConfig] Raw Profile:",
      JSON.stringify(profile, null, 2)
    );

    // Prioritize GLOBAL business model over LEGACY profile model
    const businessModel = (profile?.businesses as any)?.inventory_model;
    const inventoryModel =
      businessModel || profile?.inventory_model || "STANDARD";
    const businessName = (profile?.businesses as any)?.name || null;

    console.log("[syncBusinessConfig] Fetched from server:", {
      businessName,
      inventoryModel,
      source: businessModel ? "GLOBAL BUSINESS" : "LEGACY PROFILE",
    });

    // Update local SQLite if we have a model (use INSERT OR REPLACE for empty DB)
    if (inventoryModel) {
      try {
        const { getDB } = await import("../db");
        const db = await getDB();

        // Check if db is properly initialized
        if (!db) {
          console.warn(
            "[syncBusinessConfig] Database not ready yet, skipping local update"
          );
          return {
            inventoryModel,
            businessName,
            businessId: profile?.business_id || null,
            success: true,
          };
        }

        const userRole = profile?.role || "STAFF"; // Default to STAFF if not set
        await db.runAsync(
          `INSERT OR REPLACE INTO local_profiles 
           (id, business_id, role, status, inventory_model, created_at) 
           VALUES (?, ?, ?, 'active', ?, datetime('now'))`,
          [
            session.user.id,
            profile?.business_id || "",
            userRole,
            inventoryModel,
          ]
        );
        console.log(
          "✅ Local DB updated with role:",
          userRole,
          "inventory_model:",
          inventoryModel
        );
      } catch (dbErr: any) {
        // Handle database not ready or NullPointerException
        console.warn(
          "[syncBusinessConfig] DB update skipped (not ready):",
          dbErr?.message || dbErr
        );
        // Still return success since we got data from server
        return {
          inventoryModel,
          businessName,
          businessId: profile?.business_id || null,
          success: true,
        };
      }
    }

    return {
      inventoryModel,
      businessName,
      businessId: profile?.business_id || null,
      success: true,
    };
  } catch (err) {
    console.error("[syncBusinessConfig] Error:", err);
    return {
      inventoryModel: null,
      businessName: null,
      businessId: null,
      success: false,
    };
  }
}

// Re-export types for convenience
export type { Session, User } from "@supabase/supabase-js";
