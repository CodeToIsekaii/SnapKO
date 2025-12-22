// Supabase Edge Function: invite-create
// Auth: Owner (must be authenticated)
// Returns: { inviteCode: string }
// Generates 6-char alphanumeric code with 48h expiry

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";

// Generate 6-char alphanumeric code (A-Z, 2-9, no confusing chars)
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return errorResponse("Method Not Allowed", 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("Server misconfigured", 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  // Use anon+auth header to validate user
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    return errorResponse("Unauthorized", 401);
  }

  // Admin client for DB writes
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Check if user has owner profile
  const { data: existingOwnerProfile, error: ownerProfileErr } = await admin
    .from("profiles")
    .select("id, business_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (ownerProfileErr) {
    return errorResponse(`DB error: ${ownerProfileErr.message}`, 500);
  }

  let businessId: string;
  if (existingOwnerProfile?.business_id) {
    // Verify user is OWNER
    if (existingOwnerProfile.role !== "OWNER") {
      return errorResponse("Only owners can create invite codes", 403);
    }
    businessId = existingOwnerProfile.business_id;
  } else {
    // Bootstrap: create business + owner profile
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({ name: "My Business" })
      .select("id")
      .single();

    if (bizErr || !biz) {
      return errorResponse(
        `DB error: ${bizErr?.message ?? "create business failed"}`,
        500
      );
    }
    businessId = biz.id;

    const { error: createProfileErr } = await admin.from("profiles").insert({
      id: user.id,
      business_id: businessId,
      role: "OWNER",
      status: "ACTIVE",
      full_name: null,
      phone_number: null,
    });

    if (createProfileErr) {
      return errorResponse(`DB error: ${createProfileErr.message}`, 500);
    }
  }

  // Generate unique 6-char code with collision check and 48h expiry
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

  for (let attempt = 0; attempt < 10; attempt++) {
    const inviteCode = generateInviteCode();

    // Check if code already exists
    const { data: existing } = await admin
      .from("businesses")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (existing) {
      continue; // Collision, retry
    }

    // Update business with new code
    const { error: updateErr } = await admin
      .from("businesses")
      .update({
        invite_code: inviteCode,
        invite_code_expires_at: expiresAt.toISOString(),
      })
      .eq("id", businessId);

    if (!updateErr) {
      return jsonResponse({ inviteCode, expiresAt: expiresAt.toISOString() });
    }

    // If unique violation, retry
    if (String(updateErr.code) === "23505") {
      continue;
    }

    return errorResponse(`DB error: ${updateErr.message}`, 500);
  }

  return errorResponse("Failed to generate unique invite code", 500);
});
