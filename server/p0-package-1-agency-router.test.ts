import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  selectWhere: vi.fn(),
  updateWhere: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { agencyBrokerRouter } from "./routers/agency-broker";

const tenantA = "agency-tenant-a";
const tenantB = "agency-tenant-b";
const ctx = { user: { id: 301, role: "agency", tenantId: tenantA }, req: { headers: {} } } as any;

function configureDb(quoteRows: unknown[]) {
  const db = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: mocks.selectWhere })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: mocks.updateWhere })) })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
  };
  mocks.getDb.mockResolvedValue(db);
  mocks.selectWhere.mockResolvedValue(quoteRows);
  mocks.updateWhere.mockResolvedValue({ rowsAffected: 1 });
  mocks.insertValues.mockResolvedValue({});
  return db;
}

describe("P0 Package 1 runtime — agency quote router two-tenant boundary", () => {
  beforeEach(() => {
    for (const mock of [mocks.getDb, mocks.selectWhere, mocks.updateWhere, mocks.insertValues]) mock.mockReset();
  });

  it("rejects a foreign quote direct ID before target or sibling state can change", async () => {
    const db = configureDb([]);
    const caller = agencyBrokerRouter.createCaller(ctx);
    await expect(caller.acceptOrRejectQuote({ quoteRequestId: 9002, action: "accepted", tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.acceptOrRejectQuote({ quoteRequestId: 9002, action: "accepted" })).rejects.toThrow("Quote request not found.");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a same-tenant quote and applies exactly target plus same-batch sibling closure updates", async () => {
    const db = configureDb([{
      id: 9001,
      status: "quoted",
      claimId: 410,
      fleetAccountId: null,
      insurerTenantId: "insurer-x",
      quoteAmount: "2000.00",
      quoteCurrency: "USD",
      requestType: "claim_quote",
      agencyTenantId: tenantA,
    }]);
    const caller = agencyBrokerRouter.createCaller(ctx);
    await expect(caller.acceptOrRejectQuote({ quoteRequestId: 9001, action: "accepted" })).resolves.toMatchObject({ success: true, status: "accepted", siblingsClosed: 1 });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(mocks.updateWhere).toHaveBeenCalledTimes(2);
    expect(inspect(mocks.updateWhere.mock.calls[1][0], { depth: 8 })).toContain(tenantA);
  });

  it("executes same-tenant rejection without a sibling closure update", async () => {
    const db = configureDb([{
      id: 9004,
      status: "quoted",
      claimId: 410,
      fleetAccountId: null,
      insurerTenantId: "insurer-x",
      quoteAmount: "2100.00",
      quoteCurrency: "USD",
      requestType: "claim_quote",
      agencyTenantId: tenantA,
    }]);
    const caller = agencyBrokerRouter.createCaller(ctx);
    await expect(caller.acceptOrRejectQuote({ quoteRequestId: 9004, action: "rejected" })).resolves.toEqual({ success: true, status: "rejected" });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(inspect(mocks.updateWhere.mock.calls[0][0], { depth: 8 })).toContain(tenantA);
  });

  it("rejects a same-session request if a stale foreign agency row is returned unexpectedly", async () => {
    const db = configureDb([{
      id: 9003,
      status: "quoted",
      claimId: 410,
      fleetAccountId: null,
      insurerTenantId: "insurer-x",
      quoteAmount: "2000.00",
      quoteCurrency: "USD",
      requestType: "claim_quote",
      agencyTenantId: tenantB,
    }]);
    const caller = agencyBrokerRouter.createCaller(ctx);
    await expect(caller.acceptOrRejectQuote({ quoteRequestId: 9003, action: "rejected" })).rejects.toThrow("Quote request not found.");
    expect(db.update).not.toHaveBeenCalled();
  });
});
