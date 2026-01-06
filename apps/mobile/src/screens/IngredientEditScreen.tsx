import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Modal,
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

  // Advanced
  const [density, setDensity] = useState("1");
  const [tareWeight, setTareWeight] = useState("0");
  const [unitWeight, setUnitWeight] = useState("");
  const [unitWeightUnit, setUnitWeightUnit] = useState("g");

  const [loading, setLoading] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showWeightUnitPicker, setShowWeightUnitPicker] = useState(false);

  useEffect(() => {
    if (ingredientId) {
      loadIngredient();
    }
  }, [ingredientId]);

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

      // Logic "y chang" (exactly same) as Desktop
      const itemType = type === "semi_product" ? "PHANTOM" : "STOCK";

      // 1. Local Insert/Update
      await db.runAsync(
        `INSERT OR REPLACE INTO local_ingredients 
         (id, business_id, name, type, base_unit, unit_cost, min_threshold, density, tare_weight, unit_weight, unit_weight_unit, item_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
          itemType,
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
        item_type: itemType,
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
            {type === "raw_material" && "🧪 Nguyên liệu (Dùng trong công thức)"}
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

      {/* Pickers */}
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
        onSelect={(val: string) => setType(val as any)}
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
