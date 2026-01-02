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
      console.error("[InventoryModelContext] Load error:", err);
      setModel("STANDARD"); // Default on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync from server and update state
  const syncModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await syncBusinessConfig();
      if (result.inventoryModel) {
        setModel(result.inventoryModel as InventoryModel);
        console.log("✅ [Context] Model synced:", result.inventoryModel);
      }
      // Also reload businessId
      await loadModel();
    } catch (err) {
      console.error("[InventoryModelContext] Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [loadModel]);

  // Initial load on mount
  useEffect(() => {
    loadModel();
  }, [loadModel]);

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
