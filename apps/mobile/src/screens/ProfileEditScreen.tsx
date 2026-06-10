/**
 * ProfileEditScreen - Owner Profile Edit (Mobile)
 * Edit: Owner name, Business name, Contact info
 * Following .UXUIrules Dark Mode palette
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { Env } from "../env";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";

interface ProfileEditScreenProps {
  onBack: () => void;
  onSave: () => void;
  isOwner?: boolean;
  initialData?: {
    fullName?: string;
    businessName?: string;
    phoneNumber?: string;
  };
}

export default function ProfileEditScreen({
  onBack,
  onSave,
  isOwner = true,
  initialData,
}: ProfileEditScreenProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    phoneNumber: "",
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Password Change State
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  const { updatePassword } = useAuth();

  // Load initial data and fetch business name for owners
  useEffect(() => {
    const loadData = async () => {
      // Set initial data from props
      if (initialData) {
        setFormData({
          fullName: initialData.fullName || "",
          businessName: initialData.businessName || "",
          phoneNumber: initialData.phoneNumber || "",
        });
      }

      // For owners, fetch business name via BE-SnapKO /profiles/me
      if (isOwner) {
        try {
          const profile = await api.get<{
            business?: { name?: string };
          }>("/profiles/me");
          const businessName = profile?.business?.name || "";
          if (businessName) {
            setFormData((prev) => ({ ...prev, businessName }));
          }
        } catch (err) {
          console.error("[ProfileEdit] Failed to load business name:", err);
        }
      }

      setLoading(false);
    };

    loadData();
  }, [initialData, isOwner]);

  const handleSave = async () => {
    if (!formData.fullName.trim()) {
      Alert.alert("Lỗi", "Tên không được để trống");
      return;
    }
    // Only validate businessName for owners
    if (isOwner && !formData.businessName.trim()) {
      Alert.alert("Lỗi", "Tên cửa hàng không được để trống");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (sessionError || !token) {
        Alert.alert("Lỗi", "Bạn cần đăng nhập lại");
        return;
      }

      // Update profile via Edge Function
      const response = await fetch(`${Env.BACKEND_URL}/user/update-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          businessName: isOwner ? formData.businessName.trim() : undefined,
          phoneNumber: formData.phoneNumber.trim() || null,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert("Thành công", "Đã cập nhật thông tin!", [
          { text: "OK", onPress: onSave },
        ]);
      } else {
        Alert.alert("Lỗi", result.error || "Không thể cập nhật thông tin");
      }
    } catch (err: any) {
      console.error("Profile update failed:", err);
      Alert.alert("Lỗi", "Có lỗi xảy ra khi cập nhật");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Lỗi", "Vui lòng điền đầy đủ thông tin mật khẩu");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Lỗi", "Mật khẩu mới không khớp");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Lỗi", "Mật khẩu mới phải có ít nhất 6 ký tự");
      return;
    }

    setChangingPassword(true);

    try {
      await updatePassword(currentPassword, newPassword);
      Alert.alert("Thành công", "Đổi mật khẩu thành công!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordChange(false);
    } catch (err: any) {
      Alert.alert("Lỗi", err.message || "Không thể đổi mật khẩu");
    } finally {
      setChangingPassword(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#121212",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#E07A2F" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Chỉnh sửa hồ sơ
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Full Name */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              color: "#B8B3A8",
              fontSize: 14,
              fontWeight: "500",
              marginBottom: 8,
            }}
          >
            Họ và tên *
          </Text>
          <TextInput
            value={formData.fullName}
            onChangeText={(text) =>
              setFormData({ ...formData, fullName: text })
            }
            placeholder="Nguyễn Văn A"
            placeholderTextColor="#666"
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              color: "white",
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#2A2A2A",
            }}
          />
        </View>

        {/* Business Name - Owner Only */}
        {isOwner && (
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                color: "#B8B3A8",
                fontSize: 14,
                fontWeight: "500",
                marginBottom: 8,
              }}
            >
              Tên cửa hàng *
            </Text>
            <TextInput
              value={formData.businessName}
              onChangeText={(text) =>
                setFormData({ ...formData, businessName: text })
              }
              placeholder="Cà phê Mê Linh"
              placeholderTextColor="#666"
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                color: "white",
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            />
            <Text
              style={{
                color: "#64748B",
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Tên này sẽ hiển thị cho nhân viên khi tham gia
            </Text>
          </View>
        )}

        {/* Phone Number */}
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              color: "#B8B3A8",
              fontSize: 14,
              fontWeight: "500",
              marginBottom: 8,
            }}
          >
            Số điện thoại
          </Text>
          <TextInput
            value={formData.phoneNumber}
            onChangeText={(text) =>
              setFormData({ ...formData, phoneNumber: text })
            }
            placeholder="0901234567"
            placeholderTextColor="#666"
            keyboardType="phone-pad"
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              color: "white",
              fontSize: 16,
              borderWidth: 1,
              borderColor: "#2A2A2A",
            }}
          />
          <Text
            style={{
              color: "#64748B",
              fontSize: 12,
              marginTop: 6,
            }}
          >
            Số liên hệ khi nhân viên cần hỗ trợ
          </Text>
        </View>
        {/* Password Change Section - Collapsible */}
        <View style={{ marginTop: 24, marginBottom: 16 }}>
          <Pressable
            onPress={() => setShowPasswordChange(!showPasswordChange)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: "#2A2A2A",
            }}
          >
            <Text style={{ color: "#E07A2F", fontSize: 16, fontWeight: "600" }}>
              {showPasswordChange ? "▼ Đổi mật khẩu" : "▶ Đổi mật khẩu"}
            </Text>
          </Pressable>

          {showPasswordChange && (
            <View style={{ gap: 12, marginTop: 8 }}>
              {/* Current Password */}
              <View>
                <Text style={{ color: "#B8B3A8", marginBottom: 6 }}>
                  Mật khẩu hiện tại
                </Text>
                <TextInput
                  value={passwordData.currentPassword}
                  onChangeText={(t) =>
                    setPasswordData({ ...passwordData, currentPassword: t })
                  }
                  secureTextEntry
                  style={{
                    backgroundColor: "#1A1A1A",
                    padding: 12,
                    borderRadius: 8,
                    color: "white",
                    borderWidth: 1,
                    borderColor: "#333",
                  }}
                  placeholderTextColor="#666"
                  placeholder="Nhập mật khẩu cũ"
                />
              </View>

              {/* New Password */}
              <View>
                <Text style={{ color: "#B8B3A8", marginBottom: 6 }}>
                  Mật khẩu mới
                </Text>
                <TextInput
                  value={passwordData.newPassword}
                  onChangeText={(t) =>
                    setPasswordData({ ...passwordData, newPassword: t })
                  }
                  secureTextEntry
                  style={{
                    backgroundColor: "#1A1A1A",
                    padding: 12,
                    borderRadius: 8,
                    color: "white",
                    borderWidth: 1,
                    borderColor: "#333",
                  }}
                  placeholderTextColor="#666"
                  placeholder="Nhập mật khẩu mới"
                />
              </View>

              {/* Confirm Password */}
              <View>
                <Text style={{ color: "#B8B3A8", marginBottom: 6 }}>
                  Xác nhận mật khẩu mới
                </Text>
                <TextInput
                  value={passwordData.confirmPassword}
                  onChangeText={(t) =>
                    setPasswordData({ ...passwordData, confirmPassword: t })
                  }
                  secureTextEntry
                  style={{
                    backgroundColor: "#1A1A1A",
                    padding: 12,
                    borderRadius: 8,
                    color: "white",
                    borderWidth: 1,
                    borderColor: "#333",
                  }}
                  placeholderTextColor="#666"
                  placeholder="Nhập lại mật khẩu mới"
                />
              </View>

              {/* Save Password Button */}
              <Pressable
                onPress={handlePasswordChange}
                disabled={changingPassword}
                style={{
                  backgroundColor: "#2A2A2A",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: "#E07A2F",
                }}
              >
                {changingPassword ? (
                  <ActivityIndicator color="#E07A2F" />
                ) : (
                  <Text
                    style={{
                      color: "#E07A2F",
                      fontWeight: "600",
                    }}
                  >
                    Cập nhật mật khẩu
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={{ padding: 16, backgroundColor: "#1A1A1A" }}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: saving ? "#666" : "#E07A2F",
            padding: 16,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              💾 Lưu thay đổi
            </Text>
          )}
        </Pressable>

        <Text
          style={{
            color: "#64748B",
            fontSize: 12,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Thông tin này được lưu trên Cloud và tự đồng bộ với tất cả thiết bị.
        </Text>
      </View>
    </View>
  );
}
