// src/pages/tabs/InventoryTab.tsx - Inventory Tab with Category Tabs
// SOLID: Presentational component - receives data via props

import React, { useState, useMemo } from "react";
import { Ingredient } from "../../types";
import { COLORS, dashboardStyles } from "../../styles/theme";
import {
  Package,
  RefreshCw,
  Download,
  FlaskConical,
  Boxes,
  AlertTriangle,
} from "lucide-react";

type IngredientCategory = "raw_material" | "supply";

interface InventoryTabProps {
  ingredients: Ingredient[];
  totalValue: number;
  lowStockCount: number;
  loading: boolean;
  onExport: () => Promise<any>;
  onRefresh: () => Promise<void>;
}

export function InventoryTab({
  ingredients,
  totalValue,
  lowStockCount,
  loading,
  onExport,
  onRefresh,
}: InventoryTabProps) {
  const [activeTab, setActiveTab] =
    useState<IngredientCategory>("raw_material");

  // Filter ingredients based on active tab
  const filteredIngredients = useMemo(() => {
    return ingredients.filter((item) => {
      const itemType = item.type || "raw_material"; // Default to raw_material
      if (activeTab === "raw_material") {
        // Show raw_material and semi_product in "Nguyên liệu" tab
        return itemType === "raw_material" || itemType === "semi_product";
      }
      return itemType === "supply";
    });
  }, [ingredients, activeTab]);

  // Calculate stats for current tab
  const tabStats = useMemo(() => {
    const total = filteredIngredients.reduce(
      (sum, item) => sum + (item.warehouse_qty + item.bar_qty) * item.unit_cost,
      0
    );
    const lowStock = filteredIngredients.filter((item) => {
      const qty = item.warehouse_qty + item.bar_qty;
      const threshold = item.min_threshold || 0;
      return threshold > 0 && qty < threshold;
    }).length;
    return { totalValue: total, lowStockCount: lowStock };
  }, [filteredIngredients]);

  const handleExport = async () => {
    const result = await onExport();
    if (result?.success) {
      alert("✅ Đã xuất Excel thành công!");
    } else if (result?.cancelled) {
      // User cancelled
    } else {
      alert("❌ Lỗi xuất file");
    }
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Đang tải dữ liệu tồn kho...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h2
          style={{
            ...styles.title,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Package size={22} color={COLORS.primary} />
          Tồn kho
        </h2>
        <div style={styles.actions}>
          <button
            onClick={onRefresh}
            style={{
              ...styles.actionButton,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={14} />
            Làm mới
          </button>
          <button
            onClick={handleExport}
            style={{
              ...styles.exportButton,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={14} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={styles.tabsContainer}>
        <button
          onClick={() => setActiveTab("raw_material")}
          style={{
            ...styles.tabButton,
            ...(activeTab === "raw_material" ? styles.tabButtonActive : {}),
          }}
        >
          <FlaskConical size={14} />
          Nguyên liệu
          <span style={styles.tabBadge}>
            {
              ingredients.filter((i) => {
                const t = i.type || "raw_material";
                return t === "raw_material" || t === "semi_product";
              }).length
            }
          </span>
        </button>
        <button
          onClick={() => setActiveTab("supply")}
          style={{
            ...styles.tabButton,
            ...(activeTab === "supply" ? styles.tabButtonActive : {}),
          }}
        >
          <Boxes size={14} />
          Vật dụng
          <span style={styles.tabBadge}>
            {ingredients.filter((i) => i.type === "supply").length}
          </span>
        </button>
      </div>

      {/* Summary Cards - for current tab */}
      <div style={styles.summaryRow}>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Tổng giá trị</span>
          <span style={styles.summaryValue}>
            {tabStats.totalValue.toLocaleString("vi-VN")} đ
          </span>
        </div>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Số mặt hàng</span>
          <span style={styles.summaryValueSmall}>
            {filteredIngredients.length}
          </span>
        </div>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Sắp hết hàng</span>
          <span
            style={{
              ...styles.summaryValueSmall,
              color:
                tabStats.lowStockCount > 0 ? COLORS.warning : COLORS.positive,
            }}
          >
            {tabStats.lowStockCount}
          </span>
        </div>
      </div>

      {/* Inventory Table */}
      <table style={dashboardStyles.table}>
        <thead>
          <tr>
            <th style={dashboardStyles.tableHeader}>Tên nguyên liệu</th>
            <th style={dashboardStyles.tableHeader}>Đơn vị</th>
            <th style={dashboardStyles.tableHeader}>Kho</th>
            <th style={dashboardStyles.tableHeader}>Quầy</th>
            <th style={dashboardStyles.tableHeader}>Giá (đ)</th>
            <th style={dashboardStyles.tableHeader}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {filteredIngredients.length === 0 ? (
            <tr>
              <td colSpan={6} style={styles.emptyRow}>
                {activeTab === "raw_material"
                  ? "Chưa có nguyên liệu nào"
                  : "Chưa có vật dụng nào"}
              </td>
            </tr>
          ) : (
            filteredIngredients.map((item) => {
              const totalQty = item.warehouse_qty + item.bar_qty;
              const rowValue = totalQty * item.unit_cost;
              const threshold = item.min_threshold || 0;
              const isLowStock = threshold > 0 && totalQty < threshold;

              return (
                <tr key={item.id}>
                  <td style={dashboardStyles.tableCell}>
                    {isLowStock && (
                      <AlertTriangle
                        size={14}
                        color={COLORS.warning}
                        style={{ marginRight: 6 }}
                      />
                    )}
                    {item.name}
                  </td>
                  <td style={dashboardStyles.tableCell}>{item.base_unit}</td>
                  <td style={dashboardStyles.tableCell}>
                    {item.warehouse_qty}
                  </td>
                  <td style={dashboardStyles.tableCell}>{item.bar_qty}</td>
                  <td style={dashboardStyles.tableCell}>
                    {item.unit_cost.toLocaleString("vi-VN")}
                  </td>
                  <td style={dashboardStyles.tableCell}>
                    {rowValue.toLocaleString("vi-VN")}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: COLORS.textPrimary,
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
  },
  actions: {
    display: "flex",
    gap: 8,
  },
  actionButton: {
    padding: "10px 16px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  exportButton: {
    padding: "10px 16px",
    backgroundColor: COLORS.positive,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  tabsContainer: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingBottom: 12,
  },
  tabButton: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    backgroundColor: "transparent",
    color: COLORS.textSecondary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
    color: "white",
    borderColor: COLORS.primary,
  },
  tabBadge: {
    padding: "2px 8px",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    fontSize: 12,
  },
  summaryRow: {
    display: "flex",
    gap: 16,
    marginBottom: 24,
  },
  summaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.positive,
  },
  summaryValueSmall: {
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: 40,
    color: COLORS.textSecondary,
  },
  emptyRow: {
    padding: 32,
    textAlign: "center",
    color: COLORS.textSecondary,
  },
  lowStockBadge: {
    marginRight: 8,
  },
};
