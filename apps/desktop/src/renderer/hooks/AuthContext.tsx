// src/hooks/AuthContext.tsx - Shared Auth Context
// Fixes: Multiple useAuth() calls creating separate state instances
// Now all components share the same auth state via Context

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { User } from "../types";

// ============ Types ============
interface Profile {
  id: string;
  business_id: string | null;
  business_name?: string | null;
  phone_number: string | null;
  role: string;
  status: string;
  full_name: string | null;
  inventory_model: string | null; // effective SIMPLE | STANDARD | CHAIN
  stored_inventory_model?: string | null;
  // Subscription data (from businesses table)
  tier?: string | null;
  effective_tier?: string | null;
  subscription_status?: "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;
  entitlements?: {
    canUseDualWarehouse: boolean;
    canUseCustomStorageAreas: boolean;
    canInviteStaff: boolean;
    canUseAdvancedReports: boolean;
  } | null;
  subscription_expires_at?: string | null;
  business_created_at?: string | null;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface RegisterData {
  email: string;
  password: string;
  businessName: string;
  fullName: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult>;
  googleLogin: () => Promise<LoginResult>;
  register: (data: RegisterData) => Promise<LoginResult>;
  forgotPassword: (email: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<boolean>;
  supabase: SupabaseClient | null;
}

// ============ Supabase Client Singleton ============
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ============ Context ============
const AuthContext = createContext<AuthContextType | null>(null);

// ============ Provider ============
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    error: null,
  });

  // Helper: Fetch profile from Cloud
  const fetchProfile = useCallback(async () => {
    try {
      const result = await window.electronAPI.getProfile?.();
      console.log("[AuthContext] Profile fetched:", result);
      if (result?.profile) {
        setState((s) => ({ ...s, profile: result.profile }));
      }
    } catch (err) {
      console.error("[AuthContext] Fetch profile error:", err);
    }
  }, []);

  // Refresh profile (called after business creation)
  const refreshProfile = useCallback(async () => {
    console.log("[AuthContext] Refreshing profile...");
    await fetchProfile();
  }, [fetchProfile]);

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const result = await window.electronAPI.getSession?.();
        console.log("[AuthContext] Initial session check:", result);
        if (result?.session?.user) {
          setState({
            user: {
              id: result.session.user.id,
              email: result.session.user.email || "",
              created_at: result.session.user.created_at,
            },
            profile: null,
            loading: false,
            error: null,
          });
          // Fetch profile after setting user
          await fetchProfile();
        } else {
          console.log("[AuthContext] No existing session");
          setState({ user: null, profile: null, loading: false, error: null });
        }
      } catch (err) {
        console.error("[AuthContext] Session check error:", err);
        setState({ user: null, profile: null, loading: false, error: null });
      }
    };

    console.log("[AuthContext] Auth state changed: INITIAL_SESSION");
    checkSession();
  }, [fetchProfile]);

  // Listen for token refresh to keep Main Process sync worker alive
  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth] Auth state change: ${event}`);

      if (event === "TOKEN_REFRESHED" && session) {
        console.log("[Auth] Token refreshed, updating Main Process...");
        await window.electronAPI.setAuthToken(session.access_token);
      }

      if (event === "SIGNED_OUT") {
        await window.electronAPI.setAuthToken(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Login function
  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const result = await window.electronAPI.login(email, password);

        if (result.success && result.session) {
          setState({
            user: {
              id: result.session.user.id,
              email: result.session.user.email || "",
              created_at: result.session.user.created_at,
            },
            profile: null,
            loading: false,
            error: null,
          });
          // Fetch profile after login
          await fetchProfile();
          return { success: true };
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            error: result.error || "Đăng nhập thất bại",
          }));
          return { success: false, error: result.error };
        }
      } catch (err: any) {
        const errorMsg = err.message || "Có lỗi xảy ra";
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [fetchProfile]
  );

  // Google Login function
  const googleLogin = useCallback(async (): Promise<LoginResult> => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      console.log("[AuthContext] Calling window.electronAPI.googleLogin()...");
      const result = await window.electronAPI.googleLogin();
      console.log("[AuthContext] Google login result:", result);

      if (result.success && result.session) {
        console.log("[AuthContext] Setting user state:", result.session.user);
        setState({
          user: {
            id: result.session.user.id,
            email: result.session.user.email || "",
            created_at: result.session.user.created_at,
          },
          profile: null,
          loading: false,
          error: null,
        });
        // Fetch profile after Google login
        await fetchProfile();
        return { success: true };
      } else {
        console.log("[AuthContext] Google login failed:", result.error);
        setState((s) => ({
          ...s,
          loading: false,
          error: result.error || "Đăng nhập Google thất bại",
        }));
        return { success: false, error: result.error };
      }
    } catch (err: any) {
      console.error("[AuthContext] Google login exception:", err);
      const errorMsg = err.message || "Có lỗi xảy ra";
      setState((s) => ({ ...s, loading: false, error: errorMsg }));
      return { success: false, error: errorMsg };
    }
  }, [fetchProfile]);

  // Register function — delegates to main process IPC (signUp + backend exchange)
  const register = useCallback(
    async (data: RegisterData): Promise<LoginResult> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const result = await window.electronAPI.register(
          data.email,
          data.password,
          data.fullName,
          data.businessName
        );

        if (!result.success) {
          setState((s) => ({
            ...s,
            loading: false,
            error: result.error || "Đăng ký thất bại",
          }));
          return { success: false, error: result.error };
        }

        if (result.needsVerification || !result.session?.user) {
          setState((s) => ({ ...s, loading: false, error: null }));
          return {
            success: true,
            error: "Vui lòng kiểm tra email để xác nhận",
          };
        }

        setState({
          user: {
            id: result.session.user.id,
            email: result.session.user.email || "",
            created_at: result.session.user.created_at,
          },
          profile: null,
          loading: false,
          error: null,
        });
        await fetchProfile();
        return { success: true };
      } catch (err: any) {
        const errorMsg = err.message || "Đăng ký thất bại";
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [fetchProfile]
  );

  // Forgot Password function
  const forgotPassword = useCallback(
    async (email: string): Promise<LoginResult> => {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        if (!supabase) {
          throw new Error("Supabase not available");
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        setState((s) => ({ ...s, loading: false }));

        if (error) {
          throw new Error(error.message);
        }

        return { success: true };
      } catch (err: any) {
        const errorMsg = err.message || "Gửi email thất bại";
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    []
  );

  // Logout function
  const logout = useCallback(async () => {
    try {
      await window.electronAPI.logout?.();
      setState({ user: null, profile: null, loading: false, error: null });
    } catch (err) {
      console.error("[AuthContext] Logout error:", err);
      setState({ user: null, profile: null, loading: false, error: null });
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  // Update profile (for model selection, etc.)
  // CRITICAL: Use IPC to main process which has auth session for RLS
  const updateProfile = useCallback(
    async (data: Partial<Profile>): Promise<boolean> => {
      try {
        if (!state.user) {
          throw new Error("Not authenticated");
        }

        // Call IPC handler in main process (has auth session)
        // Cast to expected type for IPC
        const ipcData = {
          inventory_model: data.inventory_model ?? undefined,
          full_name: data.full_name ?? undefined,
        };
        const result = await window.electronAPI?.updateProfile?.(ipcData);

        if (!result?.success) {
          throw new Error(result?.error || "Update failed");
        }

        // Update local state
        setState((s) => ({
          ...s,
          profile: s.profile ? { ...s.profile, ...data } : null,
        }));

        console.log("[AuthContext] Profile updated via IPC:", data);
        return true;
      } catch (err) {
        console.error("[AuthContext] Update profile error:", err);
        return false;
      }
    },
    [state.user]
  );

  const value: AuthContextType = {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    error: state.error,
    login,
    googleLogin,
    register,
    forgotPassword,
    logout,
    clearError,
    refreshProfile,
    updateProfile,
    supabase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============ Hook ============
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
