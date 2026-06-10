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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SQLite from "expo-sqlite";

import { AuthProvider, useAuth } from "./src/contexts";
import { initSyncEngine, cleanupSyncEngine } from "./src/sync/syncEngine";
import { usePushNotifications } from "./src/hooks/usePushNotifications";
import {
  LoginScreen,
  InviteJoinScreen,
  PendingScreen,
  ProfileSetupScreen,
  InventoryCaptureScreen,
  ConfirmLogScreen,
  SettingsScreen,
  OwnerPendingListScreen,
  DashboardScreen,
  RecipeListScreen,
  RecipeEditScreen,
  RecipeScanScreen,
  IngredientsListScreen,
  IngredientEditScreen,
  ProfileEditScreen,
  AdHocTransferScreen,
  QuickOutScreen,
  StaffManagementScreen,
} from "./src/screens";
import { InventoryModelProvider } from "./src/contexts/InventoryModelContext";
import type {
  StorageArea,
  CheckMode,
} from "./src/components/AreaSelectorModal";
import type { ConfirmItem } from "./src/screens";

// F&B Theme Colors
const colors = {
  background: "#121212",
  primary: "#E07A2F",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
};

// ================== DATABASE INIT ==================

// DB Init handled in src/db/index.ts

// ================== APP NAVIGATOR ==================

type Screen =
  | "LOGIN"
  | "STAFF_JOIN"
  | "STAFF_PENDING"
  | "PROFILE_SETUP"
  | "DASHBOARD"
  | "INVENTORY_CAPTURE"
  | "CONFIRM_LOG"
  | "SETTINGS"
  | "OWNER_PENDING_LIST"
  | "RECIPE_LIST"
  | "RECIPE_EDIT"
  | "RECIPE_SCAN"
  | "INGREDIENTS_LIST"
  | "INGREDIENT_EDIT"
  | "PROFILE_EDIT"
  | "TRANSFER"
  | "QUICK_OUT"
  | "STAFF_MANAGEMENT";

function PushRegistrationWorker() {
  usePushNotifications();
  return null;
}

function PushRegistrationGate() {
  const { authState } = useAuth();
  if (authState.status !== "authenticated") return null;
  return <PushRegistrationWorker key={authState.profile.id} />;
}

// State for ConfirmLog screen
interface ConfirmLogParams {
  items: ConfirmItem[];
  localImagePath: string;
}

interface InventoryParams {
  mode: "import" | "sales" | "stock";
  areaType?: StorageArea;
  checkMode?: CheckMode;
}

