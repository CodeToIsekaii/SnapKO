/**
 * useInventoryModel - Hook to access current inventory model
 * Returns SIMPLE or STANDARD based on user's profile
 */

import { useState, useEffect, useCallback } from "react";
import { getDB } from "../db";
import { syncBusinessConfig } from "../lib/supabase";

export type InventoryModel = "SIMPLE" | "STANDARD";

interface InventoryModelState {
  model: InventoryModel;
  businessId: string | null;
  isLoading: boolean;
  isSimple: boolean;
  isStandard: boolean;
  syncModel: () => Promise<void>;
}

export function useInventoryModel(): InventoryModelState {
  const [model, setModel] = useState<InventoryModel>("STANDARD");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadModel = useCallback(async () => {
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
    } catch (err) {
      console.error("[useInventoryModel] Error:", err);
      // Default to STANDARD on error (safer for new users)
      setModel("STANDARD");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync model from server and update local DB
  const syncModel = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await syncBusinessConfig();
      if (result.inventoryModel) {
        // Update state directly - DO NOT call loadModel() here!
        // loadModel() reads from SQLite which may have stale data due to async timing
        setModel(result.inventoryModel as InventoryModel);
        console.log("✅ Model synced:", result.inventoryModel);

        // Also update businessId from DB (fresh read after sync)
        const db = await import("../db").then((m) => m.getDB());
        const profile = await db.getFirstAsync<{ business_id: string }>(
          "SELECT business_id FROM local_profiles LIMIT 1"
        );
        if (profile?.business_id) {
          setBusinessId(profile.business_id);
        }
      }
    } catch (err) {
      console.error("[useInventoryModel] Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModel();
  }, [loadModel]);

  return {
    model,
    businessId,
    isLoading,
    isSimple: model === "SIMPLE",
    isStandard: model === "STANDARD",
    syncModel,
  };
}
