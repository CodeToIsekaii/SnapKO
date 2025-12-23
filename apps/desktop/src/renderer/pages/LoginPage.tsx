// src/pages/LoginPage.tsx - Login/Register Screen
// SOLID: This is a "Dumb Container" - only handles UI, logic via useAuth hook

import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { loginStyles } from "../styles/theme";

type AuthMode = "login" | "register";

export function LoginPage() {
  const { login, register, loading, error, clearError } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === "login") {
      await login(email, password);
    } else {
      if (!businessName.trim() || !fullName.trim()) {
        return; // Form validation handles this
      }
      await register({ email, password, businessName, fullName });
    }
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    clearError();
  };

  return (
    <div style={loginStyles.container}>
      <div style={loginStyles.card}>
        {/* Logo */}
        <div style={loginStyles.logo}>
          <span style={loginStyles.logoText}>SnapKO</span>
          <span style={loginStyles.tagline}>Desktop</span>
        </div>

        {/* Mode Toggle */}
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
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={loginStyles.input}
            required
          />

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
                : "Đang đăng ký..."
              : mode === "login"
              ? "Đăng nhập"
              : "Đăng ký"}
          </button>
        </form>

        {/* Footer */}
        <p style={loginStyles.footer}>
          {mode === "login"
            ? "Chưa có tài khoản? Bấm Đăng ký ở trên"
            : "Đã có tài khoản? Bấm Đăng nhập ở trên"}
        </p>
      </div>
    </div>
  );
}
