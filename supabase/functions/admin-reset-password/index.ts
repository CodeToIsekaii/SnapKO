/**
 * Edge Function: admin-reset-password
 * Allows an OWNER to reset a STAFF member's password
 *
 * Security:
 * - Caller must be authenticated
 * - Caller must have role 'OWNER'
 * - Target user must have role 'STAFF'
 * - Both must belong to the SAME business_id
 */

import { createClient } from "supabase";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

interface ResetRequest {
  staffId: string;
  newPassword: string;
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

  // 1. Verify Caller (must be authenticated)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return errorResponse("Missing Authorization header", 401);
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: callerUser },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError || !callerUser) {
    return errorResponse("Unauthorized", 401);
  }

  // 2. Parse Validated Body
  let body: ResetRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { staffId, newPassword } = body;

  if (!staffId || !newPassword || newPassword.length < 6) {
    return errorResponse("Invalid input. Password must be 6+ chars", 400);
  }

  // 3. Verify Logic (Owner & Same Business) using Admin Client
  // We use Admin client to inspect profiles reliably regardless of RLS complexity for cross-user checks
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get Caller Profile
  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("business_id, role")
    .eq("id", callerUser.id)
    .single();

  if (!callerProfile || callerProfile.role !== "OWNER") {
    return errorResponse(
      "Permission denied. Only Owners can reset passwords.",
      403
    );
  }

  const businessId = callerProfile.business_id;
  if (!businessId) {
    return errorResponse("Owner has no business assigned", 400);
  }

  // Get Target Staff Profile
  const { data: staffProfile } = await supabaseAdmin
    .from("profiles")
    .select("business_id, role")
    .eq("id", staffId)
    .single();

  if (!staffProfile) {
    return errorResponse("Staff member not found", 404);
  }

  if (staffProfile.role !== "STAFF") {
    return errorResponse("Target user is not a staff member", 400);
  }

  if (staffProfile.business_id !== businessId) {
    return errorResponse("Target user does not belong to your business", 403);
  }

  // 4. Update Password
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    staffId,
    { password: newPassword }
  );

  if (updateError) {
    console.error("Update password error:", updateError);
    return errorResponse(
      `Failed to update password: ${updateError.message}`,
      500
    );
  }

  // 5. Success
  return jsonResponse({
    success: true,
    message: "Password updated successfully",
  });
});
