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
        // 1. Sign up
        const { data: authData, error: signupError } =
          await supabase.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
              data: {
                full_name: data.fullName,
                role: "OWNER",
              },
            },
          });

        if (signupError) {
          setState((s) => ({
            ...s,
            loading: false,
            error: signupError.message,
          }));
          return { success: false, error: signupError.message };
        }

        if (!authData.user) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Không thể tạo tài khoản",
          }));
          return { success: false, error: "Không thể tạo tài khoản" };
        }

        // 2. Create business
        const { error: businessError } = await supabase
          .from("businesses")
          .insert({
            id: authData.user.id,
            name: data.businessName,
            owner_id: authData.user.id,
          });

        if (businessError) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Lỗi tạo doanh nghiệp: " + businessError.message,
          }));
          return { success: false, error: businessError.message };
        }

        // 3. Create profile
        await supabase.from("profiles").insert({
          id: authData.user.id,
          business_id: authData.user.id,
          full_name: data.fullName,
          role: "OWNER",
          status: "ACTIVE",
        });

        // 4. Auto login
        return await login(data.email, data.password);
      } catch (err: any) {
        const errorMsg = err.message || "Có lỗi xảy ra";
        setState((s) => ({ ...s, loading: false, error: errorMsg }));
        return { success: false, error: errorMsg };
      }
    },
    [login]
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

  // Clear error
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    login,
    register,
    logout,
    clearError,
    supabase, // Exposed for components that need it
  };
}
