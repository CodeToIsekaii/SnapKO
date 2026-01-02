/**
 * InventoryModelContext - Global state for inventory model
 * Ensures all screens share the same model state (SIMPLE vs STANDARD)
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

export type InventoryModel = "SIMPLE" | "STANDARD";

interface InventoryModelContextValue {
  model: InventoryModel;
  businessId: string | null;
  isLoading: boolean;
  isSimple: boolean;
  isStandard: boolean;
  syncModel: () => Promise<void>;
}

const InventoryModelContext = createContext<InventoryModelContextValue | null>(
  null
);

export function InventoryModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<InventoryModel>("STANDARD");
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
        setModel("STANDARD");
        setIsLoading(false);
        return;
      }

      const profile = await db.getFirstAsync<{
        inventory_model: string;
        business_id: string;
      }>("SELECT inventory_model, business_id FROM local_profiles LIMIT 1");

      if (profile) {
        if (profile.inventory_model) {
          setModel(profile.inventory_model as InventoryModel);
        }
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
        setModel("STANDARD");
        setIsLoading(false);
        return;
      }

      console.error("[InventoryModelContext] Load error:", err);
      setModel("STANDARD"); // Default on error
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
        setModel(result.inventoryModel as InventoryModel);
        console.log(
          "✅ [Context] Model synced from SERVER:",
          result.inventoryModel
        );
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load: try to sync from server first, fallback to local
  useEffect(() => {
    const init = async () => {
      try {
        // Try server sync first for fresh data
        await syncModel();
      } catch {
        // Fallback to local DB
        await loadModel();
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
              setModel(newModel as InventoryModel);
              console.log("✅ [Context Realtime] Model updated to:", newModel);

              // Show notification
              const { Alert, Platform, ToastAndroid } = await import(
                "react-native"
              );
              if (Platform.OS === "android") {
                ToastAndroid.show(
                  `Chế độ kho: ${
                    newModel === "STANDARD" ? "Kho Kép" : "Kho Đơn"
                  }`,
                  ToastAndroid.LONG
                );
              } else {
                Alert.alert(
                  "Cập nhật hệ thống",
                  `Chế độ: ${
                    newModel === "STANDARD" ? "Kho Kép 📦" : "Kho Đơn 📋"
                  }`
                );
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log(`🔔 [Context Realtime] Status: ${status}`, err || "");
          if (status === "SUBSCRIBED") {
            console.log("✅ [Context Realtime] Successfully subscribed!");
          } else if (status === "CHANNEL_ERROR") {
            console.error(
              "❌ [Context Realtime] Error - check Realtime enabled!"
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
    isStandard: model === "STANDARD",
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
