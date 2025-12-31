// Supabase Edge Function: invite-approve
// Auth: Owner
// Body: { profileId: string, approve: boolean }
// Response: { success: true, activated: true }

import { createClient } from "supabase";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

type Body = { profileId: string; approve: boolean };

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

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) {
    return errorResponse("Unauthorized", 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify owner
  const { data: ownerProfile, error: ownerErr } = await admin
    .from("profiles")
    .select("business_id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (ownerErr) {
    return errorResponse(`DB error: ${ownerErr.message}`, 500);
  }
  if (
    !ownerProfile ||
    ownerProfile.role !== "OWNER" ||
    ownerProfile.status !== "ACTIVE"
  ) {
    return errorResponse("Only active owners can approve staff", 403);
  }

  // Parse body
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.profileId || typeof body.approve !== "boolean") {
    return errorResponse("profileId and approve are required", 400);
  }

  const nextStatus = body.approve ? "ACTIVE" : "INACTIVE";

  // Only approve/reject staff in the same business, and only if currently PENDING
  const { data: updated, error: updErr } = await admin
    .from("profiles")
    .update({ status: nextStatus })
    .eq("id", body.profileId)
    .eq("business_id", ownerProfile.business_id)
    .eq("role", "STAFF")
    .eq("status", "PENDING")
    .select("id, full_name, phone_number")
    .maybeSingle();

  if (updErr) {
    return errorResponse(`DB error: ${updErr.message}`, 500);
  }
  if (!updated) {
    return errorResponse("Profile not found or not pending", 404);
  }

  return jsonResponse({
    success: true,
    activated: body.approve,
    profile: {
      id: updated.id,
      fullName: updated.full_name,
      phoneNumber: updated.phone_number,
    },
  });
});
