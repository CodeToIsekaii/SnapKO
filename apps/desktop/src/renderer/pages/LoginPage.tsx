// src/pages/LoginPage.tsx - Login/Register/ForgotPassword Screen
// SOLID: This is a "Dumb Container" - only handles UI, logic via useAuth hook

import React, { useState } from "react";
import { useAuth } from "../hooks/AuthContext";
import { loginStyles } from "../styles/theme";

type AuthMode = "login" | "register" | "forgot";

export function LoginPage() {
  const {
    login,
    googleLogin,
    register,
    forgotPassword,
    loading,
    error,
    clearError,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearError();
    setGoogleLoading(true);
    try {
      await googleLogin();
    } catch (err: any) {
      setLocalError(err.message || "Đăng nhập Google thất bại");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    // Safety check for electronAPI
    if (!window.electronAPI || !window.electronAPI.login) {
      setLocalError(
        "Lỗi hệ thống: IPC Bridge không khả dụng. Vui lòng khởi động lại app."
      );
      return;
    }

    if (mode === "login") {
      await login(email, password);
    } else if (mode === "register") {
      if (password !== confirmPassword) {
        setLocalError("Mật khẩu xác nhận không khớp");
        return;
      }
      if (!businessName.trim() || !fullName.trim()) {
        setLocalError("Vui lòng nhập đầy đủ thông tin");
        return;
      }
      await register({ email, password, businessName, fullName });
    } else if (mode === "forgot") {
      const result = await forgotPassword(email);
      if (result.success) {
        setForgotSuccess(true);
      }
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setForgotSuccess(false);
    clearError();
    setLocalError(null);
  };

  // Forgot password success state
  if (mode === "forgot" && forgotSuccess) {
    return (
      <div style={loginStyles.container}>
        <div style={loginStyles.card}>
          <div style={loginStyles.logo}>
            <span style={loginStyles.logoText}>SnapKO</span>
            <span style={loginStyles.tagline}>Desktop</span>
          </div>

          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                fontSize: 48,
                marginBottom: 16,
              }}
            >
              ✉️
            </div>
            <h3 style={{ color: "#F5F3EF", marginBottom: 8 }}>
              Kiểm tra email!
            </h3>
            <p style={{ color: "#B8B3A8", marginBottom: 20 }}>
              Chúng tôi đã gửi link đặt lại mật khẩu đến
              <br />
              <strong style={{ color: "#E07A2F" }}>{email}</strong>
            </p>
            <button
              type="button"
              onClick={() => handleModeChange("login")}
              style={{
                ...loginStyles.button,
                background: "transparent",
                border: "2px solid #E07A2F",
                color: "#E07A2F",
              }}
            >
              Về trang đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={loginStyles.container}>
      <div style={loginStyles.card}>
        {/* Logo */}
        <div style={loginStyles.logo}>
          <div style={loginStyles.logoBox}>
            <span style={loginStyles.logoInner}>SK</span>
          </div>
          <span style={loginStyles.logoText}>SnapKO</span>
          <span style={loginStyles.tagline}>
            {mode === "login"
              ? "Đăng nhập để quản lý quán"
              : mode === "register"
              ? "Tạo tài khoản Owner mới"
              : "Desktop"}
          </span>
        </div>

        {/* Forgot Password Header */}
        {mode === "forgot" && (
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h3 style={{ color: "#F5F3EF", marginBottom: 8 }}>
              Quên mật khẩu?
            </h3>
            <p style={{ color: "#B8B3A8", fontSize: 14 }}>
              Nhập email để nhận link đặt lại mật khẩu
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={loginStyles.form}>
          {mode === "register" && (
            <>
              <div style={{ textAlign: "left" }}>
                <label style={loginStyles.label}>Tên doanh nghiệp</label>
                <input
                  type="text"
                  placeholder="Tên quán của bạn"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={loginStyles.input}
                  required
                />
              </div>
              <div style={{ textAlign: "left" }}>
                <label style={loginStyles.label}>Họ tên chủ quán</label>
                <input
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={loginStyles.input}
                  required
                />
              </div>
            </>
          )}

          <div style={{ textAlign: "left" }}>
            <label style={loginStyles.label}>Email</label>
            <input
              type="email"
              placeholder="owner@quancafe.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...loginStyles.input, width: "100%" }}
              required
            />
          </div>

          {mode !== "forgot" && (
            <div style={{ textAlign: "left" }}>
              <label style={loginStyles.label}>Mật khẩu</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...loginStyles.input, width: "100%" }}
                required
              />
            </div>
          )}

          {mode === "register" && (
            <div style={{ textAlign: "left" }}>
              <label style={loginStyles.label}>Xác nhận mật khẩu</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={loginStyles.input}
                required
              />
            </div>
          )}

          {(error || localError) && (
            <p style={loginStyles.error}>{error || localError}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...loginStyles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? mode === "login"
                ? "Đang đăng nhập..."
                : mode === "register"
                ? "Đang đăng ký..."
                : "Đang gửi..."
              : mode === "login"
              ? "Đăng nhập"
              : mode === "register"
              ? "Đăng ký"
              : "Gửi link khôi phục"}
          </button>
        </form>

        {/* Toggle mode */}
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={() =>
              handleModeChange(mode === "login" ? "register" : "login")
            }
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {mode === "login"
              ? "Chưa có tài khoản? Đăng ký"
              : "Đã có tài khoản? Đăng nhập"}
          </button>
        </div>

        {/* Google Login */}
        {mode === "login" && (
          <div
            style={{
              marginTop: 24,
              paddingTop: 24,
              borderTop: "1px solid #2A2A2A",
            }}
          >
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              style={{
                ...loginStyles.button,
                backgroundColor: "#1A1A1A",
                border: "2px solid #2A2A2A",
                color: "#F5F3EF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                width: "100%",
                opacity: loading || googleLoading ? 0.6 : 1,
                cursor: loading || googleLoading ? "not-allowed" : "pointer",
              }}
            >
              {googleLoading ? (
                "Đang đăng nhập..."
              ) : (
                <>
                  <span style={{ fontSize: 20 }}>🔵</span>
                  Đăng nhập với Google
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer info (App store compliance) */}
        <p style={{ ...loginStyles.footer, marginTop: 32 }}>
          Bằng việc đăng ký, bạn đồng ý với Điều khoản sử dụng{"\n"}
          và Chính sách Quyền riêng tư của SnapKO.
        </p>
      </div>
    </div>
  );
}
