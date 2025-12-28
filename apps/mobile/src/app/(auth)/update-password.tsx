/**
 * Update Password Screen
 * Per .antigravityrules and .UXUIrules
 *
 * User lands here after clicking reset link in email.
 * Deep Link: snapko://auth/update-password
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

// Colors from .UXUIrules - F&B Ops Theme
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F", // Burnt Orange - CTA
  success: "#6B8E23", // Olive Green
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
  error: "#E63946",
};

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if user has a valid session from reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // No session means the link might be invalid or expired
        setError(
          "Link đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại email."
        );
      }
    };
    checkSession();
  }, []);

  const handleUpdate = async () => {
    if (!password || password.length < 6) {
      setError("Mật khẩu phải từ 6 ký tự trở lên");
      return;
    }

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess(true);

      // Auto redirect after 2 seconds
      setTimeout(() => {
        router.replace("/(tabs)/dashboard");
      }, 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Cập nhật mật khẩu thất bại";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
          <Text style={styles.successTitle}>Đổi mật khẩu thành công!</Text>
          <Text style={styles.successText}>
            Đang chuyển hướng về trang chính...
          </Text>
          <ActivityIndicator
            color={COLORS.primary}
            size="small"
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="lock-closed" size={48} color={COLORS.primary} />
          <Text style={styles.title}>Đặt mật khẩu mới</Text>
          <Text style={styles.subtitle}>
            Tạo mật khẩu mới cho tài khoản của bạn
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
            placeholderTextColor={COLORS.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoFocus
          />

          <TextInput
            style={styles.input}
            placeholder="Xác nhận mật khẩu mới"
            placeholderTextColor={COLORS.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleUpdate}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Cập nhật mật khẩu</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Security hint */}
        <View style={styles.hintContainer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={COLORS.textSecondary}
          />
          <Text style={styles.hintText}>
            Mẹo: Sử dụng mật khẩu có cả chữ hoa, chữ thường và số để bảo mật
            hơn.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  form: {
    gap: 16,
  },
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  hintContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 32,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hintText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  successText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
