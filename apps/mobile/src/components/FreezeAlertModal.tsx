/**
 * FreezeAlertModal - Full-screen red warning before warehouse full count
 * Per .UXUIrules Section 3.B: The "Freeze Alert" UI
 */

import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";

interface FreezeAlertModalProps {
  visible: boolean;
  onConfirm: () => void; // "Tôi đã sẵn sàng đếm"
  onCancel: () => void; // "Để tôi chuyển hàng trước"
}

export default function FreezeAlertModal({
  visible,
  onConfirm,
  onCancel,
}: FreezeAlertModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Warning Icon */}
          <Text style={styles.icon}>⚠️</Text>

          {/* Title */}
          <Text style={styles.title}>DỪNG LẠI!</Text>

          {/* Description */}
          <Text style={styles.description}>
            Bạn sắp <Text style={styles.bold}>chốt sổ Kho Tổng</Text>.{"\n\n"}
            Hãy chuyển hết hàng cần thiết qua Bar{" "}
            <Text style={styles.bold}>NGAY BÂY GIỜ</Text>.{"\n\n"}
            Sau khi bấm "Bắt đầu", chức năng{" "}
            <Text style={styles.highlight}>Chuyển Kho sẽ bị KHÓA</Text> để tránh
            sai lệch số liệu.
          </Text>

          {/* Actions */}
          <Pressable style={styles.primaryButton} onPress={onConfirm}>
            <Text style={styles.primaryText}>Tôi đã sẵn sàng đếm</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryText}>Để tôi chuyển hàng trước</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(230, 57, 70, 0.15)", // Tomato Red tint
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E63946", // Tomato Red border
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: "#E63946",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 16,
  },
  description: {
    color: "#B8B3A8",
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 24,
  },
  bold: {
    fontWeight: "700",
    color: "#F5F3EF",
  },
  highlight: {
    fontWeight: "700",
    color: "#E63946",
  },
  primaryButton: {
    backgroundColor: "#E07A2F", // Burnt Orange
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryText: {
    color: "#F5F3EF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#6B8E23", // Olive Green
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  secondaryText: {
    color: "#6B8E23",
    fontSize: 14,
    fontWeight: "600",
  },
});
