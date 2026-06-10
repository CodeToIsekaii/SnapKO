/**
 * useInventoryModel - Hook to access current inventory model
 * Returns the effective inventory model based on user's profile.
 */

import { useState, useEffect, useCallback } from "react";
import { getDB } from "../db";
import { syncBusinessConfig } from "../lib/supabase";

export type InventoryModel = "SIMPLE" | "STANDARD" | "CHAIN";

function normalizeInventoryModel(value?: string | null): InventoryModel {
  if (value === "STANDARD" || value === "MODEL_B") return "STANDARD";
  if (value === "CHAIN") return "CHAIN";
  return "SIMPLE";
}

interface InventoryModelState {
  model: InventoryModel;
  businessId: string | null;
  isLoading: boolean;
  isSimple: boolean;
  isStandard: boolean;
  isChain: boolean;
  syncModel: () => Promise<void>;
}

export function useInventoryModel(): InventoryModelState {
  const [model, setModel] = useState<InventoryModel>("SIMPLE");
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
        const localModel = normalizeInventoryModel(profile.inventory_model);
        if (localModel === "SIMPLE") {
          setModel("SIMPLE");
        }
        if (profile.business_id) {
          setBusinessId(profile.business_id);
        }
      }
    } catch (err) {
      console.error("[useInventoryModel] Error:", err);
      setModel("SIMPLE");
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
        setModel(normalizeInventoryModel(result.inventoryModel));
        console.log("✅ Model synced:", result.inventoryModel);

        // Also update businessId from DB (fresh read after sync)
        const db = await import("../db").then((m) => m.getDB());
        const profile = await db.getFirstAsync<{ business_id: string }>(
          "SELECT business_id FROM local_profiles LIMIT 1"
        );
        if (profile?.business_id) {
          setBusinessId(profile.business_id);
        }
      } else {
        setModel("SIMPLE");
      }
    } catch (err) {
      console.error("[useInventoryModel] Sync error:", err);
      setModel("SIMPLE");
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
    isStandard: model !== "SIMPLE",
    isChain: model === "CHAIN",
    syncModel,
  };
}
