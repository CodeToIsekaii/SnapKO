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
  const { user, profile, loading, updateProfile } = useAuth();

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
            await updateProfile({ inventory_model: model });
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
