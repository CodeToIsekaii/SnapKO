// create-payos-link Edge Function
// Generates a PayOS checkout link securely with proper signature

import { createClient } from "supabase";
import { crypto } from "std/crypto/mod.ts";
import { encode } from "std/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Generate HMAC-SHA256 signature for PayOS
async function generateSignature(
  data: Record<string, unknown>,
  checksumKey: string
): Promise<string> {
  // Sort keys alphabetically and create query string
  const sortedKeys = Object.keys(data).sort();
  const signData = sortedKeys.map((key) => `${key}=${data[key]}`).join("&");

  const encoder = new TextEncoder();
  const keyData = encoder.encode(checksumKey);
  const msgData = encoder.encode(signData);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return new TextDecoder().decode(encode(new Uint8Array(signature)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const payosClientId = Deno.env.get("PAYOS_CLIENT_ID");
    const payosApiKey = Deno.env.get("PAYOS_API_KEY");
    const payosChecksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY");

    if (!payosClientId || !payosApiKey || !payosChecksumKey) {
      throw new Error("Missing PayOS environment variables");
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { amount: inputAmount } = await req.json();
    const amount = inputAmount || 100000;
    const orderCode = Math.floor(Date.now() / 1000); // Use seconds, not milliseconds
    const description = `SNAPKO PRO ${user.id.substring(0, 8)}`; // Max 25 chars, includes user id for webhook lookup
    const cancelUrl = `${
      req.headers.get("origin") || "https://snapko.vn"
    }/pricing?status=cancelled`;
    const returnUrl = `${
      req.headers.get("origin") || "https://snapko.vn"
    }/pricing?status=success`;

    // Data for signature (only these fields, sorted alphabetically)
    const signatureData = {
      amount,
      cancelUrl,
      description,
      orderCode,
      returnUrl,
    };

    const signature = await generateSignature(signatureData, payosChecksumKey);
    console.log("Signature data:", JSON.stringify(signatureData));
    console.log("Generated signature:", signature);

    // Full PayOS request
    const payosRequest = {
      orderCode,
      amount,
      description,
      cancelUrl,
      returnUrl,
      signature,
    };

    console.log("PayOS request:", JSON.stringify(payosRequest));

    const response = await fetch(
      "https://api-merchant.payos.vn/v2/payment-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": payosClientId,
          "x-api-key": payosApiKey,
        },
        body: JSON.stringify(payosRequest),
      }
    );

    const result = await response.json();
    console.log("PayOS response:", JSON.stringify(result));

    if (!response.ok || result.code !== "00") {
      const errorMsg =
        result?.desc || result?.message || `PayOS error: ${response.status}`;
      throw new Error(errorMsg);
    }

    // PayOS returns data in result.data
    const paymentData = result.data || result;

    return new Response(JSON.stringify(paymentData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
