/**
 * Root Layout - Expo Router
 * Per .antigravityrules Section 4 Mobile Folder Structure
 *
 * Auth Flow Logic:
 * - If not logged in → /login
 * - If logged in but no business_id → /join-staff
 * - If logged in and has business_id → /(tabs)
 */

import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import * as Network from "expo-network";
import { initLocalDb } from "../db";
import { processSyncQueue } from "../services/syncQueue";

// F&B "Organic Tech" Theme - Per .UXUIrules
const SnapKoTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: "#E07A2F", // Burnt Orange - CTAs
    background: "#121212", // Charcoal - Main background
    card: "#1A1A1A", // Dark Coffee - Headers/Tabs
    text: "#F5F3EF", // Cream White
    border: "#2A2A2A", // Subtle borders
    notification: "#E63946", // Tomato Red
  },
};

// Colors from .UXUIrules (for inline styles)
const COLORS = {
  background: "#121212", // Dark mode base
  primary: "#E07A2F", // Burnt Orange
};

// Auth context type
interface AuthState {
  isLoggedIn: boolean;
  hasBusinessId: boolean;
  hasOperationalModel: boolean; // Shop has configured Model A/B
  isLoading: boolean;
  userId: string | null;
  businessId: string | null;
  role: string | null;
  operationalModel: string | null; // 'MODEL_A' | 'MODEL_B' | null
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    hasBusinessId: false,
    hasOperationalModel: false,
    isLoading: true,
    userId: null,
    businessId: null,
    role: null,
    operationalModel: null,
  });

  // Initialize database and check auth on mount
  useEffect(() => {
    async function init() {
      try {
        // Initialize local SQLite database
        await initLocalDb();

        // TODO: Check Supabase session
        // const { data: { session } } = await supabase.auth.getSession();

        // For now, simulate checking local profile
        const db = (await import("../db")).getDb();
        if (db) {
          const profile = await db.getFirstAsync<{
            id: string;
            business_id: string | null;
            role: string;
            status: string;
            inventory_model: string | null;
          }>("SELECT * FROM local_profiles LIMIT 1");

          if (profile) {
            setAuthState({
              isLoggedIn: true,
              hasBusinessId: !!profile.business_id,
              hasOperationalModel: !!profile.inventory_model,
              isLoading: false,
              userId: profile.id,
              businessId: profile.business_id,
              role: profile.role,
              operationalModel: profile.inventory_model,
            });
          } else {
            setAuthState((prev) => ({ ...prev, isLoading: false }));
          }
        } else {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error("Init error:", error);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    }

    init();
  }, []);

  // Network restore auto-sync
  useEffect(() => {
    let wasOffline = false;

    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      if (state.isConnected && state.isInternetReachable && wasOffline) {
        console.log("🌐 Network restored -> Auto-syncing...");
        processSyncQueue();
      }
      wasOffline = !state.isConnected;
    };

    // Check network every 10 seconds
    const networkInterval = setInterval(checkNetwork, 10000);
    return () => clearInterval(networkInterval);
  }, []);

  // Periodic sync every 60 seconds
  useEffect(() => {
    const syncInterval = setInterval(() => {
      console.log("⏰ Periodic sync check...");
      processSyncQueue();
    }, 60000);

    // Initial sync on app start
    processSyncQueue().then(() => {
      console.log("🚀 Initial sync completed");
    });

    return () => clearInterval(syncInterval);
  }, []);

  // Handle auth routing
  useEffect(() => {
    if (authState.isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";
    const inSetupPending = segments.includes("setup-pending");
    const inJoinStaff = segments.includes("join-staff");

    if (!authState.isLoggedIn && !inAuthGroup) {
      // Not logged in and not on auth screen -> redirect to login
      router.replace("/(auth)/login");
    } else if (
      authState.isLoggedIn &&
      !authState.hasBusinessId &&
      !inJoinStaff
    ) {
      // Logged in but no business (new staff) -> redirect to join
      router.replace("/(auth)/join-staff");
    } else if (
      authState.isLoggedIn &&
      authState.hasBusinessId &&
      !authState.hasOperationalModel &&
      !inSetupPending
    ) {
      // Logged in with business but shop hasn't configured model -> waiting room
      router.replace("/(auth)/setup-pending");
    } else if (
      authState.isLoggedIn &&
      authState.hasBusinessId &&
      authState.hasOperationalModel &&
      (inAuthGroup || inSetupPending)
    ) {
      // Logged in with business and model configured -> redirect to main app
      router.replace("/(tabs)/dashboard");
    }
  }, [authState, segments]);

  // Show loading spinner while checking auth
  if (authState.isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={SnapKoTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
          animation: "slide_from_right",
        }}
      >
        {/* Note: Auth is handled by App.tsx, not Expo Router */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="camera/[snapType]"
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
