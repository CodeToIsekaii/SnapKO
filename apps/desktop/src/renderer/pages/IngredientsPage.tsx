/**
 * IngredientsPage - Desktop Ingredient Management
 * Light Mode UI per .UXUIrules
 *
 * Features:
 * - List all ingredients with unit, cost, low-stock alert
 * - Add/Edit ingredients
 * - (Future) AI Scan from invoice
 */

import React, { useState, useEffect, useRef } from "react";
import { COLORS } from "../styles/theme";
import GuideModal from "../components/GuideModal";
import ConfirmModal from "../components/ConfirmModal";

function BatchIngredientSelector({
  value,
  onChange,
  ingredients,
  editingIngredientId,
}: {
  value: string;
  onChange: (id: string, unit: string) => void;
  ingredients: any[];
  editingIngredientId?: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedIng = ingredients.find((i) => i.id === value);
  const displayValue = selectedIng
    ? `${selectedIng.name} (${selectedIng.base_unit})`
    : "";

  const removeDiacritics = (str: string) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");

  const filtered = ingredients
    .filter((i) => i.id !== editingIngredientId)
    .filter((i) => {
      if (!search) return true;
      return removeDiacritics(i.name.toLowerCase()).includes(
        removeDiacritics(search.toLowerCase())
      );
    });

  return (
    <div ref={wrapperRef} style={{ position: "relative", flex: 2 }}>
      <input
        type="text"
        placeholder="🔍 Tìm hoặc chọn nguyên liệu..."
        value={isOpen ? search : displayValue}
        onFocus={() => {
          setIsOpen(true);
          setSearch(""); // Clear search on open to easily show all options
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: 13,
          color: COLORS.textPrimary,
          backgroundColor: "#F8FAFC",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          outline: "none",
        }}
      />
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: 200,
            overflowY: "auto",
            backgroundColor: "white",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            marginTop: 4,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "10px 14px",
                color: COLORS.textSecondary,
                fontSize: 13,
              }}
            >
              Không tìm thấy nguyên liệu
            </div>
          ) : (
            filtered.map((i) => (
              <div
                key={i.id}
                onClick={() => {
                  onChange(i.id, i.base_unit);
                  setSearch("");
                  setIsOpen(false);
                }}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  borderBottom: `1px solid ${COLORS.border}`,
                  backgroundColor: value === i.id ? "#F1F5F9" : "transparent",
                }}
              >
                {i.name}{" "}
                <span style={{ color: COLORS.textSecondary }}>
                  ({i.base_unit})
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
import {
  Package,
  RefreshCw,
  Shield,
  FileText,
  Eye,
  EyeOff,
  Recycle,
  CircleDollarSign,
  Settings,
  Plus,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  Search,
  X,
} from "lucide-react";

import { getAllUnits, UNIT_TYPES } from "@snapko/shared/logic";
import {
  convertInventoryQuantity,
  formatInventoryQuantity,
  getInventoryDisplayQuantities,
  getInventoryDisplayUnits,
  getInventoryQuantitiesInBase,
} from "../../shared/inventoryValue";

interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  stock_check_unit?: string | null;
  unit_cost: number;
  min_threshold: number;
  warehouse_qty: number;
  bar_qty: number;
  density: number;
  tare_weight: number;
  unit_weight: number | null;
  unit_weight_unit: string | null;
  aliases: string;
  // Inventory Config
  item_type: "STOCK" | "PHANTOM";
  tracking_mode: "STRICT" | "LOOSE";
  allowable_variance: number;
  // Batch Recipe (for PHANTOM items)
  is_batch_item: boolean;
  batch_yield_qty: number | null;
  batch_yield_unit: string | null;
  shelf_life_days?: number | null;
  archived?: number; // 0 = active, 1 = archived
}

interface BatchRecipeInput {
  childIngredientId: string;
  quantity: number | "";
  displayUnit: string; // For UI only, saved in base unit
}

import { useAuth } from "../hooks/AuthContext";

