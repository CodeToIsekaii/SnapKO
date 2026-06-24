import { useMemo } from "react";

export type Tier = "FREE" | "PRO" | "CHAIN";
export type SubscriptionState =
  | "TRIAL"
  | "PRO_ACTIVE"
  | "PRO_WARNING"
  | "EXPIRED";

export interface CanonicalEntitlements {
  canUseDualWarehouse: boolean;
  canUseCustomStorageAreas: boolean;
  canInviteStaff: boolean;
  canUseCloudSync: boolean;
  canUseFraudProtection: boolean;
  canUseAdvancedReports: boolean;
}

export interface CanonicalSubscriptionInput {
  effectiveTier?: string | null;
  subscriptionStatus?: "TRIAL" | "ACTIVE" | "WARNING" | "EXPIRED" | null;
  daysRemaining?: number | null;
  expiresAt?: string | null;
  entitlements?: CanonicalEntitlements | null;
}

export interface SubscriptionStatus extends CanonicalEntitlements {
  tier: Tier;
  state: SubscriptionState;
  isExpired: boolean;
  expiresAt: Date | null;
  daysRemaining: number;
  showTrialBanner: boolean;
  showExpiryWarning: boolean;
  showExpiredBanner: boolean;
}

const SAFE_ENTITLEMENTS: CanonicalEntitlements = {
  canUseDualWarehouse: false,
  canUseCustomStorageAreas: false,
  canInviteStaff: false,
  canUseCloudSync: false,
  canUseFraudProtection: false,
  canUseAdvancedReports: false,
};

function normalizeTier(value: string | null | undefined): Tier {
  const tier = String(value ?? "FREE").toUpperCase();
  if (tier === "CHAIN") return "CHAIN";
  if (tier === "PRO") return "PRO";
  return "FREE";
}

export function checkSubscription(
  input: CanonicalSubscriptionInput,
): SubscriptionStatus {
  const status = input.subscriptionStatus ?? "EXPIRED";
  const state: SubscriptionState =
    status === "TRIAL"
      ? "TRIAL"
      : status === "ACTIVE"
        ? "PRO_ACTIVE"
        : status === "WARNING"
          ? "PRO_WARNING"
          : "EXPIRED";
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  return {
    tier: normalizeTier(input.effectiveTier),
    state,
    isExpired: status === "EXPIRED",
    expiresAt:
      expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    daysRemaining: Math.max(0, input.daysRemaining ?? 0),
    ...(input.entitlements ?? SAFE_ENTITLEMENTS),
    showTrialBanner: status === "TRIAL",
    showExpiryWarning: status === "WARNING",
    showExpiredBanner: status === "EXPIRED",
  };
}

export function useSubscription(
  input: CanonicalSubscriptionInput,
): SubscriptionStatus {
  return useMemo(
    () => checkSubscription(input),
    [
      input.effectiveTier,
      input.subscriptionStatus,
      input.daysRemaining,
      input.expiresAt,
      input.entitlements,
    ],
  );
}

export function getExpirationWarning(daysRemaining: number): string | null {
  if (daysRemaining <= 0)
    return "⚠️ Gói của bạn đã hết hạn. Nâng cấp để tiếp tục sử dụng tính năng nâng cao.";
  if (daysRemaining <= 5)
    return `💡 Gói PRO còn ${daysRemaining} ngày! Gia hạn ngay để giữ tính năng Kho Kép & Báo cáo doanh thu không bị gián đoạn.`;
  return null;
}

export function canUseFeature(
  status: SubscriptionStatus,
  feature:
    | "dualWarehouse"
    | "cloudSync"
    | "fraudProtection"
    | "advancedReports"
    | "inviteStaff",
): boolean {
  switch (feature) {
    case "dualWarehouse":
      return status.canUseDualWarehouse;
    case "cloudSync":
      return status.canUseCloudSync;
    case "fraudProtection":
      return status.canUseFraudProtection;
    case "advancedReports":
      return status.canUseAdvancedReports;
    case "inviteStaff":
      return status.canInviteStaff;
  }
}

export function getUpgradePrompt(feature: string): {
  title: string;
  message: string;
} {
  return {
    title: "Tính năng trả phí",
    message: `Tính năng "${feature}" chỉ có ở gói PRO trở lên. Nâng cấp ngay để sử dụng.`,
  };
}
