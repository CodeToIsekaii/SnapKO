/**
 * Register Screen - Owner Only
 * Per .antigravityrules and .UXUIrules
 *
 * This screen is for OWNER registration only.
 * Staff must use join-staff.tsx with invite code.
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
  ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";
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

export default function RegisterScreen() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateForm = (): boolean => {
    if (!businessName.trim()) {
      setError("Vui lòng nhập tên doanh nghiệp");
      return false;
    }
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ tên");
      return false;
    }
    if (!email.trim()) {
      setError("Vui lòng nhập email");
      return false;
    }
    if (!password || password.length < 6) {
      setError("Mật khẩu phải từ 6 ký tự trở lên");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              business_name: businessName.trim(),
              role: "OWNER", // Always OWNER for this screen
            },
          },
        }
      );

      if (signUpError) {
        throw new Error(signUpError.message);
      }

      if (authData.user) {
        // Create profile in profiles table
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: authData.user.id,
          full_name: fullName.trim(),
          business_name: businessName.trim(),
          role: "OWNER",
          status: "ACTIVE",
        });

        if (profileError) {
          console.warn("Profile creation warning:", profileError.message);
        }

        setSuccess(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đăng ký thất bại";
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
          <Text style={styles.successTitle}>Đăng ký thành công!</Text>
          <Text style={styles.successText}>
            Vui lòng kiểm tra email để xác nhận tài khoản.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text style={styles.buttonText}>Về trang đăng nhập</Text>
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Đăng ký</Text>
          <Text style={styles.subtitle}>Tạo tài khoản chủ quán</Text>
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
            placeholder="Tên doanh nghiệp / Tên quán"
            placeholderTextColor={COLORS.textSecondary}
            value={businessName}
            onChangeText={setBusinessName}
            autoCapitalize="words"
          />

          <TextInput
            style={styles.input}
            placeholder="Họ và tên"
            placeholderTextColor={COLORS.textSecondary}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <TextInput
            style={styles.input}
            placeholder="Mật khẩu (tối thiểu 6 ký tự)"
            placeholderTextColor={COLORS.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.input}
            placeholder="Xác nhận mật khẩu"
            placeholderTextColor={COLORS.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Đăng ký</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Đã có tài khoản?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Đăng nhập</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Staff Notice */}
        <View style={styles.staffNotice}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={COLORS.textSecondary}
          />
          <Text style={styles.staffNoticeText}>
            Bạn là nhân viên? Hãy quay lại và chọn{" "}
            <Text
              style={styles.staffNoticeLink}
              onPress={() => router.push("/(auth)/join-staff")}
            >
              "Nhập mã mời"
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    marginBottom: 16,
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
  footer: {
    marginTop: 32,
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
  staffNotice: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  staffNoticeText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  staffNoticeLink: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
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
    marginBottom: 24,
  },
});
