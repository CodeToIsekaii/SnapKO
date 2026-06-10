import {
  checkSalesPrerequisite,
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

  it("no previous stock check: returns true when sales history exists", async () => {
    const db = createMockDb();
    db.getFirstAsync
      .mockResolvedValueOnce({ created_at: null })
      .mockResolvedValueOnce({ count: 3 });

    const result = await runGuard(db, "BAR");

    expect(result).toEqual({ hasSales: true, since: null });
    expect(Array.isArray(db.getFirstAsync.mock.calls[1][1])).toBe(true);
    expect(db.getFirstAsync.mock.calls[1][1]).toEqual([
      "1970-01-01T00:00:00.000Z",
      "1970-01-01T00:00:00.000Z",
    ]);
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
