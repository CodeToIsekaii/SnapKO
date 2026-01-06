import React, { useState, useEffect } from "react";
import { COLORS } from "../styles/theme";
import GuideModal from "../components/GuideModal";
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
  // NEW: Store multiple scanned recipes from AI
  const [scannedRecipes, setScannedRecipes] = useState<any[]>([]);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const ings = (await (window as any).electronAPI?.getIngredients?.()) ?? [];
    setIngredients(ings);
    // Load recipes from IPC
    const recs = (await (window as any).electronAPI?.getRecipes?.()) ?? [];
    setRecipes(recs);
  }

  // Toast notification state
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // AI Scan Logic - Upload Image or Excel file (no camera on Desktop)
  // Per .script Section 4.1: Desktop uses Upload instead of Camera
  async function handleAIScan() {
    // Create hidden file input for image OR Excel
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.xlsx,.xls,.csv"; // Accept images and spreadsheets

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

          // NEW: Handle multiple recipes from AI response
          const recipesToProcess = data.recipes || (data.name ? [data] : []);

          if (recipesToProcess.length > 0) {
            // Map all recipes with ingredient matching
            const mappedRecipes = recipesToProcess.map((recipe: any) => {
              const mappedIngredients = (recipe.ingredients || []).map(
                (aiIng: any) => {
                  const aiName = aiIng.name.toLowerCase().trim();

                  // Better matching: check if AI name contains ingredient OR ingredient contains AI name
                  const matched = ingredients.find((i) => {
                    const ingName = i.name.toLowerCase().trim();
                    // Remove common prefixes/suffixes for better matching
                    const cleanAiName = aiName.replace(
                      /\s*(blend|note|tươi|đậm|nhạt)\s*/gi,
                      ""
                    );
                    const cleanIngName = ingName.replace(
                      /\s*(blend|note|tươi|đậm|nhạt)\s*/gi,
                      ""
                    );

                    return (
                      ingName.includes(cleanAiName) ||
                      cleanAiName.includes(ingName) ||
                      ingName.includes(aiName) ||
                      aiName.includes(ingName)
                    );
                  });

                  const unit = aiIng.unit || matched?.base_unit || "g";
                  const qty = aiIng.quantity || 0;
                  const baseQty = matched
                    ? convertUnit(qty, unit, matched.base_unit)
                    : qty;

                  return {
                    // Use matched id, or generate temp id for unmatched ingredients
                    ingredient_id:
                      matched?.id ||
                      `temp_${Date.now()}_${Math.random()
                        .toString(36)
                        .slice(2, 8)}`,
                    name: matched?.name || aiIng.name + " (Chưa có)",
                    quantity: qty,
                    unit: unit,
                    cost: baseQty * (matched?.unit_cost || 0),
                  };
                }
              );

              return {
                name: recipe.name,
                price: recipe.price || 0,
                category: recipe.category || "",
                ingredients: mappedIngredients,
                confidence: recipe.confidence || 0,
              };
            });

            // Store all scanned recipes
            setScannedRecipes(mappedRecipes);

            // Set first recipe to form
            const firstRecipe = mappedRecipes[0];
            setNewRecipe({
              name: firstRecipe.name,
              price: firstRecipe.price,
              category: firstRecipe.category,
              ingredients: firstRecipe.ingredients,
            });

            // Use toast instead of alert to prevent focus loss
            const totalCount = mappedRecipes.length;
            setToast({
              message:
                totalCount > 1
                  ? `✨ AI đã trích xuất ${totalCount} công thức! Chọn từ danh sách bên dưới.`
                  : `✨ AI đã trích xuất: ${firstRecipe.name} (${firstRecipe.confidence}%)`,
              type: "success",
            });
            setTimeout(() => setToast(null), 5000);
          } else {
            setToast({
              message: "Không tìm thấy công thức trong ảnh",
              type: "error",
            });
            setTimeout(() => setToast(null), 4000);
          }
        };
      } catch (err: any) {
        setToast({ message: "Lỗi quét AI: " + err.message, type: "error" });
        setTimeout(() => setToast(null), 4000);
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
    if (!newRecipe.name.trim()) {
      setToast({ message: "Vui lòng nhập tên món", type: "error" });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    try {
      const recipeData = {
        id: editing?.id || crypto.randomUUID(),
        name: newRecipe.name,
        price: newRecipe.price,
        category: newRecipe.category,
        cogs: calculateCOGS(newRecipe.ingredients),
        ingredients: newRecipe.ingredients,
      };

      // Save via IPC
      await (window as any).electronAPI?.upsertRecipe(recipeData);

      setToast({
        message: editing
          ? "✅ Đã cập nhật công thức!"
          : "✅ Đã thêm công thức mới!",
        type: "success",
      });
      setTimeout(() => setToast(null), 3000);

      // Reset form
      setNewRecipe({ name: "", price: 0, category: "", ingredients: [] });
      setEditing(null);
      setScannedRecipes([]);

      // Reload from database
      await loadData();
    } catch (err) {
      console.error("Failed to save recipe:", err);
      setToast({ message: "❌ Lỗi khi lưu công thức", type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
  }

  const cogs = calculateCOGS(newRecipe.ingredients);
  const profit = newRecipe.price - cogs;
  const margin = newRecipe.price > 0 ? (profit / newRecipe.price) * 100 : 0;

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
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
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Guide Modal */}
      <GuideModal
        title="Hướng dẫn Quản lý Công Thức"
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        sections={[
          {
            title: "AI Scan (Quét Công Thức Thông Minh)",
            content: (
              <>
                <p>
                  <strong>📝 Hỗ trợ:</strong> Ảnh chụp menu, công thức viết tay
                  hoặc file Excel.
                </p>
                <p>
                  <strong>🚀 Tự động:</strong> Hệ thống sẽ tự tách tên món và
                  định lượng. Nếu 1 ảnh chứa nhiều món, bạn có thể chọn món cần
                  lưu từ danh sách.
                </p>
              </>
            ),
          },
          {
            title: "Quy đổi Đơn vị (Unit Normalization)",
            content: (
              <p>
                Bạn nhập hàng theo <strong>Thùng/Kg</strong> nhưng pha chế theo{" "}
                <strong>ml/thìa</strong>? Hệ thống tự động quy đổi dựa trên{" "}
                <strong>Tỷ trọng (Density)</strong> bạn cài ở phần Nguyên Liệu.
                Không cần nhân chia thủ công!
              </p>
            ),
          },
          {
            title: "Giá Vốn (COGS Live)",
            content: (
              <p>
                Giá vốn món ăn được tính <strong>tức thời</strong> (Real-time)
                dựa trên giá nhập nguyên liệu mới nhất. Khi giá Chanh tăng, chi
                phí món "Trà Chanh" sẽ tự động tăng theo.
              </p>
            ),
          },
        ]}
      />

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📜 Quản lý Công Thức</h1>
          <p style={styles.subtitle}>Định lượng và tính giá vốn (Cost)</p>
        </div>
        <div style={styles.headerButtons}>
          <button
            style={{
              padding: "10px 16px",
              backgroundColor: "white",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginRight: 8,
            }}
            onClick={() => setShowGuide(true)}
          >
            ❓ Hướng dẫn
          </button>

          <button
            style={styles.scanButton}
            onClick={handleAIScan}
            disabled={scanning}
          >
            {scanning ? "🤖 Đang quét..." : "📸 AI Scan"}
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {/* Form */}
        <div style={styles.card}>
          {/* The original cardTitle div content is now replaced by the new header structure */}
          {/* The instruction shows `        {scanning ? "⌛ Đang xử lý..." : "📁 Upload ảnh/Excel"}
            </button>
          </div>` which seems to be a partial snippet of the old button.
          I will remove the old `cardTitle` div entirely as it's replaced by the new `styles.header` structure. */}

          {/* Scanned Recipes List - Shows when AI finds multiple recipes */}
          {scannedRecipes.length > 1 && (
            <div
              style={{
                backgroundColor: "#F0FFF0",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                border: "1px solid #6B8E23",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6B8E23",
                  marginBottom: 8,
                }}
              >
                📋 AI tìm thấy {scannedRecipes.length} công thức - Chọn để chỉnh
                sửa:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {scannedRecipes.map((recipe, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setNewRecipe({
                        name: recipe.name,
                        price: recipe.price,
                        category: recipe.category,
                        ingredients: recipe.ingredients,
                      });
                      setToast({
                        message: `Đang chỉnh sửa: ${recipe.name}`,
                        type: "success",
                      });
                      setTimeout(() => setToast(null), 2000);
                    }}
                    style={{
                      padding: "6px 12px",
                      backgroundColor:
                        newRecipe.name === recipe.name ? "#6B8E23" : "white",
                      color:
                        newRecipe.name === recipe.name
                          ? "white"
                          : COLORS.textPrimary,
                      border: "1px solid #6B8E23",
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {recipe.name} ({recipe.confidence}%)
                  </button>
                ))}
              </div>
              <button
                onClick={() => setScannedRecipes([])}
                style={{
                  marginTop: 8,
                  padding: "4px 8px",
                  backgroundColor: "transparent",
                  color: COLORS.textSecondary,
                  border: "none",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                ✕ Đóng danh sách
              </button>
            </div>
          )}

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
                value={newRecipe.price || ""}
                onChange={(e) =>
                  setNewRecipe((p) => ({
                    ...p,
                    price: e.target.value === "" ? 0 : Number(e.target.value),
                  }))
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
                  value={ing.quantity || ""}
                  onChange={(e) =>
                    updateIngredient(ing.ingredient_id, {
                      quantity:
                        e.target.value === "" ? 0 : Number(e.target.value),
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
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span
                    style={{ marginLeft: 8, color: "#55A630", fontSize: 13 }}
                  >
                    {r.price.toLocaleString("vi-VN")} đ
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      setEditing(r);
                      setNewRecipe({
                        name: r.name,
                        price: r.price,
                        category: r.category,
                        ingredients: r.ingredients,
                      });
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      backgroundColor: COLORS.primary,
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Sửa
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Xóa công thức "${r.name}"?`)) {
                        try {
                          if ((window as any).electronAPI?.deleteRecipe) {
                            await (window as any).electronAPI.deleteRecipe(
                              r.id
                            );
                            await loadData(); // Reload from DB
                          } else {
                            setRecipes((prev) =>
                              prev.filter((x) => x.id !== r.id)
                            );
                          }
                          setToast({
                            message: "🗑️ Đã xóa công thức",
                            type: "success",
                          });
                          setTimeout(() => setToast(null), 3000);
                        } catch (err) {
                          console.error("Delete failed:", err);
                        }
                      }
                    }}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      backgroundColor: "#EF4444",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
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
  // Added for GuideModal integration
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  headerButtons: {
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  scanButton: {
    padding: "10px 16px",
    backgroundColor: COLORS.primary,
    color: "white",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
};
