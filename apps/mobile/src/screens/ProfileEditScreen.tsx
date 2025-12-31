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
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Env } from "../env";

interface ProfileEditScreenProps {
  onBack: () => void;
  onSave: () => void;
  initialData?: {
    fullName?: string;
    businessName?: string;
    phoneNumber?: string;
  };
}

export default function ProfileEditScreen({
  onBack,
  onSave,
  initialData,
}: ProfileEditScreenProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    phoneNumber: "",
  });
  const [saving, setSaving] = useState(false);

  // Load initial data
  useEffect(() => {
    if (initialData) {
      setFormData({
        fullName: initialData.fullName || "",
        businessName: initialData.businessName || "",
        phoneNumber: initialData.phoneNumber || "",
      });
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!formData.fullName.trim()) {
      Alert.alert("Lỗi", "Tên không được để trống");
      return;
    }
    if (!formData.businessName.trim()) {
      Alert.alert("Lỗi", "Tên cửa hàng không được để trống");
      return;
    }

    setSaving(true);

    try {
      const token = await SecureStore.getItemAsync("session_token");
      if (!token) {
        Alert.alert("Lỗi", "Bạn cần đăng nhập lại");
        return;
      }

      // Update profile via Edge Function
      const response = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/update-profile`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: formData.fullName.trim(),
            businessName: formData.businessName.trim(),
            phoneNumber: formData.phoneNumber.trim() || null,
          }),
        }
      );

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

        {/* Business Name */}
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
