/**
 * RecipeScanScreen - AI-powered recipe scanning
 * Per .antigravityrules: Scan handwritten/printed recipes and auto-fill
 * Features: Camera capture, AI parsing, ingredient mapping, navigate to RecipeEdit
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File } from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { getDB } from "../db";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { Env } from "../env";
import { Ionicons } from "@expo/vector-icons";

// UXUIrules Color Palette
const COLORS = {
  background: "#121212",
  surface: "#1A1A1A",
  textPrimary: "#F5F3EF",
  textSecondary: "#B8B3A8",
  cta: "#E07A2F",
  success: "#6B8E23",
  successBright: "#55A630",
  warning: "#FFC857",
  error: "#E63946",
  border: "#2A2A2A",
};

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

interface ParsedRecipe {
  name: string;
  category: string;
  price: number | null;
  ingredients: ParsedIngredient[];
  confidence: number;
}

interface LocalIngredient {
  id: string;
  name: string;
  base_unit: string;
  unit_cost: number;
  aliases: string;
}

interface MappedIngredient extends ParsedIngredient {
  linkedId: string | null;
  linkedName: string | null;
  matchScore: number;
}

interface RecipeScanScreenProps {
  onBack: () => void;
  onCreateRecipe: (recipeData: {
    name: string;
    price: number;
    category: string;
    ingredients: Array<{
      ingredient_id: string;
      name: string;
      quantity: number;
      unit: string;
    }>;
  }) => void;
}

// Fuzzy match score
function getMatchScore(
  aiName: string,
  ingName: string,
  aliases: string[],
): number {
  const normalized = aiName.toLowerCase().trim();
  const name = ingName.toLowerCase();

  if (name === normalized) return 100;
  if (aliases.some((a) => a.toLowerCase() === normalized)) return 95;

  // If DB ingredient name is fully contained in AI name, high confidence
  if (normalized.includes(name) && name.length >= 3) {
    return 85;
  }

  // If AI name is fully contained in DB name
  if (name.includes(normalized) && normalized.length >= 3) {
    return 85;
  }

  return 0;
}

export default function RecipeScanScreen({
  onBack,
  onCreateRecipe,
}: RecipeScanScreenProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [mappedIngredients, setMappedIngredients] = useState<
    MappedIngredient[]
  >([]);
  const [localIngredients, setLocalIngredients] = useState<LocalIngredient[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLocalIngredients();
  }, []);

  const loadLocalIngredients = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync<LocalIngredient>(
        "SELECT id, name, base_unit, unit_cost, aliases FROM local_ingredients WHERE archived = 0",
      );
      setLocalIngredients(rows);
    } catch (err) {
      console.log("No local ingredients yet");
    }
  };

  // Take photo
  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền truy cập camera");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setParsedRecipe(null);
      setMappedIngredients([]);
      setError(null);
    }
  };

  // Pick from gallery
  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setParsedRecipe(null);
      setMappedIngredients([]);
      setError(null);
    }
  };

  // Compress and convert to base64
  const compressImage = async (uri: string) => {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    const file = new File(manipulated.uri);
    const base64 = await file.base64();
    return base64;
  };

  // Auto-map AI ingredients to local DB
  const autoMapIngredients = (
    aiIngredients: ParsedIngredient[],
  ): MappedIngredient[] => {
    return aiIngredients.map((aiIng) => {
      let bestMatch: LocalIngredient | null = null;
      let bestScore = 0;

      for (const ing of localIngredients) {
        const aliases = ing.aliases ? JSON.parse(ing.aliases) : [];
        const score = getMatchScore(aiIng.name, ing.name, aliases);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ing;
        }
      }

      if (bestMatch && bestScore >= 70) {
        return {
          ...aiIng,
          linkedId: bestMatch.id,
          linkedName: bestMatch.name,
          matchScore: bestScore,
        };
      }

      return {
        ...aiIng,
        linkedId: null,
        linkedName: null,
        matchScore: 0,
      };
    });
  };

  // Parse image with AI
  const handleParseImage = async () => {
    if (!imageUri) return;

    setParsing(true);
    setError(null);

    try {
      // Step 1: Compress
      setLoadingStep("Đang nén ảnh...");
      const base64 = await compressImage(imageUri);

      // Step 2: Call AI
      setLoadingStep("Đang phân tích công thức...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${Env.BACKEND_URL}/ai/parse-recipe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: "image/jpeg",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data: ParsedRecipe = await response.json();

      // Step 3: Map ingredients
      setLoadingStep("Đang liên kết nguyên liệu...");
      const mapped = autoMapIngredients(data.ingredients);

      setParsedRecipe(data);
      setMappedIngredients(mapped);

      // Haptic feedback based on confidence
      if (data.confidence >= 85) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err: any) {
      console.error("Parse error:", err);
      setError(err.message || "Lỗi phân tích ảnh");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
      setLoadingStep("");
    }
  };

  // Create recipe from parsed data
  const handleCreateRecipe = () => {
    if (!parsedRecipe) return;

    const linkedIngredients = mappedIngredients
      .filter((i) => i.linkedId)
      .map((i) => ({
        ingredient_id: i.linkedId!,
        name: i.linkedName!,
        quantity: i.quantity,
        unit: i.unit,
      }));

    const unmappedCount = mappedIngredients.filter((i) => !i.linkedId).length;

    if (unmappedCount > 0) {
      Alert.alert(
        "Có nguyên liệu chưa liên kết",
        `${unmappedCount} nguyên liệu chưa tìm thấy trong kho. Tiếp tục tạo món với ${linkedIngredients.length} nguyên liệu đã liên kết?`,
        [
          { text: "Hủy", style: "cancel" },
          {
            text: "Tiếp tục",
            onPress: () =>
              onCreateRecipe({
                name: parsedRecipe.name,
                price: parsedRecipe.price || 0,
                category: parsedRecipe.category,
                ingredients: linkedIngredients,
              }),
          },
        ],
      );
    } else {
      onCreateRecipe({
        name: parsedRecipe.name,
        price: parsedRecipe.price || 0,
        category: parsedRecipe.category,
        ingredients: linkedIngredients,
      });
    }
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 85) return COLORS.success;
    if (conf >= 70) return COLORS.warning;
    return COLORS.error;
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Pressable
          onPress={onBack}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          <Text
            style={{ color: COLORS.textSecondary, fontSize: 16, marginLeft: 4 }}
          >
            Quay lại
          </Text>
        </Pressable>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginLeft: 16 }}
        >
          <Ionicons
            name="scan-circle"
            size={24}
            color={COLORS.cta}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              color: COLORS.textPrimary,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Quét công thức
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Camera/Gallery buttons */}
        {!imageUri && (
          <View style={{ gap: 12 }}>
            <Pressable
              onPress={handleTakePhoto}
              style={{
                backgroundColor: COLORS.cta,
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="camera"
                size={20}
                color="white"
                style={{ marginRight: 8 }}
              />
              <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>
                Chụp ảnh công thức
              </Text>
            </Pressable>
            <Pressable
              onPress={handlePickImage}
              style={{
                backgroundColor: COLORS.surface,
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: COLORS.border,
                flexDirection: "row",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="images"
                size={20}
                color={COLORS.textSecondary}
                style={{ marginRight: 8 }}
              />
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontWeight: "500",
                  fontSize: 16,
                }}
              >
                Chọn từ thư viện
              </Text>
            </Pressable>
            <Text
              style={{
                color: COLORS.textSecondary,
                textAlign: "center",
                marginTop: 24,
              }}
            >
              Chụp ảnh công thức viết tay hoặc in sẵn.{"\n"}AI sẽ tự động trích
              xuất nguyên liệu.
            </Text>
          </View>
        )}

        {/* Image Preview */}
        {imageUri && (
          <View style={{ marginBottom: 16 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: 200, borderRadius: 12 }}
              resizeMode="cover"
            />
            <Pressable
              onPress={() => {
                setImageUri(null);
                setParsedRecipe(null);
              }}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                backgroundColor: "rgba(0,0,0,0.6)",
                borderRadius: 16,
                width: 32,
                height: 32,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white" }}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Parse button */}
        {imageUri && !parsedRecipe && (
          <Pressable
            onPress={handleParseImage}
            disabled={parsing}
            style={{
              backgroundColor: parsing ? COLORS.surface : COLORS.cta,
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
                <ActivityIndicator color={COLORS.cta} />
                <Text style={{ color: COLORS.textPrimary, fontWeight: "500" }}>
                  {loadingStep || "Đang xử lý..."}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="sparkles"
                  size={18}
                  color="white"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: "white", fontWeight: "600" }}>
                  AI Phân tích công thức
                </Text>
              </View>
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
            <Text style={{ color: COLORS.error }}>{error}</Text>
          </View>
        )}

        {/* Parsed Recipe Preview */}
        {parsedRecipe && (
          <View>
            {/* Recipe Info */}
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textPrimary,
                    fontSize: 18,
                    fontWeight: "600",
                  }}
                >
                  {parsedRecipe.name || "Không rõ tên"}
                </Text>
                <View
                  style={{
                    backgroundColor: getConfidenceColor(
                      parsedRecipe.confidence,
                    ),
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{ color: "white", fontSize: 12, fontWeight: "600" }}
                  >
                    {parsedRecipe.confidence}%
                  </Text>
                </View>
              </View>
              {parsedRecipe.category && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="folder-open"
                    size={14}
                    color={COLORS.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: COLORS.textSecondary }}>
                    {parsedRecipe.category}
                  </Text>
                </View>
              )}
              {parsedRecipe.price && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons
                    name="cash"
                    size={14}
                    color={COLORS.cta}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: COLORS.cta, fontWeight: "600" }}>
                    {parsedRecipe.price.toLocaleString("vi-VN")} đ
                  </Text>
                </View>
              )}
            </View>

            {/* Ingredients List */}
            <Text
              style={{
                color: COLORS.textPrimary,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              Nguyên liệu ({mappedIngredients.length})
            </Text>
            {mappedIngredients.map((ing, idx) => (
              <View
                key={idx}
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: ing.linkedId
                    ? COLORS.success
                    : COLORS.warning,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: COLORS.textPrimary }}>{ing.name}</Text>
                  <Text style={{ color: COLORS.textSecondary }}>
                    {ing.quantity} {ing.unit}
                  </Text>
                </View>
                {ing.linkedId ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={COLORS.success}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ color: COLORS.success, fontSize: 12 }}>
                      Liên kết: {ing.linkedName} ({ing.matchScore}%)
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Ionicons
                      name="warning"
                      size={14}
                      color={COLORS.warning}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ color: COLORS.warning, fontSize: 12 }}>
                      Chưa có trong kho
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {/* Create Recipe Button */}
            <Pressable
              onPress={handleCreateRecipe}
              style={{
                backgroundColor: COLORS.cta,
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
                marginTop: 16,
                marginBottom: 32,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="add-circle"
                  size={18}
                  color="white"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{ color: "white", fontWeight: "600", fontSize: 16 }}
                >
                  Tạo món từ kết quả AI
                </Text>
              </View>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
