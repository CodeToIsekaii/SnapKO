// User Delete Edge Function - Soft delete account for App Store compliance
// Marks profile as DELETED, schedules data purge after 30 days

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to get their ID
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Get profile to check role
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, business_id, role, status")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Soft delete: Mark profile as DELETED & Free up phone number
    const deleteScheduledAt = new Date();
    deleteScheduledAt.setDate(deleteScheduledAt.getDate() + 30); // 30 days from now

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({
        status: "DELETED",
        phone_number: null, // Free up phone for re-registration
        full_name: "Deleted User", // Clear personal info
        avatar_url: null,
        deleted_at: new Date().toISOString(),
        delete_scheduled_at: deleteScheduledAt.toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      throw updateError;
    }

    // If OWNER, also mark business as inactive (but don't delete yet)
    if (profile.role === "OWNER" && profile.business_id) {
      await supabaseClient
        .from("businesses")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", profile.business_id);
    }

    // Delete auth user (this will invalidate all sessions)
    const { error: deleteAuthError } =
      await supabaseClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Auth delete error:", deleteAuthError);
      // Continue anyway - profile is already marked DELETED
    }

    // Log deletion for compliance (DPIA)
    await supabaseClient.from("dpia_logs").insert({
      user_id: userId,
      action: "ACCOUNT_DELETION_REQUESTED",
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      details: {
        scheduled_purge: deleteScheduledAt.toISOString(),
        role: profile.role,
      },
    });

    console.log(
      `Account deletion requested: ${userId}, scheduled purge: ${deleteScheduledAt.toISOString()}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Tài khoản đã được đánh dấu xóa. Dữ liệu sẽ bị xóa hoàn toàn sau 30 ngày.",
        scheduled_purge: deleteScheduledAt.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("User delete error:", err);
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
