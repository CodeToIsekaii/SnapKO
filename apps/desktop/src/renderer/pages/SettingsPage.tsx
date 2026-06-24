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
  Trash2,
  Pencil,
  AlertTriangle,
  Martini,
  Download,
  Archive,
  Plus,
  Eye,
  EyeOff,
  X,
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
  storedInventoryModel?: string | null;
  tier?: string | null; // FREE | PRO | CHAIN
  effectiveTier?: string | null;
  entitlements?: {
    canUseDualWarehouse: boolean;
    canUseCustomStorageAreas: boolean;
    canInviteStaff: boolean;
    canUseCloudSync: boolean;
    canUseFraudProtection: boolean;
    canUseAdvancedReports: boolean;
  } | null;
  onEditProfile?: () => void;
  onChangeModel?: (model: "SIMPLE" | "STANDARD" | "CHAIN") => Promise<void>;
  subscription?: SubscriptionInfo;
}

export default function SettingsPage({
  onLogout,
  userName,
  userEmail,
  userRole,
  businessName,
  inventoryModel,
  storedInventoryModel,
  tier,
  effectiveTier,
  entitlements,
  onEditProfile,
  onChangeModel,
  subscription,
}: SettingsPageProps) {
  const [changingModel, setChangingModel] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [exportingHistory, setExportingHistory] = useState(false);
  const [shareRecipes, setShareRecipes] = useState(false);
  const [savingShareRecipes, setSavingShareRecipes] = useState(false);

  // Storage Areas state
  const [areas, setAreas] = useState<any[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [areaModal, setAreaModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [areaNameInput, setAreaNameInput] = useState("");
  const [areaSaving, setAreaSaving] = useState(false);

  const displayedModel = inventoryModel || "SIMPLE";
  const storedModel = storedInventoryModel || displayedModel;
  const planTier = effectiveTier || tier || "FREE";
  const isChain = planTier === "CHAIN";
  const isPro = planTier === "PRO";
  const canUseDualWarehouse =
    entitlements?.canUseDualWarehouse ??
    (subscription?.canUseDualWarehouse ?? false);
  const canUseCustomStorageAreas =
    entitlements?.canUseCustomStorageAreas ?? false;
  const storedModelLocked =
    storedModel !== displayedModel &&
    (storedModel === "STANDARD" || storedModel === "CHAIN");

  const openPricing = async () => {
    try {
      const result = await (window as any).electronAPI?.openExternal?.(
        "https://app.snapko.vn/pricing",
      );
      if (!result?.success) {
        throw new Error(result?.error || "Không thể mở trình duyệt");
      }
    } catch (err) {
      alert(
        "Không thể mở trang nâng cấp. Vui lòng truy cập https://app.snapko.vn/pricing",
      );
      console.error("[Settings] openPricing failed:", err);
    }
  };

  useEffect(() => {
    loadRetention();
    loadBusinessSettings();
    if (isOwner) loadStorageAreas();
  }, []);

  const loadStorageAreas = async () => {
    setAreasLoading(true);
    try {
      const data = await (window as any).electronAPI?.listStorageAreas?.();
      setAreas(data ?? []);
    } catch (e) {
      console.error("Failed to load storage areas", e);
    } finally {
      setAreasLoading(false);
    }
  };

  const openCreateArea = () => {
    setAreaNameInput("");
    setAreaModal({ open: true, editing: null });
  };

  const openEditArea = (area: any) => {
    setAreaNameInput(area.name);
    setAreaModal({ open: true, editing: area });
  };

  const handleSaveArea = async () => {
    if (!areaNameInput.trim()) return;
    setAreaSaving(true);
    try {
      if (areaModal.editing) {
        await (window as any).electronAPI?.updateStorageArea?.(areaModal.editing.id, { name: areaNameInput.trim() });
      } else {
        await (window as any).electronAPI?.createStorageArea?.({ name: areaNameInput.trim(), type: "STORAGE" });
      }
      setAreaModal({ open: false, editing: null });
      loadStorageAreas();
    } catch (e: any) {
      alert("Lỗi: " + (e?.message ?? "Không thể lưu"));
    } finally {
      setAreaSaving(false);
    }
  };

  const handleToggleAreaActive = async (area: any) => {
    try {
      await (window as any).electronAPI?.updateStorageArea?.(area.id, { isActive: !area.isActive });
      loadStorageAreas();
    } catch (e: any) {
      alert("Lỗi: " + (e?.message ?? "Không thể cập nhật"));
    }
  };

  const handleDeleteArea = async (area: any) => {
    const confirmed = await (window as any).electronAPI?.confirmDialog?.(
      `Xóa khu vực kho "${area.name}"?`,
      "Khu vực kho phải không còn tồn kho."
    );
    if (!confirmed) return;
    try {
      await (window as any).electronAPI?.deleteStorageArea?.(area.id);
      loadStorageAreas();
    } catch (e: any) {
      alert("Không thể xóa: " + (e?.message ?? "Lỗi không xác định"));
    }
  };

  const loadRetention = async () => {
    try {
      const days = await (window as any).electronAPI?.getRetentionDays?.();
      if (days) setRetentionDays(days);
    } catch (e) {
      console.error("Failed to load retention days", e);
    }
  };

  const isOwner = userRole === "OWNER";

  const loadBusinessSettings = async () => {
    try {
      const res = await (window as any).electronAPI?.getProfile?.();
      if (res?.profile?.business?.shareRecipesWithStaff !== undefined) {
        setShareRecipes(res.profile.business.shareRecipesWithStaff);
      }
    } catch (e) {
      console.error("Failed to load business settings", e);
    }
  };

  const handleToggleShareRecipes = async (checked: boolean) => {
    setSavingShareRecipes(true);
    try {
      await (window as any).electronAPI?.updateBusiness?.({ shareRecipesWithStaff: checked });
      setShareRecipes(checked);
    } catch (e) {
      console.error("Failed to update shareRecipesWithStaff", e);
    } finally {
      setSavingShareRecipes(false);
    }
  };

  // Delete account confirmation
  const handleDeleteAccount = async () => {
    const confirmed = await (window as any).electronAPI?.confirmDialog?.(
      "Xóa tài khoản?",
      "• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác"
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
            <span>⚠️ Gói đã hết hạn. Tính năng Pro/Chain đang tạm khóa.</span>
            <button
              onClick={openPricing}
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
              onClick={openPricing}
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
              onClick={openPricing}
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
            {storedModelLocked && (
              <p
                style={{
                  ...styles.hint,
                  color: COLORS.error,
                  fontWeight: 600,
                }}
              >
                Gói hết hạn, mô hình đã lưu là {storedModel} nhưng hiện đang chạy
                BASIC/Kho Đơn theo quyền hiệu lực.
              </p>
            )}

            <div style={styles.modelToggleContainer}>
              {([
                {
                  id: "SIMPLE" as const,
                  name: "BASIC / KHO ĐƠN",
                  desc: "1 kho duy nhất",
                  locked: false,
                  icon: <Home size={28} />,
                },
                {
                  id: "STANDARD" as const,
                  name: "PRO / KHO KÉP",
                  desc: "Kho Tổng + Quầy Bar",
                  locked: !canUseDualWarehouse,
                  icon: (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Factory size={20} />
                      <span>→</span>
                      <Martini size={20} />
                    </span>
                  ),
                },
                {
                  id: "CHAIN" as const,
                  name: "CHAIN / NHIỀU KHU",
                  desc: "Nhiều khu vực tùy chỉnh",
                  locked: !canUseCustomStorageAreas,
                  icon: <Store size={28} />,
                },
              ]).map((option) => {
                const active = displayedModel === option.id;
                const locked = option.locked && !active;
                return (
                  <button
                    key={option.id}
                    disabled={changingModel}
                    style={{
                      ...styles.modelButton,
                      ...(active ? styles.modelButtonActive : {}),
                      ...(locked ? styles.modelButtonLocked : {}),
                    }}
                    onClick={async () => {
                      if (locked) {
                        alert("Tính năng này cần gói phù hợp còn hiệu lực.");
                        openPricing();
                        return;
                      }
                      if (displayedModel !== option.id) {
                        setChangingModel(true);
                        await onChangeModel(option.id);
                        setChangingModel(false);
                      }
                    }}
                  >
                    <span style={styles.modelIcon}>{option.icon}</span>
                    <span style={styles.modelName}>{option.name}</span>
                    <span style={styles.modelDesc}>{option.desc}</span>
                    {locked && (
                      <span style={styles.modelLock}>
                        <AlertTriangle size={12} />
                        Khóa
                      </span>
                    )}
                    {active && (
                      <span style={styles.modelCheck}>
                        <Check size={12} color="white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {changingModel && (
              <p style={{ ...styles.hint, marginTop: 12, textAlign: "center" }}>
                ⏳ Đang cập nhật...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Share Recipes with Staff - Owner Only */}
      {isOwner && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Settings size={18} color={COLORS.textPrimary} />
              <span style={styles.cardTitle}>Chia sẻ công thức bán thành phẩm</span>
            </div>
          </div>
          <div style={styles.cardContent}>
            <p style={styles.hint}>
              Cho phép nhân viên xem công thức (nguyên liệu con) của bán thành phẩm. Nếu tắt, nhân viên chỉ thấy tên sản phẩm.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={shareRecipes}
                  disabled={savingShareRecipes}
                  onChange={(e) => handleToggleShareRecipes(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: COLORS.textPrimary }}>
                  {shareRecipes ? "Đang bật — nhân viên thấy công thức" : "Đang tắt — nhân viên không thấy công thức"}
                </span>
              </label>
              {savingShareRecipes && <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Đang lưu...</span>}
            </div>
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
              Cấu hình số ngày hiển thị nhật ký trên Dashboard (và dọn log cục bộ
              đã đồng bộ để giải phóng dung lượng máy tính).
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {[3, 7, 30, 90, 365].map((days) => (
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

      {/* Storage Areas - Owner Only */}
      {isOwner && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Archive size={18} color={COLORS.textPrimary} />
              <span style={styles.cardTitle}>Khu vực kho</span>
            </div>
            {isChain && (
              <button onClick={openCreateArea} style={{ ...styles.editButton, display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={14} />
                Thêm
              </button>
            )}
          </div>
          <div style={styles.cardContent}>
            {!isChain && (
              <p style={{ ...styles.hint, marginBottom: 12 }}>
                {isPro
                  ? "Gói PRO có 2 khu vực cố định. Nâng lên CHAIN để thêm khu vực."
                  : "Gói FREE có 1 kho tổng."}
              </p>
            )}
            {areasLoading ? (
              <p style={styles.hint}>Đang tải...</p>
            ) : areas.length === 0 ? (
              <p style={styles.hint}>Chưa có khu vực kho nào.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {areas.map((area) => (
                  <div
                    key={area.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      backgroundColor: area.isActive ? COLORS.surfaceHover : "#F9FAFB",
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                      opacity: area.isActive ? 1 : 0.6,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
                        {area.name}
                        {area.isDefault ? "  ✦" : ""}
                      </span>
                      <span style={{ fontSize: 12, color: COLORS.textSecondary, marginLeft: 8 }}>
                        {area.type === "STORAGE" ? "Kho" : "Quầy phục vụ"}
                        {area._count?.stockLevels ? `  ·  ${area._count.stockLevels} NL` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(isChain || isPro) && (
                        <button onClick={() => openEditArea(area)} style={styles.iconBtn} title="Đổi tên">
                          <Pencil size={14} color={COLORS.textSecondary} />
                        </button>
                      )}
                      {isChain && !area.isDefault && (
                        <>
                          <button onClick={() => handleToggleAreaActive(area)} style={styles.iconBtn} title={area.isActive ? "Ẩn" : "Hiện"}>
                            {area.isActive ? <EyeOff size={14} color={COLORS.textSecondary} /> : <Eye size={14} color={COLORS.textSecondary} />}
                          </button>
                          <button onClick={() => handleDeleteArea(area)} style={styles.iconBtn} title="Xóa">
                            <Trash2 size={14} color={COLORS.error} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Area Modal */}
      {areaModal.open && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
                {areaModal.editing ? "Đổi tên khu vực" : "Thêm khu vực kho"}
              </span>
              <button onClick={() => setAreaModal({ open: false, editing: null })} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color={COLORS.textSecondary} />
              </button>
            </div>
            <input
              style={styles.textInput}
              value={areaNameInput}
              onChange={(e) => setAreaNameInput(e.target.value)}
              placeholder="Tên khu vực (VD: Kho lạnh, Bar 2...)"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveArea(); }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setAreaModal({ open: false, editing: null })} style={{ ...styles.secondaryButton, flex: 1 }}>
                Hủy
              </button>
              <button onClick={handleSaveArea} disabled={areaSaving} style={{ ...styles.primaryButton, flex: 1, opacity: areaSaving ? 0.6 : 1 }}>
                {areaSaving ? "Đang lưu..." : "Lưu"}
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
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 6,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    width: 360,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  },
  textInput: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    fontSize: 14,
    color: "#1F2937",
    outline: "none",
    boxSizing: "border-box" as const,
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
  modelButtonLocked: {
    opacity: 0.5,
    cursor: "not-allowed",
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
  modelLock: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.error,
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
