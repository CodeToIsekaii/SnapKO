// deno-lint-ignore-file
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/retry.ts";
import Fuse from "https://esm.sh/fuse.js@7.0.0";
import type { StockItem, ParsedStockSheet } from "../_shared/types.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Interface for what AI returns (Pure Transcription)
interface AiTranscriptionItem {
  stt: string | number | null; // Anchor
  name_on_paper: string;
  stock_qty: number | null;
  unit: string | null;
  partial_qty: number | null;
  partial_unit: string | null;
  import_qty: number | null;
  confidence: number;
  raw_text: string;
  needs_review?: boolean;
}

const getPrompt = (model: string, area: string) => {
  const isBarCheck = area === "bar";
  const isStandard = model === "STANDARD";

  const areaNote =
    isStandard && isBarCheck
      ? "NOTE: This is a Bar check. Focus on the IMPORT column (items transferred from Main Storage)."
      : `NOTE: This is a ${isBarCheck ? "Bar" : "Storage"} check. Focus on the ENDING STOCK column.`;

  return `You are a strict data entry clerk that transcribes Vietnamese inventory check sheets into structured JSON.

TASK: Read the handwritten inventory sheet image and extract data row by row.
CRITICAL: Only extract what is VISIBLE on the paper. Do NOT invent data or reference external databases.

INVENTORY MODEL: ${isStandard ? "STANDARD (Dual Storage)" : "SIMPLE (Single Storage)"}
AREA: ${isBarCheck ? "BAR (Service)" : "MAIN STORAGE"}

TABLE STRUCTURE (typical Vietnamese inventory sheet):
| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
|----------|----------|----------|----------|----------|
| STT (Row#) | TEN (Item Name) | DVT (Unit) | TON CUOI (Ending Stock) | NHAP (Imported) |

${areaNote}

EXTRACTION RULES:
1. **STT (Row Number)**: ALWAYS extract the printed row number (1, 2, 3...). This is the ANCHOR to prevent row drift.
2. **CROSSED-OUT NUMBERS**: If a number is scratched out or crossed, IGNORE IT. Only use the final clear number written nearby.
3. **EMPTY/DASH CELLS**: If the quantity cell is empty, has a dash (-), slash (/), or X mark → return null (not 0).
4. **COMPOUND QUANTITIES**: "2 boxes + 150g" → split into stock_qty=2, unit="boxes", partial_qty=150, partial_unit="g".
5. **MATH ADDITION**: If a cell contains numbers added together (e.g. "7 + 32", "10 + 5") and they are the SAME UNIT, CALCULATE THE SUM and return the total as stock_qty. Example: "7 + 32" -> stock_qty: 39.
6. **READ EVERY ROW**: Even if a row has no quantity, include it with null values. Never skip rows.

REQUIRED JSON OUTPUT FORMAT:
{
  "check_type": "${area}",
  "items": [
    {
      "stt": "printed row number (1, 2, 3...)",
      "name_on_paper": "exact item name as printed on paper",
      "stock_qty": number or null,
      "unit": "unit string or null",
      "partial_qty": number or null,
      "partial_unit": "string or null",
      "import_qty": number or 0,
      "confidence": 0-100,
      "raw_text": "original handwritten text seen"
    }
  ],
  "overall_confidence": 0-100,
  "warnings": ["any issues encountered"]
}

GOLDEN RULES:
- Extract STT first for each row to maintain alignment.
- Row 14 with name but no quantity → stock_qty: null (NOT 0, NOT skip).
- NEVER fabricate data. NEVER copy values from adjacent rows.
- Return pure JSON. No markdown code blocks.`;
};

