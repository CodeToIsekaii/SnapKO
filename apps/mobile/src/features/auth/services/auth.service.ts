// src/features/auth/services/auth.service.ts
// SOLID: Service Layer - Single Responsibility (Auth operations only)
// Handles: Login, Register, Session, Token storage

import {
  createClient,
  SupabaseClient,
  Session,
} from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Env } from "../../../env";
import {
  api,
  loginMobile,
  logoutBackend,
} from "../../../services/api";

// Use centralized env.ts per .antigravityrules Section 2
const SUPABASE_URL = Env.SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.SUPABASE_ANON_KEY;

// Supabase client singleton with SecureStore
const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: {
            getItem: async (key) => {
              try {
                return await SecureStore.getItemAsync(key);
              } catch {
                return null;
              }
            },
            setItem: async (key, value) => {
              try {
                await SecureStore.setItemAsync(key, value);
              } catch (err) {
                console.error("[AuthService] SecureStore set error:", err);
              }
            },
            removeItem: async (key) => {
              try {
                await SecureStore.deleteItemAsync(key);
              } catch (err) {
                console.error("[AuthService] SecureStore remove error:", err);
              }
            },
          },
          autoRefreshToken: true,
          persistSession: true,
        },
      })
    : null;

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  businessId?: string;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface ProfileData {
  id: string;
  business_id: string;
  full_name: string;
  role: string;
  status: string;
}

// ==================== AUTH SERVICE ====================
export const AuthService = {
  /**
   * Get Supabase client (for direct access if needed)
   */
  getClient: (): SupabaseClient | null => supabase,

  /**
   * Check current session
   */
  getSession: async (): Promise<{
    session: Session | null;
    user: AuthUser | null;
  }> => {
    if (!supabase) {
      return { session: null, user: null };
    }

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        return { session: null, user: null };
      }

      // Fetch profile for role/business_id
      const profile = await AuthService.getProfile(data.session.user.id);

      return {
        session: data.session,
        user: {
          id: data.session.user.id,
          email: data.session.user.email || "",
          role: profile?.role,
          businessId: profile?.business_id,
        },
      };
    } catch (err) {
      console.error("[AuthService] getSession error:", err);
      return { session: null, user: null };
    }
  },

  /**
   * Login with email/password
   */
  login: async (email: string, password: string): Promise<LoginResult> => {
    if (!supabase) {
      return { success: false, error: "Supabase not configured" };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user || !data.session) {
        return { success: false, error: "Login failed" };
      }

      // Exchange Supabase token for backend tokens
      await loginMobile(data.session.access_token);

      // Fetch profile via backend
      const profile = await AuthService.getProfile(data.user.id);

      return {
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email || "",
          role: profile?.role,
          businessId: profile?.business_id,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Login error" };
    }
  },

  /**
   * Register staff with invite code
   */
  registerStaff: async (data: {
    email: string;
    password: string;
    fullName: string;
    phoneNumber: string;
    inviteCode: string;
  }): Promise<LoginResult> => {
    if (!supabase) {
      return { success: false, error: "Supabase not configured" };
    }

    try {
      // 1. Sign up (Supabase owns credentials)
      const { data: authData, error: signupError } = await supabase.auth.signUp(
        {
          email: data.email,
          password: data.password,
          options: {
            data: {
              full_name: data.fullName,
              phone_number: data.phoneNumber,
              role: "STAFF",
            },
          },
        }
      );

      if (signupError || !authData.user) {
        return {
          success: false,
          error: signupError?.message || "Đăng ký thất bại",
        };
      }

      const supabaseAccessToken = authData.session?.access_token;
      if (!supabaseAccessToken) {
        return {
          success: false,
          error: "Vui lòng xác nhận email rồi đăng nhập để tham gia quán",
        };
      }

      // 2. Exchange Supabase token for backend tokens (auto-creates Profile)
      await loginMobile(supabaseAccessToken, {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
      });

      // 3. Join business via invite code (backend attaches businessId + PENDING)
      const joinRes = await api.post<{ id: string; businessId: string }>(
        "/auth/join-staff",
        { code: data.inviteCode }
      );

      return {
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email || "",
          role: "STAFF",
          businessId: joinRes.businessId,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Registration error" };
    }
  },

  /**
   * Logout — revoke backend refresh token + Supabase session
   */
  logout: async (): Promise<void> => {
    try {
      await logoutBackend();
    } catch (err) {
      console.error("[AuthService] Backend logout error:", err);
    }

    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[AuthService] Supabase logout error:", err);
    }
  },

  /**
   * Get user profile (via BE-SnapKO /profiles/me — camelCase mapped to snake_case for back-compat)
   */
  getProfile: async (_userId: string): Promise<ProfileData | null> => {
    try {
      const profile = await api.get<any>("/profiles/me");
      if (!profile) return null;
      return {
        id: profile.id,
        business_id: profile.businessId,
        full_name: profile.fullName,
        role: profile.role,
        status: profile.status,
      };
    } catch (err) {
      console.error("[AuthService] getProfile error:", err);
      return null;
    }
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (
    callback: (event: string, session: Session | null) => void
  ) => {
    if (!supabase) return () => {};

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return () => data.subscription.unsubscribe();
  },
};
