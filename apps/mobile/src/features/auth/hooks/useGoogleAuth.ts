/**
 * Google Auth Hook - useGoogleAuth
 * Per .antigravityrules Section A: Google OAuth (Priority) for Owner
 *
 * TEMPORARILY SIMPLIFIED to avoid Metro crash.
 * TODO: Re-enable full Google OAuth when properly configured.
 */

import { useState, useCallback } from "react";
import { Alert } from "react-native";

interface GoogleAuthState {
  isLoading: boolean;
  error: string | null;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
}

interface UseGoogleAuthReturn {
  state: GoogleAuthState;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Simplified Google Auth hook (placeholder until full configuration)
 * Full implementation requires:
 * 1. Google Cloud Console OAuth Client IDs
 * 2. Supabase Dashboard Google Provider enabled
 * 3. Correct redirect URIs configured
 */
export function useGoogleAuth(): UseGoogleAuthReturn {
  const [state, setState] = useState<GoogleAuthState>({
    isLoading: false,
    error: null,
    user: null,
  });

  const signInWithGoogle = useCallback(async () => {
    // Show info message since full Google OAuth is not yet configured
    Alert.alert(
      "Google OAuth",
      "Đăng nhập bằng Google đang được cấu hình.\n\nVui lòng sử dụng Email/Mật khẩu để đăng nhập.",
      [{ text: "OK" }]
    );

    setState((prev) => ({
      ...prev,
      error: "Vui lòng sử dụng Email/Mật khẩu",
    }));
  }, []);

  const signOut = useCallback(async () => {
    setState({
      isLoading: false,
      error: null,
      user: null,
    });
  }, []);

  return {
    state,
    signInWithGoogle,
    signOut,
  };
}

/**
 * Environment setup instructions:
 *
 * 1. Add to .env:
 *    EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
 *    EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
 *    EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=your_web_client_id
 *    EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=your_ios_client_id
 *    EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=your_android_client_id
 *
 * 2. Add to Supabase Dashboard > Authentication > URL Configuration:
 *    Redirect URLs:
 *    - exp://localhost:8081/--/auth/callback (for Expo Go dev)
 *    - snapko://auth/callback (for production builds)
 *
 * 3. Configure Google Cloud Console:
 *    - Create OAuth 2.0 Client IDs for Web, iOS, Android
 *    - Add redirect URIs for each platform
 */
