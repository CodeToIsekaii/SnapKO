/**
 * ai-parse-recipe Edge Function
 * Per .antigravityrules: AI-powered recipe extraction
 *
 * Input: Photo of handwritten recipe or menu
 * Output: Recipe name, ingredients list with quantities and units
 */

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

interface ParsedRecipe {
  name: string;
  category: string;
  price: number | null;
  ingredients: RecipeIngredient[];
  confidence: number;
}

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

    // Prompt for recipe extraction
    const systemPrompt = `You are an F&B recipe extraction AI. Analyze images of recipes, menus, or handwritten notes.

TASK: Extract recipe data from the image.

RETURN JSON with this exact structure:
{
  "name": "Tên món (VD: Cafe Sữa Đá)",
  "category": "Danh mục (VD: Cafe, Trà, Sinh Tố)",
  "price": 25000 or null if not visible,
  "ingredients": [
    { "name": "Cafe bột", "quantity": 25, "unit": "g" },
    { "name": "Sữa đặc", "quantity": 30, "unit": "ml" },
    { "name": "Đá viên", "quantity": 5, "unit": "cái" }
  ],
  "confidence": 85
}

RULES:
1. Use Vietnamese names when possible
2. Convert units to standard: g, kg, ml, l, cái, lon, chai
3. If quantity is unclear, estimate based on typical F&B portions
4. Confidence (0-100): How sure you are about the extraction
5. If multiple recipes found, return the first/most prominent one
6. If no recipe found, return: { "name": "", "ingredients": [], "confidence": 0 }`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`;

    const geminiRes = await fetch(geminiUrl, {
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
          maxOutputTokens: 2048,
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
    let parsed: ParsedRecipe;
    try {
      // Find JSON in response (may have markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      console.error("Failed to parse AI response:", rawText);
      parsed = {
        name: "",
        category: "",
        price: null,
        ingredients: [],
        confidence: 0,
      };
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in ai-parse-recipe:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
