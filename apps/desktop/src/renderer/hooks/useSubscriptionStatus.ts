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
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;
  daysRemaining?: number | null;
  subscriptionExpiresAt?: string | null;
  canUseDualWarehouse?: boolean;
}

export function useSubscriptionStatus({
  subscriptionStatus,
  daysRemaining,
  subscriptionExpiresAt,
  canUseDualWarehouse,
}: UseSubscriptionStatusParams): SubscriptionInfo {
  return useMemo(() => {
    const status = subscriptionStatus ?? "EXPIRED";
    const parsedExpiry = subscriptionExpiresAt
      ? new Date(subscriptionExpiresAt)
      : null;
    return {
      state:
        status === "TRIAL"
          ? "TRIAL"
          : status === "ACTIVE"
            ? "PRO_ACTIVE"
            : status === "WARNING"
              ? "PRO_WARNING"
              : "EXPIRED",
      daysLeft: Math.max(0, daysRemaining ?? 0),
      expiresAt:
        parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
          ? parsedExpiry
          : null,
      canUseDualWarehouse: canUseDualWarehouse ?? false,
      showTrialBanner: status === "TRIAL",
      showExpiryWarning: status === "WARNING",
      showExpiredBanner: status === "EXPIRED",
    };
  }, [
    canUseDualWarehouse,
    daysRemaining,
    subscriptionExpiresAt,
    subscriptionStatus,
  ]);
}

export default useSubscriptionStatus;
