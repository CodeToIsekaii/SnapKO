/**
 * ConfirmLogScreen - Edit/Confirm AI parsed inventory items
 * Features:
 * - Confidence color highlighting (Green ≥85%, Yellow/Red <85%)
 * - Edit Name, Qty, Unit, Price
 * - Save to pending_sync_logs (SQLite)
 * - Navigate back on success
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { initLocalDb } from "../db";

// Types
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
  localImagePath: string;
  location: "WAREHOUSE" | "BAR";
  type: "IMPORT" | "TRANSFER" | "AUDIT" | "WASTE" | "LENT";
  onBack: () => void;
  onSuccess: () => void;
}

const CONFIDENCE_THRESHOLD = 85;

/**
 * Get border color based on confidence score
 * Per .UXUIrules: High (≥85%) = Olive Green, Low (<85%) = Tomato Red
 */
function getConfidenceBorderColor(confidence: number): string {
  if (confidence >= 90) return "#6B8E23"; // Olive Green
  if (confidence >= CONFIDENCE_THRESHOLD) return "#DAA520"; // Goldenrod/Mustard
  return "#FF6347"; // Tomato Red
}

export default function ConfirmLogScreen({
  items: initialItems,
  localImagePath,
  location,
  type,
  onBack,
  onSuccess,
}: ConfirmLogScreenProps) {
  const [items, setItems] = useState<ConfirmItem[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  // Initialize DB
  useEffect(() => {
    (async () => {
      const database = await initLocalDb();
      setDb(database);
    })();
  }, []);

  // Update item field
  const updateItem = (
    index: number,
    field: keyof ConfirmItem,
    value: string | number | boolean | null
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Save to pending_sync_logs
  const handleSave = async () => {
    if (!db) {
      Alert.alert("Lỗi", "Database chưa sẵn sàng");
      return;
    }

    if (items.length === 0) {
      Alert.alert("Lỗi", "Không có mục nào để lưu");
      return;
    }

    setSaving(true);

    try {
      const now = new Date().toISOString();
      const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Build AI parsed JSON from items
      const aiParsedJson = JSON.stringify(
        items.map((item) => ({
          name: item.rawName,
          quantity: item.quantity,
          unit: item.unit,
          confidence: item.confidence,
          unitCost: item.unitCost,
        }))
      );

      // Calculate average confidence
      const avgConfidence =
        items.length > 0
          ? Math.round(
              items.reduce((sum, item) => sum + item.confidence, 0) /
                items.length
            )
          : 0;

      // For now, we create one log per capture session
      // Each item could be a separate log, but grouping makes more sense for receipts
      await db.runAsync(
        `INSERT INTO pending_sync_logs 
         (id, ingredient_id, location, type, ai_parsed_quantity, ai_confidence_score,
          final_confirmed_quantity, quantity_change_base, unit_cost_at_time,
          source_photo_urls, local_image_path, ai_parsed_json, staff_note, 
          is_verified, diff_percentage, created_at, synced, sync_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        [
          logId,
          items[0]?.linkedIngredientId ?? null, // Primary ingredient
          location,
          type,
          items.reduce((sum, i) => sum + i.quantity, 0), // Total qty
          avgConfidence,
          items.reduce((sum, i) => sum + i.quantity, 0), // Confirmed = AI
          items.reduce((sum, i) => sum + i.quantity, 0), // Change
          items[0]?.unitCost ?? null,
          "[]", // Will be filled after upload
          localImagePath,
          aiParsedJson,
          null, // staff_note
          1, // is_verified (user confirmed)
          null, // diff_percentage
          now,
        ]
      );

      console.log("[ConfirmLog] Saved log:", logId);
      Alert.alert(
        "Thành công",
        "Đã lưu dữ liệu. Sẽ tự động đồng bộ khi có mạng.",
        [{ text: "OK", onPress: onSuccess }]
      );
    } catch (err: any) {
      console.error("[ConfirmLog] Save error:", err);
      Alert.alert("Lỗi", err.message || "Không thể lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  };

  // Low confidence warning banner
  const lowConfidenceCount = items.filter(
    (i) => i.confidence < CONFIDENCE_THRESHOLD
  ).length;

  return (
    <View className="flex-1 bg-[#1a1a2e]">
      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-[#252542]">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={onBack} className="p-2">
            <Text className="text-white text-lg">← Quay lại</Text>
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold">Xác nhận dữ liệu</Text>
          <View className="w-20" />
        </View>

        {/* Low confidence warning */}
        {lowConfidenceCount > 0 && (
          <View className="mt-3 p-3 bg-[#FF6347]/20 rounded-lg border border-[#FF6347]">
            <Text className="text-[#FF6347] font-medium">
              ⚠️ {lowConfidenceCount} mục có độ tin cậy thấp. Vui lòng kiểm tra
              kỹ!
            </Text>
          </View>
        )}
      </View>

      {/* Items List */}
      <ScrollView className="flex-1 p-4">
        {items.map((item, index) => (
          <View
            key={index}
            className="mb-4 p-4 bg-[#252542] rounded-xl"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: getConfidenceBorderColor(item.confidence),
            }}
          >
            {/* Confidence Badge */}
            <View className="flex-row items-center justify-between mb-3">
              <View
                className="px-2 py-1 rounded"
                style={{
                  backgroundColor:
                    getConfidenceBorderColor(item.confidence) + "30",
                }}
              >
                <Text
                  style={{ color: getConfidenceBorderColor(item.confidence) }}
                  className="text-sm font-medium"
                >
                  {item.confidence}% tin cậy
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeItem(index)}>
                <Text className="text-red-400">✕ Xóa</Text>
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View className="mb-3">
              <Text className="text-gray-400 text-sm mb-1">
                Tên nguyên liệu
              </Text>
              <TextInput
                className="bg-[#1a1a2e] text-white p-3 rounded-lg"
                value={item.rawName}
                onChangeText={(v) => updateItem(index, "rawName", v)}
                placeholder="Tên..."
                placeholderTextColor="#666"
              />
            </View>

            {/* Quantity + Unit Row */}
            <View className="flex-row mb-3">
              <View className="flex-1 mr-2">
                <Text className="text-gray-400 text-sm mb-1">Số lượng</Text>
                <TextInput
                  className="bg-[#1a1a2e] text-white p-3 rounded-lg"
                  value={String(item.quantity)}
                  onChangeText={(v) =>
                    updateItem(index, "quantity", parseFloat(v) || 0)
                  }
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#666"
                />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-gray-400 text-sm mb-1">Đơn vị</Text>
                <TextInput
                  className="bg-[#1a1a2e] text-white p-3 rounded-lg"
                  value={item.unit}
                  onChangeText={(v) => updateItem(index, "unit", v)}
                  placeholder="kg, chai..."
                  placeholderTextColor="#666"
                />
              </View>
            </View>

            {/* Unit Cost */}
            <View>
              <Text className="text-gray-400 text-sm mb-1">Đơn giá (VNĐ)</Text>
              <TextInput
                className="bg-[#1a1a2e] text-white p-3 rounded-lg"
                value={item.unitCost ? String(item.unitCost) : ""}
                onChangeText={(v) =>
                  updateItem(index, "unitCost", v ? parseFloat(v) : null)
                }
                keyboardType="decimal-pad"
                placeholder="Không có"
                placeholderTextColor="#666"
              />
            </View>
          </View>
        ))}

        {items.length === 0 && (
          <View className="p-8 items-center">
            <Text className="text-gray-400 text-lg">
              Không có mục nào. Quay lại chụp ảnh mới?
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      <View className="p-4 bg-[#252542]">
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || items.length === 0}
          className={`p-4 rounded-xl items-center ${
            saving || items.length === 0 ? "bg-[#1A1A1A]" : "bg-[#E07A2F]"
          }`}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-lg font-bold">
              💾 Lưu ({items.length} mục)
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
