/**
 * useSubscriptionStatus - Central hook for subscription state management
 * Determines user's subscription status and feature access
 *
 * States:
 * - TRIAL: Free trial period (14 days from account creation)
 * - PRO_ACTIVE: Paid subscription, plenty of time left
 * - PRO_WARNING: Paid subscription expiring in ≤5 days
 * - EXPIRED: Trial or subscription has ended
 */

import { useMemo } from "react";

export type SubscriptionState =
  | "TRIAL"
  | "PRO_ACTIVE"
  | "PRO_WARNING"
  | "EXPIRED";

export interface SubscriptionInfo {
  state: SubscriptionState;
  daysLeft: number;
  expiresAt: Date | null;
  canUseDualWarehouse: boolean;
  showTrialBanner: boolean;
  showExpiryWarning: boolean;
  showExpiredBanner: boolean;
}

interface UseSubscriptionStatusParams {
  tier?: string | null; // Business tier: FREE, PRO, etc.
  subscriptionExpiresAt?: string | null; // Subscription expiry date
  businessCreatedAt?: string | null; // For trial calculation
}

const TRIAL_DAYS = 14;
const WARNING_THRESHOLD_DAYS = 5;

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffMs = date2.getTime() - date1.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function useSubscriptionStatus({
  tier,
  subscriptionExpiresAt,
  businessCreatedAt,
}: UseSubscriptionStatusParams): SubscriptionInfo {
  return useMemo(() => {
    const now = new Date();

    // Default expired state
    const defaultExpired: SubscriptionInfo = {
      state: "EXPIRED",
      daysLeft: 0,
      expiresAt: null,
      canUseDualWarehouse: false,
      showTrialBanner: false,
      showExpiryWarning: false,
      showExpiredBanner: true,
    };

    // 1. Check if user has active PRO subscription
    if (subscriptionExpiresAt) {
      const expiryDate = new Date(subscriptionExpiresAt);
      const daysLeft = daysBetween(now, expiryDate);

      if (daysLeft >= 0) {
        // Subscription is still valid
        const isWarning = daysLeft <= WARNING_THRESHOLD_DAYS;

        return {
          state: isWarning ? "PRO_WARNING" : "PRO_ACTIVE",
          daysLeft,
          expiresAt: expiryDate,
          canUseDualWarehouse: true, // PRO users can always use dual warehouse
          showTrialBanner: false,
          showExpiryWarning: isWarning,
          showExpiredBanner: false,
        };
      }

      // PRO subscription has expired
      return defaultExpired;
    }

    // 2. No subscription - check trial period
    if (businessCreatedAt) {
      const createdDate = new Date(businessCreatedAt);
      const daysSinceCreation = daysBetween(createdDate, now);
      const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceCreation);

      if (trialDaysLeft > 0) {
        // Still in trial period
        return {
          state: "TRIAL",
          daysLeft: trialDaysLeft,
          expiresAt: new Date(
            createdDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
          ),
          canUseDualWarehouse: true, // Trial users can use dual warehouse
          showTrialBanner: true,
          showExpiryWarning: false,
          showExpiredBanner: false,
        };
      }
    }

    // 3. No subscription and trial expired (or no creation date)
    return defaultExpired;
  }, [tier, subscriptionExpiresAt, businessCreatedAt]);
}

export default useSubscriptionStatus;
