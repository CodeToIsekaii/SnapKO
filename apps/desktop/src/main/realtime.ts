/**
 * SnapKO Desktop - Realtime Listener
 *
 * Subscribes to:
 * 1. sync_signals - Signal Pattern for efficient stock updates (with debounce)
 * 2. inventory_logs - Individual log inserts
 * 3. ingredients - Master data updates
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { BrowserWindow } from "electron";
import { Env } from "../env";
import { pullIngredients, invalidatePullCache } from "./sync";

// Environment variables (validated via Zod in env.ts)
const SUPABASE_URL = Env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.VITE_SUPABASE_ANON_KEY;

// Realtime subscription
let realtimeChannel: RealtimeChannel | null = null;
let signalChannel: RealtimeChannel | null = null;
let businessChannel: RealtimeChannel | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;

// Debounce for thundering herd prevention
let pullTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 500;

// Fallback polling when realtime channel fails (TIMED_OUT / CHANNEL_ERROR)
const fallbackTimers: Map<string, NodeJS.Timeout> = new Map();
const FALLBACK_POLL_MS = 10 * 60 * 1000; // 10 min — realtime handles fresh updates, fallback chỉ cần catch stragglers

function startFallbackPolling(
  channelName: string,
  mainWindow: BrowserWindow | null
): void {
  if (fallbackTimers.has(channelName)) return;
  console.warn(
    `[Realtime] ${channelName} unhealthy -> fallback polling every ${FALLBACK_POLL_MS}ms`
  );
  const timer = setInterval(async () => {
    try {
      const result = await pullIngredients();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("stock-updated", result);
      }
    } catch (err) {
      console.error(`[Realtime] Fallback poll error (${channelName}):`, err);
    }
  }, FALLBACK_POLL_MS);
  fallbackTimers.set(channelName, timer);
}

function stopFallbackPolling(channelName: string): void {
  const timer = fallbackTimers.get(channelName);
  if (timer) {
    clearInterval(timer);
    fallbackTimers.delete(channelName);
    console.log(`[Realtime] ${channelName} recovered -> fallback polling stopped`);
  }
}

/**
 * Start Realtime listener for inventory logs
 * Called after successful login
 */
export function startRealtimeListener(
  accessToken: string,
  businessId: string,
  mainWindow: BrowserWindow | null
): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[Realtime] Missing Supabase env vars");
    return;
  }

  // Stop existing listener if any
  stopRealtimeListener();

  // Create authenticated client
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // ============ SIGNAL PATTERN: Listen to sync_signals ============
  signalChannel = supabaseClient
    .channel(`business:${businessId}:signals`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sync_signals",
        filter: `business_id=eq.${businessId}`,
      },
      async (payload) => {
        const newData = payload.new as Record<string, unknown>;
        const oldData = payload.old as Record<string, unknown>;

        if (newData.last_stock_update !== oldData.last_stock_update) {
          console.log("🔔 [Realtime] Stock signal received");

          // Debounce to prevent thundering herd
          if (pullTimeout) clearTimeout(pullTimeout);

          pullTimeout = setTimeout(async () => {
            console.log("🚀 [Realtime] Executing debounced pull...");
            try {
              invalidatePullCache(); // real mutation → bypass 10-min TTL
              const result = await pullIngredients();
              console.log("[Realtime] Pulled:", result.synced, "items");

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("stock-updated", result);
              }
            } catch (err) {
              console.error("[Realtime] Pull error:", err);
            }
            pullTimeout = null;
          }, DEBOUNCE_MS);
        }

        if (
          newData.last_master_data_update !== oldData.last_master_data_update
        ) {
          console.log("🔔 [Realtime] Master data signal received");

          if (pullTimeout) clearTimeout(pullTimeout);

          pullTimeout = setTimeout(async () => {
            try {
              invalidatePullCache(); // real mutation → bypass 10-min TTL
              const result = await pullIngredients();
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("ingredients-updated", result);
              }
            } catch (err) {
              console.error("[Realtime] Pull error:", err);
            }
            pullTimeout = null;
          }, DEBOUNCE_MS);
        }
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] Signal subscription:", status);
      if (status === "SUBSCRIBED") {
        stopFallbackPolling("signals");
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("realtime-connected", { connected: true });
        }
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        startFallbackPolling("signals", mainWindow);
      }
    });

  // ============ ORIGINAL: Listen to inventory_logs ============
  realtimeChannel = supabaseClient
    .channel("inventory_logs_changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "inventory_logs",
        filter: `business_id=eq.${businessId}`,
      },
      (payload) => {
        console.log("[Realtime] New inventory log:", payload.new);

        // Send to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("realtime:new-log", payload.new);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "ingredients",
        filter: `business_id=eq.${businessId}`,
      },
      (payload) => {
        console.log("[Realtime] Ingredient updated:", payload.new);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            "realtime:ingredient-update",
            payload.new
          );
        }
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] Logs subscription status:", status);
      if (status === "SUBSCRIBED") {
        stopFallbackPolling("logs");
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        startFallbackPolling("logs", mainWindow);
      }
    });

  // ============ BUSINESS SETTINGS: Listen to businesses table for Inventory Model changes ============
  businessChannel = supabaseClient
    .channel("business_settings_changes")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "businesses",
        filter: `id=eq.${businessId}`,
      },
      (payload) => {
        console.log("🔔 [Realtime] Business settings updated:", payload.new);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("business-updated", payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] Business subscription status:", status);
      if (status === "SUBSCRIBED") {
        stopFallbackPolling("business");
      } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        startFallbackPolling("business", mainWindow);
      }
    });

  console.log(`[Realtime] Listening for business: ${businessId}`);
}

/**
 * Stop Realtime listener
 * Called on logout or app close
 */
export function stopRealtimeListener(): void {
  // Clear debounce timer
  if (pullTimeout) {
    clearTimeout(pullTimeout);
    pullTimeout = null;
  }

  // Clear all fallback polling timers
  for (const [name, timer] of fallbackTimers.entries()) {
    clearInterval(timer);
    console.log(`[Realtime] Cleared fallback timer: ${name}`);
  }
  fallbackTimers.clear();

  if (signalChannel && supabaseClient) {
    supabaseClient.removeChannel(signalChannel);
    signalChannel = null;
    console.log("[Realtime] Stopped signal listener");
  }

  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
    console.log("[Realtime] Stopped logs listener");
  }

  if (businessChannel && supabaseClient) {
    supabaseClient.removeChannel(businessChannel);
    businessChannel = null;
    console.log("[Realtime] Stopped business settings listener");
  }

  if (supabaseClient) {
    supabaseClient = null;
  }
}

/**
 * Check if Realtime is connected
 */
export function isRealtimeConnected(): boolean {
  return signalChannel !== null || realtimeChannel !== null;
}
