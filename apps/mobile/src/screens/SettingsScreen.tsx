/**
 * SettingsScreen - User settings with Delete Account option
 * Required for App Store compliance
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Env } from "../env";
import InviteCodeGeneratorModal from "../components/InviteCodeGeneratorModal";

const PRIVACY_URL = "https://snapko.vn/privacy";
const TERMS_URL = "https://snapko.vn/terms";
// Apple Compliance: Link to dashboard, not directly to pricing/payment page
const ACCOUNT_URL = "https://snapko.vn/dashboard";

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

  // Check if user is Owner
  const isOwner = userRole === "OWNER";

  const handleDeleteAccount = () => {
    Alert.alert(
      "⚠️ Xóa tài khoản",
      "Bạn có chắc chắn muốn xóa tài khoản?\n\n• Tất cả dữ liệu sẽ bị xóa sau 30 ngày\n• Hành động này không thể hoàn tác",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa tài khoản",
          style: "destructive",
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const token = await SecureStore.getItemAsync("session_token");
      if (!token) {
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
        // Clear local data
        await SecureStore.deleteItemAsync("session_token");
        await SecureStore.deleteItemAsync("refresh_token");
        await SecureStore.deleteItemAsync("profile_id");
        await SecureStore.deleteItemAsync("business_id");

        Alert.alert(
          "Đã yêu cầu xóa tài khoản",
          result.message || "Dữ liệu sẽ bị xóa hoàn toàn sau 30 ngày.",
          [{ text: "OK", onPress: onLogout }]
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

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Lỗi", "Không thể mở link này");
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
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
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              {userName || "Người dùng"}
            </Text>
            <Text style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>
              {userRole === "OWNER" ? "Chủ quán" : "Nhân viên"}
            </Text>

            {/* Edit Profile Button - Owner only */}
            {onEditProfile && (
              <Pressable
                onPress={onEditProfile}
                style={{
                  marginTop: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "#E07A2F", fontSize: 14 }}>
                  ✏️ Chỉnh sửa hồ sơ
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Staff Management - OWNER only */}
        {isOwner && (
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Text
              style={{
                color: "#64748B",
                fontSize: 12,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Quản lý nhân sự
            </Text>

            <View
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            >
              <Text
                style={{ color: "#94A3B8", fontSize: 14, marginBottom: 12 }}
              >
                Bạn đang là Chủ quán. Tạo mã mời để nhân viên tham gia quản lý
                kho.
              </Text>

              <Pressable
                onPress={() => setShowInviteModal(true)}
                style={{
                  backgroundColor: "#6B8E23",
                  borderRadius: 10,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 15 }}
                >
                  + Tạo mã mời nhân viên
                </Text>
              </Pressable>

              <Text
                style={{
                  color: "#64748B",
                  fontSize: 11,
                  marginTop: 8,
                  textAlign: "center",
                }}
              >
                Mã mời có hiệu lực trong 48 giờ
              </Text>
            </View>
          </View>
        )}

        {/* Account Management - Opens web (Apple compliant - no payment keywords) */}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Pressable
            onPress={() => openLink(ACCOUNT_URL)}
            style={{
              backgroundColor: "#E07A2F",
              borderRadius: 12,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>
              ⭐ Quản lý tài khoản
            </Text>
          </Pressable>
          <Text
            style={{
              color: "#64748B",
              fontSize: 11,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            Xem chi tiết gói dịch vụ của bạn
          </Text>
        </View>

        {/* Legal Links */}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Pháp lý
          </Text>

          <Pressable
            onPress={() => openLink(PRIVACY_URL)}
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              marginBottom: 8,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: "white" }}>Chính sách Quyền riêng tư</Text>
            <Text style={{ color: "#64748B" }}>→</Text>
          </Pressable>

          <Pressable
            onPress={() => openLink(TERMS_URL)}
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: "white" }}>Điều khoản Sử dụng</Text>
            <Text style={{ color: "#64748B" }}>→</Text>
          </Pressable>
        </View>

        {/* Account Actions */}
        <View style={{ padding: 16, paddingTop: 0 }}>
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            Tài khoản
          </Text>

          <Pressable
            onPress={onLogout}
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#F59E0B" }}>Đăng xuất</Text>
          </Pressable>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? (
              <ActivityIndicator color="#EF4444" style={{ marginRight: 8 }} />
            ) : null}
            <Text style={{ color: "#EF4444" }}>Xóa tài khoản</Text>
          </Pressable>

          <Text style={{ color: "#64748B", fontSize: 11, marginTop: 8 }}>
            Khi xóa tài khoản, tất cả dữ liệu sẽ bị xóa vĩnh viễn sau 30 ngày.
          </Text>
        </View>

        {/* App Info */}
        <View style={{ padding: 16, paddingTop: 24, alignItems: "center" }}>
          <Text style={{ color: "#64748B", fontSize: 12 }}>SnapKO v1.0.0</Text>
          <Text style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>
            © 2024 SnapKO Team
          </Text>
        </View>
      </ScrollView>

      {/* Invite Code Modal */}
      <InviteCodeGeneratorModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </View>
  );
}
