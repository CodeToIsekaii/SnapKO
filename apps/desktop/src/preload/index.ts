/**
 * SnapKO Desktop - Preload Script
 *
 * Per .antigravityrules: "contextIsolation: true, nodeIntegration: false"
 * All Node.js APIs exposed via contextBridge only
 */

import { contextBridge, ipcRenderer } from "electron";

// Type definitions for renderer process
export interface ElectronAPI {
  // Auth
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; session?: any; error?: string }>;
  logout: () => Promise<{ success: boolean }>;
  setAuthToken: (token: string | null) => Promise<{ success: boolean }>;
  getSession: () => Promise<{ session: any | null }>;

  // Sync
  syncFromServer: () => Promise<{
    success: boolean;
    synced: number;
    error?: string;
  }>;

  // Database
  getIngredients: () => Promise<any[]>;
  upsertIngredient: (ingredient: any) => Promise<{ success: boolean }>;
  getPendingLogs: () => Promise<any[]>;
  addPendingLog: (log: any) => Promise<{ success: boolean }>;
  markSynced: (ids: string[]) => Promise<{ success: boolean; count: number }>;
  getInventoryLogs: (limit?: number) => Promise<any[]>;

  // Week 2: COGS Reports
  getCOGSReport: () => Promise<{
    summary: { totalValue: number; itemCount: number; lowStockCount: number };
    monthly: Array<{ month: string; warehouse: number; bar: number }>;
    losses: Array<{ name: string; value: number; color: string }>;
  }>;

  // Week 2: Staff Management
  getStaffProfiles: () => Promise<any[]>;
  generateInviteCode: () => Promise<{
    code: string;
    expiresAt: string;
    error?: string;
  }>;
  staffAction: (
    profileId: string,
    action: "approve" | "reject" | "deactivate"
  ) => Promise<{ success: boolean; error?: string }>;

  // Week 2: Export
  exportExcel: (data: any[]) => Promise<{
    success: boolean;
    path?: string;
    cancelled?: boolean;
  }>;
  exportCOGSReport: (reportData: any) => Promise<{
    success: boolean;
    path?: string;
  }>;

  // Printer
  getPrinters: () => Promise<string[]>;
  printInventory: (ingredients: any[]) => Promise<{ success: boolean }>;
  printReceipt: (data: any) => Promise<{ success: boolean }>;
  printThermal: (content: string) => Promise<{ success: boolean }>;

  // Realtime Listeners
  onNewLog: (callback: (log: any) => void) => () => void;
  onIngredientUpdate: (callback: (ingredient: any) => void) => () => void;
}

// Expose IPC API to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // ==================== AUTH ====================
  login: (email: string, password: string) =>
    ipcRenderer.invoke("auth:login", email, password),

  logout: () => ipcRenderer.invoke("auth:logout"),

  setAuthToken: (token: string | null) =>
    ipcRenderer.invoke("auth:set-token", token),

  getSession: () => ipcRenderer.invoke("auth:get-session"),

  // ==================== SYNC ====================
  syncFromServer: () => ipcRenderer.invoke("sync:pull"),

  // ==================== DATABASE ====================
  getIngredients: () => ipcRenderer.invoke("db:getIngredients"),

  upsertIngredient: (ingredient: any) =>
    ipcRenderer.invoke("db:upsertIngredient", ingredient),

  getPendingLogs: () => ipcRenderer.invoke("db:getPendingLogs"),

  addPendingLog: (log: any) => ipcRenderer.invoke("db:addPendingLog", log),

  markSynced: (ids: string[]) => ipcRenderer.invoke("db:markSynced", ids),

  getInventoryLogs: (limit?: number) =>
    ipcRenderer.invoke("db:getInventoryLogs", limit),

  // ==================== WEEK 2: COGS REPORTS ====================
  getCOGSReport: () => ipcRenderer.invoke("db:getCOGSReport"),

  // ==================== WEEK 2: STAFF MANAGEMENT ====================
  getStaffProfiles: () => ipcRenderer.invoke("db:getStaffProfiles"),

  generateInviteCode: () => ipcRenderer.invoke("staff:generateInviteCode"),

  staffAction: (profileId: string, action: string) =>
    ipcRenderer.invoke("staff:action", profileId, action),

  // ==================== WEEK 2: EXPORT ====================
  exportExcel: (data: any[]) => ipcRenderer.invoke("export:excel", data),

  exportCOGSReport: (reportData: any) =>
    ipcRenderer.invoke("export:cogsReport", reportData),

  // ==================== PRINTER ====================
  getPrinters: () => ipcRenderer.invoke("printer:getList"),

  printInventory: (ingredients: any[]) =>
    ipcRenderer.invoke("printer:printInventory", ingredients),

  printReceipt: (data: any) => ipcRenderer.invoke("printer:printReceipt", data),

  printThermal: (content: string) =>
    ipcRenderer.invoke("printer:thermal", content),

  // ==================== REALTIME ====================
  onNewLog: (callback: (log: any) => void) => {
    const handler = (_event: any, log: any) => callback(log);
    ipcRenderer.on("realtime:new-log", handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener("realtime:new-log", handler);
  },

  onIngredientUpdate: (callback: (ingredient: any) => void) => {
    const handler = (_event: any, ingredient: any) => callback(ingredient);
    ipcRenderer.on("realtime:ingredient-update", handler);
    return () =>
      ipcRenderer.removeListener("realtime:ingredient-update", handler);
  },
} as ElectronAPI);

// App version info
contextBridge.exposeInMainWorld("snapko", {
  version: "1.0.0",
  platform: "desktop",
});

// Declare global types for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    snapko: {
      version: string;
      platform: string;
    };
  }
}
