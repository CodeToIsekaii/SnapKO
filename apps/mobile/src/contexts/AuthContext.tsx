/**
 * AuthContext - Manages authentication state
 *
 * Pattern: AuthStack/AppStack switching based on session state
 * - No manual navigation.navigate() for auth transitions
 * - State-driven navigation via Context
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
import { createClient, type Session, type User } from "@supabase/supabase-js";
import type { ProfileRoleEnum, ProfileStatusEnum } from "@snapko/ts-types";
import { Env } from "../env";

// ================== TYPES ==================

export interface UserProfile {
  id: string;
  businessId: string | null; // Can be null for first-time owners
  role: ProfileRoleEnum;
  status: ProfileStatusEnum;
  fullName: string | null;
  phoneNumber: string | null;
}

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "pending"; profileId: string } // Staff waiting for approval
  | { status: "needs_setup"; user: User; profile: UserProfile } // Owner without business
  | { status: "authenticated"; user: User; profile: UserProfile };

interface AuthContextValue {
  authState: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    businessName?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  createBusiness: (name: string) => Promise<void>; // For Profile Setup
  // Staff flow
  setStaffPending: (profileId: string) => void;
  clearStaffPending: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ================== SUPABASE CLIENT ==================

const supabase = createClient(Env.SUPABASE_URL, Env.SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      async getItem(key: string) {
        return SecureStore.getItemAsync(key);
      },
      async setItem(key: string, value: string) {
        await SecureStore.setItemAsync(key, value);
      },
      async removeItem(key: string) {
        await SecureStore.deleteItemAsync(key);
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export { supabase };

// ================== PROVIDER ==================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });

  // Fetch profile from DB
  const fetchProfile = useCallback(
    async (userId: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, business_id, role, status, full_name, phone_number")
        .eq("id", userId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        businessId: data.business_id,
        role: data.role as ProfileRoleEnum,
        status: data.status as ProfileStatusEnum,
        fullName: data.full_name,
        phoneNumber: data.phone_number,
      };
    },
    []
  );

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      // Check for pending staff first (from SecureStore)
      const pendingId = await SecureStore.getItemAsync("pending_profile_id");
      if (pendingId) {
        setAuthState({ status: "pending", profileId: pendingId });
        return;
      }

      // Check for session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          // CHECK PROFILE STATUS BEFORE ALLOWING ACCESS
          if (profile.status === "REJECTED" || profile.status === "INACTIVE") {
            // User was rejected/deactivated - sign them out
            console.log(
              "[AuthContext] Profile is REJECTED/INACTIVE, signing out"
            );
            await supabase.auth.signOut();
            setAuthState({ status: "unauthenticated" });
            return;
          }

          if (profile.status === "PENDING") {
            // Staff still pending - show pending screen
            console.log(
              "[AuthContext] Profile is PENDING, showing pending screen"
            );
            await SecureStore.setItemAsync("pending_profile_id", profile.id);
            setAuthState({ status: "pending", profileId: profile.id });
            return;
          }

          // Profile is ACTIVE - allow access
          if (profile.role === "OWNER" && !profile.businessId) {
            setAuthState({
              status: "needs_setup",
              user: session.user,
              profile,
            });
          } else {
            setAuthState({
              status: "authenticated",
              user: session.user,
              profile,
            });
          }
        } else {
          setAuthState({ status: "unauthenticated" });
        }
      } else {
        setAuthState({ status: "unauthenticated" });
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          setAuthState({ status: "unauthenticated" });
        } else if (session?.user && event === "SIGNED_IN") {
          const profile = await fetchProfile(session.user.id);
          if (profile) {
            // Check if OWNER needs to set up business
            if (profile.role === "OWNER" && !profile.businessId) {
              setAuthState({
                status: "needs_setup",
                user: session.user,
                profile,
              });
            } else {
              setAuthState({
                status: "authenticated",
                user: session.user,
                profile,
              });
            }
          }
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // 📡 GLOBAL REALTIME LISTENER: Detect if user gets deactivated while in app
  useEffect(() => {
    if (
      authState.status !== "authenticated" &&
      authState.status !== "needs_setup"
    ) {
      return; // Only listen when user is actually in the app
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
            // User was deactivated/rejected while in app!
            console.log("[AuthContext] User deactivated, signing out...");
            await SecureStore.deleteItemAsync("pending_profile_id");
            await supabase.auth.signOut();
            setAuthState({ status: "unauthenticated" });
            // Alert will be shown after redirect to login
          }
        }
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
      if (!data.user) throw new Error("Đăng nhập thất bại");

      const profile = await fetchProfile(data.user.id);
      if (!profile) throw new Error("Không tìm thấy hồ sơ người dùng");

      setAuthState({
        status: "authenticated",
        user: data.user,
        profile,
      });
    },
    [fetchProfile]
  );

  // Sign up new Owner
  const signUp = useCallback(
    async (email: string, password: string, businessName?: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Đăng ký thất bại");

      // Create business and profile via Edge Function (will be handled by trigger or edge fn)
      // For now, call invite-create which bootstraps owner
      const token = (await supabase.auth.getSession()).data.session
        ?.access_token;
      if (token) {
        await fetch(`${Env.SUPABASE_URL}/functions/v1/invite-create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        });
      }

      // Fetch created profile
      const profile = await fetchProfile(data.user.id);
      if (profile) {
        setAuthState({
          status: "authenticated",
          user: data.user,
          profile,
        });
      }
    },
    [fetchProfile]
  );

  // Sign out
  const signOut = useCallback(async () => {
    // Reset local SQLite database - CLEAR DATA ONLY, DO NOT CLOSE CONNECTION
    // Closing connection causing Native NullPointerException on re-open
    try {
      const { getDB } = await import("../db");
      const db = await getDB();

      // Clear all user-specific tables
      await db.runAsync("DELETE FROM local_profiles");
      await db.runAsync("DELETE FROM local_stock_levels");

      console.log("[AuthContext] Cleared all local data for account switch");
    } catch (e) {
      console.warn("[AuthContext] Failed to clear database:", e);
    }

    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync("pending_profile_id");
    setAuthState({ status: "unauthenticated" });
  }, []);

  // Refresh profile data (works for authenticated, needs_setup, AND pending states)
  const refreshProfile = useCallback(async () => {
    // Handle authenticated / needs_setup states
    if (
      authState.status === "authenticated" ||
      authState.status === "needs_setup"
    ) {
      const profile = await fetchProfile(authState.user.id);
      if (profile) {
        // Check if still needs setup
        if (profile.role === "OWNER" && !profile.businessId) {
          setAuthState((prev) =>
            prev.status === "authenticated" || prev.status === "needs_setup"
              ? { status: "needs_setup", user: prev.user, profile }
              : prev
          );
        } else {
          setAuthState((prev) =>
            prev.status === "authenticated" || prev.status === "needs_setup"
              ? { status: "authenticated", user: prev.user, profile }
              : prev
          );
        }
      }
    }

    // Handle pending state - staff waiting for approval
    // They have a session from auth-join-staff Edge Function
    if (authState.status === "pending") {
      // Get current session - staff should have one from shadow account
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profile = await fetchProfile(user.id);

        if (profile && profile.status === "ACTIVE") {
          // Staff has been approved! Transition to authenticated
          console.log(
            "[AuthContext] Staff approved! Transitioning to authenticated"
          );
          await SecureStore.deleteItemAsync("pending_profile_id");
          setAuthState({
            status: "authenticated",
            user,
            profile,
          });
        } else if (
          profile &&
          (profile.status === "REJECTED" || profile.status === "INACTIVE")
        ) {
          // Staff was rejected
          console.log("[AuthContext] Staff rejected, clearing pending state");
          await SecureStore.deleteItemAsync("pending_profile_id");
          await supabase.auth.signOut();
          setAuthState({ status: "unauthenticated" });
        }
        // If still PENDING, do nothing - stay in pending state
      }
    }
  }, [authState, fetchProfile]);

  // Create business for first-time OWNER (calls RPC)
  const createBusiness = useCallback(
    async (name: string) => {
      if (authState.status !== "needs_setup") {
        throw new Error("Not in setup mode");
      }

      // Call RPC function (atomic transaction)
      const { data, error } = await supabase.rpc("create_business_for_owner", {
        business_name: name,
      });

      if (error) throw new Error(error.message);
      if (!data?.success)
        throw new Error(data?.error || "Không thể tạo cửa hàng");

      // Refresh profile to update state to authenticated
      await refreshProfile();
    },
    [authState.status, refreshProfile]
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

  return (
    <AuthContext.Provider
      value={{
        authState,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        createBusiness,
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
