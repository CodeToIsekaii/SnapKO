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
import { initLocalDb } from "../db";

// Colors from .UXUIrules
const COLORS = {
  background: "#121212", // Dark mode base
  primary: "#E07A2F", // Burnt Orange
};

// Auth context type
interface AuthState {
  isLoggedIn: boolean;
  hasBusinessId: boolean;
  isLoading: boolean;
  userId: string | null;
  businessId: string | null;
  role: string | null;
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    hasBusinessId: false,
    isLoading: true,
    userId: null,
    businessId: null,
    role: null,
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
          }>("SELECT * FROM local_profiles LIMIT 1");

          if (profile) {
            setAuthState({
              isLoggedIn: true,
              hasBusinessId: !!profile.business_id,
              isLoading: false,
              userId: profile.id,
              businessId: profile.business_id,
              role: profile.role,
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

  // Handle auth routing
  useEffect(() => {
    if (authState.isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

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
    } else if (authState.isLoggedIn && authState.hasBusinessId && inAuthGroup) {
      // Logged in with business and still on auth screen -> redirect to main app
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
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="camera/[snapType]"
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </>
  );
}
