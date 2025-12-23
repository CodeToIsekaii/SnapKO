// src/pages/Dashboard.tsx - Main Dashboard Container
// SOLID: This is a "Dumb Container" - handles layout/tabs, logic via hooks

import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useInventory } from "../hooks/useInventory";
import { useStaff } from "../hooks/useStaff";
import { Header } from "../components/Header";
import { InventoryTab } from "./tabs/InventoryTab";
import { DashboardTab } from "./tabs/DashboardTab";
import { EmployeesTab } from "./tabs/EmployeesTab";
import { dashboardStyles, COLORS } from "../styles/theme";
import { User } from "../types";

type TabId = "dashboard" | "employees" | "inventory";

interface DashboardProps {
  user: User;
}

export function Dashboard({ user }: DashboardProps) {
  const { logout } = useAuth();
  const inventory = useInventory();
  const staff = useStaff();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // Load data on mount
  useEffect(() => {
    inventory.loadData();
    staff.loadStaff();
  }, []);

  // Tab definitions
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "employees", label: "Nhân viên", icon: "👥" },
    { id: "inventory", label: "Tồn kho", icon: "📦" },
  ];

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
      </main>
    </div>
  );
}