function AppNavigator() {
  const {
    authState,
    setStaffPending,
    clearStaffPending,
    signOut,
    refreshProfile,
  } = useAuth();
  const [currentScreen, setCurrentScreen] = React.useState<Screen>("LOGIN");
  const [dbReady, setDbReady] = React.useState(false);
  const [confirmLogParams, setConfirmLogParams] =
    React.useState<ConfirmLogParams | null>(null);
  const [editingRecipeId, setEditingRecipeId] = React.useState<string | null>(
    null
  );
  const [editingIngredientId, setEditingIngredientId] = React.useState<
    string | null
  >(null);
  const [inventoryParams, setInventoryParams] = React.useState<InventoryParams>(
    {
      mode: "stock",
    }
  );

  // Initialize DB first; sync starts only after backend auth is ready.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { getDB } = await import("./src/db");
        await getDB();
        if (mounted) {
          setDbReady(true);
        }
      } catch (e) {
        console.error("DB init failed:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dbReady || authState.status !== "authenticated") return;

    let mounted = true;
    (async () => {
      try {
        const { getDB } = await import("./src/db");
        const db = await getDB();
        if (!mounted) return;
        initSyncEngine(db).catch((err) =>
          console.error("Background sync init failed:", err)
        );
      } catch (e) {
        console.error("Sync init failed:", e);
      }
    })();

    return () => {
      mounted = false;
      cleanupSyncEngine();
    };
  }, [
    dbReady,
    authState.status,
    authState.status === "authenticated" ? authState.profile.id : null,
  ]);

  // Navigate based on auth state changes
  useEffect(() => {
    if (authState.status === "authenticated") {
      // Both Owner and Staff go to dashboard first
      setCurrentScreen("DASHBOARD");
    } else if (authState.status === "needs_setup") {
      // Owner without business -> Profile Setup
      setCurrentScreen("PROFILE_SETUP");
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
          onSuccess={async (profileId) => {
            await setStaffPending(profileId);
          }}
          onBack={() => setCurrentScreen("LOGIN")}
        />
      );
    }

    return <LoginScreen onStaffJoin={() => setCurrentScreen("STAFF_JOIN")} />;
  }

  // ============ PENDING STACK (Staff waiting for approval) ============
  // Note: Staff already has session from auth-join-staff Edge Function
  // When approved, refreshProfile will detect ACTIVE status and transition to authenticated
  if (authState.status === "pending") {
    return (
      <PendingScreen
        profileId={authState.profileId}
        onApproved={async () => {
          // Staff is approved and already logged in (shadow account)
          // Just refresh profile - it will detect ACTIVE status
          // AuthContext will transition to 'authenticated' state automatically
          await refreshProfile();
          // The useEffect watching authState will navigate to appropriate screen
        }}
        onCancel={() => {
          clearStaffPending();
        }}
      />
    );
  }

  // ============ PROFILE SETUP (Owner without business) ============
  if (authState.status === "needs_setup") {
    return <ProfileSetupScreen />;
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
          onEditProfile={() => setCurrentScreen("PROFILE_EDIT")}
          onManageStaff={
            isOwner ? () => setCurrentScreen("STAFF_MANAGEMENT") : undefined
          }
        />
      );

    case "STAFF_MANAGEMENT":
      return (
        <StaffManagementScreen onBack={() => setCurrentScreen("SETTINGS")} />
      );

    case "PROFILE_EDIT":
      return (
        <ProfileEditScreen
          onBack={() => setCurrentScreen("SETTINGS")}
          onSave={() => {
            refreshProfile();
            setCurrentScreen("SETTINGS");
          }}
          initialData={{
            fullName: profile.fullName || undefined,
            businessName: (profile as any).businessName || undefined,
            phoneNumber: profile.phoneNumber || undefined,
          }}
        />
      );

    case "OWNER_PENDING_LIST":
      return (
        <OwnerPendingListScreen onBack={() => setCurrentScreen("DASHBOARD")} />
      );

    case "INVENTORY_CAPTURE":
      return (
        <InventoryCaptureScreen
          initialMode={inventoryParams.mode}
          areaType={inventoryParams.areaType}
          checkMode={inventoryParams.checkMode}
          onBack={() => setCurrentScreen("DASHBOARD")}
          onOpenSettings={() => setCurrentScreen("SETTINGS")}
          onNavigateToConfirm={(items, localImagePath) => {
            setConfirmLogParams({ items, localImagePath });
            setCurrentScreen("CONFIRM_LOG");
          }}
        />
      );

    case "TRANSFER":
      return (
        <AdHocTransferScreen
          onBack={() => setCurrentScreen("DASHBOARD")}
          onSuccess={() => setCurrentScreen("DASHBOARD")}
        />
      );

    case "CONFIRM_LOG":
      if (!confirmLogParams) {
        setCurrentScreen("INVENTORY_CAPTURE");
        return null;
      }
      return (
        <ConfirmLogScreen
          items={confirmLogParams.items}
          localImagePath={confirmLogParams.localImagePath}
          location="WAREHOUSE"
          type="IMPORT"
          onBack={() => {
            setConfirmLogParams(null);
            setCurrentScreen("INVENTORY_CAPTURE");
          }}
          onSuccess={() => {
            setConfirmLogParams(null);
            setCurrentScreen(isOwner ? "DASHBOARD" : "INVENTORY_CAPTURE");
          }}
        />
      );

    case "RECIPE_LIST":
      return (
        <RecipeListScreen
          onBack={() => setCurrentScreen("DASHBOARD")}
          onEditRecipe={(id) => {
            setEditingRecipeId(id);
            setCurrentScreen("RECIPE_EDIT");
          }}
          onAddRecipe={() => {
            setEditingRecipeId(null);
            setCurrentScreen("RECIPE_EDIT");
          }}
          onScanRecipe={() => setCurrentScreen("RECIPE_SCAN")}
        />
      );

    case "RECIPE_EDIT":
      return (
        <RecipeEditScreen
          recipeId={editingRecipeId ?? undefined}
          onBack={() => setCurrentScreen("RECIPE_LIST")}
          onSave={() => {
            setEditingRecipeId(null);
            setCurrentScreen("RECIPE_LIST");
          }}
        />
      );

    case "RECIPE_SCAN":
      return (
        <RecipeScanScreen
          onBack={() => setCurrentScreen("RECIPE_LIST")}
          onCreateRecipe={(recipeData) => {
            // In production: Save recipe and navigate to edit
            console.log("Creating recipe from AI:", recipeData);
            setCurrentScreen("RECIPE_LIST");
          }}
        />
      );

    case "INGREDIENTS_LIST":
      return (
        <IngredientsListScreen
          onBack={() => setCurrentScreen("DASHBOARD")}
          onAddNew={() => {
            setEditingIngredientId(null);
            setCurrentScreen("INGREDIENT_EDIT");
          }}
          onEdit={(id) => {
            setEditingIngredientId(id);
            setCurrentScreen("INGREDIENT_EDIT");
          }}
        />
      );

    case "INGREDIENT_EDIT":
      return (
        <IngredientEditScreen
          ingredientId={editingIngredientId ?? undefined}
          onBack={() => setCurrentScreen("INGREDIENTS_LIST")}
          onSave={() => {
            setEditingIngredientId(null);
            setCurrentScreen("INGREDIENTS_LIST");
          }}
        />
      );

    case "QUICK_OUT":
      return (
        <QuickOutScreen
          onBack={() => setCurrentScreen("DASHBOARD")}
          onSuccess={() => setCurrentScreen("DASHBOARD")}
        />
      );

    case "DASHBOARD":
    default:
      return (
        <DashboardScreen
          onOpenSettings={() => setCurrentScreen("SETTINGS")}
          onOpenInventory={(mode, area, check) => {
            setInventoryParams({
              mode: (mode as any) || "stock",
              areaType: area,
              checkMode: check,
            });
            setCurrentScreen("INVENTORY_CAPTURE");
          }}
          onOpenTransfer={() => setCurrentScreen("TRANSFER")}
          onOpenPendingList={() => setCurrentScreen("OWNER_PENDING_LIST")}
          onOpenRecipes={() => setCurrentScreen("RECIPE_LIST")}
          onOpenIngredients={() => setCurrentScreen("INGREDIENTS_LIST")}
          onOpenQuickOut={() => setCurrentScreen("QUICK_OUT")}
        />
      );
  }
}

// ================== ROOT COMPONENT ==================

import { SafeAreaProvider } from "react-native-safe-area-context";

// ... existing code ...

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <InventoryModelProvider>
              <PushRegistrationGate />
              <AppNavigator />
              <StatusBar style="light" />
            </InventoryModelProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
