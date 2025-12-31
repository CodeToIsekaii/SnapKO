/**
 * AI Parse Sales - Edge Function
 * Per .antigravityrules Section D.2: Sales Snap
 *
 * Uses Gemini 1.5 Flash to extract:
 * - Menu items and quantities sold from POS Z-Report
 * - Maps to recipes for ingredient deduction
 * - Sales deduct from SERVICE area only (Quầy Bar)
 */

// deno-lint-ignore-file
import { createClient, SupabaseClient } from "supabase";

// Simple type alias to avoid complex generic type inference issues
type SupabaseClientType = SupabaseClient<Record<string, unknown>>;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SoldItem {
  menu_item_name: string;
  quantity_sold: number;
  unit_price?: number;
  total_revenue?: number;
  confidence: number;
}

interface ParsedSalesReport {
  report_date?: string;
  shift?: string;
  total_revenue?: number;
  items_sold: SoldItem[];
  overall_confidence: number;
  raw_text?: string;
}

// Gemini prompt for POS report parsing
const SALES_PROMPT = `Bạn là một AI chuyên đọc và phân tích báo cáo bán hàng (Z-Report) cho nhà hàng/quán bar tại Việt Nam.

Hãy phân tích hình ảnh báo cáo POS này và trả về JSON với format sau:
{
  "report_date": "ngày báo cáo (YYYY-MM-DD)",
  "shift": "ca làm việc nếu có (morning/afternoon/evening/full_day)",
  "total_revenue": tổng doanh thu (số),
  "items_sold": [
    {
      "menu_item_name": "tên món (chuẩn hóa)",
      "quantity_sold": số lượng bán (số nguyên),
      "unit_price": đơn giá nếu có (số),
      "total_revenue": doanh thu món này nếu có (số),
      "confidence": độ tin cậy 0-100
    }
  ],
  "overall_confidence": độ tin cậy tổng thể 0-100
}

LƯU Ý QUAN TRỌNG:
- Trả về JSON thuần túy, KHÔNG có markdown code blocks
- Số liệu phải là số, không phải string
- Chuẩn hóa tên món (ví dụ: "Cà phê sữa đá" thay vì "cf sữa đá")
- Nếu là báo cáo tổng hợp nhiều ca, để shift = "full_day"
- Đơn vị tiền tệ là VND`;

async function callGemini(imageBase64: string): Promise<ParsedSalesReport> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SALES_PROMPT },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  try {
    return JSON.parse(text);
  } catch {
    return {
      items_sold: [],
      overall_confidence: 0,
      raw_text: text,
    };
  }
}

interface DeductedIngredient {
  ingredient_id: string;
  ingredient_name: string;
  deducted_qty: number;
  unit: string;
  unit_cost?: number;
}

interface IngredientData {
  id: string;
  name: string;
  base_unit: string;
  average_unit_cost: number | null;
}

interface RecipeIngredientWithJoin {
  quantity_needed: number;
  ingredient: IngredientData | null;
}

async function calculateDeductions(
  supabase: SupabaseClientType,
  businessId: string,
  soldItems: (SoldItem & { recipe_id?: string })[]
): Promise<DeductedIngredient[]> {
  const deductions: Map<string, DeductedIngredient> = new Map();

  for (const item of soldItems) {
    if (!item.recipe_id) continue;

    // Get recipe ingredients
    const { data: recipeIngredients } = (await supabase
      .from("recipe_ingredients")
      .select(
        `
        quantity_needed,
        ingredient:ingredients(id, name, base_unit, average_unit_cost)
      `
      )
      .eq("recipe_id", item.recipe_id)) as {
      data: RecipeIngredientWithJoin[] | null;
    };

    if (!recipeIngredients) continue;

    for (const ri of recipeIngredients) {
      const ing = ri.ingredient;
      if (!ing) continue;

      const deductedQty = ri.quantity_needed * item.quantity_sold;
      const existing = deductions.get(ing.id);

      if (existing) {
        existing.deducted_qty += deductedQty;
      } else {
        deductions.set(ing.id, {
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          deducted_qty: deductedQty,
          unit: ing.base_unit,
          unit_cost: ing.average_unit_cost ?? undefined,
        });
      }
    }
  }

  return Array.from(deductions.values());
}

interface RecipeData {
  id: string;
  name: string;
}

async function matchRecipes(
  supabase: SupabaseClientType,
  businessId: string,
  items: SoldItem[]
): Promise<(SoldItem & { recipe_id?: string })[]> {
  // Get existing recipes for this business
  const { data: recipes } = (await supabase
    .from("recipes")
    .select("id, name")
    .eq("business_id", businessId)) as { data: RecipeData[] | null };

  if (!recipes) return items;

  // Simple fuzzy matching
  return items.map((item) => {
    const match = recipes.find(
      (recipe) =>
        recipe.name.toLowerCase().includes(item.menu_item_name.toLowerCase()) ||
        item.menu_item_name.toLowerCase().includes(recipe.name.toLowerCase())
    );

    return {
      ...item,
      recipe_id: match?.id,
    };
  });
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { image_base64, business_id } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ success: false, error: "image_base64 is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!business_id) {
      return new Response(
        JSON.stringify({ success: false, error: "business_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse sales report with Gemini
    const parsed = await callGemini(image_base64);

    // Match items to existing recipes
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const matchedItems = await matchRecipes(
      supabase,
      business_id,
      parsed.items_sold
    );

    // Calculate ingredient deductions based on recipes
    const deductions = await calculateDeductions(
      supabase,
      business_id,
      matchedItems
    );

    return new Response(
      JSON.stringify({
        success: true,
        report_date: parsed.report_date,
        shift: parsed.shift,
        total_revenue: parsed.total_revenue,
        items_sold: matchedItems,
        items_deducted: deductions,
        confidence: parsed.overall_confidence,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error parsing sales report:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
