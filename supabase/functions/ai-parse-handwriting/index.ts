/**
 * AI Parse Handwriting - Edge Function
 * Per .antigravityrules Section D.3: Stock Snap
 *
 * Uses Gemini 1.5 Flash to:
 * - OCR handwritten stock count sheets
 * - Extract ingredient names and quantities
 * - Handle messy Vietnamese handwriting
 * - Return strict JSON schema for validation UI
 *
 * CRITICAL: Chữ viết tay của nhân viên thường rất ẩu
 * Need extra validation step in Mobile app
 */

// deno-lint-ignore-file
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/retry.ts";
import type { StockItem, ParsedStockSheet } from "../_shared/types.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const getPrompt = (model: string, area: string) => {
  const isBarCheck = area === "bar";
  const isStandard = model === "STANDARD";

  const note =
    isStandard && isBarCheck
      ? "LƯU Ý: Đây là kiểm Bar. Hãy đọc kỹ cột NHẬP để ghi nhận hàng chuyển từ Kho Tổng qua."
      : `LƯU Ý: Đây là kiểm ${
          isBarCheck ? "Bar" : "Kho"
        }. Tập trung vào cột TỒN CUỐI.`;

  return `Bạn là một AI chuyên đọc chữ viết tay tiếng Việt trên phiếu kiểm kho.
MÔ HÌNH: ${isStandard ? "STANDARD (Kho Kép: Tổng & Bar)" : "SIMPLE (Kho Đơn)"}
KHU VỰC: ${isBarCheck ? "QUẦY BAR (Service)" : "KHO TỔNG (Storage)"}

QUAN TRỌNG - "SMART SHEET" FEATURE:
Phiếu kiểm thường có 2 CỘT SỐ LIỆU:
1. **Cột "TỒN CUỐI"**: Số lượng đếm được cuối ca.
2. **Cột "NHẬP"**: Số lượng nhập từ Kho Tổng (chỉ có ý nghĩa khi kiểm Bar ở mô hình STANDARD).

${note}

**TÍNH NĂNG MỚI - COMPOUND QUANTITIES:**
Nhân viên thường ghi "2 hộp + 150g" hoặc "3 chai + còn 200ml".
Hãy tách riêng phần nguyên (stock_qty, unit) và phần lẻ (partial_qty, partial_unit).

Hãy phân tích hình ảnh phiếu kiểm này và trả về JSON với format sau:
{
  "check_type": "${area}",
  "items": [
    {
      "ingredient_name": "tên nguyên liệu (chuẩn hóa)",
      "stock_qty": số lượng nguyên (ví dụ: 2 từ "2 hộp + 150g"),
      "unit": "đơn vị chính (ví dụ: hộp)",
      "partial_qty": số lượng lẻ (ví dụ: 150 từ "2 hộp + 150g", mặc định null),
      "partial_unit": "đơn vị lẻ (ví dụ: g, mặc định null)",
      "import_qty": số lượng NHẬP trong ca (số, mặc định 0),
      "confidence": độ tin cậy 0-100,
      "needs_review": true nếu không chắc chắn,
      "raw_text": "văn bản gốc đọc được"
    }
  ],
  "overall_confidence": độ tin cậy tổng thể 0-100,
  "warnings": ["cảnh báo nếu có vấn đề"]
}

QUY TẮC:
1. Trả về JSON thuần túy, KHÔNG markdown.
2. Số liệu là số (number), không phải string.
3. Nếu confidence < 85, đặt needs_review = true.
4. Cột NHẬP trống hoặc gạch ngang → import_qty = 0.
5. Chuẩn hóa tên: "sr" -> "Sữa tươi", "cf" -> "Cà phê", "bơ" -> "Bơ".
6. Nếu có dạng "2 hộp + 150g": stock_qty=2, unit="hộp", partial_qty=150, partial_unit="g".
7. Nếu chỉ có "2 hộp" (không có phần lẻ): partial_qty=null, partial_unit=null.
8. DANH SÁCH ĐƠN VỊ:
   - Đơn vị đếm: chai, lon, gói, hộp, cái, hũ, bịch, túi, cây, bó, thùng, quả
   - Đơn vị khối lượng: g, kg
   - Đơn vị thể tích: ml, L (hoặc lít)`;
};

async function callGemini(
  imageBase64: string,
  model: string,
  area: string
): Promise<ParsedStockSheet> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = getPrompt(model, area);

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
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
    const parsed = JSON.parse(text);
    if (parsed.items) {
      parsed.items = parsed.items.map((item: StockItem) => ({
        ...item,
        needs_review: item.needs_review ?? item.confidence < 85,
      }));
    }
    return parsed;
  } catch {
    return {
      items: [],
      overall_confidence: 0,
      raw_text: text,
      warnings: ["Không thể parse JSON từ Gemini response"],
    };
  }
}

