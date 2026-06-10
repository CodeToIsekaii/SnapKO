/**
 * RecipeEditScreen - Add/Edit recipe with ingredient linking
 * Features: Name/price input, ingredient picker, quantity input, COGS preview
 * Week 6 Enhanced: Unit conversion picker, UXUIrules colors, shared logic
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import * as SQLite from "expo-sqlite";
import { getDB } from "../db";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import {
  convertUnits,
  areUnitsCompatible,
  calculateGrossProfit,
  calculateGrossProfitMargin,
  calculateIngredientCost as sharedCalculateIngredientCost,
} from "@snapko/shared";

// UXUIrules Color Palette
const COLORS = {
  background: "#121212", // Charcoal
  surface: "#1A1A1A", // Dark Coffee
  textPrimary: "#F5F3EF", // Cream White
  textSecondary: "#B8B3A8", // Warm Gray
  cta: "#E07A2F", // Burnt Orange
  success: "#6B8E23", // Olive Green
  successBright: "#55A630", // Fresh Green
  warning: "#FFC857", // Mustard Yellow
  error: "#E63946", // Tomato Red
  border: "#2A2A2A",
};

// Available units for conversion
const UNIT_OPTIONS = [
  "g",
  "kg",
  "ml",
  "L",
  "chai",
  "lon",
  "hộp",
  "gói",
  "quả",
  "cái",
];

interface LocalIngredient {
  id: string;
  name: string;
  base_unit: string;
  unit_cost: number;
  density?: number;
  unit_weight?: number;
  unit_weight_unit?: string;
}

interface RecipeIngredient {
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
  base_unit: string;
  unit_cost: number;
  density?: number;
  unit_weight?: number;
  unit_weight_unit?: string;
  isCompatible: boolean;
}

interface RecipeEditScreenProps {
  recipeId?: string; // undefined = new recipe
  onBack: () => void;
  onSave: () => void;
}

export default function RecipeEditScreen({
  recipeId,
  onBack,
  onSave,
}: RecipeEditScreenProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [allIngredients, setAllIngredients] = useState<LocalIngredient[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(!!recipeId);

  // Load data
  useEffect(() => {
    loadIngredients();
    if (recipeId) loadRecipe();
  }, [recipeId]);

  const loadIngredients = async () => {
    const db = await getDB();
    const rows = await db.getAllAsync<LocalIngredient>(
      "SELECT id, name, base_unit, unit_cost, density, unit_weight, unit_weight_unit FROM local_ingredients WHERE archived = 0",
    );
    setAllIngredients(rows);
  };

  const loadRecipe = async () => {
    if (!recipeId) return; // Guard clause to satisfy TypeScript
    const db = await getDB();
    const recipe = await db.getFirstAsync<{
      name: string;
      price: number;
      category: string;
    }>("SELECT * FROM local_recipes WHERE id = ?", [recipeId]);

    if (recipe) {
      setName(recipe.name);
      setPrice(String(recipe.price));
      setCategory(recipe.category || "");
    }

    const ri = await db.getAllAsync<{
      ingredient_id: string;
      quantity: number;
      unit: string;
    }>("SELECT * FROM local_recipe_ingredients WHERE recipe_id = ?", [
      recipeId,
    ]);

    const mapped: RecipeIngredient[] = [];
    for (const item of ri) {
      const ing = await db.getFirstAsync<{
        name: string;
        base_unit: string;
        unit_cost: number;
        density: number | null;
        unit_weight: number | null;
        unit_weight_unit: string | null;
      }>(
        "SELECT name, base_unit, unit_cost, density, unit_weight, unit_weight_unit FROM local_ingredients WHERE id = ?",
        [item.ingredient_id],
      );
      if (ing) {
        const selectedUnit = item.unit || ing.base_unit;
        mapped.push({
          ingredient_id: item.ingredient_id,
          name: ing.name,
          quantity: item.quantity,
          unit: selectedUnit,
          base_unit: ing.base_unit,
          unit_cost: ing.unit_cost,
          density: ing.density ?? undefined,
          unit_weight: ing.unit_weight ?? undefined,
          unit_weight_unit: ing.unit_weight_unit ?? undefined,
          isCompatible: areUnitsCompatible(selectedUnit, ing.base_unit),
        });
      }
    }
    setIngredients(mapped);
    setLoading(false);
  };

  // Add ingredient
  const addIngredient = (ing: LocalIngredient) => {
    if (ingredients.find((i) => i.ingredient_id === ing.id)) return;
    setIngredients([
      ...ingredients,
      {
        ingredient_id: ing.id,
        name: ing.name,
        quantity: 1,
        unit: ing.base_unit,
        base_unit: ing.base_unit,
        unit_cost: ing.unit_cost,
        density: ing.density,
        unit_weight: ing.unit_weight,
        unit_weight_unit: ing.unit_weight_unit,
        isCompatible: true,
      },
    ]);
    setShowPicker(false);
  };

  // Update quantity
  const updateQty = (id: string, qty: number) => {
    setIngredients((prev) =>
      prev.map((i) => (i.ingredient_id === id ? { ...i, quantity: qty } : i)),
    );
  };

  // Update unit with compatibility check
  const updateUnit = (id: string, newUnit: string) => {
    setIngredients((prev) =>
      prev.map((i) => {
        if (i.ingredient_id !== id) return i;
        const compatible = areUnitsCompatible(newUnit, i.base_unit);
        return { ...i, unit: newUnit, isCompatible: compatible };
      }),
    );
  };

  // Remove ingredient
  const removeIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((i) => i.ingredient_id !== id));
  };

  // Calculate COGS with unit conversion (using shared logic)
  const calculateIngredientCost = (ing: RecipeIngredient): number => {
    return sharedCalculateIngredientCost(ing.quantity, ing.unit, {
      base_unit: ing.base_unit,
      unit_cost: ing.unit_cost,
      density: ing.density,
      unit_weight: ing.unit_weight,
      unit_weight_unit: ing.unit_weight_unit,
    });
  };

  const cogs = ingredients.reduce(
    (sum, i) => sum + calculateIngredientCost(i),
    0,
  );
  const sellingPrice = parseInt(price) || 0;
  const profit = calculateGrossProfit(sellingPrice, cogs);
  const margin = calculateGrossProfitMargin(sellingPrice, cogs);

  // Save
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Lỗi", "Tên món không được trống");
      return;
    }

    try {
      const db = await getDB();
      const id = recipeId || Crypto.randomUUID();
      const existingRecipe = await db.getFirstAsync<{ aliases: string }>(
        "SELECT aliases FROM local_recipes WHERE id = ?",
        [id],
      );
      const aliases = existingRecipe?.aliases ?? "[]";

      await db.runAsync(
        `INSERT OR REPLACE INTO local_recipes (id, name, aliases, price, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, name.trim(), aliases, sellingPrice, category.trim()],
      );

      await db.runAsync(
        "DELETE FROM local_recipe_ingredients WHERE recipe_id = ?",
        [id],
      );

      for (const ing of ingredients) {
        await db.runAsync(
          `INSERT INTO local_recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [Crypto.randomUUID(), id, ing.ingredient_id, ing.quantity, ing.unit],
        );
      }

      // --- QUEUE SYNC ---
      const { addToSyncQueue } = await import("../sync/syncEngine");
      await addToSyncQueue("recipes", "UPSERT", {
        id,
        business_id: (
          await db.getFirstAsync<{ business_id: string }>(
            "SELECT business_id FROM local_profiles LIMIT 1",
          )
        )?.business_id, // Ensure business_id
        name: name.trim(),
        price: sellingPrice,
        category: category.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      });

      onSave();
    } catch (err) {
      Alert.alert("Lỗi", "Không thể lưu món");
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: COLORS.textSecondary }}>Đang tải...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: COLORS.textSecondary }}>Hủy</Text>
        </Pressable>
        <Text
          style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: "600" }}
        >
          {recipeId ? "Sửa món" : "Thêm món"}
        </Text>
        <Pressable onPress={handleSave}>
          <Text style={{ color: COLORS.cta, fontWeight: "600" }}>Lưu</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Name */}
        <Text style={{ color: "#94A3B8", marginBottom: 4 }}>Tên món *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="VD: Trà Đào"
          placeholderTextColor="#475569"
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 8,
            padding: 12,
            color: "white",
            marginBottom: 16,
          }}
        />

        {/* Price */}
        <Text style={{ color: "#94A3B8", marginBottom: 4 }}>Giá bán (đ)</Text>
        <TextInput
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="35000"
          placeholderTextColor="#475569"
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 8,
            padding: 12,
            color: "white",
            marginBottom: 16,
          }}
        />

        {/* Category */}
        <Text style={{ color: "#94A3B8", marginBottom: 4 }}>Danh mục</Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          placeholder="VD: Trà"
          placeholderTextColor="#475569"
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 8,
            padding: 12,
            color: "white",
            marginBottom: 24,
          }}
        />

        {/* Ingredients */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Nguyên liệu</Text>
          <Pressable onPress={() => setShowPicker(true)}>
            <Text style={{ color: "#E07A2F" }}>+ Thêm</Text>
          </Pressable>
        </View>

        {ingredients.length === 0 ? (
          <Text style={{ color: COLORS.textSecondary, marginBottom: 16 }}>
            Chưa có nguyên liệu
          </Text>
        ) : (
          ingredients.map((ing) => (
            <View
              key={ing.ingredient_id}
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                borderLeftWidth: 3,
                borderLeftColor: ing.isCompatible
                  ? COLORS.success
                  : COLORS.error,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: COLORS.textPrimary }}>{ing.name}</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
                  {ing.unit_cost.toLocaleString("vi-VN")} đ/{ing.base_unit}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TextInput
                  value={String(ing.quantity)}
                  onChangeText={(t) =>
                    updateQty(ing.ingredient_id, parseFloat(t) || 0)
                  }
                  keyboardType="numeric"
                  style={{
                    backgroundColor: COLORS.background,
                    padding: 8,
                    borderRadius: 4,
                    color: COLORS.textPrimary,
                    width: 60,
                    textAlign: "center",
                  }}
                />
                {/* Unit Picker Dropdown */}
                <Pressable
                  onPress={() => {
                    // Show unit picker modal
                    Alert.alert(
                      "Chọn đơn vị",
                      `Đơn vị gốc: ${ing.base_unit}`,
                      UNIT_OPTIONS.map((u) => ({
                        text: u + (u === ing.base_unit ? " (gốc)" : ""),
                        onPress: () => updateUnit(ing.ingredient_id, u),
                      })),
                    );
                  }}
                  style={{
                    backgroundColor: ing.isCompatible
                      ? COLORS.success
                      : COLORS.error,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{ color: COLORS.textPrimary, fontWeight: "500" }}
                  >
                    {ing.unit} ▼
                  </Text>
                </Pressable>
                <Text
                  style={{
                    color: ing.isCompatible
                      ? COLORS.successBright
                      : COLORS.error,
                    flex: 1,
                    textAlign: "right",
                  }}
                >
                  = {calculateIngredientCost(ing).toLocaleString("vi-VN")} đ
                </Text>
                <Pressable onPress={() => removeIngredient(ing.ingredient_id)}>
                  <Text style={{ color: COLORS.error }}>✕</Text>
                </Pressable>
              </View>
              {!ing.isCompatible && (
                <Text
                  style={{ color: COLORS.warning, fontSize: 11, marginTop: 4 }}
                >
                  ⚠️ Đơn vị không tương thích với {ing.base_unit}
                </Text>
              )}
            </View>
          ))
        )}

        {/* COGS Summary */}
        <View
          style={{
            backgroundColor: "#1A1A1A",
            borderRadius: 12,
            padding: 16,
            marginTop: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#94A3B8" }}>Giá vốn (COGS)</Text>
            <Text style={{ color: "white", fontWeight: "600" }}>
              {cogs.toLocaleString("vi-VN")} đ
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#94A3B8" }}>Lãi gộp</Text>
            <Text
              style={{
                color: profit >= 0 ? "#55A630" : "#EF4444",
                fontWeight: "600",
              }}
            >
              {profit.toLocaleString("vi-VN")} đ
            </Text>
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ color: "#94A3B8" }}>Biên lợi nhuận</Text>
            <Text
              style={{
                color:
                  margin >= 50
                    ? "#55A630"
                    : margin >= 30
                      ? "#F59E0B"
                      : "#EF4444",
                fontWeight: "600",
              }}
            >
              {margin.toFixed(1)}%
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Ingredient Picker */}
      <Modal visible={showPicker} animationType="fade" transparent>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            padding: 20,
          }}
          onPress={() => setShowPicker(false)}
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
              data={allIngredients.filter(
                (i) => !ingredients.find((s) => s.ingredient_id === i.id),
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
                  Không có nguyên liệu khả dụng
                </Text>
              }
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
