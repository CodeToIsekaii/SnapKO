/**
 * SnapKO Desktop - Main Process
 *
 * Per .antigravityrules:
 * - nodeIntegration: false
 * - contextIsolation: true (default in modern Electron)
 * - IPC Pattern: ipcMain.handle for 2-way communication
 * - Environment variables via env.main.ts with Zod validation
 */

import { app, BrowserWindow, ipcMain } from "electron";
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
import { setAuthToken, pullAll, isSyncReady, getSyncClient } from "./sync";
import { startRealtimeListener, stopRealtimeListener } from "./realtime";
import { registerExportIPC } from "./export";
import { registerStaffIPC, setStaffSupabaseClient } from "./staff";
import { processQueue } from "./syncWorker";

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

        // Set token for sync client
        if (data.session?.access_token) {
          setAuthToken(data.session.access_token);

          // Set Supabase client for staff module (CRITICAL FIX)
          const client = getSyncClient();
          if (client) {
            setStaffSupabaseClient(client);
            setDatabaseSupabaseClient(client); // For staff profiles Cloud query
          }

          // Start Realtime listener after login
          // Note: We need to get businessId from profile - for now use user.id as placeholder
          // In production, fetch profile first to get business_id
          /* FIXED: Fetch profile to get business_id and set in database */
          // Fetch profile to get business_id
          const { data: profile } = await authClient
            .from("profiles")
            .select("business_id")
            .eq("id", data.user.id)
            .single();

          if (profile?.business_id) {
            setDatabaseBusinessId(profile.business_id);
          }

          // Persist session to disk (Moved here to include business_id)
          if (data.session && data.user) {
            saveSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token || "",
              user: {
                id: data.user.id,
                email: data.user.email || "",
                business_id: profile?.business_id,
              },
            });
          }

          // Start Realtime with Correct Business ID
          startRealtimeListener(
            data.session.access_token,
            profile?.business_id || data.user?.id || "",
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

    if (authClient) {
      await authClient.auth.signOut();
    }
    currentSession = null;
    clearSession(); // Clear persisted session from disk
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
              setAuthToken(accessToken);

              // Persist session to disk for auto-login on restart
              if (sessionData.session && sessionData.session.user) {
                saveSession({
                  access_token: sessionData.session.access_token,
                  refresh_token: sessionData.session.refresh_token || "",
                  user: {
                    id: sessionData.session.user.id,
                    email: sessionData.session.user.email || "",
                  },
                });
              }

              // Set Supabase client for staff module
              const client = getSyncClient();
              if (client) {
                setStaffSupabaseClient(client);
                setDatabaseSupabaseClient(client); // For staff profiles Cloud query
              }

              /* FIXED: Fetch profile to get business_id */
              if (sessionData.session?.user) {
                authClient
                  .from("profiles")
                  .select("business_id")
                  .eq("id", sessionData.session.user.id)
                  .single()
                  .then(({ data: profile }) => {
                    if (profile?.business_id) {
                      setDatabaseBusinessId(profile.business_id);
                    }
                  });
              }

              // Start Realtime listener
              if (sessionData.session?.user) {
                startRealtimeListener(
                  accessToken,
                  sessionData.session.user.id,
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

  // Get user profile from Cloud
  ipcMain.handle("auth:get-profile", async () => {
    if (!authClient || !currentSession?.user) {
      return { profile: null, error: "Not authenticated" };
    }

    try {
      // Fetch profile with inventory_model and join businesses for subscription data
      const { data: profile, error } = await authClient
        .from("profiles")
        .select(
          `
          id,
          business_id,
          role,
          status,
          full_name,
          phone_number,
          inventory_model,
          businesses (
            name,
            inventory_model,
            tier,
            subscription_expires_at,
            created_at
          )
        `
        )
        .eq("id", currentSession.user.id)
        .single();

      if (error) {
        console.error("[Auth] Get profile error:", error);
        return { profile: null, error: error.message };
      }

      // Flatten business info from joined table
      const flattenedProfile = {
        ...profile,
        business_name: (profile?.businesses as any)?.name || null,
        // PREFER business model (global) over profile model (legacy)
        inventory_model:
          (profile?.businesses as any)?.inventory_model ||
          profile.inventory_model ||
          "STANDARD",
        // Subscription data
        tier: (profile?.businesses as any)?.tier || "FREE",
        subscription_expires_at:
          (profile?.businesses as any)?.subscription_expires_at || null,
        business_created_at: (profile?.businesses as any)?.created_at || null,
      };

      console.log("[Auth] Profile fetched:", flattenedProfile);

      /* FIXED: Ensure database business_id is set when profile is fetched */
      if (flattenedProfile.business_id) {
        setDatabaseBusinessId(flattenedProfile.business_id);
      }

      return { profile: flattenedProfile };
    } catch (err: any) {
      console.error("[Auth] Get profile error:", err);
      return { profile: null, error: err.message };
    }
  });

  // Create business on Cloud via RPC (atomic transaction - per Tech Lead recommendation)
  // Uses SECURITY DEFINER function to atomically: 1) Create Business 2) Update Profile
  ipcMain.handle(
    "auth:create-business",
    async (_event, { name }: { name: string; userId: string }) => {
      if (!authClient) {
        return { success: false, error: "Supabase not configured" };
      }

      try {
        console.log("[Auth] Creating business via RPC:", name);

        // Call the RPC function which handles both operations in a transaction
        const { data, error } = await authClient.rpc(
          "create_business_for_owner",
          { business_name: name }
        );

        if (error) {
          console.error("[Auth] RPC error:", error);
          return { success: false, error: error.message };
        }

        console.log("[Auth] RPC result:", data);

        // RPC returns JSON with success/error
        if (data && data.success) {
          console.log("[Auth] Business created:", data.business_id);
          return { success: true, businessId: data.business_id };
        } else {
          console.error("[Auth] RPC returned error:", data?.error);
          return { success: false, error: data?.error || "Unknown error" };
        }
      } catch (err: any) {
        console.error("[Auth] Create business error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Update profile (for model selection, etc.)
  // CRITICAL: Must use main process client which has auth session
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
      if (!authClient || !currentSession?.user) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        console.log("[Auth] Updating profile:", data);

        // 1. Update profile (UI state / backward compatibility)
        const { error } = await authClient
          .from("profiles")
          .update(data)
          .eq("id", currentSession.user.id);

        if (error) {
          console.error("[Auth] Update profile error:", error);
          return { success: false, error: error.message };
        }

        // 2. If inventory_model changed, sync to BUSINESS table (Global setting)
        if (data.inventory_model) {
          // Get current profile to check role & business_id
          const { data: profile } = await authClient
            .from("profiles")
            .select("business_id, role")
            .eq("id", currentSession.user.id)
            .single();

          if (profile?.role === "OWNER" && profile.business_id) {
            console.log(
              "[Auth] Syncing model to BUSINESS:",
              data.inventory_model
            );
            const { error: busError } = await authClient
              .from("businesses")
              .update({ inventory_model: data.inventory_model })
              .eq("id", profile.business_id);

            if (busError) {
              console.error("[Auth] Failed to sync to business:", busError);
              // Don't fail the whole request, but log it
            }
          }
        }

        console.log("[Auth] Profile updated successfully");
        return { success: true };
      } catch (err: any) {
        console.error("[Auth] Update profile error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Update business (Global Settings) - Explicit Handler
  ipcMain.handle(
    "auth:update-business",
    async (_event, data: { inventory_model?: string; name?: string }) => {
      if (!authClient || !currentSession?.user) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        console.log("[Auth] Updating business explicitly:", data);

        // 1. Get Business ID from Profile
        const { data: profile, error: profileError } = await authClient
          .from("profiles")
          .select("business_id, role")
          .eq("id", currentSession.user.id)
          .single();

        if (profileError || !profile?.business_id) {
          return { success: false, error: "Business not found for user" };
        }

        if (profile.role !== "OWNER") {
          return { success: false, error: "Only OWNER can update business" };
        }

        // 2. Update Business
        const { error } = await authClient
          .from("businesses")
          .update(data)
          .eq("id", profile.business_id);

        if (error) {
          console.error("[Auth] Update business error:", error);
          return { success: false, error: error.message };
        }

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
  ipcMain.handle("sync:pull", async () => {
    if (!isSyncReady()) {
      return { success: false, synced: 0, error: "Not authenticated" };
    }

    // CRITICAL: Flush queue FIRST to push DELETE actions before pulling
    console.log("[Sync] Flushing queue before pull...");
    await processQueue();
    console.log("[Sync] Queue flushed, starting pull...");

    const result = await pullAll();
    return result;
  });

  console.log("[Sync] IPC handlers registered");
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
  registerExportIPC(mainWindow);
  registerStaffIPC();
  console.log("[SnapKO Desktop] All IPC handlers registered");

  // ==================== AUTH STATE LISTENER (MAIN PROCESS) ====================
  // Ensure Main Process always has fresh token even if Renderer is closed
  if (authClient) {
    authClient.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth-Main] Auth state changed: ${event}`);

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session) {
          currentSession = session;

          // CRITICAL: Update Sync Client Token
          setAuthToken(session.access_token);

          // Update Sync Clients for other modules
          const client = getSyncClient();
          if (client) {
            setStaffSupabaseClient(client);
            setDatabaseSupabaseClient(client);
          }

          // Persist to disk
          saveSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token || "",
            user: {
              id: session.user.id,
              email: session.user.email || "",
            },
          });
        }
      } else if (event === "SIGNED_OUT") {
        currentSession = null;
        setAuthToken(null);
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

        // Set token for sync client
        setAuthToken(data.session.access_token);

        // Set Supabase client for staff module
        const client = getSyncClient();
        if (client) {
          setStaffSupabaseClient(client);
          setDatabaseSupabaseClient(client);
        }

        // Fetch profile to get/refresh business_id (Restore Session)
        // This is non-blocking if we have cached ID, but we should await it to be safe for Realtime
        if (!currentSession.business_id) {
          const { data: profile } = await authClient
            .from("profiles")
            .select("business_id")
            .eq("id", data.session.user.id)
            .single();

          if (profile?.business_id) {
            setDatabaseBusinessId(profile.business_id);
            currentSession.business_id = profile.business_id;

            // Update cache with found business_id
            saveSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token || "",
              user: {
                id: data.session.user?.id || "",
                email: data.session.user?.email || "",
                business_id: profile.business_id,
              },
            });
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
