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
  googleLogin: () => Promise<{
    success: boolean;
    session?: any;
    error?: string;
  }>;
  logout: () => Promise<{ success: boolean }>;
  setAuthToken: (token: string | null) => Promise<{ success: boolean }>;
  getSession: () => Promise<{ session: any | null }>;

  // Profile & Business (Cloud-first for Edge Function compatibility)
  getProfile: () => Promise<{ profile: any | null; error?: string }>;
  updateProfile: (data: {
    inventory_model?: string;
    full_name?: string;
    phone_number?: string | null;
  }) => Promise<{ success: boolean; error?: string }>;

  updateBusiness: (data: {
    inventory_model?: string;
    name?: string;
  }) => Promise<{ success: boolean; error?: string }>;

  createBusiness: (data: {
    name: string;
    userId: string;
  }) => Promise<{ success: boolean; business?: any; error?: string }>;

  // Sync
  syncFromServer: () => Promise<{
    success: boolean;
    synced: number;
    error?: string;
  }>;

  // Database - Ingredients
  getIngredients: (options?: { includeArchived?: boolean }) => Promise<any[]>;
  upsertIngredient: (ingredient: any) => Promise<{ success: boolean }>;
  getPendingLogs: () => Promise<any[]>;
  addPendingLog: (log: any) => Promise<{ success: boolean }>;
  markSynced: (ids: string[]) => Promise<{ success: boolean; count: number }>;
  getInventoryLogs: (
    options?: number | { limit?: number; days?: number }
  ) => Promise<any[]>;
  fixMissingBusinessId: (
    businessId: string
  ) => Promise<{ success: boolean; error?: string }>;
  deleteIngredient: (ingredientId: string) => Promise<{ success: boolean }>;
  restoreIngredient: (ingredientId: string) => Promise<{ success: boolean }>;

  // Log Retention
  getRetentionDays: () => Promise<number>;
  setRetentionDays: (days: number) => Promise<{ success: boolean }>;
  pruneLogs: (
    days: number
  ) => Promise<{ success: boolean; count?: number; error?: string }>;

  // Export Full Log History
  exportInventoryLogsHistory: (options?: {
    startDate?: string;
    endDate?: string;
  }) => Promise<{
    success: boolean;
    data?: any[];
    count?: number;
    error?: string;
  }>;

  // Database - Recipes
  getRecipes: (options?: { includeArchived?: boolean }) => Promise<any[]>;
  upsertRecipe: (recipe: any) => Promise<{ success: boolean }>;
  deleteRecipe: (recipeId: string) => Promise<{ success: boolean }>;
  restoreRecipe: (recipeId: string) => Promise<{ success: boolean }>;

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

  // Signal Pattern Sync (generic event listeners)
  on: (channel: string, callback: (data?: any) => void) => void;
  off: (channel: string, callback: (data?: any) => void) => void;
}

// Expose IPC API to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // ==================== AUTH ====================
  login: (email: string, password: string) =>
    ipcRenderer.invoke("auth:login", email, password),

  googleLogin: () => ipcRenderer.invoke("auth:google-login"),

  logout: () => ipcRenderer.invoke("auth:logout"),

  setAuthToken: (token: string | null) =>
    ipcRenderer.invoke("auth:set-token", token),

  getSession: () => ipcRenderer.invoke("auth:get-session"),

  // ==================== PROFILE & BUSINESS ====================
  getProfile: () => ipcRenderer.invoke("auth:get-profile"),

  updateProfile: (data: { inventory_model?: string; full_name?: string }) =>
    ipcRenderer.invoke("auth:update-profile", data),

  updateBusiness: (data: { inventory_model?: string; name?: string }) =>
    ipcRenderer.invoke("auth:update-business", data),

  createBusiness: (data: { name: string; userId: string }) =>
    ipcRenderer.invoke("auth:create-business", data),

  // ==================== SYNC ====================
  syncFromServer: () => ipcRenderer.invoke("sync:pull"),

  // ==================== DATABASE ====================
  getIngredients: (options?: { includeArchived?: boolean }) =>
    ipcRenderer.invoke("db:getIngredients", options),

  upsertIngredient: (ingredient: any) =>
    ipcRenderer.invoke("db:upsertIngredient", ingredient),

  getPendingLogs: () => ipcRenderer.invoke("db:getPendingLogs"),

  addPendingLog: (log: any) => ipcRenderer.invoke("db:addPendingLog", log),

  markSynced: (ids: string[]) => ipcRenderer.invoke("db:markSynced", ids),

  getInventoryLogs: (options?: number | { limit?: number; days?: number }) =>
    ipcRenderer.invoke("db:getInventoryLogs", options),
  fixMissingBusinessId: (businessId: string) =>
    ipcRenderer.invoke("db:fix-missing-business-id", businessId),
  deleteIngredient: (ingredientId: string) =>
    ipcRenderer.invoke("db:deleteIngredient", ingredientId),
  restoreIngredient: (ingredientId: string) =>
    ipcRenderer.invoke("db:restoreIngredient", ingredientId),

  // Log Retention
  getRetentionDays: () => ipcRenderer.invoke("db:getRetentionDays"),
  setRetentionDays: (days: number) =>
    ipcRenderer.invoke("db:setRetentionDays", days),
  pruneLogs: (days: number) => ipcRenderer.invoke("db:pruneLogs", days),

  // Export Full Log History
  exportInventoryLogsHistory: (options?: {
    startDate?: string;
    endDate?: string;
  }) => ipcRenderer.invoke("export:inventoryLogsHistory", options),

  // ==================== DATABASE: RECIPES ====================
  getRecipes: (options?: { includeArchived?: boolean }) =>
    ipcRenderer.invoke("db:getRecipes", options),

  upsertRecipe: (recipe: any) => ipcRenderer.invoke("db:upsertRecipe", recipe),

  deleteRecipe: (recipeId: string) =>
    ipcRenderer.invoke("db:deleteRecipe", recipeId),
  restoreRecipe: (recipeId: string) =>
    ipcRenderer.invoke("db:restoreRecipe", recipeId),

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

  // ==================== SIGNAL PATTERN SYNC ====================
  on: (channel: string, callback: (data?: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, handler);
  },

  off: (channel: string, callback: (data?: any) => void) => {
    ipcRenderer.removeAllListeners(channel);
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
