/**
 * LoginScreen - Owner authentication
 *
 * Uses:
 * - F&B "Organic Tech" theme
 * - Zod validation from @snapko/logic
 * - AuthContext for state-driven navigation
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { loginSchema, registerSchema, getFirstError } from "@snapko/shared";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleAuth } from "../features/auth/hooks/useGoogleAuth";

type Mode = "login" | "register";

// F&B Theme Colors
const colors = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  primaryMuted: "#C2410C",
  brand: "#6B8E23", // Olive green for secondary
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  textMuted: "#64748B",
  border: "#2A2A2A",
  error: "#E63946",
};

interface LoginScreenProps {
  onStaffJoin: () => void;
}

export default function LoginScreen({ onStaffJoin }: LoginScreenProps) {
  const { signIn, signUp } = useAuth();
  const { state: googleState, signInWithGoogle } = useGoogleAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Google auth state changes
  useEffect(() => {
    if (googleState.error) {
      setError(googleState.error);
    }
  }, [googleState.error]);

  // Show loading if Google or email auth is processing
  const isAnyLoading = loading || googleState.isLoading;

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google đăng nhập thất bại"
      );
    }
  };

  const handleSubmit = async () => {
    setError(null);

    // Validate
    if (mode === "login") {
      const validationError = getFirstError(loginSchema, { email, password });
      if (validationError) {
        setError(validationError);
        return;
      }
    } else {
      const validationError = getFirstError(registerSchema, {
        email,
        password,
        confirmPassword,
      });
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        await signIn(email.trim().toLowerCase(), password);
      } else {
        await signUp(email.trim().toLowerCase(), password);
        Alert.alert(
          "Đăng ký thành công!",
          "Tài khoản của bạn đã được tạo. Bạn đã đăng nhập."
        );
      }
    } catch (err: any) {
      setError(err.message || "Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError(null);
    setConfirmPassword("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          justifyContent: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo & Header */}
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <Text style={{ color: "white", fontSize: 32, fontWeight: "bold" }}>
              SK
            </Text>
          </View>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 28,
              fontWeight: "bold",
              marginBottom: 8,
            }}
          >
            SnapKO
          </Text>
          <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
            {mode === "login"
              ? "Đăng nhập để quản lý quán"
              : "Tạo tài khoản Owner mới"}
          </Text>
        </View>

        {/* Form */}
        <View style={{ gap: 16 }}>
          {/* Email */}
          <View>
            <Text
              style={{
                color: colors.textSecondary,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              placeholder="owner@quancafe.vn"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                color: colors.textPrimary,
                fontSize: 16,
                borderWidth: 2,
                borderColor: colors.border,
              }}
            />
          </View>

          {/* Password */}
          <View>
            <Text
              style={{
                color: colors.textSecondary,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              Mật khẩu
            </Text>
            <TextInput
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete={mode === "login" ? "password" : "new-password"}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                color: colors.textPrimary,
                fontSize: 16,
                borderWidth: 2,
                borderColor: colors.border,
              }}
            />
          </View>

          {/* Confirm Password (Register only) */}
          {mode === "register" && (
            <View>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                Xác nhận mật khẩu
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  setError(null);
                }}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoComplete="new-password"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  color: colors.textPrimary,
                  fontSize: 16,
                  borderWidth: 2,
                  borderColor: colors.border,
                }}
              />
            </View>
          )}

          {/* Error */}
          {error && (
            <Text style={{ color: colors.error, textAlign: "center" }}>
              {error}
            </Text>
          )}

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.primaryMuted : colors.primary,
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              opacity: loading ? 0.7 : 1,
              transform: [{ scale: pressed && !loading ? 0.98 : 1 }],
            })}
          >
            {loading && <ActivityIndicator color="white" />}
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              {loading
                ? "Đang xử lý..."
                : mode === "login"
                ? "Đăng nhập"
                : "Đăng ký"}
            </Text>
          </Pressable>

          {/* Google Login Button */}
          {mode === "login" && (
            <Pressable
              onPress={handleGoogleSignIn}
              disabled={isAnyLoading}
              style={({ pressed }) => ({
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
                borderWidth: 2,
                borderColor: colors.border,
                opacity: pressed || isAnyLoading ? 0.7 : 1,
              })}
            >
              {googleState.isLoading ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <>
                  <Text style={{ fontSize: 20 }}>🔵</Text>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontSize: 16,
                      fontWeight: "500",
                    }}
                  >
                    Đăng nhập với Google
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/* Toggle mode */}
          <Pressable onPress={toggleMode}>
            <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
              {mode === "login"
                ? "Chưa có tài khoản? Đăng ký"
                : "Đã có tài khoản? Đăng nhập"}
            </Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginVertical: 32,
          }}
        >
          <View
            style={{ flex: 1, height: 1, backgroundColor: colors.border }}
          />
          <Text
            style={{
              color: colors.textMuted,
              marginHorizontal: 16,
              fontSize: 12,
            }}
          >
            hoặc
          </Text>
          <View
            style={{ flex: 1, height: 1, backgroundColor: colors.border }}
          />
        </View>

        {/* Staff Join Button */}
        <Pressable
          onPress={onStaffJoin}
          style={({ pressed }) => ({
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            borderWidth: 2,
            borderColor: colors.brand,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{ color: colors.brand, fontSize: 16, fontWeight: "600" }}
          >
            Tôi là nhân viên (có mã mời)
          </Text>
        </Pressable>

        {/* Footer */}
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            textAlign: "center",
            marginTop: 40,
          }}
        >
          Bằng việc đăng ký, bạn đồng ý với Điều khoản sử dụng{"\n"}
          và Chính sách Quyền riêng tư của SnapKO.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