// Accept array of images for multi-page support
async function callGemini(
  imagesBase64: string[],
  model: string,
  area: string,
): Promise<{
  items: AiTranscriptionItem[];
  overall_confidence: number;
  warnings: string[];
  check_type?: string;
}> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = getPrompt(model, area);

  // Build parts array: prompt text + all images
  const parts: {
    text?: string;
    inline_data?: { mime_type: string; data: string };
  }[] = [{ text: prompt }];

  for (const imageBase64 of imagesBase64) {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: imageBase64,
      },
    });
  }

  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192, // Increased for multi-image support
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();

  // Debug: Log full Gemini response structure
  console.log(
    `[ai-parse-handwriting] Gemini raw response: ${JSON.stringify(data).slice(0, 1000)}`,
  );

  // Check for safety blocks or empty candidates
  if (!data.candidates || data.candidates.length === 0) {
    console.error(
      `[ai-parse-handwriting] No candidates returned. Possibly blocked by safety filter.`,
    );
    return {
      items: [],
      overall_confidence: 0,
      warnings: [
        "Gemini không trả về dữ liệu. Có thể bị block bởi safety filter hoặc ảnh không hợp lệ.",
      ],
    };
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Debug: Log the text we're trying to parse
  console.log(`[ai-parse-handwriting] Text to parse: ${text.slice(0, 500)}`);

  if (!text || text.trim() === "") {
    console.error(`[ai-parse-handwriting] Empty text from Gemini`);
    return {
      items: [],
      overall_confidence: 0,
      warnings: ["Gemini trả về text rỗng. Thử chụp lại ảnh rõ hơn."],
    };
  }

  try {
    // Try to extract JSON if it's wrapped in markdown code blocks
    let jsonText = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
      console.log(`[ai-parse-handwriting] Extracted JSON from code block`);
    }

    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch (parseError) {
    console.error(`[ai-parse-handwriting] JSON parse failed: ${parseError}`);
    console.error(`[ai-parse-handwriting] Raw text was: ${text}`);
    return {
      items: [],
      overall_confidence: 0,
      warnings: ["Không thể parse JSON từ Gemini response"],
    };
  }
}

