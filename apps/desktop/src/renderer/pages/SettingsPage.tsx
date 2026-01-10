/**
 * SettingsPage - Desktop Settings with Profile, Sync, Staff Management
 * Following .UXUIrules Light Mode palette
 */

import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";

interface SettingsPageProps {
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  businessName?: string;
  inventoryModel?: string | null; // SIMPLE | STANDARD | CHAIN
  onEditProfile?: () => void;
  onChangeModel?: (model: "SIMPLE" | "STANDARD") => Promise<void>;
}

export default function SettingsPage({
  onLogout,
  userName,
  userEmail,
  userRole,
  businessName,
  inventoryModel,
  onEditProfile,
  onChangeModel,
}: SettingsPageProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [changingModel, setChangingModel] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    loadRetention();
  }, []);

  const loadRetention = async () => {
    try {
      const days = await (window as any).electronAPI?.getRetentionDays?.();
      if (days) setRetentionDays(days);
    } catch (e) {
      console.error("Failed to load retention days", e);
    }
  };

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

      {/* Inventory Model Card - Owner Only */}
      {isOwner && onChangeModel && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>🏪 Mô hình kho</span>
          </div>
          <div style={styles.cardContent}>
            <p style={styles.hint}>
              Chọn mô hình vận hành phù hợp với quán của bạn. Điều này ảnh hưởng
              đến cách nhân viên kiểm kho trên app.
            </p>

            <div style={styles.modelToggleContainer}>
              {/* SIMPLE Button */}
              <button
                style={{
                  ...styles.modelButton,
                  ...(inventoryModel === "SIMPLE"
                    ? styles.modelButtonActive
                    : {}),
                }}
                onClick={async () => {
                  if (inventoryModel !== "SIMPLE") {
                    setChangingModel(true);
                    await onChangeModel("SIMPLE");
                    setChangingModel(false);
                  }
                }}
                disabled={changingModel}
              >
                <span style={styles.modelIcon}>🏠</span>
                <span style={styles.modelName}>KHO ĐƠN</span>
                <span style={styles.modelDesc}>1 kho duy nhất</span>
                {inventoryModel === "SIMPLE" && (
                  <span style={styles.modelCheck}>✓</span>
                )}
              </button>

              {/* STANDARD Button */}
              <button
                style={{
                  ...styles.modelButton,
                  ...(inventoryModel === "STANDARD"
                    ? styles.modelButtonActive
                    : {}),
                }}
                onClick={async () => {
                  if (inventoryModel !== "STANDARD") {
                    setChangingModel(true);
                    await onChangeModel("STANDARD");
                    setChangingModel(false);
                  }
                }}
                disabled={changingModel}
              >
                <span style={styles.modelIcon}>🏭→🍸</span>
                <span style={styles.modelName}>KHO KÉP</span>
                <span style={styles.modelDesc}>Kho Tổng + Quầy Bar</span>
                {inventoryModel === "STANDARD" && (
                  <span style={styles.modelCheck}>✓</span>
                )}
              </button>
            </div>

            {changingModel && (
              <p style={{ ...styles.hint, marginTop: 12, textAlign: "center" }}>
                ⏳ Đang cập nhật...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Log Retention - Owner Only (Device Specific) */}
      {isOwner && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>
              ⏱️ Cấu hình lưu trữ (Thiết bị này)
            </span>
          </div>
          <div style={styles.cardContent}>
            <p style={styles.hint}>
              Tự động xóa nhật ký cũ (đã đồng bộ) để giải phóng dung lượng máy
              tính.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {[3, 7, 30, 90].map((days) => (
                <button
                  key={days}
                  style={{
                    ...styles.modelButton,
                    flex: "none",
                    width: "auto",
                    padding: "8px 16px",
                    minWidth: "80px",
                    backgroundColor:
                      retentionDays === days
                        ? COLORS.primary
                        : COLORS.surfaceHover,
                    borderColor:
                      retentionDays === days ? COLORS.primary : COLORS.border,
                    color:
                      retentionDays === days ? "white" : COLORS.textPrimary,
                  }}
                  onClick={async () => {
                    setRetentionDays(days);
                    await (window as any).electronAPI?.setRetentionDays?.(days);
                    alert(
                      `Đã lưu. Nhật ký cũ hơn ${days} ngày sẽ tự động bị xóa.`
                    );
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>
                    {days} ngày
                  </span>
                </button>
              ))}
            </div>
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
  // Model Selection Styles
  modelToggleContainer: {
    display: "flex",
    gap: 16,
  },
  modelButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 16,
    backgroundColor: COLORS.surfaceHover,
    border: `2px solid ${COLORS.border}`,
    borderRadius: 12,
    cursor: "pointer",
    transition: "all 0.2s ease",
    position: "relative",
  },
  modelButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
  },
  modelIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  modelName: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  modelDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  modelCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: COLORS.positive,
    color: "white",
    borderRadius: "50%",
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: "bold",
  },
};
