// Data Purge Edge Function - Self-service data deletion for Owner/Staff
// Compliant with Nghị định 13 - allows users to request complete data deletion

import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PurgeRequest {
  profileId?: string; // Optional: specific profile to purge (Owner only)
  purgeType: "FULL_ACCOUNT" | "BUSINESS_DATA" | "PERSONAL_ONLY";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: PurgeRequest = await req
      .json()
      .catch(() => ({ purgeType: "PERSONAL_ONLY" }));
    const userId = user.id;

    // Get requester profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, business_id, role, status")
      .eq("id", userId)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const purgedItems: string[] = [];

    // PERSONAL_ONLY: Clear personal data only
    if (body.purgeType === "PERSONAL_ONLY") {
      await supabase
        .from("profiles")
        .update({
          full_name: null,
          phone_number: null,
          avatar_url: null,
        })
        .eq("id", userId);
      purgedItems.push("personal_data");
    }

    // FULL_ACCOUNT: Delete profile and auth (calls user-delete logic)
    if (body.purgeType === "FULL_ACCOUNT") {
      // Mark profile as deleted
      const deleteScheduledAt = new Date();
      deleteScheduledAt.setDate(deleteScheduledAt.getDate() + 30);

      await supabase
        .from("profiles")
        .update({
          status: "DELETED",
          phone_number: null,
          full_name: "Deleted User",
          avatar_url: null,
          deleted_at: new Date().toISOString(),
          delete_scheduled_at: deleteScheduledAt.toISOString(),
        })
        .eq("id", userId);

      await supabase.auth.admin.deleteUser(userId);
      purgedItems.push("profile", "auth_user");
    }

    // BUSINESS_DATA: Owner only - purge business data
    if (body.purgeType === "BUSINESS_DATA" && profile.role === "OWNER") {
      const businessId = profile.business_id;

      // Delete inventory logs
      await supabase
        .from("inventory_logs")
        .delete()
        .eq("business_id", businessId);
      purgedItems.push("inventory_logs");

      // Delete recipe ingredients first, then recipes
      const { data: recipes } = await supabase
        .from("recipes")
        .select("id")
        .eq("business_id", businessId);

      if (recipes) {
        for (const recipe of recipes) {
          await supabase
            .from("recipe_ingredients")
            .delete()
            .eq("recipe_id", recipe.id);
        }
      }
      await supabase.from("recipes").delete().eq("business_id", businessId);
      purgedItems.push("recipes");

      // Delete ingredients
      await supabase.from("ingredients").delete().eq("business_id", businessId);
      purgedItems.push("ingredients");
    }

    // Log purge for compliance
    await supabase.from("dpia_logs").insert({
      user_id: userId,
      action: "DATA_PURGE_REQUESTED",
      ip_address: req.headers.get("x-forwarded-for") || "unknown",
      details: {
        purge_type: body.purgeType,
        purged_items: purgedItems,
      },
    });

    console.log(
      `Data purge completed: ${userId}, type: ${
        body.purgeType
      }, items: ${purgedItems.join(", ")}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        purged: purgedItems,
        message: "Dữ liệu đã được xóa theo yêu cầu.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Data purge error:", err);
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
