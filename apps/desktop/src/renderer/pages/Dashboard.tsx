// src/pages/Dashboard.tsx - Main Dashboard Container
// SOLID: This is a "Dumb Container" - handles layout/tabs, logic via hooks

import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";
import { useInventory } from "../hooks/useInventory";
import { useStaff } from "../hooks/useStaff";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { Header } from "../components/Header";
import { InventoryTab } from "./tabs/InventoryTab";
import { DashboardTab } from "./tabs/DashboardTab";
import { EmployeesTab } from "./tabs/EmployeesTab";
import IngredientsPage from "./IngredientsPage";
import RecipesPage from "./Recipes";
import ReportsPage from "./ReportsPage";
import SettingsPage from "./SettingsPage";
import ProfileEditPage from "./ProfileEditPage";
import { dashboardStyles } from "../styles/theme";
import { User } from "../types";
import {
  BarChart3,
  Users,
  Package,
  Leaf,
  ChefHat,
  Settings,
  TrendingUp,
} from "lucide-react";

type TabId =
  | "dashboard"
  | "employees"
  | "inventory"
  | "ingredients"
  | "recipes"
  | "reports"
  | "settings";

interface DashboardProps {
  user: User;
}

export function Dashboard({ user }: DashboardProps) {
  const { logout, profile, refreshProfile } = useAuth();
  const inventory = useInventory();
  const staff = useStaff();

  // Subscription status (replaces old inline trial logic)
  const subscription = useSubscriptionStatus({
    subscriptionStatus: profile?.subscription_status,
    daysRemaining: profile?.days_remaining,
    subscriptionExpiresAt: profile?.subscription_expires_at,
    canUseDualWarehouse: profile?.entitlements?.canUseDualWarehouse,
  });
  const entitlements = profile?.entitlements;
  const canUseDualWarehouse = entitlements?.canUseDualWarehouse ?? false;
  const canUseCustomStorageAreas =
    entitlements?.canUseCustomStorageAreas ?? false;
  const canInviteStaff = entitlements?.canInviteStaff ?? false;
  const canUseAdvancedReports =
    entitlements?.canUseAdvancedReports ?? false;
  const isOwner = profile?.role === "OWNER";
  const isManager = profile?.role === "BRANCH_MANAGER";
  const readOnly = profile?.read_only === true;

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [editingProfile, setEditingProfile] = useState(false);
  const [pendingTransferCount, setPendingTransferCount] = useState(0);

  useEffect(() => {
    if (!canUseDualWarehouse) {
      setPendingTransferCount(0);
      return;
    }

    const fetchPending = async () => {
      try {
        const data = await (window as any).electronAPI?.reportsGet(
          "/inventory/transfers?status=PENDING"
        );
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        setPendingTransferCount(list.length);
      } catch {
        // ignore
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10 * 60 * 1000); // 10 min
    return () => clearInterval(interval);
  }, [canUseDualWarehouse]);

  // Load data on mount + Auto-sync from server (Local-First pattern)
  useEffect(() => {
    // 1. Load local data immediately (fast startup)
    inventory.loadData();
    if (isOwner || isManager) staff.loadStaff();

    // 2. Background sync from server (if online)
    const autoSync = async () => {
      try {
        console.log("🔄 [Dashboard] Auto-syncing from server...");
        if (!readOnly) await inventory.syncFromServer();
        console.log("✅ [Dashboard] Auto-sync completed");
      } catch (err) {
        console.log("⚠️ [Dashboard] Auto-sync failed (offline?):", err);
      }
    };

    // Delay sync slightly to not block initial render
    const syncTimer = setTimeout(autoSync, 1000);

    return () => clearTimeout(syncTimer);
  }, [isManager, isOwner, readOnly]);

  // Refresh profile when user opens Settings tab (to get latest model from server)
  useEffect(() => {
    if (activeTab === "settings") {
      console.log("[Dashboard] Settings tab opened, refreshing profile...");
      refreshProfile?.();
    }
  }, [activeTab, refreshProfile]);

  // Re-load dashboard data when returning from Settings so new retention-days
  // config applies immediately to activity logs.
  useEffect(() => {
    if (activeTab === "dashboard") {
      inventory.loadData();
    }
  }, [activeTab, inventory.loadData]);

  // Tab definitions - Updated with Settings
  const tabs: { id: TabId; label: string; icon: React.ReactNode; locked?: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart3 size={16} /> },
    { id: "employees", label: "Nhân viên", icon: <Users size={16} />, locked: !canInviteStaff },
    {
      id: "inventory",
      label: "Tồn kho",
      icon: (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Package size={16} />
          {pendingTransferCount > 0 && (
            <span style={{ background: "#E63946", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 700, padding: "1px 6px", lineHeight: "16px" }}>
              {pendingTransferCount}
            </span>
          )}
        </span>
      ),
    },
    ...(isOwner
      ? [
          { id: "ingredients" as const, label: "Nguyên liệu", icon: <Leaf size={16} /> },
          { id: "recipes" as const, label: "Công thức", icon: <ChefHat size={16} /> },
        ]
      : []),
    { id: "reports", label: "Báo cáo", icon: <TrendingUp size={16} />, locked: !canUseAdvancedReports },
    { id: "settings", label: "Cài đặt", icon: <Settings size={16} /> },
  ];

  const openPricing = async () => {
    try {
      const result = await (window as any).electronAPI?.openExternal?.(
        "https://app.snapko.vn/pricing"
      );
      if (!result?.success) {
        throw new Error(result?.error || "Không thể mở trình duyệt");
      }
    } catch (err: any) {
      alert(
        "Không thể mở trang nâng cấp. Vui lòng truy cập https://app.snapko.vn/pricing"
      );
      console.error("[Dashboard] openPricing failed:", err);
    }
  };

  // Handle model change with error handling
  const handleChangeModel = async (model: "SIMPLE" | "STANDARD" | "CHAIN") => {
    // Enforce subscription limit for Standard Model (Kho Kép)
    if (model === "STANDARD" && !canUseDualWarehouse) {
      alert(
        "⚠️ Gói của bạn đã hết hạn. Vui lòng nâng cấp để sử dụng tính năng Kho Kép (Dual Warehouse)."
      );
      openPricing();
      return;
    }

    if (model === "CHAIN" && !canUseCustomStorageAreas) {
      alert("⚠️ Mô hình nhiều khu vực cần gói CHAIN còn hiệu lực.");
      openPricing();
      return;
    }

    console.log("[Dashboard] Changing model to:", model);

    try {
      // CHECK IF API IS AVAILABLE (Force Restart if missing)
      if (!(window as any).electronAPI?.updateBusiness) {
        alert(
          "⚠️ Lỗi phiên bản: API chưa được cập nhật.\n\nVui lòng TẮT và MỞ LẠI ứng dụng Desktop (Restart) để nhận code mới!"
        );
        return;
      }

      // 1. Update GLOBAL Business Config (Source of Truth)
      const businessResult = await (window as any).electronAPI?.updateBusiness?.({
        inventory_model: model,
      });
      if (!businessResult?.success) {
        throw new Error(businessResult?.error || "Business update failed");
      }

      console.log("[Dashboard] Model updated successfully!");
      await refreshProfile?.();
      alert(
        `✅ Đã chuyển sang chế độ ${
          model === "SIMPLE"
            ? "Kho Đơn"
            : model === "CHAIN"
              ? "Nhiều khu vực"
              : "Kho Kép"
        }!`
      );
    } catch (err) {
      console.error("[Dashboard] Model update failed:", err);
      alert("❌ Lỗi: Không thể cập nhật mô hình kho. Vui lòng thử lại.");
    }
  };

  // Show Profile Edit Page if editing
  if (editingProfile) {
    return (
      <ProfileEditPage
        onBack={() => setEditingProfile(false)}
        onSave={() => {
          setEditingProfile(false);
          refreshProfile?.();
        }}
        initialData={{
          fullName: profile?.full_name || "",
          businessName: profile?.business_name || "",
          phoneNumber: profile?.phone_number || "",
        }}
      />
    );
  }

  return (
    <div style={dashboardStyles.container}>
      {/* Header */}
      <Header
        user={user}
        syncStatus={inventory.syncStatus}
        onSync={() =>
          readOnly
            ? Promise.resolve(
                alert("Gói đã hết hạn hoặc đang chờ full-count Kho Tổng. Desktop hiện chỉ đọc."),
              )
            : inventory.syncFromServer({ force: true })
        }
        onLogout={logout}
      />

      {/* Tabs */}
      <div style={dashboardStyles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.locked) {
                alert("Tính năng này cần gói PRO/CHAIN còn hiệu lực.");
                openPricing();
                return;
              }
              setActiveTab(tab.id);
            }}
            style={{
              ...dashboardStyles.tabButton,
              ...(activeTab === tab.id ? dashboardStyles.tabButtonActive : {}),
              ...(tab.locked ? { opacity: 0.45, cursor: "not-allowed" } : {}),
            }}
          >
            {tab.icon} {tab.label}{tab.locked ? " 🔒" : ""}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main style={dashboardStyles.main}>
        {activeTab === "dashboard" && (
          <DashboardTab
            cogsReport={inventory.cogsReport}
            canUseDualWarehouse={canUseDualWarehouse}
            canUseAdvancedReports={canUseAdvancedReports}
            loading={inventory.loading}
            logs={inventory.logs} // Pass logs data
            onExport={inventory.exportCOGSReport}
            onRefresh={inventory.loadData}
          />
        )}

        {activeTab === "employees" && canInviteStaff && (
          <EmployeesTab
            pendingStaff={staff.pendingStaff}
            activeStaff={staff.activeStaff}
            loading={staff.loading}
            generating={staff.generating}
            onLoadStaff={staff.loadStaff}
            onGenerateCode={staff.generateInviteCode}
            onStaffAction={staff.staffAction}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryTab
            ingredients={inventory.ingredients}
            loading={inventory.loading}
            onExport={inventory.exportToExcel}
            onRefresh={inventory.loadData}
          />
        )}

        {activeTab === "ingredients" && isOwner && !readOnly && <IngredientsPage />}

        {activeTab === "recipes" && isOwner && !readOnly && <RecipesPage />}

        {activeTab === "reports" && canUseAdvancedReports && (
          <ReportsPage
            role={profile?.role}
            branches={profile?.branches ?? []}
          />
        )}

        {activeTab === "settings" && (
          <SettingsPage
            onLogout={logout}
            userName={profile?.full_name || undefined}
            userEmail={user.email}
            userRole={profile?.role}
            businessName={profile?.business_name || "Chưa thiết lập"}
            inventoryModel={profile?.inventory_model}
            storedInventoryModel={profile?.stored_inventory_model}
            tier={profile?.tier}
            effectiveTier={profile?.effective_tier}
            entitlements={profile?.entitlements}
            onChangeModel={handleChangeModel}
            onEditProfile={() => setEditingProfile(true)}
            subscription={subscription}
          />
        )}
      </main>
    </div>
  );
}
