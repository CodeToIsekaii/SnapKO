/**
 * RecipeListScreen - Menu listing with COGS display
 * Features: List recipes, show COGS/profit, navigate to edit, Quick Sell
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { getDB } from "../db";
// Remove * as SQLite from "expo-sqlite";
import {
  calculateRecipeCOGS,
  deductInventoryForSale,
} from "../features/cogs/cogsCalculator";

interface RecipeWithCOGS {
  id: string;
  name: string;
  price: number;
  category: string;
  cogs: number;
  ingredientCount: number;
  is_active: number; // 1 = active, 0 = hidden
}

interface RecipeListScreenProps {
  onBack: () => void;
  onEditRecipe: (recipeId: string) => void;
  onAddRecipe: () => void;
  onScanRecipe?: () => void;
}

export default function RecipeListScreen({
  onBack,
  onEditRecipe,
  onAddRecipe,
  onScanRecipe,
}: RecipeListScreenProps) {
  const [recipes, setRecipes] = useState<RecipeWithCOGS[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "hidden">("active");
  const [searchQuery, setSearchQuery] = useState("");

  const loadRecipes = useCallback(async () => {
    try {
      const db = await getDB();

      // Check user role
      const userProfile = await db.getFirstAsync<{ role: string }>(
        "SELECT role FROM local_profiles LIMIT 1"
      );
      setIsOwner(userProfile?.role === "OWNER");

      // Load recipes (include is_active for filtering)
      const recipeRows = await db.getAllAsync<{
        id: string;
        name: string;
        price: number;
        category: string;
        is_active: number;
      }>("SELECT * FROM local_recipes ORDER BY name");

      // Calculate COGS for each
      const recipesWithCOGS: RecipeWithCOGS[] = [];
      for (const r of recipeRows) {
        const { cogs, ingredientCount } = await calculateRecipeCOGS(db, r.id);
        recipesWithCOGS.push({
          ...r,
          cogs,
          ingredientCount,
          is_active: r.is_active,
        });
      }

      setRecipes(recipesWithCOGS);
    } catch (err) {
      console.error("Load error:", err);
    }
  }, []);

  // Pull-to-refresh: sync from cloud then reload
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { fetchMasterDataUpdates } = await import("../sync/syncEngine");
      // Also pull inventory logs if needed
      const { pullAllData } = await import("../sync/pullSync");

      await Promise.all([fetchMasterDataUpdates(), pullAllData()]);

      await loadRecipes();
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadRecipes]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Soft Delete (Archive)
  const deleteRecipe = (id: string, name: string) => {
    Alert.alert("Ẩn món?", `"${name}" sẽ chuyển vào mục Đã ẩn.`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Ẩn",
        style: "destructive",
        onPress: async () => {
          // Optimistic UI Update handled by loadRecipes after DB update
          // or we can setRecipes locally for faster feedback

          const db = await getDB();

          // 1. Local Update
          await db.runAsync(
            "UPDATE local_recipes SET is_active = 0 WHERE id = ?",
            [id]
          );

          // 2. Queue Sync
          const { addToSyncQueue } = await import("../sync/syncEngine");
          await addToSyncQueue("recipes", "UPSERT", {
            id,
            is_active: false,
            updated_at: new Date().toISOString(),
          });

          loadRecipes();
        },
      },
    ]);
  };

  // Restore Recipe
  const restoreRecipe = async (id: string, name: string) => {
    const db = await getDB();

    // 1. Local Update
    await db.runAsync("UPDATE local_recipes SET is_active = 1 WHERE id = ?", [
      id,
    ]);

    // 2. Queue Sync
    const { addToSyncQueue } = await import("../sync/syncEngine");
    await addToSyncQueue("recipes", "UPSERT", {
      id,
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    Alert.alert("Đã khôi phục", `Món "${name}" đã quay lại menu bán.`);
    loadRecipes();
  };

  // Quick Sell - Deduct inventory immediately
  const quickSell = async (recipe: RecipeWithCOGS) => {
    const db = await getDB();
    const result = await deductInventoryForSale(db, recipe.id, 1);

    if (result.success) {
      Alert.alert(
        "✅ Đã bán 1 " + recipe.name,
        result.deducted.length > 0
          ? "Đã trừ kho:\n" + result.deducted.join("\n")
          : "Không có nguyên liệu để trừ",
        [{ text: "OK" }]
      );
    } else {
      Alert.alert("Lỗi", result.error || "Không thể trừ kho");
    }
  };

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
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          Menu
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {/* AI and Add buttons - Owner only - Active Tab only */}
          {isOwner && activeTab === "active" && (
            <>
              {onScanRecipe && (
                <Pressable onPress={onScanRecipe}>
                  <Text style={{ color: "#6B8E23", fontSize: 16 }}>🤖 AI</Text>
                </Pressable>
              )}
              <Pressable onPress={onAddRecipe}>
                <Text style={{ color: "#E07A2F", fontSize: 16 }}>+ Thêm</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Stats - Staff only sees count */}
      <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#1A1A1A",
            borderRadius: 12,
            padding: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 12 }}>Món đang bán</Text>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "700" }}>
            {recipes.filter((r) => r.is_active === 1).length}
          </Text>
        </View>
        {/* Avg Margin - Owner only */}
        {isOwner && (
          <View
            style={{
              flex: 1,
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <Text style={{ color: "#64748B", fontSize: 12 }}>Avg Margin</Text>
            <Text style={{ color: "#55A630", fontSize: 24, fontWeight: "700" }}>
              {recipes.length > 0
                ? Math.round(
                    recipes.reduce(
                      (sum, r) =>
                        sum +
                        (r.price > 0
                          ? ((r.price - r.cogs) / r.price) * 100
                          : 0),
                      0
                    ) / recipes.length
                  )
                : 0}
              %
            </Text>
          </View>
        )}
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <TextInput
          placeholder="Tìm tên món..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
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
          onPress={() => setActiveTab("active")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: activeTab === "active" ? "#E07A2F" : "#2A2A2A",
            marginRight: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Đang dùng</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("hidden")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: activeTab === "hidden" ? "#64748B" : "#2A2A2A",
            marginLeft: 6,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Đã ẩn</Text>
        </Pressable>
      </View>

      {/* List - Filtered by tab */}
      <FlatList
        data={recipes.filter((r) => {
          const matchesTab =
            activeTab === "active" ? r.is_active === 1 : r.is_active === 0;
          const matchesSearch = r.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase());
          return matchesTab && matchesSearch;
        })}
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
              {activeTab === "active"
                ? "Chưa có món nào"
                : "Không có món nào đã ẩn"}
            </Text>
            {isOwner && activeTab === "active" && (
              <Pressable onPress={onAddRecipe} style={{ marginTop: 16 }}>
                <Text style={{ color: "#E07A2F" }}>+ Thêm món đầu tiên</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const profit = item.price - item.cogs;
          const margin = item.price > 0 ? (profit / item.price) * 100 : 0;

          return (
            <Pressable
              onPress={() =>
                isOwner && activeTab === "active" && onEditRecipe(item.id)
              }
              onLongPress={() =>
                isOwner &&
                activeTab === "active" &&
                deleteRecipe(item.id, item.name)
              }
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                opacity: activeTab === "hidden" ? 0.7 : 1,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontWeight: "600",
                    fontSize: 16,
                    flex: 1,
                    textDecorationLine:
                      activeTab === "hidden" ? "line-through" : "none",
                  }}
                >
                  {item.name}
                </Text>
                {isOwner && (
                  <Text style={{ color: "#55A630", fontWeight: "600" }}>
                    {item.price.toLocaleString("vi-VN")} đ
                  </Text>
                )}
              </View>

              {isOwner && (
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                    COGS: {item.cogs.toLocaleString("vi-VN")} đ
                  </Text>
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                    Lãi: {profit.toLocaleString("vi-VN")} đ
                  </Text>
                  <Text
                    style={{
                      color:
                        margin >= 50
                          ? "#55A630"
                          : margin >= 30
                          ? "#F59E0B"
                          : "#EF4444",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {margin.toFixed(0)}%
                  </Text>
                </View>
              )}

              {item.category && (
                <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                  {item.category} · {item.ingredientCount} nguyên liệu
                </Text>
              )}

              {/* isOwner Actions */}
              {isOwner && (
                <View style={{ marginTop: 12 }}>
                  {activeTab === "active" ? (
                    /* QUICK SELL - Only in Active Tab */
                    <Pressable
                      onPress={() => quickSell(item)}
                      style={{
                        backgroundColor: "#6B8E23",
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "600" }}>
                        🛒 Bán 1 ly
                      </Text>
                    </Pressable>
                  ) : (
                    /* RESTORE - Only in Hidden Tab */
                    <Pressable
                      onPress={() => restoreRecipe(item.id, item.name)}
                      style={{
                        backgroundColor: "#E07A2F",
                        borderRadius: 8,
                        paddingVertical: 10,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "white", fontWeight: "600" }}>
                        ♻️ Khôi phục
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
