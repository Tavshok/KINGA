// @ts-nocheck
/**
 * fleet-agency-routing.test.ts
 *
 * Verifies that fleet insurance requests are routed exclusively through
 * KINGA Agency — no direct insurer relationships are created.
 */
import { describe, afterAll, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// ─── Mock DB ─────────────────────────────────────────────────────────────────

// Chainable select mock — defined before vi.mock factory
function makeSelectChain(rows: unknown[]) {
  const chain: any = {};
  for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset", "and"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

// Use vi.hoisted so the mock object is available inside the factory
const { mockDb, mockInsert, mockUpdate } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDb: any = {
    select: vi.fn(),
    insert: mockInsert,
    update: mockUpdate,
  };
  return { mockDb, mockInsert, mockUpdate };
});

vi.mock("../db", () => ({
  getDb: async () => mockDb,
}));



// ─── Context helpers ──────────────────────────────────────────────────────────

const FLEET_OWNER_ID = 101;
const FLEET_ACCOUNT_ID = 42;
const INSURER_A = "insurer-tenant-a";
const INSURER_B = "insurer-tenant-b";
const AGENCY_TENANT_ID = "kinga-agency";

function makeCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: FLEET_OWNER_ID,
      openId: "fleet-owner-open-id",
      email: "fleet@example.com",
      name: "Fleet Owner",
      loginMethod: "manus",
      role: "user",
      tenantId: null,
      insurerTenantId: null,
      insurerRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    tenant: null,
    db: mockDb,
  };
}

function makeInsurerCtx(insurerTenantId: string): TrpcContext {
  return makeCtx({
    id: 200,
    role: "insurer",
    tenantId: insurerTenantId,
    insurerTenantId,
    insurerRole: "underwriter",
  });
}

// ─── Insert chain helper ──────────────────────────────────────────────────────

function makeInsertChain(returnId = 999) {
  return {
    values: vi.fn().mockReturnValue({
      $returningId: vi.fn().mockResolvedValue([{ id: returnId }]),
      then: (resolve: (v: unknown) => void) => resolve(undefined),
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Fleet Agency Routing — createFleetQuoteRequest", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("fans out insurer_quote_requests to all active insurer tenants", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active", vehicleCount: 15 }]);
      if (selectCallCount === 2) return makeSelectChain([]); // no existing agency client
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }, { id: INSURER_B }]);
      if (selectCallCount === 4) return makeSelectChain([]); // no pending requests
      return makeSelectChain([]);
    });

    const insertedValues: any[][] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((rows: any) => {
        insertedValues.push(Array.isArray(rows) ? rows : [rows]);
        return {
          $returningId: vi.fn().mockResolvedValue([{ id: 999 }]),
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        };
      }),
    }));

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID });

    expect(result.success).toBe(true);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.message).toContain("KINGA Agency");

    // Verify fleet_policy requestType and fleet_agency claimSource
    const quoteRows = insertedValues.find(rows =>
      rows.length > 0 && rows[0]?.requestType === "fleet_policy"
    );
    expect(quoteRows).toBeDefined();
    expect(quoteRows!.every((r: any) => r.claimSource === "fleet_agency")).toBe(true);
    expect(quoteRows!.every((r: any) => r.agencyTenantId === AGENCY_TENANT_ID)).toBe(true);
  });

  it("prevents duplicate pending/sent/quoted requests per insurer", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active", vehicleCount: 5 }]);
      if (selectCallCount === 2) return makeSelectChain([{ id: 77 }]); // existing client
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }, { id: INSURER_B }]);
      if (selectCallCount === 4) return makeSelectChain([{ insurerTenantId: INSURER_A }, { insurerTenantId: INSURER_B }]); // both pending
      return makeSelectChain([]);
    });
    mockInsert.mockImplementation(() => makeInsertChain());

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID });

    expect(result.success).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.message).toContain("All insurers already have a pending RFQ");
  });

  it("throws NOT_FOUND when fleet account does not belong to the user", async () => {
    mockDb.select.mockImplementation(() => makeSelectChain([]));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: 9999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws PRECONDITION_FAILED when fleet account is suspended", async () => {
    mockDb.select.mockImplementation(() =>
      makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "suspended", vehicleCount: 10 }])
    );

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when no insurer tenants exist on the platform", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active", vehicleCount: 5 }]);
      if (selectCallCount === 2) return makeSelectChain([{ id: 77 }]);
      if (selectCallCount === 3) return makeSelectChain([]); // no insurers
      return makeSelectChain([]);
    });
    mockInsert.mockImplementation(() => makeInsertChain());

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("auto-creates agency_clients entry when none exists for the fleet owner", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active", vehicleCount: 3 }]);
      if (selectCallCount === 2) return makeSelectChain([]); // no existing client → triggers insert
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }]);
      if (selectCallCount === 4) return makeSelectChain([]);
      return makeSelectChain([]);
    });

    let insertCallCount = 0;
    mockInsert.mockImplementation(() => {
      insertCallCount++;
      return makeInsertChain(insertCallCount * 10);
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID });

    // 4 inserts: agency_client + claim + quote_requests batch + audit_trail
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it("reuses existing agency_clients entry without inserting a new one", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active", vehicleCount: 3 }]);
      if (selectCallCount === 2) return makeSelectChain([{ id: 77 }]); // existing client
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }]);
      if (selectCallCount === 4) return makeSelectChain([]);
      return makeSelectChain([]);
    });

    let insertCallCount = 0;
    mockInsert.mockImplementation(() => {
      insertCallCount++;
      return makeInsertChain(insertCallCount * 10);
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.agencyBroker.createFleetQuoteRequest({ fleetAccountId: FLEET_ACCOUNT_ID });

    // 3 inserts: claim + quote_requests + audit_trail (no agency_client insert)
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });
});

