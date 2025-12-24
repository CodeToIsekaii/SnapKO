/**
 * StockReviewList - Review AI-parsed stock items
 * Per .antigravityrules Section D.3 (COMPLEX LOGIC!)
 *
 * CRITICAL RULES:
 * - STORAGE (Warehouse): PARTIAL CHECK - Items NOT in photo remain unchanged
 * - SERVICE (Bar): FULL CHECK - Missing items trigger warning
 *
 * Visual cues per .UXUIrules:
 * - Side border pattern for variance status
 * - needs_review items highlighted
 * - Force evidence photo for high variance
 */

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VarianceAlertModal } from "./VarianceAlertModal";

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

interface StockItem {
  ingredient_id?: string;
  ingredient_name: string;
  actual_qty: number;
  theoretical_qty: number;
  variance: number;
  variance_percentage: number;
  unit?: string;
  confidence: number;
  needs_review: boolean;
  requires_evidence: boolean;
  variance_reason?: string;
  evidence_photo_url?: string;
  notes?: string;
}

interface StockReviewListProps {
  items: StockItem[];
  isPartialCheck: boolean;
  areaName: string;
  missingItems?: { id: string; name: string }[];
  onUpdateQuantity: (index: number, qty: number) => void;
  onSetVarianceReason: (
    index: number,
    reason: string,
    evidenceUrl?: string,
    notes?: string
  ) => void;
}

