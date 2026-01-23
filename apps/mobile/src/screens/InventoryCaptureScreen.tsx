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
import { calculateNetVolume, convertToIngredientBase } from "@snapko/shared";
import { getDB } from "../db";
// processSyncQueue removed - use syncPendingLogs only to avoid duplicate sync
import { syncPendingLogs } from "../sync/syncEngine";
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
import { DocumentCameraModal } from "../components/DocumentCameraModal";
import { SalesCameraModal } from "../components/SalesCameraModal";
import { calculateAllTheoreticalBarStock } from "../features/inventory/services/theoreticalStock";

const CONFIDENCE_THRESHOLD = 85;

// Types
interface AiRawItem {
  ingredient_name: string;
  stock_qty: number;
  import_qty: number;
  unit?: string;
  confidence: number;
  needs_review?: boolean;
  unit_cost?: number | null; // For IMPORT mode - extracted from invoice
  // New fields from backend (Fuzzy Matching)
  ingredient_id?: string;
  linkedIngredientId?: string;
  stt?: string | number;
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
  type?: string; // raw_material | supply | semi_product | resale_item
}

// Recipe interface for SALES mode linking
interface LocalRecipe {
  id: string;
  name: string;
  category: string | null;
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
  aliases: string[],
): number {
  const normalized = aiName.toLowerCase().trim();
  const name = ingName.toLowerCase();

  if (name === normalized) return 100;
  if (aliases.some((a) => a.toLowerCase() === normalized)) return 95;

  // If DB ingredient name is fully contained in AI name, high confidence
  // e.g., "Chunky Vải" in "Mứt Andros Chunky Vải" = 85
  if (normalized.includes(name) && name.length >= 3) {
    return 85;
  }

  // If AI name is fully contained in DB name (shorter AI name)
  if (name.includes(normalized) && normalized.length >= 3) {
    return 85;
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
  const { isStandard, businessId } = useInventoryModel();

  // Multi-image support: store array of images
  const MAX_IMAGES = 5;
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [localImagePaths, setLocalImagePaths] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>(""); // Multi-step loading
  const [items, setItems] = useState<AiMappedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snapMode, setSnapMode] = useState<"STOCK" | "IMPORT" | "SALES">(
    initialMode.toUpperCase() as any,
  );

  // Internal checkMode state - can be changed when tabs are switched
  // For Warehouse: FULL = "Tồn cuối" (Full Count), SPOT = "Kiểm 1 phần" (Spot Check)
  const [currentCheckMode, setCurrentCheckMode] = useState<
    CheckMode | undefined
  >(checkMode);

  // Internal areaType state - allows switching between BAR and WAREHOUSE when tabs change
  // After doing Sales, switching to Stock tab should go to BAR for end-of-shift check
  const [currentAreaType, setCurrentAreaType] = useState<
    StorageArea | undefined
  >(areaType);

  // Storage Areas state for Standard Mode
  const [currentAreaId, setCurrentAreaId] = useState<string | null>(null);
  const { items: incomingItems } = useTodayIncoming(
    isStandard && currentAreaType === "BAR" ? currentAreaId : null,
  );

  // Local ingredients for autocomplete
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);

  // Recipes for SALES mode linking
  const [recipes, setRecipes] = useState<LocalRecipe[]>([]);

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Variance/Surplus modal state
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [varianceItems, setVarianceItems] = useState<
    {
      name: string;
      counted: number;
      expected: number;
      percent: number;
      unit?: string;
      breakdown?: {
        startingQty: number;
        transfersIn: number;
        salesConsumption: number;
      };
    }[]
  >([]);
  const [showSurplusSheet, setShowSurplusSheet] = useState(false);
  const [surplusItems, setSurplusItems] = useState<
    { name: string; surplus: number; unit: string }[]
  >([]);
  const [isFlagged, setIsFlagged] = useState(false); // Perfect Score Trap
  const [showDocumentCamera, setShowDocumentCamera] = useState(false); // Guide frame camera
  const [showSalesCamera, setShowSalesCamera] = useState(false); // Sales grid camera

  // Load ingredients and recipes from local DB
  useEffect(() => {
    loadIngredients();
    loadRecipes(); // Load recipes for SALES mode
    if (isStandard && currentAreaType) {
      loadAreaId();
    }
  }, [isStandard, currentAreaType]);

  const loadAreaId = async () => {
    try {
      const db = await getDB();
      const area = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM local_storage_areas WHERE type = ? LIMIT 1",
        [currentAreaType === "BAR" ? "SERVICE" : "STORAGE"],
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
        "SELECT id, name, aliases, base_unit, unit_cost, density, tare_weight, warehouse_qty, bar_qty, type FROM local_ingredients WHERE archived = 0",
      );
      setIngredients(rows);
    } catch (err) {
      console.log("No local ingredients yet");
    }
  };

  const loadRecipes = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync<LocalRecipe>(
        "SELECT id, name, category FROM local_recipes WHERE is_active = 1",
      );
      setRecipes(rows);
      console.log(`[Capture] Loaded ${rows.length} recipes`);
    } catch (err) {
      console.error("[Capture] loadRecipes error:", err);
    }
  };

  // Compress image to <1MB and save locally
  // ImageManipulator already saves to cache, we just use that URI
  const compressAndSaveImage = async (
    uri: string,
  ): Promise<{ base64: string; mimeType: string; savedPath: string }> => {
    // Resize to 1024px width, compress to 50% quality for multi-image support (~150KB)
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
    );

    // Read as base64 for AI using new File API
    const file = new File(manipulated.uri);
    const base64 = await file.base64();

    // Use manipulated URI as local path (already saved by ImageManipulator)
    const savedPath = manipulated.uri;

    console.log(`[Capture] Saved compressed image: ${savedPath}`);
    return { base64, mimeType: "image/jpeg", savedPath };
  };

  /**
   * Preprocess receipt image placeholder
   * NOTE: expo-image-manipulator does NOT support grayscale/contrast filters!
   * It only supports: crop, resize, rotate, flip
   * For now, just pass through the original image
   */
  const preprocessReceipt = async (uri: string): Promise<string> => {
    // expo-image-manipulator doesn't support color filters
    // Just return original for now - Vision OCR handles it fine
    console.log(
      "[Capture] Skipping preprocess (not supported), using original",
    );
    return uri;
  };

  /**
   * Slice image into 3 overlapping vertical parts for better OCR accuracy
   * This "Divide & Conquer" technique prevents AI from drifting across rows
   * Each slice is 40% of height with 10% overlap
   */
  const sliceImage = async (uri: string): Promise<string[]> => {
    try {
      // Get image dimensions first
      const info = await ImageManipulator.manipulateAsync(uri, []);
      const { width, height } = info;
      const ratio = height / width;

      // Adaptive Slicing: More slices for longer receipts
      // Ideally ~10-15 rows per slice for best accuracy
      let numSlices = 1;
      if (ratio > 5)
        numSlices = 6; // Very long receipt
      else if (ratio > 3.5)
        numSlices = 4; // Long receipt
      else if (ratio > 1.8) numSlices = 2; // Medium receipt
      // else: 1 slice (short receipt)

      console.log(
        `[Capture] Adaptive Slicing: Ratio=${ratio.toFixed(2)} -> ${numSlices} slices`,
      );

      const slices: string[] = [];

      // Generate slice configs dynamically
      const sliceConfigs = [];
      if (numSlices === 1) {
        sliceConfigs.push({ originY: 0, heightFactor: 1 });
      } else {
        const sliceHeightFactor = 1 / numSlices + 0.15; // +15% overlap
        for (let i = 0; i < numSlices; i++) {
          let originY = i * (1 / numSlices);
          if (originY + sliceHeightFactor > 1) {
            originY = 1 - sliceHeightFactor;
          }
          if (originY < 0) originY = 0;
          sliceConfigs.push({ originY, heightFactor: sliceHeightFactor });
        }
      }

      for (const config of sliceConfigs) {
        const sliceHeight = Math.floor(height * config.heightFactor);
        const originY = Math.floor(height * config.originY);

        const result = await ImageManipulator.manipulateAsync(
          uri,
          [
            {
              crop: {
                originX: 0,
                originY: originY,
                width: width,
                height: Math.min(sliceHeight, height - originY), // Don't exceed bounds
              },
            },
            { resize: { width: 1024 } }, // Resize for efficiency
          ],
          {
            compress: 0.6,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );

        // Read as base64
        const file = new File(result.uri);
        const base64 = await file.base64();
        slices.push(base64);
      }

      console.log(`[Capture] Sliced image into ${slices.length} parts`);
      return slices;
    } catch (err) {
      console.error("[Capture] sliceImage error:", err);
      // Fallback: return original image compressed
      const fallback = await compressAndSaveImage(uri);
      return [fallback.base64];
    }
  };

  // Take photo - append to images array
  // For STOCK mode: use custom camera with guide frame
  // For other modes: use standard image picker
  const handleTakePhoto = async () => {
    if (imageUris.length >= MAX_IMAGES) {
      Alert.alert("Đã đạt giới hạn", `Tối đa ${MAX_IMAGES} ảnh`);
      return;
    }

    // STOCK mode: Use custom camera with A4 guide frame
    if (snapMode === "STOCK") {
      setShowDocumentCamera(true);
      return;
    }

    // SALES mode: Use custom camera with 3-section grid
    if (snapMode === "SALES") {
      setShowSalesCamera(true);
      return;
    }

    // Other modes: Use standard image picker
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
      setImageUris((prev) => [...prev, result.assets[0].uri]);
      setItems([]);
      setError(null);
    }
  };

  // Handle capture from DocumentCameraModal
  const handleDocumentCapture = (uri: string) => {
    setShowDocumentCamera(false);
    setImageUris((prev) => [...prev, uri]);
    setItems([]);
    setError(null);
  };

  // Pick from gallery - append to images array
  const handlePickImage = async () => {
    const remaining = MAX_IMAGES - imageUris.length;
    if (remaining <= 0) {
      Alert.alert("Đã đạt giới hạn", `Tối đa ${MAX_IMAGES} ảnh`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining, // Enforce limit native side
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const newUris = result.assets.map((asset) => asset.uri);
      // Double check limit in case native picker ignored selectionLimit
      const allowedNewUris = newUris.slice(0, remaining);

      setImageUris((prev) => [...prev, ...allowedNewUris]);
      setItems([]);
      setError(null);

      if (newUris.length > remaining) {
        Alert.alert("Thông báo", `Chỉ lấy được ${remaining} ảnh do giới hạn.`);
      }
    }
  };

  // Remove image at index
  const removeImage = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
    setLocalImagePaths((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-map AI items to ingredients or recipes (based on snapMode)
  const autoMapItems = (rawItems: AiRawItem[]): AiMappedItem[] => {
    const mapped = rawItems.map((raw) => {
      // 0. Use Backend Mapping if available (High Priority)
      if (raw.linkedIngredientId || raw.ingredient_id) {
        const backendId = raw.linkedIngredientId || raw.ingredient_id;
        // Verify it exists in local DB
        const matchedIng = ingredients.find((ing) => ing.id === backendId);

        if (matchedIng) {
          // Convert AI quantity to ingredient's base_unit if units differ
          let finalQty = raw.stock_qty;
          const aiUnit = raw.unit || matchedIng.base_unit;

          if (aiUnit && aiUnit !== matchedIng.base_unit) {
            const converted = convertToIngredientBase(
              raw.stock_qty,
              aiUnit,
              matchedIng.base_unit,
              matchedIng.density,
            );
            if (typeof converted === "number") {
              finalQty = converted;
              console.log(
                `[AutoMap] Converted ${raw.stock_qty} ${aiUnit} → ${finalQty} ${matchedIng.base_unit} for "${matchedIng.name}"`,
              );
            }
          }

          return {
            rawName: raw.ingredient_name,
            quantity: finalQty,
            unit: matchedIng.base_unit, // Always use base_unit after conversion
            confidence: raw.confidence,
            unitCost: raw.unit_cost ?? matchedIng.unit_cost,
            linkedIngredientId: matchedIng.id,
            linkedIngredientName: matchedIng.name,
            isNewIngredient: false,
          };
        }
      }

      // For SALES mode, match with recipes AND resale_items
      if (snapMode === "SALES") {
        let bestMatch: LocalRecipe | LocalIngredient | null = null;
        let bestScore = 0;
        let isResaleItem = false;

        // First, try matching with recipes
        for (const rec of recipes) {
          const score = getMatchScore(raw.ingredient_name, rec.name, []);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = rec;
            isResaleItem = false;
          }
        }

        // Then, try matching with resale_items (may override if better match)
        const resaleItems = ingredients.filter(
          (ing) => ing.type === "resale_item",
        );
        for (const item of resaleItems) {
          const score = getMatchScore(raw.ingredient_name, item.name, []);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
            isResaleItem = true;
          }
        }

        // Auto-link if score >= 80
        if (bestMatch && bestScore >= 80) {
          return {
            rawName: raw.ingredient_name,
            quantity: raw.stock_qty,
            unit: raw.unit || (isResaleItem ? "cái" : "phần"),
            confidence: raw.confidence,
            unitCost: null, // Sales items don't have unit cost
            linkedIngredientId: bestMatch.id,
            linkedIngredientName: bestMatch.name,
            isNewIngredient: false,
          };
        }

        return {
          rawName: raw.ingredient_name,
          quantity: raw.stock_qty,
          unit: raw.unit || "phần",
          confidence: raw.confidence,
          unitCost: null,
          linkedIngredientId: null,
          linkedIngredientName: raw.ingredient_name, // Fallback to AI name
          isNewIngredient: false,
        };
      }

      // For IMPORT/STOCK mode, match with ingredients
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
        // Convert AI quantity to ingredient's base_unit if units differ
        let finalQty = raw.stock_qty;
        const aiUnit = raw.unit || bestMatch.base_unit;

        if (aiUnit && aiUnit !== bestMatch.base_unit) {
          const converted = convertToIngredientBase(
            raw.stock_qty,
            aiUnit,
            bestMatch.base_unit,
            bestMatch.density,
          );
          if (typeof converted === "number") {
            finalQty = converted;
            console.log(
              `[AutoMap] Converted ${raw.stock_qty} ${aiUnit} → ${finalQty} ${bestMatch.base_unit} for "${bestMatch.name}"`,
            );
          }
        }

        return {
          rawName: raw.ingredient_name,
          quantity: finalQty,
          unit: bestMatch.base_unit, // Always use base_unit after conversion
          confidence: raw.confidence,
          // Priority: AI invoice price > DB unit_cost
          unitCost: raw.unit_cost ?? bestMatch.unit_cost,
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
        unitCost: raw.unit_cost ?? null, // Use AI invoice price if available
        linkedIngredientId: null,
        // IMPORTANT: Use raw.ingredient_name as fallback to prevent 'undefined' in logs
        linkedIngredientName: raw.ingredient_name,
        isNewIngredient: false,
      };
    });

    // DEDUP: Merge items that link to the same ingredient/recipe
    const dedupMap = new Map<string, AiMappedItem>();
    for (const item of mapped) {
      const key = item.linkedIngredientId || `unlinked_${item.rawName}`;
      if (dedupMap.has(key)) {
        // Merge: sum quantities, keep higher confidence
        const existing = dedupMap.get(key)!;
        existing.quantity += item.quantity;
        existing.confidence = Math.max(existing.confidence, item.confidence);
        // Append raw names if different
        if (!existing.rawName.includes(item.rawName)) {
          existing.rawName += ` / ${item.rawName}`;
        }
      } else {
        dedupMap.set(key, { ...item });
      }
    }

    return Array.from(dedupMap.values());
  };

  // Parse image with AI - Route to different functions based on snapMode
  // Multi-image support: sends array of images for sequential page parsing
  const handleParseImage = async () => {
    if (imageUris.length === 0) return;

    setParsing(true);
    setError(null);

    try {
      // Step 1: Compress all images
      const imageCount = imageUris.length;
      setLoadingStep(`📷 Đang nén ${imageCount} ảnh...`);

      const compressedImages: string[] = [];
      const savedPaths: string[] = [];

      for (let i = 0; i < imageUris.length; i++) {
        setLoadingStep(`📷 Đang nén ảnh ${i + 1}/${imageCount}...`);
        const { base64, savedPath } = await compressAndSaveImage(imageUris[i]);
        compressedImages.push(base64);
        savedPaths.push(savedPath);
      }
      setLocalImagePaths(savedPaths);

      // Step 2: Determine endpoint and payload based on snapMode
      let endpoint: string;
      let payload: Record<string, unknown>;
      let loadingMessage: string;

      switch (snapMode) {
        case "IMPORT":
          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-invoice`;
          // Support both single and multi-image: backend handles both
          payload = {
            images_base64: compressedImages,
            image_base64: compressedImages[0], // Fallback for backward compat
            business_id: businessId || "",
          };
          loadingMessage = `🤖 AI đang đọc ${imageCount} ảnh hóa đơn...`;
          break;
        case "SALES":
          // GOOGLE VISION MODE: DON'T SLICE - Vision OCR prefers full context images!
          // Just preprocess (Contrast/Grayscale) and send full images
          setLoadingStep("🖼️ Đang xử lý ảnh...");
          const processedImages: string[] = [];
          for (let i = 0; i < imageUris.length; i++) {
            setLoadingStep(`Processing image ${i + 1}/${imageCount}...`);

            // Preprocess (Contrast/Grayscale) for better OCR on thermal paper
            const cleanImage = await preprocessReceipt(imageUris[i]);

            // Compress and get base64 (no slicing!)
            const { base64 } = await compressAndSaveImage(cleanImage);
            processedImages.push(base64);
          }
          console.log(
            `[Capture] SALES: Sending ${processedImages.length} full images (no slicing)`,
          );

          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-sales`;
          payload = {
            images_base64: processedImages,
            image_base64: processedImages[0],
            business_id: businessId || "",
          };
          loadingMessage = `🤖 Vision OCR đang đọc ${processedImages.length} ảnh...`;
          break;
        case "STOCK":
        default:
          // DIVIDE & CONQUER: Slice each image into 3 parts for better OCR accuracy
          setLoadingStep("✂️ Đang cắt ảnh thành từng phần...");
          const allSlices: string[] = [];
          for (let i = 0; i < imageUris.length; i++) {
            setLoadingStep(`✂️ Đang cắt ảnh ${i + 1}/${imageCount}...`);
            const slices = await sliceImage(imageUris[i]);
            allSlices.push(...slices);
          }
          console.log(
            `[Capture] Sliced ${imageCount} images into ${allSlices.length} parts`,
          );

          endpoint = `${Env.SUPABASE_URL}/functions/v1/ai-parse-handwriting`;
          payload = {
            images_base64: allSlices, // Send all slices
            image_base64: allSlices[0],
            business_id: businessId || "",
            inventory_model: isStandard ? "STANDARD" : "SIMPLE",
            area_type: currentAreaType === "BAR" ? "SERVICE" : "STORAGE",
          };
          loadingMessage = `🤖 AI đang đọc ${allSlices.length} phần ảnh kiểm ${
            currentAreaType === "BAR" ? "Quầy Bar" : "Kho Tổng"
          }...`;
          break;
      }

      // Step 3: Call AI with timeout
      setLoadingStep("☁️ Đang gửi lên AI...");
      console.log(`[Capture] Calling ${snapMode} parse API...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds for multi-image AI processing

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
        JSON.stringify(data).slice(0, 500),
      );
      // DEBUG: Log first item's unit_price specifically
      if (data.items && data.items[0]) {
        console.log("[Capture] First item raw:", JSON.stringify(data.items[0]));
        console.log(
          "[Capture] First item unit_price:",
          data.items[0].unit_price,
        );
      }

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
        rawItems = (data.items || []).map((item: any) => {
          // Calculate post-tax unit price: total_price / quantity
          // This is more accurate than unit_price which is often pre-tax
          const quantity = item.quantity || item.qty || 1;
          const totalPrice = item.total_price || item.totalPrice || 0;
          const unitPriceFromTotal =
            quantity > 0 ? Math.round(totalPrice / quantity) : null;

          // Fallback to AI's unit_price if total_price not available
          const finalUnitCost =
            unitPriceFromTotal || item.unit_price || item.unitPrice || null;

          console.log(
            `[Capture] ${item.ingredient_name}: total=${totalPrice}, qty=${quantity}, calculated=${unitPriceFromTotal}, final=${finalUnitCost}`,
          );

          return {
            ingredient_name:
              item.ingredient_name || item.name || item.item_name || "",
            stock_qty: quantity,
            import_qty: 0,
            unit: item.unit || "",
            confidence: item.confidence || 80,
            needs_review: false,
            unit_cost: finalUnitCost, // Post-tax unit price!
          };
        });
      } else if (snapMode === "SALES") {
        // ai-parse-sales returns { items_sold: SalesItem[] } or { menu_items: SalesItem[] }
        const salesItems =
          data.items_sold || data.menu_items || data.items || [];
        rawItems = salesItems.map((item: any) => ({
          ingredient_name:
            item.menu_item_name || item.name || item.menu_item || "",
          stock_qty: item.quantity_sold || item.quantity || 0,
          import_qty: 0,
          unit: item.unit || "phần",
          confidence: item.confidence || 80,
          needs_review: false,
        }));
      }

      if (rawItems.length > 0) {
        // DEBUG: Log rawItems first item
        console.log("[Capture] rawItems[0]:", JSON.stringify(rawItems[0]));
        console.log("[Capture] rawItems[0].unit_cost:", rawItems[0].unit_cost);

        const mapped = autoMapItems(rawItems);

        // DEBUG: Log mapped first item
        console.log("[Capture] mapped[0]:", JSON.stringify(mapped[0]));
        console.log("[Capture] mapped[0].unitCost:", mapped[0]?.unitCost);

        // AI CROSS-CHECK: Check for duplicate transfers (Per .script Section 2.3.C)
        if (snapMode === "STOCK" && areaType === "BAR") {
          try {
            const db = await getDB();
            const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
            const transfers = await db.getAllAsync<any>(
              `SELECT ai_parsed_json FROM pending_sync_logs 
               WHERE type IN ('TRANSFER', 'QUICK_OUT') AND date(created_at) = ?`,
              [today],
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
                  t.name.includes(scannedName) || scannedName.includes(t.name),
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
                  "\n",
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
                        (m) => !duplicates.some((d) => d.startsWith(m.rawName)),
                      );
                      setItems(filtered);
                    },
                    style: "destructive",
                  },
                ],
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
  // Returns recipes + resale_items for SALES mode, ingredients for IMPORT/STOCK
  const getFilteredSuggestions = (): (LocalIngredient | LocalRecipe)[] => {
    const query = searchQuery.toLowerCase();

    if (snapMode === "SALES") {
      // Get resale items (ingredients that are sold directly without recipe)
      const resaleItems = ingredients.filter(
        (ing) => ing.type === "resale_item",
      );

      // Combine recipes + resale items for SALES mode
      const allSalesItems = [...recipes, ...resaleItems];

      if (!searchQuery) return allSalesItems.slice(0, 15);
      return allSalesItems
        .filter((item) => item.name.toLowerCase().includes(query))
        .slice(0, 15);
    }

    // Return ingredients for IMPORT/STOCK
    if (!searchQuery) return ingredients.slice(0, 10);
    return ingredients
      .filter(
        (ing) =>
          ing.name.toLowerCase().includes(query) ||
          (ing.aliases && ing.aliases.toLowerCase().includes(query)),
      )
      .slice(0, 10);
  };

  // Link item to ingredient or recipe (based on snapMode)
  const linkIngredient = (
    itemIndex: number,
    item: LocalIngredient | LocalRecipe,
  ) => {
    // Check if it's a recipe (for SALES mode) or ingredient
    const isRecipe = snapMode === "SALES";

    setItems((prev) =>
      prev.map((prevItem, i) =>
        i === itemIndex
          ? {
              ...prevItem,
              linkedIngredientId: item.id,
              linkedIngredientName: item.name,
              unitCost: isRecipe
                ? null
                : (prevItem.unitCost ?? (item as LocalIngredient).unit_cost),
              isNewIngredient: false,
            }
          : prevItem,
      ),
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
          : item,
      ),
    );
    setActiveDropdown(null);
  };

  // Update item field
  const updateItem = (index: number, field: keyof AiMappedItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
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
  // ZERO/NULL quantity: Force red border (AI couldn't read number)
  const getConfidenceStyle = (conf: number, quantity?: number | null) => {
    // Special case: null or 0 quantity means AI couldn't read the number
    // Force red border to alert staff
    if (quantity === null || quantity === undefined || quantity === 0) {
      return { borderColor: "#E63946", borderWidth: 5, text: "#E63946" }; // Thick Red
    }
    if (conf >= 90) {
      return { borderColor: "#6B8E23", borderWidth: 3, text: "#6B8E23" }; // Olive Green
    }
    if (conf >= 85) {
      return { borderColor: "#FFC857", borderWidth: 4, text: "#FFC857" }; // Mustard Yellow
    }
    return { borderColor: "#E63946", borderWidth: 4, text: "#E63946" }; // Tomato Red
  };

  // Counts - include items with null/zero quantity as needing review
  const lowConfCount = items.filter(
    (i) =>
      i.confidence < CONFIDENCE_THRESHOLD ||
      i.quantity === 0 ||
      i.quantity === null,
  ).length;
  const unmappedCount = items.filter(
    (i) => !i.linkedIngredientId && !i.isNewIngredient,
  ).length;
  // Check for invalid weights (gross < tare)
  const hasInvalidWeights = items.some((item) => {
    const matched = ingredients.find(
      (ing) => ing.id === item.linkedIngredientId,
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

  // Header Logic - use internal state for check mode and area
  const isFullCount = currentCheckMode === "FULL";
  const isBar = currentAreaType === "BAR";

  let currentModeTitle = "KIỂM KÊ KHO";
  let currentModeSubtitle = "";
  let headerColor = "#94A3B8";
  let headerIcon = "cube";

  if (snapMode === "STOCK") {
    if (isBar) {
      currentModeTitle = "QUẦY BAR";
      currentModeSubtitle = "Kiểm tồn cuối ca (Bar Inventory)";
      headerColor = "#6B8E23"; // Olive Green
      headerIcon = "wine";
    } else {
      currentModeTitle = "KHO TỔNG";
      if (isFullCount) {
        currentModeSubtitle = "KIỂM TOÀN BỘ (Chốt sổ tháng)";
        headerColor = "#EF4444"; // Danger Red
        headerIcon = "alert-circle";
      } else {
        currentModeSubtitle = "KIỂM 1 PHẦN (Spot Check)";
        headerColor = "#3B82F6"; // Blue
        headerIcon = "search";
      }
    }
  } else if (snapMode === "SALES") {
    currentModeTitle = "DOANH THU";
    currentModeSubtitle = "Chụp hóa đơn bán hàng";
    headerColor = "#E07A2F"; // Burnt Orange
    headerIcon = "receipt";
  } else if (snapMode === "IMPORT") {
    currentModeTitle = "NHẬP HÀNG";
    currentModeSubtitle = "Chụp hóa đơn nhập kho";
    headerColor = "#F59E0B"; // Amber
    headerIcon = "cart";
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: isFullCount ? "#1F1212" : "#121212" }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          paddingTop: 60,
          borderBottomWidth: 1,
          borderBottomColor: isFullCount ? "#3F1818" : "#2A2A2A",
        }}
      >
        <Pressable onPress={onBack} style={{ padding: 8, marginLeft: -8 }}>
          <Text style={{ color: "#E07A2F", fontSize: 16, fontWeight: "600" }}>
            ← Quay lại
          </Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Ionicons
              name={headerIcon as any}
              size={20}
              color={headerColor}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                color: headerColor,
                fontSize: 20,
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              {currentModeTitle}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 11,
              color: "#94A3B8",
              fontWeight: "600",
              backgroundColor: "rgba(255,255,255,0.05)",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
            }}
          >
            {currentModeSubtitle ||
              (isStandard ? "Kho Kép (Standard)" : "Kho Đơn (Simple)")}
          </Text>
        </View>
        <Pressable
          onPress={onOpenSettings}
          style={{ padding: 8, marginRight: -8 }}
        >
          <Text style={{ color: "#B8B3A8", fontSize: 20 }}>⚙️</Text>
        </Pressable>
      </View>

      {/* FULL_COUNT Mode Warning Banner */}
      {currentCheckMode === "FULL" && (
        <View style={styles.freezeAlert}>
          <Text style={styles.freezeAlertTitle}>⚠️ CHẾ ĐỘ KIỂM TOÀN BỘ</Text>
          <Text style={styles.freezeAlertText}>
            Món nào KHÔNG NHẬP sẽ bị set về 0. Đảm bảo kiểm hết tất cả nguyên
            liệu!
          </Text>
        </View>
      )}

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
          onPress={() => {
            // When switching from SALES/IMPORT to STOCK:
            // - Switch to BAR area (expected workflow: sales at bar -> check bar stock)
            // - Set mode to default for BAR (no mode selection needed for BAR)
            if (snapMode !== "STOCK") {
              setCurrentAreaType("BAR"); // Switch to BAR for end-of-shift check
              setCurrentCheckMode(undefined); // BAR doesn't use FULL/SPOT modes
            }
            setSnapMode("STOCK");
          }}
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
        {isStandard && snapMode === "STOCK" && currentAreaType === "BAR" && (
          <IncomingLogCard items={incomingItems} />
        )}

        {isStandard &&
          snapMode === "STOCK" &&
          currentAreaType === "WAREHOUSE" &&
          currentCheckMode === "FULL" && (
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

        {/* Multi-image thumbnails row */}
        {imageUris.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }}
            >
              {imageUris.map((uri, index) => (
                <View
                  key={index}
                  style={{ marginRight: 8, position: "relative" }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: 100, height: 100, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      backgroundColor: "#DC2626",
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      ✕
                    </Text>
                  </Pressable>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                      backgroundColor: "rgba(0,0,0,0.7)",
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 10,
                        fontWeight: "600",
                      }}
                    >
                      {index + 1}/{imageUris.length}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Text
              style={{ color: "#64748B", fontSize: 12, textAlign: "center" }}
            >
              {imageUris.length}/{MAX_IMAGES} ảnh • Nhấn + để thêm
            </Text>
          </View>
        )}

        {/* Camera and gallery buttons - always visible */}
        {imageUris.length < MAX_IMAGES && (
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

        {/* Parse button - show when images are added */}
        {imageUris.length > 0 && items.length === 0 && (
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
                🔍 Quét AI - {imageUris.length} ảnh
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
          const style = getConfidenceStyle(item.confidence, item.quantity);
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
                      : snapMode === "SALES"
                        ? "Chọn công thức..."
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
                    placeholder={
                      snapMode === "SALES"
                        ? "Tìm công thức..."
                        : "Tìm nguyên liệu..."
                    }
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
                        {snapMode !== "SALES" && (
                          <Text style={{ color: "#64748B", fontSize: 11 }}>
                            {(ing as LocalIngredient).base_unit} ·{" "}
                            {(
                              ing as LocalIngredient
                            ).unit_cost?.toLocaleString()}
                            đ
                          </Text>
                        )}
                      </Pressable>
                    ))}
                    {/* Create new ingredient button - HIDDEN for SALES mode */}
                    {snapMode !== "SALES" && (
                      <Pressable
                        onPress={() => markAsNew(index)}
                        style={{ padding: 12, backgroundColor: "#1A1A1A" }}
                      >
                        <Text style={{ color: "#E07A2F" }}>
                          ➕ Tạo nguyên liệu mới "{item.rawName}"
                        </Text>
                      </Pressable>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Quantity + Unit with Labels */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", marginBottom: 4, gap: 8 }}>
                  <Text style={{ color: "#94A3B8", fontSize: 12, flex: 1 }}>
                    {snapMode === "STOCK"
                      ? "Tồn kho"
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
                  (ing) => ing.id === item.linkedIngredientId,
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
                    matched.density || 1,
                  );

                  if (netMl === null || netMl === -1) {
                    // 🔔 Haptic feedback for invalid weight
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Error,
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
                  unit?: string;
                  breakdown?: {
                    startingQty: number;
                    transfersIn: number;
                    salesConsumption: number;
                  };
                }[] = [];

                // FRESH QUERY: Get latest warehouse_qty and bar_qty from DB
                // to avoid stale state data (fixes "Lý thuyết" showing old values)
                const db = await getDB();
                const freshIngredients = await db.getAllAsync<{
                  id: string;
                  name: string;
                  warehouse_qty: number;
                  bar_qty: number;
                }>(
                  "SELECT id, name, warehouse_qty, bar_qty FROM local_ingredients WHERE archived = 0",
                );
                const freshIngMap = new Map(
                  freshIngredients.map((ing) => [ing.id, ing]),
                );

                // === BAR MODE: Calculate theoretical stock from SALES consumption ===
                let theoreticalMap = new Map<string, number>();
                let hasSalesLogs = false;

                if (isBar) {
                  const result = await calculateAllTheoreticalBarStock(db);
                  hasSalesLogs = result.hasSalesLogs;

                  // Build map of theoretical values
                  for (const bd of result.breakdowns) {
                    theoreticalMap.set(bd.ingredientId, bd.theoreticalQty);
                  }

                  // ⚠️ SALES WARNING: Alert user if no sales logs exist
                  if (!hasSalesLogs) {
                    console.log(
                      "[Variance] WARNING: No SALES logs found since last bar check",
                    );
                    Alert.alert(
                      "⚠️ Chưa nhập doanh thu",
                      "Bạn chưa chụp doanh thu kể từ lần kiểm kho gần nhất. Số liệu chênh lệch sẽ không chính xác vì chưa trừ lượng nguyên liệu đã bán.\n\nBạn có muốn tiếp tục không?",
                      [
                        { text: "Quay lại", style: "cancel" },
                        {
                          text: "Tiếp tục",
                          style: "destructive",
                          onPress: () => {
                            // Proceed with current bar_qty as fallback
                          },
                        },
                      ],
                    );
                    // Don't block, just warn (MVP approach)
                  }
                }

                for (const item of items) {
                  if (!item.linkedIngredientId) continue;
                  // Use fresh data from DB, not stale state
                  const ing = freshIngMap.get(item.linkedIngredientId);
                  if (!ing) continue;

                  // Expected stock based on CURRENT AREA being checked
                  // STORAGE (Kho Tổng) → warehouse_qty directly
                  // BAR (Quầy Bar) → theoretical stock (based on SALES consumption)
                  let expected: number;
                  if (isBar && theoreticalMap.has(item.linkedIngredientId)) {
                    // Use theoretical stock calculated from SALES
                    expected = theoreticalMap.get(item.linkedIngredientId) || 0;
                    console.log(
                      `[Variance] ${ing.name}: Theoretical=${expected.toFixed(2)} (from SALES), Counted=${item.quantity}`,
                    );
                  } else {
                    // Fallback to raw DB values
                    expected = isBar
                      ? ing.bar_qty || 0
                      : ing.warehouse_qty || 0;
                  }
                  const counted = item.quantity;

                  if (expected > 0) {
                    const variancePercent = Math.abs(
                      ((counted - expected) / expected) * 100,
                    );

                    // Get breakdown for BAR mode from theoreticalStock result
                    let breakdown = undefined;
                    if (isBar) {
                      const theoreticalResult =
                        await calculateAllTheoreticalBarStock(db);
                      const bd = theoreticalResult.breakdowns.find(
                        (b) => b.ingredientId === item.linkedIngredientId,
                      );
                      if (bd) {
                        breakdown = {
                          startingQty: bd.startingQty,
                          transfersIn: bd.transfersIn,
                          salesConsumption: bd.salesConsumption,
                        };
                      }
                    }

                    // Find ingredient to get base_unit
                    const ingForUnit = ingredients.find(
                      (i) => i.id === item.linkedIngredientId,
                    );

                    variances.push({
                      name: ing.name,
                      counted,
                      expected,
                      percent: variancePercent,
                      unit: ingForUnit?.base_unit || "",
                      breakdown,
                    });
                  }
                }

                // Check for critical variances (>15%)
                const criticalVariances = variances.filter(
                  (v) => v.percent > 15 && v.counted < v.expected, // Loss
                );
                const warningVariances = variances.filter(
                  (v) => v.percent >= 2 && v.percent <= 15,
                );

                // Check for surplus (counted > expected)
                const surplusDetected = variances.filter(
                  (v) => v.counted > v.expected && v.percent > 5,
                );

                // Check for Perfect Score Trap (liquid/powder items at 100% match)
                const liquidItems = items.filter((item) => {
                  const ing = ingredients.find(
                    (i) => i.id === item.linkedIngredientId,
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
                      ToastAndroid.LONG,
                    );
                  } else {
                    Alert.alert(
                      "🧐 Perfect Score",
                      "Số liệu quá hoàn hảo. Bạn có chắc đã cân đo kỹ không?",
                    );
                  }
                }

                // 🚨 LEVEL 3: Critical Variance (>15%) - Show VarianceModal
                if (criticalVariances.length > 0) {
                  await Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Error,
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
                              (ing) => ing.id === i.linkedIngredientId,
                            )?.name === v.name,
                        )?.unit || "đơn vị",
                    })),
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

                // === STEP 1: AUTO-LEARN ALIASES ===
                // If user mapped AI text "sữa dalat" -> DB "Dalatmilk",
                // we should save "sữa dalat" as alias for next time.
                const { addToSyncQueue } = await import("../sync/syncEngine");

                for (const item of items) {
                  // Only map if linked & not new
                  if (
                    item.linkedIngredientId &&
                    item.linkedIngredientName &&
                    !item.isNewIngredient
                  ) {
                    const rawNameLower = item.rawName.toLowerCase().trim();
                    const linkedNameLower = item.linkedIngredientName
                      .toLowerCase()
                      .trim();

                    // If names differ significantly (not just substring), it's likely an alias candidate
                    if (
                      !linkedNameLower.includes(rawNameLower) &&
                      !rawNameLower.includes(linkedNameLower)
                    ) {
                      // Find local ingredient to get current aliases
                      const ing = ingredients.find(
                        (i) => i.id === item.linkedIngredientId,
                      );
                      if (ing) {
                        let currentAliases: string[] = [];
                        try {
                          currentAliases =
                            typeof ing.aliases === "string"
                              ? JSON.parse(ing.aliases)
                              : ing.aliases || [];
                        } catch (e) {
                          currentAliases = [];
                        }

                        // Add new alias if not exists
                        if (
                          !currentAliases.some(
                            (a) => a.toLowerCase() === rawNameLower,
                          )
                        ) {
                          currentAliases.push(item.rawName.toLowerCase()); // Store lowercase for better matching
                          const newAliasesJson = JSON.stringify(currentAliases);

                          // 1. Update LOCAL DB
                          await db.runAsync(
                            `UPDATE local_ingredients SET aliases = ? WHERE id = ?`,
                            [newAliasesJson, ing.id],
                          );

                          // 2. Queue Sync to Cloud
                          await addToSyncQueue("ingredients", "UPSERT", {
                            id: ing.id,
                            aliases: currentAliases,
                          });

                          console.log(
                            `[AutoLearn] Added alias "${item.rawName}" for "${ing.name}"`,
                          );
                        }
                      }
                    }
                  }
                }

                // === STEP 2: SAVE LOGS (PER ITEM) ===
                // We must save individual logs for each item effectively so SyncEngine can send
                // quantity_change_base and ingredient_id to Supabase to trigger Stock Updates.

                // 2.1 Ensure columns exist (Safe-guard for existing installs)
                try {
                  await db.execAsync(
                    "ALTER TABLE pending_sync_logs ADD COLUMN ingredient_id TEXT",
                  );
                } catch {}
                try {
                  await db.execAsync(
                    "ALTER TABLE pending_sync_logs ADD COLUMN quantity_change_base REAL",
                  );
                } catch {}
                try {
                  await db.execAsync(
                    "ALTER TABLE pending_sync_logs ADD COLUMN unit_cost_at_time REAL",
                  );
                } catch {}

                const location = areaType === "BAR" ? "BAR" : "WAREHOUSE";
                const now = new Date().toISOString();

                // === SALES MODE: Create 1 batch log with all items ===
                if (snapMode === "SALES") {
                  const logId = Crypto.randomUUID();
                  const totalRevenue = items.reduce(
                    (sum, i) => sum + (i.unitCost || 0) * i.quantity,
                    0,
                  );
                  const totalItems = items.reduce(
                    (sum, i) => sum + i.quantity,
                    0,
                  );

                  await db.runAsync(
                    `INSERT INTO pending_sync_logs (
                      id, type, location, 
                      ai_parsed_json, 
                      created_at, synced
                    ) VALUES (?, ?, ?, ?, ?, 0)`,
                    [
                      logId,
                      "SALES",
                      location,
                      JSON.stringify({
                        items: items.map((item) => ({
                          ingredient_id: item.linkedIngredientId,
                          ingredient_name:
                            item.linkedIngredientName || item.rawName,
                          quantity: item.quantity,
                          unit: item.unit,
                          unit_cost: item.unitCost || 0,
                        })),
                        total_revenue: totalRevenue,
                        total_items: totalItems,
                      }),
                      now,
                    ],
                  );
                  console.log(
                    `[SALES] Created 1 batch log with ${items.length} items`,
                  );
                } else if (snapMode === "IMPORT") {
                  // === IMPORT MODE: Create per-item logs for stock updates ===
                  for (const item of items) {
                    const logId = Crypto.randomUUID();

                    console.log(
                      `[Capture SAVE] IMPORT item: rawName=${item.rawName}, linkedId=${item.linkedIngredientId}`,
                    );

                    await db.runAsync(
                      `INSERT INTO pending_sync_logs (
                        id, type, location, 
                        ingredient_id, 
                        quantity_change_base, 
                        unit_cost_at_time,
                        ai_parsed_quantity,
                        final_confirmed_quantity,
                        ai_parsed_json, 
                        created_at, synced
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                      [
                        logId,
                        snapMode,
                        location,
                        item.linkedIngredientId || null,
                        item.quantity, // IMPORT: qty change = item quantity
                        item.unitCost || 0,
                        item.quantity,
                        item.quantity,
                        JSON.stringify({
                          items: [
                            {
                              ingredient_id: item.linkedIngredientId,
                              ingredient_name:
                                item.linkedIngredientName || item.rawName,
                              quantity: item.quantity,
                              unit: item.unit,
                              unit_cost: item.unitCost || 0,
                            },
                          ],
                        }),
                        now,
                      ],
                    );
                  }
                } else if (snapMode === "STOCK") {
                  // === STOCK MODE: Create SINGLE batch log with ALL items ===
                  // sync-up will parse items[] and update each ingredient
                  const logId = Crypto.randomUUID();

                  console.log(
                    `[Capture SAVE] STOCK batch: ${items.length} items, checkMode=${currentCheckMode}, areaType=${currentAreaType}`,
                  );

                  await db.runAsync(
                    `INSERT INTO pending_sync_logs (
                      id, type, location,
                      ai_parsed_json,
                      created_at, synced
                    ) VALUES (?, ?, ?, ?, ?, 0)`,
                    [
                      logId,
                      snapMode,
                      location,
                      JSON.stringify({
                        check_type: checkMode || "FULL",
                        location: areaType || "WAREHOUSE",
                        items: items.map((item) => ({
                          ingredient_id: item.linkedIngredientId,
                          linkedIngredientId: item.linkedIngredientId,
                          ingredient_name:
                            item.linkedIngredientName || item.rawName,
                          rawName: item.rawName,
                          quantity: item.quantity,
                          unit: item.unit,
                          unit_cost: item.unitCost || 0,
                        })),
                      }),
                      now,
                    ],
                  );
                }

                // === STEP 3: SPECIAL HANDLING FOR FULL_COUNT ===
                if (
                  snapMode === "STOCK" &&
                  checkMode === "FULL" &&
                  areaType === "WAREHOUSE"
                ) {
                  const countedIds = items
                    .map((i) => i.linkedIngredientId)
                    .filter((id): id is string => !!id);

                  await InventoryService.resetUncountedWarehouseStock(
                    countedIds,
                  );

                  // Also need to create logs for these zeroed items?
                  // Ideally, the sync engine should handle discrepancy.
                  // But for now, local DB is updated.
                }

                // Add success log
                console.log(`[Capture] Saved ${items.length} logs for sync`);

                // Success haptic
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );

                Alert.alert(
                  "Thành công",
                  `Đã lưu phiếu ${
                    snapMode === "IMPORT"
                      ? "nhập hàng"
                      : snapMode === "SALES"
                        ? "bán hàng"
                        : "kiểm kho"
                  }`,
                );

                // Trigger sync immediately (non-blocking)
                // NOTE: Only call syncPendingLogs. processSyncQueue was removed
                // because it queries the same table, causing duplicate inserts.
                syncPendingLogs(db).then(() => {
                  console.log("⚡ Auto-sync triggered after save");
                });

                onBack();
              } catch (err) {
                console.error("Save failed:", err);
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error,
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
          // Save as BATCH log - sync-up will parse items[] and update each ingredient
          try {
            const db = await getDB();
            const logId = Crypto.randomUUID();
            const now = new Date().toISOString();
            const location = areaType === "BAR" ? "BAR" : "WAREHOUSE";

            // Create single batch log with all items
            await db.runAsync(
              `INSERT INTO pending_sync_logs (
                id, type, location,
                ai_parsed_json,
                created_at, synced
              ) VALUES (?, ?, ?, ?, ?, 0)`,
              [
                logId,
                snapMode,
                location,
                JSON.stringify({
                  check_type: checkMode || "FULL",
                  location: areaType || "WAREHOUSE",
                  variance_reason: reason,
                  variance_note: note,
                  is_flagged: isFlagged,
                  items: items.map((item) => ({
                    ingredient_id: item.linkedIngredientId,
                    linkedIngredientId: item.linkedIngredientId,
                    ingredient_name: item.linkedIngredientName || item.rawName,
                    rawName: item.rawName,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_cost: item.unitCost || 0,
                  })),
                }),
                now,
              ],
            );

            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
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
                "WAREHOUSE", // Auto-transfer from surplus comes from warehouse
                JSON.stringify({
                  surplus_items: surplusItems,
                  auto_created: true,
                }),
                new Date().toISOString(),
                0,
              ],
            );
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            Alert.alert(
              "Đã tạo",
              "Phiếu nhập bù từ Kho Tổng đã được tạo tự động.",
            );
            // Continue to save the stock check
          } catch (err) {
            console.error("Auto transfer failed:", err);
          }
        }}
        onDismiss={() => setShowSurplusSheet(false)}
      />

      {/* Document Camera with guide frame (STOCK mode only) */}
      <DocumentCameraModal
        visible={showDocumentCamera}
        onCapture={handleDocumentCapture}
        onClose={() => setShowDocumentCamera(false)}
      />

      {/* Sales Camera with 3-section grid (SALES mode only) */}
      <SalesCameraModal
        visible={showSalesCamera}
        onCapture={(uri) => {
          setShowSalesCamera(false);
          setImageUris((prev) => [...prev, uri]);
          setItems([]);
          setError(null);
        }}
        onClose={() => setShowSalesCamera(false)}
        totalPhotos={imageUris.length}
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
