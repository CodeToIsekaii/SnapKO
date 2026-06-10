// src/hooks/useAuth.ts - Authentication Logic (SOLID: Single Responsibility)
// Handles: Login, Logout, Register, Session, Token Refresh
// UI components MUST use this hook, NOT call electronAPI directly

import { useState, useEffect, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { User } from "../types";

// Supabase client singleton
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

interface AuthState {
  user: User | null;
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

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const result = await window.electronAPI.getSession?.();
        if (result?.session?.user) {
          setState({
            user: {
              id: result.session.user.id,
              email: result.session.user.email || "",
            },
            loading: false,
            error: null,
          });
        } else {
          setState({ user: null, loading: false, error: null });
        }
      } catch (err) {
        console.error("[useAuth] Session check error:", err);
        setState({ user: null, loading: false, error: null });
      }
    };

    checkSession();
  }, []);

  // Token refresh listener
  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[useAuth] Auth state changed:", event);

      if (session?.access_token) {
        await window.electronAPI.setAuthToken?.(session.access_token);
      }

      if (event === "SIGNED_OUT") {
        await window.electronAPI.setAuthToken?.(null);
        setState({ user: null, loading: false, error: null });
      }
    });

    return () => subscription.unsubscribe();
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
            },
            loading: false,
            error: null,
          });
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
    []
  );

  // Register function (for business owners)
  const register = useCallback(
    async (data: RegisterData): Promise<LoginResult> => {
      if (!supabase) {
        return { success: false, error: "Supabase chưa được cấu hình" };
      }

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

        return await login(data.email, data.password);
      } catch (err: any) {
        const errorMsg = err.message || "Có lỗi xảy ra";
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [login]
  );

  // Forgot Password function
  const forgotPassword = useCallback(
    async (email: string): Promise<LoginResult> => {
      if (!supabase) {
        return { success: false, error: "Supabase chưa được cấu hình" };
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/auth/update-password`,
          }
        );

        if (resetError) {
          setState((s) => ({
            ...s,
            loading: false,
            error: resetError.message,
          }));
          return { success: false, error: resetError.message };
        }

        setState((s) => ({ ...s, loading: false }));
        return { success: true };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Có lỗi xảy ra";
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
      setState({ user: null, loading: false, error: null });
    } catch (err) {
      console.error("[useAuth] Logout error:", err);
    }
  }, []);

  // Google Login function
  const googleLogin = useCallback(async (): Promise<LoginResult> => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      console.log("[useAuth] Calling window.electronAPI.googleLogin()...");
      const result = await window.electronAPI.googleLogin();
      console.log("[useAuth] Google login result:", result);

      if (result.success && result.session) {
        console.log("[useAuth] Setting user state:", result.session.user);
        setState({
          user: {
            id: result.session.user.id,
            email: result.session.user.email || "",
          },
          loading: false,
          error: null,
        });
        return { success: true };
      } else {
        console.log("[useAuth] Google login failed:", result.error);
        setState((s) => ({
          ...s,
          loading: false,
          error: result.error || "Đăng nhập Google thất bại",
        }));
        return { success: false, error: result.error };
      }
    } catch (err: any) {
      console.error("[useAuth] Google login exception:", err);
      const errorMsg = err.message || "Có lỗi xảy ra";
      setState((s) => ({ ...s, loading: false, error: errorMsg }));
      return { success: false, error: errorMsg };
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    login,
    googleLogin,
    register,
    forgotPassword,
    logout,
    clearError,
    supabase, // Exposed for components that need it
  };
}
