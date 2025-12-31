/**
 * IngredientsPage - Desktop Ingredient Management
 * Light Mode UI per .UXUIrules
 *
 * Features:
 * - List all ingredients with unit, cost, low-stock alert
 * - Add/Edit ingredients
 * - (Future) AI Scan from invoice
 */

import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";

interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  unit_cost: number;
  min_threshold: number;
  warehouse_qty: number;
  bar_qty: number;
  density: number;
  tare_weight: number;
  aliases: string;
}

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for new ingredient
  const [newIngredient, setNewIngredient] = useState({
    name: "",
    base_unit: "kg",
    unit_cost: 0,
    min_threshold: 10,
    density: 1,
    tare_weight: 0,
  });

  // Save new ingredient via IPC
  const handleSave = async () => {
    if (!newIngredient.name.trim()) {
      alert("Tên nguyên liệu không được để trống!");
      return;
    }

    try {
      await (window as any).electronAPI?.upsertIngredient?.({
        id: crypto.randomUUID(),
        name: newIngredient.name.trim(),
        base_unit: newIngredient.base_unit,
        unit_cost: newIngredient.unit_cost,
        min_threshold: newIngredient.min_threshold,
        density: newIngredient.density,
        tare_weight: newIngredient.tare_weight,
        warehouse_qty: 0,
        bar_qty: 0,
      });

      // Reset form and close modal
      setNewIngredient({
        name: "",
        base_unit: "kg",
        unit_cost: 0,
        min_threshold: 10,
        density: 1,
        tare_weight: 0,
      });
      setShowAddModal(false);

      // Reload list
      await loadIngredients();
      alert("✅ Đã thêm nguyên liệu thành công!");
    } catch (err) {
      console.error("Failed to save ingredient:", err);
      alert("❌ Lỗi khi lưu nguyên liệu");
    }
  };

  useEffect(() => {
    loadIngredients();
  }, []);

  async function loadIngredients() {
    setLoading(true);
    try {
      const data =
        (await (window as any).electronAPI?.getIngredients?.()) ?? [];
      setIngredients(data);
    } catch (err) {
      console.error("Failed to load ingredients:", err);
    }
    setLoading(false);
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("vi-VN") + "đ";
  };

  const isLowStock = (ing: Ingredient) => {
    return ing.warehouse_qty + ing.bar_qty < ing.min_threshold;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📦 Danh mục Nguyên liệu</h1>
          <p style={styles.subtitle}>Quản lý giá vốn và đơn vị tính</p>
        </div>
        <div style={styles.headerButtons}>
          {/* Add Button */}
          <button
            style={styles.primaryButton}
            onClick={() => setShowAddModal(true)}
          >
            + Thêm Nguyên Liệu
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

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Tên nguyên liệu</th>
              <th style={styles.th}>Đơn vị kho</th>
              <th style={styles.th}>Giá vốn/Đơn vị</th>
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
              ingredients.map((ing) => (
                <tr key={ing.id} style={styles.tableRow}>
                  <td style={styles.td}>
                    <div style={styles.ingredientName}>{ing.name}</div>
                    {ing.aliases && (
                      <div style={styles.aliases}>Cũng gọi: {ing.aliases}</div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.unitBadge}>{ing.base_unit}</span>
                  </td>
                  <td style={styles.td}>{formatCurrency(ing.unit_cost)}</td>
                  <td style={styles.td}>{ing.warehouse_qty}</td>
                  <td style={styles.td}>{ing.bar_qty}</td>
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
                    <button style={styles.editButton}>Sửa</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Thêm Nguyên Liệu */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Thêm Nguyên Liệu Mới</h2>
              <button
                onClick={() => setShowAddModal(false)}
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

            <div style={{ padding: 20 }}>
              <div style={styles.field}>
                <label style={styles.label}>Tên nguyên liệu</label>
                <input
                  placeholder="VD: Sữa đặc"
                  style={styles.input}
                  value={newIngredient.name}
                  onChange={(e) =>
                    setNewIngredient({ ...newIngredient, name: e.target.value })
                  }
                />
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Đơn vị tính</label>
                  <select
                    style={styles.input}
                    value={newIngredient.base_unit}
                    onChange={(e) =>
                      setNewIngredient({
                        ...newIngredient,
                        base_unit: e.target.value,
                      })
                    }
                  >
                    <option>kg</option>
                    <option>g</option>
                    <option>lít</option>
                    <option>ml</option>
                    <option>chai</option>
                    <option>lon</option>
                  </select>
                </div>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Giá vốn / Đơn vị (đ)</label>
                  <input
                    type="number"
                    style={styles.input}
                    value={newIngredient.unit_cost || ""}
                    onChange={(e) =>
                      setNewIngredient({
                        ...newIngredient,
                        unit_cost: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Tỷ trọng (g/ml)</label>
                  <input
                    type="number"
                    placeholder="1.0"
                    step="0.1"
                    style={styles.input}
                    value={newIngredient.density}
                    onChange={(e) =>
                      setNewIngredient({
                        ...newIngredient,
                        density: parseFloat(e.target.value) || 1,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: COLORS.textSecondary }}>
                    VD: Nước=1, Syrup=1.3
                  </span>
                </div>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Trọng lượng vỏ (g)</label>
                  <input
                    type="number"
                    placeholder="200"
                    style={styles.input}
                    value={newIngredient.tare_weight || ""}
                    onChange={(e) =>
                      setNewIngredient({
                        ...newIngredient,
                        tare_weight: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: COLORS.textSecondary }}>
                    Trừ bì khi đặt chai lên cân
                  </span>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Ngưỡng cảnh báo (Min)</label>
                <input
                  type="number"
                  style={styles.input}
                  value={newIngredient.min_threshold}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      min_threshold: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{ ...styles.secondaryButton, flex: 1 }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  style={{ ...styles.primaryButton, flex: 1 }}
                >
                  Lưu
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
    borderRadius: 12,
    width: "400px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
    border: `1px solid ${COLORS.border}`,
  },
  modalHeader: {
    padding: "16px 20px",
    borderBottom: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
};
