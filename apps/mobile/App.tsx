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
import { ActivityIndicator, Alert, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SQLite from "expo-sqlite";

import { AuthProvider, useAuth } from "./src/contexts";
import { initializeAds } from "./src/features/ads/rewardedAds";
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
  ProfileEditScreen,
  AdHocTransferScreen,
  QuickOutScreen,
  StaffManagementScreen,
  PendingTransfersScreen,
} from "./src/screens";
import {
  InventoryModelProvider,
  useInventoryModel,
} from "./src/contexts/InventoryModelContext";
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
  | "PROFILE_EDIT"
  | "TRANSFER"
  | "QUICK_OUT"
  | "STAFF_MANAGEMENT"
  | "PENDING_TRANSFERS";

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
  const { model: syncedInventoryModel, syncModel } = useInventoryModel();
  const refreshProfileRef = React.useRef(refreshProfile);
  const lastProfileRefreshForModelRef = React.useRef<string | null>(null);
  const [currentScreen, setCurrentScreen] = React.useState<Screen>("LOGIN");
  const [dbReady, setDbReady] = React.useState(false);
  const [confirmLogParams, setConfirmLogParams] =
    React.useState<ConfirmLogParams | null>(null);
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
    refreshProfileRef.current = refreshProfile;
  }, [refreshProfile]);

  useEffect(() => {
    if (!dbReady || authState.status !== "authenticated") return;

    let cancelled = false;
    (async () => {
      try {
        await syncModel();
        if (!cancelled) {
          await refreshProfileRef.current();
        }
      } catch (err) {
        console.warn("[AppNavigator] Business config sync skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dbReady,
    syncModel,
    authState.status,
    authState.status === "authenticated" ? authState.profile.id : null,
  ]);

  useEffect(() => {
    if (authState.status !== "authenticated") return;

    const authInventoryModel =
      authState.profile.effectiveInventoryModel || "SIMPLE";
    if (syncedInventoryModel === authInventoryModel) return;

    const refreshKey = `${authState.profile.id}:${syncedInventoryModel}`;
    if (lastProfileRefreshForModelRef.current === refreshKey) return;
    lastProfileRefreshForModelRef.current = refreshKey;

    refreshProfileRef.current().catch((err) => {
      console.warn("[AppNavigator] Profile refresh after config sync failed:", err);
    });
  }, [
    syncedInventoryModel,
    authState.status,
    authState.status === "authenticated" ? authState.profile.id : null,
    authState.status === "authenticated"
      ? authState.profile.effectiveInventoryModel
      : null,
  ]);

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
  const canManageStaff =
    profile.role === "OWNER" || profile.role === "BRANCH_MANAGER";
  const openInventory = (
    mode?: string,
    area?: StorageArea,
    check?: CheckMode,
  ) => {
    if (profile.operationalState === "READ_ONLY_EXPIRED") {
      Alert.alert(
        "Chỉ đọc",
        "Gói đã hết hạn. Vui lòng gia hạn trên web trước khi tiếp tục vận hành.",
      );
      return;
    }
    if (
      profile.operationalState === "WAREHOUSE_REBASELINE_REQUIRED" &&
      mode !== "stock"
    ) {
      Alert.alert(
        "Cần kiểm lại Kho Tổng",
        "Gia hạn trễ yêu cầu full-count Kho Tổng trước. Sau đó mới nhập Sales và kiểm Bar.",
      );
      return;
    }
    setInventoryParams({
      mode: (mode as InventoryParams["mode"]) || "stock",
      areaType: area,
      checkMode: check,
    });
    setCurrentScreen("INVENTORY_CAPTURE");
  };
  const openActiveOperation = (screen: "TRANSFER" | "QUICK_OUT") => {
    if (profile.operationalState !== "ACTIVE") {
      Alert.alert(
        "Chưa thể thao tác",
        profile.operationalState === "WAREHOUSE_REBASELINE_REQUIRED"
          ? "Cần full-count Kho Tổng trước khi thực hiện thao tác khác."
          : "Gói đã hết hạn. Mobile hiện chỉ đọc.",
      );
      return;
    }
    setCurrentScreen(screen);
  };

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
            canManageStaff
              ? () => setCurrentScreen("STAFF_MANAGEMENT")
              : undefined
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

    case "PENDING_TRANSFERS":
      return (
        <PendingTransfersScreen onBack={() => setCurrentScreen("DASHBOARD")} />
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
          onOpenInventory={openInventory}
          onOpenTransfer={() => openActiveOperation("TRANSFER")}
          onOpenPendingTransfers={() =>
            setCurrentScreen("PENDING_TRANSFERS")
          }
          onOpenPendingList={() => setCurrentScreen("OWNER_PENDING_LIST")}
          onOpenQuickOut={() => openActiveOperation("QUICK_OUT")}
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

  useEffect(() => {
    initializeAds().catch((error) => {
      console.warn("[App] Ads initialization skipped:", error);
    });
  }, []);

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
