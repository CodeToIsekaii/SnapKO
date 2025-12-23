// src/features/auth/services/auth.service.ts
// SOLID: Service Layer - Single Responsibility (Auth operations only)
// Handles: Login, Register, Session, Token storage

import {
  createClient,
  SupabaseClient,
  Session,
  User,
} from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// Environment variables (should import from env.ts in production)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

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

      if (!data.user) {
        return { success: false, error: "Login failed" };
      }

      // Fetch profile
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
      // 1. Verify invite code via Edge Function
      const { data: verifyData, error: verifyError } =
        await supabase.functions.invoke("staff-verify-invite", {
          body: { code: data.inviteCode },
        });

      if (verifyError || !verifyData?.valid) {
        return {
          success: false,
          error: verifyData?.error || "Mã mời không hợp lệ hoặc đã hết hạn",
        };
      }

      const businessId = verifyData.business_id;

      // 2. Sign up
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

      // 3. Create profile (PENDING status - owner must approve)
      const { error: profileError } = await supabase.from("profiles").insert({
        id: authData.user.id,
        business_id: businessId,
        full_name: data.fullName,
        phone_number: data.phoneNumber,
        role: "STAFF",
        status: "PENDING",
      });

      if (profileError) {
        return {
          success: false,
          error: "Lỗi tạo hồ sơ: " + profileError.message,
        };
      }

      return {
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email || "",
          role: "STAFF",
          businessId,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Registration error" };
    }
  },

  /**
   * Logout
   */
  logout: async (): Promise<void> => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[AuthService] Logout error:", err);
    }
  },

  /**
   * Get user profile
   */
  getProfile: async (userId: string): Promise<ProfileData | null> => {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) return null;
      return data as ProfileData;
    } catch {
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
