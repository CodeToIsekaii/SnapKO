/**
 * QuickOutScreen - Stock disposal/write-off (Vỡ/Hỏng/Mượn/Marketing)
 * FEATURE: Both SIMPLE and STANDARD modes
 * Per .script Section 3.3: Quick Out / Hủy
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getDB } from "../db";

// Reason types for Quick Out per .script
type OutReason = "DAMAGED" | "LOAN" | "MARKETING" | null;

interface OutReasonOption {
  id: OutReason;
  label: string;
  icon: string;
  description: string;
  color: string;
}

const OUT_REASONS: OutReasonOption[] = [
  {
    id: "DAMAGED",
    label: "Vỡ / Hỏng",
    icon: "❌",
    description: "Hàng vỡ, hỏng, hết hạn. Tính vào chi phí hao hụt.",
    color: "#EF4444",
  },
  {
    id: "LOAN",
    label: "Cho Mượn",
    icon: "🤝",
    description: "Hàng xóm mượn. Sẽ nhắc đòi lại ngày mai.",
    color: "#F59E0B",
  },
  {
    id: "MARKETING",
    label: "Mời khách",
    icon: "🎁",
    description: "Mời khách, marketing. Tính vào chi phí quảng cáo.",
    color: "#6B8E23",
  },
];

interface QuickOutScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function QuickOutScreen({
  onBack,
  onSuccess,
}: QuickOutScreenProps) {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(
    new Map()
  );
  const [selectedReason, setSelectedReason] = useState<OutReason>(null);
  const [showReasonModal, setShowReasonModal] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync(
        "SELECT id, name, base_unit, warehouse_qty, bar_qty FROM local_ingredients ORDER BY name ASC"
      );
      setIngredients(rows);
    } catch (err) {
      console.error("Load ingredients failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdateQty = (id: string, qtyStr: string) => {
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      const newMap = new Map(selectedItems);
      newMap.delete(id);
      setSelectedItems(newMap);
    } else {
      const newMap = new Map(selectedItems);
      newMap.set(id, qty);
      setSelectedItems(newMap);
    }
  };

  const handleSubmit = () => {
    if (selectedItems.size === 0) {
      Alert.alert("Chưa chọn món", "Vui lòng nhập số lượng cho ít nhất 1 món.");
      return;
    }
    // Show reason modal
    setShowReasonModal(true);
  };

  const handleConfirmWithReason = async (reason: OutReason) => {
    if (!reason) return;
    setShowReasonModal(false);

    try {
      const db = await getDB();
      const id = Crypto.randomUUID();
      const itemsArr = Array.from(selectedItems.entries()).map(
        ([ingId, qty]) => {
          const ing = ingredients.find((i) => i.id === ingId);
          return {
            ingredient_id: ingId,
            ingredient_name: ing?.name,
            quantity: qty,
            unit: ing?.base_unit,
          };
        }
      );

      // Log the QUICK_OUT transaction
      await db.runAsync(
        `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          "QUICK_OUT",
          "mobile",
          JSON.stringify({
            items: itemsArr,
            reason: reason,
            reason_label: OUT_REASONS.find((r) => r.id === reason)?.label,
            notes: `Xuất Khác - ${
              OUT_REASONS.find((r) => r.id === reason)?.label
            }`,
          }),
          new Date().toISOString(),
          0,
        ]
      );

      // Deduct from stock immediately
      for (const [ingId, qty] of selectedItems.entries()) {
        // Deduct from bar first, then warehouse
        await db.runAsync(
          `UPDATE local_ingredients 
           SET bar_qty = CASE 
             WHEN bar_qty >= ? THEN bar_qty - ?
             ELSE 0 
           END,
           warehouse_qty = CASE 
             WHEN bar_qty < ? THEN warehouse_qty - (? - bar_qty)
             ELSE warehouse_qty 
           END
           WHERE id = ?`,
          [qty, qty, qty, qty, ingId]
        );
      }

      // 📌 LOAN REMINDER: If lending, create reminder for tomorrow
      if (reason === "LOAN") {
        // Create reminders table if not exists
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS local_reminders (
            id TEXT PRIMARY KEY NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT,
            remind_at TEXT NOT NULL,
            is_done INTEGER DEFAULT 0,
            related_log_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Calculate tomorrow date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0); // Remind at 9 AM

        // Create reminder for each loaned item
        const itemNames = itemsArr
          .map((i) => `${i.ingredient_name}: ${i.quantity} ${i.unit}`)
          .join(", ");

        await db.runAsync(
          `INSERT INTO local_reminders (id, type, title, message, remind_at, related_log_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            Crypto.randomUUID(),
            "LOAN_FOLLOWUP",
            "🤝 Nhắc đòi hàng mượn",
            `Hôm qua đã cho mượn: ${itemNames}. Nhớ đòi lại!`,
            tomorrow.toISOString(),
            id, // Link to the QUICK_OUT log
          ]
        );

        console.log(
          "[Reminder] Created LOAN reminder for:",
          tomorrow.toISOString()
        );
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const reasonLabel = OUT_REASONS.find((r) => r.id === reason)?.label;
      const loanNote =
        reason === "LOAN"
          ? "\n\n🔔 Đã đặt nhắc nhở đòi lại vào ngày mai 9h sáng!"
          : "";
      Alert.alert(
        "Thành công ✅",
        `Đã ghi nhận xuất kho (${reasonLabel}).${loanNote}\n\n⚠️ LƯU Ý: KHÔNG GHI lại vào tờ kiểm kê cuối ngày!`
      );
      onSuccess();
    } catch (err) {
      console.error("Quick out failed:", err);
      Alert.alert("Lỗi", "Không thể lưu phiếu xuất.");
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const qty = selectedItems.get(item.id);
    const isSelected = qty !== undefined;
    const totalStock = (item.warehouse_qty || 0) + (item.bar_qty || 0);

    return (
      <View style={[styles.itemRow, isSelected && styles.itemRowSelected]}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemUnit}>
            {item.base_unit} • Tồn: {totalStock.toFixed(1)}
          </Text>
        </View>
        <TextInput
          style={styles.qtyInput}
          placeholder="0"
          placeholderTextColor="#64748B"
          keyboardType="decimal-pad"
          value={qty?.toString() || ""}
          onChangeText={(val) => handleUpdateQty(item.id, val)}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#EF4444" />
        </TouchableOpacity>
        <Text style={styles.title}>Xuất Khác / Hủy 📤</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm nguyên liệu..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />
        {search !== "" && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#EF4444" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          initialNumToRender={20}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Đã chọn:{" "}
          <Text style={{ color: "#EF4444", fontWeight: "700" }}>
            {selectedItems.size}
          </Text>{" "}
          món
        </Text>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            selectedItems.size === 0 && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={selectedItems.size === 0}
        >
          <Text style={styles.submitBtnText}>CHỌN LÝ DO XUẤT</Text>
        </TouchableOpacity>
      </View>

      {/* Reason Selection Modal */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chọn lý do xuất kho</Text>
            <Text style={styles.modalSubtitle}>
              Bắt buộc để theo dõi hao hụt
            </Text>

            {OUT_REASONS.map((reason) => (
              <Pressable
                key={reason.id}
                style={[styles.reasonCard, { borderColor: reason.color }]}
                onPress={() => handleConfirmWithReason(reason.id)}
              >
                <Text style={styles.reasonIcon}>{reason.icon}</Text>
                <View style={styles.reasonInfo}>
                  <Text style={[styles.reasonLabel, { color: reason.color }]}>
                    {reason.label}
                  </Text>
                  <Text style={styles.reasonDesc}>{reason.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              </Pressable>
            ))}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowReasonModal(false)}
            >
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  searchInput: {
    flex: 1,
    color: "white",
    marginLeft: 10,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  itemRowSelected: {
    borderColor: "#EF4444",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemUnit: {
    color: "#64748B",
    fontSize: 12,
  },
  qtyInput: {
    backgroundColor: "#2A2A2A",
    color: "#F5F3EF",
    width: 80,
    height: 40,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#3F3F3F",
  },
  footer: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "#1A1A1A",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: {
    color: "#B8B3A8",
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: "#EF4444",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  submitBtnDisabled: {
    backgroundColor: "#334155",
  },
  submitBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  modalSubtitle: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  reasonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
  },
  reasonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  reasonInfo: {
    flex: 1,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  reasonDesc: {
    color: "#94A3B8",
    fontSize: 12,
  },
  cancelBtn: {
    marginTop: 12,
    padding: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
});
