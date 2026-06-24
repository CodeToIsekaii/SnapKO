/**
 * SnapKO Desktop - Main Process
 *
 * Per .antigravityrules:
 * - nodeIntegration: false
 * - contextIsolation: true (default in modern Electron)
 * - IPC Pattern: ipcMain.handle for 2-way communication
 * - Environment variables via env.main.ts with Zod validation
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Store from "electron-store";
import { Env } from "../env";
import {
  initDatabase,
  closeDatabase,
  clearLocalData,
  registerDatabaseIPC,
  setDatabaseSupabaseClient,
  setDatabaseBusinessId,
} from "./database";
import { registerPrinterIPC } from "./printer";
import { pullAll } from "./sync";
import { startRealtimeListener, stopRealtimeListener } from "./realtime";
import { registerExportIPC } from "./export";
import { registerStaffIPC } from "./staff";
import { processQueue } from "./syncWorker";
import {
  loginMobileExchange,
  logoutBackend,
  apiFetch,
  ApiFetchError,
  getStoredRefreshToken,
  clearTokens,
} from "./apiClient";

// Environment variables (validated via Zod in env.ts)
const SUPABASE_URL = Env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = Env.VITE_SUPABASE_ANON_KEY;

// Auth client for login/logout (separate from sync client)
const authClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ==================== SESSION PERSISTENCE ====================
// Use electron-store to persist session across app restarts
interface SessionData {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    business_id?: string;
  };
}

const sessionStore = new Store<{ session: SessionData | null }>({
  name: "snapko-session",
  encryptionKey: "snapko-desktop-session-v1", // Basic encryption for session data
});

// Save session to disk
function saveSession(session: SessionData | null) {
  sessionStore.set("session", session);
  console.log(
    "[Session] Saved to disk:",
    session ? session.user.email : "null"
  );
}

// Load session from disk
function loadSession(): SessionData | null {
  const session = sessionStore.get("session");
  console.log(
    "[Session] Loaded from disk:",
    session ? session.user.email : "null"
  );
  return session || null;
}

// Clear session from disk
function clearSession() {
  sessionStore.delete("session");
  console.log("[Session] Cleared from disk");
}

// Store current session (in memory)
let currentSession: any = null;
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    autoHideMenuBar: true, // Hide menu bar for cleaner look
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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

        if (data.session?.access_token) {
          // Exchange Supabase token for backend JWTs
          await loginMobileExchange(data.session.access_token);

          // Wire Supabase client for database.ts queries (historical logs, staff list)
          setDatabaseSupabaseClient(authClient);

          // Fetch profile from backend API
          let businessId: string | null = null;
          try {
            const backendProfile = await apiFetch<{
              id: string;
              businessId: string | null;
            }>("/profiles/me");
            businessId = backendProfile?.businessId || null;
          } catch (e) {
            console.warn("[Auth] Backend profile fetch failed:", e);
          }

          if (businessId) {
            setDatabaseBusinessId(businessId);
          }

          // Persist Supabase session to disk (still needed for realtime + restore)
          if (data.session && data.user) {
            saveSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token || "",
              user: {
                id: data.user.id,
                email: data.user.email || "",
                business_id: businessId || undefined,
              },
            });
          }

          // Start Realtime listener (Supabase realtime is kept intentionally)
          startRealtimeListener(
            data.session.access_token,
            businessId || data.user?.id || "",
            mainWindow
          );
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
    // Stop Realtime listener before logout
    stopRealtimeListener();

    // Clear local SQLite data to prevent stale data for next user
    clearLocalData();

    // Revoke backend refresh token, then sign out of Supabase
    try {
      await logoutBackend();
    } catch (err) {
      console.warn("[Auth] Backend logout failed:", err);
    }

    if (authClient) {
      await authClient.auth.signOut();
    }
    currentSession = null;
    clearSession(); // Clear persisted session from disk
    console.log("[Auth] Logged out");
    return { success: true };
  });

  // Register — Supabase signUp + backend token exchange
  ipcMain.handle(
    "auth:register",
    async (
      _event,
      email: string,
      password: string,
      fullName: string,
      _businessName?: string
    ) => {
      if (!authClient) {
        return { success: false, error: "Supabase not configured" };
      }

      try {
        const { data, error } = await authClient.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });

        if (error) return { success: false, error: error.message };

        // If email verification required, no session yet
        if (!data.session?.access_token) {
          return {
            success: true,
            needsVerification: true,
            session: null,
          };
        }

        currentSession = data.session;

        // Exchange Supabase token for backend JWTs and auto-create profile
        await loginMobileExchange(data.session.access_token, { fullName });

        // Wire Supabase client for database.ts queries
        setDatabaseSupabaseClient(authClient);

        let businessId: string | null = null;
        try {
          const backendProfile = await apiFetch<{
            id: string;
            businessId: string | null;
          }>("/profiles/me");
          businessId = backendProfile?.businessId || null;
        } catch (e) {
          console.warn("[Auth] Backend profile fetch failed:", e);
        }

        if (businessId) setDatabaseBusinessId(businessId);

        if (data.user) {
          saveSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token || "",
            user: {
              id: data.user.id,
              email: data.user.email || "",
              business_id: businessId || undefined,
            },
          });
        }

        startRealtimeListener(
          data.session.access_token,
          businessId || data.user?.id || "",
          mainWindow
        );

        console.log("[Auth] Register successful:", email);
        return {
          success: true,
          session: {
            access_token: data.session.access_token,
            user: data.user,
          },
        };
      } catch (err: any) {
        console.error("[Auth] Register error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Set auth token — kept as a no-op for renderer TOKEN_REFRESHED handler.
  // Backend refresh is handled automatically by apiFetch on 401.
  ipcMain.handle("auth:set-token", (_event, _token: string | null) => {
    return { success: true };
  });

  // Get current session
  ipcMain.handle("auth:get-session", () => {
    return { session: currentSession };
  });

  // Google OAuth via popup window
  ipcMain.handle("auth:google-login", async () => {
    if (!authClient) {
      return { success: false, error: "Supabase not configured" };
    }

    return new Promise(async (resolve) => {
      // Get OAuth URL from Supabase
      const { data, error: oauthError } = await authClient.auth.signInWithOAuth(
        {
          provider: "google",
          options: {
            skipBrowserRedirect: true,
            redirectTo: `${SUPABASE_URL}/auth/v1/callback`,
          },
        }
      );

      if (oauthError || !data?.url) {
        resolve({
          success: false,
          error: oauthError?.message || "Could not generate OAuth URL",
        });
        return;
      }

      // Create popup window
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        modal: true,
        parent: mainWindow || undefined,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(data.url);
      authWindow.setMenuBarVisibility(false);

      // Listen for redirect with tokens
      authWindow.webContents.on("will-redirect", async (_event, url) => {
        // Don't log full URL as it may contain tokens (security)
        const urlPath = url.split("?")[0].split("#")[0];
        console.log("[Auth] OAuth redirect to:", urlPath);

        // Check if this is the callback with tokens
        if (url.includes("access_token=") || url.includes("#access_token")) {
          try {
            // Parse tokens from URL
            const urlObj = new URL(url.replace("#", "?"));
            const accessToken = urlObj.searchParams.get("access_token");
            const refreshToken = urlObj.searchParams.get("refresh_token");

            if (accessToken) {
              // Set session in Supabase client
              const { data: sessionData, error } =
                await authClient.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || "",
                });

              console.log("[Auth Debug] setSession result:", {
                hasSession: !!sessionData?.session,
                hasUser: !!sessionData?.session?.user,
                userId: sessionData?.session?.user?.id,
                email: sessionData?.session?.user?.email,
                error: error?.message,
              });

              if (error) {
                authWindow.close();
                resolve({ success: false, error: error.message });
                return;
              }

              currentSession = sessionData.session;

              // Exchange Supabase token for backend JWTs
              try {
                await loginMobileExchange(accessToken);
              } catch (e) {
                console.error("[Auth] login-mobile exchange failed:", e);
                authWindow.close();
                resolve({
                  success: false,
                  error: "Backend login exchange failed",
                });
                return;
              }

              // Wire Supabase client for database.ts historical queries
              setDatabaseSupabaseClient(authClient);

              // Fetch profile from backend
              let businessId: string | null = null;
              try {
                const backendProfile = await apiFetch<{
                  id: string;
                  businessId: string | null;
                }>("/profiles/me");
                businessId = backendProfile?.businessId || null;
              } catch (e) {
                console.warn("[Auth] Backend profile fetch failed:", e);
              }

              if (businessId) setDatabaseBusinessId(businessId);

              // Persist session to disk for auto-login on restart
              if (sessionData.session && sessionData.session.user) {
                saveSession({
                  access_token: sessionData.session.access_token,
                  refresh_token: sessionData.session.refresh_token || "",
                  user: {
                    id: sessionData.session.user.id,
                    email: sessionData.session.user.email || "",
                    business_id: businessId || undefined,
                  },
                });
              }

              // Start Realtime listener
              if (sessionData.session?.user) {
                startRealtimeListener(
                  accessToken,
                  businessId || sessionData.session.user.id,
                  mainWindow
                );
              }

              console.log("[Auth] Google login successful");

              // Prepare response with user data
              const responseData = {
                success: true,
                session: {
                  access_token: accessToken,
                  user: sessionData.session?.user || null,
                },
              };
              console.log("[Auth Debug] Sending to renderer:", {
                success: responseData.success,
                hasUser: !!responseData.session.user,
                userId: responseData.session.user?.id,
              });

              authWindow.close();
              resolve(responseData);
            }
          } catch (err: any) {
            console.error("[Auth] Google OAuth error:", err);
            authWindow.close();
            resolve({ success: false, error: err.message });
          }
        }
      });

      // Handle window close without completing auth
      authWindow.on("closed", () => {
        resolve({ success: false, error: "Đăng nhập bị hủy" });
      });
    });
  });

  // ==================== PROFILE/BUSINESS HANDLERS ====================

  // Get user profile from backend (camelCase) and map to snake_case for renderer
  ipcMain.handle("auth:get-profile", async () => {
    try {
      const backendProfile = await apiFetch<any>("/profiles/me");

      if (!backendProfile) {
        return { profile: null, error: "No profile returned" };
      }

      const canUseBranches =
        backendProfile.business?.effectiveInventoryModel === "CHAIN" &&
        backendProfile.business?.effectiveTier === "CHAIN";
      const accessibleBranches =
        backendProfile.businessId &&
        canUseBranches &&
        ["OWNER", "BRANCH_MANAGER"].includes(backendProfile.role)
          ? await apiFetch<any[]>("/branches").catch(() => [])
          : [];

      const flattenedProfile = {
        id: backendProfile.id,
        business_id: backendProfile.businessId ?? null,
        role: backendProfile.role,
        status: backendProfile.status,
        full_name: backendProfile.fullName ?? null,
        phone_number: backendProfile.phoneNumber ?? null,
        inventory_model:
          backendProfile.business?.effectiveInventoryModel ||
          backendProfile.business?.inventoryModel ||
          backendProfile.inventoryModel ||
          "SIMPLE",
        stored_inventory_model:
          backendProfile.business?.inventoryModel ||
          backendProfile.inventoryModel ||
          "SIMPLE",
        business_name: backendProfile.business?.name ?? null,
        tier: backendProfile.business?.tier || "FREE",
        effective_tier:
          backendProfile.business?.effectiveTier ||
          backendProfile.business?.tier ||
          "FREE",
        subscription_status: backendProfile.business?.subscriptionStatus || null,
        days_remaining: backendProfile.business?.daysRemaining ?? 0,
        chain_state: backendProfile.business?.chainState || null,
        operational_state:
          backendProfile.business?.operationalState || "ACTIVE",
        read_only: backendProfile.business?.readOnly === true,
        branches: accessibleBranches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code ?? null,
          type: branch.type,
        })),
        entitlements: backendProfile.business?.entitlements || null,
        subscription_expires_at:
          backendProfile.business?.subscriptionExpiresAt || null,
        business_created_at: backendProfile.business?.createdAt || null,
      };

      console.log("[Auth] Profile fetched:", flattenedProfile);

      if (flattenedProfile.business_id) {
        setDatabaseBusinessId(flattenedProfile.business_id);
      }

      return { profile: flattenedProfile };
    } catch (err: any) {
      console.error("[Auth] Get profile error:", err);
      return { profile: null, error: err.message };
    }
  });

  // Create business via backend; re-exchange tokens so new JWT embeds businessId
  ipcMain.handle(
    "auth:create-business",
    async (_event, { name }: { name: string; userId: string }) => {
      try {
        console.log("[Auth] Creating business:", name);

        const result = await apiFetch<{
          business?: { id: string };
          id?: string;
        }>("/businesses", {
          method: "POST",
          body: JSON.stringify({ name }),
        });

        const businessId = result?.business?.id || result?.id;
        if (!businessId) {
          return { success: false, error: "No business id returned" };
        }

        // Re-exchange Supabase token so backend JWT now carries the new businessId
        if (currentSession?.access_token) {
          try {
            await loginMobileExchange(currentSession.access_token);
          } catch (e) {
            console.warn("[Auth] Re-exchange after create-business failed:", e);
          }
        }

        setDatabaseBusinessId(businessId);
        if (currentSession) currentSession.business_id = businessId;

        // Refresh persisted session with new business_id
        if (currentSession?.user) {
          saveSession({
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token || "",
            user: {
              id: currentSession.user.id,
              email: currentSession.user.email || "",
              business_id: businessId,
            },
          });
        }

        console.log("[Auth] Business created:", businessId);
        return { success: true, businessId };
      } catch (err: any) {
        console.error("[Auth] Create business error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Update profile via backend (camelCase payload)
  ipcMain.handle(
    "auth:update-profile",
    async (
      _event,
      data: {
        inventory_model?: string;
        full_name?: string;
        phone_number?: string | null;
      }
    ) => {
      try {
        console.log("[Auth] Updating profile:", data);

        // Profile only — inventory model belongs to business; route separately
        const profilePayload: Record<string, unknown> = {};
        if (data.full_name !== undefined) profilePayload.fullName = data.full_name;
        if (data.phone_number !== undefined)
          profilePayload.phoneNumber = data.phone_number;

        if (Object.keys(profilePayload).length > 0) {
          await apiFetch("/profiles/me", {
            method: "PATCH",
            body: JSON.stringify(profilePayload),
          });
        }

        // inventory_model is a business-level setting (OWNER only)
        if (data.inventory_model) {
          await apiFetch("/businesses/me", {
            method: "PATCH",
            body: JSON.stringify({ inventoryModel: data.inventory_model }),
          });
        }

        console.log("[Auth] Profile updated successfully");
        return { success: true };
      } catch (err: any) {
        console.error("[Auth] Update profile error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Update business via backend
  ipcMain.handle(
    "auth:update-business",
    async (_event, data: { inventory_model?: string; name?: string; shareRecipesWithStaff?: boolean }) => {
      try {
        console.log("[Auth] Updating business:", data);

        const payload: Record<string, unknown> = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.inventory_model !== undefined)
          payload.inventoryModel = data.inventory_model;
        if (data.shareRecipesWithStaff !== undefined)
          payload.shareRecipesWithStaff = data.shareRecipesWithStaff;

        if (Object.keys(payload).length === 0) {
          return { success: true };
        }

        await apiFetch("/businesses/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        console.log("[Auth] Business updated successfully");
        return { success: true };
      } catch (err: any) {
        console.error("[Auth] Update business exception:", err);
        return { success: false, error: err.message };
      }
    }
  );

  console.log("[Auth] IPC handlers registered");
}

// ==================== SYNC IPC HANDLERS ====================

function registerSyncIPC() {
  // Pull data from server to local
  ipcMain.handle("sync:pull", async (_event, opts?: { force?: boolean }) => {
    if (!getStoredRefreshToken()) {
      return { success: false, synced: 0, error: "Not authenticated" };
    }

    // CRITICAL: Flush queue FIRST to push DELETE actions before pulling
    console.log("[Sync] Flushing queue before pull...");
    await processQueue();
    console.log("[Sync] Queue flushed, starting pull...");

    const result = await pullAll({ force: opts?.force });
    return result;
  });

  console.log("[Sync] IPC handlers registered");
}

function registerShellIPC() {
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported URL protocol");
      }

      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (err: any) {
      console.error("[Shell] openExternal failed:", err);
      return {
        success: false,
        error: err?.message || "Cannot open external URL",
      };
    }
  });

  console.log("[Shell] IPC handlers registered");
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(async () => {
  // Initialize local database
  initDatabase();
  console.log("[SnapKO Desktop] Database initialized");

  // Register IPC handlers
  registerDatabaseIPC();
  registerPrinterIPC();
  registerAuthIPC();
  registerSyncIPC();
  registerShellIPC();
  registerExportIPC();
  registerStaffIPC();

  // AI parse (Invoice/Sales/Stock/Recipe) via BE-SnapKO hybrid pipeline
  ipcMain.handle(
    "ai:parse",
    async (
      _event,
      body: {
        type: "IMPORT" | "SALES" | "STOCK_CHECK" | "RECIPE";
        image?: string;
        images?: string[];
        areaType?: "warehouse" | "bar" | "SERVICE" | "STORAGE";
        inventoryModel?: "SIMPLE" | "STANDARD" | "CHAIN";
        qualityMode?: "standard" | "high_accuracy";
      }
    ) => {
      try {
        return await apiFetch<any>("/ai/parse", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (err: any) {
        console.error("[AI] parse error:", err);
        if (err instanceof ApiFetchError && err.status === 429) {
          return { success: false, error: "QUOTA_EXCEEDED", quotaExceeded: true };
        }
        return { success: false, error: err.message };
      }
    }
  );

  // ==================== DIALOG (focus-safe confirm) ====================
  ipcMain.handle("dialog:confirm", async (event, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(win!, {
      type: "question",
      buttons: ["Hủy", "Xác nhận"],
      defaultId: 0,
      cancelId: 0,
      message,
      detail,
    });
    return result.response === 1;
  });

  // ==================== STORAGE AREAS ====================
  ipcMain.handle("storage-areas:list", async () => {
    try {
      return await apiFetch<any[]>("/storage-areas");
    } catch (err: any) {
      console.error("[StorageAreas] list error:", err);
      return [];
    }
  });

  ipcMain.handle("storage-areas:create", async (_event, data: { name: string; type?: string }) => {
    try {
      return await apiFetch<any>("/storage-areas", {
        method: "POST",
        body: JSON.stringify({ name: data.name, type: data.type ?? "STORAGE" }),
      });
    } catch (err: any) {
      throw new Error(err.message ?? "Không thể tạo khu vực kho");
    }
  });

  ipcMain.handle("storage-areas:update", async (_event, id: string, data: { name?: string; isActive?: boolean }) => {
    try {
      return await apiFetch<any>(`/storage-areas/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    } catch (err: any) {
      throw new Error(err.message ?? "Không thể cập nhật khu vực kho");
    }
  });

  ipcMain.handle("storage-areas:delete", async (_event, id: string) => {
    try {
      await apiFetch<any>(`/storage-areas/${id}`, { method: "DELETE" });
      return { success: true };
    } catch (err: any) {
      throw new Error(err.message ?? "Không thể xóa khu vực kho");
    }
  });

  console.log("[SnapKO Desktop] All IPC handlers registered");

  // ==================== AUTH STATE LISTENER (MAIN PROCESS) ====================
  // Ensure Main Process always has fresh token even if Renderer is closed
  if (authClient) {
    authClient.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth-Main] Auth state changed: ${event}`);

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session) {
          currentSession = session;

          // Keep Supabase client wired for database.ts historical queries
          setDatabaseSupabaseClient(authClient);

          // Persist to disk (preserve existing business_id if already known)
          const existing = loadSession();
          saveSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token || "",
            user: {
              id: session.user.id,
              email: session.user.email || "",
              business_id: existing?.user.business_id,
            },
          });
        }
      } else if (event === "SIGNED_OUT") {
        currentSession = null;
        clearTokens();
        clearSession();
      }
    });
  }

  // ==================== SYNC WORKER LOOP ====================
  // Start background sync worker (offline-first queue)
  // Optimized: Increased interval from 5s to 15s to reduce CPU/network load
  setInterval(() => {
    processQueue().catch((err) =>
      console.error("[SyncWorker] Loop error:", err)
    );
  }, 15000);

  // ==================== RESTORE SESSION ====================
  // Try to restore session from disk on startup
  const savedSession = loadSession();
  if (savedSession && authClient) {
    console.log(
      "[Session] Attempting to restore session for:",
      savedSession.user.email
    );

    try {
      // Validate and refresh the session with Supabase
      const { data, error } = await authClient.auth.setSession({
        access_token: savedSession.access_token,
        refresh_token: savedSession.refresh_token,
      });

      if (error) {
        console.log(
          "[Session] Refresh failed, clearing stored session:",
          error.message
        );
        clearSession();
      } else if (data.session) {
        console.log(
          "[Session] Session restored successfully:",
          data.session.user?.email
        );
        currentSession = data.session;

        if (savedSession.user?.business_id) {
          console.log(
            "[Session] Using cached business_id:",
            savedSession.user.business_id
          );
          setDatabaseBusinessId(savedSession.user.business_id);
          currentSession.business_id = savedSession.user.business_id;
        }

        // Update saved session with new tokens
        if (data.session.access_token !== savedSession.access_token) {
          saveSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token || "",
            user: {
              id: data.session.user?.id || "",
              email: data.session.user?.email || "",
              business_id: savedSession.user.business_id, // Keep existing business_id
            },
          });
        }

        // Wire Supabase client for database.ts historical queries
        setDatabaseSupabaseClient(authClient);

        // Ensure backend tokens exist — if not (first restore after migration),
        // re-exchange the Supabase session for backend JWTs.
        if (!getStoredRefreshToken()) {
          try {
            await loginMobileExchange(data.session.access_token);
          } catch (e) {
            console.warn(
              "[Session] Re-exchange for backend tokens failed:",
              e
            );
          }
        }

        // Fetch profile from backend (auto-refreshes access token if stale)
        if (!currentSession.business_id) {
          try {
            const backendProfile = await apiFetch<{
              id: string;
              businessId: string | null;
            }>("/profiles/me");
            if (backendProfile?.businessId) {
              setDatabaseBusinessId(backendProfile.businessId);
              currentSession.business_id = backendProfile.businessId;

              saveSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token || "",
                user: {
                  id: data.session.user?.id || "",
                  email: data.session.user?.email || "",
                  business_id: backendProfile.businessId,
                },
              });
            }
          } catch (e) {
            console.warn("[Session] Backend profile fetch failed:", e);
          }
        }
      }
    } catch (err) {
      console.error("[Session] Restore error:", err);
      clearSession();
    }
  }

  createWindow();

  // Start realtime after window is created (if session is valid)
  if (currentSession && mainWindow) {
    startRealtimeListener(
      currentSession.access_token,
      currentSession.business_id || currentSession.user?.id || "",
      mainWindow
    );
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopRealtimeListener();
  closeDatabase();
  if (process.platform !== "darwin") app.quit();
});
