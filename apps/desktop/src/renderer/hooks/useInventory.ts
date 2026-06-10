// src/hooks/useInventory.ts - Inventory Data Logic (SOLID: Single Responsibility)
// Handles: Load ingredients, pending logs, sync status, COGS report
// UI components MUST use this hook, NOT call electronAPI directly

import { useState, useEffect, useCallback } from "react";

import {
  Ingredient,
  PendingLog,
  SyncStatus,
  COGSReport,
  ActivityLog,
} from "../types";
import {
  calculateInventoryItemValue,
  getInventoryQuantitiesInBase,
} from "../../shared/inventoryValue";

interface InventoryState {
  ingredients: Ingredient[];
  pendingLogs: PendingLog[];
  logs: ActivityLog[];
  cogsReport: COGSReport | null;
  syncStatus: SyncStatus;
  loading: boolean;
}

export function useInventory() {
  const [state, setState] = useState<InventoryState>({
    ingredients: [],
    pendingLogs: [],
    logs: [],
    cogsReport: null,
    syncStatus: {
      pending: 0,
      lastSync: null,
      syncing: false,
      lastError: null,
    },
    loading: true,
  });

  // Calculate derived values
  const totalValue = state.ingredients.reduce(
    (sum, item) => sum + calculateInventoryItemValue(item),
    0
  );

  const lowStockItems = state.ingredients.filter(
    (item) => getInventoryQuantitiesInBase(item).totalQtyInBase < 10
  );

  // Load all data
  const loadData = useCallback(async () => {
    try {
      const retentionDays =
        (await window.electronAPI.getRetentionDays?.()) || 30;

      const results = await Promise.all([
        window.electronAPI.getIngredients?.() || [],
        window.electronAPI.getPendingLogs?.() || [],
        window.electronAPI.getInventoryLogs?.({
          limit: 100, // Increase limit to allow logic filtering
          days: retentionDays > 0 ? retentionDays : undefined,
        }) || [],
        window.electronAPI.getCOGSReport?.() || null,
      ]);
      const [ingredients, pendingLogs, logs, cogsReport] = results;

      setState((s) => ({
        ...s,
        ingredients,
        pendingLogs,
        logs,
        cogsReport,
        syncStatus: {
          ...s.syncStatus,
          pending: pendingLogs.length,
        },
        loading: false,
      }));
    } catch (err) {
      console.error("[useInventory] Load data error:", err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Initial load & Realtime Listeners
  useEffect(() => {
    loadData();

    // Listen for new logs from Mobile
    const removeLogListener = window.electronAPI.onNewLog?.(() => {
      console.log("🔔 [Inventory] New log received, refreshing...");
      loadData();
    });

    return () => {
      removeLogListener?.();
    };
  }, [loadData]);

  // Sync from server. Pass `force: true` to bypass the 10-min pull cache —
  // dùng cho user-triggered actions (nút Đồng bộ). Auto-sync trên mount thì
  // gọi không có force để tận dụng cache.
  const syncFromServer = useCallback(async (opts?: { force?: boolean }) => {
    setState((s) => ({
      ...s,
      syncStatus: { ...s.syncStatus, syncing: true, lastError: null },
    }));

    try {
      const result = await window.electronAPI.syncFromServer?.(opts);
      if (!result?.success) {
        throw new Error(result?.error || "Đồng bộ thất bại");
      }
      await loadData();

      setState((s) => ({
        ...s,
        syncStatus: {
          ...s.syncStatus,
          syncing: false,
          lastSync: new Date().toISOString(),
          lastError: null,
        },
      }));
    } catch (err) {
      console.error("[useInventory] Sync error:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Đồng bộ thất bại";
      setState((s) => ({
        ...s,
        syncStatus: { ...s.syncStatus, syncing: false, lastError: errorMessage },
      }));
    }
  }, [loadData]);

  // Export to Excel
  const exportToExcel = useCallback(async () => {
    try {
      const result = await window.electronAPI.exportExcel?.(state.ingredients);
      return result;
    } catch (err) {
      console.error("[useInventory] Export error:", err);
      return { success: false, error: "Export failed" };
    }
  }, [state.ingredients]);

  // Export COGS report
  const exportCOGSReport = useCallback(async () => {
    if (!state.cogsReport) return { success: false };

    try {
      const result = await window.electronAPI.exportCOGSReport?.(
        state.cogsReport
      );
      return result;
    } catch (err) {
      console.error("[useInventory] Export COGS error:", err);
      return { success: false };
    }
  }, [state.cogsReport]);

  return {
    // Data
    ingredients: state.ingredients,
    pendingLogs: state.pendingLogs,
    cogsReport: state.cogsReport,
    syncStatus: state.syncStatus,
    loading: state.loading,

    // Computed
    totalValue,
    lowStockItems,

    // Actions
    loadData,
    syncFromServer,
    exportToExcel,
    exportCOGSReport,
    logs: state.logs,
  };
}
