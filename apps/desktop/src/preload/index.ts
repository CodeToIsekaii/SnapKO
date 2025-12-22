import { contextBridge, ipcRenderer } from "electron";

// Expose IPC API to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // Database
  getIngredients: () => ipcRenderer.invoke("db:getIngredients"),
  upsertIngredient: (ingredient: any) =>
    ipcRenderer.invoke("db:upsertIngredient", ingredient),
  getPendingLogs: () => ipcRenderer.invoke("db:getPendingLogs"),
  addPendingLog: (log: any) => ipcRenderer.invoke("db:addPendingLog", log),
  markSynced: (ids: string[]) => ipcRenderer.invoke("db:markSynced", ids),
  getInventoryLogs: (limit?: number) =>
    ipcRenderer.invoke("db:getInventoryLogs", limit),

  // Printer
  getPrinters: () => ipcRenderer.invoke("printer:getList"),
  printInventory: (ingredients: any[]) =>
    ipcRenderer.invoke("printer:printInventory", ingredients),
  printReceipt: (data: any) => ipcRenderer.invoke("printer:printReceipt", data),

  // Sync (to be implemented)
  syncLogs: async () => {
    try {
      const logs = await ipcRenderer.invoke("db:getPendingLogs");
      if (logs.length === 0) return { success: true, synced: 0 };

      // TODO: Call Supabase sync-up API
      // For now, just mark as synced for testing
      const ids = logs.map((l: any) => l.id);
      await ipcRenderer.invoke("db:markSynced", ids);
      return { success: true, synced: ids.length };
    } catch (err) {
      console.error("Sync error:", err);
      return { success: false, error: String(err) };
    }
  },
});

// Legacy compatibility
contextBridge.exposeInMainWorld("snapko", {
  version: "1.0.0",
});
