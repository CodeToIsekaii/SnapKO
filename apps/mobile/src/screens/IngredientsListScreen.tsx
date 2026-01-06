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
import { getDB } from "../db";

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
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Initial load from local DB
  const loadIngredients = useCallback(async () => {
    try {
      const db = await getDB();

      // Check user role
      const userProfile = await db.getFirstAsync<{ role: string }>(
        "SELECT role FROM local_profiles LIMIT 1"
      );
      setIsOwner(userProfile?.role === "OWNER");

      const rows = await db.getAllAsync<LocalIngredient>(
        `SELECT * FROM local_ingredients ORDER BY name ASC`
      );
      setIngredients(rows);
    } catch (err) {
      console.log("Error loading ingredients:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pull-to-refresh: sync from cloud then reload
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { pullAllData } = await import("../sync/pullSync");
      await pullAllData();
      await loadIngredients();
    } catch (err) {
      console.log("Refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadIngredients]);

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
              const db = await getDB();
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

  // Filter by tab and search
  const filtered = ingredients.filter((ing) => {
    const matchesTab = showArchived ? ing.archived === 1 : !ing.archived;
    const matchesSearch =
      ing.name.toLowerCase().includes(search.toLowerCase()) ||
      (ing.aliases && ing.aliases.toLowerCase().includes(search.toLowerCase()));
    return matchesTab && matchesSearch;
  });

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
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack} style={{ flex: 1 }}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text
          style={{
            color: "white",
            fontSize: 18,
            fontWeight: "600",
            flex: 2,
            textAlign: "center",
          }}
        >
          Nguyên liệu
        </Text>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 12,
          }}
        >
          {onAddNew && (
            <Pressable onPress={onAddNew}>
              <Text style={{ color: "#E07A2F", fontSize: 16 }}>+ Thêm</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Stats - Standardized with Menu style */}
      {!showArchived && (
        <View
          style={{
            flexDirection: "row",
            padding: 16,
            gap: 12,
            paddingBottom: 8,
          }}
        >
          {isOwner && (
            <View
              style={{
                flex: 1,
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#64748B", fontSize: 12 }}>
                Tổng giá trị
              </Text>
              <Text
                style={{
                  color: "#6B8E23",
                  fontSize: 24,
                  fontWeight: "700",
                }}
              >
                {totalValue.toLocaleString("vi-VN")} đ
              </Text>
            </View>
          )}
          <View
            style={{
              flex: 1,
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#64748B", fontSize: 12 }}>
              Nguyên liệu đang dùng
            </Text>
            <Text style={{ color: "white", fontSize: 24, fontWeight: "700" }}>
              {ingredients.filter((i) => !i.archived).length}
            </Text>
          </View>
        </View>
      )}

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <TextInput
          placeholder="Tìm nguyên liệu..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 8,
            padding: 12,
            color: "white",
            borderWidth: 1,
            borderColor: "#2A2A2A",
          }}
        />
      </View>

      {/* Tabs: Active / Hidden */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          marginBottom: 12,
        }}
      >
        <Pressable
          onPress={() => setShowArchived(false)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: !showArchived ? "#E07A2F" : "#2A2A2A",
            marginRight: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Đang dùng</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowArchived(true)}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: showArchived ? "#64748B" : "#2A2A2A",
            marginLeft: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Đã ẩn</Text>
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E07A2F"]}
            tintColor="#E07A2F"
          />
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
                {isOwner && (
                  <Text style={{ color: "#6B8E23", fontWeight: "600" }}>
                    {value.toLocaleString("vi-VN")} đ
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 16, marginBottom: 8 }}>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  Kho: {item.warehouse_qty || 0} {item.base_unit}
                </Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  Quầy: {item.bar_qty || 0} {item.base_unit}
                </Text>
                {isOwner && (
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    Giá: {item.unit_cost.toLocaleString("vi-VN")} đ/
                    {item.base_unit}
                  </Text>
                )}
              </View>

              {isOwner && (
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
              )}
            </View>
          );
        }}
      />
    </View>
  );
}
