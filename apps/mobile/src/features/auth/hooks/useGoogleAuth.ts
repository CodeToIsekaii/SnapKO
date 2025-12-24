/**
 * Google Auth Hook - useGoogleAuth
 * Per .antigravityrules Section A: Google OAuth (Priority) for Owner
 *
 * Uses expo-auth-session with Supabase Auth
 * Deep links: exp:// (dev) and snapko:// (prod)
 */

import { useState, useEffect } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Complete auth session for web browser
WebBrowser.maybeCompleteAuthSession();

// Supabase client
const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Google OAuth config from env
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS;
const GOOGLE_CLIENT_ID_ANDROID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;

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

export function useGoogleAuth(): UseGoogleAuthReturn {
  const [state, setState] = useState<GoogleAuthState>({
    isLoading: false,
    error: null,
    user: null,
  });

  // Configure Google Auth
  // Per .antigravityrules: Add both exp:// (dev) and snapko:// (prod) to Supabase Dashboard
  const redirectUri = makeRedirectUri({
    scheme: "snapko",
    path: "auth/callback",
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_ID_WEB,
    iosClientId: GOOGLE_CLIENT_ID_IOS,
    androidClientId: GOOGLE_CLIENT_ID_ANDROID,
    scopes: ["openid", "profile", "email"],
    redirectUri,
  });

  // Handle auth response
  useEffect(() => {
    if (response?.type === "success" && response.authentication?.accessToken) {
      handleGoogleSignIn(response.authentication.accessToken);
    } else if (response?.type === "error") {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Google sign in failed",
      }));
    }
  }, [response]);

  const handleGoogleSignIn = async (accessToken: string) => {
    if (!supabase) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Supabase not configured",
      }));
      return;
    }

    try {
      // Sign in with Supabase using Google token
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: accessToken,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        setState({
          isLoading: false,
          error: null,
          user: {
            id: data.user.id,
            email: data.user.email || null,
            name: data.user.user_metadata?.full_name || null,
          },
        });
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Sign in failed",
      }));
    }
  };

  const signInWithGoogle = async () => {
    if (!request) {
      setState((prev) => ({
        ...prev,
        error: "Google Auth not configured. Check your environment variables.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await promptAsync();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start Google sign in",
      }));
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
      setState({
        isLoading: false,
        error: null,
        user: null,
      });
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

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
