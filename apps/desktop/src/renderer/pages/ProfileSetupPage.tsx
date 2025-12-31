// src/pages/ProfileSetupPage.tsx - First-time owner setup
// Creates business on Cloud (required for Edge Functions), then navigates to Dashboard

import React, { useState } from "react";
import { useAuth } from "../hooks/AuthContext";
import { loginStyles, COLORS } from "../styles/theme";

export function ProfileSetupPage() {
  const { user, refreshProfile } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !user) return;

    setLoading(true);
    setError(null);

    try {
      console.log("[ProfileSetup] Creating business:", businessName);

      // Call Main Process to create business on Cloud
      const result = await window.electronAPI.createBusiness({
        name: businessName.trim(),
        userId: user.id,
      });

      console.log("[ProfileSetup] Create business result:", result);

      if (result.success) {
        // Refresh profile to get updated business_id
        await refreshProfile();
        // App will automatically navigate to Dashboard when profile has business_id
      } else {
        setError(result.error || "Không thể tạo cửa hàng");
      }
    } catch (err: any) {
      console.error("[ProfileSetup] Error:", err);
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={loginStyles.container}>
      <div style={loginStyles.card}>
        {/* Header */}
        <div style={loginStyles.logo}>
          <div style={loginStyles.logoBox}>
            <span style={loginStyles.logoInner}>SK</span>
          </div>
          <span style={loginStyles.logoText}>SnapKO</span>
          <span style={loginStyles.tagline}>Thiết lập cửa hàng của bạn</span>
        </div>

        {/* Welcome Message */}
        <p
          style={{
            color: COLORS.textSecondary,
            fontSize: 14,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          Chào mừng{" "}
          <strong style={{ color: COLORS.primary }}>{user?.email}</strong>!
          <br />
          Hãy đặt tên cho quán của bạn để bắt đầu.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={loginStyles.form}>
          <div>
            <label style={loginStyles.label}>Tên cửa hàng / Quán *</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ví dụ: Cà phê Mê Linh"
              required
              style={loginStyles.input}
              disabled={loading}
            />
          </div>

          {error && <p style={loginStyles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !businessName.trim()}
            style={{
              ...loginStyles.button,
              opacity: loading || !businessName.trim() ? 0.6 : 1,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Đang khởi tạo..." : "Bắt đầu kinh doanh 🚀"}
          </button>
        </form>

        <p style={loginStyles.footer}>
          Thông tin này sẽ hiển thị cho nhân viên của bạn khi họ tham gia quán.
        </p>
      </div>
    </div>
  );
}
