/**
 * SnapKO Desktop - Staff Management IPC Handlers
 * CRITICAL FIX: Sync invite codes and staff actions to Supabase
 */

import { ipcMain } from "electron";
import { getDatabase } from "./database";

// Get Supabase client from sync module
let supabaseClient: any = null;

export function setStaffSupabaseClient(client: any) {
  supabaseClient = client;
}

// Simple 6-char alphanumeric code generator
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Register Staff Management IPC handlers
 */
export function registerStaffIPC(): void {
  // Generate invite code - MUST sync to Supabase
  ipcMain.handle("staff:generateInviteCode", async () => {
    try {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      if (!supabaseClient) {
        console.error("[Staff] No Supabase client - cannot sync invite code");
        return { code: "", expiresAt: "", error: "Not authenticated" };
      }

      // CRITICAL: Call Edge Function to store invite code on server
      const { data, error } = await supabaseClient.functions.invoke(
        "staff-generate-invite",
        {
          body: { code, expiresAt: expiresAt.toISOString() },
        }
      );

      if (error) {
        console.error("[Staff] Edge Function error:", error);
        return { code: "", expiresAt: "", error: error.message };
      }

      console.log(`[Staff] Generated invite code synced to server: ${code}`);

      return {
        code,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err: any) {
      console.error("[Staff] Generate code error:", err);
      return { code: "", expiresAt: "", error: err.message };
    }
  });

  // Staff actions: approve, reject, deactivate - MUST sync to Supabase
  ipcMain.handle(
    "staff:action",
    async (
      _event,
      profileId: string,
      action: "approve" | "reject" | "deactivate"
    ) => {
      try {
        const database = getDatabase();

        let newStatus: string;
        switch (action) {
          case "approve":
            newStatus = "ACTIVE";
            break;
          case "reject":
            newStatus = "REJECTED"; // Proper enum value for rejected applicants
            break;
          case "deactivate":
            newStatus = "INACTIVE";
            break;
          default:
            return { success: false, error: "Invalid action" };
        }

        if (!supabaseClient) {
          console.error("[Staff] No Supabase client - cannot sync action");
          return { success: false, error: "Not authenticated" };
        }

        // CRITICAL: Update on Supabase first
        const { error: updateError } = await supabaseClient
          .from("profiles")
          .update({ status: newStatus })
          .eq("id", profileId);

        if (updateError) {
          console.error("[Staff] Supabase update error:", updateError);
          return { success: false, error: updateError.message };
        }

        // Then update local database
        const stmt = database.prepare(
          "UPDATE local_profiles SET status = ? WHERE id = ?"
        );
        stmt.run(newStatus, profileId);

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
