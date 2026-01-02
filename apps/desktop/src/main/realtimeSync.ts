/**
 * Desktop Realtime Sync - Signal Pattern Implementation
 * Listens to sync_signals table for stock updates from Mobile
 * Uses debounce to prevent thundering herd
 */

import { getSyncClient } from "./sync";
import { pullIngredients } from "./sync";
import { RealtimeChannel } from "@supabase/supabase-js";

let signalChannel: RealtimeChannel | null = null;
let pullTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 500; // Wait 500ms after last signal before pulling

/**
 * Subscribe to business signals (call after auth)
 */
export function subscribeToBusinessChannel(businessId: string): void {
  const client = getSyncClient();
  if (!client) {
    console.error("[Desktop Realtime] No sync client available");
    return;
  }

  // Clean up existing subscription
  if (signalChannel) {
    signalChannel.unsubscribe();
    signalChannel = null;
  }

  console.log("[Desktop Realtime] Subscribing to business:", businessId);

  signalChannel = client
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
          console.log("🔔 [Desktop] Stock signal received");

          // Debounce: Clear any pending pull and schedule a new one
          if (pullTimeout) {
            clearTimeout(pullTimeout);
          }

          pullTimeout = setTimeout(async () => {
            console.log("🚀 [Desktop] Executing debounced pull...");
            try {
              const result = await pullIngredients();
              console.log("[Desktop] Pulled:", result.synced, "items");
              notifyRenderer("stock-updated", result);
            } catch (err) {
              console.error("[Desktop] Pull error:", err);
            }
            pullTimeout = null;
          }, DEBOUNCE_MS);
        }

        if (
          newData.last_master_data_update !== oldData.last_master_data_update
        ) {
          console.log("🔔 [Desktop] Master data signal received");

          if (pullTimeout) {
            clearTimeout(pullTimeout);
          }

          pullTimeout = setTimeout(async () => {
            try {
              const result = await pullIngredients();
              notifyRenderer("ingredients-updated", result);
            } catch (err) {
              console.error("[Desktop] Pull error:", err);
            }
            pullTimeout = null;
          }, DEBOUNCE_MS);
        }
      }
    )
    .subscribe((status) => {
      console.log("[Desktop Realtime] Subscription status:", status);
      if (status === "SUBSCRIBED") {
        notifyRenderer("realtime-connected", { connected: true });
      }
    });
}

/**
 * Unsubscribe from business channel (call on logout)
 */
export function unsubscribeFromBusinessChannel(): void {
  if (pullTimeout) {
    clearTimeout(pullTimeout);
    pullTimeout = null;
  }

  if (signalChannel) {
    console.log("[Desktop Realtime] Unsubscribing from channel");
    signalChannel.unsubscribe();
    signalChannel = null;
    notifyRenderer("realtime-connected", { connected: false });
  }
}

/**
 * Check if realtime is currently connected
 */
export function isRealtimeConnected(): boolean {
  return signalChannel !== null;
}

/**
 * Notify renderer process of updates via IPC
 */
function notifyRenderer(event: string, data?: unknown): void {
  try {
    const { BrowserWindow } = require("electron");
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send(event, data);
    }
  } catch (err) {
    console.warn("[Desktop Realtime] Failed to notify renderer:", err);
  }
}
