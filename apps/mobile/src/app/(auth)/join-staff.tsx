/**
 * Join Staff Screen - Expo Router
 * Per .antigravityrules Section A: Staff Invite Flow
 *
 * Data Minimization: Full Name + Phone ONLY. NO Avatars, NO ID Cards.
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

// Colors from .UXUIrules - F&B Ops Theme
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F", // Burnt Orange - CTA
  success: "#6B8E23", // Olive Green
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
  borderFocused: "#E07A2F",
  error: "#E63946",
};

export default function JoinStaffScreen() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const handleJoin = async () => {
    // Validate inputs - Per .antigravityrules: Name + Phone ONLY
    if (!inviteCode.trim()) {
      setError("Vui lòng nhập mã mời");
      return;
    }
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ tên");
      return;
    }
    if (!phoneNumber.trim()) {
      setError("Vui lòng nhập số điện thoại");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Call Edge Function to validate invite code
      // Per .antigravityrules: invite-join Edge Function
      // const response = await fetch(SUPABASE_URL + '/functions/v1/invite-join', {
      //   method: 'POST',
      //   body: JSON.stringify({ invite_code: inviteCode, full_name: fullName, phone_number: phoneNumber }),
      // });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Staff will be pending until Owner approves
      router.replace("/(auth)/pending-approval");
    } catch (err) {
      setError("Mã mời không hợp lệ hoặc đã hết hạn");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Tham gia</Text>
            <Text style={styles.subtitle}>
              Nhập mã mời từ chủ quán để tham gia doanh nghiệp
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Invite Code - Large prominent input */}
            <View>
              <Text style={styles.label}>Mã mời (6 ký tự)</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.codeInput,
                  focusedInput === "code" && styles.inputFocused,
                ]}
                placeholder="ABC123"
                placeholderTextColor={COLORS.textSecondary}
                value={inviteCode}
                onChangeText={(text) => setInviteCode(text.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                onFocus={() => setFocusedInput("code")}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            {/* Full Name - Required per .antigravityrules */}
            <View>
              <Text style={styles.label}>Họ và tên</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === "name" && styles.inputFocused,
                ]}
                placeholder="Nguyễn Văn A"
                placeholderTextColor={COLORS.textSecondary}
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setFocusedInput("name")}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            {/* Phone Number - Required per .antigravityrules */}
            <View>
              <Text style={styles.label}>Số điện thoại</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedInput === "phone" && styles.inputFocused,
                ]}
                placeholder="0901234567"
                placeholderTextColor={COLORS.textSecondary}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                onFocus={() => setFocusedInput("phone")}
                onBlur={() => setFocusedInput(null)}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleJoin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Tham gia</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Back to login */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Bạn là chủ quán?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Đăng nhập tại đây</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  form: {
    gap: 20,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "500",
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
  inputFocused: {
    borderColor: COLORS.borderFocused,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
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
    marginTop: 48,
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
});
