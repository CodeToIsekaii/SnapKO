import { checkSubscription } from "../hooks/useSubscription";

describe("canonical subscription entitlements", () => {
  it("keeps universal FREE features enabled from backend entitlements", () => {
    const result = checkSubscription({
      effectiveTier: "FREE",
      subscriptionStatus: "EXPIRED",
      daysRemaining: 0,
      expiresAt: null,
      entitlements: {
        canUseDualWarehouse: false,
        canUseCustomStorageAreas: false,
        canInviteStaff: true,
        canUseCloudSync: true,
        canUseFraudProtection: true,
        canUseAdvancedReports: false,
      },
    });

    expect(result.canUseCloudSync).toBe(true);
    expect(result.canInviteStaff).toBe(true);
    expect(result.canUseDualWarehouse).toBe(false);
  });

  it("does not restore PRO access from a raw paid tier after expiry", () => {
    const result = checkSubscription({
      effectiveTier: "FREE",
      subscriptionStatus: "EXPIRED",
      daysRemaining: 0,
      expiresAt: "2026-06-01T00:00:00.000Z",
      entitlements: {
        canUseDualWarehouse: false,
        canUseCustomStorageAreas: false,
        canInviteStaff: true,
        canUseCloudSync: true,
        canUseFraudProtection: true,
        canUseAdvancedReports: false,
      },
    });

    expect(result.tier).toBe("FREE");
    expect(result.state).toBe("EXPIRED");
    expect(result.canUseAdvancedReports).toBe(false);
  });
});
