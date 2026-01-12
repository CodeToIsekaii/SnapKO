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
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { Env } from "../env";
import { calculateNetVolume } from "@snapko/shared";
import { getDB } from "../db";
import { processSyncQueue } from "../services/syncQueue";
import {
  VarianceModal,
  SurplusBottomSheet,
  VarianceReason,
} from "../components";
import { InventoryService } from "../features/inventory/services/inventory.service";
import { useInventoryModel } from "../contexts/InventoryModelContext";
import { useTodayIncoming } from "../hooks/useTodayIncoming";
import { IncomingLogCard } from "../components/IncomingLogCard";
import { StorageArea, CheckMode } from "../components/AreaSelectorModal";

const CONFIDENCE_THRESHOLD = 85;

// Types
interface AiRawItem {
  ingredient_name: string;
  stock_qty: number;
  import_qty: number;
  unit?: string;
  confidence: number;
  needs_review?: boolean;
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
  density: number;
  tare_weight: number;
  warehouse_qty: number;
  bar_qty: number;
}

interface InventoryCaptureScreenProps {
  onBack: () => void;
  onOpenSettings: () => void;
  onNavigateToConfirm: (items: AiMappedItem[], imagePath: string) => void;
  initialMode?: "import" | "sales" | "stock";
  areaType?: StorageArea;
  checkMode?: CheckMode;
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
  onNavigateToConfirm,
  initialMode = "stock",
  areaType,
  checkMode,
}: InventoryCaptureScreenProps) {
  const { isStandard } = useInventoryModel();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [localImagePath, setLocalImagePath] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(""); // Multi-step loading
  const [items, setItems] = useState<AiMappedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snapMode, setSnapMode] = useState<"STOCK" | "IMPORT" | "SALES">(
    initialMode.toUpperCase() as any
  );

  // Storage Areas state for Standard Mode
  const [currentAreaId, setCurrentAreaId] = useState<string | null>(null);
  const { items: incomingItems } = useTodayIncoming(
    isStandard && areaType === "BAR" ? currentAreaId : null
  );

  // Local ingredients for autocomplete
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Variance/Surplus modal state
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [varianceItems, setVarianceItems] = useState<
    { name: string; counted: number; expected: number; percent: number }[]
  >([]);
  const [showSurplusSheet, setShowSurplusSheet] = useState(false);
  const [surplusItems, setSurplusItems] = useState<
    { name: string; surplus: number; unit: string }[]
  >([]);
  const [isFlagged, setIsFlagged] = useState(false); // Perfect Score Trap

  // Load ingredients from local DB
  useEffect(() => {
    loadIngredients();
    if (isStandard && areaType) {
      loadAreaId();
    }
  }, [isStandard, areaType]);

  const loadAreaId = async () => {
    try {
      const db = await getDB();
      const area = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM local_storage_areas WHERE type = ? LIMIT 1",
        [areaType === "BAR" ? "SERVICE" : "STORAGE"]
      );
      if (area) {
        setCurrentAreaId(area.id);
      }
    } catch (err) {
      console.error("Area load error:", err);
    }
  };

  const loadIngredients = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync<LocalIngredient>(
        "SELECT id, name, aliases, base_unit, unit_cost, density, tare_weight, warehouse_qty, bar_qty FROM local_ingredients WHERE archived = 0"
      );
      setIngredients(rows);
    } catch (err) {
      console.log("No local ingredients yet");
    }
  };

  // Compress image to <1MB and save locally
  // ImageManipulator already saves to cache, we just use that URI
  const compressAndSaveImage = async (
    uri: string
  ): Promise<{ base64: string; mimeType: string; savedPath: string }> => {
    // Resize to 1024px width, compress to 70% quality (~200KB)
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Read as base64 for AI using new File API
    const file = new File(manipulated.uri);
    const base64 = await file.base64();

    // Use manipulated URI as local path (already saved by ImageManipulator)
    const savedPath = manipulated.uri;

    console.log(`[Capture] Saved compressed image: ${savedPath}`);
    return { base64, mimeType: "image/jpeg", savedPath };
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
      setItems([]);
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
        const score = getMatchScore(raw.ingredient_name, ing.name, aliases);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ing;
        }
      }

      // Auto-link if score >= 80
      if (bestMatch && bestScore >= 80) {
        return {
          rawName: raw.ingredient_name,
          quantity: raw.stock_qty,
          unit: raw.unit || bestMatch.base_unit,
          confidence: raw.confidence,
          unitCost: bestMatch.unit_cost,
          linkedIngredientId: bestMatch.id,
          linkedIngredientName: bestMatch.name,
          isNewIngredient: false,
        };
      }

      return {
        rawName: raw.ingredient_name,
        quantity: raw.stock_qty,
        unit: raw.unit || "",
        confidence: raw.confidence,
        unitCost: null,
        linkedIngredientId: null,
        linkedIngredientName: null,
        isNewIngredient: false,
      };
    });
  };

  // Parse image with AI - Route to different functions based on snapMode
  const handleParseImage = async () => {
    if (!imageUri) return;

    setParsing(true);
    setError(null);

    try {
      // Step 1: Compress and save image
      setLoadingStep("📷 Đang nén ảnh...");
      const { base64, mimeType, savedPath } = await compressAndSaveImage(
        imageUri
      );
      setLocalImagePath(savedPath);

      // Step 2: Determine endpoint and payload based on snapMode
      let endpoint: string;
      let payload: Record<string, unknown>;
      let loadingMessage: string;

      switch (snapMode) {
        case "IMPORT":
          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-invoice`;
          payload = { image_base64: base64, business_id: "" };
          loadingMessage = "🤖 AI đang đọc hóa đơn...";
          break;
        case "SALES":
          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-sales`;
          payload = { image_base64: base64, business_id: "" };
          loadingMessage = "🤖 AI đang đọc báo cáo bán hàng...";
          break;
        case "STOCK":
        default:
          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-handwriting`;
          payload = {
            image_base64: base64,
            business_id: "",
            inventory_model: isStandard ? "STANDARD" : "SIMPLE",
            area_type: areaType === "BAR" ? "SERVICE" : "STORAGE",
          };
          loadingMessage = `🤖 AI đang đọc phiếu kiểm ${
            areaType === "BAR" ? "Quầy Bar" : "Kho Tổng"
          }...`;
          break;
      }

      // Step 3: Call AI with timeout
      setLoadingStep("☁️ Đang gửi lên AI...");
      console.log(`[Capture] Calling ${snapMode} parse API...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: Env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${Env.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Step 4: AI Processing
      setLoadingStep(loadingMessage);
      const data = await response.json();

      console.log("[Capture] AI Response status:", response.status);
      console.log(
        "[Capture] AI Response data:",
        JSON.stringify(data).slice(0, 500)
      );

      if (!response.ok) {
        console.error("[Capture] API Error:", data.error);
        throw new Error(data.error || "AI parse failed");
      }

      // Step 5: Transform response to common format based on snapMode
      setLoadingStep("📊 Đang chuẩn hóa dữ liệu...");
      let rawItems: AiRawItem[] = [];

      if (snapMode === "STOCK") {
        // ai-parse-handwriting returns { items: StockItem[] }
        rawItems = (data.items || []).map((item: any) => ({
          ingredient_name: item.ingredient_name || item.name || "",
          stock_qty: item.stock_qty || item.quantity || 0,
          import_qty: item.import_qty || 0,
          unit: item.unit || "",
          confidence: item.confidence || 80,
          needs_review: item.needs_review || false,
        }));
      } else if (snapMode === "IMPORT") {
        // ai-parse-invoice returns { items: InvoiceItem[] }
        rawItems = (data.items || []).map((item: any) => ({
          ingredient_name: item.name || item.item_name || "",
          stock_qty: item.quantity || item.qty || 0,
          import_qty: 0,
          unit: item.unit || "",
          confidence: item.confidence || 80,
          needs_review: false,
        }));
      } else if (snapMode === "SALES") {
        // ai-parse-sales returns { menu_items: SalesItem[] }
        rawItems = (data.menu_items || data.items || []).map((item: any) => ({
          ingredient_name: item.name || item.menu_item || "",
          stock_qty: item.quantity_sold || item.quantity || 0,
          import_qty: 0,
          unit: item.unit || "phần",
          confidence: item.confidence || 80,
          needs_review: false,
        }));
      }

      if (rawItems.length > 0) {
        const mapped = autoMapItems(rawItems);

        // AI CROSS-CHECK: Check for duplicate transfers (Per .script Section 2.3.C)
        if (snapMode === "STOCK" && areaType === "BAR") {
          try {
            const db = await getDB();
            const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
            const transfers = await db.getAllAsync<any>(
              `SELECT ai_parsed_json FROM pending_sync_logs 
               WHERE type IN ('TRANSFER', 'QUICK_OUT') AND date(created_at) = ?`,
              [today]
            );

            // Parse all transfer items
            const transferredItems: { name: string; qty: number }[] = [];
            for (const t of transfers) {
              try {
                const parsed =
                  typeof t.ai_parsed_json === "string"
                    ? JSON.parse(t.ai_parsed_json)
                    : t.ai_parsed_json;
                for (const item of parsed?.items || []) {
                  transferredItems.push({
                    name: (item.ingredient_name || "").toLowerCase(),
                    qty: item.quantity || 0,
                  });
                }
              } catch (e) {
                /* skip invalid json */
              }
            }

            // Check for matches
            const duplicates: string[] = [];
            for (const mappedItem of mapped) {
              const scannedName = (
                mappedItem.linkedIngredientName ||
                mappedItem.rawName ||
                ""
              ).toLowerCase();
              const scannedQty = mappedItem.quantity;

              const match = transferredItems.find(
                (t) =>
                  t.name.includes(scannedName) || scannedName.includes(t.name)
              );

              if (match && Math.abs(match.qty - scannedQty) < 0.5) {
                duplicates.push(`${mappedItem.rawName}: ${scannedQty}`);
              }
            }

            // Show warning if duplicates found
            if (duplicates.length > 0) {
              Alert.alert(
                "⚠️ Có thể trùng lặp!",
                `Hệ thống phát hiện các món sau đã được CẤP HÀNG KHẨN hôm nay:\n\n${duplicates.join(
                  "\n"
                )}\n\nĐây là hàng MỚI hay trùng với lệnh cũ?`,
                [
                  {
                    text: "🔄 Giữ lại (Lấy thêm lần nữa)",
                    style: "default",
                  },
                  {
                    text: "❌ Bỏ qua (Đã tính rồi)",
                    onPress: () => {
                      // Remove duplicate items from mapped list
                      const filtered = mapped.filter(
                        (m) => !duplicates.some((d) => d.startsWith(m.rawName))
                      );
                      setItems(filtered);
                    },
                    style: "destructive",
                  },
                ]
              );
            }
          } catch (err) {
            console.log("[CrossCheck] Error:", err);
          }
        }

        setItems(mapped);
      } else {
        console.warn("[Capture] No items found in response");
        setError("Không tìm thấy dữ liệu. Thử chụp lại?");
      }
    } catch (err: any) {
      console.error("[Capture] Parse error:", err);
      if (err.name === "AbortError") {
        setError("Quá thời gian chờ (30s). Kiểm tra kết nối mạng và thử lại.");
      } else {
        setError(err.message || "Có lỗi xảy ra");
      }
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
  // Check for invalid weights (gross < tare)
  const hasInvalidWeights = items.some((item) => {
    const matched = ingredients.find(
      (ing) => ing.id === item.linkedIngredientId
    );
    if (!matched) return false;
    const isVolumeBased =
      matched.base_unit === "ml" ||
      matched.base_unit === "l" ||
      matched.base_unit === "lít";
    const isWeightInput = item.unit === "g" || item.unit === "kg";
    if (isVolumeBased && isWeightInput) {
      const grossGram =
        item.unit === "kg" ? item.quantity * 1000 : item.quantity;
      return grossGram < (matched.tare_weight || 0);
    }
    return false;
  });

  // Can save?
  const canSave = items.length > 0 && unmappedCount === 0 && !hasInvalidWeights;

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack} style={{ padding: 8, marginLeft: -8 }}>
          <Text style={{ color: "#E07A2F", fontSize: 16, fontWeight: "600" }}>
            ← Quay lại
          </Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            {snapMode === "STOCK"
              ? "Kiểm kê kho"
              : snapMode === "IMPORT"
              ? "Nhập hàng"
              : "Bán hàng"}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: isStandard ? "#6B8E23" : "#E07A2F",
              marginTop: 2,
              fontWeight: "700",
              textTransform: "uppercase",
            }}
          >
            {isStandard ? "Kho Kép (Standard)" : "Kho Đơn (Simple)"}
          </Text>
        </View>
        <Pressable
          onPress={onOpenSettings}
          style={{ padding: 8, marginRight: -8 }}
        >
          <Text style={{ color: "#B8B3A8", fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>

      {/* 📸 3 SNAPS SELECTOR */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "#1A1A1A",
          padding: 4,
          margin: 16,
          borderRadius: 12,
        }}
      >
        <Pressable
          onPress={() => setSnapMode("IMPORT")}
          style={{
            flex: 1,
            paddingVertical: 10,
            alignItems: "center",
            borderRadius: 8,
            backgroundColor: snapMode === "IMPORT" ? "#2A2A2A" : "transparent",
          }}
        >
          <Text
            style={{
              color: snapMode === "IMPORT" ? "#E07A2F" : "#64748B",
              fontWeight: "600",
              fontSize: 13,
            }}
          >
            Nhập Hàng
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSnapMode("SALES")}
          style={{
            flex: 1,
            paddingVertical: 10,
            alignItems: "center",
            borderRadius: 8,
            backgroundColor: snapMode === "SALES" ? "#2A2A2A" : "transparent",
          }}
        >
          <Text
            style={{
              color: snapMode === "SALES" ? "#6B8E23" : "#64748B",
              fontWeight: "600",
              fontSize: 13,
            }}
          >
            Bán Hàng
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSnapMode("STOCK")}
          style={{
            flex: 1,
            paddingVertical: 10,
            alignItems: "center",
            borderRadius: 8,
            backgroundColor: snapMode === "STOCK" ? "#E07A2F" : "transparent",
          }}
        >
          <Text
            style={{
              color: snapMode === "STOCK" ? "white" : "#64748B",
              fontWeight: "600",
              fontSize: 13,
            }}
          >
            Kiểm Kho
          </Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* MODEL-BASED ALERTS & LABELS */}
        {isStandard && snapMode === "STOCK" && areaType === "BAR" && (
          <IncomingLogCard items={incomingItems} />
        )}

        {isStandard &&
          snapMode === "STOCK" &&
          areaType === "WAREHOUSE" &&
          checkMode === "FULL" && (
            <View style={styles.freezeAlert}>
              <Text style={styles.freezeAlertTitle}>⚠️ ĐÓNG BĂNG KHO TỔNG</Text>
              <Text style={styles.freezeAlertText}>
                Hãy chuyển hết hàng cần thiết qua Bar{" "}
                <Text style={{ fontWeight: "700" }}>NGAY BÂY GIỜ</Text>. Sau khi
                bắt đầu kiểm, bạn{" "}
                <Text style={{ color: "#EF4444", fontWeight: "700" }}>
                  KHÔNG ĐƯỢC
                </Text>{" "}
                lấy hàng từ Kho Tổng nữa.
              </Text>
            </View>
          )}

        {isStandard && snapMode === "IMPORT" && (
          <View style={styles.importTargetLabel}>
            <Text style={{ color: "#94A3B8", fontSize: 12 }}>
              Nhập hàng vào:
            </Text>
            <Pressable
              onPress={() =>
                setCurrentAreaId(currentAreaId === "bar" ? "warehouse" : "bar")
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#1A1A1A",
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "#3A3A3A",
                marginLeft: 10,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: 8 }}>
                {!currentAreaId || currentAreaId === "warehouse" ? "🏭" : "🍷"}
              </Text>
              <Text
                style={{
                  color:
                    !currentAreaId || currentAreaId === "warehouse"
                      ? "#E07A2F"
                      : "#6B8E23",
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {!currentAreaId || currentAreaId === "warehouse"
                  ? "Kho Tổng"
                  : "Quầy Bar"}
              </Text>
              <Text style={{ color: "#64748B", marginLeft: 8, fontSize: 12 }}>
                ▼
              </Text>
            </Pressable>
          </View>
        )}

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
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="camera"
                  size={18}
                  color="white"
                  style={{ marginRight: 6 }}
                />
                <Text style={{ color: "white", fontWeight: "600" }}>
                  Chụp ảnh
                </Text>
              </View>
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
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="images"
                  size={18}
                  color="#94A3B8"
                  style={{ marginRight: 6 }}
                />
                <Text style={{ color: "#94A3B8", fontWeight: "600" }}>
                  Thư viện
                </Text>
              </View>
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
                  backgroundColor: "#121212",
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
                      ? "#55A630"
                      : item.isNewIngredient
                      ? "#E07A2F"
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
                    backgroundColor: "#1A1A1A",
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
                      backgroundColor: "#121212",
                      padding: 12,
                      color: "white",
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                    }}
                  />
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {getFilteredSuggestions().map((ing) => (
                      <Pressable
                        key={ing.id}
                        onPress={() => linkIngredient(index, ing)}
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: "#2A2A2A",
                        }}
                      >
                        <Text style={{ color: "white" }}>{ing.name}</Text>
                        <Text style={{ color: "#64748B", fontSize: 11 }}>
                          {ing.base_unit} · {ing.unit_cost?.toLocaleString()}đ
                        </Text>
                      </Pressable>
                    ))}
                    {/* Create new ingredient button */}
                    <Pressable
                      onPress={() => markAsNew(index)}
                      style={{ padding: 12, backgroundColor: "#1A1A1A" }}
                    >
                      <Text style={{ color: "#E07A2F" }}>
                        ➕ Tạo nguyên liệu mới "{item.rawName}"
                      </Text>
                    </Pressable>
                  </ScrollView>
                </View>
              )}

              {/* Quantity + Unit with Labels */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", marginBottom: 4, gap: 8 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 12, flex: 1 }}>
                    {snapMode === "STOCK"
                      ? "Tồn cuối"
                      : snapMode === "SALES"
                      ? "Số lượng bán"
                      : "Số lượng"}
                  </Text>
                  <Text style={{ color: "#94A3B8", fontSize: 12, flex: 1 }}>
                    Đơn vị
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={String(item.quantity)}
                    onChangeText={(t) =>
                      updateItem(index, "quantity", parseFloat(t) || 0)
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#475569"
                    style={{
                      backgroundColor: "#121212",
                      borderRadius: 8,
                      padding: 12,
                      color: "white",
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#2A2A2A",
                    }}
                  />
                  <TextInput
                    value={item.unit}
                    onChangeText={(t) => updateItem(index, "unit", t)}
                    placeholder="đơn vị"
                    placeholderTextColor="#475569"
                    style={{
                      backgroundColor: "#121212",
                      borderRadius: 8,
                      padding: 12,
                      color: "white",
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#2A2A2A",
                    }}
                  />
                </View>
              </View>

              {/* 🧮 LIVE FEEDBACK - TARE & DENSITY */}
              {(() => {
                const matched = ingredients.find(
                  (ing) => ing.id === item.linkedIngredientId
                );
                const isVolumeBased =
                  matched &&
                  (matched.base_unit === "ml" ||
                    matched.base_unit === "l" ||
                    matched.base_unit === "lít");
                const isWeightInput = item.unit === "g" || item.unit === "kg";

                if (isVolumeBased && isWeightInput) {
                  const netMl = calculateNetVolume(
                    item.quantity,
                    item.unit,
                    matched.tare_weight || 0,
                    matched.density || 1
                  );

                  if (netMl === null || netMl === -1) {
                    // 🔔 Haptic feedback for invalid weight
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Error
                    );
                    return (
                      <View
                        style={{
                          backgroundColor: "#FEF2F2",
                          padding: 8,
                          borderRadius: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: "#DC2626", fontSize: 12 }}>
                          ⚠️ Trọng lượng không hợp lệ (nhỏ hơn tare)
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View
                      style={{
                        backgroundColor: "#1A1A1A",
                        padding: 8,
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                        📊 Quy đổi: {netMl!.toFixed(0)}ml (trừ bình{" "}
                        {matched.tare_weight}g, tỷ trọng {matched.density})
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Unit cost - Only for IMPORT mode */}
              {snapMode === "IMPORT" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                    Đơn giá:
                  </Text>
                  <TextInput
                    value={item.unitCost ? String(item.unitCost) : ""}
                    onChangeText={(t) =>
                      updateItem(index, "unitCost", parseFloat(t) || null)
                    }
                    keyboardType="numeric"
                    placeholder="VND"
                    placeholderTextColor="#475569"
                    style={{
                      backgroundColor: "#121212",
                      borderRadius: 8,
                      padding: 8,
                      color: "white",
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#2A2A2A",
                    }}
                  />
                </View>
              )}

              {/* Remove */}
              <Pressable
                onPress={() => removeItem(index)}
                style={{ paddingVertical: 8 }}
              >
                <Text
                  style={{
                    color: "#EF4444",
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: "500",
                  }}
                >
                  ✕ Xóa mục này
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

              // === VARIANCE GATEKEEPER (STOCK Mode Only) ===
              if (snapMode === "STOCK") {
                const variances: {
                  name: string;
                  counted: number;
                  expected: number;
                  percent: number;
                }[] = [];

                for (const item of items) {
                  if (!item.linkedIngredientId) continue;
                  const ing = ingredients.find(
                    (i) => i.id === item.linkedIngredientId
                  );
                  if (!ing) continue;

                  // Expected stock = warehouse + bar (simplified for demo)
                  const expected =
                    (ing.warehouse_qty || 0) + (ing.bar_qty || 0);
                  const counted = item.quantity;

                  if (expected > 0) {
                    const variancePercent = Math.abs(
                      ((counted - expected) / expected) * 100
                    );
                    variances.push({
                      name: ing.name,
                      counted,
                      expected,
                      percent: variancePercent,
                    });
                  }
                }

                // Check for critical variances (>15%)
                const criticalVariances = variances.filter(
                  (v) => v.percent > 15 && v.counted < v.expected // Loss
                );
                const warningVariances = variances.filter(
                  (v) => v.percent >= 2 && v.percent <= 15
                );

                // Check for surplus (counted > expected)
                const surplusDetected = variances.filter(
                  (v) => v.counted > v.expected && v.percent > 5
                );

                // Check for Perfect Score Trap (liquid/powder items at 100% match)
                const liquidItems = items.filter((item) => {
                  const ing = ingredients.find(
                    (i) => i.id === item.linkedIngredientId
                  );
                  return (
                    ing &&
                    (ing.base_unit === "ml" ||
                      ing.base_unit === "g" ||
                      ing.base_unit === "l")
                  );
                });
                const perfectMatches = variances.filter((v) => v.percent < 0.5);
                if (liquidItems.length >= 5 && perfectMatches.length >= 5) {
                  // Perfect Score Trap - show toast warning
                  setIsFlagged(true);
                  if (Platform.OS === "android") {
                    ToastAndroid.show(
                      "🧐 Số liệu quá hoàn hảo (100% khớp). Bạn có chắc đã cân đo kỹ không?",
                      ToastAndroid.LONG
                    );
                  } else {
                    Alert.alert(
                      "🧐 Perfect Score",
                      "Số liệu quá hoàn hảo. Bạn có chắc đã cân đo kỹ không?"
                    );
                  }
                }

                // 🚨 LEVEL 3: Critical Variance (>15%) - Show VarianceModal
                if (criticalVariances.length > 0) {
                  await Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Error
                  );
                  setVarianceItems(criticalVariances);
                  setShowVarianceModal(true);
                  return; // Block save until reason provided
                }

                // 📦 Surplus Detection - Show Bottom Sheet
                if (surplusDetected.length > 0) {
                  setSurplusItems(
                    surplusDetected.map((v) => ({
                      name: v.name,
                      surplus: v.counted - v.expected,
                      unit:
                        items.find(
                          (i) =>
                            i.linkedIngredientId &&
                            ingredients.find(
                              (ing) => ing.id === i.linkedIngredientId
                            )?.name === v.name
                        )?.unit || "đơn vị",
                    }))
                  );
                  setShowSurplusSheet(true);
                  return; // Wait for user response
                }

                // ⚠️ LEVEL 2: Warning Variance (2-15%) - Light Haptic
                if (warningVariances.length > 0) {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }

                // ✅ LEVEL 1: <2% - Silent (no haptic, auto-approve)
              }

              // === SAVE TO DB ===
              try {
                const db = await getDB();

                // Ensure table exists
                await db.execAsync(`
                  CREATE TABLE IF NOT EXISTS pending_sync_logs (
                    id TEXT PRIMARY KEY NOT NULL,
                    type TEXT NOT NULL,
                    ai_parsed_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    synced INTEGER DEFAULT 0
                  )
                `);

                const id = Crypto.randomUUID();
                await db.runAsync(
                  `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    id,
                    snapMode,
                    "mobile", // location
                    JSON.stringify({ items }),
                    new Date().toISOString(),
                    0,
                  ]
                );

                // Success haptic
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );

                Alert.alert(
                  "Thành công",
                  `Đã lưu phiếu ${
                    snapMode === "IMPORT"
                      ? "nhập hàng"
                      : snapMode === "SALES"
                      ? "bán hàng"
                      : "kiểm kho"
                  }`
                );

                // Trigger sync immediately (non-blocking)
                processSyncQueue().then(() => {
                  console.log("⚡ Auto-sync triggered after save");
                });

                onBack();
              } catch (err) {
                console.error("Save failed:", err);
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error
                );
                Alert.alert("Lỗi", "Không thể lưu dữ liệu");
              }
            }}
            disabled={!canSave}
            style={{
              backgroundColor: canSave ? "#E07A2F" : "#334155",
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
              marginTop: 16,
              marginBottom: 100,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              {canSave ? "✓ Xác nhận & Lưu" : "⚠️ Chọn nguyên liệu"}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Variance Modal - >15% Loss */}
      <VarianceModal
        visible={showVarianceModal}
        items={varianceItems}
        onSubmit={async (reason: VarianceReason, note?: string) => {
          setShowVarianceModal(false);
          // Save with reason attached
          try {
            const db = await getDB();
            const id = Crypto.randomUUID();
            await db.runAsync(
              `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                id,
                snapMode,
                "mobile", // location
                JSON.stringify({
                  items,
                  variance_reason: reason,
                  variance_note: note,
                  is_flagged: isFlagged,
                }),
                new Date().toISOString(),
                0,
              ]
            );
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
            Alert.alert("Đã lưu", "Phiếu kiểm kê đã lưu với giải trình.");
            onBack();
          } catch (err) {
            console.error("Save failed:", err);
            Alert.alert("Lỗi", "Không thể lưu dữ liệu");
          }
        }}
        onCancel={() => setShowVarianceModal(false)}
      />

      {/* Surplus Bottom Sheet */}
      <SurplusBottomSheet
        visible={showSurplusSheet}
        items={surplusItems}
        onConfirm={async () => {
          setShowSurplusSheet(false);
          // Create transfer log automatically
          try {
            const db = await getDB();
            const id = Crypto.randomUUID();
            await db.runAsync(
              `INSERT INTO pending_sync_logs (id, type, location, ai_parsed_json, created_at, synced)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                id,
                "TRANSFER_AUTO",
                "mobile", // location
                JSON.stringify({
                  surplus_items: surplusItems,
                  auto_created: true,
                }),
                new Date().toISOString(),
                0,
              ]
            );
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
            Alert.alert(
              "Đã tạo",
              "Phiếu nhập bù từ Kho Tổng đã được tạo tự động."
            );
            // Continue to save the stock check
          } catch (err) {
            console.error("Auto transfer failed:", err);
          }
        }}
        onDismiss={() => setShowSurplusSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  freezeAlert: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  freezeAlertTitle: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  freezeAlertText: {
    color: "#D1D5DB",
    fontSize: 12,
    lineHeight: 18,
  },
  importTargetLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1A1A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
});
