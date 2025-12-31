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
} from "react-native";
import * as SQLite from "expo-sqlite";
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
  const [loading, setLoading] = useState(true);

  const loadRecipes = useCallback(async () => {
    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");

      // Load recipes
      const recipeRows = await db.getAllAsync<{
        id: string;
        name: string;
        price: number;
        category: string;
      }>("SELECT * FROM local_recipes ORDER BY name");

      // Calculate COGS for each
      const recipesWithCOGS: RecipeWithCOGS[] = [];
      for (const r of recipeRows) {
        const { cogs, ingredientCount } = await calculateRecipeCOGS(db, r.id);
        recipesWithCOGS.push({
          ...r,
          cogs,
          ingredientCount,
        });
      }

      setRecipes(recipesWithCOGS);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const deleteRecipe = (id: string, name: string) => {
    Alert.alert("Xóa món?", `"${name}" sẽ bị xóa vĩnh viễn.`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          const db = await SQLite.openDatabaseAsync("snapko.db");
          await db.runAsync("DELETE FROM local_recipes WHERE id = ?", [id]);
          await db.runAsync(
            "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?",
            [id]
          );
          loadRecipes();
        },
      },
    ]);
  };

  // Quick Sell - Deduct inventory immediately
  const quickSell = async (recipe: RecipeWithCOGS) => {
    const db = await SQLite.openDatabaseAsync("snapko.db");
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
          {onScanRecipe && (
            <Pressable onPress={onScanRecipe}>
              <Text style={{ color: "#6B8E23", fontSize: 16 }}>🤖 AI</Text>
            </Pressable>
          )}
          <Pressable onPress={onAddRecipe}>
            <Text style={{ color: "#E07A2F", fontSize: 16 }}>+ Thêm</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      <View style={{ flexDirection: "row", padding: 16, gap: 12 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#1A1A1A",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <Text style={{ color: "#64748B", fontSize: 12 }}>Tổng món</Text>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "700" }}>
            {recipes.length}
          </Text>
        </View>
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
                      (r.price > 0 ? ((r.price - r.cogs) / r.price) * 100 : 0),
                    0
                  ) / recipes.length
                )
              : 0}
            %
          </Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadRecipes} />
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#64748B" }}>Chưa có món nào</Text>
            <Pressable onPress={onAddRecipe} style={{ marginTop: 16 }}>
              <Text style={{ color: "#E07A2F" }}>+ Thêm món đầu tiên</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const profit = item.price - item.cogs;
          const margin = item.price > 0 ? (profit / item.price) * 100 : 0;

          return (
            <Pressable
              onPress={() => onEditRecipe(item.id)}
              onLongPress={() => deleteRecipe(item.id, item.name)}
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
                }}
              >
                <Text
                  style={{
                    color: "white",
                    fontWeight: "600",
                    fontSize: 16,
                    flex: 1,
                  }}
                >
                  {item.name}
                </Text>
                <Text style={{ color: "#55A630", fontWeight: "600" }}>
                  {item.price.toLocaleString("vi-VN")} đ
                </Text>
              </View>

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

              {item.category && (
                <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                  {item.category} · {item.ingredientCount} nguyên liệu
                </Text>
              )}

              {/* Quick Sell Button */}
              <Pressable
                onPress={() => quickSell(item)}
                style={{
                  marginTop: 12,
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
            </Pressable>
          );
        }}
      />
    </View>
  );
}
