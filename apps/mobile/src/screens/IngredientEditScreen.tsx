import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { getDB } from "../db";
import * as Crypto from "expo-crypto";

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

const UNIT_OPTIONS = [
  "kg",
  "g",
  "lít",
  "ml",
  "chai",
  "lon",
  "gói",
  "hộp",
  "cái",
  "hũ",
  "bịch",
  "túi",
  "cây",
  "bó",
];

const COUNTABLE_UNITS = [
  "chai",
  "lon",
  "gói",
  "hộp",
  "cái",
  "hũ",
  "bịch",
  "túi",
  "cây",
  "bó",
];

// Type for batch recipe ingredients
interface BatchIngredient {
  id: string;
  name: string;
  quantity: string;
  unit: string;
}

interface IngredientEditScreenProps {
  ingredientId?: string;
  onBack: () => void;
  onSave: () => void;
}

export default function IngredientEditScreen({
  ingredientId,
  onBack,
  onSave,
}: IngredientEditScreenProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"raw_material" | "supply" | "semi_product">(
    "raw_material"
  );
  const [baseUnit, setBaseUnit] = useState("kg");
  const [unitCost, setUnitCost] = useState("");
  const [minThreshold, setMinThreshold] = useState("0");

  const [shelfLifeDays, setShelfLifeDays] = useState("");

  // Advanced
  const [density, setDensity] = useState("1");
  const [tareWeight, setTareWeight] = useState("0");
  const [unitWeight, setUnitWeight] = useState("");
  const [unitWeightUnit, setUnitWeightUnit] = useState("g");

  // Inventory Config
  const [itemType, setItemType] = useState<"STOCK" | "PHANTOM">("STOCK");
  const [trackingMode, setTrackingMode] = useState<"STRICT" | "LOOSE">(
    "STRICT"
  );
  const [allowableVariance, setAllowableVariance] = useState("0");
  const [isBatchItem, setIsBatchItem] = useState(false);
  const [batchYieldQty, setBatchYieldQty] = useState("");

  // Batch Recipe Ingredients (NEW)
  const [batchIngredients, setBatchIngredients] = useState<BatchIngredient[]>(
    []
  );
  const [showIngredientPicker, setShowIngredientPicker] = useState(false);
  const [availableIngredients, setAvailableIngredients] = useState<
    { id: string; name: string; base_unit: string }[]
  >([]);
  const [ingredientSearch, setIngredientSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showWeightUnitPicker, setShowWeightUnitPicker] = useState(false);

  useEffect(() => {
    if (ingredientId) {
      loadIngredient();
    }
    // Load available ingredients for batch recipe (excluding current ingredient)
    loadAvailableIngredients();
  }, [ingredientId]);

  // Load available ingredients for batch recipe selection
  const loadAvailableIngredients = async () => {
    try {
      const db = await getDB();
      const ingredients = await db.getAllAsync<{
        id: string;
        name: string;
        base_unit: string;
      }>(
        `SELECT id, name, base_unit FROM local_ingredients 
         WHERE archived = 0 OR archived IS NULL 
         ${ingredientId ? "AND id != ?" : ""}
         ORDER BY name`,
        ingredientId ? [ingredientId] : []
      );
      setAvailableIngredients(ingredients || []);
    } catch (err) {
      console.error("Failed to load available ingredients:", err);
    }
  };

  // Add ingredient to batch recipe
  const addBatchIngredient = (ing: {
    id: string;
    name: string;
    base_unit: string;
  }) => {
    // Check if already added
    if (batchIngredients.some((b) => b.id === ing.id)) {
      Alert.alert("Thông báo", "Nguyên liệu này đã được thêm");
      return;
    }
    setBatchIngredients([
      ...batchIngredients,
      { id: ing.id, name: ing.name, quantity: "", unit: ing.base_unit },
    ]);
    setShowIngredientPicker(false);
    setIngredientSearch("");
  };

  // Update batch ingredient quantity
  const updateBatchIngredientQty = (id: string, quantity: string) => {
    setBatchIngredients(
      batchIngredients.map((b) => (b.id === id ? { ...b, quantity } : b))
    );
  };

  // Remove ingredient from batch recipe
  const removeBatchIngredient = (id: string) => {
    setBatchIngredients(batchIngredients.filter((b) => b.id !== id));
  };

  const loadIngredient = async () => {
    setLoading(true);
    try {
      const db = await getDB();
      const ing = await db.getFirstAsync<{
        name: string;
        type: string;
        base_unit: string;
        unit_cost: number;
        min_threshold: number;
        density: number;
        tare_weight: number;
        unit_weight: number;
        unit_weight_unit: string;
        item_type: string;
        tracking_mode: string;
        allowable_variance: number;
        is_batch_item: number;
        batch_yield_qty: number;
        shelf_life_days: number | null;
      }>("SELECT * FROM local_ingredients WHERE id = ?", [ingredientId!]);

      if (ing) {
        setName(ing.name);
        setType((ing.type as any) || "raw_material");
        setBaseUnit(ing.base_unit);
        setUnitCost(ing.unit_cost?.toString() || "0");
        setMinThreshold(ing.min_threshold?.toString() || "0");
        setDensity(ing.density?.toString() || "1");
        setTareWeight(ing.tare_weight?.toString() || "0");
        setUnitWeight(ing.unit_weight?.toString() || "");
        setUnitWeightUnit(ing.unit_weight_unit || "g");
        // Load new fields
        setItemType((ing.item_type as any) || "STOCK");
        setTrackingMode((ing.tracking_mode as any) || "STRICT");
        setAllowableVariance(((ing.allowable_variance || 0) * 100).toString());
        setIsBatchItem(!!ing.is_batch_item);
        setBatchYieldQty(ing.batch_yield_qty?.toString() || "");
        setShelfLifeDays(ing.shelf_life_days?.toString() || "");

        // Load batch components from local cache
        if (ing.is_batch_item) {
          const comps = await db.getAllAsync<{
            id: string;
            child_id: string;
            quantity: number;
            unit: string;
          }>(
            `SELECT ic.id, ic.child_id, ic.quantity, ic.unit, li.name, li.base_unit
             FROM local_ingredient_components ic
             LEFT JOIN local_ingredients li ON li.id = ic.child_id
             WHERE ic.parent_id = ?`,
            [ingredientId!]
          ) as any[];
          if (comps.length > 0) {
            setBatchIngredients(
              comps.map((c) => ({
                id: c.child_id,
                name: (c as any).name ?? c.child_id,
                quantity: String(c.quantity),
                unit: c.unit,
              }))
            );
          }
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Lỗi", "Không thể tải thông tin nguyên liệu");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Lỗi", "Tên nguyên liệu không được trống");
      return;
    }

    try {
      const db = await getDB();
      const id = ingredientId || Crypto.randomUUID();
      const businessId = (
        await db.getFirstAsync<{ business_id: string }>(
          "SELECT business_id FROM local_profiles LIMIT 1"
        )
      )?.business_id;

      const cost = parseFloat(unitCost) || 0;
      const threshold = parseFloat(minThreshold) || 0;
      const den = parseFloat(density) || 1;
      const tare = parseFloat(tareWeight) || 0;
      const uWeight = unitWeight ? parseFloat(unitWeight) : null;
      const variance = (parseFloat(allowableVariance) || 0) / 100; // Convert % to decimal
      const batchYield = batchYieldQty ? parseFloat(batchYieldQty) : null;
      const shelfDays = shelfLifeDays ? parseInt(shelfLifeDays) : null;

      // Use user-selected itemType (not auto-derived from type anymore)
      const finalItemType = itemType;

      // 1. Local Insert/Update
      await db.runAsync(
        `INSERT OR REPLACE INTO local_ingredients
         (id, business_id, name, type, base_unit, unit_cost, min_threshold, density, tare_weight, unit_weight, unit_weight_unit, item_type, tracking_mode, allowable_variance, is_batch_item, batch_yield_qty, shelf_life_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          id,
          businessId || null,
          name.trim(),
          type,
          baseUnit,
          cost,
          threshold,
          den,
          tare,
          uWeight,
          unitWeightUnit,
          finalItemType,
          trackingMode,
          variance,
          isBatchItem ? 1 : 0,
          batchYield,
          shelfDays,
        ]
      );

      // 2. Queue Sync
      const { addToSyncQueue } = await import("../sync/syncEngine");
      await addToSyncQueue("ingredients", "UPSERT", {
        id,
        business_id: businessId,
        name: name.trim(),
        type,
        base_unit: baseUnit,
        unit_cost: cost,
        min_threshold: threshold,
        density: den,
        tare_weight: tare,
        unit_weight: uWeight,
        unit_weight_unit: unitWeightUnit,
        item_type: finalItemType,
        tracking_mode: trackingMode,
        allowable_variance: variance,
        is_batch_item: isBatchItem,
        batch_yield_qty: batchYield,
        shelf_life_days: shelfDays,
        archived: false,
        updated_at: new Date().toISOString(),
      });

      onSave();
    } catch (err) {
      console.error(err);
      Alert.alert("Lỗi", "Không thể lưu nguyên liệu");
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Ẩn nguyên liệu?",
      `"${name}" sẽ được ẩn khỏi danh sách đang dùng.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Ẩn",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await getDB();
              // 1. Local Update
              await db.runAsync(
                "UPDATE local_ingredients SET archived = 1 WHERE id = ?",
                [ingredientId!]
              );

              // 2. Sync
              const { addToSyncQueue } = await import("../sync/syncEngine");
              await addToSyncQueue("ingredients", "UPSERT", {
                id: ingredientId!,
                archived: true,
                updated_at: new Date().toISOString(),
              });

              onSave(); // Close screen
            } catch (err) {
              Alert.alert("Lỗi", "Không thể ẩn nguyên liệu");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#121212",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white" }}>Đang tải...</Text>
      </View>
    );
  }

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
          <Text style={{ color: "#94A3B8" }}>Hủy</Text>
        </Pressable>
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
          {ingredientId ? "Sửa Nguyên Liệu" : "Thêm Nguyên Liệu"}
        </Text>
        <Pressable onPress={handleSave}>
          <Text style={{ color: "#E07A2F", fontWeight: "600" }}>Lưu</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {/* Basic Info */}
          <SectionTitle icon="📦" title="Thông tin cơ bản" />

          <Label text="Tên nguyên liệu *" />
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="VD: Sữa đặc"
            placeholderTextColor="#475569"
            autoFocus={!ingredientId}
          />

          <Label text="Phân loại" />
          <Pressable
            style={styles.pickerButton}
            onPress={() => setShowTypePicker(true)}
          >
            <Text style={{ color: "white" }}>
              {type === "raw_material" &&
                "🧪 Nguyên liệu (Dùng trong công thức)"}
              {type === "supply" && "🧻 Vật dụng (Ly, ống hút...)"}
              {type === "semi_product" && "🔧 Bán thành phẩm (Nước đường...)"}
            </Text>
            <Text style={{ color: "#64748B" }}>▼</Text>
          </Pressable>

          {/* Pricing */}
          <SectionTitle icon="💰" title="Giá & Đơn vị" />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label text="Đơn vị tính" />
              <Pressable
                style={styles.pickerButton}
                onPress={() => setShowUnitPicker(true)}
              >
                <Text style={{ color: "white" }}>{baseUnit}</Text>
                <Text style={{ color: "#64748B" }}>▼</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Label text="Giá vốn (đ)" />
              <TextInput
                style={styles.input}
                value={unitCost}
                onChangeText={setUnitCost}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#475569"
              />
            </View>
          </View>

          {/* Unit Conversion (conditional) */}
          {COUNTABLE_UNITS.includes(baseUnit) && (
            <View
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: "#1A1A1A",
                borderRadius: 8,
              }}
            >
              <Label text={`Khối lượng / 1 ${baseUnit}`} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 2, marginBottom: 0 }]}
                  value={unitWeight}
                  onChangeText={setUnitWeight}
                  keyboardType="numeric"
                  placeholder="VD: 500"
                  placeholderTextColor="#475569"
                />
                <Pressable
                  style={[styles.pickerButton, { flex: 1 }]}
                  onPress={() => setShowWeightUnitPicker(true)}
                >
                  <Text style={{ color: "white" }}>{unitWeightUnit}</Text>
                  <Text style={{ color: "#64748B" }}>▼</Text>
                </Pressable>
              </View>
              <Text style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
                VD: 1 hộp = 500g để AI tự quy đổi khi kiểm kho
              </Text>
            </View>
          )}

          {/* Advanced */}
          <SectionTitle icon="⚙️" title="Cài đặt nâng cao" isOptional />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label text="Tỷ trọng (g/ml)" />
              <TextInput
                style={styles.input}
                value={density}
                onChangeText={setDensity}
                keyboardType="numeric"
                placeholder="1.0"
                placeholderTextColor="#475569"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label text="Trọng lượng vỏ (g)" />
              <TextInput
                style={styles.input}
                value={tareWeight}
                onChangeText={setTareWeight}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#475569"
              />
            </View>
          </View>

          <Label text={`Ngưỡng cảnh báo (${baseUnit})`} />
          <TextInput
            style={styles.input}
            value={minThreshold}
            onChangeText={setMinThreshold}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#475569"
          />

          <Label text="Số ngày bảo quản" />
          <TextInput
            style={styles.input}
            value={shelfLifeDays}
            onChangeText={setShelfLifeDays}
            keyboardType="numeric"
            placeholder="Để trống nếu không theo dõi hạn"
            placeholderTextColor="#475569"
          />

          {/* Inventory Config Section */}
          <SectionTitle icon="⚙️" title="Cấu hình Kiểm Kho" isOptional />

          {/* Row: Item Type + Tracking Mode STACKED VERTICALLY */}
          <View style={{ gap: 16 }}>
            {/* Item Type Section */}
            <View>
              <Label text="Loại hàng hóa" />
              <View style={toggleStyles.toggleGroup}>
                <TouchableOpacity
                  style={[
                    toggleStyles.toggleBtn,
                    itemType === "STOCK" && toggleStyles.toggleBtnActive,
                  ]}
                  onPress={() => {
                    setItemType("STOCK");
                    if (type === "semi_product") {
                      setType("raw_material");
                    }
                  }}
                >
                  <Text
                    style={[
                      toggleStyles.toggleText,
                      itemType === "STOCK" && toggleStyles.textActive,
                    ]}
                  >
                    📦 Tồn kho
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    toggleStyles.toggleBtn,
                    itemType === "PHANTOM" && toggleStyles.toggleBtnActive,
                  ]}
                  onPress={() => {
                    setItemType("PHANTOM");
                    setType("semi_product");
                  }}
                >
                  <Text
                    style={[
                      toggleStyles.toggleText,
                      itemType === "PHANTOM" && toggleStyles.textActive,
                    ]}
                  >
                    🔄 Quy đổi
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                {itemType === "STOCK"
                  ? "Có quản lý tồn kho thực tế"
                  : "Chỉ tính toán lý thuyết"}
              </Text>
            </View>

            {/* Tracking Mode Section */}
            <View>
              <Label text="Chế độ kiểm tra" />
              <View style={toggleStyles.toggleGroup}>
                <TouchableOpacity
                  style={[
                    toggleStyles.toggleBtn,
                    trackingMode === "STRICT" && toggleStyles.toggleBtnActive,
                  ]}
                  onPress={() => setTrackingMode("STRICT")}
                >
                  <Text
                    style={[
                      toggleStyles.toggleText,
                      trackingMode === "STRICT" && toggleStyles.textActive,
                    ]}
                  >
                    🛡️ Kiểm kỹ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    toggleStyles.toggleBtn,
                    trackingMode === "LOOSE" && toggleStyles.toggleBtnActive,
                  ]}
                  onPress={() => setTrackingMode("LOOSE")}
                >
                  <Text
                    style={[
                      toggleStyles.toggleText,
                      trackingMode === "LOOSE" && toggleStyles.textActive,
                    ]}
                  >
                    📝 Tin tưởng
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                {trackingMode === "STRICT"
                  ? "Báo động nếu lệch doanh thu"
                  : "Lấy số thực tế làm chuẩn"}
              </Text>
            </View>
          </View>

          {/* Allowable Variance - Only for STRICT */}
          {trackingMode === "STRICT" && (
            <View style={{ marginBottom: 16 }}>
              <Label text="Mức hao hụt cho phép (%)" />
              <TextInput
                style={styles.input}
                value={allowableVariance}
                onChangeText={setAllowableVariance}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor="#475569"
              />
              <Text style={{ color: "#64748B", fontSize: 11, marginTop: -12 }}>
                Lệch dưới mức này → Hệ thống tự điều chỉnh (PASS)
              </Text>
            </View>
          )}

          {/* Batch Recipe Section - Only for PHANTOM */}
          {itemType === "PHANTOM" && (
            <View
              style={{
                backgroundColor: "#1A2A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#6B8E2340",
              }}
            >
              <Text style={{ fontSize: 16, marginBottom: 8 }}>
                <Text style={{ fontSize: 18 }}>🍵</Text>{" "}
                <Text style={{ color: "#6B8E23", fontWeight: "600" }}>
                  Công Thức Nấu (Batch Recipe)
                </Text>
              </Text>

              {/* Checkbox line */}
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingVertical: 8,
                }}
                onPress={() => setIsBatchItem(!isBatchItem)}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: isBatchItem ? "#6B8E23" : "#475569",
                    backgroundColor: isBatchItem ? "#6B8E23" : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  {isBatchItem && (
                    <Text style={{ color: "white", fontSize: 14 }}>✓</Text>
                  )}
                </View>
                <Text style={{ color: "#F8FAFC", fontSize: 14 }}>
                  Đây là bán thành phẩm (có công thức nấu)
                </Text>
              </Pressable>

              {isBatchItem && (
                <>
                  <Text
                    style={{ color: "#64748B", fontSize: 12, marginBottom: 12 }}
                  >
                    Ví dụ: Cốt trà được nấu từ Trà lá + Nước sôi
                  </Text>

                  {/* Nguyên liệu đầu vào */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: "#F8FAFC", fontWeight: "500" }}>
                      🧪 Nguyên liệu đầu vào
                    </Text>
                    <Pressable
                      style={{
                        backgroundColor: "#E07A2F",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                      onPress={() => setShowIngredientPicker(true)}
                    >
                      <Text style={{ color: "white", fontWeight: "600" }}>
                        + Thêm
                      </Text>
                    </Pressable>
                  </View>

                  {/* List of added ingredients */}
                  {batchIngredients.length === 0 ? (
                    <View
                      style={{
                        backgroundColor: "#0F1A0F",
                        borderRadius: 8,
                        padding: 16,
                        alignItems: "center",
                        marginBottom: 16,
                      }}
                    >
                      <Text style={{ color: "#64748B", textAlign: "center" }}>
                        Chưa có nguyên liệu.{"\n"}Bấm "+ Thêm" để bắt đầu.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ marginBottom: 16 }}>
                      {batchIngredients.map((ing) => (
                        <View
                          key={ing.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: "#0F1A0F",
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{ flex: 1, color: "#F8FAFC", fontSize: 13 }}
                            numberOfLines={1}
                          >
                            {ing.name}
                          </Text>
                          <TextInput
                            style={{
                              backgroundColor: "#1E293B",
                              borderRadius: 6,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              color: "white",
                              fontSize: 13,
                              width: 70,
                              textAlign: "center",
                              marginHorizontal: 8,
                            }}
                            value={ing.quantity}
                            onChangeText={(val) =>
                              updateBatchIngredientQty(ing.id, val)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#475569"
                          />
                          <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                            {ing.unit}
                          </Text>
                          <Pressable
                            onPress={() => removeBatchIngredient(ing.id)}
                            style={{ marginLeft: 10, padding: 4 }}
                          >
                            <Text style={{ color: "#F87171", fontSize: 16 }}>
                              ✕
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Thành phẩm thu được */}
                  <Text
                    style={{
                      color: "#F8FAFC",
                      fontWeight: "500",
                      marginBottom: 8,
                    }}
                  >
                    🍶 Thành phẩm thu được
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={batchYieldQty}
                      onChangeText={setBatchYieldQty}
                      keyboardType="numeric"
                      placeholder="VD: 2000"
                      placeholderTextColor="#475569"
                    />
                    <Text
                      style={{
                        color: "#94A3B8",
                        marginLeft: 12,
                        fontSize: 14,
                      }}
                    >
                      {baseUnit}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: "#64748B",
                      fontSize: 11,
                      marginTop: 6,
                    }}
                  >
                    Đơn vị khớp theo đơn vị kho của món này
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Delete Button */}
          {ingredientId && (
            <Pressable
              onPress={handleDelete}
              style={{
                backgroundColor: "#1A1A1A",
                borderWidth: 1,
                borderColor: COLORS.error,
                borderRadius: 8,
                padding: 14,
                alignItems: "center",
                marginTop: 32,
                marginBottom: 40,
              }}
            >
              <Text style={{ color: COLORS.error, fontWeight: "600" }}>
                Xóa (Ẩn) nguyên liệu
              </Text>
            </Pressable>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SelectionModal
        visible={showTypePicker}
        title="Chọn phân loại"
        options={[
          {
            label: "🧪 Nguyên liệu (Dùng trong công thức)",
            value: "raw_material",
          },
          { label: "🧻 Vật dụng (Ly, túi, ống hút...)", value: "supply" },
          { label: "🔧 Bán thành phẩm (Cần nấu)", value: "semi_product" },
        ]}
        onSelect={(val: string) => {
          const newType = val as "raw_material" | "supply" | "semi_product";
          setType(newType);
          // Auto-sync: semi_product → PHANTOM, others → STOCK (giống Desktop)
          setItemType(newType === "semi_product" ? "PHANTOM" : "STOCK");
        }}
        onClose={() => setShowTypePicker(false)}
      />

      <SelectionModal
        visible={showUnitPicker}
        title="Chọn đơn vị tính"
        options={UNIT_OPTIONS.map((u) => ({ label: u, value: u }))}
        onSelect={(val: string) => setBaseUnit(val)}
        onClose={() => setShowUnitPicker(false)}
      />

      <SelectionModal
        visible={showWeightUnitPicker}
        title="Đơn vị trọng lượng"
        options={["g", "kg", "ml", "lít"].map((u) => ({ label: u, value: u }))}
        onSelect={(val: string) => setUnitWeightUnit(val)}
        onClose={() => setShowWeightUnitPicker(false)}
      />

      {/* Ingredient Picker Modal for Batch Recipe */}
      <Modal
        visible={showIngredientPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowIngredientPicker(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#1E293B",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              paddingBottom: 30,
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
                borderBottomColor: "#334155",
              }}
            >
              <Text
                style={{ color: "#F8FAFC", fontSize: 18, fontWeight: "600" }}
              >
                Chọn nguyên liệu
              </Text>
              <Pressable onPress={() => setShowIngredientPicker(false)}>
                <Text style={{ color: "#94A3B8", fontSize: 22 }}>✕</Text>
              </Pressable>
            </View>

            {/* Search */}
            <View style={{ padding: 16 }}>
              <TextInput
                style={{
                  backgroundColor: "#0F172A",
                  borderRadius: 8,
                  padding: 12,
                  color: "white",
                  fontSize: 15,
                }}
                placeholder="Tìm nguyên liệu..."
                placeholderTextColor="#64748B"
                value={ingredientSearch}
                onChangeText={setIngredientSearch}
                autoFocus
              />
            </View>

            {/* List */}
            <ScrollView style={{ paddingHorizontal: 16 }}>
              {availableIngredients
                .filter((ing) =>
                  ing.name
                    .toLowerCase()
                    .includes(ingredientSearch.toLowerCase())
                )
                .map((ing) => (
                  <Pressable
                    key={ing.id}
                    style={{
                      backgroundColor: "#0F172A",
                      borderRadius: 8,
                      padding: 14,
                      marginBottom: 8,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onPress={() => addBatchIngredient(ing)}
                  >
                    <Text style={{ color: "#F8FAFC", fontSize: 15, flex: 1 }}>
                      {ing.name}
                    </Text>
                    <Text style={{ color: "#64748B", fontSize: 13 }}>
                      {ing.base_unit}
                    </Text>
                  </Pressable>
                ))}
              {availableIngredients.filter((ing) =>
                ing.name.toLowerCase().includes(ingredientSearch.toLowerCase())
              ).length === 0 && (
                <Text
                  style={{
                    color: "#64748B",
                    textAlign: "center",
                    paddingVertical: 20,
                  }}
                >
                  Không tìm thấy nguyên liệu
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Helper Components
const SectionTitle = ({
  icon,
  title,
  isOptional,
}: {
  icon: string;
  title: string;
  isOptional?: boolean;
}) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      marginBottom: 12,
    }}
  >
    <Text style={{ fontSize: 20, marginRight: 8 }}>{icon}</Text>
    <Text
      style={{ fontSize: 16, fontWeight: "600", color: "#F8FAFC", flex: 1 }}
    >
      {title}
    </Text>
    {isOptional && (
      <View
        style={{
          backgroundColor: "#334155",
          paddingHorizontal: 6,
          borderRadius: 4,
        }}
      >
        <Text style={{ color: "#94A3B8", fontSize: 10 }}>Tùy chọn</Text>
      </View>
    )}
  </View>
);

const Label = ({ text }: { text: string }) => (
  <Text style={{ color: "#94A3B8", marginBottom: 6, fontSize: 13 }}>
    {text}
  </Text>
);

const styles = {
  input: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    padding: 12,
    color: "white",
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pickerButton: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
} as const;

// Toggle button styles for Item Type and Tracking Mode
const toggleStyles = {
  toggleGroup: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center" as const,
  },
  toggleBtnActive: {
    backgroundColor: "#E07A2F20",
    borderColor: "#E07A2F",
  },
  toggleText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500" as const,
  },
  textActive: {
    color: "#E07A2F",
    fontWeight: "600" as const,
  },
};

const SelectionModal = ({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  onClose: () => void;
}) => (
  <Modal visible={visible} transparent animationType="fade">
    <Pressable
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        padding: 20,
      }}
      onPress={onClose}
    >
      <View
        style={{ backgroundColor: "#0F172A", borderRadius: 12, maxHeight: 500 }}
      >
        <Text
          style={{
            color: "white",
            fontWeight: "bold",
            padding: 16,
            borderBottomWidth: 1,
            borderColor: "#334155",
          }}
        >
          {title}
        </Text>
        <ScrollView>
          {options.map((opt: any) => (
            <Pressable
              key={opt.value}
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderColor: "#1E293B",
              }}
              onPress={() => {
                onSelect(opt.value);
                onClose();
              }}
            >
              <Text style={{ color: "#F1F5F9" }}>{opt.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Pressable>
  </Modal>
);
