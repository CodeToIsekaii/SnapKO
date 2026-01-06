// src/pages/Dashboard.tsx - Main Dashboard Container
// SOLID: This is a "Dumb Container" - handles layout/tabs, logic via hooks

import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";
import { useInventory } from "../hooks/useInventory";
import { useStaff } from "../hooks/useStaff";
import { Header } from "../components/Header";
import { InventoryTab } from "./tabs/InventoryTab";
import { DashboardTab } from "./tabs/DashboardTab";
import { EmployeesTab } from "./tabs/EmployeesTab";
import IngredientsPage from "./IngredientsPage";
import RecipesPage from "./Recipes";
import SettingsPage from "./SettingsPage";
import ProfileEditPage from "./ProfileEditPage";
import { dashboardStyles, COLORS } from "../styles/theme";
import { User } from "../types";

type TabId =
  | "dashboard"
  | "employees"
  | "inventory"
  | "ingredients"
  | "recipes"
  | "settings";

interface DashboardProps {
  user: User;
}

export function Dashboard({ user }: DashboardProps) {
  const { logout, profile, updateProfile, refreshProfile } = useAuth();
  const inventory = useInventory();
  const staff = useStaff();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [editingProfile, setEditingProfile] = useState(false);

  // Load data on mount + Auto-sync from server (Local-First pattern)
  useEffect(() => {
    // 1. Load local data immediately (fast startup)
    inventory.loadData();
    staff.loadStaff();

    // 2. Background sync from server (if online)
    const autoSync = async () => {
      try {
        console.log("🔄 [Dashboard] Auto-syncing from server...");
        await inventory.syncFromServer();
        console.log("✅ [Dashboard] Auto-sync completed");
      } catch (err) {
        console.log("⚠️ [Dashboard] Auto-sync failed (offline?):", err);
      }
    };

    // Delay sync slightly to not block initial render
    const syncTimer = setTimeout(autoSync, 1000);

    return () => clearTimeout(syncTimer);
  }, []);

  // Tab definitions - Updated with Settings
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "employees", label: "Nhân viên", icon: "👥" },
    { id: "inventory", label: "Tồn kho", icon: "📦" },
    { id: "ingredients", label: "Nguyên liệu", icon: "🥬" },
    { id: "recipes", label: "Công thức", icon: "🍳" },
    { id: "settings", label: "Cài đặt", icon: "⚙️" },
  ];

  // Handle model change with error handling
  const handleChangeModel = async (model: "SIMPLE" | "STANDARD") => {
    if (updateProfile) {
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
        await (window as any).electronAPI?.updateBusiness?.({
          inventory_model: model,
        });

        // 2. Update Legacy Profile + Local State (for UI consistency)
        const success = await updateProfile({ inventory_model: model });

        if (success) {
          console.log("[Dashboard] Model updated successfully!");
          // Force refresh profile from server to confirm sync
          await refreshProfile?.();
          alert(
            `✅ Đã chuyển sang chế độ ${
              model === "SIMPLE" ? "Kho Đơn" : "Kho Kép"
            }!`
          );
        } else {
          throw new Error("Local profile update failed");
        }
      } catch (err) {
        console.error("[Dashboard] Model update failed:", err);
        alert("❌ Lỗi: Không thể cập nhật mô hình kho. Vui lòng thử lại.");
      }
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
        onSync={inventory.syncFromServer}
        onLogout={logout}
      />

      {/* Tabs */}
      <div style={dashboardStyles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...dashboardStyles.tabButton,
              ...(activeTab === tab.id ? dashboardStyles.tabButtonActive : {}),
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main style={dashboardStyles.main}>
        {activeTab === "dashboard" && (
          <DashboardTab
            cogsReport={inventory.cogsReport}
            loading={inventory.loading}
            logs={inventory.logs} // Pass logs data
            onExport={inventory.exportCOGSReport}
            onRefresh={inventory.loadData}
          />
        )}

        {activeTab === "employees" && (
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
            totalValue={inventory.totalValue}
            lowStockCount={inventory.lowStockItems.length}
            loading={inventory.loading}
            onExport={inventory.exportToExcel}
            onRefresh={inventory.loadData}
          />
        )}

        {activeTab === "ingredients" && <IngredientsPage />}

        {activeTab === "recipes" && <RecipesPage />}

        {activeTab === "settings" && (
          <SettingsPage
            onLogout={logout}
            userName={profile?.full_name || undefined}
            userEmail={user.email}
            userRole={profile?.role}
            businessName={profile?.business_name || "Chưa thiết lập"}
            inventoryModel={profile?.inventory_model}
            onChangeModel={handleChangeModel}
            onEditProfile={() => setEditingProfile(true)}
          />
        )}
      </main>
    </div>
  );
}
