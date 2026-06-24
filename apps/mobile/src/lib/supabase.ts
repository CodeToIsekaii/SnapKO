/**
 * Supabase Client Singleton
 * Per .antigravityrules: Centralized in lib/supabase.ts
 *
 * Usage: import { supabase } from '@/lib/supabase';
 *
 * IMPORTANT: This MUST use the same storage adapter as AuthContext (AsyncStorage)
 * Using different adapters causes session mismatch issues!
 *
 * Why AsyncStorage over SecureStore?
 * - Supabase sessions can exceed SecureStore's 2KB limit
 * - AsyncStorage is recommended by Supabase for React Native
 * - Still secure via App Sandbox isolation
 */

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Env } from "../env";
import { api } from "../services/api";
import { updateProRebaselineFromSubscription } from "../utils/proRebaseline";

function isNetworkRequestFailure(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Network request failed");
}

function isUnauthorizedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message || "";
  return (
    message.includes('"statusCode":401') ||
    message.includes('"status":401') ||
    message.includes("Unauthorized") ||
    message.includes("HTTP 401")
  );
}

/**
 * Supabase Client Singleton Instance
 * - Auth state persisted in AsyncStorage (same as AuthContext!)
 * - Auto-refresh tokens enabled
 */
export const supabase = createClient(Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage, // MUST match AuthContext to share session!
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
 * Helper to get current user's business_id from profile (via BE-SnapKO)
 */
export async function getCurrentBusinessId(): Promise<string | null> {
  try {
    const profile = await api.get<{ businessId?: string }>("/profiles/me");
    return profile?.businessId ?? null;
  } catch (err) {
    if (isNetworkRequestFailure(err)) {
      console.log("[getCurrentBusinessId] Backend unavailable, using local state.");
    } else if (isUnauthorizedError(err)) {
      console.log(
        "[getCurrentBusinessId] Unauthorized (missing/expired backend token), using local state.",
      );
    } else {
      console.error("[getCurrentBusinessId] error:", err);
    }
    return null;
  }
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
  effectiveTier: string | null;
  subscriptionStatus: string | null;
  entitlements: {
    canUseDualWarehouse: boolean;
    canUseCustomStorageAreas: boolean;
    canInviteStaff: boolean;
    canUseCloudSync: boolean;
    canUseFraudProtection: boolean;
    canUseAdvancedReports: boolean;
  } | null;
  businessName: string | null;
  businessId: string | null;
  success: boolean;
}> {
  try {
    const profile = await api.get<{
      id: string;
      businessId?: string;
      role?: string;
      inventoryModel?: string;
      business?: {
        name?: string;
        inventoryModel?: string;
        effectiveInventoryModel?: string;
        effectiveTier?: string;
        subscriptionStatus?: string;
        subscriptionExpiresAt?: string | null;
        entitlements?: {
          canUseDualWarehouse: boolean;
          canUseCustomStorageAreas: boolean;
          canInviteStaff: boolean;
          canUseCloudSync: boolean;
          canUseFraudProtection: boolean;
          canUseAdvancedReports: boolean;
        };
      };
    }>("/profiles/me");

    if (!profile) {
      return {
        inventoryModel: null,
        effectiveTier: null,
        subscriptionStatus: null,
        entitlements: null,
        businessName: null,
        businessId: null,
        success: false,
      };
    }

    // Trust only the backend-computed effective model. Raw business/profile model
    // can stay STANDARD after downgrade/expiry and must not unlock UI.
    const effectiveBusinessModel = profile.business?.effectiveInventoryModel;
    const inventoryModel = effectiveBusinessModel || "SIMPLE";
    const businessName = profile.business?.name || null;
    const effectiveTier = profile.business?.effectiveTier || null;
    const subscriptionStatus = profile.business?.subscriptionStatus || null;
    const subscriptionExpiresAt =
      profile.business?.subscriptionExpiresAt || null;
    const entitlements = profile.business?.entitlements || null;

    console.log("[syncBusinessConfig] Fetched from server:", {
      businessName,
      inventoryModel,
      effectiveTier,
      subscriptionStatus,
      source: effectiveBusinessModel ? "EFFECTIVE BUSINESS" : "LOCKED SAFE DEFAULT",
    });

    if (inventoryModel) {
      try {
        const { getDB } = await import("../db");
        const db = await getDB();

        if (!db) {
          console.warn(
            "[syncBusinessConfig] Database not ready yet, skipping local update"
          );
          return {
            inventoryModel,
            effectiveTier,
            subscriptionStatus,
            entitlements,
            businessName,
            businessId: profile.businessId || null,
            success: true,
          };
        }

        const userRole = profile.role || "STAFF";
        await db.runAsync(
          `INSERT OR REPLACE INTO local_profiles
           (id, business_id, role, status, inventory_model, created_at)
           VALUES (?, ?, ?, 'active', ?, datetime('now'))`,
          [profile.id, profile.businessId || "", userRole, inventoryModel]
        );
        await updateProRebaselineFromSubscription(db, {
          effectiveTier,
          subscriptionStatus,
          subscriptionExpiresAt,
        });
        console.log(
          "✅ Local DB updated with role:",
          userRole,
          "inventory_model:",
          inventoryModel
        );
      } catch (dbErr: any) {
        console.warn(
          "[syncBusinessConfig] DB update skipped (not ready):",
          dbErr?.message || dbErr
        );
        return {
          inventoryModel,
          effectiveTier,
          subscriptionStatus,
          entitlements,
          businessName,
          businessId: profile.businessId || null,
          success: true,
        };
      }
    }

    return {
      inventoryModel,
      effectiveTier,
      subscriptionStatus,
      entitlements,
      businessName,
      businessId: profile.businessId || null,
      success: true,
    };
  } catch (err) {
    if (isNetworkRequestFailure(err)) {
      console.log(
        "[syncBusinessConfig] Backend unavailable, keeping local business config.",
      );
    } else if (isUnauthorizedError(err)) {
      // Expected during app bootstrap before backend token exchange completes.
      // Do not use console.error here to avoid redbox for normal auth timing.
      console.log(
        "[syncBusinessConfig] Unauthorized (token not ready), keeping local business config.",
      );
    } else {
      console.error("[syncBusinessConfig] Error:", err);
    }
    return {
      inventoryModel: null,
      effectiveTier: null,
      subscriptionStatus: null,
      entitlements: null,
      businessName: null,
      businessId: null,
      success: false,
    };
  }
}

// Re-export types for convenience
export type { Session, User } from "@supabase/supabase-js";
