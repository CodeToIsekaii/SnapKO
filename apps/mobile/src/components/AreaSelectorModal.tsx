/**
 * AreaSelectorModal - Modal to select storage area and check mode
 * Per .UXUIrules Section 3.A: Step 1 and Step 2 flow
 */

import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type StorageArea = "BAR" | "WAREHOUSE";
export type CheckMode = "FULL" | "SPOT";

interface AreaSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (area: StorageArea, mode?: CheckMode) => void;
  hasTodaySales?: boolean; // If true, auto-select FULL mode for Warehouse (skip mode selection)
}

export default function AreaSelectorModal({
  visible,
  onClose,
  onSelect,
  hasTodaySales,
}: AreaSelectorModalProps) {
  const [selectedArea, setSelectedArea] = React.useState<StorageArea | null>(
    null,
  );

  const handleAreaSelect = (area: StorageArea) => {
    if (area === "BAR") {
      // Bar is direct - no mode selection needed
      onSelect("BAR");
      onClose();
    } else {
      // Warehouse: if user already has sales today, auto-select FULL (Tồn cuối)
      // This is the expected workflow: Kết ca → Kiểm tồn cuối
      if (hasTodaySales) {
        onSelect("WAREHOUSE", "FULL");
        onClose();
      } else {
        // No sales yet - show mode selection
        setSelectedArea("WAREHOUSE");
      }
    }
  };

  const handleModeSelect = (mode: CheckMode) => {
    onSelect("WAREHOUSE", mode);
    setSelectedArea(null);
    onClose();
  };

  const handleClose = () => {
    setSelectedArea(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <Text style={styles.title}>Chọn khu vực kiểm kho</Text>

          {selectedArea !== "WAREHOUSE" ? (
            // Step 1: Area Selection
            <>
              <Pressable
                style={[styles.optionButton, styles.optionPrimary]}
                onPress={() => handleAreaSelect("BAR")}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="wine" size={28} color="#6B8E23" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>QUẦY BAR</Text>
                  <Text style={styles.optionSubtitle}>
                    Kiểm tồn cuối ca (Mặc định)
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={styles.optionButton}
                onPress={() => handleAreaSelect("WAREHOUSE")}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="cube" size={28} color="#B8B3A8" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>KHO TỔNG</Text>
                  <Text style={styles.optionSubtitle}>
                    Kiểm định kỳ / Quản lý
                  </Text>
                </View>
              </Pressable>

              <Pressable style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelText}>Hủy</Text>
              </Pressable>
            </>
          ) : (
            // Step 2: Check Mode Selection (Warehouse only)
            <>
              <Text style={styles.subtitle}>Chọn chế độ kiểm kê:</Text>

              <Pressable
                style={[styles.optionButton, styles.optionDanger]}
                onPress={() => handleModeSelect("FULL")}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="alert-circle" size={28} color="#E63946" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, { color: "#E63946" }]}>
                    Kiểm Toàn Bộ
                  </Text>
                  <Text style={styles.optionSubtitle}>
                    Chốt sổ cuối tháng - MÓN KHÔNG ĐẾM = 0
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.optionButton, styles.optionCalm]}
                onPress={() => handleModeSelect("SPOT")}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="search" size={28} color="#3B82F6" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, { color: "#3B82F6" }]}>
                    Kiểm 1 Phần
                  </Text>
                  <Text style={styles.optionSubtitle}>
                    Chỉ cập nhật món bạn đếm
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={() => setSelectedArea(null)}
              >
                <Text style={styles.cancelText}>← Quay lại</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
  },
  title: {
    color: "#F5F3EF",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    marginBottom: 16,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionPrimary: {
    borderColor: "#6B8E23",
  },
  optionWarning: {
    borderColor: "#FFC857",
  },
  optionDanger: {
    borderColor: "#E63946",
    backgroundColor: "#E6394615",
  },
  optionCalm: {
    borderColor: "#3B82F6",
    backgroundColor: "#3B82F610",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  optionIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    color: "#F5F3EF",
    fontSize: 16,
    fontWeight: "600",
  },
  optionSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 4,
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
