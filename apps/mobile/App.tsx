/**
 * SnapKO Mobile App - Main Entry Point
 *
 * Architecture:
 * - AuthProvider wraps entire app for state-driven navigation
 * - Navigation switches between AuthStack and AppStack based on authState
 * - Local-first: All UI operations never block on network
 */

import "./global.css";
import { StatusBar } from "expo-status-bar";
import React, { useMemo, useEffect } from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SQLite from "expo-sqlite";

import { AuthProvider, useAuth } from "./src/contexts";
import { initSyncEngine, cleanupSyncEngine } from "./src/sync/syncEngine";
import {
  LoginScreen,
  InviteJoinScreen,
  PendingScreen,
  InventoryCaptureScreen,
  SettingsScreen,
  OwnerPendingListScreen,
  DashboardScreen,
} from "./src/screens";

// F&B Theme Colors
const colors = {
  background: "#121212",
  primary: "#E07A2F",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
};

// ================== DATABASE INIT ==================

async function initLocalDb() {
  const db = await SQLite.openDatabaseAsync("snapko.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS local_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      full_name TEXT,
      phone_number TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_inventory_logs (
      id TEXT PRIMARY KEY NOT NULL,
      ai_raw_json TEXT,
      confirmed_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

// ================== APP NAVIGATOR ==================

type Screen =
  | "LOGIN"
  | "STAFF_JOIN"
  | "STAFF_PENDING"
  | "DASHBOARD"
  | "INVENTORY_CAPTURE"
  | "SETTINGS"
  | "OWNER_PENDING_LIST";

function AppNavigator() {
  const { authState, setStaffPending, clearStaffPending, signOut } = useAuth();
  const [currentScreen, setCurrentScreen] = React.useState<Screen>("LOGIN");
  const [dbReady, setDbReady] = React.useState(false);

  // Initialize DB and sync engine
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await initLocalDb();
        if (mounted) {
          await initSyncEngine(db);
          setDbReady(true);
        }
      } catch (e) {
        console.error("DB init failed:", e);
      }
    })();
    return () => {
      mounted = false;
      cleanupSyncEngine();
    };
  }, []);

  // Navigate based on auth state changes
  useEffect(() => {
    if (authState.status === "authenticated") {
      // Owner goes to dashboard, staff goes to inventory
      if (authState.profile.role === "OWNER") {
        setCurrentScreen("DASHBOARD");
      } else {
        setCurrentScreen("INVENTORY_CAPTURE");
      }
    } else if (authState.status === "pending") {
      setCurrentScreen("STAFF_PENDING");
    } else if (authState.status === "unauthenticated") {
      setCurrentScreen("LOGIN");
    }
  }, [authState]);

  // Loading state
  if (authState.status === "loading" || !dbReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 16 }}>
          Đang khởi tạo...
        </Text>
      </View>
    );
  }

  // ============ AUTH STACK (Unauthenticated) ============
  if (authState.status === "unauthenticated") {
    if (currentScreen === "STAFF_JOIN") {
      return (
        <InviteJoinScreen
          onSuccess={(profileId) => {
            setStaffPending(profileId);
          }}
          onBack={() => setCurrentScreen("LOGIN")}
        />
      );
    }

    return <LoginScreen onStaffJoin={() => setCurrentScreen("STAFF_JOIN")} />;
  }

  // ============ PENDING STACK (Staff waiting) ============
  if (authState.status === "pending") {
    return (
      <PendingScreen
        profileId={authState.profileId}
        onApproved={() => {
          // After approval, they need to actually log in
          // This will be handled by the backend activating their profile
          setCurrentScreen("LOGIN");
        }}
        onCancel={() => {
          clearStaffPending();
        }}
      />
    );
  }

  // ============ APP STACK (Authenticated) ============
  const { profile } = authState;
  const isOwner = profile.role === "OWNER";

  switch (currentScreen) {
    case "SETTINGS":
      return (
        <SettingsScreen
          onBack={() =>
            setCurrentScreen(isOwner ? "DASHBOARD" : "INVENTORY_CAPTURE")
          }
          onLogout={signOut}
          userName={profile.fullName || undefined}
          userRole={profile.role}
        />
      );

    case "OWNER_PENDING_LIST":
      return (
        <OwnerPendingListScreen onBack={() => setCurrentScreen("DASHBOARD")} />
      );

    case "INVENTORY_CAPTURE":
      return (
        <InventoryCaptureScreen
          onBack={() =>
            setCurrentScreen(isOwner ? "DASHBOARD" : "INVENTORY_CAPTURE")
          }
          onOpenSettings={() => setCurrentScreen("SETTINGS")}
        />
      );

    case "DASHBOARD":
    default:
      return (
        <DashboardScreen
          onOpenSettings={() => setCurrentScreen("SETTINGS")}
          onOpenInventory={() => setCurrentScreen("INVENTORY_CAPTURE")}
          onOpenPendingList={() => setCurrentScreen("OWNER_PENDING_LIST")}
        />
      );
  }
}

// ================== ROOT COMPONENT ==================

export default function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 2,
          },
        },
      }),
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="light" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
