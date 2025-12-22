import React, { useState, useEffect } from "react";

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

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
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

  function updateQuantity(ingredientId: string, qty: number) {
    setNewRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((i) =>
        i.ingredient_id === ingredientId
          ? {
              ...i,
              quantity: qty,
              cost:
                qty *
                (ingredients.find((ing) => ing.id === ingredientId)
                  ?.unit_cost ?? 0),
            }
          : i
      ),
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
          <h3 style={styles.cardTitle}>Thêm món mới</h3>

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
                <span style={{ flex: 1 }}>{ing.name}</span>
                <input
                  type="number"
                  value={ing.quantity}
                  onChange={(e) =>
                    updateQuantity(ing.ingredient_id, Number(e.target.value))
                  }
                  style={{ ...styles.input, width: 80 }}
                />
                <span style={{ color: "#64748B", width: 40 }}>{ing.unit}</span>
                <span
                  style={{ color: "#22C55E", width: 100, textAlign: "right" }}
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
              <span style={{ color: profit >= 0 ? "#22C55E" : "#EF4444" }}>
                {profit.toLocaleString("vi-VN")} đ
              </span>
            </div>
            <div style={styles.summaryRow}>
              <span>Biên lợi nhuận</span>
              <span
                style={{
                  color:
                    margin >= 50
                      ? "#22C55E"
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
                <span style={{ color: "#22C55E" }}>
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
  container: { padding: 24 },
  title: { margin: 0, fontSize: 20, color: "white" },
  subtitle: { color: "#64748B", marginTop: 4, marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 },
  card: { backgroundColor: "#1E293B", borderRadius: 12, padding: 20 },
  cardTitle: { margin: "0 0 16px", fontSize: 16, color: "white" },
  field: { marginBottom: 12 },
  label: { display: "block", color: "#94A3B8", fontSize: 12, marginBottom: 4 },
  input: {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "#0F172A",
    border: "none",
    borderRadius: 6,
    color: "white",
    fontSize: 14,
  },
  row: { display: "flex", gap: 12 },
  ingRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 0",
    borderBottom: "1px solid #334155",
    color: "white",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#EF4444",
    cursor: "pointer",
    fontSize: 14,
  },
  summary: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "white",
    marginBottom: 8,
  },
  saveBtn: {
    width: "100%",
    padding: 12,
    backgroundColor: "#22C55E",
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
    borderBottom: "1px solid #334155",
    color: "white",
  },
};
