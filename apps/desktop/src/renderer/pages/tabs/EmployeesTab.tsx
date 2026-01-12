// src/pages/tabs/EmployeesTab.tsx - Employees Management Tab
// SOLID: Presentational component - receives data via props

import React, { useState, useEffect } from "react";
import { StaffProfile } from "../../types";
import { COLORS } from "../../styles/theme";
import {
  Users,
  Plus,
  Loader2,
  Ticket,
  Clock,
  ClipboardCopy,
  Smartphone,
  Check,
  X,
  Ban,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface EmployeesTabProps {
  pendingStaff: StaffProfile[];
  activeStaff: StaffProfile[];
  loading: boolean;
  generating: boolean;
  onLoadStaff: () => Promise<void>;
  onGenerateCode: () => Promise<{
    code: string;
    expiresAt: string;
    error?: string;
  } | null>;
  onStaffAction: (
    profileId: string,
    action: "approve" | "reject" | "deactivate"
  ) => Promise<boolean>;
}

export function EmployeesTab({
  pendingStaff,
  activeStaff,
  loading,
  generating,
  onLoadStaff,
  onGenerateCode,
  onStaffAction,
}: EmployeesTabProps) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    onLoadStaff();
  }, []);

  const handleGenerateCode = async () => {
    const result = await onGenerateCode();
    if (result?.error) {
      setToast({ message: result.error, type: "error" });
      setTimeout(() => setToast(null), 3000);
    } else if (result?.code) {
      setInviteCode(result.code);
    }
  };

  const handleAction = async (
    profileId: string,
    action: "approve" | "reject" | "deactivate"
  ) => {
    await onStaffAction(profileId, action);
  };

  const handleCopyCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setToast({ message: "Đã sao chép mã!", type: "success" });
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            padding: "12px 20px",
            borderRadius: 8,
            backgroundColor: toast.type === "success" ? "#6B8E23" : "#EF4444",
            color: "white",
            fontWeight: 600,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {toast.type === "success" ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {toast.message}
        </div>
      )}

      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Users size={24} color={COLORS.textPrimary} />
          <h2 style={styles.title}>Quản lý nhân viên</h2>
        </div>
        <button
          onClick={handleGenerateCode}
          disabled={generating}
          style={{
            ...styles.generateButton,
            opacity: generating ? 0.7 : 1,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Đang tạo...
            </>
          ) : (
            <>
              <Plus size={16} />
              Tạo mã mời
            </>
          )}
        </button>
      </div>

      {/* Invite Code Modal */}
      {inviteCode && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              <Ticket size={24} color={COLORS.primary} />
              <h3 style={styles.modalTitle}>Mã mời nhân viên</h3>
            </div>
            <div style={styles.codeBox}>
              <span style={styles.code}>{inviteCode}</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                color: COLORS.textSecondary,
                marginBottom: "24px",
              }}
            >
              <Clock size={16} />
              <p style={styles.expiryNote}>Mã này sẽ hết hạn sau 48 giờ</p>
            </div>
            <div style={styles.modalActions}>
              <button
                onClick={handleCopyCode}
                style={{
                  ...styles.copyButton,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <ClipboardCopy size={16} />
                Copy mã
              </button>
              <button
                onClick={() => setInviteCode(null)}
                style={styles.closeButton}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Staff Section */}
      {pendingStaff.length > 0 && (
        <div style={styles.section}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <Loader2 size={16} color={COLORS.warning} />
            <h3 style={styles.sectionTitle}>
              Đang chờ duyệt ({pendingStaff.length})
            </h3>
          </div>
          <div style={styles.pendingList}>
            {pendingStaff.map((staff) => (
              <div key={staff.id} style={styles.pendingCard}>
                <div>
                  <p style={styles.staffName}>{staff.full_name}</p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      color: COLORS.textSecondary,
                      marginTop: "4px",
                    }}
                  >
                    <Smartphone size={14} />
                    <p style={styles.staffPhone}>{staff.phone_number}</p>
                  </div>
                </div>
                <div style={styles.actions}>
                  <button
                    onClick={() => handleAction(staff.id, "approve")}
                    style={{
                      ...styles.approveButton,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Check size={14} />
                    Duyệt
                  </button>
                  <button
                    onClick={() => handleAction(staff.id, "reject")}
                    style={{
                      ...styles.rejectButton,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <X size={14} />
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Staff Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitleMuted}>
          Nhân viên đang hoạt động ({activeStaff.length})
        </h3>
        <div style={styles.staffTable}>
          <div style={styles.tableHeader}>
            <span>Họ tên</span>
            <span>SĐT</span>
            <span>Trạng thái</span>
            <span style={{ textAlign: "right" }}>Thao tác</span>
          </div>
          {loading ? (
            <div style={styles.loading}>Đang tải...</div>
          ) : activeStaff.length === 0 ? (
            <div style={styles.empty}>Chưa có nhân viên nào</div>
          ) : (
            activeStaff.map((staff) => (
              <div key={staff.id} style={styles.tableRow}>
                <span style={styles.staffNameCell}>{staff.full_name}</span>
                <span style={styles.staffPhoneCell}>{staff.phone_number}</span>
                <span>
                  <span style={styles.statusBadge}>ACTIVE</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <button
                    onClick={() => handleAction(staff.id, "deactivate")}
                    style={{
                      ...styles.deactivateButton,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Ban size={12} />
                    Vô hiệu hóa
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: COLORS.textPrimary,
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
  },
  generateButton: {
    padding: "10px 20px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: COLORS.warning,
    fontSize: 14,
    marginBottom: 12,
  },
  sectionTitleMuted: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 12,
  },
  pendingList: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.warning}`,
    overflow: "hidden",
  },
  pendingCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  staffName: {
    color: COLORS.textPrimary,
    fontWeight: 500,
    margin: 0,
  },
  staffPhone: {
    color: COLORS.textSecondary,
    fontSize: 13,
    margin: "4px 0 0",
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  approveButton: {
    padding: "8px 16px",
    backgroundColor: COLORS.positive,
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
  rejectButton: {
    padding: "8px 16px",
    backgroundColor: COLORS.error,
    color: "white",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
  staffTable: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    padding: "12px 16px",
    backgroundColor: COLORS.background,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 600,
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    padding: "12px 16px",
    alignItems: "center",
    borderBottom: `1px solid ${COLORS.border}`,
  },
  staffNameCell: {
    color: COLORS.textPrimary,
    fontWeight: 500,
  },
  staffPhoneCell: {
    color: COLORS.textSecondary,
  },
  statusBadge: {
    backgroundColor: "rgba(107, 142, 35, 0.2)",
    color: COLORS.positive,
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
  },
  deactivateButton: {
    padding: "6px 12px",
    backgroundColor: "transparent",
    color: COLORS.error,
    border: `1px solid ${COLORS.error}`,
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  loading: {
    padding: 32,
    textAlign: "center",
    color: COLORS.textSecondary,
  },
  empty: {
    padding: 32,
    textAlign: "center",
    color: COLORS.textSecondary,
  },
  // Modal styles
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 32,
    textAlign: "center",
    maxWidth: 400,
    border: `1px solid ${COLORS.border}`,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    marginTop: 0,
    marginBottom: 16,
  },
  codeBox: {
    backgroundColor: COLORS.background,
    padding: "24px 32px",
    borderRadius: 12,
    marginBottom: 16,
  },
  code: {
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 8,
    color: COLORS.primary,
    fontFamily: "monospace",
  },
  expiryNote: {
    color: COLORS.textSecondary,
    fontSize: 14,
    margin: 0,
  },
  modalActions: {
    display: "flex",
    gap: 12,
    marginTop: 24,
  },
  copyButton: {
    flex: 1,
    padding: "12px 24px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  closeButton: {
    padding: "12px 24px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
};
