/**
 * VarianceAlertModal - The Gatekeeper
 * Per .antigravityrules Section E.1: High Variance "Shock" Alert
 *
 * BLOCKING ACTION:
 * - If |Actual - Theoretical| > 15-20%, show this modal
 * - MANDATORY: Select Reason
 * - MANDATORY: Capture Evidence Photo
 * - Cannot submit log without completing both
 */

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Colors per .UXUIrules
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

// VarianceReason options per packages/shared schemas
const VARIANCE_REASONS = [
  {
    id: "VOID_SALE",
    label: "Đơn hàng bị hủy (chưa ghi nhận)",
    icon: "close-circle",
  },
  { id: "FORGOT_IMPORT", label: "Quên ghi nhận nhập hàng", icon: "add-circle" },
  { id: "SPILLAGE", label: "Đổ/tràn", icon: "water" },
  { id: "SPOILAGE", label: "Hỏng/hết hạn", icon: "trash" },
  { id: "THEFT_SUSPECTED", label: "Nghi ngờ mất cắp", icon: "warning" },
  { id: "MEASUREMENT_ERROR", label: "Sai số đo lường", icon: "scale" },
  { id: "RECIPE_CHANGED", label: "Công thức đã thay đổi", icon: "restaurant" },
  {
    id: "TRANSFER_MISSING",
    label: "Thiếu ghi chuyển kho",
    icon: "swap-horizontal",
  },
  { id: "OTHER", label: "Lý do khác", icon: "help-circle" },
] as const;

interface VarianceAlertModalProps {
  visible: boolean;
  ingredientName: string;
  theoreticalQty: number;
  actualQty: number;
  unit: string;
  variancePercentage: number;
  onConfirm: (data: {
    reason: string;
    evidencePhotoUrl?: string;
    notes?: string;
  }) => void;
  onCancel: () => void;
}

export function VarianceAlertModal({
  visible,
  ingredientName,
  theoreticalQty,
  actualQty,
  unit,
  variancePercentage,
  onConfirm,
  onCancel,
}: VarianceAlertModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [evidencePhotoUrl, setEvidencePhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const variance = actualQty - theoreticalQty;
  const isNegative = variance < 0;

  const handleCaptureEvidence = async () => {
    // TODO: Open camera to capture evidence photo
    // For now, simulate capture
    setEvidencePhotoUrl("evidence_captured");
  };

  const handleSubmit = () => {
    setError(null);

    // Validate - MANDATORY per .antigravityrules
    if (!selectedReason) {
      setError("Vui lòng chọn lý do chênh lệch");
      return;
    }

    if (!evidencePhotoUrl) {
      setError("Vui lòng chụp ảnh bằng chứng");
      return;
    }

    if (selectedReason === "OTHER" && !notes.trim()) {
      setError("Vui lòng nhập ghi chú cho lý do 'Khác'");
      return;
    }

    onConfirm({
      reason: selectedReason,
      evidencePhotoUrl: evidencePhotoUrl,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header - Warning style */}
          <View style={styles.header}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={32} color={COLORS.error} />
            </View>
            <Text style={styles.title}>Chênh lệch cao!</Text>
            <Text style={styles.subtitle}>
              Phát hiện chênh lệch lớn cần giải trình
            </Text>
          </View>

          {/* Variance Info */}
          <View style={styles.varianceCard}>
            <Text style={styles.ingredientName}>{ingredientName}</Text>
            <View style={styles.varianceRow}>
              <View style={styles.varianceItem}>
                <Text style={styles.varianceLabel}>Lý thuyết</Text>
                <Text style={styles.varianceValue}>
                  {theoreticalQty.toFixed(2)} {unit}
                </Text>
              </View>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={COLORS.textSecondary}
              />
              <View style={styles.varianceItem}>
                <Text style={styles.varianceLabel}>Thực tế</Text>
                <Text style={[styles.varianceValue, styles.varianceActual]}>
                  {actualQty.toFixed(2)} {unit}
                </Text>
              </View>
            </View>
            <View style={styles.varianceBadge}>
              <Ionicons
                name={isNegative ? "arrow-down" : "arrow-up"}
                size={16}
                color={COLORS.error}
              />
              <Text style={styles.variancePercent}>
                {isNegative ? "" : "+"}
                {variancePercentage.toFixed(1)}%
              </Text>
            </View>
          </View>

          <ScrollView style={styles.content}>
            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Reason Selection - MANDATORY */}
            <Text style={styles.sectionLabel}>
              Chọn lý do <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.reasonGrid}>
              {VARIANCE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.id}
                  style={[
                    styles.reasonItem,
                    selectedReason === reason.id && styles.reasonItemSelected,
                  ]}
                  onPress={() => setSelectedReason(reason.id)}
                >
                  <Ionicons
                    name={reason.icon as any}
                    size={20}
                    color={
                      selectedReason === reason.id
                        ? COLORS.primary
                        : COLORS.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.reasonText,
                      selectedReason === reason.id && styles.reasonTextSelected,
                    ]}
                  >
                    {reason.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Evidence Photo - MANDATORY */}
            <Text style={styles.sectionLabel}>
              Ảnh bằng chứng <Text style={styles.required}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.evidenceButton,
                evidencePhotoUrl && styles.evidenceButtonCaptured,
              ]}
              onPress={handleCaptureEvidence}
            >
              <Ionicons
                name={evidencePhotoUrl ? "checkmark-circle" : "camera"}
                size={24}
                color={evidencePhotoUrl ? COLORS.success : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.evidenceButtonText,
                  evidencePhotoUrl && styles.evidenceButtonTextCaptured,
                ]}
              >
                {evidencePhotoUrl ? "Đã chụp ảnh" : "Chụp ảnh bằng chứng"}
              </Text>
            </TouchableOpacity>

            {/* Notes (optional, required if OTHER) */}
            <Text style={styles.sectionLabel}>
              Ghi chú{" "}
              {selectedReason === "OTHER" && (
                <Text style={styles.required}>*</Text>
              )}
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Nhập ghi chú thêm..."
              placeholderTextColor={COLORS.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
            >
              <Text style={styles.submitButtonText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  warningIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.error + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.error,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  varianceCard: {
    margin: 20,
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.error + "40",
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  varianceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  varianceItem: {
    flex: 1,
    alignItems: "center",
  },
  varianceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  varianceValue: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  varianceActual: {
    color: COLORS.error,
  },
  varianceBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.error + "20",
    borderRadius: 20,
    alignSelf: "center",
  },
  variancePercent: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.error,
  },
  content: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  errorBox: {
    backgroundColor: COLORS.error + "20",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.error,
    textAlign: "center",
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginTop: 8,
  },
  required: {
    color: COLORS.error,
  },
  reasonGrid: {
    gap: 8,
    marginBottom: 20,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reasonItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  reasonTextSelected: {
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  evidenceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    marginBottom: 20,
  },
  evidenceButtonCaptured: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success + "15",
  },
  evidenceButtonText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  evidenceButtonTextCaptured: {
    color: COLORS.success,
    fontWeight: "600",
  },
  notesInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  submitButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});
