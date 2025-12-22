/**
 * Subscription Check Hook
 * Logic chặn tính năng nếu hết hạn gói
 */

import { useState, useEffect, useCallback } from "react";

export type Tier = "FREE" | "PERSONAL" | "CHAIN";

export interface SubscriptionStatus {
  tier: Tier;
  isExpired: boolean;
  expiresAt: Date | null;
  daysRemaining: number;
  canUseCloudSync: boolean;
  canUseAdvancedReports: boolean;
  canInviteStaff: boolean;
}

const FREE_FEATURES = {
  canUseCloudSync: false,
  canUseAdvancedReports: false,
  canInviteStaff: false,
};

const PERSONAL_FEATURES = {
  canUseCloudSync: true,
  canUseAdvancedReports: true,
  canInviteStaff: true,
};

const CHAIN_FEATURES = {
  canUseCloudSync: true,
  canUseAdvancedReports: true,
  canInviteStaff: true,
};

/**
 * Check subscription status
 */
export function checkSubscription(
  tier: Tier,
  expiresAt: string | null
): SubscriptionStatus {
  const now = new Date();
  const expiration = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiration ? expiration < now : true;
  const daysRemaining = expiration
    ? Math.max(
        0,
        Math.ceil(
          (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  // Determine features based on tier + expiration
  let features = FREE_FEATURES;
  if (!isExpired) {
    if (tier === "CHAIN") features = CHAIN_FEATURES;
    else if (tier === "PERSONAL") features = PERSONAL_FEATURES;
  }

  return {
    tier: isExpired ? "FREE" : tier,
    isExpired,
    expiresAt: expiration,
    daysRemaining,
    ...features,
  };
}

/**
 * Hook to use subscription status
 */
export function useSubscription(
  tier: Tier,
  expiresAt: string | null
): SubscriptionStatus {
  const [status, setStatus] = useState<SubscriptionStatus>(() =>
    checkSubscription(tier, expiresAt)
  );

  useEffect(() => {
    setStatus(checkSubscription(tier, expiresAt));
  }, [tier, expiresAt]);

  return status;
}

/**
 * Get expiration warning message
 */
export function getExpirationWarning(daysRemaining: number): string | null {
  if (daysRemaining <= 0)
    return "Gói của bạn đã hết hạn. Nâng cấp để tiếp tục sử dụng tính năng nâng cao.";
  if (daysRemaining <= 3)
    return `Gói của bạn sẽ hết hạn trong ${daysRemaining} ngày. Gia hạn ngay!`;
  if (daysRemaining <= 7) return `Gói của bạn còn ${daysRemaining} ngày.`;
  return null;
}

/**
 * Feature gate HOC for React Native
 */
export function canUseFeature(
  status: SubscriptionStatus,
  feature: "cloudSync" | "advancedReports" | "inviteStaff"
): boolean {
  switch (feature) {
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
    message: `Tính năng "${feature}" chỉ có ở gói PERSONAL trở lên. Nâng cấp để sử dụng.`,
  };
}
