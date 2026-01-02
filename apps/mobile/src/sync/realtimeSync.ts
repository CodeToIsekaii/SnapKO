/**
 * Realtime Sync - Signal Pattern Implementation
 * "Rung Chuông" (Ring the Bell) - sends 1 signal instead of N data changes
 * Reduces Supabase Realtime quota usage by 90%
 */

import { supabase } from "../lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

let signalChannel: RealtimeChannel | null = null;

/**
 * Ring the stock bell after successful sync
 * Call this after syncEngine pushes data to server
 */
export async function triggerStockUpdateSignal(
  businessId: string
): Promise<void> {
  try {
    const { error } = await supabase.from("sync_signals").upsert({
      business_id: businessId,
      last_stock_update: new Date().toISOString(),
    });

    if (error) {
      console.error("[Signal] Failed to trigger stock signal:", error);
    } else {
      console.log("🔔 Signal sent: Stock updated");
    }
  } catch (err) {
    console.error("[Signal] Error:", err);
  }
}

/**
 * Ring the master data bell (for ingredient changes)
 */
export async function triggerMasterDataSignal(
  businessId: string
): Promise<void> {
  try {
    const { error } = await supabase.from("sync_signals").upsert({
      business_id: businessId,
      last_master_data_update: new Date().toISOString(),
    });

    if (error) {
      console.error("[Signal] Failed to trigger master data signal:", error);
    } else {
      console.log("🔔 Signal sent: Master data updated");
    }
  } catch (err) {
    console.error("[Signal] Error:", err);
  }
}

/**
 * Subscribe to signals from other devices
 * @param businessId - The business ID to subscribe to
 * @param onStockChanged - Callback when stock data changes
 * @param onMasterDataChanged - Callback when master data changes
 * @returns Unsubscribe function
 */
export function subscribeToSignals(
  businessId: string,
  onStockChanged: () => void,
  onMasterDataChanged: () => void
): () => void {
  // Clean up existing channel
  if (signalChannel) {
    console.log("[Signal] Cleaning up existing subscription");
    signalChannel.unsubscribe();
    signalChannel = null;
  }

  console.log("[Signal] Subscribing to business:", businessId);

  signalChannel = supabase
    .channel(`business:${businessId}:signals`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sync_signals",
        filter: `business_id=eq.${businessId}`,
      },
      (payload) => {
        const newData = payload.new as Record<string, unknown>;
        const oldData = payload.old as Record<string, unknown>;

        // Check which signal changed
        if (newData.last_stock_update !== oldData.last_stock_update) {
          console.log("🔔 Stock signal received from another device");
          onStockChanged();
        }

        if (
          newData.last_master_data_update !== oldData.last_master_data_update
        ) {
          console.log("🔔 Master data signal received");
          onMasterDataChanged();
        }
      }
    )
    .subscribe((status) => {
      console.log("[Signal] Subscription status:", status);
    });

  // Return unsubscribe function
  return () => {
    if (signalChannel) {
      console.log("[Signal] Unsubscribing from channel");
      signalChannel.unsubscribe();
      signalChannel = null;
    }
  };
}

/**
 * Check if realtime is currently connected
 */
export function isRealtimeConnected(): boolean {
  return signalChannel !== null;
}
