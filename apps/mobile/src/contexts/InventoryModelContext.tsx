/**
 * InventoryModelContext - Global state for inventory model
 * Ensures all screens share the same effective inventory model.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { getDB } from "../db";
import { syncBusinessConfig } from "../lib/supabase";
import {
  normalizeInventoryModel,
  usesDualAreaFlow,
  type InventoryModel,
} from "./inventoryModelState";

interface InventoryModelContextValue {
  model: InventoryModel;
  businessId: string | null;
  isLoading: boolean;
  isSimple: boolean;
  isStandard: boolean;
  isChain: boolean;
  syncModel: () => Promise<void>;
}

const InventoryModelContext = createContext<InventoryModelContextValue | null>(
  null
);

export function InventoryModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<InventoryModel>("SIMPLE");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from local SQLite with retry for database lock
  const loadModel = useCallback(async (retryCount = 0): Promise<void> => {
    try {
      const db = await getDB();

      // Safety check - DB might not be ready yet
      if (!db) {
        console.warn(
          "[InventoryModelContext] Database not ready, using default"
        );
        setModel("SIMPLE");
        setIsLoading(false);
        return;
      }

      const profile = await db.getFirstAsync<{
        inventory_model: string;
        business_id: string;
      }>("SELECT inventory_model, business_id FROM local_profiles LIMIT 1");

      if (profile) {
        const localModel = normalizeInventoryModel(profile.inventory_model);
        setModel(localModel);
        if (profile.business_id) {
          setBusinessId(profile.business_id);
        }
      }
    } catch (err: any) {
      // Retry on database lock
      if (err?.message?.includes("locked") && retryCount < 3) {
        console.log(
          `[InventoryModelContext] DB locked, retry ${retryCount + 1}/3...`
        );
        await new Promise((r) => setTimeout(r, 300));
        return loadModel(retryCount + 1);
      }

      // Handle NullPointerException or database not ready
      if (
        err?.message?.includes("NullPointer") ||
        err?.message?.includes("rejected")
      ) {
        console.warn(
          "[InventoryModelContext] DB not ready, using default model"
        );
        setModel("SIMPLE");
        setIsLoading(false);
        return;
      }

      console.error("[InventoryModelContext] Load error:", err);
      setModel("SIMPLE"); // Locked-safe default on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync from server and update state DIRECTLY (don't read old local DB!)
  const syncModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await syncBusinessConfig();
      console.log("🔍 [Context] Full sync result:", JSON.stringify(result));

      if (result.inventoryModel) {
        // Set model directly from server result
        setModel(normalizeInventoryModel(result.inventoryModel));
        console.log(
          "✅ [Context] Model synced from SERVER:",
          result.inventoryModel
        );
      } else {
        setModel("SIMPLE");
      }

      // Set businessId directly from server result (for Realtime subscription!)
      if (result.businessId) {
        setBusinessId(result.businessId);
        console.log("✅ [Context] BusinessId SET:", result.businessId);
      } else {
        console.warn("⚠️ [Context] No businessId in sync result!");
      }
    } catch (err) {
      console.error("[InventoryModelContext] Sync error:", err);
      setModel("SIMPLE");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load: Offline-First approach
  // Loads from local DB IMMEDIATELY, then syncs from server in background
  useEffect(() => {
    const init = async () => {
      // 1. Load from local DB FIRST (near-instant)
      await loadModel();

      // 2. Then try to sync from server to get fresh data (background)
      // This won't block the UI since isLoaded will be set by loadModel()
      try {
        await syncModel();
      } catch (err) {
        console.log(
          "[InventoryModelContext] Background sync failed (offline?), using local data."
        );
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // 🔔 REALTIME SUBSCRIPTION - Runs at Context level when businessId is set
  useEffect(() => {
    if (!businessId) {
      console.log("⏳ [Context Realtime] Waiting for businessId...");
      return;
    }

    console.log(
      `🔔 [Context Realtime] Setting up subscription for business: ${businessId}`
    );

    // Import supabase and setup channel
    let channel: any = null;
    let isMounted = true;
    let realtimeFallbackLogged = false;

    (async () => {
      const { supabase } = await import("../lib/supabase");

      if (!isMounted) return; // Component unmounted during import

      const channelName = `business-model-sync-${businessId}`;

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "businesses",
            filter: `id=eq.${businessId}`,
          },
          async (payload: any) => {
            const newModel = payload.new?.inventory_model;
            console.log(
              "🔔 [Context Realtime] RECEIVED model change:",
              newModel
            );

            if (newModel) {
              await syncModel();
              console.log("✅ [Context Realtime] Model change pulled from server:", newModel);

              // Show notification
              const { Alert, Platform, ToastAndroid } = await import(
                "react-native"
              );
              if (Platform.OS === "android") {
                ToastAndroid.show(
                  "Đã đồng bộ mô hình kho",
                  ToastAndroid.LONG
                );
              } else {
                Alert.alert(
                  "Cập nhật hệ thống",
                  "Đã đồng bộ mô hình kho"
                );
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log(`🔔 [Context Realtime] Status: ${status}`, err || "");
          if (status === "SUBSCRIBED") {
            console.log("✅ [Context Realtime] Successfully subscribed!");
            realtimeFallbackLogged = false;
          } else if (status === "CHANNEL_ERROR") {
            if (!realtimeFallbackLogged) {
              realtimeFallbackLogged = true;
              console.log(
                "[Context Realtime] Channel unavailable, using pull-sync fallback.",
                err || "",
              );
              syncModel().catch((syncErr) => {
                console.log(
                  "[Context Realtime] Fallback sync skipped:",
                  syncErr,
                );
              });
            }
          } else if (status === "TIMED_OUT" || status === "CLOSED") {
            console.log(
              `[Context Realtime] ${status}, app will keep using manual/pull sync fallback.`,
            );
          }
        });
    })();

    // Cleanup function - runs when businessId changes or component unmounts
    return () => {
      console.log("[Context Realtime] Cleaning up...");
      isMounted = false;
      if (channel) {
        import("../lib/supabase").then(({ supabase }) => {
          supabase.removeChannel(channel);
        });
      }
    };
  }, [businessId]);

  const value: InventoryModelContextValue = {
    model,
    businessId,
    isLoading,
    isSimple: model === "SIMPLE",
    isStandard: usesDualAreaFlow(model),
    isChain: model === "CHAIN",
    syncModel,
  };

  return (
    <InventoryModelContext.Provider value={value}>
      {children}
    </InventoryModelContext.Provider>
  );
}

// Hook to use the context
export function useInventoryModel(): InventoryModelContextValue {
  const context = useContext(InventoryModelContext);
  if (!context) {
    throw new Error(
      "useInventoryModel must be used within InventoryModelProvider"
    );
  }
  return context;
}
