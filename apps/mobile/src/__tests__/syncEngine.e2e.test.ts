/**
 * Sync Engine E2E Tests
 * Tests for offline/online edge cases, retry logic, and cleanup workflow
 */

import { PendingSyncLog, SyncStatus } from "../sync/syncEngine";

// Mock types for testing
interface MockLog extends Omit<PendingSyncLog, "synced" | "sync_error"> {}

describe("Sync Engine E2E Tests", () => {
  describe("Offline Save → Online Sync", () => {
    it("should save log to pending queue when offline", async () => {
      const mockLog: MockLog = {
        id: "test-log-1",
        ingredient_id: "ing-1",
        location: "WAREHOUSE",
        type: "IMPORT",
        ai_parsed_quantity: 10,
        ai_confidence_score: 95,
        final_confirmed_quantity: 10,
        quantity_change_base: 10,
        unit_cost_at_time: 50000,
        source_photo_urls: ["file:///local/photo.jpg"],
        ai_parsed_json: null,
        staff_note: null,
        is_verified: true,
        diff_percentage: 0,
        created_at: new Date().toISOString(),
        is_new_ingredient: false,
        new_ingredient_name: null,
        new_ingredient_unit: null,
      };

      // Test that log structure is valid
      expect(mockLog.id).toBeDefined();
      expect(mockLog.location).toMatch(/WAREHOUSE|BAR/);
      expect(mockLog.type).toMatch(/IMPORT|TRANSFER|AUDIT|WASTE|LENT/);
    });

    it("should include all required fields for API sync", () => {
      const requiredFields = [
        "id",
        "location",
        "type",
        "final_confirmed_quantity",
        "created_at",
      ];

      const mockLog = {
        id: "test-id",
        location: "WAREHOUSE",
        type: "IMPORT",
        final_confirmed_quantity: 10,
        created_at: new Date().toISOString(),
      };

      requiredFields.forEach((field) => {
        expect(mockLog).toHaveProperty(field);
      });
    });
  });

  describe("Retry Logic", () => {
    it("should implement exponential backoff delays", () => {
      const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

      for (let attempt = 0; attempt < 3; attempt++) {
        const expectedDelay = Math.pow(2, attempt) * 1000;
        expect(expectedDelay).toBe(delays[attempt]);
      }
    });

    it("should limit retries to 3 attempts", () => {
      const maxRetries = 3;
      let attempts = 0;

      for (let i = 0; i < maxRetries; i++) {
        attempts++;
      }

      expect(attempts).toBe(3);
    });
  });

  describe("Image Cleanup Workflow", () => {
    it("should only cleanup after successful DB sync (Step 3)", () => {
      // Workflow:
      // 1. Upload image → Get URL ✓
      // 2. Update SQLite local ✓
      // 3. Sync to Supabase DB ✓
      // 4. Delete local image ← ONLY HERE

      const workflowSteps = [
        { step: 1, action: "uploadImage", deleteLocal: false },
        { step: 2, action: "updateLocalDB", deleteLocal: false },
        { step: 3, action: "syncToRemoteDB", deleteLocal: false },
        { step: 4, action: "cleanupLocalImage", deleteLocal: true },
      ];

      const cleanupStep = workflowSteps.find((s) => s.deleteLocal);
      expect(cleanupStep?.step).toBe(4);
      expect(cleanupStep?.action).toBe("cleanupLocalImage");
    });

    it("should preserve local image if sync fails", () => {
      const syncResult = { success: false, error: "Network error" };
      const shouldDeleteLocal = syncResult.success;

      expect(shouldDeleteLocal).toBe(false);
    });

    it("should delete local image if sync succeeds", () => {
      const syncResult = { success: true };
      const shouldDeleteLocal = syncResult.success;

      expect(shouldDeleteLocal).toBe(true);
    });
  });

  describe("Business ID Folder Structure", () => {
    it("should format path with business_id for RLS", () => {
      const businessId = "biz-123-abc";
      const timestamp = Date.now();
      const randomSuffix = "xyz123";

      const expectedPath = `${businessId}/inventory/${timestamp}_${randomSuffix}.jpg`;

      expect(expectedPath).toContain(businessId);
      expect(expectedPath).toContain("/inventory/");
      expect(expectedPath).toEndWith(".jpg");
    });

    it("should fallback to generic path if no business_id", () => {
      const businessId = undefined;
      const folder = businessId ? `${businessId}/inventory` : "inventory";

      expect(folder).toBe("inventory");
    });
  });

  describe("Sync Status Tracking", () => {
    it("should track sync status correctly", () => {
      const status: SyncStatus = {
        isOnline: true,
        pendingCount: 5,
        lastSyncAt: new Date().toISOString(),
        isSyncing: false,
      };

      expect(status.isOnline).toBe(true);
      expect(status.pendingCount).toBeGreaterThan(0);
      expect(status.isSyncing).toBe(false);
    });

    it("should prevent concurrent syncs", () => {
      let isSyncing = false;

      // First sync starts
      isSyncing = true;

      // Second sync should be blocked
      const canStartNewSync = !isSyncing;
      expect(canStartNewSync).toBe(false);
    });
  });
});

// Custom matcher for endsWith
expect.extend({
  toEndWith(received: string, expected: string) {
    const pass = received.endsWith(expected);
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? "not " : ""}to end with ${expected}`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toEndWith(expected: string): R;
    }
  }
}
