/**
 * staff-generate-invite Edge Function
 * Generates and stores staff invite codes in Supabase
 * CRITICAL for Week 2 Employee Management
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InviteCodeRequest {
  code: string;
  expiresAt: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get request body
    const body: InviteCodeRequest = await req.json();
    const { code, expiresAt } = body;

    if (!code || !expiresAt) {
      return new Response(
        JSON.stringify({ error: "Missing code or expiresAt" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get user's business_id from profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("business_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.business_id) {
      return new Response(
        JSON.stringify({ error: "Profile not found or no business" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Only OWNER can generate invite codes
    if (profile.role !== "OWNER") {
      return new Response(
        JSON.stringify({ error: "Only owners can generate invite codes" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert invite code into database
    // Note: You need to create this table in migration
    const { data: inviteData, error: insertError } = await supabaseClient
      .from("staff_invite_codes")
      .insert({
        code,
        business_id: profile.business_id,
        created_by: user.id,
        expires_at: expiresAt,
        status: "ACTIVE",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert invite code error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `[Staff] Invite code created: ${code} for business: ${profile.business_id}`
    );

    return new Response(JSON.stringify({ success: true, data: inviteData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
