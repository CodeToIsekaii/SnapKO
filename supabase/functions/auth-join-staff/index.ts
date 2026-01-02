/**
 * Edge Function: auth-join-staff
 * Creates a shadow auth account for staff joining via invite code
 * Returns session token so mobile can auto-login without staff knowing credentials
 *
 * Flow:
 * 1. Validate invite code
 * 2. Create shadow email/password (phone@staff.snapko.local)
 * 3. Create Supabase Auth user
 * 4. Create PENDING profile linked to business
 * 5. Sign in and return session token
 */

import { createClient } from "supabase";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

interface JoinRequest {
  inviteCode: string;
  fullName: string;
  phoneNumber: string;
  password: string;
}

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

  // Admin client (service role)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Parse request body
  let body: JoinRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const inviteCode = String(body.inviteCode ?? "")
    .trim()
    .toUpperCase();
  const fullName = String(body.fullName ?? "").trim();
  const phoneNumber = String(body.phoneNumber ?? "")
    .trim()
    .replace(/\s+/g, "");
  const password = String(body.password ?? "");

  // Validate inputs
  if (!inviteCode || inviteCode.length !== 6) {
    return errorResponse("Invalid invite code format", 400);
  }
  if (!fullName || fullName.length < 2) {
    return errorResponse("Full name is required", 400);
  }
  if (!phoneNumber || !/^[0-9]{9,12}$/.test(phoneNumber)) {
    return errorResponse("Invalid phone number", 400);
  }
  if (!password || password.length < 6) {
    return errorResponse("Password must be at least 6 characters", 400);
  }

  // === 1. VALIDATE INVITE CODE ===
  const { data: inviteRecord, error: inviteErr } = await supabaseAdmin
    .from("staff_invite_codes")
    .select("id, business_id, expires_at, status")
    .eq("code", inviteCode)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (inviteErr) {
    return errorResponse(`DB error: ${inviteErr.message}`, 500);
  }
  if (!inviteRecord?.business_id) {
    return errorResponse("Invalid or expired invite code", 400);
  }

  // Check expiration
  if (inviteRecord.expires_at) {
    const expiresAt = new Date(inviteRecord.expires_at);
    if (expiresAt < new Date()) {
      return errorResponse("Invite code has expired", 400);
    }
  }

  const businessId = inviteRecord.business_id;

  // === 2. CREATE ACCOUNT CREDENTIALS ===
  const staffEmail = `${phoneNumber}@staff.snapko.local`;
  // Use password from user input instead of auto-generated shadow password
  const staffPassword = password;

  // === 3. CHECK IF USER ALREADY EXISTS ===
  let userId: string | null = null;

  // First check by phone in profiles
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.status === "PENDING") {
      // Already pending - try to get their session
      userId = existingProfile.id;
    } else if (existingProfile.status === "ACTIVE") {
      return errorResponse("Phone number already registered and active", 400);
    } else if (
      existingProfile.status === "REJECTED" ||
      existingProfile.status === "INACTIVE"
    ) {
      // Allow re-registration - update profile
      userId = existingProfile.id;
    }
  }

  // === 4. CREATE OR UPDATE AUTH USER ===
  if (!userId) {
    // Check if shadow email exists using listUsers filter
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = userList?.users?.find((u) => u.email === staffEmail);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new shadow auth user
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: staffEmail,
          password: staffPassword,
          email_confirm: true, // Auto-confirm so they can login
          user_metadata: {
            full_name: fullName,
            phone: phoneNumber,
            is_shadow_account: true,
          },
        });

      if (createError) {
        console.error("Create user error:", createError);
        return errorResponse(
          `Failed to create account: ${createError.message}`,
          500
        );
      }

      userId = newUser.user.id;
    }
  }

  // === 5. CREATE/UPDATE PROFILE ===
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      business_id: businessId,
      role: "STAFF",
      status: "PENDING",
      full_name: fullName,
      phone_number: phoneNumber,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error("Profile error:", profileError);
    return errorResponse(
      `Failed to create profile: ${profileError.message}`,
      500
    );
  }

  // === 6. SIGN IN TO GET SESSION ===
  // Need to update password first since we may have changed it
  if (!userId) {
    return errorResponse("Failed to create user", 500);
  }

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: staffPassword,
  });

  const { data: sessionData, error: signInError } =
    await supabaseAdmin.auth.signInWithPassword({
      email: staffEmail,
      password: staffPassword,
    });

  if (signInError || !sessionData.session) {
    console.error("Sign in error:", signInError);
    return errorResponse("Failed to create session", 500);
  }

  // === 7. SEND PUSH NOTIFICATION TO OWNER ===
  try {
    const { data: owners } = await supabaseAdmin
      .from("profiles")
      .select("expo_push_token")
      .eq("business_id", businessId)
      .eq("role", "OWNER")
      .eq("status", "ACTIVE")
      .not("expo_push_token", "is", null);

    if (owners && owners.length > 0) {
      const pushTokens = owners
        .map((o) => o.expo_push_token)
        .filter((t): t is string => !!t);

      if (pushTokens.length > 0) {
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
              data: { type: "INVITE_PENDING", profileId: userId },
              sound: "default",
              badge: 1,
            }))
          ),
        });
      }
    }
  } catch (pushErr) {
    console.error("Push notification error:", pushErr);
  }

  // === 8. RETURN SESSION TO MOBILE ===
  return jsonResponse({
    success: true,
    status: "pending",
    profileId: userId,
    session: {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    },
    user: {
      id: sessionData.user.id,
      email: sessionData.user.email,
    },
  });
});
