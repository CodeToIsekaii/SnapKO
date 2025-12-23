// src/main.tsx - Entry Point (SOLID: Single Responsibility)
// This file ONLY handles: App mounting + Top-level routing
// All logic delegated to hooks, all UI delegated to pages/components

import React from "react";
import ReactDOM from "react-dom/client";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import "./index.css";

/**
 * App Root Component
 * Only handles: Check auth state → render LoginPage or Dashboard
 */
function App() {
  const { user, loading } = useAuth();

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

  // Authenticated → Dashboard
  return <Dashboard user={user} />;
}

// Minimal styles for loading screen (theme.ts is loaded after)
const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#0F172A",
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

// Mount app
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
