/**
 * useRealtimeSync - Auto-refresh hook for Desktop
 * Listens to IPC events from main process and invalidates queries
 */

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface RealtimeSyncState {
  isConnected: boolean;
  lastUpdateAt: Date | null;
}

export function useRealtimeSync(): RealtimeSyncState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeSyncState>({
    isConnected: false,
    lastUpdateAt: null,
  });

  useEffect(() => {
    const handleStockUpdate = () => {
      console.log("[Renderer] Stock updated via realtime");
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["stockLevels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setState((prev) => ({ ...prev, lastUpdateAt: new Date() }));
    };

    const handleIngredientsUpdate = () => {
      console.log("[Renderer] Ingredients updated via realtime");
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setState((prev) => ({ ...prev, lastUpdateAt: new Date() }));
    };

    const handleRealtimeConnection = (data: { connected: boolean }) => {
      console.log("[Renderer] Realtime connection:", data.connected);
      setState((prev) => ({ ...prev, isConnected: data.connected }));
    };

    // Subscribe to IPC events from main process
    if (window.electronAPI) {
      window.electronAPI.on("stock-updated", handleStockUpdate);
      window.electronAPI.on("ingredients-updated", handleIngredientsUpdate);
      window.electronAPI.on("realtime-connected", handleRealtimeConnection);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.off("stock-updated", handleStockUpdate);
        window.electronAPI.off("ingredients-updated", handleIngredientsUpdate);
        window.electronAPI.off("realtime-connected", handleRealtimeConnection);
      }
    };
  }, [queryClient]);

  return state;
}
