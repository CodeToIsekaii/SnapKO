/**
 * VarianceModal - Full-screen modal for >15% variance explanation
 * Per .UXUIrules Section 3.D.3: Critical Loss handling
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import ReasonChips, { VarianceReason } from "./ReasonChips";

interface VarianceItem {
  name: string;
  counted: number;
  expected: number;
  percent: number;
  unit?: string;
  // Breakdown for calculation display (per user feedback Phase 3)
  breakdown?: {
    startingQty: number;
    transfersIn: number;
    salesConsumption: number;
  };
}

interface VarianceModalProps {
  visible: boolean;
  items: VarianceItem[];
  onSubmit: (reason: VarianceReason, note?: string) => void;
  onCancel: () => void;
}

export default function VarianceModal({
  visible,
  items,
  onSubmit,
  onCancel,
}: VarianceModalProps) {
  const [selectedReason, setSelectedReason] = useState<VarianceReason | null>(
    null,
  );
  const [note, setNote] = useState("");

  // Trigger haptic on mount
  React.useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [visible]);

  const canSubmit =
    selectedReason !== null &&
    (selectedReason !== "OTHER" || note.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit || !selectedReason) return;
    onSubmit(selectedReason, note || undefined);
    // Reset state
    setSelectedReason(null);
    setNote("");
  };

  const handleCancel = () => {
    setSelectedReason(null);
    setNote("");
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>🚨</Text>
            <Text style={styles.title}>CHÊNH LỆCH LỚN!</Text>
          </View>

          {/* Variance List with Breakdown */}
          <View style={styles.listContainer}>
            {items.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.varItemContainer}>
                <View style={styles.varItem}>
                  <Text style={styles.varName}>{item.name}</Text>
                  <Text style={styles.varPercent}>
                    -{item.percent.toFixed(1)}%
                  </Text>
                </View>

                {/* Breakdown calculation (Phase 3) */}
                {item.breakdown ? (
                  <View style={styles.breakdownBox}>
                    <Text style={styles.breakdownLine}>
                      Tồn đầu: {item.breakdown.startingQty.toFixed(1)}{" "}
                      {item.unit || ""}
                    </Text>
                    {item.breakdown.transfersIn > 0 && (
                      <Text
                        style={[styles.breakdownLine, { color: "#6B8E23" }]}
                      >
                        + Nhập: +{item.breakdown.transfersIn.toFixed(1)}
                      </Text>
                    )}
                    {item.breakdown.salesConsumption > 0 && (
                      <Text
                        style={[styles.breakdownLine, { color: "#E63946" }]}
                      >
                        - Bán: -{item.breakdown.salesConsumption.toFixed(1)}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.breakdownLine,
                        { fontWeight: "700", color: "#E07A2F" },
                      ]}
                    >
                      = Lý thuyết: {item.expected.toFixed(1)}
                    </Text>
                    <Text style={styles.breakdownActual}>
                      Thực tế đếm: {item.counted.toFixed(1)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.varDetails}>
                    Thực: {item.counted.toFixed(1)} | Lý thuyết:{" "}
                    {item.expected.toFixed(1)}
                  </Text>
                )}
              </View>
            ))}
            {items.length > 3 && (
              <Text style={styles.moreText}>
                +{items.length - 3} món khác...
              </Text>
            )}
          </View>

          {/* Reason Selection */}
          <Text style={styles.sectionTitle}>Chọn lý do:</Text>
          <ReasonChips selected={selectedReason} onSelect={setSelectedReason} />

          {/* Note Input (required if OTHER) */}
          {selectedReason === "OTHER" && (
            <TextInput
              style={styles.noteInput}
              placeholder="Nhập lý do cụ thể..."
              placeholderTextColor="#64748B"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={2}
            />
          )}

          {/* Actions */}
          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitText}>
              {canSubmit ? "Xác nhận & Lưu" : "Chọn lý do để tiếp tục"}
            </Text>
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Hủy kiểm kê</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(230, 57, 70, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: "#E63946",
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    color: "#E63946",
    fontSize: 22,
    fontWeight: "800",
  },
  listContainer: {
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  varItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  varName: {
    color: "#F5F3EF",
    fontSize: 14,
    flex: 1,
  },
  varDetails: {
    color: "#94A3B8",
    fontSize: 12,
    marginRight: 8,
  },
  varPercent: {
    color: "#E63946",
    fontSize: 14,
    fontWeight: "700",
  },
  varItemContainer: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    paddingBottom: 8,
  },
  breakdownBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  breakdownLine: {
    color: "#94A3B8",
    fontSize: 12,
    marginVertical: 2,
  },
  breakdownActual: {
    color: "#F5F3EF",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
  },
  moreText: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  sectionTitle: {
    color: "#F5F3EF",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  noteInput: {
    backgroundColor: "#121212",
    borderRadius: 8,
    padding: 12,
    color: "#F5F3EF",
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  submitButton: {
    backgroundColor: "#E07A2F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  submitDisabled: {
    backgroundColor: "#334155",
  },
  submitText: {
    color: "#F5F3EF",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelText: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
