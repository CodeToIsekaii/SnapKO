import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getPendingLends, markLendReturned, PendingLend } from "../db";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase"; // For realtime
import { getDB } from "../db";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";

interface PendingLendsWidgetProps {
  businessId: string;
  refreshKey?: number;
  onReturnComplete?: () => void; // Callback to notify parent when a return is processed
}

export const PendingLendsWidget = ({
  businessId,
  refreshKey,
  onReturnComplete,
}: PendingLendsWidgetProps) => {
  const [lends, setLends] = useState<PendingLend[]>([]);
  const [loading, setLoading] = useState(true);
  const [returningItem, setReturningItem] = useState<PendingLend | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadLends();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel("pending_lends_tracker")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pending_lends",
          filter: `business_id=eq.${businessId}`,
        },
        (payload: any) => {
          console.log("[Realtime] Pending lends changed:", payload);
          loadLends(); // Reload local data (assuming pull sync happened or just refresh info)
          // Ideally, we should pull sync here, but for now simple refresh
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [businessId, refreshKey]);

  const loadLends = async () => {
    try {
      const data = await getPendingLends(businessId);
      setLends(data);
    } catch (err) {
      console.error("Failed to load pending lends:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = (lend: PendingLend) => {
    setReturningItem(lend);
    setShowReturnModal(true);
  };

  const processReturn = async (returnLocation: "WAREHOUSE" | "BAR") => {
    if (!returningItem) return;
    setProcessing(true);

    try {
      const db = await getDB();
      const now = new Date().toISOString();

      // 1. Update status locally
      await markLendReturned(returningItem.id, returnLocation, now);

      // 2. Add Stock back (Restock)
      // Transaction logic: Credit inventory
      if (returnLocation === "WAREHOUSE") {
        await db.runAsync(
          `UPDATE local_ingredients 
           SET warehouse_qty = warehouse_qty + ? 
           WHERE id = ?`,
          [returningItem.quantity, returningItem.ingredient_id]
        );
      } else {
        // Return to BAR -> Increase Bar Qty
        await db.runAsync(
          `UPDATE local_ingredients 
           SET bar_qty = bar_qty + ? 
           WHERE id = ?`,
          [returningItem.quantity, returningItem.ingredient_id]
        );
      }

      // 3. Create Import Log (Reason: RETURN_FROM_LOAN)
      const logId = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          logId,
          "IMPORT", // Use IMPORT type for positive adjustment
          returnLocation,
          JSON.stringify({
            items: [
              {
                ingredient_id: returningItem.ingredient_id,
                quantity: returningItem.quantity,
                unit: returningItem.unit,
              },
            ],
            reason: "RETURN_FROM_LOAN",
            reason_label: "Trả hàng mượn",
            notes: `Nhận lại hàng đã cho mượn từ ${
              returningItem.source_location === "WAREHOUSE" ? "Kho" : "Bar"
            } về ${returnLocation === "WAREHOUSE" ? "Kho" : "Bar"}`,
            related_lend_id: returningItem.id,
          }),
          now,
          0,
        ]
      );

      // 4. Trigger Sync (to push update to Cloud)
      try {
        const { syncPendingLends } = await import("../sync/syncEngine");
        await syncPendingLends();
      } catch (syncErr) {
        console.warn("[Widget] Sync after return failed:", syncErr);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Thành công",
        `Đã nhận lại ${returningItem.ingredient_name} về ${
          returnLocation === "WAREHOUSE" ? "Kho Tổng" : "Quầy Bar"
        }`
      );

      setShowReturnModal(false);
      setReturningItem(null);
      loadLends(); // Refresh list immediately

      // Notify parent to refresh activity list
      if (onReturnComplete) {
        onReturnComplete();
      }
    } catch (err) {
      console.error("Return process failed:", err);
      Alert.alert("Lỗi", "Không thể cập nhật trả hàng.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading || lends.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={20} color="#F59E0B" />
        <Text style={styles.title}>Đang cho mượn ({lends.length})</Text>
      </View>

      <Text style={styles.warning}>
        ⚠️ Chỉ nhấn "Đã nhận lại" khi thực sự nhận được hàng!
      </Text>

      {lends.map((lend) => (
        <View key={lend.id} style={styles.card}>
          <View style={styles.info}>
            <Text style={styles.name}>{lend.ingredient_name}</Text>
            <Text style={styles.details}>
              {lend.quantity} {lend.unit} • Từ:{" "}
              {lend.source_location === "WAREHOUSE" ? "KHO TỔNG" : "QUẦY BAR"}
            </Text>
            <Text style={styles.time}>
              {new Date(lend.lent_at).toLocaleDateString("vi-VN")}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.returnBtn}
            onPress={() => handleReturn(lend)}
          >
            <Text style={styles.returnBtnText}>Đã nhận lại</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Return Location Modal */}
      <Modal visible={showReturnModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nhận hàng về đâu?</Text>
            <Text style={styles.modalSubtitle}>
              Chọn kho để nhập lại số lượng này
            </Text>

            <TouchableOpacity
              style={[styles.locationBtn, { borderColor: "#6B8E23" }]}
              onPress={() => processReturn("BAR")}
              disabled={processing}
            >
              <Ionicons
                name="wine"
                size={24}
                color="#6B8E23"
                style={{ marginRight: 12 }}
              />
              <View>
                <Text style={[styles.locationLabel, { color: "#6B8E23" }]}>
                  QUẦY BAR
                </Text>
                <Text style={styles.locationDesc}>Nhập về quầy pha chế</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.locationBtn, { borderColor: "#F59E0B" }]}
              onPress={() => processReturn("WAREHOUSE")}
              disabled={processing}
            >
              <Ionicons
                name="cube"
                size={24}
                color="#F59E0B"
                style={{ marginRight: 12 }}
              />
              <View>
                <Text style={[styles.locationLabel, { color: "#F59E0B" }]}>
                  KHO TỔNG
                </Text>
                <Text style={styles.locationDesc}>Nhập về kho lưu trữ</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowReturnModal(false)}
              disabled={processing}
            >
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#2C2005", // Dark yellow tint
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#F59E0B",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  warning: {
    color: "#F59E0B",
    fontSize: 12,
    marginBottom: 12,
    fontStyle: "italic",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  info: {
    flex: 1,
  },
  name: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  details: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 2,
  },
  time: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },
  returnBtn: {
    backgroundColor: "#F59E0B",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  returnBtnText: {
    color: "#1A1A1A",
    fontSize: 12,
    fontWeight: "700",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  modalSubtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  locationDesc: {
    color: "#94A3B8",
    fontSize: 12,
  },
  cancelBtn: {
    marginTop: 12,
    padding: 12,
    alignItems: "center",
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
  },
});
