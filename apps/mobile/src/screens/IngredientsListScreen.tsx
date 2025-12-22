/**
 * IngredientsListScreen - Danh sách nguyên liệu với Soft Delete
 * Features: List, Search, Soft delete (archived), Unit cost display
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import * as SQLite from "expo-sqlite";

interface LocalIngredient {
  id: string;
  name: string;
  aliases: string;
  base_unit: string;
  unit_cost: number;
  warehouse_qty: number;
  bar_qty: number;
  archived: number;
}

interface IngredientsListScreenProps {
  onBack: () => void;
  onAddNew?: () => void;
}

export default function IngredientsListScreen({
  onBack,
  onAddNew,
}: IngredientsListScreenProps) {
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Load ingredients from local DB
  const loadIngredients = useCallback(async () => {
    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");
      const rows = await db.getAllAsync<LocalIngredient>(
        `SELECT * FROM local_ingredients 
         WHERE archived = ? 
         ORDER BY name ASC`,
        [showArchived ? 1 : 0]
      );
      setIngredients(rows);
    } catch (err) {
      console.log("Error loading ingredients:", err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  // Soft delete (archive)
  const handleArchive = async (id: string, name: string) => {
    Alert.alert(
      showArchived ? "Khôi phục nguyên liệu?" : "Ẩn nguyên liệu?",
      showArchived
        ? `Khôi phục "${name}" về danh sách chính?`
        : `"${name}" sẽ được ẩn nhưng vẫn giữ lịch sử COGS.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: showArchived ? "Khôi phục" : "Ẩn",
          style: showArchived ? "default" : "destructive",
          onPress: async () => {
            try {
              const db = await SQLite.openDatabaseAsync("snapko.db");
              await db.runAsync(
                "UPDATE local_ingredients SET archived = ? WHERE id = ?",
                [showArchived ? 0 : 1, id]
              );
              loadIngredients();
            } catch (err) {
              Alert.alert("Lỗi", "Không thể cập nhật nguyên liệu");
            }
          },
        },
      ]
    );
  };

  // Filter by search
  const filtered = ingredients.filter(
    (ing) =>
      ing.name.toLowerCase().includes(search.toLowerCase()) ||
      (ing.aliases && ing.aliases.toLowerCase().includes(search.toLowerCase()))
  );

  // Calculate total value
  const totalValue = ingredients.reduce(
    (sum, ing) => sum + (ing.warehouse_qty + ing.bar_qty) * ing.unit_cost,
    0
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
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Nguyên liệu
        </Text>
        {onAddNew && (
          <Pressable onPress={onAddNew}>
            <Text style={{ color: "#E07A2F", fontSize: 16 }}>+ Thêm</Text>
          </Pressable>
        )}
      </View>

      {/* Search */}
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm kiếm..."
          placeholderTextColor="#64748B"
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 12,
            padding: 12,
            color: "white",
          }}
        />
      </View>

      {/* Toggle archived */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          marginBottom: 8,
          gap: 8,
        }}
      >
        <Pressable
          onPress={() => setShowArchived(false)}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: !showArchived ? "#E07A2F" : "#1A1A1A",
          }}
        >
          <Text style={{ color: "white" }}>Đang dùng</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowArchived(true)}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: showArchived ? "#E07A2F" : "#1A1A1A",
          }}
        >
          <Text style={{ color: "white" }}>Đã ẩn</Text>
        </Pressable>
      </View>

      {/* Summary */}
      {!showArchived && (
        <View
          style={{
            marginHorizontal: 16,
            padding: 16,
            backgroundColor: "#1A1A1A",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 12 }}>
            Tổng giá trị tồn kho
          </Text>
          <Text style={{ color: "#6B8E23", fontSize: 24, fontWeight: "700" }}>
            {totalValue.toLocaleString("vi-VN")} đ
          </Text>
          <Text style={{ color: "#64748B", fontSize: 12 }}>
            {ingredients.length} nguyên liệu
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadIngredients} />
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#64748B" }}>
              {showArchived
                ? "Không có nguyên liệu đã ẩn"
                : "Chưa có nguyên liệu"}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const totalQty = (item.warehouse_qty || 0) + (item.bar_qty || 0);
          const value = totalQty * item.unit_cost;

          return (
            <View
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  {item.name}
                </Text>
                <Text style={{ color: "#6B8E23", fontWeight: "600" }}>
                  {value.toLocaleString("vi-VN")} đ
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  Kho: {item.warehouse_qty || 0} {item.base_unit}
                </Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  Quầy: {item.bar_qty || 0} {item.base_unit}
                </Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  Giá: {item.unit_cost.toLocaleString("vi-VN")} đ/
                  {item.base_unit}
                </Text>
              </View>

              <Pressable onPress={() => handleArchive(item.id, item.name)}>
                <Text
                  style={{
                    color: showArchived ? "#E07A2F" : "#E63946",
                    fontSize: 12,
                    textAlign: "right",
                  }}
                >
                  {showArchived ? "Khôi phục" : "Ẩn nguyên liệu"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}
