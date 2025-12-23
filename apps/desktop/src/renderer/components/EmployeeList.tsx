/**
 * EmployeeList - Staff Management Component
 * Features: List, Approve/Reject, Deactivate, Create Invite Code
 */

import React, { useState, useEffect, useCallback } from "react";

// SnapKO F&B Color Palette
const COLORS = {
  primary: "#E07A2F",
  positive: "#6B8E23",
  warning: "#FFC857",
  error: "#E63946",
  surface: "#1E293B",
  background: "#0F172A",
  textPrimary: "#F5F3EF",
  textSecondary: "#94A3B8",
  border: "#334155",
};

interface StaffProfile {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  created_at: string;
}

interface EmployeeListProps {
  onRefresh?: () => void;
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: string }) {
  const getStyle = () => {
    switch (status) {
      case "ACTIVE":
        return { bg: "rgba(107, 142, 35, 0.2)", color: COLORS.positive };
      case "PENDING":
        return { bg: "rgba(255, 200, 87, 0.2)", color: COLORS.warning };
      case "INACTIVE":
        return { bg: "rgba(230, 57, 70, 0.2)", color: COLORS.error };
      default:
        return { bg: "rgba(148, 163, 184, 0.2)", color: COLORS.textSecondary };
    }
  };

  const style = getStyle();
  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

/**
 * Invite Code Modal
 */
function InviteCodeModal({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
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
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: COLORS.surface,
          borderRadius: 16,
          padding: 32,
          textAlign: "center",
          maxWidth: 400,
          border: `1px solid ${COLORS.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{ color: COLORS.textPrimary, marginTop: 0, marginBottom: 16 }}
        >
          🎫 Mã mời nhân viên
        </h2>

        <div
          style={{
            backgroundColor: COLORS.background,
            padding: "24px 32px",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: 8,
              color: COLORS.primary,
              fontFamily: "monospace",
            }}
          >
            {code}
          </span>
        </div>

        <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
          ⏰ Mã này sẽ hết hạn sau <strong>48 giờ</strong>
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: "12px 24px",
              backgroundColor: copied ? COLORS.positive : COLORS.primary,
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Đã sao chép!" : "📋 Copy mã"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "12px 24px",
              backgroundColor: "transparent",
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Employee List Component
 */
export function EmployeeList({ onRefresh }: EmployeeListProps) {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Load staff from local DB
  const loadStaff = useCallback(async () => {
    try {
      const profiles = await window.electronAPI.getStaffProfiles?.();
      setStaff(profiles || []);
    } catch (err) {
      console.error("Load staff error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Generate invite code with offline check (per user feedback)
  const handleGenerateCode = async () => {
    // Check internet connection
    if (!navigator.onLine) {
      alert("⚠️ Vui lòng kết nối Internet để tạo mã mời online!");
      return;
    }

    setGenerating(true);
    try {
      const result = await window.electronAPI.generateInviteCode?.();
      if (result?.code) {
        setInviteCode(result.code);
      } else if (result?.error) {
        alert(`❌ Lỗi tạo mã: ${result.error}`);
      }
    } catch (err: any) {
      console.error("Generate code error:", err);
      alert(`❌ Lỗi kết nối Server: ${err.message || "Không xác định"}`);
    } finally {
      setGenerating(false);
    }
  };

  // Approve/Reject staff
  const handleAction = async (
    profileId: string,
    action: "approve" | "reject" | "deactivate"
  ) => {
    try {
      await window.electronAPI.staffAction?.(profileId, action);
      loadStaff(); // Refresh
      onRefresh?.();
    } catch (err) {
      console.error("Staff action error:", err);
    }
  };

  // Separate pending and active
  const pendingStaff = staff.filter((s) => s.status === "PENDING");
  const activeStaff = staff.filter((s) => s.status === "ACTIVE");

  return (
    <div style={{ padding: 0 }}>
      {/* Header with Create Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2 style={{ color: COLORS.textPrimary, margin: 0 }}>
          👥 Quản lý nhân viên
        </h2>
        <button
          onClick={handleGenerateCode}
          disabled={generating}
          style={{
            padding: "10px 20px",
            backgroundColor: COLORS.primary,
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.7 : 1,
          }}
        >
          {generating ? "⏳ Đang tạo..." : "➕ Tạo mã mời"}
        </button>
      </div>

      {/* Pending Section */}
      {pendingStaff.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3
            style={{
              color: COLORS.warning,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            ⏳ Đang chờ duyệt ({pendingStaff.length})
          </h3>
          <div
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              border: `1px solid ${COLORS.warning}`,
              overflow: "hidden",
            }}
          >
            {pendingStaff.map((profile) => (
              <div
                key={profile.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 16,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <div>
                  <p
                    style={{
                      color: COLORS.textPrimary,
                      fontWeight: 500,
                      margin: 0,
                    }}
                  >
                    {profile.full_name}
                  </p>
                  <p
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 13,
                      margin: "4px 0 0",
                    }}
                  >
                    📱 {profile.phone_number}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleAction(profile.id, "approve")}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: COLORS.positive,
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Duyệt
                  </button>
                  <button
                    onClick={() => handleAction(profile.id, "reject")}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: COLORS.error,
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    ✗ Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Staff Table */}
      <div>
        <h3
          style={{
            color: COLORS.textSecondary,
            fontSize: 14,
            marginBottom: 12,
          }}
        >
          Nhân viên đang hoạt động ({activeStaff.length})
        </h3>
        <div
          style={{
            backgroundColor: COLORS.surface,
            borderRadius: 12,
            border: `1px solid ${COLORS.border}`,
            overflow: "hidden",
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "12px 16px",
              backgroundColor: COLORS.background,
              color: COLORS.textSecondary,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>Họ tên</span>
            <span>SĐT</span>
            <span>Trạng thái</span>
            <span style={{ textAlign: "right" }}>Thao tác</span>
          </div>

          {/* Table Body */}
          {loading ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: COLORS.textSecondary,
              }}
            >
              Đang tải...
            </div>
          ) : activeStaff.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: COLORS.textSecondary,
              }}
            >
              Chưa có nhân viên nào
            </div>
          ) : (
            activeStaff.map((profile) => (
              <div
                key={profile.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span style={{ color: COLORS.textPrimary, fontWeight: 500 }}>
                  {profile.full_name}
                </span>
                <span style={{ color: COLORS.textSecondary }}>
                  {profile.phone_number}
                </span>
                <StatusBadge status={profile.status} />
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => handleAction(profile.id, "deactivate")}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "transparent",
                      color: COLORS.error,
                      border: `1px solid ${COLORS.error}`,
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    🚫 Vô hiệu hóa
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite Code Modal */}
      {inviteCode && (
        <InviteCodeModal
          code={inviteCode}
          onClose={() => setInviteCode(null)}
        />
      )}
    </div>
  );
}

export default EmployeeList;
