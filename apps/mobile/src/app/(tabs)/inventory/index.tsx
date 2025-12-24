/**
 * Inventory Tab - Main inventory management screen
 * Per .antigravityrules Section C: Multi-Location Model
 *
 * Features:
 * - AreaSelector (Kho Tổng vs Quầy Bar)
 * - Stock levels by area
 * - Low stock alerts
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  success: "#6B8E23",
  warning: "#FFC857",
  error: "#E63946",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
};

// Storage area types per .antigravityrules
interface StorageArea {
  id: string;
  name: string;
  type: "STORAGE" | "SERVICE";
}

interface StockItem {
  id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  min_threshold: number;
  average_unit_cost: number;
}

export default function InventoryScreen() {
  const router = useRouter();
  const [selectedArea, setSelectedArea] = useState<StorageArea | null>(null);
  const [areas, setAreas] = useState<StorageArea[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // TODO: Load from local SQLite
      // Simulated data for now
      const mockAreas: StorageArea[] = [
        { id: "1", name: "Kho Tổng", type: "STORAGE" },
        { id: "2", name: "Quầy Bar", type: "SERVICE" },
      ];
      setAreas(mockAreas);
      setSelectedArea(mockAreas[0]);

      // Simulated stock items
      setStockItems([]);
    } catch (error) {
      console.error("Error loading inventory:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAreaChange = (area: StorageArea) => {
    setSelectedArea(area);
    // TODO: Reload stock items for this area
  };

  const isLowStock = (item: StockItem) => item.quantity < item.min_threshold;

  const renderStockItem = ({ item }: { item: StockItem }) => {
    const lowStock = isLowStock(item);

    return (
      <View
        style={[
          styles.stockItem,
          // Per .UXUIrules: Side border pattern for status
          lowStock && styles.stockItemLowStock,
        ]}
      >
        <View style={styles.stockItemContent}>
          <Text style={styles.stockItemName}>{item.name}</Text>
          <Text style={styles.stockItemUnit}>{item.unit}</Text>
        </View>
        <View style={styles.stockItemRight}>
          <Text
            style={[styles.stockItemQty, lowStock && styles.stockItemQtyLow]}
          >
            {item.quantity}
          </Text>
          {lowStock && (
            <Ionicons name="warning" size={16} color={COLORS.error} />
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tồn kho</Text>
        <TouchableOpacity
          style={styles.snapButton}
          onPress={() => router.push("/camera/stock")}
        >
          <Ionicons name="camera" size={20} color="#FFF" />
          <Text style={styles.snapButtonText}>Kiểm kho</Text>
        </TouchableOpacity>
      </View>

      {/* Area Selector - Per .antigravityrules Section C.2 */}
      <View style={styles.areaSelector}>
        {areas.map((area) => (
          <TouchableOpacity
            key={area.id}
            style={[
              styles.areaTab,
              selectedArea?.id === area.id && styles.areaTabActive,
            ]}
            onPress={() => handleAreaChange(area)}
          >
            <Ionicons
              name={area.type === "STORAGE" ? "cube" : "wine"}
              size={18}
              color={
                selectedArea?.id === area.id
                  ? COLORS.primary
                  : COLORS.textSecondary
              }
            />
            <Text
              style={[
                styles.areaTabText,
                selectedArea?.id === area.id && styles.areaTabTextActive,
              ]}
            >
              {area.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stock List */}
      <FlatList
        data={stockItems}
        renderItem={renderStockItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="cube-outline"
              size={64}
              color={COLORS.textSecondary}
            />
            <Text style={styles.emptyText}>Chưa có nguyên liệu</Text>
            <Text style={styles.emptySubtext}>
              Hãy chụp hóa đơn nhập hàng để bắt đầu
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push("/camera/import")}
            >
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.addButtonText}>Nhập hàng</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  snapButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  snapButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  // Area Selector - Per .antigravityrules
  areaSelector: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  areaTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  areaTabActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  areaTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  areaTabTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    padding: 20,
    gap: 12,
  },
  stockItem: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    // Per .UXUIrules: Side border pattern
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  stockItemLowStock: {
    borderLeftColor: COLORS.error,
  },
  stockItemContent: {
    flex: 1,
  },
  stockItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  stockItemUnit: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  stockItemRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  stockItemQty: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  stockItemQtyLow: {
    color: COLORS.error,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
