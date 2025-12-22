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
  businessId: string;
  role: ProfileRoleEnum;
  status: ProfileStatusEnum;
  fullName: string | null;
  phoneNumber: string | null;
}

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "pending"; profileId: string } // Staff waiting for approval
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
      // Check for pending staff first
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
          setAuthState({
            status: "authenticated",
            user: session.user,
            profile,
          });
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
            setAuthState({
              status: "authenticated",
              user: session.user,
              profile,
            });
          }
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

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
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync("pending_profile_id");
    setAuthState({ status: "unauthenticated" });
  }, []);

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (authState.status === "authenticated") {
      const profile = await fetchProfile(authState.user.id);
      if (profile) {
        setAuthState((prev) =>
          prev.status === "authenticated" ? { ...prev, profile } : prev
        );
      }
    }
  }, [authState, fetchProfile]);

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
