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
import { createClient, SupabaseClient } from "supabase";
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

Hãy phân tích hình ảnh phiếu kiểm này và trả về JSON với format sau:
{
  "check_type": "${area}",
  "items": [
    {
      "ingredient_name": "tên nguyên liệu (chuẩn hóa)",
      "stock_qty": số lượng TỒN CUỐI (số),
      "import_qty": số lượng NHẬP trong ca (số, mặc định 0),
      "unit": "đơn vị nếu có",
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
5. Chuẩn hóa tên: "sr" -> "Sữa tươi", "cf" -> "Cà phê", "bơ" -> "Bơ".`;
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

async function matchIngredients(
  supabase: SupabaseClient<unknown>,
  businessId: string,
  items: StockItem[]
): Promise<(StockItem & { ingredient_id?: string })[]> {
  const { data: ingredients } = (await supabase
    .from("ingredients")
    .select("id, name, base_unit")
    .eq("business_id", businessId)
    .eq("archived", false)) as {
    data: { id: string; name: string; base_unit: string }[] | null;
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

    return {
      ...item,
      ingredient_id: match?.id,
      unit: item.unit || match?.base_unit,
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
