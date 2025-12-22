// Supabase Edge Function: invite-join
// Auth: No (staff joins with invite code)
// Rate Limit: 5 attempts per IP per hour (sliding window)
// Body: { inviteCode: string, fullName: string, phoneNumber: string }
// Response: { success: true, status: "pending" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";

type Body = { inviteCode: string; fullName: string; phoneNumber: string };

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("Server misconfigured", 500);
  }

  // Get IP address from headers
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Admin client (service role for rate limit table access)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // === RATE LIMIT CHECK (Sliding Window) ===
  const { data: rateRecord } = await admin
    .from("invite_rate_limits")
    .select("*")
    .eq("ip_address", ip)
    .maybeSingle();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - WINDOW_MS);

  if (rateRecord) {
    const windowStart = new Date(rateRecord.window_start_at);

    if (windowStart < oneHourAgo) {
      // Window expired, reset counter
      await admin
        .from("invite_rate_limits")
        .update({ attempts: 1, window_start_at: now.toISOString() })
        .eq("ip_address", ip);
    } else if (rateRecord.attempts >= MAX_ATTEMPTS) {
      // Rate limited
      const retryAfter = Math.ceil(
        (windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000
      );
      return new Response(
        JSON.stringify({
          error: "Too many requests. Try again later.",
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        }
      );
    } else {
      // Increment counter
      await admin
        .from("invite_rate_limits")
        .update({ attempts: rateRecord.attempts + 1 })
        .eq("ip_address", ip);
    }
  } else {
    // First attempt, create record
    await admin.from("invite_rate_limits").insert({ ip_address: ip });
  }

  // === PARSE & VALIDATE BODY ===
  let body: Body;
  try {
    const raw = await req.json();
    // Data minimization: reject extra fields
    const allowed = new Set(["inviteCode", "fullName", "phoneNumber"]);
    if (raw && typeof raw === "object") {
      for (const key of Object.keys(raw)) {
        if (!allowed.has(key)) return errorResponse("Invalid request", 400);
      }
    }
    body = raw as Body;
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const inviteCode = String(body.inviteCode ?? "")
    .trim()
    .toUpperCase();
  const fullName = String(body.fullName ?? "").trim();
  const phoneNumber = String(body.phoneNumber ?? "").trim();

  if (!inviteCode || inviteCode.length !== 6) {
    return errorResponse("Invalid invite code format", 400);
  }
  if (!fullName || fullName.length < 2) {
    return errorResponse("Full name is required", 400);
  }
  if (!phoneNumber || !/^[0-9]{9,12}$/.test(phoneNumber.replace(/\s+/g, ""))) {
    return errorResponse("Invalid phone number", 400);
  }

  // === CHECK INVITE CODE ===
  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, invite_code_expires_at")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (bizErr) {
    return errorResponse(`DB error: ${bizErr.message}`, 500);
  }
  if (!biz?.id) {
    return errorResponse("Invalid invite code", 400);
  }

  // Check expiration
  if (biz.invite_code_expires_at) {
    const expiresAt = new Date(biz.invite_code_expires_at);
    if (expiresAt < now) {
      return errorResponse("Invite code has expired", 400);
    }
  }

  // === CHECK DUPLICATE PHONE ===
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, status")
    .eq("business_id", biz.id)
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.status === "PENDING") {
      return jsonResponse({
        success: true,
        status: "pending",
        message: "Already pending approval",
      });
    }
    if (existingProfile.status === "ACTIVE") {
      return errorResponse("Phone number already registered", 400);
    }
  }

  // === CREATE PENDING PROFILE ===
  const { data: created, error: createErr } = await admin
    .from("profiles")
    .insert({
      id: crypto.randomUUID(),
      business_id: biz.id,
      role: "STAFF",
      status: "PENDING",
      full_name: fullName,
      phone_number: phoneNumber,
    })
    .select("id")
    .single();

  if (createErr) {
    return errorResponse(`DB error: ${createErr.message}`, 500);
  }

  // === SEND PUSH NOTIFICATION TO OWNER ===
  try {
    // Find owner(s) with push tokens
    const { data: owners } = await admin
      .from("profiles")
      .select("expo_push_token, full_name")
      .eq("business_id", biz.id)
      .eq("role", "OWNER")
      .eq("status", "ACTIVE")
      .not("expo_push_token", "is", null);

    if (owners && owners.length > 0) {
      const pushTokens = owners
        .map((o) => o.expo_push_token)
        .filter((t): t is string => !!t);

      if (pushTokens.length > 0) {
        // Send via Expo Push API
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            pushTokens.map((token) => ({
              to: token,
              title: "🔔 Nhân viên mới chờ duyệt",
              body: `${fullName} (${phoneNumber}) muốn tham gia quán`,
              data: {
                type: "INVITE_PENDING",
                profileId: created.id,
              },
              sound: "default",
              badge: 1,
            }))
          ),
        });
      }
    }
  } catch (pushErr) {
    // Don't fail the request if push fails
    console.error("Push notification error:", pushErr);
  }

  return jsonResponse({
    success: true,
    status: "pending",
    profileId: created.id,
  });
});
