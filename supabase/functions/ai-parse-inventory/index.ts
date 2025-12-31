// Supabase Edge Function: ai-parse-inventory
// Auth: Optional (returns parse result only)
// Body: { imageBase64: string, mimeType: string }
// Returns: { items: [{ name, quantity, unit, confidence, unitCost? }], rawJson, totalConfidence }

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/retry.ts";

type Body = { imageBase64: string; mimeType: string };

Deno.serve(async (req) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    return errorResponse("Server misconfigured: GEMINI_API_KEY missing", 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const imageBase64 = String(body.imageBase64 ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim() || "image/jpeg";

  if (!imageBase64) {
    return errorResponse("imageBase64 is required", 400);
  }

  // Check image size (base64 is ~4/3 of original, limit to ~1.5MB base64 = ~1MB original)
  if (imageBase64.length > 1500000) {
    return errorResponse("Image too large. Please compress to <1MB", 400);
  }

  const prompt = `
You are an F&B inventory assistant analyzing a photo.
Extract a JSON array of inventory items from the image.

Return ONLY valid JSON matching this exact schema:
{
  "items": [
    {
      "name": string,
      "quantity": number,
      "unit": string,
      "confidence": number,
      "unitCost": number | null
    }
  ]
}

Rules:
- "confidence" is 0-100 (integer) representing your certainty for that item
- If quantity is unclear, estimate and reduce confidence
- If you see price/cost info, extract to "unitCost" (in VND), otherwise null
- Unit examples: "kg", "chai", "lon", "hộp", "gói", "lít"
- Do NOT include personal data or faces
- If no items found, return empty items array`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;

  try {
    const geminiRes = await fetchWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt.trim() },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text().catch(() => "");
      console.error("[ai-parse] Gemini error:", geminiRes.status, errorText);
      return errorResponse(`AI service error: ${geminiRes.status}`, 502);
    }

    const payload = await geminiRes.json();
    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p?.text)
        .filter(Boolean)
        .join("") ?? "";

    // Parse JSON (strip code fences if present)
    const cleaned = String(text)
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      const items = Array.isArray(parsed.items) ? parsed.items : [];

      // Calculate total confidence (average)
      const totalConfidence =
        items.length > 0
          ? Math.round(
              items.reduce(
                (sum: number, item: { confidence?: number }) =>
                  sum + (item.confidence ?? 0),
                0
              ) / items.length
            )
          : 0;

      // Count low confidence items (<85%)
      const lowConfidenceCount = items.filter(
        (item: { confidence?: number }) => (item.confidence ?? 0) < 85
      ).length;

      return jsonResponse({
        items,
        rawJson: cleaned,
        totalConfidence,
        lowConfidenceCount,
        itemCount: items.length,
      });
    } catch {
      // Parse failed, return raw text for debugging
      console.error("[ai-parse] JSON parse failed:", cleaned);
      return jsonResponse({
        items: [],
        rawJson: cleaned,
        totalConfidence: 0,
        lowConfidenceCount: 0,
        itemCount: 0,
        parseError: "Failed to parse AI response as JSON",
      });
    }
  } catch (err) {
    console.error("[ai-parse] Fetch error:", err);
    return errorResponse("Failed to connect to AI service", 502);
  }
});
