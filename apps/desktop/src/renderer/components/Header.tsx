// src/components/Header.tsx - Dashboard Header Component
// SOLID: Presentational component - only handles UI display

import React from "react";
import { User, SyncStatus } from "../types";
import { COLORS } from "../styles/theme";
import { RefreshCw, LogOut } from "lucide-react";

interface HeaderProps {
  user: User;
  businessId?: string;
  syncStatus: SyncStatus;
  onSync: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  businessId,
  syncStatus,
  onSync,
  onLogout,
}: HeaderProps) {
  return (
    <header style={styles.header}>
      {/* Left: Logo */}
      <div style={styles.logoSection}>
        <span style={styles.logo}>SnapKO</span>
        <span style={styles.tagline}>Desktop</span>
      </div>

      {/* Center: Sync Status */}
      <div style={styles.syncSection}>
        <button
          onClick={onSync}
          disabled={syncStatus.syncing}
          style={{
            ...styles.syncButton,
            opacity: syncStatus.syncing ? 0.7 : 1,
          }}
        >
          <RefreshCw
            size={16}
            style={{
              marginRight: 6,
              animation: syncStatus.syncing
                ? "spin 1s linear infinite"
                : "none",
            }}
          />
          {syncStatus.syncing ? "Đang đồng bộ..." : "Đồng bộ"}
        </button>
        {syncStatus.pending > 0 && (
          <span style={styles.pendingBadge}>{syncStatus.pending} chờ</span>
        )}
        {syncStatus.lastSync && (
          <span style={styles.lastSync}>
            Lần cuối:{" "}
            {new Date(syncStatus.lastSync).toLocaleTimeString("vi-VN")}
          </span>
        )}
        {syncStatus.lastError && (
          <span style={styles.syncError} title={syncStatus.lastError}>
            Lỗi đồng bộ
          </span>
        )}
      </div>

      {/* Right: User Info */}
      <div style={styles.userSection}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <span style={styles.userEmail}>{user.email}</span>
          {/* Debug: Show Business ID */}
          <span
            style={{
              fontSize: 10,
              color: COLORS.textMuted,
              fontFamily: "monospace",
            }}
          >
            ID: {businessId?.substring(0, 8) || "Loading..."}
          </span>
        </div>
        <button onClick={onLogout} style={styles.logoutButton}>
          <LogOut size={14} style={{ marginRight: 6 }} />
          Đăng xuất
        </button>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    backgroundColor: COLORS.surface,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  logoSection: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.primary,
  },
  tagline: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  syncSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  syncButton: {
    display: "flex",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  pendingBadge: {
    padding: "4px 10px",
    backgroundColor: COLORS.warning,
    color: "#000",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
  },
  lastSync: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  syncError: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: 600,
  },
  userSection: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  userEmail: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  logoutButton: {
    display: "flex",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
};
