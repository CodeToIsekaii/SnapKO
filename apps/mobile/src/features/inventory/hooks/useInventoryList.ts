// src/features/inventory/hooks/useInventoryList.ts
// SOLID: Controller Pattern - Hook connects UI with Service
// Screen components should ONLY use this hook, never call Service directly

import { useState, useEffect, useCallback } from "react";
import {
  InventoryService,
  PendingLogService,
  IngredientData,
} from "../services/inventory.service";

interface UseInventoryListReturn {
  ingredients: IngredientData[];
  loading: boolean;
  error: string | null;
  pendingCount: number;
  totalValue: number;

  // Actions
  refresh: () => Promise<void>;
  syncFromServer: (items: IngredientData[]) => Promise<number>;
}

export function useInventoryList(): UseInventoryListReturn {
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalValue, setTotalValue] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Initialize DB if needed
      await InventoryService.init();

      // Fetch data in parallel
      const [items, total, pending] = await Promise.all([
        InventoryService.getAll(),
        InventoryService.getTotalValue(),
        PendingLogService.getPendingCount(),
      ]);

      setIngredients(items);
      setTotalValue(total);
      setPendingCount(pending);
    } catch (err: any) {
      console.error("[useInventoryList] Error:", err);
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFromServer = useCallback(
    async (items: IngredientData[]) => {
      try {
        const count = await InventoryService.syncFromServer(items);
        await refresh();
        return count;
      } catch (err: any) {
        console.error("[useInventoryList] Sync error:", err);
        throw err;
      }
    },
    [refresh]
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ingredients,
    loading,
    error,
    pendingCount,
    totalValue,
    refresh,
    syncFromServer,
  };
}
