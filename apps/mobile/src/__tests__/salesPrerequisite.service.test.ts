import {
  checkSalesPrerequisite,
  getStockSalesGuardScope,
  type SalesGuardScope,
} from "../features/inventory/services/salesPrerequisite.service";

type MockDb = {
  getFirstAsync: jest.Mock;
};

function createMockDb(): MockDb {
  return {
    getFirstAsync: jest.fn(),
  };
}

async function runGuard(
  db: MockDb,
  scope: SalesGuardScope,
): Promise<{ hasSales: boolean; since: string | null }> {
  return checkSalesPrerequisite(db as any, scope);
}

describe("salesPrerequisite.service", () => {
  describe("getStockSalesGuardScope", () => {
    it("requires BAR sales for CHAIN inventory", () => {
      expect(
        getStockSalesGuardScope({
          inventoryModel: "CHAIN",
          area: "BAR",
          checkMode: undefined,
          isProRebaselineCheck: false,
        }),
      ).toBe("BAR");
    });

    it("requires BAR sales for STANDARD inventory", () => {
      expect(
        getStockSalesGuardScope({
          inventoryModel: "STANDARD",
          area: "BAR",
          checkMode: undefined,
          isProRebaselineCheck: false,
        }),
      ).toBe("BAR");
    });

    it("requires BAR sales for STANDARD inventory during rebaseline", () => {
      expect(
        getStockSalesGuardScope({
          inventoryModel: "STANDARD",
          area: "BAR",
          checkMode: undefined,
          isProRebaselineCheck: true,
        }),
      ).toBe("BAR");
    });

    it("does not require BAR sales for warehouse or spot checks", () => {
      expect(
        getStockSalesGuardScope({
          inventoryModel: "CHAIN",
          area: "WAREHOUSE",
          checkMode: "FULL",
          isProRebaselineCheck: false,
        }),
      ).toBeNull();
      expect(
        getStockSalesGuardScope({
          inventoryModel: "CHAIN",
          area: "BAR",
          checkMode: "SPOT",
          isProRebaselineCheck: false,
        }),
      ).toBeNull();
    });
  });

  it("BAR: returns false when no sales after latest BAR stock check", async () => {
    const db = createMockDb();
    const since = "2026-05-19T08:00:00.000Z";
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: since })
      .mockResolvedValueOnce({ count: 0 });

    const result = await runGuard(db, "BAR");

    expect(result).toEqual({ hasSales: false, since });
    expect(db.getFirstAsync).toHaveBeenCalledTimes(2);
    expect(String(db.getFirstAsync.mock.calls[0][0])).toContain(
      "UPPER(COALESCE(location, 'WAREHOUSE')) = 'BAR'",
    );
    expect(Array.isArray(db.getFirstAsync.mock.calls[1][1])).toBe(true);
    expect(db.getFirstAsync.mock.calls[1][1]).toHaveLength(2);
  });

  it("BAR: returns true when pending sales exist after latest BAR stock check", async () => {
    const db = createMockDb();
    const since = "2026-05-19T08:00:00.000Z";
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: since })
      .mockResolvedValueOnce({ count: 2 });

    const result = await runGuard(db, "BAR");

    expect(result).toEqual({ hasSales: true, since });
  });

  it("BAR: uses the latest BAR stock check as anchor, not today's start", async () => {
    const db = createMockDb();
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: since })
      .mockResolvedValueOnce({ count: 1 });

    const result = await runGuard(db, "BAR");

    expect(result).toEqual({ hasSales: true, since });
    expect(db.getFirstAsync.mock.calls[1][1]).toEqual([since, since]);
  });

  it("SIMPLE: returns false when no sales after latest SIMPLE stock check", async () => {
    const db = createMockDb();
    const since = "2026-05-19T08:00:00.000Z";
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: since })
      .mockResolvedValueOnce({ count: 0 });

    const result = await runGuard(db, "SIMPLE");

    expect(result).toEqual({ hasSales: false, since });
    expect(String(db.getFirstAsync.mock.calls[0][0])).toContain(
      "UPPER(COALESCE(location, 'WAREHOUSE')) != 'BAR'",
    );
  });

  it("SIMPLE: returns true when local history sales exist after latest SIMPLE stock check", async () => {
    const db = createMockDb();
    const since = "2026-05-19T08:00:00.000Z";
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: since })
      .mockResolvedValueOnce({ count: 1 });

    const result = await runGuard(db, "SIMPLE");

    expect(result).toEqual({ hasSales: true, since });
  });

  it("no previous BAR check: only counts sales from the start of today", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-14T10:30:00.000Z"));
    const db = createMockDb();
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: null })
      .mockResolvedValueOnce({ count: 0 });

    const result = await runGuard(db, "BAR");

    expect(result).toEqual({ hasSales: false, since: null });
    const expectedTodayStart = new Date();
    expectedTodayStart.setHours(0, 0, 0, 0);
    expect(db.getFirstAsync.mock.calls[1][1]).toEqual([
      expectedTodayStart.toISOString(),
      expectedTodayStart.toISOString(),
    ]);
    jest.useRealTimers();
  });

  it("no previous stock check: returns false when no sales history exists", async () => {
    const db = createMockDb();
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: null })
      .mockResolvedValueOnce({ count: 0 });

    const result = await runGuard(db, "SIMPLE");

    expect(result).toEqual({ hasSales: false, since: null });
  });
});
