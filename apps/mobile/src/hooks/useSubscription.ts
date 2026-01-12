/**
 * Subscription Check Hook
 * Logic chặn tính năng nếu hết hạn gói
 *
 * States:
 * - TRIAL: Free trial period (14 days from account creation)
 * - PRO_ACTIVE: Paid PRO subscription, plenty of time left
 * - PRO_WARNING: Paid PRO subscription expiring in ≤3 days
 * - EXPIRED: Trial or subscription has ended
 */

import { useMemo } from "react";

export type Tier = "FREE" | "PRO" | "PERSONAL" | "CHAIN";
export type SubscriptionState =
  | "TRIAL"
  | "PRO_ACTIVE"
  | "PRO_WARNING"
  | "EXPIRED";

export interface SubscriptionStatus {
  tier: Tier;
  state: SubscriptionState;
  isExpired: boolean;
  expiresAt: Date | null;
  daysRemaining: number;
  // Feature flags
  canUseDualWarehouse: boolean;
  canUseCloudSync: boolean;
  canUseAdvancedReports: boolean;
  canInviteStaff: boolean;
  // UI flags
  showTrialBanner: boolean;
  showExpiryWarning: boolean;
  showExpiredBanner: boolean;
}

const TRIAL_DAYS = 14;
const WARNING_THRESHOLD_DAYS = 3;

const FREE_FEATURES = {
  canUseDualWarehouse: false,
  canUseCloudSync: false,
  canUseAdvancedReports: false,
  canInviteStaff: false,
};

const PRO_FEATURES = {
  canUseDualWarehouse: true,
  canUseCloudSync: true,
  canUseAdvancedReports: true,
  canInviteStaff: true,
};

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffMs = date2.getTime() - date1.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check subscription status with trial support
 */
export function checkSubscription(
  tier: Tier | string | null | undefined,
  expiresAt: string | null | undefined,
  businessCreatedAt: string | null | undefined
): SubscriptionStatus {
  const now = new Date();
  const normalizedTier = (tier?.toUpperCase() as Tier) || "FREE";

  // Default expired state
  const defaultExpired: SubscriptionStatus = {
    tier: "FREE",
    state: "EXPIRED",
    isExpired: true,
    expiresAt: null,
    daysRemaining: 0,
    ...FREE_FEATURES,
    showTrialBanner: false,
    showExpiryWarning: false,
    showExpiredBanner: true,
  };

  // 1. Check if user has active paid subscription
  if (expiresAt) {
    const expiration = new Date(expiresAt);
    const daysRemaining = daysBetween(now, expiration);

    if (daysRemaining >= 0) {
      // Subscription is still valid
      const isWarning = daysRemaining <= WARNING_THRESHOLD_DAYS;

      return {
        tier: normalizedTier,
        state: isWarning ? "PRO_WARNING" : "PRO_ACTIVE",
        isExpired: false,
        expiresAt: expiration,
        daysRemaining,
        ...PRO_FEATURES,
        showTrialBanner: false,
        showExpiryWarning: isWarning,
        showExpiredBanner: false,
      };
    }

    // Subscription has expired
    return defaultExpired;
  }

  // 2. No subscription - check trial period (14 days from business creation)
  if (businessCreatedAt) {
    const createdDate = new Date(businessCreatedAt);
    const daysSinceCreation = daysBetween(createdDate, now);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceCreation);

    if (trialDaysLeft > 0) {
      // Still in trial period - allow all features
      const trialExpiry = new Date(
        createdDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      );

      return {
        tier: "FREE",
        state: "TRIAL",
        isExpired: false,
        expiresAt: trialExpiry,
        daysRemaining: trialDaysLeft,
        ...PRO_FEATURES, // Trial users get PRO features
        showTrialBanner: true,
        showExpiryWarning: false,
        showExpiredBanner: false,
      };
    }
  }

  // 3. No subscription and trial expired (or no creation date)
  return defaultExpired;
}

/**
 * Hook to use subscription status
 */
export function useSubscription(
  tier: Tier | string | null | undefined,
  expiresAt: string | null | undefined,
  businessCreatedAt?: string | null | undefined
): SubscriptionStatus {
  const status = useMemo(
    () => checkSubscription(tier, expiresAt, businessCreatedAt),
    [tier, expiresAt, businessCreatedAt]
  );

  return status;
}

/**
 * Get expiration warning message (for push notifications)
 */
export function getExpirationWarning(daysRemaining: number): string | null {
  if (daysRemaining <= 0)
    return "⚠️ Gói của bạn đã hết hạn. Nâng cấp để tiếp tục sử dụng tính năng nâng cao.";
  if (daysRemaining <= 3)
    return `💡 Gói PRO còn ${daysRemaining} ngày! Gia hạn ngay để giữ tính năng Kho Kép & Báo cáo doanh thu không bị gián đoạn.`;
  if (daysRemaining <= 7) return `📅 Gói PRO còn ${daysRemaining} ngày.`;
  return null;
}

/**
 * Feature gate for React Native components
 */
export function canUseFeature(
  status: SubscriptionStatus,
  feature: "dualWarehouse" | "cloudSync" | "advancedReports" | "inviteStaff"
): boolean {
  switch (feature) {
    case "dualWarehouse":
      return status.canUseDualWarehouse;
    case "cloudSync":
      return status.canUseCloudSync;
    case "advancedReports":
      return status.canUseAdvancedReports;
    case "inviteStaff":
      return status.canInviteStaff;
    default:
      return false;
  }
}

/**
 * Get upgrade prompt for blocked feature
 */
export function getUpgradePrompt(feature: string): {
  title: string;
  message: string;
} {
  return {
    title: "Tính năng trả phí",
    message: `Tính năng "${feature}" chỉ có ở gói PRO trở lên. Nâng cấp ngay để sử dụng.`,
  };
}
