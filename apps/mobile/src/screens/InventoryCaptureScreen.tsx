/**
 * InventoryCaptureScreen - Camera capture with AI parsing + Ingredient Mapping
 * Features: Camera, Compress <1MB, AI parse, Confidence highlighting, Autocomplete dropdown
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  AppState,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
  Modal,
  Platform,
  ToastAndroid,
  StyleSheet,
  TouchableOpacity,
  LogBox,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import {
  canConvert,
  convertToIngredientBase,
  getUnitGroup,
  isCrossFamilyConversion,
} from "@snapko/shared";
import { getDB } from "../db";
// processSyncQueue removed - use syncPendingLogs only to avoid duplicate sync
import { syncPendingLogs } from "../sync/syncEngine";
import {
  parseInvoiceMultiWithAI,
  parseSalesMultiWithAI,
  parseHandwritingMultiWithAI,
  confirmAiResultCharge,
  QuotaExceededError,
  type AiQualityMode,
  type AiQuotaMetadata,
} from "../services/aiService";
import { QuotaModal } from "../features/ads/QuotaModal";
import {
  VarianceModal,
  SurplusBottomSheet,
  VarianceReason,
} from "../components";
import { InventoryService } from "../features/inventory/services/inventory.service";
import {
  incrementStockLevel,
  resolveLocalAreaByLocation,
  upsertStockLevel,
} from "../db/stockLevelHelper";
import { useInventoryModel } from "../contexts/InventoryModelContext";
import { resolveCaptureArea } from "../contexts/inventoryModelState";
import { useTodayIncoming } from "../hooks/useTodayIncoming";
import { IncomingLogCard } from "../components/IncomingLogCard";
import { BufferedTextInput } from "../components/BufferedTextInput";
import { StorageArea, CheckMode } from "../components/AreaSelectorModal";
import { DocumentCameraModal } from "../components/DocumentCameraModal";
import { SalesCameraModal } from "../components/SalesCameraModal";
import { calculateAllTheoreticalBarStock } from "../features/inventory/services/theoreticalStock";
import {
  checkSalesPrerequisite,
  getStockSalesGuardScope,
  type SalesGuardScope,
} from "../features/inventory/services/salesPrerequisite.service";
import {
  buildStockSaveConfirmation,
  validateWarehousePurchasePacks,
  type StockSaveConfirmation,
  type WarehousePackViolation,
} from "../features/inventory/services/stockSavePolicy";
import {
  getProRebaselineState,
  markProRebaselineBarDone,
  markProRebaselineWarehouseDone,
  type ProRebaselineState,
} from "../utils/proRebaseline";
import {
  formatParseErrorMessage,
  isExpectedNetworkError,
} from "./inventoryCaptureError";
import {
  fullCountItemActions,
  type FullCountItemActionId,
} from "./inventoryCaptureItemActions";
import {
  createInventoryCaptureItemKey,
  removeInventoryCaptureItemByKey,
  updateInventoryCaptureItemByKey,
} from "./inventoryCaptureItems";
import {
  getVolumeWeightFeedback,
  parseNumericField,
} from "./inventoryCaptureValidation";
import { runInventorySaveOperation } from "./inventoryCaptureSave";

const CONFIDENCE_THRESHOLD = 0.85; // Backend returns 0-1 decimal
const CAPTURE_IMAGES_DIR = "pending_images";

if (__DEV__) {
  LogBox.ignoreLogs(["Network request failed"]);
}

function getCaptureImagesDirectory(): Directory {
  return new Directory(Paths.document, CAPTURE_IMAGES_DIR);
}

function ensureCaptureImagesDirectory(): Directory {
  const dir = getCaptureImagesDirectory();
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

function formatImageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const IMAGE_READABLE_ERROR =
  "Không đọc được ảnh này. Bạn thử chụp lại hoặc chọn ảnh khác nhé.";

function isPendingCaptureUri(uri: string): boolean {
  return uri.includes(`/${CAPTURE_IMAGES_DIR}/`);
}

async function copyImageIntoAppStorage(
  uri: string,
  prefix: string,
): Promise<string> {
  const dir = ensureCaptureImagesDirectory();
  const fileName = `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}.jpg`;
  const source = new File(uri);
  const dest = new File(dir, fileName);
  source.copy(dest);
  return dest.uri;
}

async function persistImageForCapture(
  uri: string,
  prefix: string,
): Promise<string> {
  const savedUri = await copyImageIntoAppStorage(uri, prefix);
  const savedFile = new File(savedUri);
  if (!savedFile.exists) {
    throw new Error("Ảnh đã copy nhưng file đích không tồn tại.");
  }
  return savedUri;
}

function assertReadableImageUri(uri: string): void {
  const file = new File(uri);
  if (!file.exists) {
    throw new Error(`Ảnh không còn tồn tại: ${uri}`);
  }
}

function deleteLocalImageBestEffort(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup only.
  }
}

// Types
interface AiRawItem {
  ingredient_name: string;
  raw_name?: string;
  stock_qty: number;
  import_qty: number;
  unit?: string;
  confidence: number;
  needs_review?: boolean;
  raw_text?: string;
  original_name?: string;
  source_page?: number;
  review_reason?: string;
  unit_cost?: number | null; // For IMPORT mode - extracted from invoice
  // New fields from backend (Fuzzy Matching)
  ingredient_id?: string;
  linkedIngredientId?: string;
  recipe_id?: string;
  matched_recipe_name?: string | null;
  stt?: string | number;
  // SALES extras (for revenue cross-check + order preservation)
  row_index?: number;
  total_revenue?: number | null;
  expected_revenue?: number | null;
  revenue_deviation?: number | null;
  recipe_price?: number | null;
  internal_inconsistent?: boolean;
  menu_price_differs?: boolean;
}

interface AiMappedItem {
  clientKey: string;
  rawName: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost: number | null;
  linkedIngredientId: string | null;
  linkedIngredientName: string | null;
  recipeId?: string | null;
  isNewIngredient: boolean;
  // SALES extras
  rowIndex?: number;
  totalRevenue?: number | null;
  expectedRevenue?: number | null;
  revenueDeviation?: number | null;
  recipePrice?: number | null;
  internalInconsistent?: boolean;
  menuPriceDiffers?: boolean;
  stt?: string | number;
  rawText?: string;
  originalName?: string;
  sourcePage?: number;
  reviewReason?: string;
  expiryDate?: string | null;
  expirySource?: "AUTO_SHELF_LIFE" | "MANUAL" | null;
  shelfLifeDaysSnapshot?: number | null;
}

interface LocalIngredient {
  id: string;
  name: string;
  aliases: string;
  base_unit: string;
  stock_check_unit?: string | null;
  unit_cost: number;
  density: number;
  tare_weight: number;
  unit_weight?: number | null;
  unit_weight_unit?: string | null;
  last_purchase_price?: number | null;
  last_purchase_qty?: number | null;
  last_purchase_unit?: string | null;
  warehouse_qty: number;
  bar_qty: number;
  type?: string; // raw_material | supply | semi_product | resale_item
  shelf_life_days?: number | null;
}

// Recipe interface for SALES mode linking
interface LocalRecipe {
  id: string;
  name: string;
  aliases: string;
  category: string | null;
  price?: number | null;
}

interface InventoryCaptureItemRowProps {
  item: AiMappedItem;
  snapMode: "STOCK" | "IMPORT" | "SALES";
  activeDropdown: string | null;
  searchQuery: string;
  expiryPickerTargetKey: string | null;
  expiryPickerValueTime: number;
  ingredients: LocalIngredient[];
  recipes: LocalRecipe[];
  warehouseFullCount: boolean;
  render: (item: AiMappedItem) => React.ReactElement;
}

const InventoryCaptureItemRow = React.memo(
  function InventoryCaptureItemRow({
    item,
    render,
  }: InventoryCaptureItemRowProps) {
    return render(item);
  },
  (previous, next) =>
    previous.item === next.item &&
    previous.snapMode === next.snapMode &&
    previous.activeDropdown === next.activeDropdown &&
    previous.searchQuery === next.searchQuery &&
    previous.expiryPickerTargetKey === next.expiryPickerTargetKey &&
    previous.expiryPickerValueTime === next.expiryPickerValueTime &&
    previous.ingredients === next.ingredients &&
    previous.recipes === next.recipes &&
    previous.warehouseFullCount === next.warehouseFullCount,
);

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
  const normalized = normalizeLookup(aiName);
  const name = normalizeLookup(ingName);

  if (name === normalized) return 100;
  if (aliases.some((a) => normalizeLookup(a) === normalized)) return 95;

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

function normalizeLookup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function parseAliases(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((alias): alias is string => typeof alias === "string");
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((alias): alias is string => typeof alias === "string")
      : [];
  } catch {
    return [];
  }
}

function parseYyyyMmDd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateToYyyyMmDd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatExpiryDisplay(value: string | null | undefined): string {
  const date = parseYyyyMmDd(value);
  if (!date) return "Chọn ngày hết hạn";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatStockReviewReason(reason: string | null | undefined): string {
  switch (reason) {
    case "UNLINKED_INGREDIENT":
      return "chưa liên kết nguyên liệu";
    case "EMPTY_OR_UNREADABLE_QUANTITY":
      return "chưa đọc được số tồn";
    case "AI_MARKED_FOR_REVIEW":
      return "AI đánh dấu cần kiểm tra";
    default:
      return reason || "cần kiểm tra";
  }
}

function normalizeUnitForConversion(unit: string): string {
  const normalized = unit.normalize("NFC").trim().toLowerCase();
  const aliases: Record<string, string> = {
    gram: "g",
    grams: "g",
    gr: "g",
    kilogram: "kg",
    kilograms: "kg",
    liter: "l",
    liters: "l",
    litre: "l",
    litres: "l",
  };
  return aliases[normalized] ?? normalized;
}

function roundInventoryQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export default function InventoryCaptureScreen({
  onBack,
  onOpenSettings,
  onNavigateToConfirm: _onNavigateToConfirm,
  initialMode = "stock",
  areaType,
  checkMode,
}: InventoryCaptureScreenProps) {
  const { model, isStandard, businessId } = useInventoryModel();

  // Multi-image support: store array of images
  const MAX_IMAGES = 5;
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [localImagePaths, setLocalImagePaths] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [activeQualityMode, setActiveQualityMode] =
    useState<AiQualityMode | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>(""); // Multi-step loading
  const [items, setItems] = useState<AiMappedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<{
    canWatchAd: boolean;
    adRewardScans: number;
    maxAdRewardsPerDay: number;
  } | null>(null);
  const [canRetryHighAccuracy, setCanRetryHighAccuracy] = useState(false);
  const [preservedFullCountIngredientIds, setPreservedFullCountIngredientIds] =
    useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const stockUnitLearningItemsRef = useRef<AiMappedItem[]>([]);
  const [salesQtyMismatch, setSalesQtyMismatch] = useState<{ expected: number; got: number; diff: number } | null>(null);
  const [salesRevenueMismatch, setSalesRevenueMismatch] = useState<{ expected: number; got: number; diff: number } | null>(null);
  const [salesOrderSuspicious, setSalesOrderSuspicious] = useState<boolean>(false);
  const [salesRawOcrText, setSalesRawOcrText] = useState<string | null>(null);
  const [salesReportTotalRevenue, setSalesReportTotalRevenue] = useState<number | null>(null);
  const [stockRawOcrText, setStockRawOcrText] = useState<string | null>(null);
  const [stockRawDebugText, setStockRawDebugText] = useState<string | null>(null);
  const [stockWarnings, setStockWarnings] = useState<string[]>([]);
  const [stockMissingRows, setStockMissingRows] = useState<number[]>([]);
  const [stockDuplicateRows, setStockDuplicateRows] = useState<number[]>([]);
  const [stockUsedRawOcrParser, setStockUsedRawOcrParser] = useState(false);
  const [showRawOcrModal, setShowRawOcrModal] = useState<boolean>(false);

  const clearSalesCrossCheck = () => {
    setSalesQtyMismatch(null);
    setSalesRevenueMismatch(null);
    setSalesOrderSuspicious(false);
    setSalesRawOcrText(null);
    setSalesReportTotalRevenue(null);
    setStockRawOcrText(null);
    setStockRawDebugText(null);
    setStockWarnings([]);
    setStockMissingRows([]);
    setStockDuplicateRows([]);
    setStockUsedRawOcrParser(false);
  };
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
  >(resolveCaptureArea(model, initialMode, areaType));

  // Storage Areas state for Standard Mode
  const [currentAreaId, setCurrentAreaId] = useState<string | null>(null);
  const { items: incomingItems } = useTodayIncoming(
    isStandard && currentAreaType === "BAR" ? currentAreaId : null,
  );

  // Local ingredients for autocomplete
  const [ingredients, setIngredients] = useState<LocalIngredient[]>([]);

  // Recipes for SALES mode linking
  const [recipes, setRecipes] = useState<LocalRecipe[]>([]);
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const recipeById = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.id, recipe])),
    [recipes],
  );

  // Dropdown state
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expiryPickerTargetKey, setExpiryPickerTargetKey] = useState<
    string | null
  >(null);
  const [expiryPickerValue, setExpiryPickerValue] = useState<Date>(new Date());

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
  const [proRebaseline, setProRebaseline] = useState<ProRebaselineState>({
    required: false,
    warehouseDone: false,
    barDone: false,
  });
  const [showDocumentCamera, setShowDocumentCamera] = useState(false); // Guide frame camera
  const [showSalesCamera, setShowSalesCamera] = useState(false); // Sales grid camera
  const [fullCountActionTarget, setFullCountActionTarget] = useState<{
    clientKey: string;
    title: string;
  } | null>(null);
  const parsingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const parseInterruptedByBackgroundRef = useRef(false);

  // Load ingredients and recipes from local DB
  useEffect(() => {
    loadIngredients();
    loadRecipes(); // Load recipes for SALES mode
    setCurrentAreaId(null);
    if (isStandard && currentAreaType) {
      loadAreaId(currentAreaType);
    }
  }, [isStandard, currentAreaType]);

  useEffect(() => {
    if (areaType) {
      setCurrentAreaType(areaType);
      return;
    }
    if (snapMode === "SALES") {
      setCurrentAreaType(resolveCaptureArea(model, "sales"));
    }
  }, [areaType, model, snapMode]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await getDB();
        const state = await getProRebaselineState(db);
        if (mounted) setProRebaseline(state);
      } catch (err) {
        console.warn("[Capture] Failed to load rebaseline state:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    parsingRef.current = parsing;
  }, [parsing]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        parsingRef.current &&
        appStateRef.current === "active" &&
        nextState !== "active"
      ) {
        parseInterruptedByBackgroundRef.current = true;
      }
      appStateRef.current = nextState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadAreaId = async (targetAreaType: StorageArea) => {
    try {
      const db = await getDB();
      const area = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM local_storage_areas
         WHERE type = ? AND is_active = 1
         ORDER BY is_default DESC, name ASC
         LIMIT 1`,
        [targetAreaType === "BAR" ? "SERVICE" : "STORAGE"],
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
        "SELECT id, name, aliases, base_unit, stock_check_unit, unit_cost, density, tare_weight, unit_weight, unit_weight_unit, last_purchase_price, last_purchase_qty, last_purchase_unit, warehouse_qty, bar_qty, type, shelf_life_days FROM local_ingredients WHERE archived = 0",
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
        "SELECT id, name, aliases, category, price FROM local_recipes WHERE is_active = 1",
      );
      setRecipes(rows);
      console.log(`[Capture] Loaded ${rows.length} recipes`);
    } catch (err) {
      console.error("[Capture] loadRecipes error:", err);
    }
  };

  // Compress image to <1MB and save locally
  // Input URI is already persisted into app storage when selected/captured.
  const compressAndSaveImage = async (
    uri: string,
  ): Promise<{ base64: string; mimeType: string; savedPath: string }> => {
    const sourceUri = uri;

    try {
      const targetWidth = snapMode === "STOCK" ? 1600 : 1024;
      const jpegQuality = snapMode === "STOCK" ? 0.75 : 0.5;

      const manipulated = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: targetWidth } }],
        { compress: jpegQuality, format: ImageManipulator.SaveFormat.JPEG },
      );
      const savedPath = await copyImageIntoAppStorage(
        manipulated.uri,
        "capture",
      );
      const file = new File(savedPath);
      const base64 = await file.base64();

      console.log(`[Capture] Saved compressed image: ${savedPath}`);
      return { base64, mimeType: "image/jpeg", savedPath };
    } catch (manipulatorError) {
      console.warn(
        "[Capture] ImageManipulator failed, falling back to original file:",
        formatImageError(manipulatorError),
      );

      try {
        const file = new File(sourceUri);
        const base64 = await file.base64();
        return { base64, mimeType: "image/jpeg", savedPath: sourceUri };
      } catch (readError) {
        console.error("[Capture] Could not read image file:", readError);
        throw new Error(IMAGE_READABLE_ERROR);
      }
    }
  };

  const appendPersistedImages = async (
    sourceUris: string[],
    prefix: string,
  ): Promise<void> => {
    const persistedUris: string[] = [];
    const failedErrors: string[] = [];

    for (const sourceUri of sourceUris) {
      try {
        const persistedUri = await persistImageForCapture(sourceUri, prefix);
        persistedUris.push(persistedUri);
      } catch (persistError) {
        failedErrors.push(formatImageError(persistError));
        console.error(
          "[Capture] Could not persist selected image:",
          formatImageError(persistError),
        );
      }
    }

    if (persistedUris.length > 0) {
      setImageUris((prev) => [...prev, ...persistedUris]);
      setItems([]);
      clearSalesCrossCheck();
      setError(null);
      setCanRetryHighAccuracy(false);
      setPreservedFullCountIngredientIds([]);
      setQuotaExceeded(null);
    }

    if (failedErrors.length > 0) {
      setError(IMAGE_READABLE_ERROR);
      Alert.alert("Không đọc được ảnh", IMAGE_READABLE_ERROR);
    }
  };

  const ensurePersistedImageUrisForParse = async (): Promise<string[]> => {
    const persistedUris: string[] = [];
    const brokenUris: string[] = [];

    for (const uri of imageUris) {
      try {
        assertReadableImageUri(uri);
        const persistedUri = isPendingCaptureUri(uri)
          ? uri
          : await persistImageForCapture(uri, "capture_recovered");
        persistedUris.push(persistedUri);
      } catch (err) {
        brokenUris.push(uri);
        console.error(
          "[Capture] Image URI is not readable before parse:",
          uri,
          formatImageError(err),
        );
      }
    }

    if (brokenUris.length > 0 || persistedUris.some((uri, index) => uri !== imageUris[index])) {
      setImageUris(persistedUris);
      setLocalImagePaths((prev) =>
        prev.filter((path) => persistedUris.includes(path)),
      );
      for (const uri of brokenUris) {
        deleteLocalImageBestEffort(uri);
      }
    }

    if (brokenUris.length > 0 || persistedUris.length === 0) {
      throw new Error(IMAGE_READABLE_ERROR);
    }

    return persistedUris;
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
      await appendPersistedImages([result.assets[0].uri], "capture_camera");
    }
  };

  // Handle capture from DocumentCameraModal
  const handleDocumentCapture = async (uri: string) => {
    setShowDocumentCamera(false);
    await appendPersistedImages([uri], "capture_document");
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

      await appendPersistedImages(allowedNewUris, "capture_library");

      if (newUris.length > remaining) {
        Alert.alert("Thông báo", `Chỉ lấy được ${remaining} ảnh do giới hạn.`);
      }
    }
  };

  // Remove image at index
  const removeImage = (index: number) => {
    const imageUri = imageUris[index];
    const localPath = localImagePaths[index];
    setImageUris((prev) => prev.filter((_, i) => i !== index));
    setLocalImagePaths((prev) => prev.filter((_, i) => i !== index));
    deleteLocalImageBestEffort(imageUri);
    if (localPath !== imageUri) {
      deleteLocalImageBestEffort(localPath);
    }
  };

  const resolveShelfLifeDays = (
    ingredientId: string | null | undefined,
  ): number | null => {
    if (!ingredientId) return null;
    const ingredient = ingredientById.get(ingredientId);
    if (!ingredient) return null;
    const shelfLifeDays = Number(ingredient.shelf_life_days ?? 0);
    if (!Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;
    return Math.round(shelfLifeDays);
  };

  const buildAutoExpiryDate = (baseDate: Date, shelfLifeDays: number): string => {
    const expiry = new Date(baseDate.getTime() + shelfLifeDays * 86400_000);
    const yyyy = expiry.getFullYear();
    const mm = String(expiry.getMonth() + 1).padStart(2, "0");
    const dd = String(expiry.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const applyImportExpiryRules = (
    item: AiMappedItem,
    ingredientId: string | null | undefined,
    baseDate: Date = new Date(),
  ): AiMappedItem => {
    if (snapMode !== "IMPORT") {
      return {
        ...item,
        expiryDate: null,
        expirySource: null,
        shelfLifeDaysSnapshot: null,
      };
    }

    const shelfLifeDays = resolveShelfLifeDays(ingredientId);
    if (shelfLifeDays && shelfLifeDays > 0) {
      return {
        ...item,
        expiryDate: buildAutoExpiryDate(baseDate, shelfLifeDays),
        expirySource: "AUTO_SHELF_LIFE",
        shelfLifeDaysSnapshot: shelfLifeDays,
      };
    }

    return {
      ...item,
      expiryDate: item.expiryDate ?? null,
      expirySource: "MANUAL",
      shelfLifeDaysSnapshot: null,
    };
  };

  // Auto-map AI items to ingredients or recipes (based on snapMode)
  const autoMapItems = (rawItems: AiRawItem[]): AiMappedItem[] => {
    const captureExtras = (raw: AiRawItem) => ({
      stt: raw.stt,
      rawText: raw.raw_text,
      originalName: raw.original_name,
      sourcePage: raw.source_page,
      reviewReason: raw.review_reason,
    });
    const salesExtras = (raw: AiRawItem) => ({
      rowIndex: raw.row_index,
      totalRevenue: raw.total_revenue ?? null,
      expectedRevenue: raw.expected_revenue ?? null,
      revenueDeviation: raw.revenue_deviation ?? null,
      recipePrice: raw.recipe_price ?? null,
      internalInconsistent: !!raw.internal_inconsistent,
      menuPriceDiffers: !!raw.menu_price_differs,
    });
    const withClientKey = (
      raw: AiRawItem,
      rawIndex: number,
      item: Omit<AiMappedItem, "clientKey">,
    ): AiMappedItem => ({
      clientKey: createInventoryCaptureItemKey(raw, rawIndex),
      ...item,
    });

    const mapped: AiMappedItem[] = rawItems.map((raw, rawIndex): AiMappedItem => {
      if (snapMode === "SALES" && raw.recipe_id) {
        const matchedRecipe = recipeById.get(raw.recipe_id);

        if (matchedRecipe) {
          return withClientKey(raw, rawIndex, {
            rawName: raw.ingredient_name,
            quantity: raw.stock_qty,
            unit: raw.unit || "phần",
            confidence: raw.confidence,
            unitCost: raw.unit_cost ?? matchedRecipe.price ?? null,
            linkedIngredientId: matchedRecipe.id,
            linkedIngredientName: matchedRecipe.name,
            recipeId: matchedRecipe.id,
            isNewIngredient: false,
            ...captureExtras(raw),
            ...salesExtras(raw),
          });
        }

        return withClientKey(raw, rawIndex, {
          rawName: raw.ingredient_name,
          quantity: raw.stock_qty,
          unit: raw.unit || "phần",
          confidence: raw.confidence,
          unitCost: raw.unit_cost ?? null,
          linkedIngredientId: null,
          linkedIngredientName: raw.matched_recipe_name || raw.ingredient_name,
          recipeId: raw.recipe_id ?? null,
          isNewIngredient: false,
          ...captureExtras(raw),
          ...salesExtras(raw),
        });
      }

      // 0. Use Backend Mapping if available (High Priority)
      if (raw.linkedIngredientId || raw.ingredient_id) {
        const backendId = raw.linkedIngredientId || raw.ingredient_id;
        // Verify it exists in local DB
        const matchedIng = backendId ? ingredientById.get(backendId) : null;

        if (matchedIng) {
          // STOCK review should display the staff-preferred unit, while save
          // still normalizes back to the ingredient base_unit.
          let finalQty = raw.stock_qty;
          let finalUnit =
            snapMode === "STOCK"
              ? getStockWorkingUnit(matchedIng)
              : matchedIng.base_unit;
          const aiUnit = raw.unit || finalUnit;

          if (aiUnit && aiUnit !== finalUnit) {
            const sourceUnit = normalizeUnitForConversion(aiUnit);
            const targetUnit = normalizeUnitForConversion(finalUnit);
            const sourceGroup = getUnitGroup(sourceUnit);
            const targetGroup = getUnitGroup(targetUnit);
            const canUseCountWeight =
              (sourceGroup === "COUNT" &&
                (targetGroup === "WEIGHT" || targetGroup === "VOLUME")) ||
              (targetGroup === "COUNT" &&
                (sourceGroup === "WEIGHT" || sourceGroup === "VOLUME"));
            const canAutoConvert =
              canConvert(sourceUnit, targetUnit) ||
              isCrossFamilyConversion(sourceUnit, targetUnit) ||
              canUseCountWeight;

            if (!canAutoConvert) {
              finalUnit = aiUnit;
            } else {
              const converted = convertToIngredientBase(
                raw.stock_qty,
                sourceUnit,
                targetUnit,
                matchedIng.density,
                matchedIng.unit_weight,
                matchedIng.unit_weight_unit,
              );
              if (typeof converted === "number") {
                finalQty = converted;
              } else {
                finalUnit = aiUnit;
              }
            }
          }

          return withClientKey(raw, rawIndex, {
            rawName: raw.ingredient_name,
            quantity: finalQty,
            unit: finalUnit,
            confidence: raw.confidence,
            unitCost: raw.unit_cost ?? matchedIng.unit_cost,
            linkedIngredientId: matchedIng.id,
            linkedIngredientName: matchedIng.name,
            recipeId: null,
            isNewIngredient: false,
            ...captureExtras(raw),
            ...salesExtras(raw),
          });
        }
      }

      // For SALES mode, match with recipes AND resale_items
      if (snapMode === "SALES") {
        let bestMatch: LocalRecipe | LocalIngredient | null = null;
        let bestScore = 0;
        let isResaleItem = false;

        // First, try matching with recipes
        for (const rec of recipes) {
          const score = getMatchScore(
            raw.ingredient_name,
            rec.name,
            parseAliases(rec.aliases),
          );
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
          const score = getMatchScore(
            raw.ingredient_name,
            item.name,
            parseAliases(item.aliases),
          );
          if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
            isResaleItem = true;
          }
        }

        // SALES stays conservative: exact normalized name or exact alias only
        if (bestMatch && bestScore >= 95) {
          const recipePrice = isResaleItem
            ? null
            : ((bestMatch as LocalRecipe).price ?? null);

          return withClientKey(raw, rawIndex, {
            rawName: raw.ingredient_name,
            quantity: raw.stock_qty,
            unit: raw.unit || (isResaleItem ? "cái" : "phần"),
            confidence: raw.confidence,
            unitCost: raw.unit_cost ?? recipePrice,
            linkedIngredientId: bestMatch.id,
            linkedIngredientName: bestMatch.name,
            recipeId: isResaleItem ? null : bestMatch.id,
            isNewIngredient: false,
            ...captureExtras(raw),
            ...salesExtras(raw),
          });
        }

        return withClientKey(raw, rawIndex, {
          rawName: raw.ingredient_name,
          quantity: raw.stock_qty,
          unit: raw.unit || "phần",
          confidence: raw.confidence,
          unitCost: raw.unit_cost ?? null,
          linkedIngredientId: null,
          linkedIngredientName: raw.ingredient_name, // Fallback to AI name
          recipeId: null,
          isNewIngredient: false,
          ...captureExtras(raw),
          ...salesExtras(raw),
        });
      }

      // For IMPORT/STOCK mode, match with ingredients
      let bestMatch: LocalIngredient | null = null;
      let bestScore = 0;

      for (const ing of ingredients) {
        const aliases = parseAliases(ing.aliases);
        const score = getMatchScore(raw.ingredient_name, ing.name, aliases);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = ing;
        }
      }

      // Auto-link if score >= 80
      if (bestMatch && bestScore >= 80) {
        // STOCK review should display the staff-preferred unit, while save
        // still normalizes back to the ingredient base_unit.
        let finalQty = raw.stock_qty;
        let finalUnit =
          snapMode === "STOCK"
            ? getStockWorkingUnit(bestMatch)
            : bestMatch.base_unit;
        const aiUnit = raw.unit || finalUnit;

        if (aiUnit && aiUnit !== finalUnit) {
          const sourceUnit = normalizeUnitForConversion(aiUnit);
          const targetUnit = normalizeUnitForConversion(finalUnit);
          const sourceGroup = getUnitGroup(sourceUnit);
          const targetGroup = getUnitGroup(targetUnit);
          const canUseCountWeight =
            (sourceGroup === "COUNT" &&
              (targetGroup === "WEIGHT" || targetGroup === "VOLUME")) ||
            (targetGroup === "COUNT" &&
              (sourceGroup === "WEIGHT" || sourceGroup === "VOLUME"));
          const canAutoConvert =
            canConvert(sourceUnit, targetUnit) ||
            isCrossFamilyConversion(sourceUnit, targetUnit) ||
            canUseCountWeight;

          if (!canAutoConvert) {
            finalUnit = aiUnit;
          } else {
            const converted = convertToIngredientBase(
              raw.stock_qty,
              sourceUnit,
              targetUnit,
              bestMatch.density,
              bestMatch.unit_weight,
              bestMatch.unit_weight_unit,
            );
            if (typeof converted === "number") {
              finalQty = converted;
            } else {
              finalUnit = aiUnit;
            }
          }
        }

        return withClientKey(raw, rawIndex, {
          rawName: raw.ingredient_name,
          quantity: finalQty,
          unit: finalUnit,
          confidence: raw.confidence,
          // Priority: AI invoice price > DB unit_cost
          unitCost: raw.unit_cost ?? bestMatch.unit_cost,
          linkedIngredientId: bestMatch.id,
          linkedIngredientName: bestMatch.name,
          recipeId: null,
          isNewIngredient: false,
          ...captureExtras(raw),
        });
      }

      return withClientKey(raw, rawIndex, {
        rawName: raw.ingredient_name,
        quantity: raw.stock_qty,
        unit: raw.unit || "",
        confidence: raw.confidence,
        unitCost: raw.unit_cost ?? null, // Use AI invoice price if available
        linkedIngredientId: null,
        // IMPORTANT: Use raw.ingredient_name as fallback to prevent 'undefined' in logs
        linkedIngredientName: raw.ingredient_name,
        recipeId: null,
        isNewIngredient: false,
        ...captureExtras(raw),
      });
    });

    if (snapMode === "SALES") {
      return mapped.sort((a, b) => (a.rowIndex ?? 9999) - (b.rowIndex ?? 9999));
    }

    if (snapMode === "STOCK") {
      return mapped.sort((a, b) => {
        const aStt = a.stt != null ? Number(a.stt) : Number.NaN;
        const bStt = b.stt != null ? Number(b.stt) : Number.NaN;
        if (Number.isFinite(aStt) && Number.isFinite(bStt) && aStt !== bStt) {
          return aStt - bStt;
        }
        if ((a.sourcePage ?? 0) !== (b.sourcePage ?? 0)) {
          return (a.sourcePage ?? 0) - (b.sourcePage ?? 0);
        }
        return 0;
      });
    }

    const normalizedMapped =
      snapMode === "IMPORT"
        ? mapped.map((item) =>
            applyImportExpiryRules(item, item.linkedIngredientId),
          )
        : mapped;

    // DEDUP: Merge items that link to the same ingredient/recipe
    const dedupMap = new Map<string, AiMappedItem>();
    for (const item of normalizedMapped) {
      const key = item.linkedIngredientId || `unlinked_${item.rawName}`;
      if (dedupMap.has(key)) {
        // Merge: sum quantities, keep higher confidence
        const existing = dedupMap.get(key)!;
        existing.quantity += item.quantity;
        existing.confidence = Math.max(existing.confidence, item.confidence);
        // Sum revenue too (for SALES cross-check)
        if (item.totalRevenue != null) {
          existing.totalRevenue = (existing.totalRevenue ?? 0) + item.totalRevenue;
        }
        // Keep earliest row_index (first appearance in receipt)
        if (item.rowIndex != null && (existing.rowIndex == null || item.rowIndex < existing.rowIndex)) {
          existing.rowIndex = item.rowIndex;
        }
        // Append raw names if different
        if (!existing.rawName.includes(item.rawName)) {
          existing.rawName += ` / ${item.rawName}`;
        }
      } else {
        dedupMap.set(key, { ...item });
      }
    }

    const result = Array.from(dedupMap.values());
    return result;
  };

  const confirmDisplayedAiResult = (token: string | undefined) => {
    if (!token) return;

    requestAnimationFrame(() => {
      confirmAiResultCharge(token).catch((err) => {
        if (!isExpectedNetworkError(err)) {
          console.warn("[Capture] confirm-ai-result failed:", err);
        }
      });
    });
  };

  // Parse image with AI - Route to different functions based on snapMode
  // Multi-image support: sends array of images for sequential page parsing
  const handleParseImage = async (qualityMode: AiQualityMode = "standard") => {
    if (imageUris.length === 0) return;

    parseInterruptedByBackgroundRef.current = false;
    setPreservedFullCountIngredientIds([]);
    setActiveQualityMode(qualityMode);
    setParsing(true);
    setError(null);
    setQuotaExceeded(null);
    if (qualityMode === "standard") {
      setCanRetryHighAccuracy(false);
    }

    try {
      const parseImageUris = await ensurePersistedImageUrisForParse();

      // Step 1: Compress all images
      const imageCount = parseImageUris.length;
      setLoadingStep(`📷 Đang nén ${imageCount} ảnh...`);

      const compressedImages: string[] = [];
      const savedPaths: string[] = [];

      for (let i = 0; i < parseImageUris.length; i++) {
        setLoadingStep(`📷 Đang nén ảnh ${i + 1}/${imageCount}...`);
        const { base64, savedPath } = await compressAndSaveImage(parseImageUris[i]);
        compressedImages.push(base64);
        savedPaths.push(savedPath);
      }
      setLocalImagePaths(savedPaths);

      // Step 2: Call AI based on snapMode
      let aiResult: {
        success: boolean;
        items: any[];
        error?: string;
        canRetryHighAccuracy?: boolean;
        items_sold?: any[];
        warnings?: string[];
        raw_ocr_text?: string | null;
        used_raw_ocr_parser?: boolean;
        missing_row_numbers?: number[];
        duplicate_row_numbers?: number[];
        quota?: AiQuotaMetadata;
        quotaPreview?: AiQuotaMetadata;
        scanChargeToken?: string;
        qualityMode?: AiQualityMode;
        model?: string;
      };

      switch (snapMode) {
        case "IMPORT":
          setLoadingStep(
            qualityMode === "high_accuracy"
              ? `🤖 AI model mạnh đang đọc ${imageCount} ảnh hóa đơn...`
              : `🤖 AI đang đọc ${imageCount} ảnh hóa đơn...`,
          );
          aiResult = await parseInvoiceMultiWithAI(compressedImages, businessId || "", qualityMode);
          break;
        case "SALES":
          setLoadingStep(
            qualityMode === "high_accuracy"
              ? `🤖 AI model mạnh đang đọc ${compressedImages.length} ảnh...`
              : `🤖 Vision OCR đang đọc ${compressedImages.length} ảnh...`,
          );
          const salesRes = await parseSalesMultiWithAI(compressedImages, businessId || "", qualityMode);
          setSalesQtyMismatch(salesRes.qty_mismatch ?? null);
          setSalesRevenueMismatch(salesRes.revenue_mismatch ?? null);
          setSalesOrderSuspicious(!!salesRes.order_suspicious);
          setSalesRawOcrText(salesRes.raw_ocr_text ?? null);
          setSalesReportTotalRevenue(salesRes.total_revenue ?? null);
          aiResult = {
            success: salesRes.success,
            items: salesRes.items_sold, // Map items_sold to items for common processing
            error: salesRes.error,
            canRetryHighAccuracy: salesRes.canRetryHighAccuracy,
            quota: salesRes.quota,
            quotaPreview: salesRes.quotaPreview,
            scanChargeToken: salesRes.scanChargeToken,
            qualityMode: salesRes.qualityMode,
            model: salesRes.model,
          };
          break;
        case "STOCK":
        default:
          setLoadingStep(
            qualityMode === "high_accuracy"
              ? `🤖 AI model mạnh đang đọc ${compressedImages.length} ảnh kiểm nguyên tờ...`
              : `🤖 AI đang đọc ${compressedImages.length} ảnh kiểm nguyên tờ...`,
          );
          const stockRes = await parseHandwritingMultiWithAI(
            compressedImages,
            businessId || "",
            model,
            currentAreaType === "BAR" ? "SERVICE" : "STORAGE",
            qualityMode,
          );
          setStockRawOcrText(stockRes.raw_ocr_text ?? null);
          setStockRawDebugText(
            JSON.stringify(
              {
                source: stockRes.raw_ocr_text ? "raw_ocr_text" : "gemini_json",
                used_raw_ocr_parser: !!stockRes.used_raw_ocr_parser,
                warnings: stockRes.warnings ?? [],
                missing_row_numbers: stockRes.missing_row_numbers ?? [],
                duplicate_row_numbers: stockRes.duplicate_row_numbers ?? [],
                items: stockRes.items ?? [],
              },
              null,
              2,
            ),
          );
          setStockWarnings(
            (stockRes.warnings ?? []).filter(
              (warning) =>
                !warning.startsWith("Missing STT rows:") &&
                !warning.startsWith("Duplicate STT rows"),
            ),
          );
          setStockMissingRows(stockRes.missing_row_numbers ?? []);
          setStockDuplicateRows(stockRes.duplicate_row_numbers ?? []);
          setStockUsedRawOcrParser(!!stockRes.used_raw_ocr_parser);
          aiResult = stockRes;
          break;
      }
      setCanRetryHighAccuracy(qualityMode === "standard" && !!aiResult.canRetryHighAccuracy);

      if (!aiResult.success) {
        throw new Error(aiResult.error || "AI parse failed");
      }

      const data = { items: aiResult.items };

      // Step 3: Transform response to common format based on snapMode
      setLoadingStep("📊 Đang chuẩn hóa dữ liệu...");
      let rawItems: AiRawItem[] = [];

      if (snapMode === "STOCK") {
        // ai-parse-handwriting returns { items: StockItem[] }
        rawItems = (data.items || []).map((item: any) => ({
          ingredient_name: item.original_name || item.ingredient_name || item.name || "",
          stock_qty: item.stock_qty ?? item.quantity ?? 0,
          import_qty: item.import_qty ?? 0,
          unit: item.unit || "",
          confidence: item.confidence ?? 0.8,
          needs_review: item.needs_review || false,
          ingredient_id: item.ingredient_id,
          linkedIngredientId: item.linkedIngredientId,
          stt: item.stt,
          raw_text: item.raw_text,
          original_name: item.original_name,
          source_page: item.source_page,
          review_reason: item.review_reason,
        }));
      } else if (snapMode === "IMPORT") {
        // ai-parse-invoice returns { items: InvoiceItem[] }
        rawItems = (data.items || []).map((item: any) => {
          // Calculate post-tax unit price: total_price / quantity
          const quantity = item.quantity || item.qty || 1;
          const totalPrice = item.total_price || item.totalPrice || 0;
          const unitPriceFromTotal =
            quantity > 0 ? Math.round(totalPrice / quantity) : null;

          const finalUnitCost =
            unitPriceFromTotal || item.unit_price || item.unitPrice || null;

          return {
            ingredient_name:
              item.ingredient_name || item.name || item.item_name || "",
            stock_qty: quantity,
            import_qty: 0,
            unit: item.unit || "",
            confidence: item.confidence || 80,
            needs_review: false,
            unit_cost: finalUnitCost,
          };
        });
      } else if (snapMode === "SALES") {
        // aiResult.items already contains items_sold
        rawItems = (data.items || []).map((item: any) => {
          const quantity = item.quantity_sold || item.quantity || 0;
          const lineRevenue = item.total_revenue ?? item.totalRevenue ?? null;
          const unitPriceFromTotal =
            lineRevenue !== null && quantity > 0
              ? Math.round(Number(lineRevenue) / quantity)
              : null;

          return {
            ingredient_name:
              item.raw_name || item.menu_item_name || item.name || item.menu_item || "",
            raw_name:
              item.raw_name || item.menu_item_name || item.name || item.menu_item || "",
            stock_qty: quantity,
            import_qty: 0,
            unit: item.unit || "phần",
            confidence: item.confidence || 80,
            needs_review: false,
            recipe_id: item.recipe_id || undefined,
            matched_recipe_name: item.matched_recipe_name ?? null,
            unit_cost:
              item.unit_price ??
              item.unitPrice ??
              unitPriceFromTotal,
            // Cross-check fields from backend
            row_index: item.row_index,
            total_revenue: lineRevenue,
            expected_revenue: item.expected_revenue ?? null,
            revenue_deviation: item.revenue_deviation ?? null,
            recipe_price: item.recipe_price ?? null,
            internal_inconsistent: !!item.internal_inconsistent,
            menu_price_differs: !!item.menu_price_differs,
          };
        });
      }

      if (rawItems.length > 0) {
        const mapped = autoMapItems(rawItems);

        // AI CROSS-CHECK: Check for duplicate transfers (Per .script Section 2.3.C)
        if (snapMode === "STOCK" && currentAreaType === "BAR") {
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
        confirmDisplayedAiResult(aiResult.scanChargeToken);
      } else {
        console.warn("[Capture] No items found in response");
        setError("Không tìm thấy dữ liệu. Thử chụp lại?");
      }
    } catch (err: any) {
      if (!isExpectedNetworkError(err)) {
        console.error("[Capture] Parse error:", err);
      }
      if (err instanceof QuotaExceededError) {
        setQuotaExceeded({
          canWatchAd: err.canWatchAd,
          adRewardScans: err.adRewardScans,
          maxAdRewardsPerDay: err.maxAdRewardsPerDay,
        });
      } else {
        setError(
          formatParseErrorMessage(
            err,
            parseInterruptedByBackgroundRef.current,
          ),
        );
      }
    } finally {
      setParsing(false);
      setActiveQualityMode(null);
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
        .filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            parseAliases((item as LocalRecipe | LocalIngredient).aliases).some((alias) =>
              alias.toLowerCase().includes(query),
            ),
        )
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

  const getStockWorkingUnit = (ingredient: LocalIngredient): string =>
    ingredient.stock_check_unit || ingredient.base_unit;

  const findLinkedIngredient = (item: AiMappedItem): LocalIngredient | null => {
    if (snapMode === "SALES" || item.recipeId || !item.linkedIngredientId) {
      return null;
    }
    return ingredientById.get(item.linkedIngredientId) ?? null;
  };

  const convertLinkedItemToUnit = (
    item: AiMappedItem,
    ingredient: LocalIngredient,
    targetDisplayUnit: string,
    strict = true,
  ): AiMappedItem => {
    const sourceUnit = normalizeUnitForConversion(
      item.unit || targetDisplayUnit,
    );
    const targetUnit = normalizeUnitForConversion(targetDisplayUnit);
    let quantity = item.quantity;

    if (sourceUnit !== targetUnit) {
      const sourceGroup = getUnitGroup(sourceUnit);
      const targetGroup = getUnitGroup(targetUnit);
      const canUseCountWeight =
        (sourceGroup === "COUNT" &&
          (targetGroup === "WEIGHT" || targetGroup === "VOLUME")) ||
        (targetGroup === "COUNT" &&
          (sourceGroup === "WEIGHT" || sourceGroup === "VOLUME"));
      const canNormalize =
        canConvert(sourceUnit, targetUnit) ||
        isCrossFamilyConversion(sourceUnit, targetUnit) ||
        canUseCountWeight;

      if (!canNormalize) {
        if (!strict) return item;
        throw new Error(
          `Không thể quy đổi "${item.unit}" sang "${targetDisplayUnit}" cho "${ingredient.name}". Vui lòng sửa đơn vị trên dòng này hoặc đổi đơn vị chuẩn trong Desktop.`,
        );
      }

      const converted = convertToIngredientBase(
        item.quantity,
        sourceUnit,
        targetUnit,
        ingredient.density,
        ingredient.unit_weight,
        ingredient.unit_weight_unit,
      );

      if (converted === "NEED_DENSITY") {
        if (!strict) return item;
        throw new Error(
          `Thiếu density cho "${ingredient.name}" để quy đổi "${item.unit}" sang "${targetDisplayUnit}". Cập nhật density trên Desktop rồi sync lại.`,
        );
      }
      if (converted === "NEED_UNIT_WEIGHT") {
        if (!strict) return item;
        throw new Error(
          `Thiếu khối lượng / 1 ${ingredient.base_unit} cho "${ingredient.name}" để quy đổi "${item.unit}" sang "${targetDisplayUnit}". Cập nhật trên Desktop rồi sync lại.`,
        );
      }

      quantity = roundInventoryQuantity(converted);
    }

    return {
      ...item,
      quantity,
      unit: targetDisplayUnit,
      unitCost: item.unitCost ?? ingredient.unit_cost,
      linkedIngredientName: item.linkedIngredientName ?? ingredient.name,
    };
  };

  const applyLinkedDisplayUnit = (
    item: AiMappedItem,
    strict = false,
  ): AiMappedItem => {
    const ingredient = findLinkedIngredient(item);
    if (!ingredient?.base_unit) return item;
    const targetUnit =
      snapMode === "STOCK" ? getStockWorkingUnit(ingredient) : ingredient.base_unit;
    return convertLinkedItemToUnit(item, ingredient, targetUnit, strict);
  };

  const normalizeLinkedInventoryItem = (
    item: AiMappedItem,
    strict = true,
  ): AiMappedItem => {
    const ingredient = findLinkedIngredient(item);
    if (!ingredient?.base_unit) return item;
    return convertLinkedItemToUnit(item, ingredient, ingredient.base_unit, strict);
  };

  const learnStockCheckUnits = async (
    db: Awaited<ReturnType<typeof getDB>>,
    itemsToLearn: AiMappedItem[],
  ) => {
    if (snapMode !== "STOCK") return;
    const { addToSyncQueue } = await import("../sync/syncEngine");

    for (const item of itemsToLearn) {
      if (!item.linkedIngredientId || !item.unit.trim() || item.isNewIngredient) {
        continue;
      }

      const ing = ingredients.find((i) => i.id === item.linkedIngredientId);
      if (!ing?.base_unit) continue;

      const displayUnit = item.unit.trim();
      const nextStockCheckUnit =
        normalizeUnitForConversion(displayUnit) ===
        normalizeUnitForConversion(ing.base_unit)
          ? null
          : displayUnit;
      const currentStockCheckUnit = ing.stock_check_unit || null;

      if (currentStockCheckUnit === nextStockCheckUnit) {
        continue;
      }

      await db.runAsync(
        `UPDATE local_ingredients SET stock_check_unit = ? WHERE id = ?`,
        [nextStockCheckUnit, ing.id],
      );
      await addToSyncQueue("ingredients", "UPSERT", {
        id: ing.id,
        stock_check_unit: nextStockCheckUnit,
      });
      setIngredients((prev) =>
        prev.map((prevIng) =>
          prevIng.id === ing.id
            ? { ...prevIng, stock_check_unit: nextStockCheckUnit }
            : prevIng,
        ),
      );
    }
  };

  const ensureLocalAreaForLocation = async (
    db: Awaited<ReturnType<typeof getDB>>,
    location: "WAREHOUSE" | "BAR",
  ): Promise<string | null> => {
    const expectedType = location === "BAR" ? "SERVICE" : "STORAGE";
    if (currentAreaId) {
      const selectedArea = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM local_storage_areas
         WHERE id = ? AND type = ? AND is_active = 1`,
        [currentAreaId, expectedType],
      );
      if (selectedArea) return selectedArea.id;
    }

    const existingAreaId = await resolveLocalAreaByLocation(db, location);
    if (existingAreaId) return existingAreaId;

    // STANDARD and CHAIN require server-backed area UUIDs for branch access.
    if (isStandard) return null;

    const profile = await db.getFirstAsync<{ business_id: string | null }>(
      "SELECT business_id FROM local_profiles LIMIT 1",
    );
    const localBusinessId = profile?.business_id ?? businessId;
    if (!localBusinessId) {
      console.warn("[Capture SAVE] Missing business_id, skipped local stock update");
      return null;
    }

    const areaId = `local_${expectedType.toLowerCase()}_${localBusinessId}`;
    const name = expectedType === "SERVICE" ? "Quầy Bar" : "Kho Tổng";
    await db.runAsync(
      `INSERT OR IGNORE INTO local_storage_areas
        (id, business_id, name, type, is_default, is_active, synced)
       VALUES (?, ?, ?, ?, 1, 1, 0)`,
      [areaId, localBusinessId, name, expectedType],
    );
    return areaId;
  };

  const applyLocalInventoryMutations = async (
    db: Awaited<ReturnType<typeof getDB>>,
    mode: "STOCK" | "IMPORT" | "SALES",
    location: "WAREHOUSE" | "BAR",
    itemsForSave: AiMappedItem[],
    countedAt: string,
    areaId: string | null,
  ): Promise<void> => {
    if (mode === "SALES") return;

    const localAreaId =
      areaId ?? (await ensureLocalAreaForLocation(db, location));
    if (!localAreaId) return;

    if (mode === "STOCK") {
      for (const item of itemsForSave) {
        if (!item.linkedIngredientId || !Number.isFinite(item.quantity)) {
          continue;
        }
        await upsertStockLevel(
          db,
          item.linkedIngredientId,
          localAreaId,
          item.quantity,
          countedAt,
        );
      }
      return;
    }

    for (const item of itemsForSave) {
      if (!item.linkedIngredientId || !Number.isFinite(item.quantity)) {
        continue;
      }

      const incomingCost = Number(item.unitCost ?? 0);
      if (incomingCost > 0) {
        const current = await db.getFirstAsync<{
          warehouse_qty: number | null;
          bar_qty: number | null;
          unit_cost: number | null;
        }>(
          "SELECT warehouse_qty, bar_qty, unit_cost FROM local_ingredients WHERE id = ?",
          [item.linkedIngredientId],
        );

        if (current) {
          const oldQty =
            Number(current.warehouse_qty ?? 0) + Number(current.bar_qty ?? 0);
          const oldCost = Number(current.unit_cost ?? 0);
          const nextTotalQty = oldQty + item.quantity;
          const nextCost =
            oldQty > 0 && nextTotalQty > 0
              ? (oldQty * oldCost + item.quantity * incomingCost) / nextTotalQty
              : incomingCost;

          await db.runAsync(
            "UPDATE local_ingredients SET unit_cost = ? WHERE id = ?",
            [Math.round(nextCost * 100) / 100, item.linkedIngredientId],
          );
        }
      }

      await incrementStockLevel(
        db,
        item.linkedIngredientId,
        localAreaId,
        item.quantity,
      );
    }
  };

  // Link item to ingredient or recipe (based on snapMode)
  const linkIngredient = (
    clientKey: string,
    item: LocalIngredient | LocalRecipe,
  ) => {
    // Check if it's a recipe (for SALES mode) or ingredient
    const isRecipe = !("base_unit" in item);
    const linkedUnitCost =
      snapMode === "SALES"
        ? (prevItemUnitCost: number | null) =>
            prevItemUnitCost ?? (isRecipe ? ((item as LocalRecipe).price ?? null) : null)
        : (prevItemUnitCost: number | null) =>
            prevItemUnitCost ?? (item as LocalIngredient).unit_cost;

    setItems((prev) =>
      updateInventoryCaptureItemByKey(prev, clientKey, (prevItem) =>
        applyImportExpiryRules(
          applyLinkedDisplayUnit(
            {
              ...prevItem,
              linkedIngredientId: item.id,
              linkedIngredientName: item.name,
              recipeId: isRecipe ? item.id : null,
              unitCost: linkedUnitCost(prevItem.unitCost),
              isNewIngredient: false,
            },
            false,
          ),
          item.id,
        ),
      ),
    );
    setActiveDropdown(null);
    setSearchQuery("");
  };

  // Mark as new ingredient
  const markAsNew = (clientKey: string) => {
    setItems((prev) =>
      updateInventoryCaptureItemByKey(prev, clientKey, {
        linkedIngredientId: null,
        linkedIngredientName: null,
        recipeId: null,
        isNewIngredient: true,
        expiryDate: null,
        expirySource: null,
        shelfLifeDaysSnapshot: null,
      }),
    );
    setActiveDropdown(null);
  };

  // Update item field
  const updateItem = (clientKey: string, field: keyof AiMappedItem, value: any) => {
    setItems((prev) =>
      updateInventoryCaptureItemByKey(prev, clientKey, { [field]: value } as Partial<AiMappedItem>),
    );
  };

  const applyManualExpiryForKey = (clientKey: string, date: Date) => {
    setItems((prev) =>
      updateInventoryCaptureItemByKey(prev, clientKey, {
        expiryDate: formatDateToYyyyMmDd(date),
        expirySource: "MANUAL",
        shelfLifeDaysSnapshot: null,
      }),
    );
  };

  const openExpiryPickerForItem = (
    clientKey: string,
    currentValue: string | null | undefined,
  ) => {
    const parsed = parseYyyyMmDd(currentValue);
    setExpiryPickerValue(parsed ?? new Date());
    setExpiryPickerTargetKey(clientKey);
  };

  const handleExpiryPickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === "android") {
      if (event.type === "dismissed") {
        setExpiryPickerTargetKey(null);
        return;
      }
      if (event.type === "set" && selectedDate && expiryPickerTargetKey != null) {
        applyManualExpiryForKey(expiryPickerTargetKey, selectedDate);
      }
      setExpiryPickerTargetKey(null);
      return;
    }

    if (selectedDate) {
      setExpiryPickerValue(selectedDate);
      if (expiryPickerTargetKey != null) {
        applyManualExpiryForKey(expiryPickerTargetKey, selectedDate);
      }
    }
  };

  const isWarehouseFullCountMode = () =>
    snapMode === "STOCK" &&
    currentCheckMode === "FULL" &&
    currentAreaType === "WAREHOUSE";

  const clearExpiryPickerAfterItemRemoval = (clientKey: string) => {
    if (expiryPickerTargetKey === clientKey) {
      setExpiryPickerTargetKey(null);
    }
  };

  const removeItemByKey = (clientKey: string) => {
    clearExpiryPickerAfterItemRemoval(clientKey);
    setActiveDropdown((prev) => (prev === clientKey ? null : prev));
    setItems((prev) => removeInventoryCaptureItemByKey(prev, clientKey));
  };

  const preserveFullCountIngredient = (ingredientId: string) => {
    setPreservedFullCountIngredientIds((prev) =>
      prev.includes(ingredientId) ? prev : [...prev, ingredientId],
    );
  };

  const unpreserveFullCountIngredient = (ingredientId: string) => {
    setPreservedFullCountIngredientIds((prev) =>
      prev.filter((id) => id !== ingredientId),
    );
  };

  const setFullCountItemToZero = (clientKey: string) => {
    const item = items.find((entry) => entry.clientKey === clientKey);
    if (!item?.linkedIngredientId) {
      Alert.alert(
        "Chưa liên kết nguyên liệu",
        "Muốn set tồn kho về 0 thì cần liên kết dòng này với nguyên liệu trước.",
      );
      return;
    }

    unpreserveFullCountIngredient(item.linkedIngredientId);
    setItems((prev) =>
      updateInventoryCaptureItemByKey(prev, clientKey, { quantity: 0 }),
    );
  };

  const skipFullCountItemAndKeepStock = (clientKey: string) => {
    const item = items.find((entry) => entry.clientKey === clientKey);
    if (!item?.linkedIngredientId) {
      Alert.alert(
        "Bỏ qua dòng chưa liên kết?",
        "Dòng này chưa liên kết nên app không biết nguyên liệu nào cần giữ nguyên. Nếu đây là nguyên liệu đã có, hãy liên kết trước rồi bỏ qua.",
        [
          { text: "Quay lại", style: "cancel" },
          {
            text: "Vẫn bỏ qua dòng OCR",
            style: "destructive",
            onPress: () => removeItemByKey(clientKey),
          },
        ],
      );
      return;
    }

    preserveFullCountIngredient(item.linkedIngredientId);
    removeItemByKey(clientKey);
  };

  const deleteFullCountItemFromSheet = (clientKey: string) => {
    const item = items.find((entry) => entry.clientKey === clientKey);
    if (item?.linkedIngredientId) {
      unpreserveFullCountIngredient(item.linkedIngredientId);
    }
    removeItemByKey(clientKey);
  };

  const handleFullCountItemAction = (actionId: FullCountItemActionId) => {
    if (!fullCountActionTarget) return;

    const targetKey = fullCountActionTarget.clientKey;
    setFullCountActionTarget(null);

    if (actionId === "preserve") {
      skipFullCountItemAndKeepStock(targetKey);
      return;
    }

    if (actionId === "zero") {
      setFullCountItemToZero(targetKey);
      return;
    }

    deleteFullCountItemFromSheet(targetKey);
  };

  // Remove item
  const removeItem = (clientKey: string) => {
    if (!isWarehouseFullCountMode()) {
      removeItemByKey(clientKey);
      return;
    }

    const item = items.find((entry) => entry.clientKey === clientKey);
    setFullCountActionTarget({
      clientKey,
      title: item?.linkedIngredientName || item?.rawName || "Mục này",
    });
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
    // conf is 0-1 decimal from backend (e.g. 0.98 = 98%)
    if (conf >= 0.90) {
      return { borderColor: "#6B8E23", borderWidth: 3, text: "#6B8E23" }; // Olive Green
    }
    if (conf >= 0.85) {
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
    const matched = item.linkedIngredientId
      ? ingredientById.get(item.linkedIngredientId)
      : null;
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
  const hasMissingImportExpiry =
    snapMode === "IMPORT" &&
    items.some((item) => {
      if (!item.linkedIngredientId) return false;
      const shelfLifeDays = resolveShelfLifeDays(item.linkedIngredientId);
      if (shelfLifeDays && shelfLifeDays > 0) return false;
      return !item.expiryDate;
    });

  // Can save?
  const canSave =
    items.length > 0 &&
    unmappedCount === 0 &&
    !hasInvalidWeights &&
    !hasMissingImportExpiry;
  const hasSalesTotalMismatch =
    snapMode === "SALES" && Boolean(salesQtyMismatch || salesRevenueMismatch);
  const isRetryingHighAccuracy =
    parsing && activeQualityMode === "high_accuracy";
  const rawOcrTextForModal =
    snapMode === "STOCK" ? stockRawOcrText || stockRawDebugText : salesRawOcrText;
  const hasStockDiagnostics =
    snapMode === "STOCK" &&
    items.length > 0 &&
    (stockWarnings.length > 0 ||
      stockMissingRows.length > 0 ||
      stockDuplicateRows.length > 0 ||
      Boolean(stockRawOcrText) ||
      Boolean(stockRawDebugText));
  const isProRebaselineWarehouseCheck =
    snapMode === "STOCK" &&
    proRebaseline.required &&
    currentAreaType === "WAREHOUSE" &&
    !proRebaseline.warehouseDone;
  const isProRebaselineBarCheck =
    snapMode === "STOCK" &&
    proRebaseline.required &&
    currentAreaType === "BAR" &&
    proRebaseline.warehouseDone &&
    !proRebaseline.barDone;
  const isProRebaselineCheck =
    isProRebaselineWarehouseCheck || isProRebaselineBarCheck;

  const ensureSalesBeforeStock = async (
    scope: SalesGuardScope,
    onGoToSales: () => void,
  ): Promise<boolean> => {
    try {
      const db = await getDB();
      const result = await checkSalesPrerequisite(db, scope);
      if (result.hasSales) return true;

      Alert.alert(
        "⚠️ Cần chụp Bán hàng trước",
        "Cần chụp Bán hàng sau lần kiểm kho gần nhất để tính chênh lệch chính xác.",
        [
          { text: "Đi tới Bán hàng", style: "default", onPress: onGoToSales },
          { text: "Hủy", style: "cancel" },
        ],
      );
      return false;
    } catch (err) {
      console.error("[Capture] checkSalesPrerequisite error:", err);
      Alert.alert(
        "Lỗi",
        "Không thể kiểm tra điều kiện Bán hàng. Vui lòng thử lại.",
      );
      return false;
    }
  };

  const confirmSalesMismatchBeforeSave = (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        "Cần kiểm tra với phiếu giấy",
        "Tổng số phần hoặc doanh thu đang lệch với Z-report. Hãy đối chiếu tờ giấy đang cầm trước khi lưu.",
        [
          { text: "Quay lại kiểm tra", style: "cancel", onPress: () => resolve(false) },
          { text: "Đã kiểm tra, vẫn lưu", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });

  const formatPolicyNumber = (value: number): string =>
    value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

  const showWarehousePackViolations = (
    violations: WarehousePackViolation[],
  ): void => {
    const preview = violations
      .slice(0, 4)
      .map(
        (item) =>
          `${item.name}: ${formatPolicyNumber(
            item.packCount,
          )} hàng nguyên. Sửa về ${item.lowerPackCount} (${formatPolicyNumber(
            item.lowerBaseQty,
          )} ${item.unit || ""}) hoặc ${item.upperPackCount} (${formatPolicyNumber(
            item.upperBaseQty,
          )} ${item.unit || ""}).`,
      )
      .join("\n");

    Alert.alert(
      "Kho Tổng phải là hàng nguyên",
      `${preview}${
        violations.length > 4
          ? `\n... và ${violations.length - 4} món khác.`
          : ""
      }\n\nHãy sửa số lượng trước khi lưu.`,
    );
  };

  const confirmStockSave = (
    confirmation: StockSaveConfirmation,
  ): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        confirmation.title,
        confirmation.message,
        [
          { text: "Quay lại kiểm tra", style: "cancel", onPress: () => resolve(false) },
          { text: "Xác nhận lưu", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });

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

  const showParsingNavigationAlert = () => {
    Alert.alert(
      "Đang quét AI",
      "Ở lại màn này đến khi quét xong để tránh mất kết quả.",
      [{ text: "Đã hiểu" }],
    );
  };

  const canLeaveParseFlow = () => {
    if (!parsing) return true;
    showParsingNavigationAlert();
    return false;
  };

  const handleHeaderBack = () => {
    if (!canLeaveParseFlow()) return;
    onBack();
  };

  const handleHeaderSettings = () => {
    if (!canLeaveParseFlow()) return;
    onOpenSettings();
  };

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
        <Pressable
          onPress={handleHeaderBack}
          style={{ padding: 8, marginLeft: -8 }}
        >
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
          onPress={handleHeaderSettings}
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
          onPress={() => {
            if (!canLeaveParseFlow()) return;
            setCurrentAreaType(resolveCaptureArea(model, "import"));
            setSnapMode("IMPORT");
          }}
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
          onPress={() => {
            if (!canLeaveParseFlow()) return;
            setCurrentAreaType(resolveCaptureArea(model, "sales"));
            setSnapMode("SALES");
          }}
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
          onPress={async () => {
            if (!canLeaveParseFlow()) return;
            // When switching from SALES/IMPORT to STOCK:
            // - Renew rebaseline: force Warehouse full count first, then Bar baseline.
            // - STANDARD normal flow: require SALES before BAR stock check.
            if (snapMode !== "STOCK") {
              if (isStandard) {
                if (proRebaseline.required) {
                  if (!proRebaseline.warehouseDone) {
                    setCurrentAreaType("WAREHOUSE");
                    setCurrentCheckMode("FULL");
                  } else {
                    setCurrentAreaType("BAR");
                    setCurrentCheckMode(undefined);
                  }
                  setSnapMode("STOCK");
                  return;
                }

                const canEnterStock = await ensureSalesBeforeStock(
                  "BAR",
                  () => setSnapMode("SALES"),
                );
                if (!canEnterStock) return;

                setCurrentAreaType("BAR"); // Switch to BAR for end-of-shift check
                setCurrentCheckMode(undefined); // BAR doesn't use FULL/SPOT modes
              }
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

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        data={items}
        keyExtractor={(item) => item.clientKey}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        extraData={{
          activeDropdown,
          searchQuery,
          expiryPickerTargetKey,
          expiryPickerValue,
          snapMode,
          ingredients,
        }}
        ListHeaderComponent={
          <>
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
                setCurrentAreaType((previous) =>
                  previous === "BAR" ? "WAREHOUSE" : "BAR",
                )
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
                {currentAreaType === "BAR" ? "🍷" : "🏭"}
              </Text>
              <Text
                style={{
                  color:
                    currentAreaType !== "BAR"
                      ? "#E07A2F"
                      : "#6B8E23",
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {currentAreaType !== "BAR"
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
            onPress={() => handleParseImage()}
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

        {canRetryHighAccuracy && imageUris.length > 0 && (
          <TouchableOpacity
            onPress={() => handleParseImage("high_accuracy")}
            disabled={parsing}
            activeOpacity={0.75}
            style={[
              {
                width: "100%",
                minHeight: 52,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#E07A2F",
                backgroundColor: "#1A1A1A",
              },
              isRetryingHighAccuracy
                ? {
                    backgroundColor: "#E07A2F",
                    borderColor: "#F59E0B",
                    elevation: 2,
                  }
                : null,
              parsing && !isRetryingHighAccuracy ? { opacity: 0.55 } : null,
            ]}
          >
            {isRetryingHighAccuracy ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontWeight: "700",
                    marginLeft: 8,
                  }}
                >
                  Đang quét lại chính xác hơn...
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name="sparkles"
                  size={17}
                  color="#E07A2F"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: "#E07A2F", fontWeight: "700" }}>
                  Quét lại chính xác hơn (+1 lượt)
                </Text>
              </View>
            )}
          </TouchableOpacity>
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

        {hasStockDiagnostics && (
          <View
            style={{
              backgroundColor:
                stockMissingRows.length > 0 || stockDuplicateRows.length > 0
                  ? "rgba(239,68,68,0.12)"
                  : "#1A1A1A",
              padding: 14,
              borderRadius: 10,
              marginBottom: 12,
              borderWidth: 1,
              borderColor:
                stockMissingRows.length > 0 || stockDuplicateRows.length > 0
                  ? "#EF4444"
                  : "#2A2A2A",
            }}
          >
            <Text
              style={{
                color:
                  stockMissingRows.length > 0 || stockDuplicateRows.length > 0
                    ? "#EF4444"
                    : "#6B8E23",
                fontWeight: "700",
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              Kiểm tra OCR kiểm kho
            </Text>
            <Text style={{ color: "#B8B3A8", fontSize: 12, lineHeight: 17 }}>
              {stockUsedRawOcrParser
                ? "Đang dùng parser raw OCR khóa theo dòng/STT."
                : "Đang dùng Gemini fallback vì raw OCR chưa đủ cấu trúc."}
            </Text>
            {stockMissingRows.length > 0 && (
              <Text style={{ color: "#EF4444", fontSize: 12, marginTop: 6 }}>
                Thiếu STT: {stockMissingRows.join(", ")}
              </Text>
            )}
            {stockDuplicateRows.length > 0 && (
              <Text style={{ color: "#FBBF24", fontSize: 12, marginTop: 6 }}>
                Trùng STT do ảnh overlap: {stockDuplicateRows.join(", ")}
              </Text>
            )}
            {stockWarnings.map((warning, idx) => (
              <Text
                key={`${warning}-${idx}`}
                style={{ color: "#FBBF24", fontSize: 12, marginTop: 6 }}
              >
                {warning}
              </Text>
            ))}
            {(stockRawOcrText || stockRawDebugText) && (
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => setShowRawOcrModal(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  marginTop: 10,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#2A2A2A",
                  backgroundColor: "rgba(96,165,250,0.08)",
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    color: "#60A5FA",
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {stockRawOcrText
                    ? "Xem text gốc AI đọc được"
                    : "Xem raw JSON Gemini đã đọc"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* SALES: Banner tổng quan đối chiếu Z-report */}
        {snapMode === "SALES" && items.length > 0 && (() => {
          const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
          const totalRevenue = items.reduce(
            (sum, i) => sum + (i.totalRevenue ?? 0),
            0,
          );
          const flaggedCount = items.filter(
            (i) => (i.revenueDeviation ?? 0) > 0.02,
          ).length;
          const criticalItemCount = items.filter(
            (i) =>
              i.internalInconsistent ||
              ((i.revenueDeviation ?? 0) > 0.10 && !i.menuPriceDiffers),
          ).length;
          const fmt = (n: number) =>
            new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
          return (
            <View
              style={{
                backgroundColor: hasSalesTotalMismatch
                  ? "rgba(239,68,68,0.14)"
                  : "#1A1A1A",
                padding: 14,
                borderRadius: 10,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: hasSalesTotalMismatch ? "#EF4444" : "#2A2A2A",
              }}
            >
              <Text
                style={{
                  color: hasSalesTotalMismatch ? "#EF4444" : "#E07A2F",
                  fontWeight: "700",
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                📊 Đối chiếu với Z-report
              </Text>

              {/* Số phần */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: "#B8B3A8", fontSize: 13 }}>Số phần:</Text>
                <Text
                  style={{
                    color: salesQtyMismatch ? "#EF4444" : "#10B981",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {salesQtyMismatch
                    ? `${salesQtyMismatch.got} / ${salesQtyMismatch.expected} ❌`
                    : `${totalQty} ✅`}
                </Text>
              </View>

              {/* Doanh thu */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: "#B8B3A8", fontSize: 13 }}>
                  Doanh thu:
                </Text>
                <Text
                  style={{
                    color: salesRevenueMismatch ? "#EF4444" : "#10B981",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {salesRevenueMismatch
                    ? `${fmt(salesRevenueMismatch.got)} / ${fmt(salesRevenueMismatch.expected)} ❌`
                    : salesReportTotalRevenue
                      ? `${fmt(totalRevenue)} ✅`
                      : fmt(totalRevenue)}
                </Text>
              </View>

              {/* Cảnh báo */}
              {hasSalesTotalMismatch && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 6,
                    lineHeight: 16,
                    fontWeight: "700",
                  }}
                >
                  Cần kiểm tra với phiếu giấy trước khi lưu
                </Text>
              )}
              {salesOrderSuspicious && (
                <Text
                  style={{
                    color: "#FBBF24",
                    fontSize: 12,
                    marginTop: 6,
                    lineHeight: 16,
                  }}
                >
                  ⚠ Thứ tự có thể bị đảo — đối chiếu với ảnh gốc
                </Text>
              )}
              {flaggedCount > 0 && (
                <Text
                  style={{
                    color: "#FBBF24",
                    fontSize: 12,
                    marginTop: 6,
                    lineHeight: 16,
                  }}
                >
                  ⚠ {flaggedCount} món có giá lệch — kiểm tra ô đỏ/vàng
                </Text>
              )}
              {criticalItemCount > 0 && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 6,
                    lineHeight: 16,
                  }}
                >
                  {criticalItemCount} món có số liệu nghi ngờ — đối chiếu lại
                </Text>
              )}

              {/* View raw OCR button */}
              {salesRawOcrText && (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => setShowRawOcrModal(true)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{
                    marginTop: 10,
                    paddingVertical: 12,
                    borderTopWidth: 1,
                    borderTopColor: "#2A2A2A",
                    backgroundColor: "rgba(96,165,250,0.08)",
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      color: "#60A5FA",
                      fontSize: 13,
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    📄 Xem text gốc AI đọc được
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

          </>
        }
        renderItem={({ item }) => (
          <InventoryCaptureItemRow
            item={item}
            snapMode={snapMode}
            activeDropdown={activeDropdown}
            searchQuery={searchQuery}
            expiryPickerTargetKey={expiryPickerTargetKey}
            expiryPickerValueTime={expiryPickerValue.getTime()}
            ingredients={ingredients}
            recipes={recipes}
            warehouseFullCount={isWarehouseFullCountMode()}
            render={(item) => {
              const style = getConfidenceStyle(item.confidence, item.quantity);
              const needsMapping =
                !item.linkedIngredientId && !item.isNewIngredient;
              const salesCritical =
                snapMode === "SALES" &&
                (item.internalInconsistent ||
                  ((item.revenueDeviation ?? 0) > 0.10 &&
                    !item.menuPriceDiffers));

              return (
            <View
              style={{
                backgroundColor: "#1A1A1A",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                // Side-border pattern for AI confidence
                borderLeftWidth: salesCritical ? 5 : style.borderWidth,
                borderLeftColor: needsMapping || salesCritical ? "#E63946" : style.borderColor,
                borderWidth: salesCritical ? 1 : 0,
                borderColor: salesCritical ? "rgba(239,68,68,0.45)" : "transparent",
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
                  {snapMode === "SALES" && item.rowIndex
                    ? `#${item.rowIndex} · ${item.rawName}`
                    : snapMode === "STOCK" && item.stt
                      ? `STT ${item.stt} · ${item.rawName}`
                    : item.rawName}
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
                    {Math.round(item.confidence * 100)}%
                  </Text>
                </View>
              </View>

              {/* SALES: Doanh thu dòng + verification badges */}
              {snapMode === "SALES" && (() => {
                const fmt = (n: number | null | undefined) =>
                  n == null
                    ? "—"
                    : new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
                const aiUnitFromTotal =
                  item.totalRevenue != null && item.quantity > 0
                    ? item.totalRevenue / item.quantity
                    : null;
                const showAnything =
                  item.totalRevenue != null ||
                  item.internalInconsistent ||
                  item.menuPriceDiffers ||
                  item.recipePrice != null;
                if (!showAnything) return null;

                return (
                  <View
                    style={{
                      marginBottom: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: "#121212",
                      borderRadius: 6,
                      gap: 4,
                    }}
                  >
                    {/* Row 1: AI revenue */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                        💰 AI đọc:
                      </Text>
                      <Text
                        style={{
                          color: item.totalRevenue == null ? "#EF4444" : "#F5F3EF",
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {item.totalRevenue == null
                          ? "không đọc được"
                          : fmt(item.totalRevenue)}
                      </Text>
                    </View>

                    {/* Row 2: qty × ai unit_price (computed) */}
                    {aiUnitFromTotal != null && (
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#94A3B8", fontSize: 11 }}>
                          📐 {item.quantity} × {fmt(aiUnitFromTotal)}/phần
                        </Text>
                        {item.internalInconsistent && (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor: "#EF4444",
                            }}
                          >
                            <Text
                              style={{ color: "white", fontSize: 10, fontWeight: "700" }}
                            >
                              ❌ AI tự mâu thuẫn
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Row 3: menu price comparison */}
                    {item.recipePrice != null && item.recipePrice > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#94A3B8", fontSize: 11 }}>
                          🏷 Giá menu: {fmt(item.recipePrice)}/phần
                        </Text>
                        {item.menuPriceDiffers ? (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor: "#F97316",
                            }}
                          >
                            <Text
                              style={{ color: "white", fontSize: 10, fontWeight: "700" }}
                            >
                              ⚠ giá khác menu
                            </Text>
                          </View>
                        ) : item.revenueDeviation != null &&
                          item.revenueDeviation > 0.02 &&
                          !item.internalInconsistent ? (
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor:
                                item.revenueDeviation > 0.10 ? "#EF4444" : "#FBBF24",
                            }}
                          >
                            <Text
                              style={{ color: "white", fontSize: 10, fontWeight: "700" }}
                            >
                              lệch {Math.round(item.revenueDeviation * 100)}%
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    )}

                    {/* No recipe price → can't cross-check */}
                    {item.recipePrice == null && item.totalRevenue != null && (
                      <Text style={{ color: "#6B7280", fontSize: 10 }}>
                        ⓘ Chưa có giá menu để đối chiếu
                      </Text>
                    )}
                  </View>
                );
              })()}

              {snapMode === "STOCK" && item.reviewReason && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    lineHeight: 16,
                    marginBottom: 10,
                    fontWeight: "600",
                  }}
                >
                  Cần kiểm tra: {formatStockReviewReason(item.reviewReason)}
                </Text>
              )}

              {/* Ingredient Link (Autocomplete) */}
              <Pressable
                onPress={() =>
                  setActiveDropdown(
                    activeDropdown === item.clientKey ? null : item.clientKey,
                  )
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
              {activeDropdown === item.clientKey && (
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
                        onPress={() => linkIngredient(item.clientKey, ing)}
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
                        onPress={() => markAsNew(item.clientKey)}
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
                  <BufferedTextInput
                    value={String(item.quantity)}
                    onCommitText={(t) =>
                      updateItem(item.clientKey, "quantity", parseNumericField(t))
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
                  <BufferedTextInput
                    value={item.unit}
                    onCommitText={(t) => updateItem(item.clientKey, "unit", t)}
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
                const matched = item.linkedIngredientId
                  ? ingredientById.get(item.linkedIngredientId)
                  : null;
                const volumeFeedback = getVolumeWeightFeedback({
                  baseUnit: matched?.base_unit,
                  inputUnit: item.unit,
                  quantity: item.quantity,
                  tareWeight: matched?.tare_weight,
                  density: matched?.density,
                });

                if (volumeFeedback?.kind === "invalid") {
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

                if (volumeFeedback?.kind === "converted" && matched) {
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
                        📊 Quy đổi: {volumeFeedback.netMl.toFixed(0)}ml (trừ bình{" "}
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
                  <BufferedTextInput
                    value={item.unitCost ? String(item.unitCost) : ""}
                    onCommitText={(t) =>
                      updateItem(
                        item.clientKey,
                        "unitCost",
                        parseNumericField(t) || null,
                      )
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

              {snapMode === "IMPORT" && (
                <View style={{ marginBottom: 8 }}>
                  {(() => {
                    const shelfLifeDays = resolveShelfLifeDays(
                      item.linkedIngredientId,
                    );
                    const isAutoExpiry = !!shelfLifeDays;
                    const expiryDisplay = formatExpiryDisplay(item.expiryDate);
                    const isPickerOpen = expiryPickerTargetKey === item.clientKey;
                    return (
                      <>
                        <Text style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4 }}>
                          Hạn sử dụng
                        </Text>
                        {isAutoExpiry ? (
                          <View
                            style={{
                              backgroundColor: "#1F2937",
                              borderRadius: 8,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: "#334155",
                            }}
                          >
                            <Text style={{ color: "#94A3B8", fontSize: 14 }}>
                              {expiryDisplay}
                            </Text>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() =>
                              openExpiryPickerForItem(
                                item.clientKey,
                                item.expiryDate ?? null,
                              )
                            }
                            style={{
                              backgroundColor: "#121212",
                              borderRadius: 8,
                              padding: 10,
                              borderWidth: 1,
                              borderColor: "#2A2A2A",
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: item.expiryDate ? "white" : "#64748B",
                                fontSize: 14,
                              }}
                            >
                              {expiryDisplay}
                            </Text>
                            <Ionicons name="calendar-outline" size={16} color="#94A3B8" />
                          </Pressable>
                        )}
                        {!isAutoExpiry && isPickerOpen && (
                          <>
                            <DateTimePicker
                              value={expiryPickerValue}
                              mode="date"
                              display={Platform.OS === "ios" ? "spinner" : "default"}
                              minimumDate={new Date(2000, 0, 1)}
                              onChange={handleExpiryPickerChange}
                            />
                            {Platform.OS === "ios" && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "flex-end",
                                  gap: 8,
                                  marginTop: 6,
                                }}
                              >
                                <Pressable onPress={() => setExpiryPickerTargetKey(null)}>
                                  <Text style={{ color: "#94A3B8", fontSize: 13 }}>Đóng</Text>
                                </Pressable>
                              </View>
                            )}
                          </>
                        )}
                        <Text style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
                          {isAutoExpiry
                            ? `Tự tính từ shelf_life_days = ${shelfLifeDays} ngày`
                            : "Chọn ngày hết hạn vì nguyên liệu chưa cấu hình shelf_life_days"}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}

              {/* Remove */}
              <Pressable
                onPress={() => removeItem(item.clientKey)}
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
                  {isWarehouseFullCountMode()
                    ? "⚙ Xử lý mục này"
                    : "✕ Xóa mục này"}
                </Text>
              </Pressable>
            </View>
              );
            }}
          />
        )}

        ListFooterComponent={
          <>
            {/* Save button */}
            {items.length > 0 && (
          <Pressable
            onPress={async () => {
              if (!canSave || saveInFlightRef.current) return;

              saveInFlightRef.current = true;
              setIsSaving(true);
              console.log("[Capture SAVE] pressed", {
                snapMode,
                checkMode: currentCheckMode,
                areaType: currentAreaType,
                itemCount: items.length,
              });

              await runInventorySaveOperation(
                async () => {
                if (hasSalesTotalMismatch) {
                  const confirmed = await confirmSalesMismatchBeforeSave();
                  if (!confirmed) return;
                }

                if (snapMode === "STOCK" && proRebaseline.required) {
                  if (
                    currentAreaType === "WAREHOUSE" &&
                    !proRebaseline.warehouseDone &&
                    currentCheckMode !== "FULL"
                  ) {
                    Alert.alert(
                      "Cần kiểm toàn bộ Kho tổng",
                      "Lần khôi phục Kho Kép cần kiểm toàn bộ Kho tổng để đặt lại số chuẩn.",
                    );
                    return;
                  }

                  if (
                    currentAreaType === "BAR" &&
                    !proRebaseline.warehouseDone
                  ) {
                    Alert.alert(
                      "Cần kiểm Kho tổng trước",
                      "Sau khi mua lại PRO, hãy kiểm toàn bộ Kho tổng trước rồi mới kiểm Bar.",
                    );
                    return;
                  }
                }

                if (snapMode === "STOCK") {
                  const guardScope = getStockSalesGuardScope({
                    inventoryModel: model,
                    area: currentAreaType,
                    checkMode: currentCheckMode,
                    isProRebaselineCheck,
                  });
                  if (guardScope) {
                    console.log("[Capture SAVE] checking sales prerequisite", {
                      guardScope,
                    });
                    const canSaveStock = await ensureSalesBeforeStock(
                      guardScope,
                      () => setSnapMode("SALES"),
                    );
                    if (!canSaveStock) return;
                  }
                }

                const itemsForSave =
                  snapMode === "SALES"
                    ? items
                    : items.map((item) => normalizeLinkedInventoryItem(item));
                const displayItemsForLearning = items;
                stockUnitLearningItemsRef.current = displayItemsForLearning;
                if (snapMode === "IMPORT") {
                  setItems(itemsForSave);
                }

                if (snapMode === "STOCK") {
                  if (currentAreaType === "WAREHOUSE") {
                    const packViolations = validateWarehousePurchasePacks(
                      itemsForSave,
                      ingredients,
                    );
                    if (packViolations.length > 0) {
                      showWarehousePackViolations(packViolations);
                      return;
                    }
                  }

                  const stockConfirmed = await confirmStockSave(
                    buildStockSaveConfirmation({
                      areaType:
                        currentAreaType === "BAR" ? "BAR" : "WAREHOUSE",
                      checkMode:
                        currentAreaType === "BAR"
                          ? "BAR"
                          : currentCheckMode || "FULL",
                      items: itemsForSave,
                      ingredients,
                      preservedIngredientIds: preservedFullCountIngredientIds,
                    }),
                  );
                  if (!stockConfirmed) return;
                }

                // === VARIANCE GATEKEEPER (STOCK Mode Only) ===
                if (
                  snapMode === "STOCK" &&
                  currentCheckMode !== "SPOT" &&
                  !isProRebaselineCheck
                ) {
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

                for (const item of itemsForSave) {
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
                const liquidItems = itemsForSave.filter((item) => {
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
                        itemsForSave.find(
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
                const db = await getDB();

                // === STEP 1: AUTO-LEARN ALIASES ===
                // If user mapped AI text "sữa dalat" -> DB "Dalatmilk",
                // we should save "sữa dalat" as alias for next time.
                const { addToSyncQueue } = await import("../sync/syncEngine");

                for (const item of itemsForSave) {
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
                      const recipe =
                        snapMode === "SALES"
                          ? recipes.find((r) => r.id === item.linkedIngredientId)
                          : null;

                      if (recipe) {
                        const currentAliases = parseAliases(recipe.aliases);

                        if (
                          !currentAliases.some(
                            (alias) => alias.toLowerCase() === rawNameLower,
                          )
                        ) {
                          currentAliases.push(rawNameLower);
                          const newAliasesJson = JSON.stringify(currentAliases);

                          await db.runAsync(
                            `UPDATE local_recipes SET aliases = ? WHERE id = ?`,
                            [newAliasesJson, recipe.id],
                          );

                          await addToSyncQueue("recipes", "UPSERT", {
                            id: recipe.id,
                            aliases: currentAliases,
                          });

                          setRecipes((prev) =>
                            prev.map((rec) =>
                              rec.id === recipe.id
                                ? { ...rec, aliases: newAliasesJson }
                                : rec,
                            ),
                          );

                          console.log(
                            `[AutoLearn] Added alias "${item.rawName}" for recipe "${recipe.name}"`,
                          );
                        }
                        continue;
                      }

                      const ing = ingredients.find(
                        (i) => i.id === item.linkedIngredientId,
                      );
                      if (ing) {
                        const currentAliases = parseAliases(ing.aliases);

                        if (
                          !currentAliases.some(
                            (a) => a.toLowerCase() === rawNameLower,
                          )
                        ) {
                          currentAliases.push(rawNameLower);
                          const newAliasesJson = JSON.stringify(currentAliases);

                          await db.runAsync(
                            `UPDATE local_ingredients SET aliases = ? WHERE id = ?`,
                            [newAliasesJson, ing.id],
                          );

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
                // We must save logs in the local queue so /sync/push can apply
                // quantity_change_base and ingredient-level stock changes on the backend.

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
                try {
                  await db.execAsync(
                    "ALTER TABLE pending_sync_logs ADD COLUMN area_id TEXT",
                  );
                } catch {}

                const location =
                  currentAreaType === "BAR" ? "BAR" : "WAREHOUSE";
                const operationAreaId = await ensureLocalAreaForLocation(
                  db,
                  location,
                );
                if (isStandard && !operationAreaId) {
                  throw new Error(
                    "Chưa đồng bộ được khu vực kho. Vui lòng đồng bộ dữ liệu rồi thử lại.",
                  );
                }
                const syncAreaId = isStandard ? operationAreaId : null;
                const now = new Date().toISOString();
                const stockCheckType =
                  currentAreaType === "BAR"
                    ? "BAR"
                    : currentCheckMode || "FULL";

                // === SALES MODE: Create 1 batch log with all items ===
                if (snapMode === "SALES") {
                  const logId = Crypto.randomUUID();
                  const salesPayloadItems = itemsForSave.map((item) => {
                    const recipeId = item.recipeId ?? null;
                    const lineRevenue =
                      item.totalRevenue ?? ((item.unitCost || 0) * item.quantity);

                    return {
                      recipe_id: recipeId,
                      ingredient_id: recipeId ? null : item.linkedIngredientId,
                      ingredient_name: item.linkedIngredientName || item.rawName,
                      raw_name: item.rawName,
                      quantity: item.quantity,
                      unit: item.unit,
                      unit_cost: item.unitCost || 0,
                      row_index: item.rowIndex ?? null,
                      total_revenue: lineRevenue,
                      expected_revenue: item.expectedRevenue ?? null,
                      revenue_deviation: item.revenueDeviation ?? null,
                      recipe_price: item.recipePrice ?? null,
                      internal_inconsistent: !!item.internalInconsistent,
                      menu_price_differs: !!item.menuPriceDiffers,
                    };
                  });
                  const totalRevenue = salesPayloadItems.reduce(
                    (sum, item) => sum + (item.total_revenue || 0),
                    0,
                  );
                  const totalItems = itemsForSave.reduce(
                    (sum, i) => sum + i.quantity,
                    0,
                  );

                  await db.runAsync(
                    `INSERT INTO pending_sync_logs (
                      id, type, location, area_id,
                      ai_parsed_json, 
                      created_at, synced
                    ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                    [
                      logId,
                      "SALES",
                      location,
                      syncAreaId,
                      JSON.stringify({
                        items: salesPayloadItems,
                        total_revenue: totalRevenue,
                        total_items: totalItems,
                      }),
                      now,
                    ],
                  );
                  console.log(
                    `[SALES] Created 1 batch log with ${itemsForSave.length} items`,
                  );
                } else if (snapMode === "IMPORT") {
                  // === IMPORT MODE: Create per-item logs for stock updates ===
                  for (const item of itemsForSave) {
                    const shelfLifeDays = resolveShelfLifeDays(
                      item.linkedIngredientId,
                    );
                    const computedExpiryDate = shelfLifeDays
                      ? buildAutoExpiryDate(new Date(now), shelfLifeDays)
                      : item.expiryDate ?? null;
                    if (!shelfLifeDays && !computedExpiryDate) {
                      throw new Error(
                        `Thiếu ngày hết hạn cho "${item.linkedIngredientName || item.rawName}"`,
                      );
                    }

                    const expirySource = shelfLifeDays
                      ? "AUTO_SHELF_LIFE"
                      : "MANUAL";
                    const logId = Crypto.randomUUID();

                    console.log(
                      `[Capture SAVE] IMPORT item: rawName=${item.rawName}, linkedId=${item.linkedIngredientId}`,
                    );

                    await db.runAsync(
                      `INSERT INTO pending_sync_logs (
                        id, type, location, area_id,
                        ingredient_id, 
                        quantity_change_base, 
                        unit_cost_at_time,
                        ai_parsed_quantity,
                        final_confirmed_quantity,
                        ai_parsed_json, 
                        created_at, synced
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                      [
                        logId,
                        snapMode,
                        location,
                        syncAreaId,
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
                              expiry_date: computedExpiryDate,
                              expiry_source: expirySource,
                              shelf_life_days_snapshot: shelfLifeDays ?? null,
                            },
                          ],
                        }),
                        now,
                      ],
                    );
                  }
                } else if (snapMode === "STOCK") {
                  // === STOCK MODE: Create SINGLE batch log with ALL items ===
                  // /sync/push will parse items[] and update each ingredient
                  const logId = Crypto.randomUUID();

                  console.log(
                    `[Capture SAVE] STOCK batch: ${itemsForSave.length} items, checkMode=${currentCheckMode}, areaType=${currentAreaType}`,
                  );

                  await db.runAsync(
                    `INSERT INTO pending_sync_logs (
                      id, type, location, area_id,
                      ai_parsed_json,
                      created_at, synced
                    ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                    [
                      logId,
                      snapMode,
                      location,
                      syncAreaId,
                      JSON.stringify({
                        check_type: stockCheckType,
                        location: currentAreaType || "WAREHOUSE",
                        items: itemsForSave.map((item) => ({
                          ingredient_id: item.linkedIngredientId,
                          linkedIngredientId: item.linkedIngredientId,
                          ingredient_name:
                            item.linkedIngredientName || item.rawName,
                          rawName: item.rawName,
                          stt: item.stt ?? null,
                          raw_text: item.rawText ?? null,
                          original_name: item.originalName ?? item.rawName,
                          source_page: item.sourcePage ?? null,
                          review_reason: item.reviewReason ?? null,
                          quantity: item.quantity,
                          unit: item.unit,
                          unit_cost: item.unitCost || 0,
                        })),
                      }),
                      now,
                    ],
                  );
                }

                await applyLocalInventoryMutations(
                  db,
                  snapMode,
                  location,
                  itemsForSave,
                  now,
                  operationAreaId,
                );

                // === STEP 3: SPECIAL HANDLING FOR FULL_COUNT ===
                if (
                  snapMode === "STOCK" &&
                  currentCheckMode === "FULL" &&
                  currentAreaType === "WAREHOUSE"
                ) {
                  const countedIds = itemsForSave
                    .map((i) => i.linkedIngredientId)
                    .filter((id): id is string => !!id);
                  const resetProtectedIds = Array.from(
                    new Set([
                      ...countedIds,
                      ...preservedFullCountIngredientIds,
                    ]),
                  );

                  await InventoryService.resetUncountedWarehouseStock(
                    resetProtectedIds,
                  );

                  // Also need to create logs for these zeroed items?
                  // Ideally, the sync engine should handle discrepancy.
                  // But for now, local DB is updated.
                }

                if (isProRebaselineCheck && snapMode === "STOCK") {
                  if (currentAreaType === "WAREHOUSE") {
                    await markProRebaselineWarehouseDone(db);
                  } else if (currentAreaType === "BAR") {
                    await markProRebaselineBarDone(db);
                  }
                }

                await learnStockCheckUnits(db, displayItemsForLearning);

                // Add success log
                console.log(`[Capture] Saved ${itemsForSave.length} logs for sync`);

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
              },
              async (err) => {
                console.error("Save failed:", err);
                await Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error,
                );
                Alert.alert(
                  "Lỗi",
                  err instanceof Error ? err.message : "Không thể lưu dữ liệu",
                );
              },
              () => {
                saveInFlightRef.current = false;
                setIsSaving(false);
              },
            );
            }}
            disabled={!canSave || isSaving}
            style={{
              backgroundColor: canSave && !isSaving ? "#E07A2F" : "#334155",
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
              marginTop: 16,
              marginBottom: 100,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              {isSaving
                ? "Đang lưu..."
                : canSave
                  ? "✓ Xác nhận & Lưu"
                  : hasMissingImportExpiry
                    ? "⚠️ Nhập ngày hết hạn"
                    : "⚠️ Chọn nguyên liệu"}
            </Text>
          </Pressable>
            )}
          </>
        }
      />

      <Modal
        visible={!!fullCountActionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setFullCountActionTarget(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.72)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#1A1A1A",
              borderRadius: 12,
              padding: 18,
              borderWidth: 1,
              borderColor: "#2A2A2A",
            }}
          >
            <Text
              style={{ color: "#F5F3EF", fontSize: 18, fontWeight: "700" }}
            >
              Xử lý mục kiểm kho
            </Text>
            <Text
              style={{
                color: "#B8B3A8",
                fontSize: 13,
                marginTop: 8,
                marginBottom: 14,
                lineHeight: 18,
              }}
            >
              "{fullCountActionTarget?.title}" nên xử lý thế nào?
            </Text>

            {fullCountItemActions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => handleFullCountItemAction(action.id)}
                style={{
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#2A2A2A",
                }}
              >
                <Text
                  style={{
                    color: action.destructive ? "#EF4444" : "#10B981",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {action.label}
                </Text>
                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 12,
                    marginTop: 3,
                    lineHeight: 16,
                  }}
                >
                  {action.description}
                </Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setFullCountActionTarget(null)}
              style={{
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: "#2A2A2A",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#94A3B8", fontWeight: "700" }}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Raw OCR Modal — show full text AI đã đọc để user verify */}
      <Modal
        visible={showRawOcrModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowRawOcrModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#121212" }}>
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
            <Text
              style={{ color: "#F5F3EF", fontSize: 16, fontWeight: "700" }}
            >
              {snapMode === "STOCK" && !stockRawOcrText
                ? "📄 Raw JSON Gemini đã đọc"
                : "📄 Text gốc AI đọc được"}
            </Text>
            <Pressable
              onPress={() => setShowRawOcrModal(false)}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={26} color="#F5F3EF" />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text
              style={{
                color: "#B8B3A8",
                fontSize: 12,
                marginBottom: 8,
                lineHeight: 18,
              }}
            >
              Đối chiếu nội dung dưới đây với danh sách AI đã structure để
              kiểm tra nhanh các sai lệch.
            </Text>
            <View
              style={{
                backgroundColor: "#1A1A1A",
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#2A2A2A",
              }}
            >
              <Text
                style={{
                  color: "#F5F3EF",
                  fontSize: 12,
                  fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                  lineHeight: 18,
                }}
                selectable
              >
                {rawOcrTextForModal || "(Không có raw OCR text)"}
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Variance Modal - >15% Loss */}
      <VarianceModal
        visible={showVarianceModal}
        items={varianceItems}
        onSubmit={async (reason: VarianceReason, note?: string) => {
          setShowVarianceModal(false);
          // Save as BATCH log - /sync/push will parse items[] and update each ingredient
          try {
            const db = await getDB();
            const logId = Crypto.randomUUID();
            const now = new Date().toISOString();
            const location = currentAreaType === "BAR" ? "BAR" : "WAREHOUSE";
            const operationAreaId = await ensureLocalAreaForLocation(
              db,
              location,
            );
            if (isStandard && !operationAreaId) {
              throw new Error(
                "Chưa đồng bộ được khu vực kho. Vui lòng đồng bộ dữ liệu rồi thử lại.",
              );
            }
            const syncAreaId = isStandard ? operationAreaId : null;
            const stockCheckType =
              currentAreaType === "BAR" ? "BAR" : currentCheckMode || "FULL";
            const itemsForSave = items.map((item) =>
              normalizeLinkedInventoryItem(item),
            );
            const displayItemsForLearning =
              stockUnitLearningItemsRef.current.length > 0
                ? stockUnitLearningItemsRef.current
                : items;

            // Create single batch log with all items
            await db.runAsync(
              `INSERT INTO pending_sync_logs (
                id, type, location, area_id,
                ai_parsed_json,
                created_at, synced
              ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [
                logId,
                snapMode,
                location,
                syncAreaId,
                JSON.stringify({
                  check_type: stockCheckType,
                  location: currentAreaType || "WAREHOUSE",
                  variance_reason: reason,
                  variance_note: note,
                  is_flagged: isFlagged,
                  items: itemsForSave.map((item) => ({
                    ingredient_id: item.linkedIngredientId,
                    linkedIngredientId: item.linkedIngredientId,
                    ingredient_name: item.linkedIngredientName || item.rawName,
                    rawName: item.rawName,
                    stt: item.stt ?? null,
                    raw_text: item.rawText ?? null,
                    original_name: item.originalName ?? item.rawName,
                    source_page: item.sourcePage ?? null,
                    review_reason: item.reviewReason ?? null,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_cost: item.unitCost || 0,
                  })),
                }),
                now,
              ],
            );

            await applyLocalInventoryMutations(
              db,
              "STOCK",
              location,
              itemsForSave,
              now,
              operationAreaId,
            );
            await learnStockCheckUnits(db, displayItemsForLearning);

            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            Alert.alert("Đã lưu", "Phiếu kiểm kê đã lưu với giải trình.");
            syncPendingLogs(db).then(() => {
              console.log("⚡ Auto-sync triggered after variance save");
            });
            onBack();
          } catch (err) {
            console.error("Save failed:", err);
            Alert.alert(
              "Lỗi",
              err instanceof Error ? err.message : "Không thể lưu dữ liệu",
            );
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
        onCapture={async (uri) => {
          setShowSalesCamera(false);
          await appendPersistedImages([uri], "capture_sales");
        }}
        onClose={() => setShowSalesCamera(false)}
        totalPhotos={imageUris.length}
      />

      <QuotaModal
        visible={!!quotaExceeded}
        canWatchAd={quotaExceeded?.canWatchAd ?? false}
        adRewardScans={quotaExceeded?.adRewardScans ?? 0}
        maxAdRewardsPerDay={quotaExceeded?.maxAdRewardsPerDay ?? 0}
        onClose={() => setQuotaExceeded(null)}
        onRewardGranted={() => setQuotaExceeded(null)}
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
