// src/features/auth/hooks/useAuth.ts
// SOLID: Controller Pattern - Hook connects UI with AuthService
// Screen components should ONLY use this hook

import { useState, useEffect, useCallback } from "react";
import { AuthService, AuthUser, LoginResult } from "../services/auth.service";

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isPending: boolean; // Staff waiting for approval

  // Actions
  login: (email: string, password: string) => Promise<LoginResult>;
  registerStaff: (data: {
    email: string;
    password: string;
    fullName: string;
    phoneNumber: string;
    inviteCode: string;
  }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshSession: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Computed states
  const isAuthenticated = !!user;
  const isPending = user?.role === "STAFF" && !user.businessId;

  // Check session on mount
  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      const { user: sessionUser } = await AuthService.getSession();
      setUser(sessionUser);
    } catch (err) {
      console.error("[useAuth] Session check error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    // Listen to auth changes
    const unsubscribe = AuthService.onAuthStateChange((event, session) => {
      console.log("[useAuth] Auth event:", event);

      if (event === "SIGNED_OUT") {
        setUser(null);
      } else if (event === "SIGNED_IN" && session?.user) {
        // Refresh to get profile data
        refreshSession();
      }
    });

    return unsubscribe;
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const result = await AuthService.login(email, password);

      if (result.success && result.user) {
        setUser(result.user);
      } else {
        setError(result.error || "Đăng nhập thất bại");
      }

      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const registerStaff = useCallback(
    async (data: {
      email: string;
      password: string;
      fullName: string;
      phoneNumber: string;
      inviteCode: string;
    }) => {
      setError(null);
      setLoading(true);

      try {
        const result = await AuthService.registerStaff(data);

        if (result.success && result.user) {
          setUser(result.user);
        } else {
          setError(result.error || "Đăng ký thất bại");
        }

        return result;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await AuthService.logout();
      setUser(null);
    } catch (err: any) {
      setError(err.message || "Logout failed");
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isPending,
    login,
    registerStaff,
    logout,
    clearError,
    refreshSession,
  };
}
