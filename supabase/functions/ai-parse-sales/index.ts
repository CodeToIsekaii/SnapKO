/**
 * AI Parse Sales - Edge Function (Google Cloud Vision OCR)
 * Per .antigravityrules Section D.2: Sales Snap
 *
 * Uses Google Cloud Vision API for OCR + Classic Line Clustering:
 * - Extract words with bounding boxes from POS Z-Report images
 * - Cluster words into lines using 60% height tolerance (handles paper warp)
 * - Parse clean lines with regex to extract Name/Qty/Price
 */

// deno-lint-ignore-file
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/retry.ts";

type SupabaseClientType = SupabaseClient<Record<string, unknown>>;

const GOOGLE_CLOUD_API_KEY = Deno.env.get("GOOGLE_CLOUD_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ==================== TYPE DEFINITIONS ====================
interface SoldItem {
  menu_item_name: string;
  quantity_sold: number;
  unit_price?: number;
  total_revenue?: number;
  confidence: number;
}

interface SimpleWord {
  text: string;
  x: number;
  y: number;
  height: number;
}

interface Vertex {
  x?: number;
  y?: number;
}

interface BoundingPoly {
  vertices?: Vertex[];
}

interface Symbol {
  text?: string;
}

interface Word {
  symbols?: Symbol[];
  boundingBox?: BoundingPoly;
}

interface Paragraph {
  words?: Word[];
}

interface Block {
  paragraphs?: Paragraph[];
}

interface Page {
  blocks?: Block[];
}

interface FullTextAnnotation {
  text: string;
  pages?: Page[];
}

interface VisionResponse {
  responses: {
    textAnnotations?: { description: string }[];
    fullTextAnnotation?: FullTextAnnotation;
    error?: { message: string };
  }[];
}

// ==================== GOOGLE CLOUD VISION OCR ====================
async function callGoogleVision(
  imageBase64: string,
): Promise<FullTextAnnotation | null> {
  if (!GOOGLE_CLOUD_API_KEY) {
    throw new Error("GOOGLE_CLOUD_API_KEY not configured");
  }

  const response = await fetchWithRetry(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Vision API error: ${error}`);
  }

  const data: VisionResponse = await response.json();

  if (data.responses[0]?.error) {
    throw new Error(`Vision error: ${data.responses[0].error.message}`);
  }

  return data.responses[0]?.fullTextAnnotation || null;
}

// ==================== CLASSIC LINE CLUSTERING ====================

// Extract words with their basic coordinates
function extractSimpleWords(visionResult: FullTextAnnotation): SimpleWord[] {
  const words: SimpleWord[] = [];
  const pages = visionResult.pages || [];

  pages.forEach((page) => {
    page.blocks?.forEach((block) => {
      block.paragraphs?.forEach((paragraph) => {
        paragraph.words?.forEach((word) => {
          const text = word.symbols?.map((s) => s.text || "").join("") || "";
          const vertices = word.boundingBox?.vertices || [];

          if (vertices.length >= 4 && text) {
            const yCoords = vertices.map((v) => v.y || 0);
            const xCoords = vertices.map((v) => v.x || 0);
            const minY = Math.min(...yCoords);
            const maxY = Math.max(...yCoords);
            const minX = Math.min(...xCoords);

            words.push({
              text,
              x: minX,
              y: minY, // Top edge for sorting
              height: maxY - minY,
            });
          }
        });
      });
    });
  });

  console.log(`[extractWords] Found ${words.length} words`);
  return words;
}

// Cluster words into lines based on relative height tolerance
function clusterLines(words: SimpleWord[]): string[] {
  if (words.length === 0) return [];

  // Step 1: Sort all words top-to-bottom
  words.sort((a, b) => a.y - b.y);

  const lines: SimpleWord[][] = [];

  for (const word of words) {
    let added = false;

    // Step 2: Check last 5 lines to find matching line (handles OCR jumps)
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const currentLine = lines[i];
      const lineY = currentLine[0].y;
      const lineHeight = currentLine[0].height || 20; // Default height if 0

      // Allow 60% height tolerance for paper warp
      if (Math.abs(word.y - lineY) < lineHeight * 0.6) {
        currentLine.push(word);
        added = true;
        break;
      }
    }

    // No matching line found -> create new line
    if (!added) {
      lines.push([word]);
    }
  }

  // Step 3: Sort words left-to-right within each line, then join
  const result = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    return line.map((w) => w.text).join(" ");
  });

  console.log(
    `[clusterLines] Created ${result.length} lines from ${words.length} words`,
  );
  return result;
}

// ==================== REGEX PARSER ====================

// Junk line filter
function isJunkLine(text: string): boolean {
  const junkKeywords = [
    "DOANH THU",
    "NGÀY",
    "GIỜ",
    "TỔNG",
    "THANH TOÁN",
    "WIFI",
    "PASS",
    "QUAY LẠI",
    "TRANG",
    "PAGE",
    "VAT",
    "THUẾ",
    "KHÁCH HÀNG",
    "HÓA ĐƠN",
    "INVOICE",
    "RECEIPT",
    "BÁO CÁO",
    "REPORT",
    "CA ",
    "SHIFT",
    "SL",
    "ĐVT",
    "ĐƠN GIÁ",
    "THÀNH TIỀN",
    "STT",
    "CỘNG",
  ];
  const upper = text.toUpperCase();
  return junkKeywords.some((k) => upper.includes(k));
}

// Parse clustered lines into items
function parseClusteredLines(rawLines: string[]): SoldItem[] {
  const items: SoldItem[] = [];
  let bufferName = ""; // Buffer for multi-line names

  // Regex: Full line "Name Qty Price" (e.g., "Cafe Sữa 2 150,000")
  const fullLineRegex = /^(.*?)\s+(\d+)\s+([\d,.]+)$/;
  // Regex: Price only at end (e.g., "150,000")
  const priceOnlyRegex = /([\d,.]+)$/;

  for (let line of rawLines) {
    line = line.trim();

    // Skip short/junk lines
    if (line.length < 3) continue;
    if (isJunkLine(line)) {
      bufferName = ""; // Reset buffer on junk
      continue;
    }

    // Try matching full structure: Name - Qty - Price
    const fullMatch = line.match(fullLineRegex);

    if (fullMatch) {
      let name = fullMatch[1].trim();
      const qty = parseInt(fullMatch[2], 10);
      const price = parseInt(fullMatch[3].replace(/[,.]/g, ""), 10);

      // Prepend buffer if exists (multi-line name)
      if (bufferName) {
        name = bufferName.trim() + " " + name;
        bufferName = "";
      }

      // Clean name
      name = name.replace(/^[-*]\s*/, "").trim();

      if (qty > 0 && qty < 100 && price > 1000 && name.length > 1) {
        items.push({
          menu_item_name: name,
          quantity_sold: qty,
          total_revenue: price,
          unit_price: Math.round(price / qty),
          confidence: 95,
        });
        console.log(`[parse] Full match: "${name}" x${qty} = ${price}`);
      }
    } else {
      // No full match - check for price at end
      const priceMatch = line.match(priceOnlyRegex);

      if (priceMatch && priceMatch[0].length > 4) {
        // Has price but missing structure
        const priceRaw = priceMatch[0];
        const priceVal = parseInt(priceRaw.replace(/[,.]/g, ""), 10);

        // Extract name (everything before price)
        let namePart = line.substring(0, line.lastIndexOf(priceRaw)).trim();

        // Try to extract qty stuck at end of name (e.g., "Cafe Sữa 1")
        const messyQtyMatch = namePart.match(/(\d+)$/);
        let qty = 1; // Default

        if (messyQtyMatch) {
          qty = parseInt(messyQtyMatch[1], 10);
          namePart = namePart
            .substring(0, namePart.lastIndexOf(messyQtyMatch[1]))
            .trim();
        }

        // Prepend buffer
        if (bufferName) {
          namePart = bufferName.trim() + " " + namePart;
          bufferName = "";
        }

        namePart = namePart.replace(/^[-*]\s*/, "").trim();

        if (namePart.length > 2 && priceVal > 1000 && qty > 0 && qty < 100) {
          items.push({
            menu_item_name: namePart,
            quantity_sold: qty,
            total_revenue: priceVal,
            unit_price: Math.round(priceVal / qty),
            confidence: 90,
          });
          console.log(
            `[parse] Price-only match: "${namePart}" x${qty} = ${priceVal}`,
          );
        }
      } else {
        // No price found - probably multi-line name continuation
        // Only buffer if not just numbers
        if (!line.match(/^[\d\s]+$/)) {
          bufferName += " " + line;
        }
      }
    }
  }

  console.log(`[parse] Total items extracted: ${items.length}`);
  return items;
}

// Main parser function
function parseReceiptWithClustering(
  visionResult: FullTextAnnotation,
): SoldItem[] {
  const words = extractSimpleWords(visionResult);
  const clusteredLines = clusterLines(words);

  // Debug: log first 15 lines
  console.log("[parseReceipt] Clustered lines (first 15):");
  clusteredLines.slice(0, 15).forEach((line, idx) => {
    console.log(`  ${idx + 1}: ${line}`);
  });

  return parseClusteredLines(clusteredLines);
}

// ==================== RECIPE MATCHING & DEDUCTIONS ====================
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
  soldItems: (SoldItem & { recipe_id?: string; resale_item_id?: string })[],
): Promise<DeductedIngredient[]> {
  const deductions: Map<string, DeductedIngredient> = new Map();

  for (const item of soldItems) {
    if (item.resale_item_id) {
      const { data: rawResaleItem } = await supabase
        .from("ingredients")
        .select("id, name, base_unit, average_unit_cost")
        .eq("id", item.resale_item_id)
        .single();

      const resaleItem = rawResaleItem as IngredientData | null;

      if (resaleItem) {
        const existing = deductions.get(resaleItem.id);
        if (existing) {
          existing.deducted_qty += item.quantity_sold;
        } else {
          deductions.set(resaleItem.id, {
            ingredient_id: resaleItem.id,
            ingredient_name: resaleItem.name,
            deducted_qty: item.quantity_sold,
            unit: resaleItem.base_unit,
            unit_cost: resaleItem.average_unit_cost ?? undefined,
          });
        }
      }
      continue;
    }

    if (!item.recipe_id) continue;

    const { data: recipeIngredients } = (await supabase
      .from("recipe_ingredients")
      .select(
        `
        quantity_needed,
        ingredient:ingredients(id, name, base_unit, average_unit_cost)
      `,
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

async function matchRecipesAndResaleItems(
  supabase: SupabaseClientType,
  businessId: string,
  items: SoldItem[],
): Promise<(SoldItem & { recipe_id?: string; resale_item_id?: string })[]> {
  const { data: recipes } = (await supabase
    .from("recipes")
    .select("id, name")
    .eq("business_id", businessId)) as { data: RecipeData[] | null };

  const { data: resaleItems } = (await supabase
    .from("ingredients")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("type", "resale_item")) as { data: RecipeData[] | null };

  return items.map((item) => {
    const itemNameLower = item.menu_item_name.toLowerCase();

    const recipeMatch = (recipes ?? []).find(
      (recipe) =>
        recipe.name.toLowerCase().includes(itemNameLower) ||
        itemNameLower.includes(recipe.name.toLowerCase()),
    );

    if (recipeMatch) {
      return { ...item, recipe_id: recipeMatch.id };
    }

    const resaleMatch = (resaleItems ?? []).find(
      (resale) =>
        resale.name.toLowerCase().includes(itemNameLower) ||
        itemNameLower.includes(resale.name.toLowerCase()),
    );

    if (resaleMatch) {
      return { ...item, resale_item_id: resaleMatch.id };
    }

    return { ...item };
  });
}

// ==================== MAIN HANDLER ====================
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
    const { image_base64, images_base64, business_id } = await req.json();

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
      `[ai-parse-sales] Processing ${images.length} image(s) with Classic Line Clustering...`,
    );

    // Process all images
    const allItems: SoldItem[] = [];
    let debugInfo = "";

    for (let i = 0; i < images.length; i++) {
      console.log(`[ai-parse-sales] OCR image ${i + 1}/${images.length}...`);

      const visionResult = await callGoogleVision(images[i]);

      if (!visionResult) {
        console.log(`[ai-parse-sales] No text found in image ${i + 1}`);
        continue;
      }

      debugInfo += `=== Image ${i + 1} ===\n`;
      debugInfo += visionResult.text.slice(0, 500) + "\n";

      // Parse using Classic Line Clustering
      const sliceItems = parseReceiptWithClustering(visionResult);
      allItems.push(...sliceItems);
    }

    console.log(
      `[ai-parse-sales] Total items from all images: ${allItems.length}`,
    );

    // Aggregate duplicate items by name
    const aggregatedItems = Object.values(
      allItems.reduce(
        (acc, item) => {
          const key = item.menu_item_name.trim().toLowerCase();
          if (!acc[key]) {
            acc[key] = { ...item };
          } else {
            acc[key].quantity_sold += item.quantity_sold;
            if (item.total_revenue && acc[key].total_revenue) {
              acc[key].total_revenue =
                (acc[key].total_revenue || 0) + item.total_revenue;
            }
            acc[key].confidence = Math.max(
              acc[key].confidence,
              item.confidence,
            );
          }
          return acc;
        },
        {} as Record<string, SoldItem>,
      ),
    ) as SoldItem[];

    console.log(
      `[ai-parse-sales] Aggregated: ${allItems.length} -> ${aggregatedItems.length} unique items`,
    );

    // Match to recipes and calculate deductions
    let matchedItems = aggregatedItems.map((item) => ({ ...item }));
    let deductions: DeductedIngredient[] = [];

    if (business_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      matchedItems = await matchRecipesAndResaleItems(
        supabase,
        business_id,
        aggregatedItems,
      );
      deductions = await calculateDeductions(
        supabase,
        business_id,
        matchedItems,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        items_sold: matchedItems,
        items_deducted: deductions,
        confidence: 95,
        raw_text: debugInfo.slice(0, 2000),
        ocr_engine: "google_vision_line_clustering",
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
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
      },
    );
  }
});
