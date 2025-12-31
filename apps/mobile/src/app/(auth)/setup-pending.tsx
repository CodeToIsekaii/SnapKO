/**
 * Setup Pending Route - Waiting Room for Staff
 * Shown when shop hasn't configured operational_model (Model A/B)
 */

import React, { useCallback } from "react";
import { useRouter } from "expo-router";
import { SetupPendingScreen } from "../../screens";

export default function SetupPendingRoute() {
  const router = useRouter();

  const handleCheckAgain = useCallback(async () => {
    // This will trigger a re-check of auth state
    // The _layout.tsx will redirect if model is now configured
    console.log("🔄 Checking shop configuration...");

    // Force reload by navigating to self (triggers auth check)
    router.replace("/(auth)/setup-pending");
  }, [router]);

  const handleLogout = useCallback(async () => {
    // TODO: Implement logout
    // await supabase.auth.signOut();
    // Clear local profile
    router.replace("/(auth)/login");
  }, [router]);

  return (
    <SetupPendingScreen
      onCheckAgain={handleCheckAgain}
      onLogout={handleLogout}
    />
  );
}
