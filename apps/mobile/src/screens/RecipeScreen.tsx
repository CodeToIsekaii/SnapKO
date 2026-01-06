/**
 * RecipeScreen - Recipe Builder with Ingredient Linking
 * Features: List recipes, Add/Edit recipe, Link ingredients for COGS
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";

interface LocalIngredient {
  id: string;
  name: string;
  base_unit: string;
  unit_cost: number;
}

interface RecipeIngredient {
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

interface Recipe {
  id: string;
  name: string;
  price: number;
  category: string;
  ingredients: RecipeIngredient[];
}

interface RecipeScreenProps {
  onBack: () => void;
}

export default function RecipeScreen({ onBack }: RecipeScreenProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [recipePrice, setRecipePrice] = useState("");
  const [recipeCategory, setRecipeCategory] = useState("");
  const [selectedIngredients, setSelectedIngredients] = useState<
    RecipeIngredient[]
  >([]);

  // Ingredient picker
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);

  // Load data from LOCAL SQLite (Dashboard already synced from server)
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const db = await SQLite.openDatabaseAsync("snapko.db");

      // Load ingredients
      const ings = await db.getAllAsync<LocalIngredient>(
        "SELECT id, name, base_unit, unit_cost FROM local_ingredients WHERE archived = 0"
      );
      setIngredients(ings);

      // Load recipes
      const recipeRows = await db.getAllAsync<{
        id: string;
        name: string;
        price: number;
        category: string;
      }>("SELECT * FROM local_recipes ORDER BY name");

      // Load recipe ingredients
      const recipesWithIngredients: Recipe[] = [];
      for (const r of recipeRows) {
        const ri = await db.getAllAsync<{
          ingredient_id: string;
          quantity: number;
          unit: string;
        }>("SELECT * FROM local_recipe_ingredients WHERE recipe_id = ?", [
          r.id,
        ]);

        const mappedIngredients: RecipeIngredient[] = ri.map((item) => {
          const ing = ings.find((i) => i.id === item.ingredient_id);
          return {
            ingredient_id: item.ingredient_id,
            name: ing?.name ?? "Unknown",
            quantity: item.quantity,
            unit: item.unit ?? ing?.base_unit ?? "",
            unit_cost: ing?.unit_cost ?? 0,
          };
        });

        recipesWithIngredients.push({
          ...r,
          ingredients: mappedIngredients,
        });
      }

      setRecipes(recipesWithIngredients);
    } catch (err) {
      console.error("Load error:", err);
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
      await loadData();
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate COGS for a recipe
  const calculateCOGS = (ings: RecipeIngredient[]) => {
    return ings.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
  };

  // Open add modal
  const openAddModal = () => {
    setEditingRecipe(null);
    setRecipeName("");
    setRecipePrice("");
    setRecipeCategory("");
    setSelectedIngredients([]);
    setModalVisible(true);
  };

  // Open edit modal
  const openEditModal = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setRecipeName(recipe.name);
    setRecipePrice(String(recipe.price));
    setRecipeCategory(recipe.category);
    setSelectedIngredients([...recipe.ingredients]);
    setModalVisible(true);
  };

  // Add ingredient to recipe
  const addIngredient = (ing: LocalIngredient) => {
    if (selectedIngredients.find((i) => i.ingredient_id === ing.id)) {
      return; // Already added
    }
    setSelectedIngredients([
      ...selectedIngredients,
      {
        ingredient_id: ing.id,
        name: ing.name,
        quantity: 1,
        unit: ing.base_unit,
        unit_cost: ing.unit_cost,
      },
    ]);
    setShowIngredientPicker(false);
  };

  // Update ingredient quantity
  const updateIngredientQty = (ingredientId: string, qty: number) => {
    setSelectedIngredients((prev) =>
      prev.map((i) =>
        i.ingredient_id === ingredientId ? { ...i, quantity: qty } : i
      )
    );
  };

  // Remove ingredient
  const removeIngredient = (ingredientId: string) => {
    setSelectedIngredients((prev) =>
      prev.filter((i) => i.ingredient_id !== ingredientId)
    );
  };

  // Save recipe
  const saveRecipe = async () => {
    if (!recipeName.trim()) {
      Alert.alert("Lỗi", "Tên món không được trống");
      return;
    }

    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");
      const id = editingRecipe?.id ?? Crypto.randomUUID();
      const price = parseInt(recipePrice) || 0;

      // Upsert recipe
      await db.runAsync(
        `INSERT OR REPLACE INTO local_recipes (id, name, price, category, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [id, recipeName.trim(), price, recipeCategory.trim()]
      );

      // Delete old ingredients
      await db.runAsync(
        "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?",
        [id]
      );

      // Insert new ingredients
      for (const ing of selectedIngredients) {
        await db.runAsync(
          `INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [Crypto.randomUUID(), id, ing.ingredient_id, ing.quantity, ing.unit]
        );
      }

      setModalVisible(false);
      loadData();
    } catch (err) {
      Alert.alert("Lỗi", "Không thể lưu món");
    }
  };

  // Delete recipe
  const deleteRecipe = async (id: string) => {
    Alert.alert("Xóa món?", "Món này sẽ bị xóa vĩnh viễn.", [
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
          loadData();
        },
      },
    ]);
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
          Công thức
        </Text>
        <Pressable onPress={openAddModal}>
          <Text style={{ color: "#E07A2F", fontSize: 16 }}>+ Thêm</Text>
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#E07A2F"]}
            tintColor="#E07A2F"
          />
        }
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "#64748B" }}>Chưa có món nào</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cogs = calculateCOGS(item.ingredients);
          const profit = item.price - cogs;
          const margin = item.price > 0 ? (profit / item.price) * 100 : 0;

          return (
            <Pressable
              onPress={() => openEditModal(item)}
              onLongPress={() => deleteRecipe(item.id)}
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
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  {item.name}
                </Text>
                <Text style={{ color: "#55A630", fontWeight: "600" }}>
                  {item.price.toLocaleString("vi-VN")} đ
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                  COGS: {cogs.toLocaleString("vi-VN")} đ
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

              <Text style={{ color: "#64748B", fontSize: 11, marginTop: 8 }}>
                {item.ingredients.length} nguyên liệu
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#1A1A1A",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 16,
              }}
            >
              {editingRecipe ? "Sửa món" : "Thêm món"}
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {/* Name */}
              <Text style={{ color: "#94A3B8", marginBottom: 4 }}>Tên món</Text>
              <TextInput
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder="VD: Cà phê sữa"
                placeholderTextColor="#475569"
                style={{
                  backgroundColor: "#121212",
                  borderRadius: 8,
                  padding: 12,
                  color: "white",
                  marginBottom: 12,
                }}
              />

              {/* Price */}
              <Text style={{ color: "#94A3B8", marginBottom: 4 }}>
                Giá bán (đ)
              </Text>
              <TextInput
                value={recipePrice}
                onChangeText={setRecipePrice}
                keyboardType="numeric"
                placeholder="25000"
                placeholderTextColor="#475569"
                style={{
                  backgroundColor: "#121212",
                  borderRadius: 8,
                  padding: 12,
                  color: "white",
                  marginBottom: 12,
                }}
              />

              {/* Category */}
              <Text style={{ color: "#94A3B8", marginBottom: 4 }}>
                Danh mục
              </Text>
              <TextInput
                value={recipeCategory}
                onChangeText={setRecipeCategory}
                placeholder="VD: Đồ uống"
                placeholderTextColor="#475569"
                style={{
                  backgroundColor: "#121212",
                  borderRadius: 8,
                  padding: 12,
                  color: "white",
                  marginBottom: 16,
                }}
              />

              {/* Ingredients */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: "#94A3B8" }}>Nguyên liệu</Text>
                <Pressable onPress={() => setShowIngredientPicker(true)}>
                  <Text style={{ color: "#E07A2F" }}>+ Thêm</Text>
                </Pressable>
              </View>

              {selectedIngredients.map((ing) => (
                <View
                  key={ing.ingredient_id}
                  style={{
                    backgroundColor: "#121212",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text style={{ color: "white", flex: 1 }}>{ing.name}</Text>
                  <TextInput
                    value={String(ing.quantity)}
                    onChangeText={(t) =>
                      updateIngredientQty(ing.ingredient_id, parseFloat(t) || 0)
                    }
                    keyboardType="numeric"
                    style={{
                      backgroundColor: "#1A1A1A",
                      padding: 8,
                      borderRadius: 4,
                      color: "white",
                      width: 60,
                      textAlign: "center",
                    }}
                  />
                  <Text style={{ color: "#64748B" }}>{ing.unit}</Text>
                  <Pressable
                    onPress={() => removeIngredient(ing.ingredient_id)}
                  >
                    <Text style={{ color: "#EF4444" }}>✕</Text>
                  </Pressable>
                </View>
              ))}

              {/* COGS Preview */}
              {selectedIngredients.length > 0 && (
                <View
                  style={{
                    backgroundColor: "#121212",
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                    COGS:{" "}
                    {calculateCOGS(selectedIngredients).toLocaleString("vi-VN")}{" "}
                    đ
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: "#2A2A2A",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white" }}>Hủy</Text>
              </Pressable>
              <Pressable
                onPress={saveRecipe}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: "#6B8E23",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ingredient Picker Modal */}
      <Modal visible={showIngredientPicker} animationType="fade" transparent>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            padding: 20,
          }}
          onPress={() => setShowIngredientPicker(false)}
        >
          <View
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              maxHeight: 400,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", padding: 16 }}>
              Chọn nguyên liệu
            </Text>
            <FlatList
              data={ingredients.filter(
                (i) =>
                  !selectedIngredients.find((s) => s.ingredient_id === i.id)
              )}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => addIngredient(item)}
                  style={{
                    padding: 16,
                    borderTopWidth: 1,
                    borderTopColor: "#2A2A2A",
                  }}
                >
                  <Text style={{ color: "white" }}>{item.name}</Text>
                  <Text style={{ color: "#64748B", fontSize: 12 }}>
                    {item.unit_cost.toLocaleString("vi-VN")} đ/{item.base_unit}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={{ color: "#64748B", padding: 16 }}>
                  Không có nguyên liệu
                </Text>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