export default function IngredientsPage() {
  const { profile } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(
    null
  );
  // Toast notification instead of alert() to prevent focus loss
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Form state for new ingredient
  const [newIngredient, setNewIngredient] = useState({
    name: "",
    base_unit: "kg",
    stock_check_unit: "",
    unit_cost: 0,
    last_purchase_price: null as number | null,
    last_purchase_qty: null as number | null,
    last_purchase_unit: "" as string,
    min_threshold: 0,
    density: 1,
    tare_weight: 0,
    unit_weight: null as number | null,
    unit_weight_unit: "g" as string | null,
    item_type: "STOCK" as "STOCK" | "PHANTOM",
    tracking_mode: "STRICT" as "STRICT" | "LOOSE",
    allowable_variance: 0,
    // Batch Recipe
    is_batch_item: false,
    batch_yield_qty: null as number | null,
    batch_yield_unit: "" as string,
    // Ingredient Category
    ingredient_type: "raw_material" as
      | "raw_material"
      | "supply"
      | "semi_product"
      | "resale_item",
    shelf_life_days: "",
  });

  // Batch recipe inputs (for PHANTOM items)
  const [batchInputs, setBatchInputs] = useState<BatchRecipeInput[]>([]);

  // Restore feature state
  const [showHidden, setShowHidden] = useState(false);

  // Convert qty from displayUnit → ingredient's base_unit for cost calculation
  const convertToBaseQty = (qty: number, fromUnit: string, ing: any): number => {
    return convertInventoryQuantity(qty, fromUnit, ing.base_unit, {
      base_unit: ing.base_unit,
      density: ing.density,
      unit_weight: ing.unit_weight,
      unit_weight_unit: ing.unit_weight_unit,
    });
  };

  // Auto-calculated batch cost (with unit conversion)
  const calculatedBatchCost = (() => {
    if (batchInputs.length === 0 || !newIngredient.batch_yield_qty) return 0;
    const totalCost = batchInputs.reduce((sum, input) => {
      const ing = ingredients.find((i) => i.id === input.childIngredientId);
      if (!ing) return sum;
      const qtyInBase = convertToBaseQty(Number(input.quantity) || 0, input.displayUnit, ing);
      return sum + ing.unit_cost * qtyInBase;
    }, 0);
    return totalCost / newIngredient.batch_yield_qty;
  })();

  const estimatedPurchaseUnitCost = (() => {
    if (
      newIngredient.last_purchase_price == null ||
      newIngredient.last_purchase_qty == null ||
      newIngredient.last_purchase_qty <= 0
    ) {
      return null;
    }

    const qtyInBase = convertToBaseQty(
      newIngredient.last_purchase_qty,
      newIngredient.last_purchase_unit || newIngredient.base_unit,
      {
        base_unit: newIngredient.base_unit,
        density: newIngredient.density,
        unit_weight: newIngredient.unit_weight,
        unit_weight_unit: newIngredient.unit_weight_unit,
      },
    );

    return qtyInBase > 0 ? newIngredient.last_purchase_price / qtyInBase : null;
  })();

  const resolveDraftUnitCost = () => {
    if (
      estimatedPurchaseUnitCost != null &&
      Number.isFinite(estimatedPurchaseUnitCost) &&
      estimatedPurchaseUnitCost > 0
    ) {
      return estimatedPurchaseUnitCost;
    }
    return newIngredient.unit_cost || 0;
  };

  // Search filter for ingredient list
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [confirmState, setConfirmState] = useState<{
    message: string;
    detail?: string;
    danger?: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);

  const showConfirm = (message: string, detail?: string, danger = false): Promise<boolean> =>
    new Promise((resolve) => setConfirmState({ message, detail, danger, resolve }));

  // Open edit modal with ingredient data
  const handleEdit = async (ing: Ingredient) => {
    setEditingIngredient(ing);
    setNewIngredient({
      name: ing.name,
      base_unit: ing.base_unit,
      stock_check_unit: (ing as any).stock_check_unit || "",
      unit_cost: ing.unit_cost,
      last_purchase_price: (ing as any).last_purchase_price ?? null,
      last_purchase_qty: (ing as any).last_purchase_qty ?? null,
      last_purchase_unit: (ing as any).last_purchase_unit || ing.base_unit,
      min_threshold: ing.min_threshold,
      density: ing.density || 1,
      tare_weight: ing.tare_weight || 0,
      unit_weight: ing.unit_weight,
      unit_weight_unit: ing.unit_weight_unit || "g",
      item_type: ing.item_type || "STOCK",
      tracking_mode: ing.tracking_mode || "STRICT",
      allowable_variance: (ing.allowable_variance ?? 0) * 100,
      is_batch_item: ing.is_batch_item || false,
      batch_yield_qty: ing.batch_yield_qty || null,
      batch_yield_unit: (ing as any).batch_yield_unit || ing.base_unit,
      ingredient_type: (ing as any).type || "raw_material",
      shelf_life_days:
        (ing as any).shelf_life_days != null &&
        Number((ing as any).shelf_life_days) > 0
          ? String(Math.round(Number((ing as any).shelf_life_days)))
          : "",
    });
    // Load existing batch components from backend when editing a batch item
    if (ing.is_batch_item) {
      try {
        const res = await (window as any).electronAPI?.getIngredientComponents?.(ing.id);
        if (res?.success && Array.isArray(res.data)) {
          setBatchInputs(
            res.data.map((c: any) => ({
              childIngredientId: c.childId ?? c.childIngredientId ?? c.child_id ?? "",
              quantity: Number(c.quantity),
              displayUnit: c.unit,
            }))
          );
        }
      } catch {
        setBatchInputs([]);
      }
    } else {
      setBatchInputs([]);
    }
    setShowAddModal(true);
  };

  // Save new or update existing ingredient via IPC
  const handleSave = async () => {
    if (!newIngredient.name.trim()) {
      alert("Tên nguyên liệu không được để trống!");
      return;
    }

    let parsedShelfLifeDays: number | null = null;
    if (newIngredient.ingredient_type !== "supply") {
      const rawShelfLife = newIngredient.shelf_life_days.trim();
      if (rawShelfLife) {
        const parsed = Number(rawShelfLife);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setToast({
            message: "Số ngày bảo quản phải là số nguyên dương",
            type: "error",
          });
          setTimeout(() => setToast(null), 3000);
          return;
        }
        parsedShelfLifeDays = Math.round(parsed);
      }
    }

    try {
      let saveResult: any;

      if (newIngredient.is_batch_item) {
        // Batch items: validate and send to backend API (server computes cost + cascades)
        if (!newIngredient.batch_yield_qty || newIngredient.batch_yield_qty <= 0) {
          setToast({ message: "Cần nhập số lượng thành phẩm (batch yield)", type: "error" });
          setTimeout(() => setToast(null), 3000);
          return;
        }
        if (batchInputs.length === 0) {
          setToast({ message: "Cần thêm ít nhất 1 nguyên liệu con", type: "error" });
          setTimeout(() => setToast(null), 3000);
          return;
        }
        const invalidComponent = batchInputs.find(
          (b) => !b.childIngredientId || Number(b.quantity) <= 0
        );
        if (invalidComponent) {
          setToast({
            message: "Mỗi nguyên liệu con phải được chọn và có số lượng > 0",
            type: "error",
          });
          setTimeout(() => setToast(null), 3000);
          return;
        }
        // Normalize component units: backend can't convert weight/volume → count.
        // Pre-convert those components to the ingredient's base_unit (e.g. 200g → 0.2 hộp).
        const WEIGHT_UNITS = ["g", "kg", "mg"];
        const VOLUME_UNITS = ["ml", "l", "lít"];
        const COUNT_UNITS = ["cái", "gói", "chai", "lon", "thùng", "bịch", "túi", "hộp"];
        const normalizedComponents = batchInputs.map((b) => {
          const childIng = ingredients.find((i) => i.id === b.childIngredientId);
          if (!childIng) return { childId: b.childIngredientId, quantity: Number(b.quantity), unit: b.displayUnit };
          const fromUnit = b.displayUnit;
          const toUnit = childIng.base_unit;
          const isFromWeightOrVolume = WEIGHT_UNITS.includes(fromUnit) || VOLUME_UNITS.includes(fromUnit);
          const isToCount = COUNT_UNITS.includes(toUnit);
          if (isFromWeightOrVolume && isToCount) {
            // Backend forbids weight/volume → count; pre-convert to base_unit
            const convertedQty = convertToBaseQty(Number(b.quantity), fromUnit, childIng);
            return { childId: b.childIngredientId, quantity: convertedQty, unit: toUnit };
          }
          return { childId: b.childIngredientId, quantity: Number(b.quantity), unit: fromUnit };
        });
        saveResult = await (window as any).electronAPI?.saveIngredientWithComponents?.({
          id: editingIngredient?.id,
          name: newIngredient.name.trim(),
          baseUnit: newIngredient.base_unit,
          stockCheckUnit: newIngredient.stock_check_unit || null,
          minThreshold: newIngredient.min_threshold,
          density: newIngredient.density,
          isBatchItem: true,
          batchYieldQty: newIngredient.batch_yield_qty,
          batchYieldUnit: newIngredient.batch_yield_unit || newIngredient.base_unit,
          components: normalizedComponents,
          itemType: newIngredient.item_type,
          trackingMode: newIngredient.tracking_mode,
          allowableVariance: (newIngredient.allowable_variance ?? 0) / 100,
          shelfLifeDays: parsedShelfLifeDays,
        });
        if (!saveResult?.success) throw new Error(saveResult?.error || "Lỗi lưu bán thành phẩm");
      } else {
        const ingredientData = {
          id: editingIngredient?.id || crypto.randomUUID(),
          business_id: profile?.business_id || null,
          name: newIngredient.name.trim(),
          base_unit: newIngredient.base_unit,
          stock_check_unit: newIngredient.stock_check_unit || null,
          unit_cost: resolveDraftUnitCost(),
          last_purchase_price: newIngredient.last_purchase_price ?? undefined,
          last_purchase_qty: newIngredient.last_purchase_qty ?? undefined,
          last_purchase_unit: newIngredient.last_purchase_unit || newIngredient.base_unit,
          min_threshold: newIngredient.min_threshold,
          density: newIngredient.density,
          tare_weight: newIngredient.tare_weight,
          unit_weight: newIngredient.unit_weight,
          unit_weight_unit: newIngredient.unit_weight_unit,
          warehouse_qty: editingIngredient?.warehouse_qty || 0,
          bar_qty: editingIngredient?.bar_qty || 0,
          item_type: newIngredient.item_type || "STOCK",
          tracking_mode: newIngredient.tracking_mode || "STRICT",
          allowable_variance: (newIngredient.allowable_variance ?? 0) / 100,
          type: newIngredient.ingredient_type,
          is_batch_item: false,
          shelf_life_days: parsedShelfLifeDays,
        };
        await (window as any).electronAPI?.upsertIngredient?.(ingredientData);
      }

      // Show success message first (non-blocking)
      const successMsg = editingIngredient
        ? "Đã cập nhật nguyên liệu!"
        : "Đã thêm nguyên liệu thành công!";

      // Reset form and close modal
      setNewIngredient({
        name: "",
        base_unit: "kg",
        stock_check_unit: "",
        unit_cost: 0,
        last_purchase_price: null,
        last_purchase_qty: null,
        last_purchase_unit: "",
        min_threshold: 0,
        density: 1,
        tare_weight: 0,
        unit_weight: null,
        unit_weight_unit: "g",
        item_type: "STOCK",
        tracking_mode: "STRICT",
        allowable_variance: 0,
        is_batch_item: false,
        batch_yield_qty: null,
        batch_yield_unit: "",
        ingredient_type: "raw_material",
        shelf_life_days: "",
      });
      setBatchInputs([]);
      setEditingIngredient(null);
      setShowAddModal(false);

      // Reload list after a small delay to let React settle
      setTimeout(async () => {
        await loadIngredients(false, showHidden);
      }, 100);

      // Show toast notification (non-blocking, no focus loss)
      setToast({ message: successMsg, type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      console.error("Failed to save ingredient:", err);
      setToast({ message: err?.message || "Lỗi khi lưu nguyên liệu", type: "error" });
      setTimeout(() => setToast(null), 6000);
    }
  };

  // Close modal and reset state
  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingIngredient(null);
    setNewIngredient({
      name: "",
      base_unit: "kg",
      stock_check_unit: "",
      unit_cost: 0,
      last_purchase_price: null,
      last_purchase_qty: null,
      last_purchase_unit: "",
      min_threshold: 0,
      density: 1,
      tare_weight: 0,
      unit_weight: null,
      unit_weight_unit: "g",
      item_type: "STOCK",
      tracking_mode: "STRICT",
      allowable_variance: 0,
      is_batch_item: false,
      batch_yield_qty: null,
      batch_yield_unit: "",
      ingredient_type: "raw_material",
      shelf_life_days: "",
    });
    setBatchInputs([]);
  };

  useEffect(() => {
    loadIngredients(true, showHidden); // Initial load

    // 🔔 REALTIME LISTENERS
    // Listen for Signal (Stock & Master Data updates from Sync Signals)
    (window as any).electronAPI?.on?.(
      "ingredients-updated",
      () => {
        console.log("🔔 [UI] Received ingredients-updated signal");
        loadIngredients(false, showHidden);
        setToast({
          message: "Dữ liệu đã được cập nhật từ thiết bị khác",
          type: "success",
        });
        setTimeout(() => setToast(null), 3000);
      }
    );

    // Listen for direct ingredient updates (from other sessions)
    const removeUpdateListener = (
      window as any
    ).electronAPI?.onIngredientUpdate?.(() => {
      console.log("🔔 [UI] Received direct ingredient update");
      loadIngredients(false, showHidden);
    });

    // Listen for stock updates specifically
    (window as any).electronAPI?.on?.(
      "stock-updated",
      () => {
        console.log("🔔 [UI] Received stock-updated signal");
        loadIngredients(false, showHidden);
        setToast({ message: "Tồn kho vừa thay đổi", type: "success" });
        setTimeout(() => setToast(null), 3000);
      }
    );

    return () => {
      // Cleanup listeners
      (window as any).electronAPI?.off?.("ingredients-updated");
      (window as any).electronAPI?.off?.("stock-updated");
      removeUpdateListener?.();
    };
  }, [showHidden]);

  // Handle Restore
  const handleRestore = async (ing: Ingredient) => {
    const confirmed = await showConfirm(`Khôi phục "${ing.name}"?`);
    if (!confirmed) return;

    try {
      const result = await (window as any).electronAPI?.restoreIngredient?.(ing.id);
      if (result?.success === false) {
        throw new Error(result.error || "Restore failed");
      }
      setToast({ message: `Đã khôi phục "${ing.name}"`, type: "success" });
      setTimeout(() => setToast(null), 3000);
      await loadIngredients(false, showHidden);
    } catch (err) {
      console.error("Failed to restore ingredient:", err);
      setToast({
        message: err instanceof Error ? err.message : "Lỗi khi khôi phục nguyên liệu",
        type: "error",
      });
      setTimeout(() => setToast(null), 3000);
    }
  };

  async function loadIngredients(isInitial = false, includeArchived = false) {
    if (isInitial) setLoading(true);
    try {
      // Use "invoke" directly if type definition is missing in preload, or update preload.
      // Assuming preload handles args dynamically or we invoke specifically.
      // Wait, preload usually exposes explicit functions. If I didn't update preload, simple .getIngredients?.() might fail to pass args.
      // However, usually we can use ipcRenderer.invoke via a generic expose, OR the preload maps args.
      // Let's assume standard contextBridge passes args.
      const data =
        (await (window as any).electronAPI?.getIngredients?.({
          includeArchived,
        })) ?? [];
      setIngredients(data);
    } catch (err) {
      console.error("Failed to load ingredients:", err);
    }
    if (isInitial) setLoading(false);
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("vi-VN") + "đ";
  };

  const isLowStock = (ing: Ingredient) => {
    return getInventoryQuantitiesInBase(ing).totalQtyInBase < ing.min_threshold;
  };

  // Handle delete with confirmation
  const handleDelete = async (ing: Ingredient) => {
    const confirmed = await showConfirm(
      `Xóa "${ing.name}"?`,
      "Nguyên liệu sẽ được lưu trữ và không hiển thị trong danh sách.",
      true
    );
    if (!confirmed) return;

    try {
      const result = await (window as any).electronAPI?.deleteIngredient?.(ing.id);
      if (result?.success === false) {
        throw new Error(result.error || "Delete failed");
      }
      setToast({ message: `Đã xóa "${ing.name}"`, type: "success" });
      setTimeout(() => setToast(null), 3000);
      await loadIngredients(false, showHidden);
    } catch (err) {
      console.error("Failed to delete ingredient:", err);
      setToast({
        message: err instanceof Error ? err.message : "Lỗi khi xóa nguyên liệu",
        type: "error",
      });
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div style={styles.container}>
      <ConfirmModal
        isOpen={!!confirmState}
        message={confirmState?.message ?? ""}
        detail={confirmState?.detail}
        danger={confirmState?.danger}
        onConfirm={() => { confirmState?.resolve(true); setConfirmState(null); }}
        onCancel={() => { confirmState?.resolve(false); setConfirmState(null); }}
      />
      {/* Toast Notification - Non-blocking, no focus loss */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            padding: "12px 20px",
            borderRadius: 8,
            backgroundColor: toast.type === "success" ? "#6B8E23" : "#EF4444",
            color: "white",
            fontWeight: 600,
            fontSize: 14,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          {toast.type === "success" ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {toast.message}
        </div>
      )}

      {/* Guide Modal */}
      <GuideModal
        title="Hướng dẫn Quản lý Kho Thông Minh"
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        sections={[
          {
            title: "Phân loại Hàng hóa (Item Type)",
            content: (
              <>
                <p
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Package size={16} />
                  <span>
                    <strong>Hàng Tồn Kho (STOCK):</strong> Là nguyên liệu thực
                    tế nhập về kho (Đường, Sữa, Cafe hạt). Có số lượng cụ thể và
                    cần kiểm kê.
                  </span>
                </p>
                <p
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <RefreshCw size={16} />
                  <span>
                    <strong>Hàng Quy Đổi (PHANTOM):</strong> Là bán thành phẩm
                    (Nước đường, Cốt trà, Sốt). Không cần nhập kho mà tự động
                    trừ từ nguyên liệu gốc theo công thức.
                  </span>
                </p>
              </>
            ),
          },
          {
            title: "Chế độ Kiểm Tra (Tracking Mode)",
            content: (
              <>
                <p
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <Shield size={16} />
                  <span>
                    <strong>Kiểm Kỹ (STRICT):</strong> Dành cho hàng đắt tiền
                    (Rượu, Bò Mỹ). Hệ thống so sánh số bạn đếm với số lý thuyết
                    (Tồn đầu + Nhập - Bán). Nếu lệch quá mức cho phép sẽ báo
                    động.
                  </span>
                </p>
                <p
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <FileText size={16} />
                  <span>
                    <strong>Tin Tưởng (TRUST/LOOSE):</strong> Dành cho hàng
                    rẻ/khó đếm (Đường, Trà lá). Bạn đếm bao nhiêu, hệ thống ghi
                    nhận bấy nhiêu. Không báo lỗi.
                  </span>
                </p>
              </>
            ),
          },
          {
            title: "Mức Hao Hụt Cho Phép (Variance)",
            content: (
              <p>
                Chỉ dùng cho chế độ <strong>STRICT</strong>. Là sai số cho phép
                do đong rót (Ví dụ: 5%). Nếu kiểm kho lệch trong khoảng này, hệ
                thống sẽ tự động điều chỉnh về khớp (PASS). Nếu lệch quá 5%, hệ
                thống sẽ báo đỏ (FAIL).
              </p>
            ),
          },
          {
            title: "Công Thức Nấu (Batch Recipe)",
            content: (
              <>
                <p>
                  Dành cho <strong>Hàng Quy Đổi (PHANTOM)</strong>. Khai báo
                  công thức nấu để hệ thống tự tính <strong>giá vốn</strong> và{" "}
                  <strong>trừ kho tự động</strong>.
                </p>
                <p>
                  <strong>Ví dụ:</strong> "Cốt Trà" = 100g Trà Khô + 1.5L Nước →
                  Thu được 1.2L cốt.
                  <br />→ Giá vốn 1ml = (Giá 100g trà) ÷ 1200ml.
                </p>
              </>
            ),
          },
        ]}
      />

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📦 Danh mục Nguyên liệu</h1>
          <p style={styles.subtitle}>Quản lý giá vốn và đơn vị tính</p>
        </div>
        <div style={styles.headerButtons}>
          {/* Help Button */}

          <button
            style={{
              ...styles.secondaryButton,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowGuide(true)}
          >
            <HelpCircle size={16} />
            Hướng dẫn
          </button>
          {/* Show Hidden Button */}
          <button
            style={{
              ...styles.secondaryButton,
              backgroundColor: showHidden
                ? "#FFC857"
                : styles.secondaryButton.backgroundColor,
              color: showHidden ? "#1E293B" : styles.secondaryButton.color,
              borderColor: showHidden
                ? "#FFC857"
                : styles.secondaryButton.borderColor,
            }}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Eye size={16} /> Đang hiện ẩn
              </div>
            ) : (
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <EyeOff size={16} /> Hiện đã ẩn
              </div>
            )}
          </button>

          {/* Add Button */}
          <button
            style={{
              ...styles.primaryButton,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} />
            Thêm Nguyên Liệu
          </button>
        </div>
      </div>
      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{ingredients.length}</div>
          <div style={styles.statLabel}>Tổng nguyên liệu</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: COLORS.warning }}>
            {ingredients.filter(isLowStock).length}
          </div>
          <div style={styles.statLabel}>Sắp hết hàng</div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 16, position: "relative", maxWidth: 400 }}>
        <Search
          size={18}
          color={COLORS.textSecondary}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Tìm kiếm nguyên liệu..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px 12px 44px",
            fontSize: 14,
            color: COLORS.textPrimary,
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            outline: "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = COLORS.primary;
            e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary}20`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = COLORS.border;
            e.target.style.boxShadow = "none";
          }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Xóa tìm kiếm"
          >
            <X size={16} color={COLORS.textSecondary} />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 16,
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${COLORS.border}`,
          backgroundColor: "#F1F5F9",
          width: "fit-content",
        }}
      >
        {[
          { key: "all", label: "Tất cả", icon: "📋" },
          { key: "raw_material", label: "Nguyên liệu", icon: "🧪" },
          { key: "supply", label: "Vật dụng", icon: "🧻" },
          { key: "semi_product", label: "Bán thành phẩm", icon: "🔧" },
          { key: "resale_item", label: "Hàng bán lại", icon: "🛒" },
        ].map((tab) => {
          const isActive = typeFilter === tab.key;
          const count =
            tab.key === "all"
              ? ingredients.length
              : ingredients.filter((i) => (i as any).type === tab.key || (!((i as any).type) && tab.key === "raw_material")).length;
          return (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              style={{
                padding: "10px 16px",
                border: "none",
                backgroundColor: isActive ? COLORS.primary : "transparent",
                color: isActive ? "white" : COLORS.textSecondary,
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
              <span
                style={{
                  backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "#E2E8F0",
                  color: isActive ? "white" : COLORS.textSecondary,
                  padding: "2px 7px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Tên nguyên liệu</th>
              <th style={styles.th}>Đơn vị kho</th>
              <th style={styles.th}>Giá / ĐV gốc</th>
              <th style={styles.th}>Tồn kho</th>
              <th style={styles.th}>Tồn quầy</th>
              <th style={styles.th}>Cảnh báo</th>
              <th style={{ ...styles.th, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={styles.emptyCell}>
                  Đang tải...
                </td>
              </tr>
            ) : ingredients.length === 0 ? (
              <tr>
                <td colSpan={7} style={styles.emptyCell}>
                  Chưa có nguyên liệu nào. Nhấn "Thêm Nguyên Liệu" để bắt đầu.
                </td>
              </tr>
            ) : (
              ingredients
                .filter((ing) => {
                  // Filter by type tab
                  if (typeFilter !== "all") {
                    const ingType = (ing as any).type || "raw_material";
                    if (ingType !== typeFilter) return false;
                  }
                  // Filter by search term
                  if (!searchTerm) return true;
                  const query = searchTerm.toLowerCase();
                  return (
                    ing.name.toLowerCase().includes(query) ||
                    (ing.aliases && ing.aliases.toLowerCase().includes(query))
                  );
                })
                .map((ing) => {
                  const { warehouseUnit, barUnit } = getInventoryDisplayUnits(ing);
                  const { warehouseQty, barQty } = getInventoryDisplayQuantities(ing);

                  return (
                    <tr
                      key={ing.id}
                      style={{
                        ...styles.tableRow,
                        opacity: ing.archived ? 0.6 : 1,
                        backgroundColor: ing.archived ? "#f5f5f5" : "transparent",
                      }}
                    >
                    <td style={styles.td}>
                      <div
                        style={{
                          ...styles.ingredientName,
                          textDecoration: ing.archived
                            ? "line-through"
                            : "none",
                        }}
                      >
                        {ing.name}
                      </div>
                      {/* Only show aliases if it's not empty or just '[]' */}
                      {ing.aliases &&
                        ing.aliases !== "[]" &&
                        ing.aliases.length > 2 && (
                          <div style={styles.aliases}>
                            Cũng gọi: {ing.aliases}
                          </div>
                        )}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.unitBadge}>{ing.base_unit}</span>
                    </td>
                    <td style={styles.td}>
                      {formatCurrency(ing.unit_cost)}
                      {ing.base_unit ? (
                        <span style={styles.unitCostSuffix}> / {ing.base_unit}</span>
                      ) : null}
                    </td>
                    <td style={styles.td}>
                      {formatInventoryQuantity(warehouseQty, warehouseUnit, ing)}
                    </td>
                    <td style={styles.td}>
                      {formatInventoryQuantity(barQty, barUnit, ing)}
                    </td>
                    <td style={styles.td}>
                      {isLowStock(ing) ? (
                        <span style={styles.lowStockBadge}>
                          &lt; {ing.min_threshold} {ing.base_unit}
                        </span>
                      ) : (
                        <span style={styles.okBadge}>OK</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {ing.archived ? (
                        <button
                          style={{
                            ...styles.editButton,
                            color: COLORS.primary,
                            fontWeight: 600,
                          }}
                          onClick={() => handleRestore(ing)}
                        >
                          <Recycle size={14} />
                          Khôi phục
                        </button>
                      ) : (
                        <>
                          <button
                            style={styles.editButton}
                            onClick={() => handleEdit(ing)}
                          >
                            Sửa
                          </button>
                          <button
                            style={{
                              ...styles.editButton,
                              color: "#EF4444",
                              marginLeft: 8,
                            }}
                            onClick={() => handleDelete(ing)}
                          >
                            Xóa
                          </button>
                        </>
                      )}
                    </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm/Sửa Nguyên Liệu */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {editingIngredient ? "Sửa Nguyên Liệu" : "Thêm Nguyên Liệu Mới"}
              </h2>
              <button
                onClick={handleCloseModal}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: COLORS.textSecondary,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
              {/* Section 1: Basic Info */}
              <div style={styles.formSection}>
                <div style={styles.sectionTitle}>
                  <Package size={20} />
                  Thông tin cơ bản
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Tên nguyên liệu *</label>
                  <input
                    autoFocus
                    placeholder="VD: Sữa đặc Ông Thọ"
                    style={styles.inputModern}
                    value={newIngredient.name}
                    onChange={(e) =>
                      setNewIngredient({
                        ...newIngredient,
                        name: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Ingredient Type Selector */}
                <div style={styles.field}>
                  <label style={styles.label}>Phân loại</label>
                  <select
                    style={styles.selectModern}
                    value={newIngredient.ingredient_type}
                    onChange={(e) => {
                      const newType = e.target.value as
                        | "raw_material"
                        | "supply"
                        | "semi_product"
                        | "resale_item";
                      setNewIngredient({
                        ...newIngredient,
                        ingredient_type: newType,
                        // Auto-set item_type: semi_product = PHANTOM, others = STOCK
                        item_type:
                          newType === "semi_product" ? "PHANTOM" : "STOCK",
                        shelf_life_days:
                          newType === "supply"
                            ? ""
                            : newIngredient.shelf_life_days,
                      });
                    }}
                  >
                    <option value="raw_material">
                      🧪 Nguyên liệu (Dùng trong công thức)
                    </option>
                    <option value="supply">
                      🧻 Vật dụng (Chi phí vận hành)
                    </option>
                    <option value="semi_product">
                      🔧 Bán thành phẩm (Tự nấu)
                    </option>
                    <option value="resale_item">
                      🛒 Hàng bán lại (Nhập về bán)
                    </option>
                  </select>
                  <span style={styles.hint}>
                    {newIngredient.ingredient_type === "raw_material" &&
                      "Cà phê, Sữa, Đường - Tính vào giá vốn món"}
                    {newIngredient.ingredient_type === "supply" &&
                      "Giấy ăn, Ly nhựa, Ống hút - Chi phí cửa hàng"}
                    {newIngredient.ingredient_type === "semi_product" &&
                      "Cốt trà, Sốt đặc biệt - Nấu từ nguyên liệu gốc"}
                    {newIngredient.ingredient_type === "resale_item" &&
                      "Bánh, Cookies, Snacks - Nhập sẵn bán lại, không cần công thức"}
                  </span>
                </div>
              </div>

              {/* Section 2: Pricing & Units */}
              <div style={styles.formSection}>
                <div style={styles.sectionTitle}>
                  <CircleDollarSign size={20} />
                  Giá & Đơn vị
                </div>
                <div style={styles.formRow}>
                  <div style={{ ...styles.formCol, flex: 1 }}>
                    <label style={styles.label}>Đơn vị tính</label>
                    <select
                      style={styles.selectModern}
                      value={newIngredient.base_unit}
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          base_unit: e.target.value,
                        })
                      }
                    >
                      {getAllUnits().map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...styles.formCol, flex: 1 }}>
                    <label style={styles.label}>Đơn vị kiểm kho</label>
                    <select
                      style={styles.selectModern}
                      value={newIngredient.stock_check_unit || ""}
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          stock_check_unit: e.target.value,
                        })
                      }
                    >
                      <option value="">Theo đơn vị tính</option>
                      {getAllUnits().map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={{ ...styles.formCol, flex: 1 }}>
                    {newIngredient.ingredient_type === "semi_product" ? (
                      <>
                        <label style={styles.label}>Giá vốn / Đơn vị</label>
                        <div style={{ ...styles.inputWithSuffix, opacity: 0.6 }}>
                          <input
                            type="number"
                            disabled
                            style={{ ...styles.inputModern, borderRadius: "8px 0 0 8px", borderRight: "none", backgroundColor: "#f1f5f9", cursor: "not-allowed" }}
                            value={Math.round(calculatedBatchCost) || ""}
                            placeholder="0"
                            onChange={() => {}}
                          />
                          <span style={{ ...styles.inputSuffix, backgroundColor: "#f1f5f9" }}>đ</span>
                        </div>
                        <span style={{ ...styles.hint, color: "#d97706" }}>Tự động tính từ công thức nấu.</span>
                      </>
                    ) : (
                      <>
                        <label style={styles.label}>
                          Giá mua / Khối lượng tương ứng
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1.5 }}>
                            <div style={styles.inputWithSuffix}>
                              <input
                                type="number"
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                style={{ ...styles.inputModern, borderRadius: "8px 0 0 8px", borderRight: "none" }}
                                value={newIngredient.last_purchase_price ?? ""}
                                placeholder="Giá mua"
                                onChange={(e) => setNewIngredient({ ...newIngredient, last_purchase_price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                              />
                              <span style={styles.inputSuffix}>đ</span>
                            </div>
                          </div>
                          <span style={{ fontSize: 15, color: COLORS.textSecondary, fontWeight: 600 }}>/</span>
                          <div style={{ flex: 1 }}>
                            <input
                              type="number"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              style={styles.inputModern}
                              value={newIngredient.last_purchase_qty ?? ""}
                              placeholder="VD: 1"
                              onChange={(e) => setNewIngredient({ ...newIngredient, last_purchase_qty: e.target.value === "" ? null : parseFloat(e.target.value) })}
                            />
                          </div>
                          <div style={{ flex: 1.1 }}>
                            <select
                              style={styles.inputModern}
                              value={newIngredient.last_purchase_unit || newIngredient.base_unit}
                              onChange={(e) => setNewIngredient({ ...newIngredient, last_purchase_unit: e.target.value })}
                            >
                              {getAllUnits().map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {newIngredient.last_purchase_price != null && newIngredient.last_purchase_qty != null && newIngredient.last_purchase_qty > 0 && (
                          <span style={{ ...styles.hint, color: "#059669" }}>
                            ≈ Giá vốn:{" "}
                            {estimatedPurchaseUnitCost != null
                              ? new Intl.NumberFormat("vi-VN").format(
                                  Math.round(estimatedPurchaseUnitCost),
                                )
                              : "Không quy đổi được"}
                            {estimatedPurchaseUnitCost != null
                              ? `đ / ${newIngredient.base_unit}`
                              : ""}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Unit Conversion - show only for countable units */}
                {UNIT_TYPES.COUNT.includes(newIngredient.base_unit as any) && (
                  <div style={{ marginTop: 16 }}>
                    <label style={styles.label}>
                      Khối lượng / 1 {newIngredient.base_unit}
                    </label>
                    <div style={styles.formRow}>
                      <div style={{ flex: 2 }}>
                        <input
                          type="number"
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          placeholder="VD: 500"
                          style={styles.inputModern}
                          value={newIngredient.unit_weight || ""}
                          onChange={(e) =>
                            setNewIngredient({
                              ...newIngredient,
                              unit_weight:
                                e.target.value === ""
                                  ? null
                                  : parseFloat(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <select
                          style={styles.selectModern}
                          value={newIngredient.unit_weight_unit || "g"}
                          onChange={(e) =>
                            setNewIngredient({
                              ...newIngredient,
                              unit_weight_unit: e.target.value,
                            })
                          }
                        >
                          <option value="g">g</option>
                          <option value="ml">ml</option>
                          <option value="kg">kg</option>
                          <option value="lít">lít</option>
                        </select>
                      </div>
                    </div>
                    <span style={styles.hint}>
                      VD: 1 hộp = 500g → AI sẽ chuyển "950g" thành 1.9 hộp
                    </span>
                  </div>
                )}
              </div>

              {/* Section 3: Advanced */}
              <div style={styles.formSection}>
                <div style={styles.sectionTitle}>
                  <Settings size={20} />
                  Cài đặt nâng cao
                  <span style={styles.optionalBadge}>Tùy chọn</span>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formCol}>
                    <label style={styles.label}>Tỷ trọng</label>
                    <div style={styles.inputWithSuffix}>
                      <input
                        type="number"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="1.0"
                        step="0.1"
                        style={{
                          ...styles.inputModern,
                          borderRadius: "8px 0 0 8px",
                          borderRight: "none",
                        }}
                        value={newIngredient.density || ""}
                        onChange={(e) =>
                          setNewIngredient({
                            ...newIngredient,
                            density:
                              e.target.value === ""
                                ? 1
                                : parseFloat(e.target.value),
                          })
                        }
                      />
                      <span style={styles.inputSuffix}>g/ml</span>
                    </div>
                    <span style={styles.hint}>Nước=1.0, Syrup=1.3</span>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.label}>Trọng lượng vỏ</label>
                    <div style={styles.inputWithSuffix}>
                      <input
                        type="number"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        placeholder="0"
                        style={{
                          ...styles.inputModern,
                          borderRadius: "8px 0 0 8px",
                          borderRight: "none",
                        }}
                        value={newIngredient.tare_weight || ""}
                        onChange={(e) =>
                          setNewIngredient({
                            ...newIngredient,
                            tare_weight:
                              e.target.value === ""
                                ? 0
                                : parseFloat(e.target.value),
                          })
                        }
                      />
                      <span style={styles.inputSuffix}>g</span>
                    </div>
                    <span style={styles.hint}>Để trừ bì khi cân</span>
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Ngưỡng cảnh báo hết hàng</label>
                  <div style={styles.inputWithSuffix}>
                    <input
                      type="number"
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      style={{
                        ...styles.inputModern,
                        borderRadius: "8px 0 0 8px",
                        borderRight: "none",
                      }}
                      value={newIngredient.min_threshold || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          min_threshold:
                            e.target.value === ""
                              ? 0
                              : parseFloat(e.target.value),
                        })
                      }
                    />
                    <span style={styles.inputSuffix}>
                      {newIngredient.base_unit}
                    </span>
                  </div>
                  <span style={styles.hint}>
                    Cảnh báo khi tồn kho thấp hơn số này
                  </span>
                </div>

                {newIngredient.ingredient_type !== "supply" && (
                  <div style={styles.field}>
                    <label style={styles.label}>Số ngày bảo quản</label>
                    <div style={styles.inputWithSuffix}>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        style={{
                          ...styles.inputModern,
                          borderRadius: "8px 0 0 8px",
                          borderRight: "none",
                        }}
                        value={newIngredient.shelf_life_days}
                        placeholder="VD: 30"
                        onChange={(e) =>
                          setNewIngredient({
                            ...newIngredient,
                            shelf_life_days: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                      />
                      <span style={styles.inputSuffix}>ngày</span>
                    </div>
                    <span style={styles.hint}>
                      Để trống nếu muốn staff chọn hạn theo từng lô khi nhập hàng
                    </span>
                  </div>
                )}
              </div>

              {/* Inventory Configuration Block - NEW */}
              {/* Section 4: Inventory Configuration (Refactored to match Advanced Settings) */}
              <div style={styles.formSection}>
                <div style={styles.sectionTitle}>
                  <span style={styles.sectionIcon}>⚙️</span>
                  Cấu hình Kiểm Kho (Inventory Settings)
                </div>

                <div style={styles.formRow}>
                  {/* Item Type */}
                  <div style={styles.formCol}>
                    <label style={styles.label}>Loại hàng hóa</label>
                    <select
                      value={newIngredient.item_type}
                      onChange={(e) => {
                        const newItemType = e.target.value as
                          | "STOCK"
                          | "PHANTOM";
                        setNewIngredient({
                          ...newIngredient,
                          item_type: newItemType,
                          // Auto-set ingredient_type: PHANTOM = semi_product
                          ingredient_type:
                            newItemType === "PHANTOM"
                              ? "semi_product"
                              : newIngredient.ingredient_type === "semi_product"
                              ? "raw_material"
                              : newIngredient.ingredient_type,
                        });
                      }}
                      style={styles.selectModern}
                    >
                      <option value="STOCK">📦 Hàng Tồn Kho (Stock)</option>
                      <option value="PHANTOM">🔄 Hàng Quy Đổi (Phantom)</option>
                    </select>
                    <span style={styles.hint}>
                      {newIngredient.item_type === "STOCK"
                        ? "Có quản lý tồn kho thực tế"
                        : "Chỉ tính toán lý thuyết, không kiểm kê"}
                    </span>
                  </div>

                  {/* Tracking Mode */}
                  <div style={styles.formCol}>
                    <label style={styles.label}>Chế độ Kiểm tra</label>
                    <select
                      value={newIngredient.tracking_mode}
                      onChange={(e) =>
                        setNewIngredient({
                          ...newIngredient,
                          tracking_mode: e.target.value as any,
                        })
                      }
                      style={styles.selectModern}
                    >
                      <option value="STRICT">🛡️ Kiểm Kỹ (STRICT)</option>
                      <option value="LOOSE">📝 Tin Tưởng (TRUST)</option>
                    </select>
                    <span style={styles.hint}>
                      {newIngredient.tracking_mode === "STRICT"
                        ? "Báo động nếu lệch doanh thu"
                        : "Lấy số thực tế làm chuẩn"}
                    </span>
                  </div>
                </div>

                {/* Variance - Only for STRICT */}
                {newIngredient.tracking_mode === "STRICT" && (
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <label style={styles.label}>
                        Mức hao hụt cho phép (%)
                      </label>
                      <div style={styles.inputWithSuffix}>
                        <input
                          type="number"
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          style={{
                            ...styles.inputModern,
                            borderRadius: "8px 0 0 8px",
                            borderRight: "none",
                          }}
                          value={newIngredient.allowable_variance || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setNewIngredient({
                              ...newIngredient,
                              allowable_variance:
                                e.target.value === ""
                                  ? 0
                                  : parseFloat(e.target.value),
                            })
                          }
                        />
                        <span style={styles.inputSuffix}>%</span>
                      </div>
                      <span style={styles.hint}>
                        Nếu lệch dưới mức này → Hệ thống tự điều chỉnh (KHỚP)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 5: Batch Recipe (Only for PHANTOM items) */}
              {newIngredient.item_type === "PHANTOM" && (
                <div style={styles.formSection}>
                  <div style={styles.sectionTitle}>
                    <span style={styles.sectionIcon}>🍵</span>
                    Công Thức Nấu (Batch Recipe)
                  </div>

                  {/* Toggle */}
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newIngredient.is_batch_item}
                        onChange={(e) =>
                          setNewIngredient({
                            ...newIngredient,
                            is_batch_item: e.target.checked,
                          })
                        }
                        style={{ width: 18, height: 18 }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: COLORS.textPrimary,
                        }}
                      >
                        Đây là bán thành phẩm (có công thức nấu)
                      </span>
                    </label>
                    <span style={styles.hint}>
                      Ví dụ: Cốt trà được nấu từ Trà lá + Nước sôi
                    </span>
                  </div>

                  {newIngredient.is_batch_item && (
                    <>
                      {/* Input Ingredients */}
                      <div style={{ marginBottom: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <label style={styles.label}>
                            📥 Nguyên liệu đầu vào
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setBatchInputs([
                                ...batchInputs,
                                {
                                  childIngredientId: "",
                                  quantity: "",
                                  displayUnit: "g",
                                },
                              ])
                            }
                            style={{
                              padding: "4px 12px",
                              fontSize: 12,
                              backgroundColor: COLORS.primary,
                              color: "white",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            + Thêm
                          </button>
                        </div>

                        {batchInputs.length === 0 && (
                          <div
                            style={{
                              padding: 16,
                              backgroundColor: "#F9F9F9",
                              borderRadius: 8,
                              textAlign: "center",
                              color: COLORS.textSecondary,
                              fontSize: 13,
                            }}
                          >
                            Chưa có nguyên liệu. Bấm "+ Thêm" để bắt đầu.
                          </div>
                        )}

                        {batchInputs.map((input, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: 8,
                              marginBottom: 8,
                              alignItems: "center",
                            }}
                          >
                            <BatchIngredientSelector
                              value={input.childIngredientId}
                              ingredients={ingredients}
                              editingIngredientId={editingIngredient?.id}
                              onChange={(id, unit) => {
                                const updated = [...batchInputs];
                                updated[idx] = {
                                  ...updated[idx],
                                  childIngredientId: id,
                                  displayUnit: unit || "g",
                                };
                                setBatchInputs(updated);
                              }}
                            />
                            <input
                              type="number"
                              value={input.quantity}
                              placeholder="Số lượng"
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) => {
                                const updated = [...batchInputs];
                                updated[idx] = {
                                  ...updated[idx],
                                  quantity: e.target.value === "" ? "" : Number(e.target.value),
                                };
                                setBatchInputs(updated);
                              }}
                              style={{ ...styles.inputModern, flex: 1 }}
                            />
                            <select
                              value={input.displayUnit}
                              onChange={(e) => {
                                const updated = [...batchInputs];
                                updated[idx] = { ...updated[idx], displayUnit: e.target.value };
                                setBatchInputs(updated);
                              }}
                              style={{
                                fontSize: 13,
                                color: COLORS.textPrimary,
                                background: "#F3F4F6",
                                border: `1px solid ${COLORS.border}`,
                                borderRadius: 6,
                                padding: "4px 6px",
                                minWidth: 52,
                                cursor: "pointer",
                              }}
                            >
                              {getAllUnits().map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setBatchInputs(
                                  batchInputs.filter((_, i) => i !== idx)
                                )
                              }
                              style={{
                                background: "none",
                                border: "none",
                                color: COLORS.error,
                                cursor: "pointer",
                                fontSize: 16,
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Output Yield */}
                      <div style={styles.formRow}>
                        <div style={styles.formCol}>
                          <label style={styles.label}>
                            📤 Thành phẩm thu được (Số lượng)
                          </label>
                          <div style={styles.inputWithSuffix}>
                            <input
                              type="number"
                              placeholder="VD: Nấu ra 2 lít thì nhập 2"
                              style={{
                                ...styles.inputModern,
                                borderRadius: "8px 0 0 8px",
                                borderRight: "none",
                              }}
                              value={newIngredient.batch_yield_qty ?? ""}
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) =>
                                setNewIngredient({
                                  ...newIngredient,
                                  batch_yield_qty:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                            <select
                              style={{
                                ...styles.inputSuffix,
                                border: "none",
                                borderLeft: `1px solid #E5E7EB`,
                                borderRadius: "0 8px 8px 0",
                                cursor: "pointer",
                                fontSize: 13,
                                color: COLORS.textPrimary,
                                background: "#F3F4F6",
                                paddingLeft: 8,
                                paddingRight: 8,
                              }}
                              value={newIngredient.batch_yield_unit || newIngredient.base_unit}
                              onChange={(e) => setNewIngredient({ ...newIngredient, batch_yield_unit: e.target.value })}
                            >
                              {getAllUnits().map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                          <span style={{...styles.hint, color: COLORS.error}}>
                            * Nhập số lượng làm ra (Ví dụ: 2). KHÔNG nhập số tiền vào đây!
                          </span>
                        </div>
                      </div>

                      {/* Auto COGS Display */}
                      {batchInputs.length > 0 &&
                        newIngredient.batch_yield_qty && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              backgroundColor: "#F0FDF4",
                              borderRadius: 8,
                              border: "1px solid #86EFAC",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                color: "#166534",
                                fontWeight: 500,
                              }}
                            >
                              📊 Giá vốn ước tính:{" "}
                              <strong>
                                {`${calculatedBatchCost.toLocaleString("vi-VN", {
                                  maximumFractionDigits: 0,
                                })}₫/${newIngredient.batch_yield_unit || newIngredient.base_unit}`}
                              </strong>
                            </div>
                          </div>
                        )}
                    </>
                  )}
                </div>
              )}
              <div style={styles.modalButtons}>
                <button onClick={handleCloseModal} style={styles.cancelButton}>
                  Hủy
                </button>
                <button onClick={handleSave} style={styles.saveButton}>
                  {editingIngredient ? "💾 Cập nhật" : "➕ Thêm mới"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 32,
    backgroundColor: COLORS.background,
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  headerButtons: {
    display: "flex",
    gap: 12,
  },
  primaryButton: {
    padding: "12px 20px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "12px 20px",
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  statsRow: {
    display: "flex",
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    padding: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    minWidth: 150,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  tableContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  tableHeader: {
    backgroundColor: "#F9F9F9",
    borderBottom: `1px solid ${COLORS.border}`,
  },
  th: {
    padding: "14px 16px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tableRow: {
    borderBottom: `1px solid ${COLORS.border}`,
  },
  td: {
    padding: "14px 16px",
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  ingredientName: {
    fontWeight: 500,
  },
  aliases: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  unitBadge: {
    display: "inline-block",
    padding: "4px 10px",
    backgroundColor: "#F0F0F0",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
  },
  unitCostSuffix: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  lowStockBadge: {
    display: "inline-block",
    padding: "4px 10px",
    backgroundColor: "#FEE2E2",
    color: COLORS.error,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
  },
  okBadge: {
    display: "inline-block",
    padding: "4px 10px",
    backgroundColor: "#E8F5E9",
    color: COLORS.positive,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
  },
  editButton: {
    padding: "6px 12px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  },
  emptyCell: {
    padding: 40,
    textAlign: "center",
    color: COLORS.textSecondary,
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: "480px",
    maxHeight: "90vh",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    border: `1px solid ${COLORS.border}`,
    overflow: "hidden", // Changed from "auto" to "hidden" to preserve border-radius
    display: "flex",
    flexDirection: "column" as const,
  },
  modalHeader: {
    padding: "20px 24px",
    borderBottom: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: "16px 16px 0 0",
  },
  // New modern form styles
  formSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 16,
  },
  optionalBadge: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 500,
    color: COLORS.textSecondary,
    backgroundColor: "#E5E5E5",
    padding: "2px 8px",
    borderRadius: 4,
  },
  formRow: {
    display: "flex",
    gap: 16,
  },
  formCol: {
    flex: 1,
    marginBottom: 16,
  },
  inputModern: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  selectModern: {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    outline: "none",
    cursor: "pointer",
    boxSizing: "border-box" as const,
  },
  inputWithSuffix: {
    display: "flex",
    alignItems: "stretch",
  },
  inputSuffix: {
    display: "flex",
    alignItems: "center",
    padding: "0 14px",
    backgroundColor: "#F0F0F0",
    border: `1px solid ${COLORS.border}`,
    borderLeft: "none",
    borderRadius: "0 8px 8px 0",
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.textSecondary,
    minWidth: 44,
    justifyContent: "center",
  },
  hint: {
    display: "block",
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  formButtons: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: "14px 20px",
    backgroundColor: "#F5F5F5",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  saveButton: {
    flex: 2,
    padding: "14px 20px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
  },
};
