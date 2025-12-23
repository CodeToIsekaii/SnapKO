// src/pages/tabs/InventoryTab.tsx - Inventory Tab
// SOLID: Presentational component - receives data via props

import React from "react";
import { Ingredient } from "../../types";
import { COLORS, dashboardStyles } from "../../styles/theme";

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
        <h2 style={styles.title}>📦 Tồn kho</h2>
        <div style={styles.actions}>
          <button onClick={onRefresh} style={styles.actionButton}>
            🔄 Làm mới
          </button>
          <button onClick={handleExport} style={styles.exportButton}>
            📥 Xuất Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Tổng giá trị</span>
          <span style={styles.summaryValue}>
            {totalValue.toLocaleString("vi-VN")} đ
          </span>
        </div>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Số mặt hàng</span>
          <span style={styles.summaryValueSmall}>{ingredients.length}</span>
        </div>
        <div style={dashboardStyles.summaryCard}>
          <span style={styles.summaryLabel}>Sắp hết hàng</span>
          <span
            style={{
              ...styles.summaryValueSmall,
              color: lowStockCount > 0 ? COLORS.warning : COLORS.positive,
            }}
          >
            {lowStockCount}
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
          {ingredients.length === 0 ? (
            <tr>
              <td colSpan={6} style={styles.emptyRow}>
                Chưa có dữ liệu tồn kho
              </td>
            </tr>
          ) : (
            ingredients.map((item) => {
              const totalQty = item.warehouse_qty + item.bar_qty;
              const rowValue = totalQty * item.unit_cost;
              const isLowStock = totalQty < 10;

              return (
                <tr key={item.id}>
                  <td style={dashboardStyles.tableCell}>
                    {isLowStock && <span style={styles.lowStockBadge}>⚠️</span>}
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
    marginBottom: 24,
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
