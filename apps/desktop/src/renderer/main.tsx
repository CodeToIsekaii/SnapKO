// src/main.tsx - Entry Point (SOLID: Single Responsibility)
// This file ONLY handles: App mounting + Top-level routing
// All logic delegated to hooks, all UI delegated to pages/components

import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { ProfileSetupPage } from "./pages/ProfileSetupPage";
import ModelSelectionPage from "./pages/ModelSelectionPage";
import { COLORS } from "./styles/theme";
import "./index.css";

/**
 * App Root Component
 * Only handles: Check auth state → render LoginPage, ProfileSetup, ModelSelection, or Dashboard
 */
function AppContent() {
  const { user, profile, loading, updateProfile, logout } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingContent}>
          <span style={styles.logo}>SnapKO</span>
          <p style={styles.loadingText}>Đang tải...</p>
        </div>
      </div>
    );
  }

  // Not authenticated → Login
  if (!user) {
    return <LoginPage />;
  }

  // Authenticated but no business (first-time OWNER) → Profile Setup
  // Note: Staff are invited via code and already have business_id
  if (profile?.role === "OWNER" && !profile?.business_id) {
    return <ProfileSetupPage />;
  }

  // Profile still loading (race condition) - show loading briefly
  if (!profile) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingContent}>
          <span style={styles.logo}>SnapKO</span>
          <p style={styles.loadingText}>Đang tải hồ sơ...</p>
        </div>
      </div>
    );
  }

  if (profile.role === "STAFF") {
    return (
      <div style={styles.loadingContainer}>
        <div style={{ ...styles.loadingContent, maxWidth: 440 }}>
          <span style={styles.logo}>SnapKO Desktop</span>
          <h2 style={{ color: COLORS.textPrimary, marginTop: 24 }}>
            Tài khoản Staff chỉ dùng Mobile
          </h2>
          <p style={styles.loadingText}>
            Desktop dành cho Owner và Manager để quản trị, xem tồn kho và báo cáo.
          </p>
          <button
            onClick={logout}
            style={{
              marginTop: 20,
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              background: COLORS.primary,
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  // Owner has business but NO operational_model → Force Model Selection
  if (
    profile?.role === "OWNER" &&
    profile?.business_id &&
    !profile?.inventory_model
  ) {
    return (
      <ModelSelectionPage
        businessName={profile?.business_name || "Quán của bạn"}
        onSave={async (model) => {
          // Update profile with selected model
          if (updateProfile) {
            try {
              // 1. Update Global Business
              const businessResult = await (window as any).electronAPI?.updateBusiness?.({
                inventory_model: model,
              });
              if (!businessResult?.success) {
                throw new Error(businessResult?.error || "Business update failed");
              }
              // 2. Update Legacy Profile
              const profileResult = await updateProfile({ inventory_model: model });
              if (!profileResult) throw new Error("Profile update failed");
            } catch (e) {
              console.error("Model setup failed", e);
              alert("Không thể lưu mô hình này. Vui lòng kiểm tra gói hiện tại.");
            }
          }
        }}
      />
    );
  }

  // Authenticated with business and model → Dashboard
  return <Dashboard user={user} />;
}

// Minimal styles for loading screen (theme.ts is loaded after)
const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: COLORS.background,
  },
  loadingContent: {
    textAlign: "center",
  },
  logo: {
    fontSize: 32,
    fontWeight: 700,
    color: "#E07A2F",
  },
  loadingText: {
    color: "#94A3B8",
    marginTop: 16,
  },
};

// Mount app with AuthProvider
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </React.StrictMode>
);