/**
 * Merge compound quantity (e.g., "2 hộp + 150g") into a single quantity
 * Uses ingredient's unit_weight to convert partial to base unit
 *
 * @param stockQty - Main quantity (e.g., 2)
 * @param unit - Main unit (e.g., "hộp")
 * @param partialQty - Partial quantity (e.g., 150)
 * @param partialUnit - Partial unit (e.g., "g")
 * @param unitWeight - Weight per unit (e.g., 500g/hộp)
 * @param unitWeightUnit - Unit of weight (e.g., "g")
 * @returns Merged quantity in base unit
 */
function mergeCompoundQuantity(
  stockQty: number,
  _unit: string,
  partialQty: number | null | undefined,
  partialUnit: string | null | undefined,
  unitWeight: number | null | undefined,
  unitWeightUnit: string | null | undefined
): number {
  // If no partial quantity, return stock_qty as-is
  if (!partialQty || !partialUnit) {
    return stockQty;
  }

  // If no unit_weight defined, can't convert - return stock_qty
  if (!unitWeight || !unitWeightUnit) {
    return stockQty;
  }

  // Check if partial_unit matches unit_weight_unit (simple case)
  // Example: partial_unit="g", unit_weight_unit="g" -> direct division
  if (partialUnit.toLowerCase() === unitWeightUnit.toLowerCase()) {
    // partial in same unit as unit_weight_unit: 150g / 500g = 0.3
    const partialInBaseUnit = partialQty / unitWeight;
    return stockQty + partialInBaseUnit;
  }

  // Handle unit conversions (kg -> g, L -> ml, etc.)
  let normalizedPartialQty = partialQty;
  if (partialUnit === "kg" && unitWeightUnit === "g") {
    normalizedPartialQty = partialQty * 1000;
  } else if (partialUnit === "g" && unitWeightUnit === "kg") {
    normalizedPartialQty = partialQty / 1000;
  } else if (partialUnit === "L" && unitWeightUnit === "ml") {
    normalizedPartialQty = partialQty * 1000;
  } else if (partialUnit === "ml" && unitWeightUnit === "L") {
    normalizedPartialQty = partialQty / 1000;
  }

  const partialInBaseUnit = normalizedPartialQty / unitWeight;
  return stockQty + partialInBaseUnit;
}

async function matchIngredients(
  supabase: SupabaseClient<unknown>,
  businessId: string,
  items: StockItem[]
): Promise<(StockItem & { ingredient_id?: string })[]> {
  const { data: ingredients } = (await supabase
    .from("ingredients")
    .select("id, name, base_unit, unit_weight, unit_weight_unit")
    .eq("business_id", businessId)
    .eq("archived", false)) as {
    data:
      | {
          id: string;
          name: string;
          base_unit: string;
          unit_weight: number | null;
          unit_weight_unit: string | null;
        }[]
      | null;
  };

  if (!ingredients) return items;

  return items.map((item) => {
    const normalizedName = item.ingredient_name.toLowerCase().trim();
    let match = ingredients.find(
      (ing) => ing.name.toLowerCase() === normalizedName
    );

    if (!match) {
      match = ingredients.find(
        (ing) =>
          ing.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(ing.name.toLowerCase())
      );
    }

    // Calculate merged_qty if we have compound quantities
    let mergedQty: number | undefined;
    if (match && (item.partial_qty || item.partial_unit)) {
      mergedQty = mergeCompoundQuantity(
        item.stock_qty,
        item.unit || match.base_unit,
        item.partial_qty,
        item.partial_unit,
        match.unit_weight,
        match.unit_weight_unit
      );
    }

    return {
      ...item,
      ingredient_id: match?.id,
      unit: item.unit || match?.base_unit,
      merged_qty: mergedQty,
      needs_review: item.needs_review || !match,
    };
  });
}

Deno.serve(async (req: Request) => {
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
    const {
      image_base64,
      business_id,
      area_type,
      inventory_model = "SIMPLE",
    } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ success: false, error: "image_base64 is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsed = await callGemini(image_base64, inventory_model, area_type);

    let matchedItems = parsed.items;
    if (business_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      matchedItems = await matchIngredients(
        supabase as SupabaseClient<unknown>,
        business_id,
        parsed.items
      );
    }

    // Count items needing review
    const itemsNeedingReview = matchedItems.filter(
      (item) => item.needs_review
    ).length;

    // Add warning if many items need review
    const warnings = [...(parsed.warnings || [])];
    if (itemsNeedingReview > matchedItems.length * 0.5) {
      warnings.push("Nhiều mục cần kiểm tra lại (chữ viết khó đọc)");
    }

    return new Response(
      JSON.stringify({
        success: true,
        check_type: parsed.check_type || area_type,
        items: matchedItems,
        confidence: parsed.overall_confidence,
        items_needing_review: itemsNeedingReview,
        warnings,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error parsing handwriting:", error);
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
