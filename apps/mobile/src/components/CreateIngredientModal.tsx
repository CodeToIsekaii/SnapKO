/**
 * CreateIngredientModal - Modal for creating new ingredients
 * Features:
 * - Zod validation from @snapko/shared
 * - Duplicate name detection (LIKE %name%)
 * - F&B themed UI
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { getDB } from "../db";
import { resolveLocalStorageAreaId, upsertStockLevel } from "../db/stockLevelHelper";
import {
  createIngredientSchema,
  INGREDIENT_UNITS,
  parseAliases,
} from "@snapko/shared";

interface CreateIngredientModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (ingredientId: string) => void;
  initialName?: string; // Pre-fill name from AI parse
}

interface SimilarIngredient {
  id: string;
  name: string;
  aliases: string;
}

export default function CreateIngredientModal({
  visible,
  onClose,
  onCreated,
  initialName = "",
}: CreateIngredientModalProps) {
  // Form state
  const [name, setName] = useState(initialName);
  const [baseUnit, setBaseUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [aliases, setAliases] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Duplicate detection
  const [similarIngredients, setSimilarIngredients] = useState<
    SimilarIngredient[]
  >([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setBaseUnit("");
      setUnitCost("");
      setAliases("");
      setErrors({});
      setSimilarIngredients([]);
    }
  }, [visible, initialName]);

  // Debounced duplicate check
  const checkDuplicates = useCallback(async (searchName: string) => {
    if (searchName.length < 2) {
      setSimilarIngredients([]);
      return;
    }

    setCheckingDuplicates(true);
    try {
      const db = await getDB();
      const results = await db.getAllAsync<SimilarIngredient>(
        `SELECT id, name, aliases FROM local_ingredients 
         WHERE (name LIKE ? OR aliases LIKE ?) AND archived = 0
         LIMIT 5`,
        [`%${searchName}%`, `%${searchName}%`],
      );
      setSimilarIngredients(results);
    } catch (err) {
      console.log("Duplicate check error:", err);
    } finally {
      setCheckingDuplicates(false);
    }
  }, []);

  // Check duplicates when name changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicates(name);
    }, 300);
    return () => clearTimeout(timer);
  }, [name, checkDuplicates]);

  // Validate and save
  const handleSave = async () => {
    setErrors({});

    // Parse form data
    const formData = {
      name,
      baseUnit,
      unitCost: parseFloat(unitCost) || 0,
      aliases: parseAliases(aliases),
    };

    // Validate with Zod
    const result = createIngredientSchema.safeParse(formData);
    if (!result.success) {
      const newErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        if (!newErrors[path]) {
          newErrors[path] = issue.message;
        }
      }
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      const db = await getDB();
      const id = `ing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.runAsync(
        `INSERT INTO local_ingredients (id, name, aliases, base_unit, unit_cost, warehouse_qty, bar_qty, archived)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
        [
          id,
          result.data.name,
          result.data.aliases.join(","),
          result.data.baseUnit,
          result.data.unitCost,
        ],
      );

      // Seed a stock_levels row (qty=0) for the default STORAGE area
      const defaultAreaId = await resolveLocalStorageAreaId(db);
      if (defaultAreaId) {
        await upsertStockLevel(db, id, defaultAreaId, 0);
      }

      onCreated(id);
      onClose();
    } catch (err) {
      console.error("Save ingredient error:", err);
      Alert.alert("Lỗi", "Không thể lưu nguyên liệu");
    } finally {
      setSaving(false);
    }
  };

  // Use existing ingredient
  const handleUseSimilar = (ingredient: SimilarIngredient) => {
    Alert.alert(
      "Sử dụng nguyên liệu có sẵn?",
      `Bạn muốn dùng "${ingredient.name}" thay vì tạo mới?`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Sử dụng",
          onPress: () => {
            onCreated(ingredient.id);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: "#121212",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "85%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#2A2A2A",
            }}
          >
            <Pressable onPress={onClose}>
              <Text style={{ color: "#94A3B8", fontSize: 16 }}>Hủy</Text>
            </Pressable>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              Thêm nguyên liệu
            </Text>
            <Pressable onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#E07A2F" />
              ) : (
                <Text
                  style={{ color: "#E07A2F", fontSize: 16, fontWeight: "600" }}
                >
                  Lưu
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView style={{ padding: 16 }}>
            {/* Similar ingredients warning */}
            {similarIngredients.length > 0 && (
              <View
                style={{
                  backgroundColor: "rgba(255, 200, 87, 0.15)",
                  borderLeftWidth: 4,
                  borderLeftColor: "#FFC857",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    color: "#FFC857",
                    fontWeight: "600",
                    marginBottom: 8,
                  }}
                >
                  ⚠️ Có nguyên liệu tương tự
                </Text>
                {similarIngredients.map((ing) => (
                  <Pressable
                    key={ing.id}
                    onPress={() => handleUseSimilar(ing)}
                    style={{
                      backgroundColor: "#1A1A1A",
                      padding: 10,
                      borderRadius: 6,
                      marginTop: 4,
                    }}
                  >
                    <Text style={{ color: "white" }}>{ing.name}</Text>
                    {ing.aliases && (
                      <Text style={{ color: "#64748B", fontSize: 11 }}>
                        Bí danh: {ing.aliases}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Name input */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6 }}>
                Tên nguyên liệu *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="VD: Trứng gà"
                placeholderTextColor="#475569"
                style={{
                  backgroundColor: "#1A1A1A",
                  borderRadius: 12,
                  padding: 14,
                  color: "white",
                  borderWidth: errors.name ? 1 : 0,
                  borderColor: "#E63946",
                }}
              />
              {errors.name && (
                <Text style={{ color: "#E63946", fontSize: 12, marginTop: 4 }}>
                  {errors.name}
                </Text>
              )}
              {checkingDuplicates && (
                <ActivityIndicator
                  size="small"
                  color="#64748B"
                  style={{ marginTop: 4 }}
                />
              )}
            </View>

            {/* Unit selector */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6 }}>
                Đơn vị gốc *
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexDirection: "row" }}
              >
                {INGREDIENT_UNITS.map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => setBaseUnit(unit)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      marginRight: 8,
                      backgroundColor:
                        baseUnit === unit ? "#E07A2F" : "#1A1A1A",
                    }}
                  >
                    <Text style={{ color: "white" }}>{unit}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {errors.baseUnit && (
                <Text style={{ color: "#E63946", fontSize: 12, marginTop: 4 }}>
                  {errors.baseUnit}
                </Text>
              )}
            </View>

            {/* Unit cost */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6 }}>
                Giá vốn (VNĐ/{baseUnit || "đơn vị"}) *
              </Text>
              <TextInput
                value={unitCost}
                onChangeText={setUnitCost}
                placeholder="VD: 50000"
                placeholderTextColor="#475569"
                keyboardType="numeric"
                style={{
                  backgroundColor: "#1A1A1A",
                  borderRadius: 12,
                  padding: 14,
                  color: "white",
                  borderWidth: errors.unitCost ? 1 : 0,
                  borderColor: "#E63946",
                }}
              />
              {errors.unitCost && (
                <Text style={{ color: "#E63946", fontSize: 12, marginTop: 4 }}>
                  {errors.unitCost}
                </Text>
              )}
            </View>

            {/* Aliases */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6 }}>
                Bí danh (AI nhận diện)
              </Text>
              <TextInput
                value={aliases}
                onChangeText={setAliases}
                placeholder="VD: egg, trứng, trung ga"
                placeholderTextColor="#475569"
                style={{
                  backgroundColor: "#1A1A1A",
                  borderRadius: 12,
                  padding: 14,
                  color: "white",
                }}
              />
              <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                Phân cách bằng dấu phẩy
              </Text>
            </View>

            {/* Bottom padding */}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
