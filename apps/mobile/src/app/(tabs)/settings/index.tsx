/**
 * Settings Tab - Enhanced with full profile, model selector, and App Store compliance
 * Per .antigravityrules Section 4 and .UXUIrules
 *
 * Features:
 * - Dynamic profile from SQLite
 * - Model selector (SIMPLE/STANDARD/CHAIN) - Owner only
 * - Staff invite - Owner only
 * - Delete account with 30-day grace
 * - Privacy/Terms links
 */

import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDB } from "../../../db";
import { supabase } from "../../../lib/supabase";
import { api } from "../../../services/api";
// SecureStore removed - using supabase.auth.getSession() instead
import InviteCodeGeneratorModal from "../../../components/InviteCodeGeneratorModal";
import { useAuth } from "../../../contexts/AuthContext";
import { Env } from "../../../env";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  success: "#6B8E23",
  warning: "#FFC857",
  error: "#E63946",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  textMuted: "#64748B",
  border: "#2A2A2A",
};

const PRIVACY_URL = "https://snapko.vn/privacy";
const TERMS_URL = "https://snapko.vn/terms";

interface LocalProfile {
  id: string;
  business_id: string | null;
  role: string;
  status: string;
  full_name: string | null;
  phone_number: string | null;
  inventory_model: string;
}

type InventoryModel = "SIMPLE" | "STANDARD" | "CHAIN";

function normalizeInventoryModel(value?: string | null): InventoryModel {
  if (value === "STANDARD" || value === "MODEL_B") return "STANDARD";
  if (value === "CHAIN") return "CHAIN";
  return "SIMPLE";
}

const MODEL_LABEL: Record<InventoryModel, string> = {
  SIMPLE: "Kho Đơn",
  STANDARD: "Kho Kép",
  CHAIN: "Nhiều khu vực",
};

