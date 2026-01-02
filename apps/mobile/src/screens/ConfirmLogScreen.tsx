/**
 * ConfirmLogScreen - Safety Buffer before saving inventory changes
 *
 * Purpose:
 * - Review all items before saving to database
 * - Show cost breakdown for imports
 * - Show mapped ingredient info
 * - Final checkpoint before INSERT to database
 *
 * Flow: InventoryCaptureScreen → ConfirmLogScreen → Database → Dashboard
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { InventoryService } from "../features/inventory/services/inventory.service";

// Type matching AiMappedItem from InventoryCaptureScreen
export interface ConfirmItem {
  rawName: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost: number | null;
  linkedIngredientId: string | null;
  linkedIngredientName: string | null;
  isNewIngredient: boolean;
}

interface ConfirmLogScreenProps {
  items: ConfirmItem[];
  localImagePath?: string;
  location: string; // "WAREHOUSE" | "BAR"
  type: string; // "IMPORT" | "STOCK" | "SALES"
  onBack: () => void;
  onSuccess: () => void;
}

export default function ConfirmLogScreen({
  items,
  localImagePath,
  location,
  type,
  onBack,
  onSuccess,
}: ConfirmLogScreenProps) {
  const [loading, setLoading] = useState(false);
  const [editableItems, setEditableItems] = useState<ConfirmItem[]>(items);

  // Calculate total value
  const getTotalValue = () => {
    return editableItems.reduce((sum, item) => {
      const cost = item.unitCost || 0;
      return sum + item.quantity * cost;
    }, 0);
  };

  // Remove item from list
  const removeItem = (index: number) => {
    setEditableItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Get mode title
  const getModeTitle = () => {
    switch (type) {
      case "IMPORT":
        return "Xác nhận NHẬP HÀNG";
      case "SALES":
        return "Xác nhận BÁN HÀNG";
      case "STOCK":
        return "Xác nhận KIỂM KHO";
      default:
        return "Xác nhận";
    }
  };

  // Get mode color
  const getModeColor = () => {
    switch (type) {
      case "IMPORT":
        return "#22C55E"; // Green
      case "SALES":
        return "#3B82F6"; // Blue
      case "STOCK":
        return "#E07A2F"; // Orange
      default:
        return "#E07A2F";
    }
  };

  // Get location label
  const getLocationLabel = () => {
    return location === "WAREHOUSE" ? "🏭 Kho Tổng" : "🍷 Quầy Bar";
  };

  // Handle confirm
  const handleConfirm = useCallback(async () => {
    if (editableItems.length === 0) {
      Alert.alert("Lỗi", "Không có mục nào để lưu");
      return;
    }

    Alert.alert(
      "Xác nhận lưu?",
      `Bạn sẽ lưu ${editableItems.length} mục vào hệ thống.\nHành động này không thể hoàn tác.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xác nhận",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              // TODO: Implement saving via InventoryService
              // await InventoryService.saveInventoryLog({
              //   items: editableItems,
              //   type,
              //   location,
              //   imagePath: localImagePath,
              // });

              // Simulate save delay
              await new Promise((resolve) => setTimeout(resolve, 500));

              Alert.alert("Thành công", "Đã lưu thay đổi vào hệ thống", [
                { text: "OK", onPress: onSuccess },
              ]);
            } catch (err) {
              console.error("Save error:", err);
              Alert.alert("Lỗi", "Không thể lưu. Vui lòng thử lại.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [editableItems, type, location, localImagePath, onSuccess]);

  const modeColor = getModeColor();

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text style={{ color: modeColor, fontSize: 18, fontWeight: "600" }}>
          {getModeTitle()}
        </Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Items List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      >
        {/* Image Preview */}
        {localImagePath && (
          <View style={{ marginBottom: 16 }}>
            <Image
              source={{ uri: localImagePath }}
              style={{ width: "100%", height: 120, borderRadius: 12 }}
              resizeMode="cover"
            />
            <Text
              style={{
                color: "#64748B",
                fontSize: 11,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              Ảnh đã chụp
            </Text>
          </View>
        )}

        {/* Summary Banner */}
        <View
          style={{
            backgroundColor: modeColor + "20",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: modeColor, fontSize: 14, fontWeight: "600" }}>
            {editableItems.length} mục cần xác nhận
          </Text>
          <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>
            Khu vực: {getLocationLabel()}
          </Text>
          {type === "IMPORT" && (
            <Text
              style={{
                color: "#22C55E",
                fontSize: 14,
                fontWeight: "600",
                marginTop: 8,
              }}
            >
              💰 Tổng giá trị: {getTotalValue().toLocaleString("vi-VN")} đ
            </Text>
          )}
        </View>

        {/* Items */}
        {editableItems.map((item, index) => {
          const confidenceColor =
            item.confidence >= 90
              ? "#6B8E23"
              : item.confidence >= 85
              ? "#FFC857"
              : "#EF4444";

          return (
            <View
              key={index}
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                borderLeftWidth: 4,
                borderLeftColor: item.linkedIngredientId
                  ? "#6B8E23"
                  : item.isNewIngredient
                  ? "#3B82F6"
                  : "#FFC857",
              }}
            >
              {/* Item Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                  >
                    {item.linkedIngredientName || item.rawName}
                  </Text>
                  {item.linkedIngredientName &&
                    item.linkedIngredientName !== item.rawName && (
                      <Text
                        style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}
                      >
                        AI đọc: "{item.rawName}"
                      </Text>
                    )}
                </View>
                <Pressable onPress={() => removeItem(index)}>
                  <Text style={{ color: "#EF4444", fontSize: 14 }}>🗑</Text>
                </Pressable>
              </View>

              {/* Quantity & Cost */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 12,
                }}
              >
                <Text style={{ color: "#94A3B8", fontSize: 14 }}>
                  Số lượng:{" "}
                  <Text style={{ color: "white", fontWeight: "600" }}>
                    {item.quantity} {item.unit}
                  </Text>
                </Text>
                {item.unitCost !== null && (
                  <Text style={{ color: "#94A3B8", fontSize: 14 }}>
                    Đơn giá:{" "}
                    <Text style={{ color: "white" }}>
                      {item.unitCost.toLocaleString("vi-VN")} đ
                    </Text>
                  </Text>
                )}
              </View>

              {/* Total for this item */}
              {type === "IMPORT" && item.unitCost !== null && (
                <Text
                  style={{
                    color: "#22C55E",
                    fontSize: 13,
                    fontWeight: "600",
                    marginTop: 8,
                  }}
                >
                  Thành tiền:{" "}
                  {(item.quantity * item.unitCost).toLocaleString("vi-VN")} đ
                </Text>
              )}

              {/* Confidence badge */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <View
                  style={{
                    backgroundColor: confidenceColor + "20",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      color: confidenceColor,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    AI: {item.confidence}%
                  </Text>
                </View>
                {item.isNewIngredient && (
                  <View
                    style={{
                      backgroundColor: "#3B82F620",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 4,
                      marginLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: "#3B82F6",
                        fontSize: 11,
                        fontWeight: "600",
                      }}
                    >
                      + Mới
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {editableItems.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ color: "#64748B", fontSize: 16 }}>
              Không có mục nào
            </Text>
            <Pressable onPress={onBack} style={{ marginTop: 16 }}>
              <Text style={{ color: "#E07A2F", fontSize: 14 }}>
                ← Quay lại nhập liệu
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      {editableItems.length > 0 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#1A1A1A",
            padding: 16,
            paddingBottom: 32,
            borderTopWidth: 1,
            borderTopColor: "#2A2A2A",
          }}
        >
          <Pressable
            onPress={handleConfirm}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#64748B" : modeColor,
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
            }}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                ✓ Xác nhận & Lưu ({editableItems.length} mục)
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