export function StockReviewList({
  items,
  isPartialCheck,
  areaName,
  missingItems = [],
  onUpdateQuantity,
  onSetVarianceReason,
}: StockReviewListProps) {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(
    null
  );

  const getVarianceColor = (percentage: number): string => {
    if (Math.abs(percentage) <= 5) return COLORS.success;
    if (Math.abs(percentage) <= 15) return COLORS.warning;
    return COLORS.error;
  };

  const getVarianceIcon = (variance: number): string => {
    if (variance > 0) return "arrow-up";
    if (variance < 0) return "arrow-down";
    return "checkmark";
  };

  const renderItem = ({ item, index }: { item: StockItem; index: number }) => {
    const varianceColor = getVarianceColor(item.variance_percentage);
    const needsAttention = item.needs_review || item.requires_evidence;

    return (
      <View
        style={[
          styles.itemCard,
          { borderLeftColor: varianceColor },
          needsAttention && styles.itemCardAttention,
        ]}
      >
        {/* Header row */}
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.ingredient_name}</Text>
            {item.needs_review && (
              <View style={styles.reviewBadge}>
                <Ionicons name="eye" size={12} color={COLORS.warning} />
                <Text style={styles.reviewBadgeText}>Cần xác nhận</Text>
              </View>
            )}
          </View>
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceText}>{item.confidence}%</Text>
          </View>
        </View>

        {/* Quantity comparison */}
        <View style={styles.quantityRow}>
          <View style={styles.quantityCol}>
            <Text style={styles.quantityLabel}>Lý thuyết</Text>
            <Text style={styles.quantityValue}>
              {item.theoretical_qty.toFixed(1)} {item.unit}
            </Text>
          </View>

          <Ionicons
            name="arrow-forward"
            size={16}
            color={COLORS.textSecondary}
          />

          <View style={styles.quantityCol}>
            <Text style={styles.quantityLabel}>Thực tế</Text>
            <View style={styles.editableQuantity}>
              <TextInput
                style={styles.quantityInput}
                value={item.actual_qty.toString()}
                onChangeText={(text) => {
                  const num = parseFloat(text) || 0;
                  onUpdateQuantity(index, num);
                }}
                keyboardType="decimal-pad"
              />
              <Text style={styles.unitText}>{item.unit}</Text>
            </View>
          </View>
        </View>

        {/* Variance indicator */}
        <View
          style={[
            styles.varianceBar,
            { backgroundColor: varianceColor + "20" },
          ]}
        >
          <Ionicons
            name={getVarianceIcon(item.variance) as any}
            size={16}
            color={varianceColor}
          />
          <Text style={[styles.varianceText, { color: varianceColor }]}>
            {item.variance >= 0 ? "+" : ""}
            {item.variance.toFixed(1)} ({item.variance_percentage.toFixed(1)}%)
          </Text>

          {/* Requires evidence indicator */}
          {item.requires_evidence && (
            <TouchableOpacity
              style={[
                styles.evidenceButton,
                item.variance_reason
                  ? styles.evidenceButtonDone
                  : styles.evidenceButtonRequired,
              ]}
              onPress={() => setSelectedItemIndex(index)}
            >
              <Ionicons
                name={item.variance_reason ? "checkmark-circle" : "camera"}
                size={16}
                color={item.variance_reason ? COLORS.success : COLORS.error}
              />
              <Text
                style={[
                  styles.evidenceButtonText,
                  {
                    color: item.variance_reason ? COLORS.success : COLORS.error,
                  },
                ]}
              >
                {item.variance_reason ? "Đã giải trình" : "Cần giải trình"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderMissingItem = ({
    item,
  }: {
    item: { id: string; name: string };
  }) => (
    <View style={styles.missingItem}>
      <Ionicons name="alert-circle" size={20} color={COLORS.error} />
      <Text style={styles.missingItemText}>
        Thiếu: <Text style={styles.missingItemName}>{item.name}</Text>
      </Text>
    </View>
  );

  const selectedItem =
    selectedItemIndex !== null ? items[selectedItemIndex] : null;

  return (
    <View style={styles.container}>
      {/* Header with check type info */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Kiểm {areaName}</Text>
          <View
            style={[
              styles.checkTypeBadge,
              isPartialCheck ? styles.checkTypePartial : styles.checkTypeFull,
            ]}
          >
            <Text style={styles.checkTypeText}>
              {isPartialCheck ? "Kiểm một phần" : "Kiểm toàn bộ"}
            </Text>
          </View>
        </View>
        <Text style={styles.itemCount}>{items.length} mặt hàng</Text>
      </View>

      {/* Check type explanation */}
      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle"
          size={18}
          color={isPartialCheck ? COLORS.primary : COLORS.warning}
        />
        <Text style={styles.infoText}>
          {isPartialCheck
            ? "Các mặt hàng không có trong ảnh sẽ giữ nguyên số liệu cũ."
            : "Mọi mặt hàng phải được kiểm. Nếu thiếu sẽ có cảnh báo."}
        </Text>
      </View>

      {/* Missing items warning (for Full check) */}
      {!isPartialCheck && missingItems.length > 0 && (
        <View style={styles.missingSection}>
          <Text style={styles.missingSectionTitle}>
            <Ionicons name="warning" size={16} color={COLORS.error} /> Thiếu
            trong ảnh:
          </Text>
          <FlatList
            data={missingItems}
            renderItem={renderMissingItem}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      {/* Items list */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.ingredient_id || `item-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Variance Alert Modal */}
      {selectedItem && selectedItemIndex !== null && (
        <VarianceAlertModal
          visible={true}
          ingredientName={selectedItem.ingredient_name}
          theoreticalQty={selectedItem.theoretical_qty}
          actualQty={selectedItem.actual_qty}
          unit={selectedItem.unit || ""}
          variancePercentage={selectedItem.variance_percentage}
          onConfirm={(data) => {
            onSetVarianceReason(
              selectedItemIndex,
              data.reason,
              data.evidencePhotoUrl,
              data.notes
            );
            setSelectedItemIndex(null);
          }}
          onCancel={() => setSelectedItemIndex(null)}
        />
      )}
    </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  checkTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  checkTypePartial: {
    backgroundColor: COLORS.primary + "20",
  },
  checkTypeFull: {
    backgroundColor: COLORS.warning + "20",
  },
  checkTypeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  itemCount: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  missingSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: COLORS.error + "15",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error + "40",
  },
  missingSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.error,
    marginBottom: 8,
  },
  missingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  missingItemText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  missingItemName: {
    color: COLORS.textPrimary,
    fontWeight: "600",
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
  itemCardAttention: {
    borderWidth: 1,
    borderColor: COLORS.warning + "60",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  reviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewBadgeText: {
    fontSize: 11,
    color: COLORS.warning,
  },
  confidenceBadge: {
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  quantityCol: {
    flex: 1,
    alignItems: "center",
  },
  quantityLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  quantityValue: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  editableQuantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quantityInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    minWidth: 60,
    textAlign: "center",
  },
  unitText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  varianceBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  varianceText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  evidenceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  evidenceButtonRequired: {
    backgroundColor: COLORS.error + "20",
  },
  evidenceButtonDone: {
    backgroundColor: COLORS.success + "20",
  },
  evidenceButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
