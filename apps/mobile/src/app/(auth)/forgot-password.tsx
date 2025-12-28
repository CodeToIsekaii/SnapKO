/**
 * Forgot Password Screen
 * Per .antigravityrules and .UXUIrules
 *
 * Sends reset password email via Supabase
 * Uses Deep Link redirectTo for mobile app
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      setError("Vui lòng nhập email");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Email không hợp lệ");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // IMPORTANT: redirectTo uses Deep Link for mobile app
      const redirectUrl = Linking.createURL("/auth/update-password");

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: redirectUrl,
        }
      );

      if (resetError) {
        throw new Error(resetError.message);
      }

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gửi email thất bại";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <Ionicons name="mail-outline" size={64} color={COLORS.success} />
          <Text style={styles.successTitle}>Kiểm tra email!</Text>
          <Text style={styles.successText}>
            Chúng tôi đã gửi link đặt lại mật khẩu đến{"\n"}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>
          <Text style={styles.hintText}>
            Không thấy email? Kiểm tra thư mục Spam hoặc thử lại sau vài phút.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.outlineButtonText}>Về trang đăng nhập</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Quên mật khẩu?</Text>
          <Text style={styles.subtitle}>
            Nhập email để nhận link đặt lại mật khẩu
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
            placeholder="Email"
            placeholderTextColor={COLORS.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleReset}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Gửi link khôi phục</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Nhớ mật khẩu rồi?</Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.linkText}>Đăng nhập</Text>
          </TouchableOpacity>
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
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 22,
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
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  outlineButtonText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "600",
  },
  footer: {
    marginTop: 40,
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "600",
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
    lineHeight: 24,
  },
  emailHighlight: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  hintText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
});
