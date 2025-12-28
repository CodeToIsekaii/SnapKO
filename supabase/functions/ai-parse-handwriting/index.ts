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

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface StockItem {
  ingredient_name: string;
  stock_qty: number; // Tồn cuối (Closing Stock)
  import_qty: number; // Nhập trong ca (Import from Warehouse, default 0)
  unit?: string;
  confidence: number;
  needs_review: boolean; // True if AI is uncertain
  raw_text?: string; // Original text for debugging
}

interface ParsedStockSheet {
  check_type?: "warehouse" | "bar"; // STORAGE vs SERVICE
  items: StockItem[];
  overall_confidence: number;
  raw_text?: string;
  warnings: string[];
}

// Gemini prompt for handwritten stock sheet OCR
// Per UPDATED .antigravityrules: Must read "Tồn cuối" AND "Nhập/Import" columns
const HANDWRITING_PROMPT = `Bạn là một AI chuyên đọc chữ viết tay tiếng Việt trên phiếu kiểm kho của nhà hàng/quán bar.

QUAN TRỌNG - "SMART SHEET" FEATURE:
Phiếu kiểm thường có 2 CỘT SỐ LIỆU:
1. **Cột "TỒN CUỐI"** (hoặc "Tồn", "Closing"): Số lượng đếm được cuối ca
2. **Cột "NHẬP"** (hoặc "Import", "Nhập vào"): Số lượng nhập từ Kho Tổng trong ca

NẾU CỘT NHẬP ĐỂ TRỐNG hoặc GẠCH NGANG (-), trả về import_qty = 0, KHÔNG trả về null.

Chữ viết tay nhân viên thường:
- Viết tắt (VD: "bơ" = bơ, "sr" = sữa rút, "cf" = cà phê)
- Số viết ẩu, khó đọc
- Bôi xóa, gạch ngang

Hãy phân tích hình ảnh phiếu kiểm này và trả về JSON với format sau:
{
  "check_type": "bar",
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

QUY TẮC QUAN TRỌNG:
1. Trả về JSON thuần túy, KHÔNG có markdown
2. Số liệu phải là số, không phải string
3. Nếu confidence < 85, đặt needs_review = true
4. Nếu không đọc được số TỒN, trả về stock_qty = 0 và needs_review = true
5. Nếu cột NHẬP để trống hoặc gạch ngang, trả về import_qty = 0 (KHÔNG null)
6. Chuẩn hóa tên nguyên liệu (VD: "sr" → "Sữa tươi", "cf" → "Cà phê")
7. Thêm warning nếu phát hiện chữ bị gạch xóa hoặc sửa`;

async function callGemini(imageBase64: string): Promise<ParsedStockSheet> {
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
              { text: HANDWRITING_PROMPT },
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
          temperature: 0.2, // Slightly higher for creative interpretation of messy handwriting
          maxOutputTokens: 4096, // Stock sheets can have many items
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
    // Ensure all items have needs_review flag
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
  // Get existing ingredients for this business
  const { data: ingredients } = (await supabase
    .from("ingredients")
    .select("id, name, base_unit")
    .eq("business_id", businessId)
    .eq("archived", false)) as {
    data: { id: string; name: string; base_unit: string }[] | null;
  };

  if (!ingredients) return items;

  // Fuzzy matching with Vietnamese normalization
  return items.map((item) => {
    const normalizedName = item.ingredient_name.toLowerCase().trim();

    // Try exact match first
    let match = ingredients.find(
      (ing) => ing.name.toLowerCase() === normalizedName
    );

    // Try partial match
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
      // If no match found, mark for review
      needs_review: item.needs_review || !match,
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
    const { image_base64, business_id, area_type } = await req.json();

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

    // Parse handwritten stock sheet with Gemini
    const parsed = await callGemini(image_base64);

    // Match items to existing ingredients
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const matchedItems = await matchIngredients(
      supabase as SupabaseClient<unknown>,
      business_id,
      parsed.items
    );

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
