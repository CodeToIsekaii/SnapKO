/**
 * Fraud Detection - Edge Function
 * Per .antigravityrules Section E: Anti-Fraud & Gatekeeper Logic
 *
 * Runs after sync to detect:
 * 1. High variance patterns
 * 2. "Variance Trap" (Perfect match 3+ times)
 * 3. "Ghost Transfer" (Urgent to Bar without transfers)
 * 4. Low stock alerts
 */

// deno-lint-ignore-file
import { createClient, SupabaseClient } from "supabase";

// Define minimal Database schema for tables used in this function
// Must include all required properties for GenericSchema
interface Database {
  public: {
    Tables: {
      fraud_alerts: {
        Row: {
          id: string;
          created_at: string;
          business_id: string;
          log_type: string;
          log_id: string;
          alert_type: string;
          risk_level: string;
          ingredient_id: string | null;
          variance_percentage: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          business_id: string;
          log_type: string;
          log_id: string;
          alert_type: string;
          risk_level: string;
          ingredient_id?: string | null;
          variance_percentage?: number | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          business_id?: string;
          log_type?: string;
          log_id?: string;
          alert_type?: string;
          risk_level?: string;
          ingredient_id?: string | null;
          variance_percentage?: number | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      inventory_logs: {
        Row: {
          id: string;
          ingredient_id: string;
          variance: number;
          variance_percentage: number;
          business_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      storage_areas: {
        Row: {
          id: string;
          business_id: string;
          type: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      import_logs: {
        Row: {
          id: string;
          business_id: string;
          target_area_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      transfer_logs: {
        Row: {
          id: string;
          business_id: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      stock_levels: {
        Row: {
          id: string;
          quantity: number;
          area_id: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      ingredients: {
        Row: {
          id: string;
          name: string;
          min_threshold: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Type alias for Supabase client with proper Database types
type SupabaseClientType = SupabaseClient<Database>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Thresholds per packages/shared/logic/fraud.ts
const THRESHOLDS = {
  HIGH_VARIANCE_PERCENTAGE: 15,
  PERFECT_MATCH_CONSECUTIVE_LIMIT: 3,
  URGENT_TO_BAR_WEEKLY_LIMIT: 5,
  MIN_VALUE_FOR_ALERT: 50000, // VND
};

type RiskLevel = "low" | "medium" | "high" | "critical";
type AlertType =
  | "high_variance"
  | "perfect_match"
  | "pattern_anomaly"
  | "missing_evidence"
  | "ghost_transfer"
  | "low_stock";

// Use the Insert type from Database schema directly
type FraudAlertInsert = Database["public"]["Tables"]["fraud_alerts"]["Insert"];

interface FraudAlert {
  business_id: string;
  log_type: string;
  log_id: string;
  alert_type: AlertType;
  risk_level: RiskLevel;
  ingredient_id?: string;
  variance_percentage?: number;
  notes?: string;
}

interface InventoryLog {
  id: string;
  ingredient_id: string;
  variance: number;
  variance_percentage: number;
}

async function checkVarianceTrap(
  supabase: SupabaseClientType,
  businessId: string
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // Get recent inventory logs grouped by ingredient
  const { data: recentLogs } = (await supabase
    .from("inventory_logs")
    .select("id, ingredient_id, variance, variance_percentage")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50)) as { data: InventoryLog[] | null };

  if (!recentLogs) return alerts;

  // Group by ingredient
  const byIngredient = new Map<string, InventoryLog[]>();
  for (const log of recentLogs) {
    const logs = byIngredient.get(log.ingredient_id) || [];
    logs.push(log);
    byIngredient.set(log.ingredient_id, logs);
  }

  // Check for consecutive perfect matches
  for (const [ingredientId, logs] of byIngredient) {
    let consecutivePerfect = 0;
    for (const log of logs.slice(0, 10)) {
      // Check last 10
      if (Math.abs(log.variance_percentage || 0) < 0.1) {
        consecutivePerfect++;
      } else {
        break;
      }
    }

    if (consecutivePerfect >= THRESHOLDS.PERFECT_MATCH_CONSECUTIVE_LIMIT) {
      alerts.push({
        business_id: businessId,
        log_type: "inventory_log",
        log_id: logs[0].id,
        alert_type: "perfect_match",
        risk_level: "medium",
        ingredient_id: ingredientId,
        notes: `${consecutivePerfect} lần kiểm kho khớp hoàn hảo (0% chênh lệch) - có thể là "bút kim" (pencil whipping)`,
      });
    }
  }

  return alerts;
}

async function checkGhostTransfer(
  supabase: SupabaseClientType,
  businessId: string
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // Get "Urgent to Bar" imports in the last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get import logs that went directly to SERVICE area
  const { data: serviceArea } = (await supabase
    .from("storage_areas")
    .select("id")
    .eq("business_id", businessId)
    .eq("type", "SERVICE")
    .single()) as { data: { id: string } | null };

  if (!serviceArea) return alerts;

  const { count: urgentImports } = await supabase
    .from("import_logs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("target_area_id", serviceArea.id)
    .gte("created_at", weekAgo.toISOString());

  // Get transfer logs in the same period
  const { count: transfers } = await supabase
    .from("transfer_logs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", weekAgo.toISOString());

  // Ghost Transfer: Many urgent imports but no transfers
  if (
    (urgentImports || 0) > THRESHOLDS.URGENT_TO_BAR_WEEKLY_LIMIT &&
    (transfers || 0) === 0
  ) {
    alerts.push({
      business_id: businessId,
      log_type: "pattern",
      log_id: "ghost_transfer_" + Date.now(),
      alert_type: "ghost_transfer",
      risk_level: "high",
      notes: `${urgentImports} lần "Nhập trực tiếp vào Bar" trong 7 ngày nhưng không có phiếu chuyển kho - có thể đang bỏ qua kiểm soát kho`,
    });
  }

  return alerts;
}

async function checkLowStock(
  supabase: SupabaseClientType,
  businessId: string
): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  // Get SERVICE area (Bar)
  const { data: serviceArea } = (await supabase
    .from("storage_areas")
    .select("id")
    .eq("business_id", businessId)
    .eq("type", "SERVICE")
    .single()) as { data: { id: string } | null };

  if (!serviceArea) return alerts;

  // Check stock levels against min_threshold
  const { data: lowStockItems } = (await supabase
    .from("stock_levels")
    .select(
      `
      id,
      quantity,
      ingredient:ingredients(id, name, min_threshold)
    `
    )
    .eq("area_id", serviceArea.id)) as {
    data:
      | {
          id: string;
          quantity: number;
          ingredient: { id: string; name: string; min_threshold: number };
        }[]
      | null;
  };

  if (!lowStockItems) return alerts;

  for (const item of lowStockItems) {
    const ing = item.ingredient;
    if (!ing) continue;

    if (item.quantity < ing.min_threshold) {
      alerts.push({
        business_id: businessId,
        log_type: "stock_level",
        log_id: item.id,
        alert_type: "low_stock",
        risk_level: "low",
        ingredient_id: ing.id,
        notes: `${ing.name} còn ${item.quantity} (dưới ngưỡng ${ing.min_threshold})`,
      });
    }
  }

  return alerts;
}

async function saveAlerts(
  supabase: SupabaseClientType,
  alerts: FraudAlert[]
): Promise<void> {
  if (alerts.length === 0) return;

  // Insert alerts (ignore duplicates based on log_id)
  for (const alert of alerts) {
    // Convert to the database insert type
    const insertData: FraudAlertInsert = {
      business_id: alert.business_id,
      log_type: alert.log_type,
      log_id: alert.log_id,
      alert_type: alert.alert_type,
      risk_level: alert.risk_level,
      ingredient_id: alert.ingredient_id ?? null,
      variance_percentage: alert.variance_percentage ?? null,
      notes: alert.notes ?? null,
      created_at: new Date().toISOString(),
    };
    await supabase
      .from("fraud_alerts")
      .upsert(insertData, { onConflict: "log_id" });
  }
}

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { business_id, check_types } = await req.json();

    if (!business_id) {
      return new Response(
        JSON.stringify({ success: false, error: "business_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const typedSupabase = supabase as SupabaseClientType;
    const allAlerts: FraudAlert[] = [];

    // Run requested checks (or all by default)
    const checks = check_types || [
      "variance_trap",
      "ghost_transfer",
      "low_stock",
    ];

    if (checks.includes("variance_trap")) {
      const alerts = await checkVarianceTrap(typedSupabase, business_id);
      allAlerts.push(...alerts);
    }

    if (checks.includes("ghost_transfer")) {
      const alerts = await checkGhostTransfer(typedSupabase, business_id);
      allAlerts.push(...alerts);
    }

    if (checks.includes("low_stock")) {
      const alerts = await checkLowStock(typedSupabase, business_id);
      allAlerts.push(...alerts);
    }

    // Save alerts to database
    await saveAlerts(typedSupabase, allAlerts);

    return new Response(
      JSON.stringify({
        success: true,
        alerts_generated: allAlerts.length,
        alerts: allAlerts.map((a) => ({
          type: a.alert_type,
          risk_level: a.risk_level,
          notes: a.notes,
        })),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in fraud detection:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
