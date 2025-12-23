// src/hooks/useInventory.ts - Inventory Data Logic (SOLID: Single Responsibility)
// Handles: Load ingredients, pending logs, sync status, COGS report
// UI components MUST use this hook, NOT call electronAPI directly

import { useState, useEffect, useCallback } from "react";
import { Ingredient, PendingLog, SyncStatus, COGSReport } from "../types";

interface InventoryState {
  ingredients: Ingredient[];
  pendingLogs: PendingLog[];
  cogsReport: COGSReport | null;
  syncStatus: SyncStatus;
  loading: boolean;
}

export function useInventory() {
  const [state, setState] = useState<InventoryState>({
    ingredients: [],
    pendingLogs: [],
    cogsReport: null,
    syncStatus: {
      pending: 0,
      lastSync: null,
      syncing: false,
    },
    loading: true,
  });

  // Calculate derived values
  const totalValue = state.ingredients.reduce(
    (sum, item) => sum + (item.warehouse_qty + item.bar_qty) * item.unit_cost,
    0
  );

  const lowStockItems = state.ingredients.filter(
    (item) => item.warehouse_qty + item.bar_qty < 10
  );

  // Load all data
  const loadData = useCallback(async () => {
    try {
      const [ingredients, logs, cogsReport] = await Promise.all([
        window.electronAPI.getIngredients?.() || [],
        window.electronAPI.getPendingLogs?.() || [],
        window.electronAPI.getCOGSReport?.() || null,
      ]);

      setState((s) => ({
        ...s,
        ingredients,
        pendingLogs: logs,
        cogsReport,
        syncStatus: {
          ...s.syncStatus,
          pending: logs.length,
        },
        loading: false,
      }));
    } catch (err) {
      console.error("[useInventory] Load data error:", err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync from server
  const syncFromServer = useCallback(async () => {
    setState((s) => ({
      ...s,
      syncStatus: { ...s.syncStatus, syncing: true },
    }));

    try {
      await window.electronAPI.syncFromServer?.();
      await loadData();

      setState((s) => ({
        ...s,
        syncStatus: {
          ...s.syncStatus,
          syncing: false,
          lastSync: new Date().toISOString(),
        },
      }));
    } catch (err) {
      console.error("[useInventory] Sync error:", err);
      setState((s) => ({
        ...s,
        syncStatus: { ...s.syncStatus, syncing: false },
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
  };
}
