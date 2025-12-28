// src/pages/LoginPage.tsx - Login/Register/ForgotPassword Screen
// SOLID: This is a "Dumb Container" - only handles UI, logic via useAuth hook

import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { loginStyles } from "../styles/theme";

type AuthMode = "login" | "register" | "forgot";

export function LoginPage() {
  const { login, register, forgotPassword, loading, error, clearError } =
    useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === "login") {
      await login(email, password);
    } else if (mode === "register") {
      if (!businessName.trim() || !fullName.trim()) {
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
          <span style={loginStyles.logoText}>SnapKO</span>
          <span style={loginStyles.tagline}>Desktop</span>
        </div>

        {/* Mode Toggle - only show for login/register */}
        {mode !== "forgot" && (
          <div style={loginStyles.modeToggle}>
            <button
              type="button"
              onClick={() => handleModeChange("login")}
              style={{
                ...loginStyles.modeButton,
                ...(mode === "login" ? loginStyles.modeButtonActive : {}),
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("register")}
              style={{
                ...loginStyles.modeButton,
                ...(mode === "register" ? loginStyles.modeButtonActive : {}),
              }}
            >
              Đăng ký
            </button>
          </div>
        )}

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
              <input
                type="text"
                placeholder="Tên doanh nghiệp"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                style={loginStyles.input}
                required
              />
              <input
                type="text"
                placeholder="Họ tên chủ quán"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={loginStyles.input}
                required
              />
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={loginStyles.input}
            required
          />

          {mode !== "forgot" && (
            <input
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={loginStyles.input}
              required
            />
          )}

          {error && <p style={loginStyles.error}>{error}</p>}

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

        {/* Footer Links */}
        <div style={{ marginTop: 16, textAlign: "center" }}>
          {mode === "login" && (
            <button
              type="button"
              onClick={() => handleModeChange("forgot")}
              style={{
                background: "none",
                border: "none",
                color: "#B8B3A8",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Quên mật khẩu?
            </button>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => handleModeChange("login")}
              style={{
                background: "none",
                border: "none",
                color: "#E07A2F",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ← Quay lại đăng nhập
            </button>
          )}
        </div>

        {/* Footer */}
        {mode !== "forgot" && (
          <p style={loginStyles.footer}>
            {mode === "login"
              ? "Chưa có tài khoản? Bấm Đăng ký ở trên"
              : "Đã có tài khoản? Bấm Đăng nhập ở trên"}
          </p>
        )}
      </div>
    </div>
  );
}
