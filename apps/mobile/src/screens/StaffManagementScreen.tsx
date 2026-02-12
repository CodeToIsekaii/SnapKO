/**
 * StaffManagementScreen
 * Owners can view list of staff and reset their passwords
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Env } from "../env";

interface StaffMember {
  id: string;
  full_name: string;
  phone_number: string;
  status: string;
}

interface StaffManagementScreenProps {
  onBack: () => void;
}

export default function StaffManagementScreen({
  onBack,
}: StaffManagementScreenProps) {
  const { authState } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reset Password State
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const fetchStaff = async () => {
    try {
      if (authState.status !== "authenticated" || !authState.profile.businessId)
        return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, status")
        .eq("business_id", authState.profile.businessId)
        .eq("role", "STAFF")
        .in("status", ["ACTIVE", "PENDING"]) // Show Active and Pending
        .order("full_name");

      if (error) throw error;
      setStaffList(data || []);
    } catch (err: any) {
      console.error("Fetch staff error:", err);
      Alert.alert("Lỗi", "Không thể tải danh sách nhân viên");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Lỗi", "Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Lỗi", "Mật khẩu xác nhận không khớp");
      return;
    }
    if (!selectedStaff) return;

    setResetting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) throw new Error("No session");

      const response = await fetch(`${Env.BACKEND_URL}/admin/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          staffId: selectedStaff.id,
          newPassword: newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Reset failed");
      }

      Alert.alert(
        "Thành công",
        `Đã đổi mật khẩu cho ${selectedStaff.full_name}`,
        [{ text: "OK", onPress: () => setResetModalVisible(false) }],
      );
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      Alert.alert("Lỗi", err.message || "Không thể đặt lại mật khẩu");
    } finally {
      setResetting(false);
    }
  };

  const renderItem = ({ item }: { item: StaffMember }) => (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#1A1A1A",
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#2A2A2A",
      }}
    >
      <View>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          {item.full_name}
        </Text>
        <Text style={{ color: "#94A3B8", fontSize: 14, marginTop: 4 }}>
          {item.phone_number}
        </Text>
        {item.status === "PENDING" && (
          <View
            style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}
          >
            <Ionicons
              name="time"
              size={12}
              color="#EAB308"
              style={{ marginRight: 4 }}
            />
            <Text style={{ color: "#EAB308", fontSize: 12 }}>Chờ duyệt</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => {
          setSelectedStaff(item);
          setResetModalVisible(true);
        }}
        style={{
          padding: 8,
          backgroundColor: "#2A2A2A",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#E07A2F",
        }}
      >
        <Text style={{ color: "#E07A2F", fontSize: 12, fontWeight: "600" }}>
          Đổi Pass
        </Text>
      </TouchableOpacity>
    </View>
  );

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
        <Pressable
          onPress={onBack}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Ionicons name="arrow-back" size={20} color="#94A3B8" />
          <Text style={{ color: "#94A3B8", fontSize: 16, marginLeft: 4 }}>
            Quay lại
          </Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Quản lý nhân viên
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* List */}
      <View style={{ flex: 1, padding: 16 }}>
        {loading ? (
          <ActivityIndicator size="large" color="#E07A2F" />
        ) : staffList.length === 0 ? (
          <Text
            style={{ color: "#64748B", textAlign: "center", marginTop: 40 }}
          >
            Chưa có nhân viên nào.
          </Text>
        ) : (
          <FlatList
            data={staffList}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchStaff();
            }}
          />
        )}
      </View>

      {/* Reset Modal */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 16,
              padding: 24,
              borderWidth: 1,
              borderColor: "#2A2A2A",
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 8,
              }}
            >
              Đặt lại mật khẩu
            </Text>
            <Text style={{ color: "#94A3B8", marginBottom: 24 }}>
              Nhân viên:{" "}
              <Text style={{ color: "#E07A2F", fontWeight: "bold" }}>
                {selectedStaff?.full_name}
              </Text>
            </Text>

            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
              placeholderTextColor="#666"
              secureTextEntry
              style={{
                backgroundColor: "#121212",
                borderRadius: 12,
                padding: 16,
                color: "white",
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#2A2A2A",
                marginBottom: 16,
              }}
            />

            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Nhập lại mật khẩu mới"
              placeholderTextColor="#666"
              secureTextEntry
              style={{
                backgroundColor: "#121212",
                borderRadius: 12,
                padding: 16,
                color: "white",
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#2A2A2A",
                marginBottom: 24,
              }}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setResetModalVisible(false);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: "#2A2A2A",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#94A3B8", fontWeight: "600" }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={resetting}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: "#E07A2F",
                  alignItems: "center",
                  opacity: resetting ? 0.7 : 1,
                }}
              >
                {resetting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "600" }}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
