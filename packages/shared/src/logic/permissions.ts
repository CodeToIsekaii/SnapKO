/**
 * SnapKO Permissions Logic
 * Role-based access control - pure functions
 */

import type { Profile, ProfileRoleEnum, Business } from "@snapko/ts-types";

/**
 * Check if profile is an Owner
 */
export function isOwner(profile: Profile | null): boolean {
  return profile?.role === "OWNER" && profile?.status === "ACTIVE";
}

/**
 * Check if profile is an active Staff
 */
export function isActiveStaff(profile: Profile | null): boolean {
  return profile?.role === "STAFF" && profile?.status === "ACTIVE";
}

/**
 * Check if profile can perform inventory operations
 */
export function canPerformInventory(profile: Profile | null): boolean {
  if (!profile) return false;
  return (
    profile.status === "ACTIVE" &&
    (profile.role === "OWNER" || profile.role === "STAFF")
  );
}

/**
 * Check if profile can approve staff
 */
export function canApproveStaff(profile: Profile | null): boolean {
  return isOwner(profile);
}

/**
 * Check if profile can view reports
 */
export function canViewReports(profile: Profile | null): boolean {
  return isOwner(profile);
}

/**
 * Check if profile can manage settings
 */
export function canManageSettings(profile: Profile | null): boolean {
  return isOwner(profile);
}

/**
 * Check if profile can request data deletion
 */
export function canRequestDataDeletion(profile: Profile | null): boolean {
  return profile !== null && profile.status !== "INACTIVE";
}

/**
 * Check if business subscription is active
 */
export function isSubscriptionActive(business: Business | null): boolean {
  if (!business) return false;
  if (business.tier === "FREE") return true;
  if (!business.subscription_expires_at) return false;
  return new Date(business.subscription_expires_at) > new Date();
}

/**
 * Check if business can use cloud sync
 */
export function canUseCloudSync(business: Business | null): boolean {
  if (!business) return false;
  if (business.tier === "FREE") return false;
  return isSubscriptionActive(business);
}

/**
 * Get permission summary for a profile
 */
export function getPermissionSummary(profile: Profile | null): {
  canInventory: boolean;
  canApprove: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canDeleteData: boolean;
} {
  return {
    canInventory: canPerformInventory(profile),
    canApprove: canApproveStaff(profile),
    canViewReports: canViewReports(profile),
    canManageSettings: canManageSettings(profile),
    canDeleteData: canRequestDataDeletion(profile),
  };
}

/**
 * Check if role has minimum required level
 */
export function hasMinimumRole(
  profile: Profile | null,
  requiredRole: ProfileRoleEnum
): boolean {
  if (!profile || profile.status !== "ACTIVE") return false;

  const roleHierarchy: Record<ProfileRoleEnum, number> = {
    STAFF: 1,
    OWNER: 2,
  };

  return roleHierarchy[profile.role] >= roleHierarchy[requiredRole];
}
