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
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  const [isSubmitPressed, setIsSubmitPressed] = useState(false);
  const [isGooglePressed, setIsGooglePressed] = useState(false);
  const [isStaffPressed, setIsStaffPressed] = useState(false);

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

    // Check if input looks like a phone number (starts with 0 and has 9-11 digits)
    const cleanInput = email.trim().replace(/\s|-/g, "");
    const phoneRegex = /^0\d{8,10}$/;
    const isPhoneNumber = phoneRegex.test(cleanInput);

    // Validate - skip email format check if it's a phone number
    if (mode === "login") {
      if (isPhoneNumber) {
        // Only validate password for phone login
        if (!password || password.length < 6) {
          setError("Mật khẩu tối thiểu 6 ký tự");
          return;
        }
      } else {
        // Full email + password validation
        const validationError = getFirstError(loginSchema, { email, password });
        if (validationError) {
          setError(validationError);
          return;
        }
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
      // Convert phone number to staff email format if needed
      let loginEmail = email.trim().toLowerCase();

      if (isPhoneNumber) {
        // Convert phone to staff email format
        loginEmail = `${cleanInput}@staff.snapko.local`;
        console.log("[Login] Phone detected, converted to:", loginEmail);
      }

      if (mode === "login") {
        await signIn(loginEmail, password);
      } else {
        await signUp(loginEmail, password);
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
          <Image
            source={require("../../assets/icon.png")}
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              marginBottom: 20,
            }}
            resizeMode="contain"
          />
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 28,
              fontWeight: "bold",
              marginBottom: 8,
              textAlign: "center",
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
          {/* Email / Phone */}
          <View>
            <Text
              style={{
                color: colors.textSecondary,
                marginBottom: 8,
                fontSize: 14,
              }}
            >
              Email / Số điện thoại
            </Text>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              placeholder="email@example.com hoặc 0912345678"
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
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                marginTop: 4,
              }}
            >
              Nhân viên đã đăng ký: nhập số điện thoại
            </Text>
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
                borderWidth: 1,
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
            onPressIn={() => setIsSubmitPressed(true)}
            onPressOut={() => setIsSubmitPressed(false)}
            disabled={loading}
            style={{
              backgroundColor: isSubmitPressed
                ? colors.primaryMuted
                : "#E07A2F",
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              minHeight: 56,
              opacity: loading ? 0.7 : 1,
              transform: [{ scale: isSubmitPressed && !loading ? 0.98 : 1 }],
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {loading && (
                <ActivityIndicator color="white" style={{ marginRight: 8 }} />
              )}
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                {loading
                  ? "Đang xử lý..."
                  : mode === "login"
                  ? "Đăng nhập"
                  : "Đăng ký"}
              </Text>
            </View>
          </Pressable>

          {/* Google Login Button */}
          {mode === "login" && (
            <Pressable
              onPress={handleGoogleSignIn}
              onPressIn={() => setIsGooglePressed(true)}
              onPressOut={() => setIsGooglePressed(false)}
              disabled={isAnyLoading}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: colors.border,
                width: "100%",
                opacity: isGooglePressed || isAnyLoading ? 0.7 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {googleState.isLoading ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <>
                    <Ionicons
                      name="logo-google"
                      size={24}
                      color={colors.textPrimary}
                      style={{ marginRight: 12 }}
                    />
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
              </View>
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
          onPressIn={() => setIsStaffPressed(true)}
          onPressOut={() => setIsStaffPressed(false)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: colors.brand,
            opacity: isStaffPressed ? 0.8 : 1,
          }}
        >
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Text
              style={{ color: colors.brand, fontSize: 16, fontWeight: "600" }}
            >
              Nhân viên MỚI (có mã mời)
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              Đã đăng ký trước đó? Đăng nhập bằng SĐT phía trên
            </Text>
          </View>
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
