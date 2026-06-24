/**
 * LowStockModal Component
 * Full-screen modal with 2 tabs: Nguyên liệu / Vật dụng
 * Based on user's provided implementation
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LowStockItem } from "../hooks/useLowStock";

// Colors per .UXUIrules
const COLORS = {
  background: "#121212",
  surface: "#1C1C1E",
  surfaceLight: "#27272A",
  surfaceLighter: "#3F3F46",
  primary: "#E07A2F",
  danger: "#EF4444",
  textPrimary: "#FFFFFF",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",
};

interface LowStockModalProps {
  visible: boolean;
  onClose: () => void;
  data: {
    ingredients: LowStockItem[];
    supplies: LowStockItem[];
  };
  isLoading?: boolean;
  onRestock: () => void;
}

export const LowStockModal = ({
  visible,
  onClose,
  data,
  isLoading,
  onRestock,
}: LowStockModalProps) => {
  const [activeTab, setActiveTab] = useState<"ingredients" | "supplies">(
    "ingredients"
  );

  const listData =
    activeTab === "ingredients" ? data.ingredients : data.supplies;

  const handleRestock = () => {
    onClose();
    onRestock();
  };

  const renderItem = ({ item }: { item: LowStockItem }) => (
    <View style={styles.itemContainer}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetail}>
          Còn lại:{" "}
          <Text style={{ color: COLORS.danger, fontWeight: "bold" }}>
            {item.quantity} {item.unit}
          </Text>{" "}
          (Min: {item.min_threshold})
        </Text>
      </View>
      <Pressable style={styles.restockBtn} onPress={handleRestock}>
        <Text style={styles.restockText}>Nhập</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingTop: 50, paddingBottom: 24 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>⚠️ Cảnh báo sắp hết</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Custom Tabs */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[
                styles.tab,
                activeTab === "ingredients" && styles.activeTab,
              ]}
              onPress={() => setActiveTab("ingredients")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "ingredients" && styles.activeTabText,
                ]}
              >
                Nguyên liệu ({data.ingredients.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === "supplies" && styles.activeTab]}
              onPress={() => setActiveTab("supplies")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "supplies" && styles.activeTabText,
                ]}
              >
                Vật dụng ({data.supplies.length})
              </Text>
            </Pressable>
          </View>

          {/* List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={COLORS.primary} size="large" />
            </View>
          ) : (
            <FlatList
              data={listData}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {activeTab === "ingredients"
                    ? "Không có nguyên liệu nào cần nhập"
                    : "Không có vật dụng nào cần nhập"}
                </Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: COLORS.surface,
    height: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: "bold",
  },
  closeBtn: {
    padding: 4,
  },

  // Tab Styles
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: COLORS.surfaceLighter,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  activeTabText: {
    color: COLORS.textPrimary,
  },

  // Item Styles
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceLight,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  itemName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  itemDetail: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  restockBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  restockText: {
    color: COLORS.textPrimary,
    fontWeight: "bold",
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
