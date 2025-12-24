/**
 * SalesReviewList - Review AI-parsed sales items and deductions
 * Per .antigravityrules Section D.2
 *
 * Shows:
 * - Menu items sold (from POS)
 * - Ingredient deductions (calculated from recipes)
 * - Revenue summary
 */

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Colors per .UXUIrules
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  surfaceElevated: "#242424",
  primary: "#E07A2F",
  success: "#6B8E23",
  warning: "#FFC857",
  error: "#E63946",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
};

interface SoldItem {
  menu_item_name: string;
  recipe_id?: string;
  quantity_sold: number;
  unit_price?: number;
  total_revenue?: number;
  confidence: number;
}

interface DeductedItem {
  ingredient_id: string;
  ingredient_name: string;
  deducted_qty: number;
  unit: string;
  unit_cost?: number;
}

interface SalesReviewListProps {
  reportDate?: string;
  shift?: string;
  totalRevenue?: number;
  itemsSold: SoldItem[];
  itemsDeducted: DeductedItem[];
  confidence: number;
  onUpdateSoldItem: (index: number, updates: Partial<SoldItem>) => void;
  onRemoveSoldItem: (index: number) => void;
}

export function SalesReviewList({
  reportDate,
  shift,
  totalRevenue,
  itemsSold,
  itemsDeducted,
  confidence,
  onUpdateSoldItem,
  onRemoveSoldItem,
}: SalesReviewListProps) {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    })
      .format(amount)
      .replace("₫", "đ");
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const getShiftLabel = (shiftCode?: string): string => {
    switch (shiftCode) {
      case "morning":
        return "Sáng";
      case "afternoon":
        return "Chiều";
      case "evening":
        return "Tối";
      case "full_day":
        return "Cả ngày";
      default:
        return shiftCode || "";
    }
  };

  const hasRecipe = itemsSold.filter((i) => i.recipe_id).length;
  const noRecipe = itemsSold.length - hasRecipe;

  const totalDeductionCost = itemsDeducted.reduce(
    (sum, item) => sum + (item.unit_cost || 0) * item.deducted_qty,
    0
  );

  const renderSoldItem = ({
    item,
    index,
  }: {
    item: SoldItem;
    index: number;
  }) => {
    const hasMatch = !!item.recipe_id;

    return (
      <View
        style={[
          styles.soldCard,
          hasMatch ? styles.soldCardMatched : styles.soldCardUnmatched,
        ]}
      >
        <View style={styles.soldHeader}>
          <Text style={styles.soldName}>{item.menu_item_name}</Text>
          <TouchableOpacity onPress={() => onRemoveSoldItem(index)}>
            <Ionicons
              name="close-circle"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.soldDetails}>
          <View style={styles.soldStat}>
            <Text style={styles.soldStatValue}>{item.quantity_sold}</Text>
            <Text style={styles.soldStatLabel}>Đã bán</Text>
          </View>

          {item.total_revenue !== undefined && (
            <View style={styles.soldStat}>
              <Text style={styles.soldStatValue}>
                {formatCurrency(item.total_revenue)}
              </Text>
              <Text style={styles.soldStatLabel}>Doanh thu</Text>
            </View>
          )}

          <View
            style={[
              styles.matchIndicator,
              hasMatch && styles.matchIndicatorActive,
            ]}
          >
            <Ionicons
              name={hasMatch ? "link" : "unlink"}
              size={14}
              color={hasMatch ? COLORS.success : COLORS.warning}
            />
            <Text
              style={[
                styles.matchIndicatorText,
                { color: hasMatch ? COLORS.success : COLORS.warning },
              ]}
            >
              {hasMatch ? "Có công thức" : "Thiếu công thức"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDeductedItem = ({ item }: { item: DeductedItem }) => (
    <View style={styles.deductedCard}>
      <View style={styles.deductedInfo}>
        <Text style={styles.deductedName}>{item.ingredient_name}</Text>
        <Text style={styles.deductedUnit}>{item.unit}</Text>
      </View>
      <View style={styles.deductedQty}>
        <Ionicons name="arrow-down" size={14} color={COLORS.error} />
        <Text style={styles.deductedQtyValue}>
          {item.deducted_qty.toFixed(2)}
        </Text>
      </View>
      {item.unit_cost !== undefined && (
        <Text style={styles.deductedCost}>
          {formatCurrency(item.unit_cost * item.deducted_qty)}
        </Text>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Report Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Báo cáo bán hàng</Text>
          <Text style={styles.headerDate}>
            {formatDate(reportDate)} {shift && `• Ca ${getShiftLabel(shift)}`}
          </Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Ionicons name="sparkles" size={14} color={COLORS.primary} />
          <Text style={styles.confidenceText}>{confidence}%</Text>
        </View>
      </View>

      {/* Revenue Summary */}
      {totalRevenue !== undefined && (
        <View style={styles.revenueCard}>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>Doanh thu</Text>
            <Text style={styles.revenueValue}>
              {formatCurrency(totalRevenue)}
            </Text>
          </View>
          <View style={styles.revenueRow}>
            <Text style={styles.revenueLabel}>Chi phí nguyên liệu</Text>
            <Text style={[styles.revenueValue, styles.costValue]}>
              -{formatCurrency(totalDeductionCost)}
            </Text>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueRow}>
            <Text style={styles.profitLabel}>Lợi nhuận gộp</Text>
            <Text style={styles.profitValue}>
              {formatCurrency(totalRevenue - totalDeductionCost)}
            </Text>
          </View>
        </View>
      )}

      {/* Sold Items Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Món đã bán</Text>
          <View style={styles.sectionStats}>
            <Text style={styles.sectionStat}>{itemsSold.length} món</Text>
            {noRecipe > 0 && (
              <View style={styles.warningBadge}>
                <Ionicons name="warning" size={12} color={COLORS.warning} />
                <Text style={styles.warningText}>
                  {noRecipe} thiếu công thức
                </Text>
              </View>
            )}
          </View>
        </View>

        {itemsSold.map((item, index) => (
          <View key={`sold-${index}`}>{renderSoldItem({ item, index })}</View>
        ))}
      </View>

      {/* Deducted Items Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Nguyên liệu trừ kho</Text>
          <Text style={styles.sectionStat}>
            {itemsDeducted.length} mặt hàng
          </Text>
        </View>

        <View style={styles.deductedList}>
          {itemsDeducted.length > 0 ? (
            itemsDeducted.map((item, index) => (
              <View key={item.ingredient_id || `ded-${index}`}>
                {renderDeductedItem({ item })}
              </View>
            ))
          ) : (
            <View style={styles.emptyDeducted}>
              <Ionicons
                name="information-circle"
                size={20}
                color={COLORS.textSecondary}
              />
              <Text style={styles.emptyDeductedText}>
                Không có nguyên liệu để trừ (thiếu công thức)
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={18} color={COLORS.primary} />
        <Text style={styles.infoText}>
          Nguyên liệu sẽ được trừ từ{" "}
          <Text style={styles.infoBold}>Quầy Bar</Text> (SERVICE area) theo công
          thức đã thiết lập.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  headerDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  revenueCard: {
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  revenueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  revenueLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  revenueValue: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  costValue: {
    color: COLORS.error,
  },
  revenueDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  profitLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  profitValue: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.success,
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  sectionStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionStat: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.warning + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 11,
    color: COLORS.warning,
  },
  soldCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  soldCardMatched: {
    borderLeftColor: COLORS.success,
  },
  soldCardUnmatched: {
    borderLeftColor: COLORS.warning,
  },
  soldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  soldName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    flex: 1,
  },
  soldDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  soldStat: {
    alignItems: "center",
  },
  soldStatValue: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  soldStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  matchIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  matchIndicatorActive: {},
  matchIndicatorText: {
    fontSize: 11,
  },
  deductedList: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  deductedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  deductedInfo: {
    flex: 1,
  },
  deductedName: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  deductedUnit: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deductedQty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 16,
  },
  deductedQtyValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.error,
  },
  deductedCost: {
    fontSize: 12,
    color: COLORS.textSecondary,
    minWidth: 70,
    textAlign: "right",
  },
  emptyDeducted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  emptyDeductedText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    margin: 16,
    padding: 14,
    backgroundColor: COLORS.primary + "15",
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: "600",
    color: COLORS.primary,
  },
});
