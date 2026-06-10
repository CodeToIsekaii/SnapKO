/**
 * AuthContext - Manages authentication state (Hybrid: Supabase credentials + Backend tokens)
 *
 * Flow:
 *  1. Supabase Auth validates email/password (or OAuth)
 *  2. Mobile exchanges Supabase session for BE-SnapKO tokens via POST /auth/login-mobile
 *  3. All profile/business/data calls go to BE-SnapKO via apiFetch (auto-refresh on 401)
 *  4. Supabase SDK is kept only for credential flows + realtime listener (phase-later)
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type User } from "@supabase/supabase-js";
import type { ProfileRoleEnum, ProfileStatusEnum } from "@snapko/ts-types";
import { Env } from "../env";
import {
  api,
  clearBackendTokens,
  loginMobile,
  logoutBackend,
  setSupabaseAccessTokenProvider,
  setUnauthorizedHandler,
} from "../services/api";

// ================== TYPES ==================

export interface UserProfile {
  id: string;
  businessId: string | null;
  role: ProfileRoleEnum;
  status: ProfileStatusEnum;
  fullName: string | null;
  phoneNumber: string | null;
  tier?: string | null;
  effectiveTier?: string | null;
  inventoryModel?: string | null;
  effectiveInventoryModel?: "SIMPLE" | "STANDARD" | "CHAIN" | null;
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;
  subscriptionExpiresAt?: string | null;
  businessCreatedAt?: string | null;
  entitlements?: {
    canUseDualWarehouse: boolean;
    canUseCustomStorageAreas: boolean;
    canInviteStaff: boolean;
    canUseAdvancedReports: boolean;
  } | null;
}

export type AuthState =
  | { status: "unauthenticated" }
  | { status: "loading" }
  | { status: "authenticated"; user: User; profile: UserProfile }
  | { status: "needs_setup"; user: User; profile: UserProfile }
  | { status: "pending"; profileId: string };

type AuthContextValue = {
  authState: AuthState;
  signIn: (e: string, p: string) => Promise<void>;
  signUp: (e: string, p: string, n?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  createBusiness: (n: string) => Promise<void>;
  updatePassword: (o: string, n: string) => Promise<void>;
  resetPassword: (e: string) => Promise<void>;
  setStaffPending: (id: string) => Promise<void>;
  clearStaffPending: () => Promise<void>;
};

export const supabase = createClient(Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const AuthContext = createContext<AuthContextValue | null>(null);

// Shape returned by GET /profiles/me (Prisma + TransformInterceptor wrap)
interface BackendProfileResponse {
  id: string;
  businessId: string | null;
  role: ProfileRoleEnum;
  status: ProfileStatusEnum;
  fullName: string | null;
  phoneNumber: string | null;
  business?: {
    inventoryModel?: string | null;
    effectiveInventoryModel?: "SIMPLE" | "STANDARD" | "CHAIN" | null;
    tier?: string | null;
    effectiveTier?: string | null;
    subscriptionStatus?: "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;
    subscriptionExpiresAt?: string | null;
    createdAt?: string | null;
    entitlements?: UserProfile["entitlements"];
  } | null;
}

function mapProfile(raw: BackendProfileResponse): UserProfile {
  return {
    id: raw.id,
    businessId: raw.businessId,
    role: raw.role,
    status: raw.status,
    fullName: raw.fullName,
    phoneNumber: raw.phoneNumber,
    tier: raw.business?.tier ?? "FREE",
    effectiveTier: raw.business?.effectiveTier ?? raw.business?.tier ?? "FREE",
    inventoryModel: raw.business?.inventoryModel ?? null,
    effectiveInventoryModel:
      raw.business?.effectiveInventoryModel ?? "SIMPLE",
    subscriptionStatus: raw.business?.subscriptionStatus ?? null,
    subscriptionExpiresAt: raw.business?.subscriptionExpiresAt ?? null,
    businessCreatedAt: raw.business?.createdAt ?? null,
    entitlements: raw.business?.entitlements ?? null,
  };
}

// Backend wraps responses via TransformInterceptor → payload may be at .data
function unwrap<T>(res: unknown): T {
  if (res && typeof res === "object" && "data" in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
  });

  // Fetch profile from backend (/profiles/me)
  const fetchProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const res = await api.get<unknown>("/profiles/me");
      const raw = unwrap<BackendProfileResponse>(res);
      if (!raw?.id) return null;
      return mapProfile(raw);
    } catch (e) {
      console.warn("[AuthContext] fetchProfile failed:", e);
      return null;
    }
  }, []);

  // Exchange Supabase session for backend tokens
  const exchangeForBackendTokens = useCallback(
    async (
      supabaseAccessToken: string,
      initial?: { fullName?: string; phoneNumber?: string },
    ): Promise<void> => {
      await loginMobile(supabaseAccessToken, initial ?? {});
    },
    [],
  );

  // Initialize auth state on mount
  useEffect(() => {
    // Register global 401 handler so apiFetch can trigger logout state
    setUnauthorizedHandler(() => {
      setAuthState({ status: "unauthenticated" });
    });
    setSupabaseAccessTokenProvider(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    });

    const initAuth = async () => {
      // Check for pending staff first (from SecureStore)
      const pendingId = await SecureStore.getItemAsync("pending_profile_id");
      if (pendingId) {
        setAuthState({ status: "pending", profileId: pendingId });
        return;
      }

      // Check for Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setAuthState({ status: "unauthenticated" });
        return;
      }

      // Ensure backend tokens — exchange if we don't already have them
      try {
        await exchangeForBackendTokens(session.access_token);
      } catch (e) {
        console.warn("[AuthContext] initial exchange failed:", e);
        await supabase.auth.signOut();
        setAuthState({ status: "unauthenticated" });
        return;
      }

      const profile = await fetchProfile();
      if (!profile) {
        setAuthState({ status: "unauthenticated" });
        return;
      }

      if (profile.status === "REJECTED" || profile.status === "INACTIVE") {
        console.log("[AuthContext] Profile is REJECTED/INACTIVE, signing out");
        await supabase.auth.signOut();
        await clearBackendTokens();
        setAuthState({ status: "unauthenticated" });
        return;
      }

      if (profile.status === "PENDING") {
        console.log("[AuthContext] Profile is PENDING, showing pending screen");
        await SecureStore.setItemAsync("pending_profile_id", profile.id);
        setAuthState({ status: "pending", profileId: profile.id });
        return;
      }

      if (profile.role === "OWNER" && !profile.businessId) {
        setAuthState({ status: "needs_setup", user: session.user, profile });
      } else {
        setAuthState({ status: "authenticated", user: session.user, profile });
      }
    };

    initAuth();

    // Listen for auth changes (e.g. session refresh, sign out elsewhere)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === "SIGNED_OUT") {
          await clearBackendTokens();
          setAuthState({ status: "unauthenticated" });
        }
        // SIGNED_IN is handled by signIn/signUp directly (need backend exchange)
      },
    );

    return () => {
      setUnauthorizedHandler(null);
      setSupabaseAccessTokenProvider(null);
      authListener.subscription.unsubscribe();
    };
  }, [exchangeForBackendTokens, fetchProfile]);

  // 📡 GLOBAL REALTIME LISTENER: Detect if user gets deactivated while in app
  // (Still on Supabase realtime — migration to Socket.IO is a later phase.)
  useEffect(() => {
    if (
      authState.status !== "authenticated" &&
      authState.status !== "needs_setup"
    ) {
      return;
    }

    const userId = authState.user.id;
    console.log("[AuthContext] Starting profile status listener for:", userId);

    const channel = supabase
      .channel(`profile-deactivation-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        async (payload) => {
          const newStatus = (payload.new as { status: string }).status;
          console.log("[AuthContext] Profile status changed:", newStatus);

          if (newStatus === "INACTIVE" || newStatus === "REJECTED") {
            console.log("[AuthContext] User deactivated, signing out...");
            await SecureStore.deleteItemAsync("pending_profile_id");
            await logoutBackend().catch(() => {});
            await supabase.auth.signOut();
            setAuthState({ status: "unauthenticated" });
          }
        },
      )
      .subscribe((status) => {
        console.log("[AuthContext] Deactivation listener status:", status);
      });

    return () => {
      console.log("[AuthContext] Cleaning up deactivation listener");
      supabase.removeChannel(channel);
    };
  }, [
    authState.status,
    authState.status === "authenticated" || authState.status === "needs_setup"
      ? authState.user?.id
      : null,
  ]);

  // Sign in with email/password
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.user || !data.session) throw new Error("Đăng nhập thất bại");

      await exchangeForBackendTokens(data.session.access_token);

      const profile = await fetchProfile();
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng");

      if (profile.role === "OWNER" && !profile.businessId) {
        setAuthState({ status: "needs_setup", user: data.user, profile });
      } else {
        setAuthState({ status: "authenticated", user: data.user, profile });
      }
    },
    [exchangeForBackendTokens, fetchProfile],
  );

  // Sign up new Owner
  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Đăng ký thất bại");

      // signUp doesn't always return a session (email confirmation flows).
      // Try to fetch one; if missing, caller should show "verify email" UI.
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session ?? data.session;
      if (!session) {
        throw new Error(
          "Vui lòng xác nhận email trước khi đăng nhập. Kiểm tra hộp thư của bạn.",
        );
      }

      await exchangeForBackendTokens(session.access_token, { fullName });

      const profile = await fetchProfile();
      if (!profile) throw new Error("Không tạo được hồ sơ người dùng");

      if (profile.role === "OWNER" && !profile.businessId) {
        setAuthState({ status: "needs_setup", user: data.user, profile });
      } else {
        setAuthState({ status: "authenticated", user: data.user, profile });
      }
    },
    [exchangeForBackendTokens, fetchProfile],
  );

  // Sign out
  const signOut = useCallback(async () => {
    try {
      const { getDB } = await import("../db");
      const db = await getDB();
      const tablesToClear = [
        "local_profiles",
        "local_stock_levels",
        "local_inventory_logs",
        "local_ingredients",
        "local_recipes",
        "local_storage_areas",
        "local_transfer_logs",
        "local_waste_logs",
        "pending_sync_logs",
        "local_import_logs",
        "local_sales_logs",
        "local_metadata",
        "local_recipe_ingredients",
        "local_batch_recipes",
      ];
      for (const table of tablesToClear) {
        await db.runAsync(`DELETE FROM ${table}`);
      }
      console.log("[AuthContext] Cleared all local data for account switch");
    } catch (e) {
      console.warn("[AuthContext] Failed to clear database:", e);
    }

    await logoutBackend().catch(() => {});
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync("pending_profile_id");
    setAuthState({ status: "unauthenticated" });
  }, []);

  // Refresh profile data (works for authenticated, needs_setup, AND pending states)
  const refreshProfile = useCallback(async () => {
    if (
      authState.status === "authenticated" ||
      authState.status === "needs_setup"
    ) {
      const profile = await fetchProfile();
      if (profile) {
        if (profile.role === "OWNER" && !profile.businessId) {
          setAuthState((prev) =>
            prev.status === "authenticated" || prev.status === "needs_setup"
              ? { status: "needs_setup", user: prev.user, profile }
              : prev,
          );
        } else {
          setAuthState((prev) =>
            prev.status === "authenticated" || prev.status === "needs_setup"
              ? { status: "authenticated", user: prev.user, profile }
              : prev,
          );
        }
      }
    }

    if (authState.status === "pending") {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profile = await fetchProfile();

        if (profile && profile.status === "ACTIVE") {
          console.log(
            "[AuthContext] Staff approved! Transitioning to authenticated",
          );
          await SecureStore.deleteItemAsync("pending_profile_id");
          setAuthState({ status: "authenticated", user, profile });
        } else if (
          profile &&
          (profile.status === "REJECTED" || profile.status === "INACTIVE")
        ) {
          console.log("[AuthContext] Staff rejected, clearing pending state");
          await SecureStore.deleteItemAsync("pending_profile_id");
          await logoutBackend().catch(() => {});
          await supabase.auth.signOut();
          setAuthState({ status: "unauthenticated" });
        }
      }
    }
  }, [authState, fetchProfile]);

  // Create business for first-time OWNER (via backend)
  const createBusiness = useCallback(
    async (name: string) => {
      if (authState.status !== "needs_setup") {
        throw new Error("Not in setup mode");
      }

      await api.post<unknown>("/businesses", { name });

      // Re-exchange tokens so the new businessId is embedded in the JWT
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        await exchangeForBackendTokens(sessionData.session.access_token);
      }

      await refreshProfile();
    },
    [authState.status, exchangeForBackendTokens, refreshProfile],
  );

  // Staff pending flow
  const setStaffPending = useCallback(async (profileId: string) => {
    await SecureStore.setItemAsync("pending_profile_id", profileId);
    setAuthState({ status: "pending", profileId });
  }, []);

  const clearStaffPending = useCallback(async () => {
    await SecureStore.deleteItemAsync("pending_profile_id");
    setAuthState({ status: "unauthenticated" });
  }, []);

  // Password Management (still via Supabase — credentials live there)
  const updatePassword = useCallback(async (oldPw: string, newPw: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) throw new Error("Không xác định được người dùng");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPw,
    });
    if (signInError) throw new Error("Mật khẩu hiện tại không đúng");

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPw,
    });
    if (updateError) throw new Error(updateError.message);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        createBusiness,
        updatePassword,
        resetPassword,
        setStaffPending,
        clearStaffPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ================== HOOK ==================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
