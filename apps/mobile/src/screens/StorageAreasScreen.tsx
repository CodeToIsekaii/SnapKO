/**
 * StorageAreasScreen - Quản lý khu vực kho
 * CHAIN: thêm / đổi tên / xóa khu vực
 * PRO:   đổi tên khu vực
 * FREE:  chỉ xem
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

interface StorageArea {
  id: string;
  name: string;
  type: "STORAGE" | "SERVICE";
  isDefault: boolean;
  isActive: boolean;
  _count?: { stockLevels: number };
}

export default function StorageAreasScreen() {
  const { authState } = useAuth();
  const tier =
    authState.status === "authenticated" || authState.status === "needs_setup"
      ? authState.profile.tier ?? "FREE"
      : "FREE";
  const isChain = tier === "CHAIN";

  const [areas, setAreas] = useState<StorageArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingArea, setEditingArea] = useState<StorageArea | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<StorageArea[]>("/storage-areas");
      setAreas(data ?? []);
    } catch (e) {
      Alert.alert("Lỗi", "Không tải được danh sách khu vực kho");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingArea(null);
    setNameInput("");
    setModalVisible(true);
  };

  const openEdit = (area: StorageArea) => {
    setEditingArea(area);
    setNameInput(area.name);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!nameInput.trim()) return;
    setSaving(true);
    try {
      if (editingArea) {
        await api.patch(`/storage-areas/${editingArea.id}`, { name: nameInput.trim() });
      } else {
        await api.post("/storage-areas", { name: nameInput.trim(), type: "STORAGE" });
      }
      setModalVisible(false);
      load();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.message ?? "Không thể lưu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (area: StorageArea) => {
    Alert.alert(
      "Xóa khu vực kho",
      `Xóa "${area.name}"? Khu vực kho phải không còn tồn kho.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/storage-areas/${area.id}`);
              load();
            } catch (e: any) {
              Alert.alert("Không thể xóa", e?.message ?? "Lỗi không xác định");
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (area: StorageArea) => {
    try {
      await api.patch(`/storage-areas/${area.id}`, { isActive: !area.isActive });
      load();
    } catch (e: any) {
      Alert.alert("Lỗi", e?.message ?? "Không thể cập nhật");
    }
  };

  const renderArea = ({ item }: { item: StorageArea }) => (
    <View style={[styles.row, !item.isActive && styles.rowInactive]}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={item.type === "SERVICE" ? "wine-outline" : "archive-outline"}
          size={20}
          color={item.isActive ? "#E07A2F" : "#9CA3AF"}
        />
        <View style={{ marginLeft: 10 }}>
          <Text style={[styles.areaName, !item.isActive && { color: "#9CA3AF" }]}>
            {item.name}
            {item.isDefault ? "  ✦" : ""}
          </Text>
          <Text style={styles.areaType}>
            {item.type === "STORAGE" ? "Kho" : "Quầy phục vụ"}
            {item._count?.stockLevels ? `  ·  ${item._count.stockLevels} NL` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        {(isChain || tier === "PRO") && (
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
            <Ionicons name="pencil-outline" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        {isChain && !item.isDefault && (
          <>
            <TouchableOpacity onPress={() => handleToggleActive(item)} style={styles.actionBtn}>
              <Ionicons
                name={item.isActive ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#6B7280"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Khu vực kho</Text>
        {isChain && (
          <TouchableOpacity onPress={openCreate} style={styles.addBtn}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {!isChain && (
        <View style={styles.tierNotice}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.tierNoticeText}>
            {tier === "PRO"
              ? "Gói PRO có 2 khu vực cố định. Nâng lên CHAIN để thêm khu vực."
              : "Gói FREE chỉ có 1 kho tổng."}
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#E07A2F" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={areas}
          keyExtractor={(a) => a.id}
          renderItem={renderArea}
          contentContainerStyle={{ padding: 16 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>Chưa có khu vực kho nào</Text>
          }
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {editingArea ? "Đổi tên khu vực" : "Thêm khu vực kho"}
            </Text>
            <TextInput
              style={styles.input}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Tên khu vực (VD: Kho lạnh, Bar 2...)"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  addBtn: {
    backgroundColor: "#E07A2F", borderRadius: 8, padding: 6,
  },
  tierNotice: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "#F3F4F6", borderRadius: 8, padding: 10,
  },
  tierNoticeText: { flex: 1, fontSize: 13, color: "#6B7280" },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", borderRadius: 10, padding: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowInactive: { opacity: 0.55 },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  areaName: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  areaType: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: { padding: 6 },
  separator: { height: 8 },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 40 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937", marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8,
    padding: 12, fontSize: 16, color: "#1F2937", marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, padding: 13, borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB",
    alignItems: "center",
  },
  cancelText: { fontSize: 15, color: "#6B7280" },
  saveBtn: {
    flex: 1, padding: 13, borderRadius: 8, backgroundColor: "#E07A2F", alignItems: "center",
  },
  saveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
