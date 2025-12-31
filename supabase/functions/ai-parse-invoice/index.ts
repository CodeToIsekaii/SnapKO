/**
 * AI Parse Invoice - Edge Function
 * Per .antigravityrules Section D.1: Import Snap
 *
 * Uses Gemini 1.5 Flash to extract:
 * - Item Name, Qty, Unit Price
 * - Invoice number, supplier name, date
 * - Maps items to existing DB ingredients
 */

// deno-lint-ignore-file
import { createClient, SupabaseClient } from "supabase";
import { fetchWithRetry } from "../_shared/retry.ts";

// Simple type alias to avoid complex generic type inference issues
type SupabaseClientType = SupabaseClient<Record<string, unknown>>;

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface InvoiceItem {
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: number;
}

interface ParsedInvoice {
  invoice_number?: string;
  supplier_name?: string;
  invoice_date?: string;
  total_amount?: number;
  items: InvoiceItem[];
  overall_confidence: number;
  raw_text?: string;
}

// Gemini prompt for invoice parsing
const INVOICE_PROMPT = `Bạn là một AI chuyên đọc và phân tích hóa đơn nhập hàng cho nhà hàng/quán bar tại Việt Nam.

Hãy phân tích hình ảnh hóa đơn này và trả về JSON với format sau:
{
  "invoice_number": "số hóa đơn nếu có",
  "supplier_name": "tên nhà cung cấp",
  "invoice_date": "ngày hóa đơn (YYYY-MM-DD)",
  "total_amount": tổng tiền (số),
  "items": [
    {
      "ingredient_name": "tên nguyên liệu",
      "quantity": số lượng (số),
      "unit": "đơn vị (kg, lít, chai, thùng, etc.)",
      "unit_price": đơn giá (số),
      "total_price": thành tiền (số),
      "confidence": độ tin cậy 0-100
    }
  ],
  "overall_confidence": độ tin cậy tổng thể 0-100
}

LƯU Ý QUAN TRỌNG:
- Trả về JSON thuần túy, KHÔNG có markdown code blocks
- Số liệu phải là số, không phải string
- Nếu không đọc được thông tin nào, để null
- Đơn vị tiền tệ là VND
- Chuẩn hóa tên nguyên liệu (ví dụ: "Thịt bò" thay vì "thịt bò úc nhập khẩu")`;

async function callGemini(imageBase64: string): Promise<ParsedInvoice> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: INVOICE_PROMPT },
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
      items: [],
      overall_confidence: 0,
      raw_text: text,
    };
  }
}

interface IngredientData {
  id: string;
  name: string;
}

async function matchIngredients(
  supabase: SupabaseClientType,
  businessId: string,
  items: InvoiceItem[]
): Promise<(InvoiceItem & { ingredient_id?: string })[]> {
  // Get existing ingredients for this business
  const { data: ingredients } = (await supabase
    .from("ingredients")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("archived", false)) as { data: IngredientData[] | null };

  if (!ingredients) return items;

  // Simple fuzzy matching
  return items.map((item) => {
    const match = ingredients.find(
      (ing) =>
        ing.name.toLowerCase().includes(item.ingredient_name.toLowerCase()) ||
        item.ingredient_name.toLowerCase().includes(ing.name.toLowerCase())
    );

    return {
      ...item,
      ingredient_id: match?.id,
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

    // Parse invoice with Gemini
    const parsed = await callGemini(image_base64);

    // Match items to existing ingredients
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const matchedItems = await matchIngredients(
      supabase,
      business_id,
      parsed.items
    );

    return new Response(
      JSON.stringify({
        success: true,
        invoice_number: parsed.invoice_number,
        supplier_name: parsed.supplier_name,
        invoice_date: parsed.invoice_date,
        total_amount: parsed.total_amount,
        items: matchedItems,
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
    console.error("Error parsing invoice:", error);
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
