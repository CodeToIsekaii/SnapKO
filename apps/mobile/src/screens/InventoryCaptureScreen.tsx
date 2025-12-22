/**
 * InventoryCaptureScreen - Camera capture with AI parsing + Ingredient Mapping
 * Features: Camera, Compress <1MB, AI parse, Confidence highlighting, Autocomplete dropdown
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { Env } from "../env";

const CONFIDENCE_THRESHOLD = 85;

// Types
interface AiRawItem {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost?: number | null;
}

interface AiMappedItem {
  rawName: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost: number | null;
  linkedIngredientId: string | null;
  linkedIngredientName: string | null;
  isNewIngredient: boolean;
}

interface LocalIngredient {
  id: string;
  name: string;
  aliases: string;
  base_unit: string;
  unit_cost: number;
}

interface InventoryCaptureScreenProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

// Fuzzy match score
function getMatchScore(
  aiName: string,
  ingName: string,
  aliases: string[]
): number {
  const normalized = aiName.toLowerCase().trim();
  const name = ingName.toLowerCase();

  if (name === normalized) return 100;
  if (aliases.some((a) => a.toLowerCase() === normalized)) return 95;
  if (name.includes(normalized) || normalized.includes(name)) {
    return Math.round(
      (Math.min(name.length, normalized.length) /
        Math.max(name.length, normalized.length)) *
        80
    );
  }
  return 0;
}

export default function InventoryCaptureScreen({
  onBack,
  onOpenSettings,
}: InventoryCaptureScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(""); // Multi-step loading
  const [items, setItems] = useState<AiMappedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Local ingredients for autocomplete
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load ingredients from local DB
  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    try {
      const db = await SQLite.openDatabaseAsync("snapko.db");
      const rows = await db.getAllAsync<LocalIngredient>(
        "SELECT id, name, aliases, base_unit, unit_cost FROM local_ingredients WHERE archived = 0"
      );
      setIngredients(rows);
    } catch (err) {
      console.log("No local ingredients yet");
    }
  };

  // Compress image to <1MB
  const compressImage = async (
    uri: string
  ): Promise<{ base64: string; mimeType: string }> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: "base64",
    });

    return { base64, mimeType: "image/jpeg" };
  };

  // Take photo
  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền truy cập camera");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setItems([]);
      setError(null);
    }
  };

  // Pick from gallery
  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setItems([]);
      setError(null);
    }
  };

  // Auto-map AI items to ingredients
  const autoMapItems = (rawItems: AiRawItem[]): AiMappedItem[] => {
    return rawItems.map((raw) => {
      let bestMatch: LocalIngredient | null = null;
      let bestScore = 0;

      for (const ing of ingredients) {
        const aliases = ing.aliases ? JSON.parse(ing.aliases) : [];
        const score = getMatchScore(raw.name, ing.name, aliases);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ing;
        }
      }

      // Auto-link if score >= 80
      if (bestMatch && bestScore >= 80) {
        return {
          rawName: raw.name,
          quantity: raw.quantity,
          unit: raw.unit,
          confidence: raw.confidence,
          unitCost: raw.unitCost ?? bestMatch.unit_cost,
          linkedIngredientId: bestMatch.id,
          linkedIngredientName: bestMatch.name,
          isNewIngredient: false,
        };
      }

      return {
        rawName: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        confidence: raw.confidence,
        unitCost: raw.unitCost ?? null,
        linkedIngredientId: null,
        linkedIngredientName: null,
        isNewIngredient: false,
      };
    });
  };

  // Parse image with AI - Multi-step loading
  const handleParseImage = async () => {
    if (!imageUri) return;

    setParsing(true);
    setError(null);

    try {
      // Step 1: Compress image
      setLoadingStep("📷 Đang nén ảnh...");
      const { base64, mimeType } = await compressImage(imageUri);

      // Step 2: Upload to AI
      setLoadingStep("☁️ Đang tải ảnh lên...");
      const response = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/ai-parse-inventory`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        }
      );

      // Step 3: AI Processing
      setLoadingStep("🤖 AI đang đọc nhãn...");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI parse failed");
      }

      // Step 4: Mapping data
      setLoadingStep("📊 Đang chuẩn hóa dữ liệu...");
      if (data.items && data.items.length > 0) {
        const mapped = autoMapItems(data.items);
        setItems(mapped);
      } else {
        setError("Không tìm thấy nguyên liệu. Thử chụp lại?");
      }
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setParsing(false);
      setLoadingStep("");
    }
  };

  // Get filtered suggestions for dropdown
  const getFilteredSuggestions = (): LocalIngredient[] => {
    if (!searchQuery) return ingredients.slice(0, 10);
    const query = searchQuery.toLowerCase();
    return ingredients
      .filter(
        (ing) =>
          ing.name.toLowerCase().includes(query) ||
          (ing.aliases && ing.aliases.toLowerCase().includes(query))
      )
      .slice(0, 10);
  };

  // Link item to ingredient
  const linkIngredient = (itemIndex: number, ing: LocalIngredient) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === itemIndex
          ? {
              ...item,
              linkedIngredientId: ing.id,
              linkedIngredientName: ing.name,
              unitCost: item.unitCost ?? ing.unit_cost,
              isNewIngredient: false,
            }
          : item
      )
    );
    setActiveDropdown(null);
    setSearchQuery("");
  };

  // Mark as new ingredient
  const markAsNew = (itemIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === itemIndex
          ? {
              ...item,
              linkedIngredientId: null,
              linkedIngredientName: null,
              isNewIngredient: true,
            }
          : item
      )
    );
    setActiveDropdown(null);
  };

  // Update item field
  const updateItem = (index: number, field: keyof AiMappedItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Confidence style - Side border pattern per .UXUIrules
  // High (>=90%): Thin Olive Green border
  // Medium (85-90%): Mustard Yellow border
  // Low (<85%): Tomato Red border
  const getConfidenceStyle = (conf: number) => {
    if (conf >= 90) {
      return { borderColor: "#6B8E23", borderWidth: 3, text: "#6B8E23" }; // Olive Green
    }
    if (conf >= 85) {
      return { borderColor: "#FFC857", borderWidth: 4, text: "#FFC857" }; // Mustard Yellow
    }
    return { borderColor: "#E63946", borderWidth: 4, text: "#E63946" }; // Tomato Red
  };

  // Counts
  const lowConfCount = items.filter(
    (i) => i.confidence < CONFIDENCE_THRESHOLD
  ).length;
  const unmappedCount = items.filter(
    (i) => !i.linkedIngredientId && !i.isNewIngredient
  ).length;

  // Can save?
  const canSave = items.length > 0 && unmappedCount === 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#1E293B",
        }}
      >
        <Pressable onPress={onBack}>
          <Text style={{ color: "#94A3B8", fontSize: 16 }}>← Quay lại</Text>
        </Pressable>
        <Text
          style={{
            color: "white",
            fontSize: 18,
            fontWeight: "600",
            marginLeft: 16,
          }}
        >
          Kiểm kê kho
        </Text>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Image preview or camera */}
        {imageUri ? (
          <View style={{ marginBottom: 16 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: 200, borderRadius: 12 }}
              resizeMode="cover"
            />
            <Pressable
              onPress={() => {
                setImageUri(null);
                setItems([]);
              }}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                backgroundColor: "rgba(0,0,0,0.6)",
                padding: 8,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: "white" }}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
            <Pressable
              onPress={handleTakePhoto}
              style={{
                flex: 1,
                backgroundColor: "#E07A2F",
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>
                📷 Chụp ảnh
              </Text>
            </Pressable>
            <Pressable
              onPress={handlePickImage}
              style={{
                flex: 1,
                backgroundColor: "#1A1A1A",
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            >
              <Text style={{ color: "#94A3B8", fontWeight: "600" }}>
                🖼 Thư viện
              </Text>
            </Pressable>
          </View>
        )}

        {/* Parse button */}
        {imageUri && items.length === 0 && (
          <Pressable
            onPress={handleParseImage}
            disabled={parsing}
            style={{
              backgroundColor: parsing ? "#1A1A1A" : "#6B8E23",
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            {parsing ? (
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ActivityIndicator color="#E07A2F" />
                <Text style={{ color: "white", fontWeight: "500" }}>
                  {loadingStep || "Đang xử lý..."}
                </Text>
              </View>
            ) : (
              <Text style={{ color: "white", fontWeight: "600" }}>
                ✨ AI Phân tích ảnh
              </Text>
            )}
          </Pressable>
        )}

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: "rgba(239,68,68,0.15)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#EF4444" }}>{error}</Text>
          </View>
        )}

        {/* Warnings */}
        {lowConfCount > 0 && (
          <View
            style={{
              backgroundColor: "rgba(245,158,11,0.15)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#F59E0B" }}>
              ⚠️ {lowConfCount} mục cần kiểm tra (confidence {"<"}85%)
            </Text>
          </View>
        )}
        {unmappedCount > 0 && (
          <View
            style={{
              backgroundColor: "rgba(239,68,68,0.15)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#EF4444" }}>
              🔗 {unmappedCount} mục chưa liên kết nguyên liệu
            </Text>
          </View>
        )}

        {/* Items list */}
        {items.map((item, index) => {
          const style = getConfidenceStyle(item.confidence);
          const needsMapping =
            !item.linkedIngredientId && !item.isNewIngredient;

          return (
            <View
              key={index}
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                // Side-border pattern for AI confidence
                borderLeftWidth: style.borderWidth,
                borderLeftColor: needsMapping ? "#E63946" : style.borderColor,
              }}
            >
              {/* Header row */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                  {item.rawName}
                </Text>
                <View
                  style={{
                    backgroundColor: style.text,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{ color: "white", fontSize: 11, fontWeight: "600" }}
                  >
                    {item.confidence}%
                  </Text>
                </View>
              </View>

              {/* Ingredient Link (Autocomplete) */}
              <Pressable
                onPress={() =>
                  setActiveDropdown(activeDropdown === index ? null : index)
                }
                style={{
                  backgroundColor: "#0F172A",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: needsMapping ? 1 : 0,
                  borderColor: "#EF4444",
                }}
              >
                <Text
                  style={{
                    color: item.linkedIngredientName
                      ? "#22C55E"
                      : item.isNewIngredient
                      ? "#3B82F6"
                      : "#94A3B8",
                  }}
                >
                  {item.linkedIngredientName
                    ? `✓ ${item.linkedIngredientName}`
                    : item.isNewIngredient
                    ? "➕ Tạo nguyên liệu mới"
                    : "Chọn nguyên liệu..."}
                </Text>
              </Pressable>

              {/* Dropdown */}
              {activeDropdown === index && (
                <View
                  style={{
                    backgroundColor: "#1E293B",
                    borderRadius: 8,
                    marginBottom: 8,
                    maxHeight: 200,
                  }}
                >
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Tìm nguyên liệu..."
                    placeholderTextColor="#475569"
                    style={{
                      backgroundColor: "#0F172A",
                      padding: 12,
                      color: "white",
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}
                  />
                  <FlatList
                    data={getFilteredSuggestions()}
                    keyExtractor={(ing) => ing.id}
                    renderItem={({ item: ing }) => (
                      <Pressable
                        onPress={() => linkIngredient(index, ing)}
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: "#334155",
                        }}
                      >
                        <Text style={{ color: "white" }}>{ing.name}</Text>
                        <Text style={{ color: "#64748B", fontSize: 11 }}>
                          {ing.base_unit} · {ing.unit_cost?.toLocaleString()}đ
                        </Text>
                      </Pressable>
                    )}
                    ListFooterComponent={
                      <Pressable
                        onPress={() => markAsNew(index)}
                        style={{ padding: 12, backgroundColor: "#172554" }}
                      >
                        <Text style={{ color: "#3B82F6" }}>
                          ➕ Tạo nguyên liệu mới "{item.rawName}"
                        </Text>
                      </Pressable>
                    }
                    style={{ maxHeight: 150 }}
                  />
                </View>
              )}

              {/* Quantity + Unit */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={String(item.quantity)}
                  onChangeText={(t) =>
                    updateItem(index, "quantity", parseFloat(t) || 0)
                  }
                  keyboardType="numeric"
                  style={{
                    backgroundColor: "#0F172A",
                    borderRadius: 8,
                    padding: 12,
                    color: "white",
                    flex: 1,
                  }}
                />
                <TextInput
                  value={item.unit}
                  onChangeText={(t) => updateItem(index, "unit", t)}
                  style={{
                    backgroundColor: "#0F172A",
                    borderRadius: 8,
                    padding: 12,
                    color: "white",
                    flex: 1,
                  }}
                />
              </View>

              {/* Unit cost */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: "#64748B", fontSize: 12 }}>Đơn giá:</Text>
                <TextInput
                  value={item.unitCost ? String(item.unitCost) : ""}
                  onChangeText={(t) =>
                    updateItem(index, "unitCost", parseFloat(t) || null)
                  }
                  keyboardType="numeric"
                  placeholder="VND"
                  placeholderTextColor="#475569"
                  style={{
                    backgroundColor: "#0F172A",
                    borderRadius: 8,
                    padding: 8,
                    color: "white",
                    flex: 1,
                  }}
                />
              </View>

              {/* Remove */}
              <Pressable onPress={() => removeItem(index)}>
                <Text
                  style={{ color: "#EF4444", textAlign: "right", fontSize: 12 }}
                >
                  Xóa mục này
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* Save button */}
        {items.length > 0 && (
          <Pressable
            onPress={async () => {
              if (!canSave) return;
              // Save to local SQLite
              try {
                const db = await SQLite.openDatabaseAsync("snapko.db");
                const id = crypto.randomUUID();
                await db.runAsync(
                  `INSERT INTO pending_sync_logs (id, type, ai_parsed_json, created_at, synced)
                   VALUES (?, ?, ?, ?, ?)`,
                  [
                    id,
                    "IMPORT",
                    JSON.stringify({ items }),
                    new Date().toISOString(),
                    0,
                  ]
                );
                Alert.alert(
                  "✅ Đã lưu!",
                  "Dữ liệu sẽ được đồng bộ khi có mạng."
                );
                setItems([]);
                setImageUri(null);
              } catch (err) {
                Alert.alert("Lỗi", "Không thể lưu dữ liệu");
              }
            }}
            disabled={!canSave}
            style={{
              backgroundColor: canSave ? "#22C55E" : "#64748B",
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
              marginTop: 8,
              marginBottom: 40,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              {canSave
                ? `✓ Xác nhận & Lưu (${items.length} mục)`
                : `Cần liên kết ${unmappedCount} mục`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
