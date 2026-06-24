/**
 * AdHocTransferScreen - Fast material transfer (Kho Tổng -> Quầy Bar)
 * FEATURE: STANDARD Mode only
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getDB } from "../db";
import { BufferedTextInput } from "../components/BufferedTextInput";
import { parseNumericField } from "./inventoryCaptureValidation";

interface AdHocTransferScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function AdHocTransferScreen({
  onBack,
  onSuccess,
}: AdHocTransferScreenProps) {
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync(
        "SELECT id, name, base_unit FROM local_ingredients ORDER BY name ASC"
      );
      setIngredients(rows);
    } catch (err) {
      console.error("Load ingredients failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdateQty = (id: string, qtyStr: string) => {
    const qty = parseNumericField(qtyStr);
    if (qty <= 0) {
      const newMap = new Map(selectedItems);
      newMap.delete(id);
      setSelectedItems(newMap);
    } else {
      const newMap = new Map(selectedItems);
      newMap.set(id, qty);
      setSelectedItems(newMap);
    }
  };

  const handleTransfer = async () => {
    if (selectedItems.size === 0) {
      Alert.alert("Chưa chọn món", "Vui lòng nhập số lượng cho ít nhất 1 món.");
      return;
    }

    try {
      const db = await getDB();
      const id = Crypto.randomUUID();
      const itemsArr = Array.from(selectedItems.entries()).map(
        ([ingId, qty]) => {
          const ing = ingredients.find((i) => i.id === ingId);
          return {
            ingredient_id: ingId,
            ingredient_name: ing?.name,
            quantity: qty,
            unit: ing?.base_unit,
          };
        }
      );

      // Find Warehouse and Bar area IDs
      const areas = await db.getAllAsync<{ id: string; type: string }>(
        "SELECT id, type FROM local_storage_areas"
      );
      const warehouse = areas.find((a) => a.type === "STORAGE")?.id;
      const bar = areas.find((a) => a.type === "SERVICE")?.id;

      await db.runAsync(
        `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          "TRANSFER",
          "BAR", // Valid enum value: WAREHOUSE or BAR (was "mobile" which is invalid)
          JSON.stringify({
            items: itemsArr,
            from_area_id: warehouse,
            to_area_id: bar,
            notes: "Cấp hàng khẩn từ App",
          }),
          new Date().toISOString(),
          0,
        ]
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Thành công", "Đã lưu phiếu chuyển kho.");
      onSuccess();
    } catch (err) {
      console.error("Transfer failed:", err);
      Alert.alert("Lỗi", "Không thể lưu phiếu chuyển.");
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const qty = selectedItems.get(item.id);
    const isSelected = qty !== undefined;

    return (
      <View style={[styles.itemRow, isSelected && styles.itemRowSelected]}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemUnit}>{item.base_unit}</Text>
        </View>
        <BufferedTextInput
          style={styles.qtyInput}
          placeholder="0"
          placeholderTextColor="#64748B"
          keyboardType="decimal-pad"
          value={qty?.toString() || ""}
          onCommitText={(val) => handleUpdateQty(item.id, val)}
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 8,
            marginLeft: -8,
            zIndex: 10,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#E07A2F" />
          <Text style={{ color: "#E07A2F", marginLeft: 4, fontWeight: "600" }}>
            Quay lại
          </Text>
        </TouchableOpacity>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            marginRight: 40, // Balance the back button space
          }}
        >
          <Text style={styles.title}>Cấp hàng khẩn</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm nguyên liệu..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
        />
        {search !== "" && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#E07A2F" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          initialNumToRender={20}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Đã chọn:{" "}
          <Text style={{ color: "#E07A2F", fontWeight: "700" }}>
            {selectedItems.size}
          </Text>{" "}
          món
        </Text>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            selectedItems.size === 0 && styles.submitBtnDisabled,
          ]}
          onPress={handleTransfer}
          disabled={selectedItems.size === 0}
        >
          <Text style={styles.submitBtnText}>XÁC NHẬN CHUYỂN</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  searchInput: {
    flex: 1,
    color: "white",
    marginLeft: 10,
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  itemRowSelected: {
    borderColor: "#E07A2F",
    backgroundColor: "#1A1A1A",
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemUnit: {
    color: "#64748B",
    fontSize: 12,
  },
  qtyInput: {
    backgroundColor: "#2A2A2A",
    color: "#F5F3EF",
    width: 80,
    height: 40,
    borderRadius: 8,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#3F3F3F",
  },
  footer: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "#1A1A1A",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerText: {
    color: "#B8B3A8",
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: "#E07A2F",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  submitBtnDisabled: {
    backgroundColor: "#334155",
  },
  submitBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
});
