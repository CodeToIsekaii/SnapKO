import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";
import { UNIT_TYPES, getUnitGroup, convertUnit } from "@snapko/shared/logic";

interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  unit_cost: number;
}

interface Recipe {
  id: string;
  name: string;
  price: number;
  category: string;
  ingredients: Array<{
    ingredient_id: string;
    name: string;
    quantity: number;
    unit: string;
    cost: number;
  }>;
}

// Helper to get available units for a given unit type
function getAvailableUnits(unit: string): readonly string[] {
  const group = getUnitGroup(unit);
  if (group === "WEIGHT") return UNIT_TYPES.WEIGHT;
  if (group === "VOLUME") return UNIT_TYPES.VOLUME;
  return [unit];
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [scanning, setScanning] = useState(false);
  const [newRecipe, setNewRecipe] = useState({
    name: "",
    price: 0,
    category: "",
    ingredients: [] as Recipe["ingredients"],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const ings = (await (window as any).electronAPI?.getIngredients?.()) ?? [];
    setIngredients(ings);
    // TODO: Load recipes from IPC
  }

  // AI Scan Logic
  async function handleAIScan() {
    // Create hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      setScanning(true);
      try {
        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];

          // Call Edge Function
          const response = await fetch(
            "https://kxeervlkzyitlbksbfvp.supabase.co/functions/v1/ai-parse-recipe",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // Note: In a real app, we'd use the user's session token
                apikey: (window as any).electronAPI?.getSupabaseKey?.() || "",
              },
              body: JSON.stringify({ imageBase64: base64 }),
            }
          );

          if (!response.ok) throw new Error("AI Scan failed");
          const data = await response.json();

          // Map AI results to the form
          if (data && data.name) {
            // Find ingredient IDs for the names returned by AI
            const mappedIngredients = (data.ingredients || []).map(
              (aiIng: any) => {
                const matched = ingredients.find((i) =>
                  i.name.toLowerCase().includes(aiIng.name.toLowerCase())
                );

                const unit = aiIng.unit || matched?.base_unit || "g";
                const qty = aiIng.quantity || 0;
                const baseQty = matched
                  ? convertUnit(qty, unit, matched.base_unit)
                  : qty;

                return {
                  ingredient_id: matched?.id || "",
                  name: matched?.name || aiIng.name + " (Chưa có)",
                  quantity: qty,
                  unit: unit,
                  cost: baseQty * (matched?.unit_cost || 0),
                };
              }
            );

            setNewRecipe({
              name: data.name,
              price: data.price || 0,
              category: data.category || "",
              ingredients: mappedIngredients,
            });
            alert(`✨ AI đã trích xuất: ${data.name} (${data.confidence}%)`);
          }
        };
      } catch (err: any) {
        alert("Lỗi quét AI: " + err.message);
      } finally {
        setScanning(false);
      }
    };

    input.click();
  }

  function calculateCOGS(items: Recipe["ingredients"]) {
    return items.reduce((sum, i) => sum + i.cost, 0);
  }

  function addIngredientToRecipe(ing: Ingredient) {
    if (newRecipe.ingredients.find((i) => i.ingredient_id === ing.id)) return;
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          ingredient_id: ing.id,
          name: ing.name,
          quantity: 1,
          unit: ing.base_unit,
          cost: ing.unit_cost,
        },
      ],
    }));
  }

  function updateIngredient(
    ingredientId: string,
    updates: Partial<Recipe["ingredients"][0]>
  ) {
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((i) => {
        if (i.ingredient_id !== ingredientId) return i;

        const matched = ingredients.find((ing) => ing.id === ingredientId);
        const newUnit = updates.unit || i.unit;
        const newQty =
          updates.quantity !== undefined ? updates.quantity : i.quantity;

        let newCost = i.cost;
        if (matched) {
          const baseQty = convertUnit(newQty, newUnit, matched.base_unit);
          newCost = baseQty * matched.unit_cost;
        }

        return { ...i, ...updates, cost: newCost };
      }),
    }));
  }

  function removeIngredient(ingredientId: string) {
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter(
        (i) => i.ingredient_id !== ingredientId
      ),
    }));
  }

  async function saveRecipe() {
    // TODO: Save via IPC
    console.log("Saving recipe:", newRecipe);
    setNewRecipe({ name: "", price: 0, category: "", ingredients: [] });
  }

  const cogs = calculateCOGS(newRecipe.ingredients);
  const profit = newRecipe.price - cogs;
  const margin = newRecipe.price > 0 ? (profit / newRecipe.price) * 100 : 0;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🍳 Quản lý Công thức</h2>
      <p style={styles.subtitle}>Nhập liệu nhanh trên PC, sync xuống Mobile</p>

      <div style={styles.grid}>
        {/* Form */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>
            <span>Tạo món mới</span>
            <button
              onClick={handleAIScan}
              disabled={scanning}
              style={{ ...styles.aiButton, opacity: scanning ? 0.6 : 1 }}
            >
              {scanning ? "⌛ Đang quét..." : "📷 Tự tạo bằng AI"}
            </button>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tên món</label>
            <input
              value={newRecipe.name}
              onChange={(e) =>
                setNewRecipe((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="VD: Trà Đào"
              style={styles.input}
            />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Giá bán (đ)</label>
              <input
                type="number"
                value={newRecipe.price}
                onChange={(e) =>
                  setNewRecipe((p) => ({ ...p, price: Number(e.target.value) }))
                }
                style={styles.input}
              />
            </div>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.label}>Danh mục</label>
              <input
                value={newRecipe.category}
                onChange={(e) =>
                  setNewRecipe((p) => ({ ...p, category: e.target.value }))
                }
                placeholder="VD: Trà"
                style={styles.input}
              />
            </div>
          </div>

          {/* Ingredients */}
          <div style={styles.field}>
            <label style={styles.label}>Nguyên liệu</label>
            {newRecipe.ingredients.map((ing) => (
              <div key={ing.ingredient_id} style={styles.ingRow}>
                <span style={{ flex: 1, fontWeight: 500 }}>{ing.name}</span>
                <input
                  type="number"
                  value={ing.quantity}
                  onChange={(e) =>
                    updateIngredient(ing.ingredient_id, {
                      quantity: Number(e.target.value),
                    })
                  }
                  style={{ ...styles.input, width: 80 }}
                />

                {/* Unit Selector */}
                <select
                  value={ing.unit}
                  onChange={(e) =>
                    updateIngredient(ing.ingredient_id, {
                      unit: e.target.value,
                    })
                  }
                  style={{ ...styles.input, width: 80, padding: "8px 4px" }}
                >
                  {getAvailableUnits(ing.unit).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <span
                  style={{
                    color: "#55A630",
                    width: 100,
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  = {ing.cost.toLocaleString("vi-VN")} đ
                </span>
                <button
                  onClick={() => removeIngredient(ing.ingredient_id)}
                  style={styles.removeBtn}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add ingredient dropdown */}
          <select
            onChange={(e) => {
              const ing = ingredients.find((i) => i.id === e.target.value);
              if (ing) addIngredientToRecipe(ing);
              e.target.value = "";
            }}
            style={{ ...styles.input, marginBottom: 16 }}
          >
            <option value="">+ Thêm nguyên liệu...</option>
            {ingredients
              .filter(
                (i) =>
                  !newRecipe.ingredients.find((ni) => ni.ingredient_id === i.id)
              )
              .map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} ({ing.unit_cost.toLocaleString("vi-VN")} đ/
                  {ing.base_unit})
                </option>
              ))}
          </select>

          {/* Summary */}
          <div style={styles.summary}>
            <div style={styles.summaryRow}>
              <span>Giá vốn (COGS)</span>
              <span>{cogs.toLocaleString("vi-VN")} đ</span>
            </div>
            <div style={styles.summaryRow}>
              <span>Lãi gộp</span>
              <span style={{ color: profit >= 0 ? "#55A630" : "#EF4444" }}>
                {profit.toLocaleString("vi-VN")} đ
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span>Biên lợi nhuận</span>
              <span
                style={{
                  color:
                    margin >= 50
                      ? "#55A630"
                      : margin >= 30
                      ? "#F59E0B"
                      : "#EF4444",
                }}
              >
                {margin.toFixed(1)}%
              </span>
            </div>
          </div>

          <button onClick={saveRecipe} style={styles.saveBtn}>
            💾 Lưu công thức
          </button>
        </div>

        {/* Recipe list */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Danh sách món</h3>
          {recipes.length === 0 ? (
            <p style={{ color: "#64748B" }}>Chưa có món nào</p>
          ) : (
            recipes.map((r) => (
              <div key={r.id} style={styles.recipeItem}>
                <span>{r.name}</span>
                <span style={{ color: "#55A630" }}>
                  {r.price.toLocaleString("vi-VN")} đ
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 24,
    backgroundColor: COLORS.background,
    minHeight: "100vh",
  },
  title: { margin: 0, fontSize: 20, color: COLORS.textPrimary },
  subtitle: { color: COLORS.textSecondary, marginTop: 4, marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    border: `1px solid ${COLORS.border}`,
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: 16,
    color: COLORS.textPrimary,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  field: { marginBottom: 12 },
  label: {
    display: "block",
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#F5F5F5",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  row: { display: "flex", gap: 12 },
  ingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    marginBottom: 8,
    color: COLORS.textPrimary,
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: COLORS.error,
    cursor: "pointer",
    fontSize: 14,
  },
  summary: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    border: `1px solid ${COLORS.border}`,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  saveBtn: {
    width: "100%",
    padding: 12,
    backgroundColor: COLORS.positive,
    border: "none",
    borderRadius: 8,
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
  recipeItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.textPrimary,
  },
  aiButton: {
    padding: "6px 12px",
    backgroundColor: "transparent",
    color: COLORS.primary,
    border: `1px solid ${COLORS.primary}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
};
