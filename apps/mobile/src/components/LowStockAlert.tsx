/**
 * LowStockAlert Component
 * Per .antigravityrules: Alert for items below min_threshold
 * Per .UXUIrules: Tomato Red color for danger states
 *
 * Simple card that shows on Dashboard when items are low
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDb } from "../db";

// Colors per .UXUIrules
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  error: "#E63946", // Tomato Red
  warning: "#FFC857",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
};

interface LowStockItem {
  id: string;
  name: string;
  current_qty: number;
  min_threshold: number;
  unit: string;
}

export function LowStockAlert() {
  const router = useRouter();
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkLowStock();
  }, []);

  const checkLowStock = async () => {
    try {
      const db = getDb();
      if (!db) return;

      // Query items where current stock < min_threshold
      // Joins local_stock_levels with local ingredients info
      const items = await db.getAllAsync<LowStockItem>(`
        SELECT 
          i.id,
          i.name,
          COALESCE(SUM(sl.quantity), 0) as current_qty,
          i.min_threshold,
          i.unit
        FROM local_ingredients i
        LEFT JOIN local_stock_levels sl ON sl.ingredient_id = i.id
        WHERE i.min_threshold > 0 
          AND i.is_archived = 0
        GROUP BY i.id
        HAVING current_qty < i.min_threshold
        ORDER BY (current_qty / i.min_threshold) ASC
        LIMIT 5
      `);

      setLowStockItems(items);
    } catch (error) {
      console.error("Failed to check low stock:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render if no low stock items
  if (isLoading || lowStockItems.length === 0) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push("/(tabs)/inventory")}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={24} color={COLORS.error} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>⚠️ Cảnh báo tồn kho thấp</Text>
          <Text style={styles.subtitle}>
            {lowStockItems.length} nguyên liệu cần nhập thêm
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={COLORS.textSecondary}
        />
      </View>

      <View style={styles.itemsList}>
        {lowStockItems.slice(0, 3).map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.itemQty}>
              <Text style={styles.currentQty}>{item.current_qty}</Text>
              <Text style={styles.threshold}>
                /{item.min_threshold} {item.unit}
              </Text>
            </Text>
          </View>
        ))}

        {lowStockItems.length > 3 && (
          <Text style={styles.moreText}>
            +{lowStockItems.length - 3} nguyên liệu khác
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: `${COLORS.error}15`,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: `${COLORS.error}40`,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${COLORS.error}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: "600",
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  itemsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: `${COLORS.error}20`,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  itemName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  itemQty: {
    fontSize: 14,
  },
  currentQty: {
    color: COLORS.error,
    fontWeight: "600",
  },
  threshold: {
    color: COLORS.textSecondary,
  },
  moreText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
});
