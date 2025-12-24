/**
 * AreaSelector Component
 * Per .antigravityrules Section C.2: Model B (STANDARD)
 *
 * Allows user to select between storage areas:
 * - STORAGE (Kho Tổng) - for warehouse check
 * - SERVICE (Quầy Bar) - for bar/shift check
 */

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  success: "#6B8E23",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
};

interface StorageArea {
  id: string;
  name: string;
  type: "STORAGE" | "SERVICE";
  isDefault?: boolean;
}

interface AreaSelectorProps {
  areas: StorageArea[];
  selectedArea: StorageArea | null;
  onSelect: (area: StorageArea) => void;
  showStock?: boolean; // Show stock counts
  stockByArea?: Record<string, number>; // area_id -> total items
}

export function AreaSelector({
  areas,
  selectedArea,
  onSelect,
  showStock = false,
  stockByArea = {},
}: AreaSelectorProps) {
  const getAreaIcon = (type: "STORAGE" | "SERVICE") => {
    return type === "STORAGE" ? "cube" : "wine";
  };

  const getAreaHint = (type: "STORAGE" | "SERVICE") => {
    // Per .antigravityrules Section D.3
    if (type === "STORAGE") {
      return "Kiểm kho (Partial Check)";
    }
    return "Kiểm quầy (Full Check)";
  };

  return (
    <View style={styles.container}>
      {areas.map((area) => {
        const isSelected = selectedArea?.id === area.id;
        const stockCount = stockByArea[area.id] || 0;

        return (
          <TouchableOpacity
            key={area.id}
            style={[styles.areaCard, isSelected && styles.areaCardSelected]}
            onPress={() => onSelect(area)}
            activeOpacity={0.7}
          >
            {/* Icon */}
            <View
              style={[
                styles.iconContainer,
                isSelected && styles.iconContainerSelected,
              ]}
            >
              <Ionicons
                name={getAreaIcon(area.type) as any}
                size={28}
                color={isSelected ? COLORS.primary : COLORS.textSecondary}
              />
            </View>

            {/* Text */}
            <View style={styles.textContainer}>
              <Text
                style={[styles.areaName, isSelected && styles.areaNameSelected]}
              >
                {area.name}
              </Text>
              <Text style={styles.areaHint}>{getAreaHint(area.type)}</Text>
            </View>

            {/* Stock count or checkmark */}
            {isSelected ? (
              <View style={styles.checkmark}>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={COLORS.primary}
                />
              </View>
            ) : showStock ? (
              <View style={styles.stockBadge}>
                <Text style={styles.stockCount}>{stockCount}</Text>
                <Text style={styles.stockLabel}>mặt hàng</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  areaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  areaCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  iconContainerSelected: {
    backgroundColor: COLORS.primary + "20",
  },
  textContainer: {
    flex: 1,
  },
  areaName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  areaNameSelected: {
    color: COLORS.primary,
  },
  areaHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  checkmark: {
    marginLeft: 8,
  },
  stockBadge: {
    alignItems: "center",
    marginLeft: 8,
  },
  stockCount: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  stockLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
