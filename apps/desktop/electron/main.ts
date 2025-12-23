/**
 * SnapKO Desktop - Main Process
 *
 * Per .antigravityrules:
 * - nodeIntegration: false
 * - contextIsolation: true (default in modern Electron)
 * - IPC Pattern: ipcMain.handle for 2-way communication
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { initDatabase, closeDatabase, registerDatabaseIPC } from "./database";
import { registerPrinterIPC } from "./printer";
import { setAuthToken, pullAll, isSyncReady } from "./sync";

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

// Auth client for login/logout (separate from sync client)
const authClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Store current session
let currentSession: any = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ==================== AUTH IPC HANDLERS ====================

function registerAuthIPC() {
  // Login with email/password
  ipcMain.handle(
    "auth:login",
    async (_event, email: string, password: string) => {
      if (!authClient) {
        return { success: false, error: "Supabase not configured" };
      }

      try {
        const { data, error } = await authClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        currentSession = data.session;

        // Set token for sync client
        if (data.session?.access_token) {
          setAuthToken(data.session.access_token);
        }

        console.log("[Auth] Login successful:", email);
        return {
          success: true,
          session: {
            access_token: data.session?.access_token,
            user: data.user,
          },
        };
      } catch (err: any) {
        console.error("[Auth] Login error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Logout
  ipcMain.handle("auth:logout", async () => {
    if (authClient) {
      await authClient.auth.signOut();
    }
    currentSession = null;
    setAuthToken(null);
    console.log("[Auth] Logged out");
    return { success: true };
  });

  // Set auth token (called from renderer on token refresh)
  ipcMain.handle("auth:set-token", (_event, token: string | null) => {
    setAuthToken(token);
    return { success: true };
  });

  // Get current session
  ipcMain.handle("auth:get-session", () => {
    return { session: currentSession };
  });

  console.log("[Auth] IPC handlers registered");
}

// ==================== SYNC IPC HANDLERS ====================

function registerSyncIPC() {
  // Pull data from server to local
  ipcMain.handle("sync:pull", async () => {
    if (!isSyncReady()) {
      return { success: false, synced: 0, error: "Not authenticated" };
    }

    const result = await pullAll();
    return result;
  });

  console.log("[Sync] IPC handlers registered");
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
  // Initialize local database
  initDatabase();
  console.log("[SnapKO Desktop] Database initialized");

  // Register IPC handlers
  registerDatabaseIPC();
  registerPrinterIPC();
  registerAuthIPC();
  registerSyncIPC();
  console.log("[SnapKO Desktop] All IPC handlers registered");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") app.quit();
});
