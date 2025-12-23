// Payment Webhook Edge Function: Receive SePay/Casso/PayOS webhook and extend subscription
// Uses native Deno.serve() API per project rules

import { createClient } from "supabase";

// ==================== TYPES ====================

interface SePayWebhookBody {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string | null;
  code: string | null;
  content: string;
  transferType: string;
  description: string;
  transferAmount: number;
  referenceCode: string;
  accumulated: number;
}

interface CassoWebhookBody {
  error: number;
  data: Array<{
    id: number;
    tid: string;
    description: string;
    amount: number;
    cusum_balance: number;
    when: string;
    bank_sub_acc_id: string;
    subAccId: string;
    corresponsiveAccount: string;
    corresponsiveName: string;
    corresponsiveBankId: string;
    corresponsiveBankName: string;
  }>;
}

interface PayOSWebhookBody {
  code: string;
  desc: string;
  data: {
    orderCode: number;
    amount: number;
    description: string;
    accountNumber: string;
    reference: string;
    transactionDateTime: string;
    currency: string;
    paymentLinkId: string;
    status: string;
    checkoutResponseCode?: string;
    checkoutResponseMessage?: string;
  };
  signature: string;
}

// ==================== HELPERS ====================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, secure-token",
};

// Parse short code from transfer content
function extractShortCode(content: string): string | null {
  const match = content.match(/SNAPKO[- ]?([A-Z0-9]{6})/i);
  return match ? match[1].toUpperCase() : null;
}

// Calculate subscription extension based on amount
function getSubscriptionDays(amount: number): number {
  if (amount >= 990000) return 365; // Yearly
  if (amount >= 99000) return 30; // Monthly
  return 0;
}

/**
 * Verify PayOS webhook signature using HMAC SHA256
 * Per PayOS docs: signature = HMAC_SHA256(checksumKey, sortedDataString)
 */
async function verifyPayOSSignature(
  data: PayOSWebhookBody["data"],
  signature: string,
  checksumKey: string
): Promise<boolean> {
  try {
    // Sort data fields alphabetically and create query string
    const sortedKeys = Object.keys(data).sort();
    const dataString = sortedKeys
      .map((key) => `${key}=${data[key as keyof typeof data]}`)
      .join("&");

    // Generate HMAC SHA256 using Web Crypto API (Deno native)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(checksumKey);
    const msgData = encoder.encode(dataString);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      msgData
    );
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expectedSignature === signature;
  } catch (err) {
    console.error("[PayOS] Signature verification error:", err);
    return false;
  }
}

// ==================== MAIN HANDLER ====================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sepayApiKey = Deno.env.get("SEPAY_API_KEY");
    const payosChecksumKey = Deno.env.get("PAYOS_CHECKSUM_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // Verify SePay webhook signature
    const secureToken = req.headers.get("secure-token");
    if (sepayApiKey && secureToken !== sepayApiKey) {
      console.log("Invalid secure-token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Determine gateway type and extract data
    let content: string;
    let amount: number;
    let transactionCode: string;
    let gateway: "SEPAY" | "CASSO" | "PAYOS" | "MANUAL";

    if ("transferAmount" in body) {
      // SePay format
      const sepay = body as SePayWebhookBody;
      content = sepay.content || sepay.description || "";
      amount = sepay.transferAmount;
      transactionCode = sepay.referenceCode || String(sepay.id);
      gateway = "SEPAY";
    } else if ("data" in body && Array.isArray(body.data)) {
      // Casso format
      const casso = body as CassoWebhookBody;
      if (casso.error !== 0 || casso.data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid Casso webhook data" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const txn = casso.data[0];
      content = txn.description || "";
      amount = txn.amount;
      transactionCode = txn.tid;
      gateway = "CASSO";
    } else if (
      "data" in body &&
      "signature" in body &&
      !Array.isArray(body.data)
    ) {
      // PayOS format
      const payos = body as PayOSWebhookBody;

      // Verify PayOS signature if checksum key is configured
      if (payosChecksumKey) {
        const isValid = await verifyPayOSSignature(
          payos.data,
          payos.signature,
          payosChecksumKey
        );
        if (!isValid) {
          console.log("[PayOS] Invalid signature");
          return new Response(
            JSON.stringify({ error: "Invalid PayOS signature" }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        console.log("[PayOS] Signature verified successfully");
      }

      content = payos.data.description || "";
      amount = payos.data.amount;
      transactionCode = payos.data.reference || String(payos.data.orderCode);
      gateway = "PAYOS";
    } else {
      return new Response(JSON.stringify({ error: "Unknown webhook format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract short code from content
    const shortCode = extractShortCode(content);

    if (!shortCode) {
      console.log("No short code found in content:", content);
      await supabaseAdmin.from("payment_transactions").insert({
        business_id: null,
        amount,
        status: "FAILED",
        transaction_code: transactionCode,
        gateway,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Short code not found in transfer content",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find business by short code
    const { data: business, error: bizError } = await supabaseAdmin
      .from("businesses")
      .select("id, subscription_expires_at")
      .eq("payment_short_code", shortCode)
      .single();

    if (bizError || !business) {
      console.log("Business not found for short code:", shortCode);
      await supabaseAdmin.from("payment_transactions").insert({
        business_id: null,
        amount,
        status: "FAILED",
        transaction_code: transactionCode,
        gateway,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Business not found for short code",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate new expiration date
    const extensionDays = getSubscriptionDays(amount);

    if (extensionDays === 0) {
      await supabaseAdmin.from("payment_transactions").insert({
        business_id: business.id,
        amount,
        status: "FAILED",
        transaction_code: transactionCode,
        gateway,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Amount too low for any tier",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate new expiration: from current expiration or now
    const baseDate = business.subscription_expires_at
      ? new Date(business.subscription_expires_at)
      : new Date();

    const startDate = baseDate < new Date() ? new Date() : baseDate;
    const newExpiration = new Date(startDate);
    newExpiration.setDate(newExpiration.getDate() + extensionDays);

    // Update subscription
    const { error: updateError } = await supabaseAdmin
      .from("businesses")
      .update({
        subscription_expires_at: newExpiration.toISOString(),
        tier: "PERSONAL",
      })
      .eq("id", business.id);

    if (updateError) {
      throw updateError;
    }

    // Log successful transaction
    await supabaseAdmin.from("payment_transactions").insert({
      business_id: business.id,
      amount,
      status: "SUCCESS",
      transaction_code: transactionCode,
      gateway,
    });

    console.log(
      `Payment processed: ${shortCode} -> +${extensionDays} days, expires: ${newExpiration.toISOString()}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        business_id: business.id,
        extension_days: extensionDays,
        new_expiration: newExpiration.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Payment webhook error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
