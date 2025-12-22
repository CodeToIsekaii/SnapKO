import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// SePay/Casso Webhook Handler
// Called when payment is received

interface SePayWebhook {
  id: number;
  gateway: string;
  transactionDate: string;
  content: string;
  transferAmount: number;
  referenceCode: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    // Verify webhook token
    const secureToken = req.headers.get("secure-token");
    const sepayApiKey = process.env.SEPAY_API_KEY;
    if (sepayApiKey && secureToken !== sepayApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SePayWebhook;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract short code from content: "SNAPKO XXXXXX"
    const match = body.content?.match(/SNAPKO[- ]?([A-Z0-9]{6})/i);
    const shortCode = match ? match[1].toUpperCase() : null;

    if (!shortCode) {
      return NextResponse.json({ success: false, error: "No short code" });
    }

    // Find business
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("id, subscription_expires_at")
      .eq("payment_short_code", shortCode)
      .single();

    if (bizError || !business) {
      return NextResponse.json({ success: false, error: "Business not found" });
    }

    // Calculate extension days
    const amount = body.transferAmount;
    let extensionDays = 0;
    if (amount >= 990000) extensionDays = 365; // Yearly
    else if (amount >= 99000) extensionDays = 30; // Monthly

    if (extensionDays === 0) {
      return NextResponse.json({ success: false, error: "Amount too low" });
    }

    // Calculate new expiration
    const baseDate = business.subscription_expires_at
      ? new Date(business.subscription_expires_at)
      : new Date();
    const startDate = baseDate < new Date() ? new Date() : baseDate;
    const newExpiration = new Date(startDate);
    newExpiration.setDate(newExpiration.getDate() + extensionDays);

    // Update subscription
    await supabase
      .from("businesses")
      .update({
        subscription_expires_at: newExpiration.toISOString(),
        tier: "PERSONAL",
      })
      .eq("id", business.id);

    // Log transaction
    await supabase.from("payment_transactions").insert({
      business_id: business.id,
      amount,
      status: "SUCCESS",
      transaction_code: body.referenceCode || String(body.id),
      gateway: "SEPAY",
    });

    return NextResponse.json({
      success: true,
      business_id: business.id,
      extension_days: extensionDays,
      new_expiration: newExpiration.toISOString(),
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// Handle preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, secure-token",
    },
  });
}
