/**
 * ai-parse-recipe Edge Function
 * Per .antigravityrules: AI-powered recipe extraction
 *
 * Input: Photo of handwritten recipe or menu
 * Output: Recipe name, ingredients list with quantities and units
 */

import { fetchWithRetry } from "../_shared/retry.ts";
import type { RecipeIngredient, ParsedRecipe } from "../_shared/types.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Missing imageBase64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prompt for recipe extraction - UPDATED: Support multiple recipes
    const systemPrompt = `You are an F&B recipe extraction AI. Analyze images of recipes, menus, or handwritten notes.

TASK: Extract ALL recipes from the image. If there are multiple recipes, extract ALL of them.

RETURN JSON with this exact structure - ALWAYS return an array:
{
  "recipes": [
    {
      "name": "Tên món (VD: Cafe Sữa Đá)",
      "category": "Danh mục (VD: Cafe, Trà, Sinh Tố)",
      "price": 25000 or null if not visible,
      "ingredients": [
        { "name": "Cafe bột", "quantity": 25, "unit": "g" },
        { "name": "Sữa đặc", "quantity": 30, "unit": "ml" }
      ],
      "confidence": 85
    }
  ],
  "totalRecipes": 1
}

RULES:
1. EXTRACT ALL RECIPES visible in the image, not just the first one
2. Use Vietnamese names when possible
3. Convert units to standard: g, kg, ml, l, cái, lon, chai
4. If quantity is unclear, estimate based on typical F&B portions
5. Confidence (0-100): How sure you are about each extraction
6. If no recipe found, return: { "recipes": [], "totalRecipes": 0 }`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`;

    const geminiRes = await fetchWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 4096, // Increased for multiple recipes
        },
      }),
    });

    if (!geminiRes.ok) {
      console.error("Gemini API error:", geminiRes.status);
      return new Response(
        JSON.stringify({ error: `AI service error: ${geminiRes.status}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiRes.json();

    // Extract text from response
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    let result: { recipes: ParsedRecipe[]; totalRecipes: number };
    try {
      // Find JSON in response (may have markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Handle both old format (single recipe) and new format (array)
        if (parsed.recipes && Array.isArray(parsed.recipes)) {
          result = parsed;
        } else if (parsed.name) {
          // Old format - single recipe, wrap in array
          result = {
            recipes: [parsed],
            totalRecipes: 1,
          };
        } else {
          result = { recipes: [], totalRecipes: 0 };
        }
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      console.error("Failed to parse AI response:", rawText);
      result = {
        recipes: [],
        totalRecipes: 0,
      };
    }

    // For backward compatibility, also include first recipe fields at root level
    const firstRecipe = result.recipes[0] || {
      name: "",
      ingredients: [],
      confidence: 0,
    };

    return new Response(
      JSON.stringify({
        ...firstRecipe, // Keep backward compatibility
        recipes: result.recipes,
        totalRecipes: result.totalRecipes,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in ai-parse-recipe:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
