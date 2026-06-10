/**
 * SnapKO Desktop - Staff Management IPC Handlers
 *
 * Migrated to BE-SnapKO:
 * - generateInviteCode → POST /businesses/invite-codes
 * - staff:action       → PATCH /profiles/:id/status
 */

import { ipcMain } from "electron";
import { getDatabase } from "./database";
import { apiFetch } from "./apiClient";

// Kept for backward compat so callers can still call setStaffSupabaseClient()
// without breaking; it's now a no-op because all server calls go through apiFetch.
export function setStaffSupabaseClient(_client: any) {
  // no-op — retained for API compatibility during migration
}

export function registerStaffIPC(): void {
  // Generate invite code — backend generates the code and persists to DB
  ipcMain.handle("staff:generateInviteCode", async () => {
    try {
      const data = await apiFetch<{ code: string; expiresAt: string }>(
        "/businesses/invite-codes",
        {
          method: "POST",
          body: JSON.stringify({ expiresInHours: 48 }),
        }
      );

      if (!data?.code) {
        return { code: "", expiresAt: "", error: "No code returned" };
      }

      console.log(`[Staff] Generated invite code: ${data.code}`);
      return { code: data.code, expiresAt: data.expiresAt };
    } catch (err: any) {
      console.error("[Staff] Generate code error:", err);
      return { code: "", expiresAt: "", error: err.message };
    }
  });

  // Staff actions: approve, reject, deactivate
  ipcMain.handle(
    "staff:action",
    async (
      _event,
      profileId: string,
      action: "approve" | "reject" | "deactivate"
    ) => {
      try {
        const database = getDatabase();

        // Backend currently supports ACTIVE / REJECTED (see UpdateStaffStatusDto).
        // "deactivate" locally maps to REJECTED (backend will also disconnect businessId).
        let backendStatus: "ACTIVE" | "REJECTED";
        let localStatus: string;
        switch (action) {
          case "approve":
            backendStatus = "ACTIVE";
            localStatus = "ACTIVE";
            break;
          case "reject":
            backendStatus = "REJECTED";
            localStatus = "REJECTED";
            break;
          case "deactivate":
            backendStatus = "REJECTED";
            localStatus = "INACTIVE";
            break;
          default:
            return { success: false, error: "Invalid action" };
        }

        await apiFetch(`/profiles/${profileId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: backendStatus }),
        });

        // Update local SQLite cache
        const stmt = database.prepare(
          "UPDATE local_profiles SET status = ? WHERE id = ?"
        );
        stmt.run(localStatus, profileId);

        console.log(`[Staff] ${action} profile synced: ${profileId}`);
        return { success: true };
      } catch (err: any) {
        console.error("[Staff] Action error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  console.log("[Staff] IPC handlers registered");
}