describe("Fleet Agency Routing — linkToInsurer", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns routedViaAgency = true and does NOT call db.update", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active" }]);
      if (selectCallCount === 2) return makeSelectChain([{ id: 77 }]);
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }, { id: INSURER_B }]);
      if (selectCallCount === 4) return makeSelectChain([]);
      return makeSelectChain([]);
    });
    mockInsert.mockImplementation(() => makeInsertChain());

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.fleetAccounts.linkToInsurer({
      accountId: FLEET_ACCOUNT_ID,
      insurerTenantId: INSURER_A,
    });

    expect(result.routedViaAgency).toBe(true);
    expect(result.success).toBe(true);
    expect(result.sent).toBe(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does not create a direct insurer relationship on the fleet account", async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return makeSelectChain([{ id: FLEET_ACCOUNT_ID, accountName: "Acme Fleet", status: "active" }]);
      if (selectCallCount === 2) return makeSelectChain([{ id: 77 }]);
      if (selectCallCount === 3) return makeSelectChain([{ id: INSURER_A }]);
      if (selectCallCount === 4) return makeSelectChain([]);
      return makeSelectChain([]);
    });
    mockInsert.mockImplementation(() => makeInsertChain());

    const caller = appRouter.createCaller(makeCtx());
    await caller.fleetAccounts.linkToInsurer({ accountId: FLEET_ACCOUNT_ID });

    // db.update must never be called (no direct linkedInsurerTenantId assignment)
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("Fleet Agency Routing — listFleetQuoteRequests", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns fleet_policy rows for the authenticated user", async () => {
    const rows = [
      { id: 1, claimId: 100, claimNumber: "FLEET-RFQ-ABC", insurerTenantId: INSURER_A, insurerName: "Insurer A", status: "quoted", requestType: "fleet_policy", claimSource: "fleet_agency", fleetAccountId: FLEET_ACCOUNT_ID, quoteAmount: "50000.00", quoteCurrency: "ZAR", createdAt: "2026-01-01 10:00:00" },
      { id: 2, claimId: 100, claimNumber: "FLEET-RFQ-ABC", insurerTenantId: INSURER_B, insurerName: "Insurer B", status: "pending", requestType: "fleet_policy", claimSource: "fleet_agency", fleetAccountId: FLEET_ACCOUNT_ID, quoteAmount: null, quoteCurrency: "ZAR", createdAt: "2026-01-01 10:00:00" },
    ];
    // First call returns rows, second call returns count
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain(rows);
      return makeSelectChain([{ count: rows.length }]);
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.agencyBroker.listFleetQuoteRequests({ limit: 50, offset: 0 });

    expect(result.quotes).toHaveLength(2);
    expect(result.quotes.every((q: any) => q.requestType === "fleet_policy")).toBe(true);
  });
});

describe("Fleet Agency Routing — listInsurerFleetRFQs", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns fleet_policy RFQs for the calling insurer tenant", async () => {
    const rows = [
      { id: 10, claimId: 200, claimNumber: "FLEET-RFQ-XYZ", agencyTenantId: AGENCY_TENANT_ID, status: "pending", requestType: "fleet_policy", claimSource: "fleet_agency", vehicleCount: 20, createdAt: "2026-01-02 09:00:00" },
    ];
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain(rows);
      return makeSelectChain([{ count: rows.length }]);
    });

    const caller = appRouter.createCaller(makeInsurerCtx(INSURER_A));
    const result = await caller.agencyBroker.listInsurerFleetRFQs({ limit: 50, offset: 0 });

    expect(result.rfqs).toHaveLength(1);
    expect(result.rfqs[0].requestType).toBe("fleet_policy");
    expect(result.rfqs[0].claimSource).toBe("fleet_agency");
  });

  it("throws FORBIDDEN when the calling user has no insurer tenantId", async () => {
    const caller = appRouter.createCaller(makeCtx({ tenantId: null }));
    await expect(
      caller.agencyBroker.listInsurerFleetRFQs({ limit: 50, offset: 0 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
