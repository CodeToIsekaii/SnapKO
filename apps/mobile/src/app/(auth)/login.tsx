/**
 * Login Screen - Expo Router
 * Per .antigravityrules and .UXUIrules
 *
 * Owner: Google OAuth (Priority) or Email/Pass
 * Staff: Navigate to join-staff with invite code
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
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useGoogleAuth } from "../../features/auth/hooks/useGoogleAuth";

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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google OAuth hook
  const { state: googleState, signInWithGoogle } = useGoogleAuth();

  // Handle Google auth success
  useEffect(() => {
    if (googleState.user) {
      router.replace("/(tabs)/dashboard");
    }
    if (googleState.error) {
      setError(googleState.error);
    }
  }, [googleState.user, googleState.error]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập email và mật khẩu");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement Supabase email auth
      // const { error } = await supabase.auth.signInWithPassword({ email, password });

      // For now, simulate login
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Router will handle redirect in _layout.tsx
      router.replace("/(tabs)/dashboard");
    } catch (err) {
      setError("Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    await signInWithGoogle();
  };

  const isAnyLoading = isLoading || googleState.isLoading;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.header}>
          <Text style={styles.title}>SnapKO</Text>
          <Text style={styles.subtitle}>Quản lý tồn kho thông minh</Text>
        </View>

        {/* Login Form */}
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
          />

          <TextInput
            style={styles.input}
            placeholder="Mật khẩu"
            placeholderTextColor={COLORS.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleLogin}
            disabled={isAnyLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Đăng nhập</Text>
            )}
          </TouchableOpacity>

          {/* Google OAuth - Priority per .antigravityrules */}
          <TouchableOpacity
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleLogin}
            disabled={isAnyLoading}
          >
            {googleState.isLoading ? (
              <ActivityIndicator color={COLORS.textPrimary} />
            ) : (
              <View style={styles.googleButtonContent}>
                <Ionicons
                  name="logo-google"
                  size={20}
                  color={COLORS.textPrimary}
                />
                <Text style={styles.googleButtonText}>
                  Đăng nhập với Google
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Forgot Password Link */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Register & Staff Links */}
        <View style={styles.footer}>
          <View style={styles.registerRow}>
            <Text style={styles.footerText}>Chưa có tài khoản?</Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Đăng ký</Text>
              </TouchableOpacity>
            </Link>
          </View>
          <View style={styles.divider} />
          <View style={styles.staffRow}>
            <Text style={styles.footerText}>Bạn là nhân viên?</Text>
            <Link href="/(auth)/join-staff" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Nhập mã mời</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  title: {
    fontSize: 42,
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
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  googleButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  googleButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: "500",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
    gap: 16,
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
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  forgotPasswordText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  registerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: COLORS.border,
  },
  staffRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
