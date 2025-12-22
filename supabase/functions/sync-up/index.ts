// Sync-up Edge Function: Receive array of inventory logs and bulk upsert
// Uses native Deno.serve() API per project rules

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface InventoryLogInput {
  id: string;
  ingredient_id?: string | null;
  location: "WAREHOUSE" | "BAR";
  type: "IMPORT" | "TRANSFER" | "AUDIT" | "WASTE" | "LENT";
  ai_parsed_quantity?: number | null;
  ai_confidence_score?: number | null;
  final_confirmed_quantity?: number | null;
  quantity_change_base?: number | null;
  unit_cost_at_time?: number | null;
  source_photos?: string[];
  photo_metadata?: Record<string, unknown>;
  ai_parsed_json?: Record<string, unknown>;
  staff_note?: string | null;
  is_verified?: boolean;
  diff_percentage?: number | null;
  created_at?: string;
}

interface SyncRequest {
  logs: InventoryLogInput[];
}

interface SyncResult {
  id: string;
  success: boolean;
  error?: string;
  dpia_logged?: boolean;
}

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

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to get their profile
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user's profile and business_id
    const {
      data: { user },
    } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));

    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile to find business_id
    const { data: profile, error: profileError } = await supabaseUser
      .from("profiles")
      .select("business_id, role, status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.status !== "ACTIVE") {
      return new Response(JSON.stringify({ error: "Profile not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: SyncRequest = await req.json();
    const logs = body.logs ?? [];

    if (!Array.isArray(logs) || logs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No logs provided", results: [] }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role client for upserts
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const results: SyncResult[] = [];
    const now = new Date().toISOString();

    for (const log of logs) {
      try {
        // Prepare log data with business_id and synced_at
        const logData = {
          id: log.id,
          business_id: profile.business_id,
          ingredient_id: log.ingredient_id ?? null,
          location: log.location,
          type: log.type,
          created_by: user.id,
          ai_parsed_quantity: log.ai_parsed_quantity ?? null,
          ai_confidence_score: log.ai_confidence_score ?? null,
          final_confirmed_quantity: log.final_confirmed_quantity ?? null,
          quantity_change_base: log.quantity_change_base ?? null,
          unit_cost_at_time: log.unit_cost_at_time ?? null,
          source_photos: log.source_photos ?? [],
          photo_metadata: log.photo_metadata ?? null,
          ai_parsed_json: log.ai_parsed_json ?? null,
          staff_note: log.staff_note ?? null,
          is_verified: log.is_verified ?? false,
          diff_percentage: log.diff_percentage ?? null,
          created_at: log.created_at ?? now,
          synced_at: now,
        };

        // Upsert inventory log
        const { error: upsertError } = await supabaseAdmin
          .from("inventory_logs")
          .upsert(logData, { onConflict: "id" });

        if (upsertError) {
          results.push({
            id: log.id,
            success: false,
            error: upsertError.message,
          });
          continue;
        }

        // Check if DPIA log needed (diff > 5%)
        let dpiaLogged = false;
        if (log.diff_percentage != null && Math.abs(log.diff_percentage) > 5) {
          const { error: dpiaError } = await supabaseAdmin
            .from("dpia_logs")
            .insert({
              business_id: profile.business_id,
              log_id: log.id,
              data_processed: {
                diff_percentage: log.diff_percentage,
                ai_confidence: log.ai_confidence_score,
                type: log.type,
              },
              triggered_by: "diff_threshold",
            });

          dpiaLogged = !dpiaError;
        }

        results.push({ id: log.id, success: true, dpia_logged: dpiaLogged });
      } catch (err) {
        results.push({
          id: log.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    // === CHECK LOW STOCK & SEND PUSH NOTIFICATIONS ===
    try {
      // Get all ingredients for this business that are below threshold
      const { data: lowStockItems } = await supabaseAdmin
        .from("ingredients")
        .select("id, name, warehouse_qty, bar_qty, alert_threshold")
        .eq("business_id", profile.business_id)
        .not("alert_threshold", "is", null);

      const alertItems = (lowStockItems ?? []).filter(
        (ing) => ing.warehouse_qty + ing.bar_qty < (ing.alert_threshold ?? 0)
      );

      if (alertItems.length > 0) {
        // Get Owner push tokens
        const { data: owners } = await supabaseAdmin
          .from("profiles")
          .select("expo_push_token, full_name")
          .eq("business_id", profile.business_id)
          .eq("role", "OWNER")
          .eq("status", "ACTIVE")
          .not("expo_push_token", "is", null);

        const pushTokens = (owners ?? [])
          .map((o) => o.expo_push_token)
          .filter(Boolean) as string[];

        if (pushTokens.length > 0) {
          const itemNames = alertItems
            .slice(0, 3)
            .map((i) => i.name)
            .join(", ");
          const message =
            alertItems.length > 3
              ? `${itemNames} và ${
                  alertItems.length - 3
                } mục khác sắp hết hàng!`
              : `${itemNames} sắp hết hàng!`;

          // Send Expo Push Notification
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              pushTokens.map((token) => ({
                to: token,
                title: "⚠️ Cảnh báo tồn kho thấp",
                body: message,
                data: { type: "LOW_STOCK", count: alertItems.length },
                sound: "default",
              }))
            ),
          });

          console.log(
            `[sync-up] Low stock alert sent for ${alertItems.length} items`
          );
        }
      }
    } catch (pushErr) {
      console.error("[sync-up] Low stock push error:", pushErr);
      // Don't fail the sync because of push notification error
    }

    return new Response(
      JSON.stringify({
        synced: successCount,
        total: logs.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
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
