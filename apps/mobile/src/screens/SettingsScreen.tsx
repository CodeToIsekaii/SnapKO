/**
 * SettingsScreen - Bridge Component
 * This file provides backward compatibility for App.tsx navigation
 * while the actual Settings UI is in app/(tabs)/settings/index.tsx
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { Env } from "../env";
import InviteCodeGeneratorModal from "../components/InviteCodeGeneratorModal";
import { supabase } from "../lib/supabase";
import { getDB } from "../db";

const PRIVACY_URL = "https://snapko.vn/privacy";
const TERMS_URL = "https://snapko.vn/terms";
const ACCOUNT_URL = "https://snapko.vn/dashboard";

const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  primary: "#E07A2F",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  border: "#2A2A2A",
  danger: "#EF4444",
};

interface LocalProfile {
  id: string;
  role: string;
  business_id?: string;
  inventory_model?: string;
  full_name?: string;
}

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
  userName?: string;
  userRole?: string;
  onEditProfile?: () => void;
}

export default function SettingsScreen({
  onBack,
  onLogout,
  userName,
  userRole,
  onEditProfile,
}: SettingsScreenProps) {
  const [deleting, setDeleting] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [model, setModel] = useState<"SIMPLE" | "STANDARD">("STANDARD");
  const [changingModel, setChangingModel] = useState(false);

  const isOwner = userRole === "OWNER";

  // Load profile from local DB on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const db = await getDB();
      const localUser = await db.getFirstAsync<LocalProfile>(
        "SELECT * FROM local_profiles ORDER BY created_at DESC LIMIT 1"
      );
      if (localUser) {
        setProfile(localUser);
        setModel(
          localUser.inventory_model === "SIMPLE" ? "SIMPLE" : "STANDARD"
        );
      }
    } catch (e) {
      console.error("[SettingsScreen] Load profile error:", e);
    }
  };

  // Toggle inventory model
  const handleToggleModel = async () => {
    console.log(
      "[Settings] handleToggleModel called, profile:",
      profile?.id,
      "business_id:",
      profile?.business_id
    );

    if (!profile?.business_id) {
      Alert.alert("Lỗi", "Không tìm thấy thông tin cửa hàng");
      return;
    }

    const oldModel = model;
    const newModel = model === "SIMPLE" ? "STANDARD" : "SIMPLE";
    console.log("[Settings] Changing model from", oldModel, "to", newModel);

    setModel(newModel);
    setChangingModel(true);

    try {
      // Update BOTH tables (profiles AND businesses)
      console.log("[Settings] Updating Supabase profiles table...");
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ inventory_model: newModel })
        .eq("id", profile.id);

      if (profileError) {
        console.error("[Settings] Profile update error:", profileError);
        throw profileError;
      }
      console.log("[Settings] Supabase profiles update SUCCESS");

      // Also update businesses table (source of truth for sync)
      console.log("[Settings] Updating Supabase businesses table...");
      const { error: businessError } = await supabase
        .from("businesses")
        .update({ inventory_model: newModel })
        .eq("id", profile.business_id);

      if (businessError) {
        console.error("[Settings] Business update error:", businessError);
        throw businessError;
      }
      console.log("[Settings] Supabase businesses update SUCCESS");

      console.log("[Settings] Updating local SQLite...");
      const db = await getDB();
      await db.runAsync(
        "UPDATE local_profiles SET inventory_model = ? WHERE id = ?",
        [newModel, profile.id]
      );
      console.log("[Settings] Local DB update SUCCESS");

      Alert.alert(
        "Thành công",
        `Đã đổi sang ${newModel === "SIMPLE" ? "Kho Đơn" : "Kho Kép"}.`
      );
    } catch (err) {
      console.error("[Settings] Model change error:", err);
      Alert.alert("Lỗi", "Không thể đổi mô hình.");
      setModel(oldModel);
    } finally {
      setChangingModel(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "⚠️ Xóa tài khoản",
      "Bạn có chắc chắn muốn xóa tài khoản?\n\n• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Xóa tài khoản", style: "destructive", onPress: confirmDelete },
      ]
    );
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const token = await SecureStore.getItemAsync("session_token");
      if (!token) {
        Alert.alert("Lỗi", "Bạn cần đăng nhập lại");
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
        await SecureStore.deleteItemAsync("session_token");
        await SecureStore.deleteItemAsync("refresh_token");
        Alert.alert("Đã yêu cầu xóa tài khoản", result.message, [
          { text: "OK", onPress: onLogout },
        ]);
      } else {
        Alert.alert("Lỗi", result.error || "Không thể xóa tài khoản");
      }
    } catch {
      Alert.alert("Lỗi", "Không thể kết nối server");
    } finally {
      setDeleting(false);
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert("Lỗi", "Không thể mở link"));
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 16 }}>
            ← Quay lại
          </Text>
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            color: "white",
            fontSize: 18,
            fontWeight: "600",
          }}
        >
          Cài đặt
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* User Info */}
        <View style={{ padding: 16 }}>
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              {userName || "Người dùng"}
            </Text>
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                marginTop: 4,
              }}
            >
              {isOwner ? "Chủ quán" : "Nhân viên"}
            </Text>
            {onEditProfile && (
              <Pressable onPress={onEditProfile} style={{ marginTop: 12 }}>
                <Text style={{ color: COLORS.primary, fontSize: 14 }}>
                  ✏️ Chỉnh sửa hồ sơ
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Staff Invite - Owner Only */}
        {isOwner && (
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 12,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Quản lý nhân sự
            </Text>
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 14,
                  marginBottom: 12,
                }}
              >
                Tạo mã mời để nhân viên tham gia quản lý kho.
              </Text>
              <Pressable
                onPress={() => setShowInviteModal(true)}
                style={{
                  backgroundColor: "#6B8E23",
                  borderRadius: 10,
                  padding: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>
                  + Tạo mã mời nhân viên
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Model Selector - Owner Only */}
        {isOwner && (
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 12,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Mô hình vận hành
            </Text>
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor:
                      model === "SIMPLE" ? COLORS.primary : COLORS.border,
                    backgroundColor:
                      model === "SIMPLE"
                        ? "rgba(224, 122, 47, 0.1)"
                        : "transparent",
                    alignItems: "center",
                    opacity: changingModel ? 0.5 : 1,
                  }}
                  onPress={() => model !== "SIMPLE" && handleToggleModel()}
                  disabled={changingModel}
                >
                  <Text style={{ fontSize: 20 }}>🏠</Text>
                  <Text
                    style={{
                      color:
                        model === "SIMPLE"
                          ? COLORS.primary
                          : COLORS.textSecondary,
                      fontSize: 12,
                      fontWeight: model === "SIMPLE" ? "600" : "normal",
                    }}
                  >
                    KHO ĐƠN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor:
                      model === "STANDARD" ? COLORS.primary : COLORS.border,
                    backgroundColor:
                      model === "STANDARD"
                        ? "rgba(224, 122, 47, 0.1)"
                        : "transparent",
                    alignItems: "center",
                    opacity: changingModel ? 0.5 : 1,
                  }}
                  onPress={() => model !== "STANDARD" && handleToggleModel()}
                  disabled={changingModel}
                >
                  <Text style={{ fontSize: 20 }}>🏭→🍸</Text>
                  <Text
                    style={{
                      color:
                        model === "STANDARD"
                          ? COLORS.primary
                          : COLORS.textSecondary,
                      fontSize: 12,
                      fontWeight: model === "STANDARD" ? "600" : "normal",
                    }}
                  >
                    KHO KÉP
                  </Text>
                </TouchableOpacity>
              </View>
              {changingModel && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    marginTop: 12,
                  }}
                >
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={{ color: COLORS.textSecondary, marginLeft: 8 }}>
                    Đang cập nhật...
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Legal Links */}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            Pháp lý
          </Text>
          <Pressable
            onPress={() => openLink(PRIVACY_URL)}
            style={{
              backgroundColor: COLORS.surface,
              padding: 16,
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "white" }}>Chính sách Quyền riêng tư →</Text>
          </Pressable>
          <Pressable
            onPress={() => openLink(TERMS_URL)}
            style={{
              backgroundColor: COLORS.surface,
              padding: 16,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white" }}>Điều khoản Sử dụng →</Text>
          </Pressable>
        </View>

        {/* Account Actions */}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            Tài khoản
          </Text>
          <Pressable
            onPress={onLogout}
            style={{
              backgroundColor: COLORS.surface,
              padding: 16,
              borderRadius: 12,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#F59E0B" }}>Đăng xuất</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={{
              backgroundColor: COLORS.surface,
              padding: 16,
              borderRadius: 12,
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? (
              <ActivityIndicator color={COLORS.danger} />
            ) : (
              <Text style={{ color: COLORS.danger }}>Xóa tài khoản</Text>
            )}
          </Pressable>
        </View>

        <View style={{ padding: 16, alignItems: "center" }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
            SnapKO v1.0.0
          </Text>
        </View>
      </ScrollView>

      <InviteCodeGeneratorModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </View>
  );
}
