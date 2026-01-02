/**
 * ProfileEditPage - Owner Profile Edit Screen
 * Edit: Owner name, Business name, Contact info
 * Following .UXUIrules Light Mode palette
 */

import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";

interface ProfileEditPageProps {
  onBack: () => void;
  onSave: () => void;
  initialData?: {
    fullName?: string;
    businessName?: string;
    phoneNumber?: string;
  };
}

export default function ProfileEditPage({
  onBack,
  onSave,
  initialData,
}: ProfileEditPageProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    phoneNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    if (initialData) {
      setFormData({
        fullName: initialData.fullName || "",
        businessName: initialData.businessName || "",
        phoneNumber: initialData.phoneNumber || "",
      });
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!formData.fullName.trim()) {
      setError("Tên không được để trống");
      return;
    }
    if (!formData.businessName.trim()) {
      setError("Tên cửa hàng không được để trống");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Update profile via IPC (use snake_case for DB columns)
      const result = await (window as any).electronAPI?.updateProfile?.({
        full_name: formData.fullName.trim(),
        phone_number: formData.phoneNumber.trim() || null,
      });

      // Update business name via IPC
      await (window as any).electronAPI?.updateBusiness?.({
        name: formData.businessName.trim(),
      });

      if (result?.success !== false) {
        onSave();
      } else {
        setError(result?.error || "Không thể cập nhật thông tin");
      }
    } catch (err: any) {
      console.error("Profile update failed:", err);
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ← Quay lại
        </button>
        <h1 style={styles.title}>Chỉnh sửa hồ sơ</h1>
        <div style={{ width: 80 }} />
      </div>

      {/* Form */}
      <div style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Họ và tên *</label>
          <input
            value={formData.fullName}
            onChange={(e) =>
              setFormData({ ...formData, fullName: e.target.value })
            }
            placeholder="Nguyễn Văn A"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Tên cửa hàng *</label>
          <input
            value={formData.businessName}
            onChange={(e) =>
              setFormData({ ...formData, businessName: e.target.value })
            }
            placeholder="Cà phê Mê Linh"
            style={styles.input}
          />
          <span style={styles.hint}>
            Tên này sẽ hiển thị cho nhân viên khi tham gia
          </span>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Số điện thoại</label>
          <input
            value={formData.phoneNumber}
            onChange={(e) =>
              setFormData({ ...formData, phoneNumber: e.target.value })
            }
            placeholder="0901234567"
            style={styles.input}
          />
          <span style={styles.hint}>Số liên hệ khi nhân viên cần hỗ trợ</span>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.buttonRow}>
          <button onClick={onBack} style={styles.cancelButton}>
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.saveButton,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Đang lưu..." : "💾 Lưu thay đổi"}
          </button>
        </div>
      </div>

      {/* Info Note */}
      <p style={styles.note}>
        Thông tin này được lưu trên Cloud và tự động đồng bộ với tất cả thiết
        bị.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 32,
    backgroundColor: COLORS.background,
    minHeight: "100vh",
    maxWidth: 500,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    background: "none",
    border: "none",
    color: COLORS.textSecondary,
    fontSize: 14,
    cursor: "pointer",
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    padding: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    fontSize: 14,
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.background,
    color: COLORS.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  },
  hint: {
    display: "block",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  error: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 16,
    padding: "8px 12px",
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    padding: "12px 20px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  saveButton: {
    flex: 2,
    padding: "12px 20px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  note: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 24,
  },
};