export default function SettingsScreen() {
  console.log("⚙️ [Settings] Component rendering...");
  const router = useRouter();
  const { signOut } = useAuth();

  // State
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<InventoryModel>("SIMPLE");
  const [changingModel, setChangingModel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Derived - Use AuthContext as primary source (more reliable than local DB)
  const { authState } = useAuth();
  const isOwner =
    (authState.status === "authenticated" &&
      authState.profile?.role === "OWNER") ||
    profile?.role === "OWNER";
  const authProfile =
    authState.status === "authenticated" ? authState.profile : null;
  const effectiveTier = authProfile?.effectiveTier ?? authProfile?.tier ?? "FREE";
  const entitlements = authProfile?.entitlements;
  const canUseDualWarehouse =
    entitlements?.canUseDualWarehouse ??
    (effectiveTier === "PRO" || effectiveTier === "CHAIN");
  const canUseCustomStorageAreas =
    entitlements?.canUseCustomStorageAreas ?? effectiveTier === "CHAIN";
  const canInviteStaff = entitlements?.canInviteStaff ?? true;

  // Debug log
  console.log(
    "[Settings] isOwner:",
    isOwner,
    "authState:",
    authState.status,
    "role:",
    authState.status === "authenticated" ? authState.profile?.role : "N/A",
  );

  // Load profile on screen focus
  useFocusEffect(
    useCallback(() => {
      loadProfileAndConfig();
    }, [authProfile?.effectiveInventoryModel]),
  );

  const loadProfileAndConfig = async () => {
    try {
      setLoading(true);
      const db = await getDB();
      const localUser = await db.getFirstAsync<LocalProfile>(
        "SELECT * FROM local_profiles LIMIT 1",
      );

      if (localUser) {
        setProfile(localUser);
        const modelValue = authProfile?.effectiveInventoryModel || "SIMPLE";
        setModel(normalizeInventoryModel(modelValue));
      }
    } catch (e) {
      console.error("[Settings] Load profile error:", e);
    } finally {
      setLoading(false);
    }
  };

  const showUpgradePrompt = (targetModel: InventoryModel) => {
    Alert.alert(
      "Tính năng bị khóa",
      targetModel === "CHAIN"
        ? "Mô hình nhiều khu vực cần gói CHAIN còn hiệu lực."
        : "Kho Kép cần gói PRO hoặc CHAIN còn hiệu lực.",
      [{ text: "OK" }],
    );
  };

  const isModelLocked = (targetModel: InventoryModel) => {
    if (targetModel === "STANDARD") return !canUseDualWarehouse;
    if (targetModel === "CHAIN") return !canUseCustomStorageAreas;
    return false;
  };

  // Select inventory model (Owner only) with Optimistic UI.
  // Business inventory_model is the source of truth; profile field is legacy-only.
  const handleSelectModel = async (newModel: InventoryModel) => {
    console.log(
      "[Settings] handleSelectModel called, business_id:",
      profile?.business_id,
      "profile:",
      profile?.id,
    );

    if (!profile?.business_id) {
      Alert.alert(
        "Lỗi",
        "Không tìm thấy thông tin cửa hàng. Vui lòng đăng xuất và đăng nhập lại.",
      );
      return;
    }

    if (isModelLocked(newModel)) {
      showUpgradePrompt(newModel);
      return;
    }

    const oldModel = model;

    // Optimistic UI update
    setModel(newModel);
    setChangingModel(true);

    try {
      const business = await api.patch<{
        inventoryModel?: string;
        effectiveInventoryModel?: string;
      }>("/businesses/me", { inventoryModel: newModel });
      const effectiveModel = normalizeInventoryModel(
        business?.effectiveInventoryModel || "SIMPLE",
      );

      // Update Local SQLite with effective model returned by backend
      const db = await getDB();
      await db.runAsync(
        "UPDATE local_profiles SET inventory_model = ? WHERE id = ?",
        [effectiveModel, profile.id],
      );
      setModel(effectiveModel);

      Alert.alert(
        "Thành công",
        `Đã đổi sang ${MODEL_LABEL[effectiveModel]}.\n\nTất cả thiết bị sẽ tự đồng bộ sau vài giây.`,
        [{ text: "OK" }],
      );
    } catch (err: any) {
      console.error("[Settings] Select model error:", err);
      if (err?.status === 403) {
        Alert.alert("Tính năng bị khóa", "Gói hiện tại không hỗ trợ mô hình này.");
      } else {
        Alert.alert("Lỗi", "Không thể cập nhật mô hình kho");
      }
      // Revert on error
      setModel(oldModel);
    } finally {
      setChangingModel(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    Alert.alert("Đăng xuất", "Bạn có chắc chắn muốn đăng xuất?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Đăng xuất",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            // AuthContext handles DB cleanup and state update
            // Router redirect happens automatically via AuthStack logic or we can force it
            // router.replace("/(auth)/login");
          } catch (err) {
            console.error("[Settings] Logout error:", err);
            // Force basic cleanup if context fails
            await supabase.auth.signOut();
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  };

  // Delete account handler (App Store compliance)
  const handleDeleteAccount = () => {
    Alert.alert(
      "⚠️ Xóa tài khoản",
      "Bạn có chắc chắn muốn xóa tài khoản?\n\n• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa tài khoản",
          style: "destructive",
          onPress: confirmDeleteAccount,
        },
      ],
    );
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (sessionError || !token) {
        Alert.alert("Lỗi", "Bạn cần đăng nhập lại để thực hiện thao tác này");
        return;
      }

      const response = await fetch(`${Env.BACKEND_URL}/user/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Clear local data - signOut handles session cleanup
        const db = await getDB();
        await db.runAsync("DELETE FROM local_profiles");
        await supabase.auth.signOut();

        Alert.alert(
          "Đã yêu cầu xóa tài khoản",
          result.message || "Dữ liệu sẽ bị xóa hoàn toàn sau 30 ngày.",
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }],
        );
      } else {
        Alert.alert("Lỗi", result.error || "Không thể xóa tài khoản");
      }
    } catch (err) {
      Alert.alert("Lỗi", "Không thể kết nối server. Vui lòng thử lại.");
    } finally {
      setDeleting(false);
    }
  };

  // Open external links
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Lỗi", "Không thể mở link này");
    });
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Cài đặt</Text>
      </View>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tài khoản</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={24} color={COLORS.textSecondary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.full_name || "Người dùng"}
              </Text>
              <View style={styles.roleContainer}>
                <Text style={styles.roleEmoji}>{isOwner ? "👑" : "👤"}</Text>
                <Text
                  style={[
                    styles.profileRole,
                    isOwner && styles.profileRoleOwner,
                  ]}
                >
                  {isOwner ? "Chủ quán" : "Nhân viên"}
                </Text>
              </View>
            </View>
          </View>
          {/* Profile Edit - All users can edit their own profile */}
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                // Navigate to profile edit screen
                router.push("/profile-edit" as any);
              }}
            >
              <Text style={styles.menuRowText}>✏️ Chỉnh sửa hồ sơ</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          </>
        </View>
      </View>

      {/* Staff Management - Owner Only */}
      {isOwner && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quản lý nhân sự</Text>
          <View style={styles.card}>
            <Text style={styles.hintText}>
              Tạo mã mời để nhân viên tham gia quản lý kho cùng bạn.
            </Text>
            <TouchableOpacity
              style={[styles.inviteButton, !canInviteStaff && styles.lockedButton]}
              onPress={() =>
                canInviteStaff
                  ? setShowInviteModal(true)
                  : Alert.alert("Tính năng bị khóa", "Mời nhân viên cần gói PRO/CHAIN còn hiệu lực.")
              }
            >
              <Ionicons name="person-add" size={18} color="#FFF" />
              <Text style={styles.inviteButtonText}>Tạo mã mời nhân viên</Text>
            </TouchableOpacity>
            <Text style={styles.hintTextSmall}>
              Mã mời có hiệu lực trong 48 giờ
            </Text>
          </View>
        </View>
      )}

      {/* Inventory Model Selector - Owner Only */}
      {isOwner && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mô hình vận hành</Text>
          <View style={styles.card}>
            <Text style={styles.hintText}>
              Chọn mô hình phù hợp với quán của bạn. Thay đổi này ảnh hưởng đến
              cách nhân viên kiểm kho.
            </Text>
            <View style={styles.modelSelector}>
              {([
                {
                  id: "SIMPLE" as const,
                  icon: "home" as const,
                  title: "BASIC / KHO ĐƠN",
                  desc: "1 kho duy nhất",
                },
                {
                  id: "STANDARD" as const,
                  icon: "wine" as const,
                  title: "PRO / KHO KÉP",
                  desc: "Kho Tổng + Quầy Bar",
                },
                {
                  id: "CHAIN" as const,
                  icon: "business" as const,
                  title: "CHAIN / NHIỀU KHU",
                  desc: "Nhiều khu vực tùy chỉnh",
                },
              ]).map((option) => {
                const locked = isModelLocked(option.id);
                const active = model === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.modelOption,
                      active && styles.modelOptionActive,
                      locked && !active && styles.modelOptionDisabled,
                    ]}
                    onPress={() =>
                      !changingModel &&
                      (locked ? showUpgradePrompt(option.id) : handleSelectModel(option.id))
                    }
                    disabled={changingModel}
                  >
                    <Ionicons
                      name={option.icon}
                      size={28}
                      color={active ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modelName,
                        active && styles.modelNameActive,
                      ]}
                    >
                      {option.title}
                    </Text>
                    <Text style={styles.modelDesc}>{option.desc}</Text>
                    {locked && !active && (
                      <View style={styles.modelLock}>
                        <Ionicons name="lock-closed" size={12} color={COLORS.warning} />
                        <Text style={styles.modelLockText}>Khóa</Text>
                      </View>
                    )}
                    {active && (
                      <View style={styles.modelCheck}>
                        <Ionicons name="checkmark" size={14} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {changingModel && (
              <View style={styles.changingIndicator}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.changingText}>Đang cập nhật...</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Legal Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pháp lý</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => openLink(PRIVACY_URL)}
          >
            <Text style={styles.menuRowText}>Chính sách Quyền riêng tư</Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => openLink(TERMS_URL)}
          >
            <Text style={styles.menuRowText}>Điều khoản Sử dụng</Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tài khoản</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
            <Text style={[styles.menuRowText, styles.warningText]}>
              Đăng xuất
            </Text>
            <Ionicons name="log-out-outline" size={18} color={COLORS.warning} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <>
                <Text style={[styles.menuRowText, styles.dangerText]}>
                  Xóa tài khoản
                </Text>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.deleteHint}>
            Khi xóa tài khoản, tất cả dữ liệu sẽ bị xóa vĩnh viễn sau 30 ngày.
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.version}>SnapKO v1.0.0</Text>
        <Text style={styles.copyright}>© 2024 SnapKO Team</Text>
      </View>

      {/* Invite Modal */}
      <InviteCodeGeneratorModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  roleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  roleEmoji: {
    fontSize: 12,
  },
  profileRole: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  profileRoleOwner: {
    color: COLORS.primary,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  menuRowText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  hintText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    padding: 16,
    paddingBottom: 12,
    lineHeight: 18,
  },
  hintTextSmall: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    paddingBottom: 12,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.success,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
  },
  inviteButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  lockedButton: {
    opacity: 0.5,
  },
  // Model selector
  modelSelector: {
    flexDirection: "column",
    gap: 12,
    padding: 16,
    paddingTop: 0,
  },
  modelOption: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    position: "relative",
  },
  modelOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
  },
  modelOptionDisabled: {
    opacity: 0.5,
  },
  modelIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  modelName: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  modelNameActive: {
    color: COLORS.primary,
  },
  modelDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  modelLock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  modelLockText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: "600",
  },
  modelCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  changingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 16,
  },
  changingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  warningText: {
    color: COLORS.warning,
  },
  dangerText: {
    color: COLORS.error,
  },
  deleteHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    padding: 16,
    paddingTop: 0,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingBottom: 100,
  },
  version: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  copyright: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
});
