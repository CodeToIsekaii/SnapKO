/**
 * SetupPendingScreen - "Waiting Room" for staff
 * Shown when shop hasn't configured operational_model yet
 * Per .UXUIrules: Dark mode with Burnt Orange accent
 */

import React, { useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from "react-native";

// UXUIrules Color Palette
const COLORS = {
  background: "#121212", // Charcoal
  surface: "#1A1A1A", // Dark Coffee
  textPrimary: "#F5F3EF", // Cream White
  textSecondary: "#B8B3A8", // Warm Gray
  textMuted: "#6F6B63", // Muted Gray
  cta: "#E07A2F", // Burnt Orange
};

interface SetupPendingScreenProps {
  onCheckAgain: () => void;
  onLogout?: () => void;
}

export default function SetupPendingScreen({
  onCheckAgain,
  onLogout,
}: SetupPendingScreenProps) {
  // Auto-check every 10 seconds
  useEffect(() => {
    const interval = setInterval(onCheckAgain, 10000);
    return () => clearInterval(interval);
  }, [onCheckAgain]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Hourglass Icon */}
        <Text style={styles.icon}>⏳</Text>

        <Text style={styles.title}>Chờ Chủ Quán Một Chút...</Text>

        <Text style={styles.description}>
          Quán của bạn chưa hoàn tất thiết lập mô hình kho (Model A/B). Vui lòng
          nhắc chủ quán chọn mô hình vận hành trên Web Admin.
        </Text>

        <ActivityIndicator
          size="large"
          color={COLORS.cta}
          style={styles.spinner}
        />

        <Text style={styles.checkingText}>
          Hệ thống đang tự động kiểm tra...
        </Text>

        {/* Manual refresh button */}
        <Pressable style={styles.refreshButton} onPress={onCheckAgain}>
          <Text style={styles.refreshButtonText}>🔄 Kiểm tra ngay</Text>
        </Pressable>

        {/* Logout option */}
        {onLogout && (
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Đăng xuất</Text>
          </Pressable>
        )}
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Mô hình kho là gì?</Text>
        <Text style={styles.infoText}>
          <Text style={styles.bold}>Model A:</Text> Quán nhỏ, 1 kho duy nhất
          {"\n"}
          <Text style={styles.bold}>Model B:</Text> Quán lớn, có Kho tổng & Quầy
          Bar riêng
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: COLORS.cta,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  spinner: {
    marginBottom: 16,
  },
  checkingText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 16,
  },
  refreshButton: {
    backgroundColor: COLORS.cta,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  refreshButtonText: {
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  logoutButton: {
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    width: "100%",
    maxWidth: 400,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cta,
  },
  infoTitle: {
    color: COLORS.textPrimary,
    fontWeight: "600",
    marginBottom: 8,
  },
  infoText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  bold: {
    fontWeight: "600",
    color: COLORS.cta,
  },
});
