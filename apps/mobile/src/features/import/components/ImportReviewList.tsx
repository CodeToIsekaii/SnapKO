/**
 * ImportReviewList - Review AI-parsed invoice items
 * Per .antigravityrules Section D.1
 *
 * Features:
 * - Edit AI-detected items (name, qty, price)
 * - Match/unmatch to existing ingredients
 * - Add new items manually
 * - Calculate totals
 */

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
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

interface ImportItem {
  ingredient_id?: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: number;
  user_confirmed?: boolean;
}

interface ImportReviewListProps {
  items: ImportItem[];
  invoiceNumber?: string;
  supplierName?: string;
  totalAmount?: number;
  confidence: number;
  onUpdateItem: (index: number, updates: Partial<ImportItem>) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: (item: ImportItem) => void;
  inventoryModel?: "SIMPLE" | "STANDARD" | "CHAIN";
  targetAreaId?: string;
  onTargetAreaChange?: (areaId: string) => void;
}

export function ImportReviewList({
  items,
  invoiceNumber,
  supplierName,
  totalAmount,
  confidence,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  inventoryModel = "SIMPLE",
  targetAreaId,
  onTargetAreaChange,
}: ImportReviewListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const calculatedTotal = items.reduce(
    (sum, item) => sum + item.total_price,
    0
  );
  const hasMatched = items.filter((i) => i.ingredient_id).length;
  const hasUnmatched = items.length - hasMatched;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    })
      .format(amount)
      .replace("₫", "đ");
  };

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 90) return COLORS.success;
    if (conf >= 70) return COLORS.warning;
    return COLORS.error;
  };

  const renderItem = ({ item, index }: { item: ImportItem; index: number }) => {
    const isEditing = editingIndex === index;
    const isMatched = !!item.ingredient_id;

    return (
      <View
        style={[
          styles.itemCard,
          isMatched ? styles.itemCardMatched : styles.itemCardUnmatched,
        ]}
      >
        {/* Header */}
        <View style={styles.itemHeader}>
          <View style={styles.matchBadge}>
            <Ionicons
              name={isMatched ? "checkmark-circle" : "help-circle"}
              size={14}
              color={isMatched ? COLORS.success : COLORS.warning}
            />
            <Text
              style={[
                styles.matchBadgeText,
                { color: isMatched ? COLORS.success : COLORS.warning },
              ]}
            >
              {isMatched ? "Đã khớp" : "Chưa khớp"}
            </Text>
          </View>

          <View style={styles.itemActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setEditingIndex(isEditing ? null : index)}
            >
              <Ionicons
                name={isEditing ? "checkmark" : "pencil"}
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onRemoveItem(index)}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Item name */}
        {isEditing ? (
          <TextInput
            style={styles.nameInput}
            value={item.ingredient_name}
            onChangeText={(text) =>
              onUpdateItem(index, { ingredient_name: text })
            }
            placeholder="Tên nguyên liệu"
            placeholderTextColor={COLORS.textSecondary}
          />
        ) : (
          <Text style={styles.itemName}>{item.ingredient_name}</Text>
        )}

        {/* Quantity, Price, Total row */}
        <View style={styles.detailsRow}>
          {/* Quantity */}
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Số lượng</Text>
            {isEditing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.smallInput}
                  value={item.quantity.toString()}
                  onChangeText={(text) => {
                    const qty = parseFloat(text) || 0;
                    onUpdateItem(index, {
                      quantity: qty,
                      total_price: qty * item.unit_price,
                    });
                  }}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.smallInput, styles.unitInput]}
                  value={item.unit}
                  onChangeText={(text) => onUpdateItem(index, { unit: text })}
                  placeholder="Đơn vị"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            ) : (
              <Text style={styles.detailValue}>
                {item.quantity} {item.unit}
              </Text>
            )}
          </View>

          {/* Unit Price */}
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Đơn giá</Text>
            {isEditing ? (
              <TextInput
                style={styles.smallInput}
                value={item.unit_price.toString()}
                onChangeText={(text) => {
                  const price = parseFloat(text) || 0;
                  onUpdateItem(index, {
                    unit_price: price,
                    total_price: item.quantity * price,
                  });
                }}
                keyboardType="numeric"
              />
            ) : (
              <Text style={styles.detailValue}>
                {formatCurrency(item.unit_price)}
              </Text>
            )}
          </View>

          {/* Total */}
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Thành tiền</Text>
            <Text style={[styles.detailValue, styles.totalValue]}>
              {formatCurrency(item.total_price)}
            </Text>
          </View>
        </View>

        {/* Confidence */}
        <View style={styles.confidenceRow}>
          <Text style={styles.confidenceLabel}>AI tin cậy:</Text>
          <View
            style={[
              styles.confidenceBar,
              { backgroundColor: getConfidenceColor(item.confidence) + "20" },
            ]}
          >
            <View
              style={[
                styles.confidenceFill,
                {
                  width: `${item.confidence}%`,
                  backgroundColor: getConfidenceColor(item.confidence),
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.confidenceValue,
              { color: getConfidenceColor(item.confidence) },
            ]}
          >
            {item.confidence}%
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Invoice Info Header */}
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          {supplierName && (
            <Text style={styles.supplierName}>{supplierName}</Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {invoiceNumber && (
              <Text style={styles.invoiceNumber}>Số: {invoiceNumber}</Text>
            )}
            {inventoryModel !== "SIMPLE" && (
              <View style={styles.standardBadge}>
                <Text style={styles.standardBadgeText}>Standard</Text>
              </View>
            )}
          </View>
        </View>
        <View
          style={[
            styles.confidenceBadge,
            { backgroundColor: getConfidenceColor(confidence) + "20" },
          ]}
        >
          <Ionicons
            name="sparkles"
            size={14}
            color={getConfidenceColor(confidence)}
          />
          <Text
            style={[
              styles.confidenceBadgeText,
              { color: getConfidenceColor(confidence) },
            ]}
          >
            {confidence}%
          </Text>
        </View>
      </View>

      {/* Target Area Selector (dual warehouse models only) */}
      {inventoryModel !== "SIMPLE" && (
        <View style={styles.areaSelectorContainer}>
          <Text style={styles.areaSelectorLabel}>Nhập hàng vào:</Text>
          <View style={styles.areaOptions}>
            <TouchableOpacity
              style={[
                styles.areaOption,
                (!targetAreaId || targetAreaId.includes("warehouse")) &&
                  styles.areaOptionActive,
              ]}
              onPress={() => onTargetAreaChange?.("warehouse_default")}
            >
              <Text
                style={[
                  styles.areaOptionText,
                  (!targetAreaId || targetAreaId.includes("warehouse")) &&
                    styles.areaOptionTextActive,
                ]}
              >
                🏭 Kho Tổng
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.areaOption,
                targetAreaId?.includes("bar") && styles.areaOptionActive,
              ]}
              onPress={() => onTargetAreaChange?.("bar_default")}
            >
              <Text
                style={[
                  styles.areaOptionText,
                  targetAreaId?.includes("bar") && styles.areaOptionTextActive,
                ]}
              >
                🍷 Quầy Bar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Match summary */}
      <View style={styles.matchSummary}>
        <View style={styles.matchStat}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
          <Text style={styles.matchStatText}>{hasMatched} đã khớp</Text>
        </View>
        {hasUnmatched > 0 && (
          <View style={styles.matchStat}>
            <Ionicons name="help-circle" size={16} color={COLORS.warning} />
            <Text style={[styles.matchStatText, { color: COLORS.warning }]}>
              {hasUnmatched} cần xác nhận
            </Text>
          </View>
        )}
      </View>

      {/* Items list */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(_, index) => `import-item-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() =>
              onAddItem({
                ingredient_name: "Nguyên liệu mới",
                quantity: 1,
                unit: "kg",
                unit_price: 0,
                total_price: 0,
                confidence: 100,
                user_confirmed: true,
              })
            }
          >
            <Ionicons name="add-circle" size={20} color={COLORS.primary} />
            <Text style={styles.addButtonText}>Thêm mặt hàng</Text>
          </TouchableOpacity>
        }
      />

      {/* Total footer */}
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tổng cộng</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(calculatedTotal)}
          </Text>
        </View>
        {totalAmount && calculatedTotal !== totalAmount && (
          <View style={styles.discrepancyRow}>
            <Ionicons name="warning" size={14} color={COLORS.warning} />
            <Text style={styles.discrepancyText}>
              Chênh lệch với hóa đơn:{" "}
              {formatCurrency(calculatedTotal - totalAmount)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  invoiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  invoiceInfo: {
    gap: 4,
  },
  supplierName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  invoiceNumber: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  confidenceBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  matchSummary: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  matchStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  matchStatText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  itemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  itemCardMatched: {
    borderLeftColor: COLORS.success,
  },
  itemCardUnmatched: {
    borderLeftColor: COLORS.warning,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  nameInput: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailCol: {
    flex: 1,
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  totalValue: {
    fontWeight: "600",
    color: COLORS.primary,
  },
  editRow: {
    flexDirection: "row",
    gap: 6,
  },
  smallInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    color: COLORS.textPrimary,
    minWidth: 50,
    textAlign: "center",
  },
  unitInput: {
    minWidth: 40,
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  confidenceBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  confidenceFill: {
    height: "100%",
    borderRadius: 3,
  },
  confidenceValue: {
    fontSize: 11,
    fontWeight: "600",
    minWidth: 32,
    textAlign: "right",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "500",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.primary,
  },
  discrepancyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  discrepancyText: {
    fontSize: 12,
    color: COLORS.warning,
  },
  standardBadge: {
    backgroundColor: COLORS.primary + "30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  standardBadgeText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  areaSelectorContainer: {
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  areaSelectorLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  areaOptions: {
    flexDirection: "row",
    gap: 12,
  },
  areaOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  areaOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  areaOptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  areaOptionTextActive: {
    color: COLORS.primary,
  },
});
