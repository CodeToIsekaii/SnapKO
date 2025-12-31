/**
 * SnapKO Desktop - Realtime Listener
 *
 * Subscribes to inventory_logs changes via Supabase Realtime
 * Sends new logs to renderer via IPC
 */

import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { BrowserWindow } from "electron";
import { Env } from "../env";

// Environment variables (validated via Zod in env.ts)
const SUPABASE_URL = Env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.VITE_SUPABASE_ANON_KEY;

// Realtime subscription
let realtimeChannel: RealtimeChannel | null = null;
let supabaseClient: ReturnType<typeof createClient> | null = null;

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

  // Subscribe to inventory_logs changes for this business
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
      console.log("[Realtime] Subscription status:", status);
    });

  console.log(`[Realtime] Listening for business: ${businessId}`);
}

/**
 * Stop Realtime listener
 * Called on logout or app close
 */
export function stopRealtimeListener(): void {
  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
    console.log("[Realtime] Stopped listener");
  }

  if (supabaseClient) {
    supabaseClient = null;
  }
}

/**
 * Check if Realtime is connected
 */
export function isRealtimeConnected(): boolean {
  return realtimeChannel !== null;
}
