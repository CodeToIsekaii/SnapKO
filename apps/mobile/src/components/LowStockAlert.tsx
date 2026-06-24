/**
 * LowStockAlert Component
 * Widget that shows on Dashboard when items are low
 * Opens LowStockModal with 2 tabs: Nguyên liệu / Vật dụng
 */

import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLowStock } from "../hooks/useLowStock";
import { LowStockModal } from "./LowStockModal";

// Colors per .UXUIrules
const COLORS = {
  background: "#121212",
  surface: "#27272A",
  danger: "#EF4444",
  textPrimary: "#FFFFFF",
  textSecondary: "#D4D4D8",
  textMuted: "#71717A",
};

export function LowStockAlert({ onRestock }: { onRestock: () => void }) {
  const { ingredients, supplies, totalCount, isLoading } = useLowStock();
  const [modalVisible, setModalVisible] = useState(false);

  // Don't render if loading or no low stock items
  if (isLoading || totalCount === 0) {
    return null;
  }

  return (
    <>
      <Pressable style={styles.container} onPress={() => setModalVisible(true)}>
        <View style={styles.iconBox}>
          <Ionicons name="alert-circle" size={24} color={COLORS.danger} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>⚠️ Cảnh báo tồn kho</Text>
          <Text style={styles.summary}>
            <Text style={styles.highlight}>
              {ingredients.length} nguyên liệu
            </Text>
            {" | "}
            <Text style={styles.highlight}>{supplies.length} vật dụng</Text>
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </Pressable>

      {/* Modal */}
      <LowStockModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        data={{ ingredients, supplies }}
        isLoading={isLoading}
        onRestock={onRestock}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.danger,
  },
  iconBox: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 2,
  },
  summary: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  highlight: {
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
});
