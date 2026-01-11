/**
 * SettingsScreen - Mobile Settings
 * Re-exports the Settings implementation from the tab router.
 * This file exists for compatibility with the screens/index.ts exports.
 *
 * Note: The actual Settings screen is at app/(tabs)/settings/index.tsx
 * which uses Expo Router for tab-based navigation.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
// import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getDB } from "../db";
import { supabase } from "../lib/supabase";
import InviteCodeGeneratorModal from "../components/InviteCodeGeneratorModal";
import { useAuth } from "../contexts/AuthContext";
import { Env } from "../env";

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

interface SettingsScreenProps {
  onBack?: () => void;
  onLogout?: () => void;
  onEditProfile?: () => void;
  onManageStaff?: () => void;
}

export default function SettingsScreen({
  onBack,
  onLogout,
  onEditProfile,
  onManageStaff,
}: SettingsScreenProps) {
  // const router = useRouter(); // REMOVE: App.tsx uses manual navigation
  const { signOut, authState } = useAuth();

  // State
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<"SIMPLE" | "STANDARD">("STANDARD");
  const [changingModel, setChangingModel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Derived
  const isOwner =
    (authState.status === "authenticated" &&
      authState.profile?.role === "OWNER") ||
    profile?.role === "OWNER";

  // Load on mount
  React.useEffect(() => {
    loadProfileAndConfig();
  }, []);

  const loadProfileAndConfig = async () => {
    try {
      setLoading(true);
      const db = await getDB();
      const localUser = await db.getFirstAsync<LocalProfile>(
        "SELECT * FROM local_profiles LIMIT 1"
      );

      if (localUser) {
        setProfile(localUser);
        const modelValue = localUser.inventory_model;
        if (modelValue === "MODEL_A" || modelValue === "SIMPLE") {
          setModel("SIMPLE");
        } else {
          setModel("STANDARD");
        }
      }
    } catch (e) {
      console.error("[SettingsScreen] Load profile error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Toggle inventory model (Owner only)
  // IMPORTANT: Must update BOTH profiles table AND businesses table for cross-device sync
  const handleToggleModel = async () => {
    if (!profile?.business_id) {
      Alert.alert(
        "Lỗi",
        "Không tìm thấy thông tin cửa hàng. Vui lòng đăng xuất và đăng nhập lại."
      );
      return;
    }

    const oldModel = model;
    const newModel = model === "SIMPLE" ? "STANDARD" : "SIMPLE";

    setModel(newModel);
    setChangingModel(true);

    try {
      // 1. Update profiles table (legacy compatibility)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ inventory_model: newModel })
        .eq("id", profile.id);

      if (profileError) throw profileError;

      // 2. Update businesses table (CRITICAL for Desktop sync)
      // Desktop reads inventory_model from businesses table first
      const { error: businessError } = await supabase
        .from("businesses")
        .update({ inventory_model: newModel })
        .eq("id", profile.business_id);

      if (businessError) {
        console.warn(
          "[SettingsScreen] Failed to sync to businesses:",
          businessError
        );
        // Don't fail the whole operation, but log the warning
      }

      // 3. Update local SQLite
      const db = await getDB();
      await db.runAsync(
        "UPDATE local_profiles SET inventory_model = ? WHERE id = ?",
        [newModel, profile.id]
      );

      Alert.alert(
        "Thành công",
        `Đã đổi sang ${
          newModel === "SIMPLE" ? "Kho Đơn" : "Kho Kép"
        }.\n\nTất cả thiết bị sẽ tự đồng bộ sau vài giây.`,
        [{ text: "OK" }]
      );
    } catch (err: any) {
      console.error("[SettingsScreen] Toggle model error:", err);
      Alert.alert("Lỗi", "Không thể cập nhật mô hình kho");
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
            onLogout?.();
          } catch (err) {
            console.error("[SettingsScreen] Logout error:", err);
            await supabase.auth.signOut();
            onLogout?.();
          }
        },
      },
    ]);
  };

  // Delete account handler
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
      ]
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

      const response = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/user-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        const db = await getDB();
        await db.runAsync("DELETE FROM local_profiles");
        await supabase.auth.signOut();

        Alert.alert(
          "Đã yêu cầu xóa tài khoản",
          result.message || "Dữ liệu sẽ bị xóa hoàn toàn sau 30 ngày.",
          [{ text: "OK", onPress: () => onLogout?.() }]
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>⚙️ Cài đặt</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scrollContent}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tài khoản</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Ionicons
                  name="person"
                  size={24}
                  color={COLORS.textSecondary}
                />
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
                {/* Debug: Show Business ID */}
                <Text
                  style={{
                    color: COLORS.textMuted,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  ID: {profile?.business_id?.substring(0, 8)}...
                </Text>
              </View>
            </View>
            {/* Edit Profile Button - All users can edit their own profile */}
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  if (onEditProfile) {
                    onEditProfile();
                  } else {
                    // Fallback for Tab navigation (if used there)
                    // router.push("/profile-edit" as any);
                    console.warn("onEditProfile not provided");
                  }
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
                style={styles.inviteButton}
                onPress={() => setShowInviteModal(true)}
              >
                <Ionicons name="person-add" size={18} color="#FFF" />
                <Text style={styles.inviteButtonText}>
                  Tạo mã mời nhân viên
                </Text>
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
                Chọn mô hình phù hợp với quán của bạn.
              </Text>
              <View style={styles.modelSelector}>
                <TouchableOpacity
                  style={[
                    styles.modelOption,
                    model === "SIMPLE" && styles.modelOptionActive,
                  ]}
                  onPress={() =>
                    model !== "SIMPLE" && !changingModel && handleToggleModel()
                  }
                  disabled={changingModel}
                >
                  <Text style={styles.modelIcon}>🏠</Text>
                  <Text
                    style={[
                      styles.modelName,
                      model === "SIMPLE" && styles.modelNameActive,
                    ]}
                  >
                    KHO ĐƠN
                  </Text>
                  <Text style={styles.modelDesc}>1 kho duy nhất</Text>
                  {model === "SIMPLE" && (
                    <View style={styles.modelCheck}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modelOption,
                    model === "STANDARD" && styles.modelOptionActive,
                  ]}
                  onPress={() =>
                    model !== "STANDARD" &&
                    !changingModel &&
                    handleToggleModel()
                  }
                  disabled={changingModel}
                >
                  <Text style={styles.modelIcon}>🏭→🍸</Text>
                  <Text
                    style={[
                      styles.modelName,
                      model === "STANDARD" && styles.modelNameActive,
                    ]}
                  >
                    KHO KÉP
                  </Text>
                  <Text style={styles.modelDesc}>Kho Tổng + Quầy Bar</Text>
                  {model === "STANDARD" && (
                    <View style={styles.modelCheck}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
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
              <Ionicons
                name="log-out-outline"
                size={18}
                color={COLORS.warning}
              />
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
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={COLORS.error}
                  />
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
      </ScrollView>

      {/* Invite Modal */}
      <InviteCodeGeneratorModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 60,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  scrollContent: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
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
  modelSelector: {
    flexDirection: "row",
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
