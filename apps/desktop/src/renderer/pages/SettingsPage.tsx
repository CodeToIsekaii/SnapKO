/**
 * SettingsPage - Desktop Settings with Profile, Sync, Staff Management
 * Following .UXUIrules Light Mode palette
 */

import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";
import {
  Settings,
  User,
  Store,
  Home,
  Factory,
  Check,
  Timer,
  LogOut,
  Trash2,
  Pencil,
  AlertTriangle,
  Martini,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { SubscriptionInfo } from "../hooks/useSubscriptionStatus";

interface SettingsPageProps {
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  businessName?: string;
  inventoryModel?: string | null; // SIMPLE | STANDARD | CHAIN
  onEditProfile?: () => void;
  onChangeModel?: (model: "SIMPLE" | "STANDARD") => Promise<void>;
  subscription?: SubscriptionInfo;
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
  subscription,
}: SettingsPageProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "error"
  >("idle");
  const [changingModel, setChangingModel] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [exportingHistory, setExportingHistory] = useState(false);

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
      "Xóa tài khoản\n\n• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác\n\nBạn có chắc chắn?"
    );
    if (confirmed) {
      // TODO: Call delete account API
      alert("Đã gửi yêu cầu xóa tài khoản. Dữ liệu sẽ bị xóa sau 30 ngày.");
      onLogout();
    }
  };

  // Export Full Log History to Excel
  const handleExportHistory = async () => {
    setExportingHistory(true);
    try {
      const result = await (
        window as any
      ).electronAPI?.exportInventoryLogsHistory?.();
      if (!result?.success) {
        alert("Lỗi: " + (result?.error || "Không thể tải dữ liệu"));
        return;
      }

      if (!result.data || result.data.length === 0) {
        alert("Không có dữ liệu để export.");
        return;
      }

      // Create Excel from data
      const worksheetData = result.data.map((row: any) => ({
        STT: row.stt,
        "Ngày giờ": row.ngay,
        Loại: row.loai,
        "Nhân viên": row.nhan_vien,
        "Chi tiết": row.chi_tiet,
        "Số lượng": row.so_luong,
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      worksheet["!cols"] = [
        { wch: 5 },
        { wch: 20 },
        { wch: 12 },
        { wch: 15 },
        { wch: 40 },
        { wch: 10 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Lịch sử hoạt động");

      // Trigger download
      const now = new Date();
      const filename = `log_history_${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.xlsx`;
      XLSX.writeFile(workbook, filename);

      alert(`Đã xuất ${result.count} bản ghi thành file ${filename}`);
    } catch (err: any) {
      console.error("Export history failed:", err);
      alert("Lỗi khi export: " + err.message);
    } finally {
      setExportingHistory(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "4px",
          }}
        >
          <Settings size={28} color={COLORS.textPrimary} />
          <h1 style={styles.title}>Cài đặt</h1>
        </div>
        <p style={styles.subtitle}>Quản lý tài khoản và đồng bộ dữ liệu</p>

        {/* Subscription Banner - Only show for relevant states */}
        {subscription?.showExpiredBanner && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              backgroundColor: COLORS.error,
              color: "white",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>⚠️ Gói của bạn đã hết hạn. Nâng cấp để sử dụng Kho Kép.</span>
            <button
              onClick={() => {
                (window as any).electronAPI?.openExternal?.(
                  "https://app.snapko.vn/pricing"
                );
              }}
              style={{
                backgroundColor: "white",
                color: COLORS.error,
                border: "none",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Nâng cấp ngay
            </button>
          </div>
        )}

        {subscription?.showExpiryWarning && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              backgroundColor: "#F59E0B", // Amber/Warning
              color: "white",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              💡 Gói PRO còn {subscription.daysLeft} ngày! Gia hạn ngay để giữ
              tính năng Kho Kép & Báo cáo doanh thu không bị gián đoạn.
            </span>
            <button
              onClick={() => {
                (window as any).electronAPI?.openExternal?.(
                  "https://app.snapko.vn/pricing"
                );
              }}
              style={{
                backgroundColor: "white",
                color: "#F59E0B",
                border: "none",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Gia hạn ngay
            </button>
          </div>
        )}

        {subscription?.showTrialBanner && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              backgroundColor: COLORS.positive,
              color: "white",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              🎉 Bản dùng thử miễn phí: còn {subscription.daysLeft} ngày
            </span>
            <button
              onClick={() => {
                (window as any).electronAPI?.openExternal?.(
                  "https://app.snapko.vn/pricing"
                );
              }}
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Xem gói Pro
            </button>
          </div>
        )}

        {/* PRO_ACTIVE: No banner shown - user has active subscription */}
      </div>

      {/* Profile Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <User size={18} color={COLORS.textPrimary} />
            <span style={styles.cardTitle}>Thông tin tài khoản</span>
          </div>
          {onEditProfile && (
            <button
              onClick={onEditProfile}
              style={{
                ...styles.editButton,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Pencil size={14} />
              Chỉnh sửa
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Store size={18} color={COLORS.textPrimary} />
              <span style={styles.cardTitle}>Mô hình kho</span>
            </div>
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
                <span style={styles.modelIcon}>
                  <Home size={28} />
                </span>
                <span style={styles.modelName}>KHO ĐƠN</span>
                <span style={styles.modelDesc}>1 kho duy nhất</span>
                {inventoryModel === "SIMPLE" && (
                  <span style={styles.modelCheck}>
                    <Check size={12} color="white" />
                  </span>
                )}
              </button>

              <button
                disabled={
                  changingModel ||
                  (!subscription?.canUseDualWarehouse &&
                    inventoryModel !== "STANDARD")
                }
                style={{
                  ...styles.modelButton,
                  ...(inventoryModel === "STANDARD"
                    ? styles.modelButtonActive
                    : {}),
                  opacity:
                    !subscription?.canUseDualWarehouse &&
                    inventoryModel !== "STANDARD"
                      ? 0.5
                      : 1,
                  cursor:
                    !subscription?.canUseDualWarehouse &&
                    inventoryModel !== "STANDARD"
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={async () => {
                  if (inventoryModel !== "STANDARD") {
                    setChangingModel(true);
                    await onChangeModel("STANDARD");
                    setChangingModel(false);
                  }
                }}
              >
                <span style={styles.modelIcon}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Factory size={20} />
                    <span>→</span>
                    <Martini size={20} />
                  </div>
                </span>
                <span style={styles.modelName}>KHO KÉP</span>
                <span style={styles.modelDesc}>Kho Tổng + Quầy Bar</span>
                {inventoryModel === "STANDARD" && (
                  <span style={styles.modelCheck}>
                    <Check size={12} color="white" />
                  </span>
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
            <div style={styles.cardHeader}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Timer size={18} color={COLORS.textPrimary} />
                <span style={styles.cardTitle}>
                  Cấu hình lưu trữ (Thiết bị này)
                </span>
              </div>
            </div>
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

            {/* Export Full History Button */}
            <div
              style={{
                marginTop: 16,
                borderTop: `1px solid ${COLORS.border}`,
                paddingTop: 16,
              }}
            >
              <p style={{ ...styles.hint, marginBottom: 12 }}>
                Xuất toàn bộ lịch sử hoạt động từ Cloud (không bị giới hạn bởi
                cấu hình lưu trữ).
              </p>
              <button
                onClick={handleExportHistory}
                disabled={exportingHistory}
                style={{
                  ...styles.secondaryButton,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "auto",
                  padding: "10px 20px",
                }}
              >
                <Download size={16} />
                {exportingHistory
                  ? "Đang tải..."
                  : "Xuất toàn bộ lịch sử (Excel)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div style={{ ...styles.card, borderColor: COLORS.error }}>
        <div style={styles.cardHeader}>
          <div style={styles.cardHeader}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: COLORS.error,
              }}
            >
              <AlertTriangle size={18} />
              <span style={{ ...styles.cardTitle, color: COLORS.error }}>
                Vùng nguy hiểm
              </span>
            </div>
          </div>
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
