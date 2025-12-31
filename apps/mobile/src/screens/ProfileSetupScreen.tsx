/**
 * ProfileSetupScreen - First-time owner setup
 *
 * Shows when authState.status === "needs_setup"
 * Owner enters business name, calls RPC to create business
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";

// F&B Theme Colors (per .UXUIrules)
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
  error: "#E63946",
};

export function ProfileSetupScreen() {
  const { authState, createBusiness } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);

  const userEmail =
    authState.status === "needs_setup" ? authState.user.email : "";

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập tên cửa hàng");
      return;
    }

    setLoading(true);
    try {
      await createBusiness(businessName.trim());
      // AuthContext will auto-navigate via state change
    } catch (err: any) {
      Alert.alert("Lỗi", err.message || "Không thể tạo cửa hàng");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>SK</Text>
          </View>
          <Text style={styles.brandName}>SnapKO</Text>
        </View>

        {/* Header */}
        <Text style={styles.title}>Thiết lập cửa hàng</Text>
        <Text style={styles.subtitle}>
          Chào mừng <Text style={styles.emailHighlight}>{userEmail}</Text>!
          {"\n"}Hãy đặt tên cho quán của bạn để bắt đầu.
        </Text>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Tên cửa hàng / Quán *</Text>
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Ví dụ: Cà phê Mê Linh"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="words"
            editable={!loading}
          />

          <TouchableOpacity
            style={[
              styles.button,
              (!businessName.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!businessName.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Bắt đầu kinh doanh 🚀</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Thông tin này sẽ hiển thị cho nhân viên khi họ tham gia quán của bạn.
        </Text>
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
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logoText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  brandName: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  emailHighlight: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  footer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