function sanitizeQuantity(
  rawQty: number | string | null | undefined,
): number | null {
  if (rawQty === null || rawQty === undefined || rawQty === "") return null;
  const str = String(rawQty).trim().toLowerCase();

  // Handle empty indicators
  if (["-", "/", "x", "none", "null", "."].includes(str)) return null;

  // Keep numbers and dots
  const numbers = str.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(numbers);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Merge compound quantity (e.g., "2 hộp + 150g") into a single quantity
 * Uses ingredient's unit_weight to convert partial to base unit
 */
function mergeCompoundQuantity(
  stockQty: number,
  _unit: string,
  partialQty: number | null | undefined,
  partialUnit: string | null | undefined,
  unitWeight: number | null | undefined,
  unitWeightUnit: string | null | undefined,
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
  if (partialUnit.toLowerCase() === unitWeightUnit.toLowerCase()) {
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
  items: AiTranscriptionItem[],
): Promise<StockItem[]> {
  // 1. Fetch DB ingredients
  const { data: ingredients } = (await supabase
    .from("ingredients")
    .select("id, name, base_unit, unit_weight, unit_weight_unit, aliases")
    .eq("business_id", businessId)
    .eq("archived", false)) as { data: any[] | null };

  if (!ingredients || ingredients.length === 0) {
    // Fallback if no specific ingredients found, return mapped as raw
    return items.map(
      (item) =>
        ({
          ingredient_name: item.name_on_paper,
          stock_qty: item.stock_qty || 0,
          unit: item.unit || "",
          partial_qty: item.partial_qty,
          partial_unit: item.partial_unit,
          import_qty: item.import_qty || 0,
          confidence: item.confidence,
          needs_review: true,
          linkedIngredientId: undefined,
        }) as any,
    );
  }

  // 2. Setup Fuse.js - handle null aliases safely
  const normalizedIngredients = ingredients.map((ing) => ({
    ...ing,
    aliases: ing.aliases || [], // Ensure aliases is never null
  }));

  const fuse = new Fuse(normalizedIngredients, {
    keys: ["name", "aliases"], // Search in both name and aliases
    threshold: 0.6, // Increased from 0.4 to allow more lenient Vietnamese matching
    ignoreLocation: true,
    includeScore: true, // Enable score for debugging
  });

  console.log(
    `[ai-parse-handwriting] Fuse setup with ${normalizedIngredients.length} ingredients`,
  );

  // 3. Map items
  return items.map((item) => {
    // Sanitize first
    const cleanStockQty = sanitizeQuantity(item.stock_qty);
    const cleanImportQty = sanitizeQuantity(item.import_qty);

    // Fuzzy search - guard against null search term
    const searchTerm = item.name_on_paper || "";
    const searchResult = searchTerm ? fuse.search(searchTerm) : [];
    const bestMatch = searchResult.length > 0 ? searchResult[0].item : null;

    // Debug log for fuzzy matching
    console.log(
      `[ai-parse-handwriting] Fuzzy: "${item.name_on_paper}" -> ${bestMatch ? bestMatch.name : "NO MATCH"} (score: ${searchResult[0]?.score?.toFixed(3) || "N/A"})`,
    );

    // Calculate merged_qty if matched
    let mergedQty: number | undefined;
    if (bestMatch && (item.partial_qty || item.partial_unit)) {
      mergedQty = mergeCompoundQuantity(
        cleanStockQty || 0,
        item.unit || bestMatch.base_unit,
        item.partial_qty,
        item.partial_unit,
        bestMatch.unit_weight,
        bestMatch.unit_weight_unit,
      );
    }

    const isMapped = !!bestMatch;

    return {
      // Map to standard StockItem structure
      ingredient_name: isMapped ? bestMatch.name : item.name_on_paper,
      stock_qty: cleanStockQty || 0,
      unit: item.unit || (isMapped ? bestMatch.base_unit : ""),
      partial_qty: item.partial_qty,
      partial_unit: item.partial_unit,
      import_qty: cleanImportQty || 0,
      confidence: item.confidence,

      // Critical mapping fields
      ingredient_id: bestMatch?.id,
      linkedIngredientId: bestMatch?.id,
      merged_qty: mergedQty,

      // Flags
      needs_review: !isMapped || item.confidence < 85,
      is_new_ingredient: !isMapped,

      // Debug info
      raw_text: item.raw_text,
      stt: item.stt,
      original_name: item.name_on_paper,
    } as any;
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
      images_base64,
      business_id,
      area_type,
      inventory_model = "SIMPLE",
    } = await req.json();

    const images = images_base64 || (image_base64 ? [image_base64] : []);

    if (images.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "image_base64 or images_base64 is required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[ai-parse-handwriting] Processing ${images.length} image(s)...`,
    );

    // 1. Call AI (Pure Transcription)
    const transcription = await callGemini(images, inventory_model, area_type);

    // 2. Output Raw AI for debugging
    console.log(
      `[ai-parse-handwriting] Raw Items: ${transcription.items.length}`,
    );
    if (transcription.items.length > 0) {
      console.log(
        `[ai-parse-handwriting] Sample Raw: ${JSON.stringify(transcription.items[0])}`,
      );
    }

    // 3. Fuzzy Match & Aggregation
    let processedItems: any[] = transcription.items;

    if (business_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      processedItems = await matchIngredients(
        supabase as SupabaseClient<unknown>,
        business_id,
        processedItems,
      );
      console.log(
        `[ai-parse-handwriting] Mapped ${processedItems.length} items. Sample: ${JSON.stringify(processedItems[0])}`,
      );
    }

    return new Response(
      JSON.stringify({
        check_type: area_type,
        items: processedItems,
        overall_confidence: transcription.overall_confidence,
        warnings: transcription.warnings,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(
      `[ai-parse-handwriting] Unexpected error: ${error.message}`,
      error,
    );
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
