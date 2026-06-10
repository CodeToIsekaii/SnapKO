// Payment Webhook Edge Function: Receive SePay/Casso/PayOS webhook and extend subscription
// Uses native Deno.serve() API per project rules

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Extract user ID prefix from content like "SNAPKO PRO abc12345"
function extractUserIdPrefix(content: string): string | null {
  const match = content.match(/SNAPKO\s+(?:PRO|CHAIN)\s+([a-f0-9]{8})/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Verify PayOS webhook signature using HMAC SHA256
 */
async function verifyPayOSSignature(
  data: PayOSWebhookBody["data"],
  signature: string,
  checksumKey: string
): Promise<boolean> {
  try {
    const sortedKeys = Object.keys(data).sort();
    const dataString = sortedKeys
      .map((key) => `${key}=${data[key as keyof typeof data]}`)
      .join("&");

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

    console.log("Processing payment:", { content, amount, gateway });

    // Try to find business or user
    const shortCode = extractShortCode(content);
    const userIdPrefix = extractUserIdPrefix(content);

    let businessId: string | null = null;
    let userId: string | null = null;
    let currentExpiration: string | null = null;

    // Try business lookup first
    if (shortCode) {
      const { data: business } = await supabaseAdmin
        .from("businesses")
        .select("id, subscription_expires_at")
        .eq("payment_short_code", shortCode)
        .single();

      if (business) {
        businessId = business.id;
        currentExpiration = business.subscription_expires_at;
      }
    }

    // Try user lookup if no business found
    if (!businessId && userIdPrefix) {
      // Construct UUID range for the prefix (assuming 8 chars)
      // UUID format: 8-4-4-4-12 digits
      const startUuid = `${userIdPrefix}-0000-0000-0000-000000000000`;
      const endUuid = `${userIdPrefix}-ffff-ffff-ffff-ffffffffffff`;

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, business_id, subscription_expires_at")
        .gte("id", startUuid)
        .lte("id", endUuid)
        .limit(1);

      if (profiles && profiles.length > 0) {
        userId = profiles[0].id;
        businessId = profiles[0].business_id;
        currentExpiration = profiles[0].subscription_expires_at;
      }
    }

    if (!businessId && !userId) {
      console.log("No business or user found for:", {
        shortCode,
        userIdPrefix,
      });
      await supabaseAdmin.from("payment_transactions").insert({
        business_id: null,
        amount,
        status: "FAILED",
        transaction_code: transactionCode,
        gateway,
      });

      return new Response(
        JSON.stringify({ success: false, error: "Business/User not found" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Lookup an active plan by exact amount. Do not infer legacy prices.
    const { data: matchedPlan } = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .eq("price", amount)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!matchedPlan) {
      console.warn(`No matching plan found for amount: ${amount}`);
      await supabaseAdmin.from("payment_transactions").insert({
        business_id: businessId,
        amount,
        status: "FAILED",
        transaction_code: transactionCode,
        gateway,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Amount does not match any plan",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const extensionDays = matchedPlan.duration_days;

    // Calculate new expiration
    const baseDate = currentExpiration
      ? new Date(currentExpiration)
      : new Date();
    const startDate = baseDate < new Date() ? new Date() : baseDate;
    const newExpiration = new Date(startDate);
    newExpiration.setDate(newExpiration.getDate() + extensionDays);

    const targetTier = matchedPlan ? matchedPlan.target_tier : "PRO";

    // Update subscription - either business or profile
    if (businessId) {
      await supabaseAdmin
        .from("businesses")
        .update({
          subscription_expires_at: newExpiration.toISOString(),
          tier: targetTier, // Keep tier for backward compatibility
          plan_code: matchedPlan ? matchedPlan.code : null, // Save specific Plan Code
        })
        .eq("id", businessId);
    }

    // ... (User update logic kept same, verify if user needs tier update)

    if (userId) {
      await supabaseAdmin
        .from("profiles")
        .update({
          subscription_expires_at: newExpiration.toISOString(),
          is_pro: true, // Only generic flag supported on profile?
          // If we track tier on profile, update it too. Schema check needed.
          // For now, assuming is_pro is enough or tier is on business.
        })
        .eq("id", userId);
    }

    // Log successful transaction
    await supabaseAdmin.from("payment_transactions").insert({
      business_id: businessId,
      amount,
      status: "SUCCESS",
      transaction_code: transactionCode,
      gateway,
    });

    // Log to subscription_history for tracking
    if (businessId) {
      await supabaseAdmin.from("subscription_history").insert({
        business_id: businessId,
        plan_code: matchedPlan.code,
        plan_id: matchedPlan.id,
        amount_paid: amount,
        start_date: startDate.toISOString(),
        end_date: newExpiration.toISOString(),
        payment_gateway: gateway,
        transaction_code: transactionCode,
      });
    }

    console.log(
      `Payment success: +${extensionDays} days, expires: ${newExpiration.toISOString()}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        business_id: businessId,
        user_id: userId,
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
