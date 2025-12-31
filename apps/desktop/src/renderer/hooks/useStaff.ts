// src/hooks/useStaff.ts - Staff Management Logic (SOLID: Single Responsibility)
// Handles: Load staff, generate invite codes, approve/reject/deactivate
// UI components MUST use this hook, NOT call electronAPI directly

import { useState, useCallback } from "react";
import { StaffProfile } from "../types";

interface StaffState {
  profiles: StaffProfile[];
  loading: boolean;
  generating: boolean;
}

interface InviteCodeResult {
  code: string;
  expiresAt: string;
  error?: string;
}

export function useStaff() {
  const [state, setState] = useState<StaffState>({
    profiles: [],
    loading: true,
    generating: false,
  });

  // Derived data
  const pendingStaff = state.profiles.filter((s) => s.status === "PENDING");
  const activeStaff = state.profiles.filter((s) => s.status === "ACTIVE");

  // Load staff profiles
  const loadStaff = useCallback(async () => {
    try {
      const profiles = await window.electronAPI.getStaffProfiles?.();
      setState((s) => ({
        ...s,
        profiles: profiles || [],
        loading: false,
      }));
    } catch (err) {
      console.error("[useStaff] Load error:", err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Generate invite code (with offline check per .antigravityrules)
  const generateInviteCode =
    useCallback(async (): Promise<InviteCodeResult | null> => {
      // Check internet connection
      if (!navigator.onLine) {
        return {
          code: "",
          expiresAt: "",
          error: "Vui lòng kết nối Internet để tạo mã mời online!",
        };
      }

      setState((s) => ({ ...s, generating: true }));

      try {
        const result = await window.electronAPI.generateInviteCode?.();
        return result || null;
      } catch (err: any) {
        console.error("[useStaff] Generate code error:", err);
        return {
          code: "",
          expiresAt: "",
          error: err.message || "Lỗi kết nối Server",
        };
      } finally {
        setState((s) => ({ ...s, generating: false }));
      }
    }, []);

  // Staff action (approve/reject/deactivate) with OPTIMISTIC UI UPDATE
  const staffAction = useCallback(
    async (
      profileId: string,
      action: "approve" | "reject" | "deactivate"
    ): Promise<boolean> => {
      // 1. OPTIMISTIC UPDATE: Update UI immediately (don't wait for server)
      const previousProfiles = [...state.profiles];
      const newStatus =
        action === "approve"
          ? "ACTIVE"
          : action === "reject"
          ? "REJECTED"
          : "INACTIVE";

      setState((s) => ({
        ...s,
        profiles: s.profiles.map((p) =>
          p.id === profileId ? { ...p, status: newStatus } : p
        ),
      }));

      try {
        // 2. Call server in background
        const result = await window.electronAPI.staffAction?.(
          profileId,
          action
        );

        if (!result?.success) {
          // 3. REVERT on error
          console.error("[useStaff] Action failed, reverting...");
          setState((s) => ({ ...s, profiles: previousProfiles }));
          return false;
        }

        // Success - optionally refetch to ensure sync
        await loadStaff();
        return true;
      } catch (err) {
        // 3. REVERT on error
        console.error("[useStaff] Action error, reverting:", err);
        setState((s) => ({ ...s, profiles: previousProfiles }));
        return false;
      }
    },
    [state.profiles, loadStaff]
  );

  return {
    // Data
    profiles: state.profiles,
    pendingStaff,
    activeStaff,
    loading: state.loading,
    generating: state.generating,

    // Actions
    loadStaff,
    generateInviteCode,
    staffAction,
  };
}
