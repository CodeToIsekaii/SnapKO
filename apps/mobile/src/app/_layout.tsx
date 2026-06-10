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
import { syncBusinessConfig } from "../lib/supabase";
import { InventoryModelProvider } from "../contexts/InventoryModelContext";
import { usePushNotifications } from "../hooks/usePushNotifications";

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

function PushBootstrap() {
  usePushNotifications();
  return null;
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
          let profile = await db.getFirstAsync<{
            id: string;
            business_id: string | null;
            role: string;
            status: string;
            inventory_model: string | null;
          }>("SELECT * FROM local_profiles LIMIT 1");
          let hasAuthoritativeConfig = false;

          // If we have a profile, sync config from server to get latest inventory_model
          if (profile && profile.business_id) {
            console.log("🔄 Syncing business config from server...");
            const serverConfig = await syncBusinessConfig();

            if (serverConfig.success && serverConfig.inventoryModel) {
              hasAuthoritativeConfig = true;
              // Re-fetch local profile after sync updated it
              profile = await db.getFirstAsync<{
                id: string;
                business_id: string | null;
                role: string;
                status: string;
                inventory_model: string | null;
              }>("SELECT * FROM local_profiles LIMIT 1");
              console.log(
                "✅ Synced inventory_model:",
                serverConfig.inventoryModel
              );
            }
          }

          if (profile) {
            const operationalModel =
              profile.inventory_model === "SIMPLE" || hasAuthoritativeConfig
                ? profile.inventory_model
                : "SIMPLE";
            setAuthState({
              isLoggedIn: true,
              hasBusinessId: !!profile.business_id,
              hasOperationalModel: !!operationalModel,
              isLoading: false,
              userId: profile.id,
              businessId: profile.business_id,
              role: profile.role,
              operationalModel,
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

  // Network restore auto-sync (event-driven, not polling)
  useEffect(() => {
    let wasOffline = false;

    // Seed initial state so we don't fire sync on first listener call when already online
    Network.getNetworkStateAsync()
      .then((s) => {
        wasOffline = !s.isConnected;
      })
      .catch(() => {});

    const sub = Network.addNetworkStateListener((state) => {
      if (state.isConnected && wasOffline) {
        console.log("🌐 Network restored -> Auto-syncing...");
        processSyncQueue();
      }
      wasOffline = !state.isConnected;
    });

    return () => sub.remove();
  }, []);

  // Periodic sync every 120 seconds
  useEffect(() => {
    const syncInterval = setInterval(() => {
      console.log("⏰ Periodic sync check...");
      processSyncQueue();
    }, 120000);

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
      <InventoryModelProvider>
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
      </InventoryModelProvider>
    );
  }

  return (
    <InventoryModelProvider>
      {authState.isLoggedIn && authState.hasBusinessId ? <PushBootstrap /> : null}
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
    </InventoryModelProvider>
  );
}
