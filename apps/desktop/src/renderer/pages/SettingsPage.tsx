/**
 * SettingsPage - Desktop Settings with Profile, Sync, Staff Management
 * Following .UXUIrules Light Mode palette
 */

import React, { useState } from "react";
import { COLORS } from "../styles/theme";

interface SettingsPageProps {
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  businessName?: string;
  onEditProfile?: () => void;
}

export default function SettingsPage({
  onLogout,
  userName,
  userEmail,
  userRole,
  businessName,
  onEditProfile,
}: SettingsPageProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");

  const isOwner = userRole === "OWNER";

  // Generate invite code for staff
  const handleGenerateInviteCode = async () => {
    setGeneratingCode(true);
    try {
      const result = await (window as any).electronAPI?.generateInviteCode?.();
      if (result?.code) {
        setInviteCode(result.code);
      } else {
        alert(
          "Không thể tạo mã mời: " + (result?.error || "Lỗi không xác định")
        );
      }
    } catch (err) {
      console.error("Generate invite failed:", err);
      alert("Lỗi khi tạo mã mời");
    } finally {
      setGeneratingCode(false);
    }
  };

  // Copy invite code to clipboard
  const copyToClipboard = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      alert("Đã copy mã mời!");
    }
  };

  // Manual sync
  const handleSync = async () => {
    setSyncStatus("syncing");
    try {
      const result = await (window as any).electronAPI?.syncFromServer?.();
      if (result?.success) {
        setSyncStatus("success");
        setTimeout(() => setSyncStatus("idle"), 3000);
      } else {
        setSyncStatus("error");
      }
    } catch {
      setSyncStatus("error");
    }
  };

  // Delete account confirmation
  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      "⚠️ Xóa tài khoản\n\n• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác\n\nBạn có chắc chắn?"
    );
    if (confirmed) {
      // TODO: Call delete account API
      alert("Đã gửi yêu cầu xóa tài khoản. Dữ liệu sẽ bị xóa sau 30 ngày.");
      onLogout();
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>⚙️ Cài đặt</h1>
        <p style={styles.subtitle}>Quản lý tài khoản và đồng bộ dữ liệu</p>
      </div>

      {/* Profile Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>👤 Thông tin tài khoản</span>
          {onEditProfile && (
            <button onClick={onEditProfile} style={styles.editButton}>
              ✏️ Chỉnh sửa
            </button>
          )}
        </div>
        <div style={styles.cardContent}>
          <div style={styles.profileRow}>
            <span style={styles.label}>Tên:</span>
            <span style={styles.value}>{userName || "Chưa cập nhật"}</span>
          </div>
          <div style={styles.profileRow}>
            <span style={styles.label}>Email:</span>
            <span style={styles.value}>{userEmail || "—"}</span>
          </div>
          <div style={styles.profileRow}>
            <span style={styles.label}>Vai trò:</span>
            <span
              style={{
                ...styles.badge,
                backgroundColor: isOwner ? COLORS.positive : COLORS.primary,
              }}
            >
              {isOwner ? "Chủ quán" : "Nhân viên"}
            </span>
          </div>
          {businessName && (
            <div style={styles.profileRow}>
              <span style={styles.label}>Cửa hàng:</span>
              <span style={styles.value}>{businessName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sync Status Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>🔄 Đồng bộ dữ liệu</span>
        </div>
        <div style={styles.cardContent}>
          <p style={styles.hint}>
            Dữ liệu được lưu local và tự đồng bộ khi có mạng. Bấm nút bên dưới
            để đồng bộ thủ công.
          </p>
          <button
            onClick={handleSync}
            disabled={syncStatus === "syncing"}
            style={{
              ...styles.secondaryButton,
              opacity: syncStatus === "syncing" ? 0.6 : 1,
            }}
          >
            {syncStatus === "syncing"
              ? "⌛ Đang đồng bộ..."
              : syncStatus === "success"
              ? "✅ Đã đồng bộ!"
              : syncStatus === "error"
              ? "❌ Lỗi - Thử lại"
              : "🔄 Đồng bộ ngay"}
          </button>
        </div>
      </div>

      {/* Staff Management - Owner Only */}
      {isOwner && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>👥 Quản lý nhân viên</span>
          </div>
          <div style={styles.cardContent}>
            <p style={styles.hint}>
              Tạo mã mời để nhân viên tham gia quản lý kho. Mã có hiệu lực 7
              ngày.
            </p>

            {inviteCode ? (
              <div style={styles.inviteCodeBox}>
                <span style={styles.inviteCode}>{inviteCode}</span>
                <button onClick={copyToClipboard} style={styles.copyButton}>
                  📋 Copy
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateInviteCode}
                disabled={generatingCode}
                style={{
                  ...styles.primaryButton,
                  opacity: generatingCode ? 0.6 : 1,
                }}
              >
                {generatingCode ? "Đang tạo..." : "🎟️ Tạo mã mời"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div style={{ ...styles.card, borderColor: COLORS.error }}>
        <div style={styles.cardHeader}>
          <span style={{ ...styles.cardTitle, color: COLORS.error }}>
            ⚠️ Vùng nguy hiểm
          </span>
        </div>
        <div style={styles.cardContent}>
          <div style={styles.dangerRow}>
            <div>
              <p style={styles.dangerTitle}>Đăng xuất</p>
              <p style={styles.hint}>Dữ liệu local vẫn được giữ lại.</p>
            </div>
            <button onClick={onLogout} style={styles.logoutButton}>
              Đăng xuất
            </button>
          </div>

          <div style={{ ...styles.dangerRow, marginTop: 16 }}>
            <div>
              <p style={styles.dangerTitle}>Xóa tài khoản</p>
              <p style={styles.hint}>
                Tất cả dữ liệu sẽ bị xóa vĩnh viễn sau 30 ngày.
              </p>
            </div>
            <button onClick={handleDeleteAccount} style={styles.deleteButton}>
              Xóa tài khoản
            </button>
          </div>
        </div>
      </div>

      {/* Links */}
      <div style={styles.linksRow}>
        <a
          href="https://snapko.vn/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Chính sách bảo mật
        </a>
        <span style={styles.linkDivider}>•</span>
        <a
          href="https://snapko.vn/terms"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Điều khoản sử dụng
        </a>
        <span style={styles.linkDivider}>•</span>
        <span style={styles.version}>v1.0.0</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 32,
    backgroundColor: COLORS.background,
    minHeight: "100vh",
    maxWidth: 600,
    margin: "0 auto",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.surfaceHover,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
  cardContent: {
    padding: 20,
  },
  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: `1px solid ${COLORS.border}`,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.textPrimary,
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    color: "white",
    padding: "4px 12px",
    borderRadius: 20,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  editButton: {
    background: "none",
    border: "none",
    color: COLORS.primary,
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 500,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    padding: "12px 24px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  secondaryButton: {
    backgroundColor: COLORS.surfaceHover,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    padding: "12px 24px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
  },
  inviteCodeBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surfaceHover,
    padding: 16,
    borderRadius: 8,
    border: `2px dashed ${COLORS.positive}`,
  },
  inviteCode: {
    flex: 1,
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 4,
    color: COLORS.positive,
    fontFamily: "monospace",
  },
  copyButton: {
    backgroundColor: COLORS.positive,
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
  },
  dangerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  logoutButton: {
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    padding: "8px 20px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
  },
  deleteButton: {
    backgroundColor: "transparent",
    color: COLORS.error,
    border: `1px solid ${COLORS.error}`,
    padding: "8px 20px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 500,
  },
  linksRow: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    fontSize: 13,
  },
  link: {
    color: COLORS.textSecondary,
    textDecoration: "none",
  },
  linkDivider: {
    color: COLORS.border,
  },
  version: {
    color: COLORS.textMuted,
  },
};
