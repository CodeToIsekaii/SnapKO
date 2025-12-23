/**
 * E2E Test: Staff Invite Flow
 * Tests: Desktop generate invite → Mobile join → Desktop approve
 *
 * NOTE: This is a TEMPLATE for E2E testing.
 * Requires test framework setup (Playwright/Detox).
 * Uncomment and adapt when ready to implement.
 */

/* TEMPLATE - Uncomment when implementing E2E tests

describe("Staff Invite Flow E2E", () => {
  let desktopApp: any;
  let mobileApp: any;
  let inviteCode: string;

  beforeAll(async () => {
    // Setup: Login as OWNER on Desktop
    desktopApp = await startDesktopApp();
    await desktopApp.login("owner@snapko.test", "password123");

    // Setup: Start Mobile app (not logged in)
    mobileApp = await startMobileApp();
  });

  afterAll(async () => {
    await desktopApp.close();
    await mobileApp.close();
  });

  test("Desktop: Owner can generate invite code", async () => {
    // Navigate to Employees tab
    await desktopApp.click('[data-testid="tab-employees"]');

    // Click "Tạo mã mời"
    await desktopApp.click('[data-testid="btn-generate-invite"]');

    // Wait for modal
    await desktopApp.waitFor('[data-testid="invite-code-modal"]');

    // Get code from modal
    const codeElement = await desktopApp.getText(
      '[data-testid="invite-code-text"]'
    );
    inviteCode = codeElement.trim();

    // Verify code format (6 chars, alphanumeric)
    expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);

    // Verify expiry notice
    const expiryText = await desktopApp.getText(
      '[data-testid="invite-expiry"]'
    );
    expect(expiryText).toContain("48 giờ");

    // Close modal
    await desktopApp.click('[data-testid="btn-close-modal"]');
  });

  test("Supabase: Invite code exists in database", async () => {
    // Query Supabase directly
    const { data, error } = await supabase
      .from("staff_invite_codes")
      .select("*")
      .eq("code", inviteCode)
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.status).toBe("ACTIVE");
    expect(new Date(data.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test("Mobile: Staff can join using invite code", async () => {
    // Navigate to Join screen
    await mobileApp.tap('[data-testid="btn-join-business"]');

    // Enter invite code
    await mobileApp.type('[data-testid="input-invite-code"]', inviteCode);

    // Enter staff details
    await mobileApp.type('[data-testid="input-full-name"]', "Nguyen Van A");
    await mobileApp.type('[data-testid="input-phone"]', "0901234567");
    await mobileApp.type('[data-testid="input-email"]', "staff@snapko.test");
    await mobileApp.type('[data-testid="input-password"]', "password123");

    // Submit
    await mobileApp.tap('[data-testid="btn-submit-join"]');

    // Wait for success
    await mobileApp.waitFor('[data-testid="join-success"]');

    // Verify redirected to pending screen
    const statusText = await mobileApp.getText('[data-testid="status-text"]');
    expect(statusText).toContain("Chờ chủ quán duyệt");
  });

  test("Desktop: Pending staff appears in list", async () => {
    // Refresh employees tab
    await desktopApp.click('[data-testid="tab-employees"]');

    // Wait for pending section
    await desktopApp.waitFor('[data-testid="pending-staff-section"]');

    // Verify pending count
    const pendingCount = await desktopApp.getText(
      '[data-testid="pending-count"]'
    );
    expect(parseInt(pendingCount)).toBeGreaterThan(0);

    // Verify staff name appears
    const staffNames = await desktopApp.getAllText(
      '[data-testid="pending-staff-name"]'
    );
    expect(staffNames).toContain("Nguyen Van A");
  });

  test("Desktop: Owner can approve staff", async () => {
    // Find staff row
    const staffRow = await desktopApp.findByText("Nguyen Van A");

    // Click approve button
    await desktopApp.clickWithin(staffRow, '[data-testid="btn-approve"]');

    // Wait for refresh
    await desktopApp.wait(1000);

    // Verify staff moved to active section
    const activeStaffNames = await desktopApp.getAllText(
      '[data-testid="active-staff-name"]'
    );
    expect(activeStaffNames).toContain("Nguyen Van A");

    // Verify no longer in pending
    const pendingStaffNames = await desktopApp.getAllText(
      '[data-testid="pending-staff-name"]'
    );
    expect(pendingStaffNames).not.toContain("Nguyen Van A");
  });

  test("Mobile: Approved staff can access inventory", async () => {
    // Logout and login as new staff
    await mobileApp.logout();
    await mobileApp.login("staff@snapko.test", "password123");

    // Verify can access inventory screen
    await mobileApp.tap('[data-testid="tab-inventory"]');
    await mobileApp.waitFor('[data-testid="inventory-list"]');

    // Verify can capture photo
    const captureButton = await mobileApp.find('[data-testid="btn-capture"]');
    expect(captureButton).toBeDefined();
  });

  test("Security: Cannot use same code after expiry", async () => {
    // Fast-forward time 49 hours (mock)
    await mockTime(Date.now() + 49 * 60 * 60 * 1000);

    // Try to join with expired code
    await mobileApp.logout();
    await mobileApp.tap('[data-testid="btn-join-business"]');
    await mobileApp.type('[data-testid="input-invite-code"]', inviteCode);
    await mobileApp.tap('[data-testid="btn-submit-join"]');

    // Verify error message
    const errorText = await mobileApp.getText('[data-testid="error-message"]');
    expect(errorText).toContain("Mã đã hết hạn");
  });

  test("Security: Multiple staff can use same code", async () => {
    // Generate new code
    await desktopApp.click('[data-testid="btn-generate-invite"]');
    const newCode = await desktopApp.getText(
      '[data-testid="invite-code-text"]'
    );
    await desktopApp.click('[data-testid="btn-close-modal"]');

    // Staff 1 joins
    await mobileApp.logout();
    await joinWithCode(mobileApp, newCode, "Staff One", "staff1@test.com");

    // Staff 2 joins with SAME code
    await mobileApp.logout();
    await joinWithCode(mobileApp, newCode, "Staff Two", "staff2@test.com");

    // Both should be in pending list
    await desktopApp.click('[data-testid="tab-employees"]');
    const pendingNames = await desktopApp.getAllText(
      '[data-testid="pending-staff-name"]'
    );
    expect(pendingNames).toContain("Staff One");
    expect(pendingNames).toContain("Staff Two");
  });
});

// Helper functions
async function joinWithCode(
  app: any,
  code: string,
  name: string,
  email: string
) {
  await app.tap('[data-testid="btn-join-business"]');
  await app.type('[data-testid="input-invite-code"]', code);
  await app.type('[data-testid="input-full-name"]', name);
  await app.type('[data-testid="input-phone"]', "0900000000");
  await app.type('[data-testid="input-email"]', email);
  await app.type('[data-testid="input-password"]', "password123");
  await app.tap('[data-testid="btn-submit-join"]');
  await app.waitFor('[data-testid="join-success"]');
}

*/
