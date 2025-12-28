// Supabase Edge Function: ai-parse-menu
// Auth: Yes (Owner)
// Body: { imageBase64: string, mimeType: string }
// Returns: { ingredients: [{ name, baseUnit, unitCost, confidence }], rawJson }

type Body = { imageBase64: string; mimeType: string };

interface GeminiPart {
  text?: string;
}

function json(res: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(res), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY)
    return new Response("Server misconfigured", { status: 500 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const imageBase64 = String(body.imageBase64 ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim() || "image/jpeg";
  if (!imageBase64) return new Response("Invalid", { status: 400 });

  const prompt = `
You are an F&B onboarding assistant.
From the menu/receipt photo, extract a JSON array of ingredients with unit cost.
Return ONLY valid JSON matching this exact schema:
{
  "ingredients": [
    { "name": string, "baseUnit": string, "unitCost": number, "confidence": number }
  ]
}
Rules:
- confidence is 0..100 (integer)
- unitCost is numeric in VND (if unknown, set 0 and lower confidence)
- No personal data.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
    GEMINI_API_KEY
  )}`;

  const geminiRes = await fetch(geminiUrl, {
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
      },
    }),
  });

  if (!geminiRes.ok) {
    const t = await geminiRes.text().catch(() => "");
    return new Response(t || "Gemini error", { status: 502 });
  }

  const payload = await geminiRes.json();
  const parts = (payload?.candidates?.[0]?.content?.parts ??
    []) as GeminiPart[];
  const text = parts
    .map((p) => p?.text)
    .filter(Boolean)
    .join("");

  const cleaned = String(text)
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return json({ ...parsed, rawJson: cleaned });
  } catch {
    return json({ ingredients: [], rawJson: cleaned }, { status: 200 });
  }
});
