import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), execute: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));

import { intelligenceRouter } from "./routers/intelligence";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const authorisedCtx = { user: { id: 401, role: "insurer", insurerRole: "risk_manager", tenantId: tenantA }, req: { headers: {} } } as any;

describe("P0 Package 1 runtime — intelligence router two-tenant boundary", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.getDb.mockResolvedValue({ execute: mocks.execute });
  });

  it("rejects an unauthorised claimant before any registry rows are disclosed", async () => {
    const caller = intelligenceRouter.createCaller({ user: { id: 402, role: "claimant", tenantId: tenantA }, req: { headers: {} } } as any);
    await expect(caller.getDriverRegistry({})).rejects.toThrow("Authorised intelligence role required.");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a foreign tenant override for an ordinary authorised insurer user", async () => {
    const caller = intelligenceRouter.createCaller(authorisedCtx);
    await expect(caller.getOfficerRegistry({ tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("executes registry reads under the session tenant and returns only the scoped database result", async () => {
    mocks.execute.mockResolvedValueOnce([[{ id: 1, entity_name: "Tenant A Driver", tenant_id: tenantA }]]);
    const caller = intelligenceRouter.createCaller(authorisedCtx);
    await expect(caller.getDriverRegistry({ limit: 25 })).resolves.toEqual([{ id: 1, entity_name: "Tenant A Driver", tenant_id: tenantA }]);
    const serialisedQuery = JSON.stringify(mocks.execute.mock.calls[0][0]);
    expect(serialisedQuery).toContain(tenantA);
    expect(serialisedQuery).not.toContain(tenantB);
  });

  it("executes relationship graph reads under the session tenant and rejects foreign graph scope", async () => {
    const caller = intelligenceRouter.createCaller(authorisedCtx);
    await expect(caller.getRelationshipGraph({ tenantId: tenantB, entityId: 9, entityType: "driver" })).rejects.toThrow("does not match the authenticated session");
    mocks.execute.mockResolvedValueOnce([[{ id: 8, source_entity_id: 9, target_entity_id: 4, tenant_id: tenantA }]]);
    await expect(caller.getRelationshipGraph({ entityId: 9, entityType: "driver" })).resolves.toEqual([{ id: 8, source_entity_id: 9, target_entity_id: 4, tenant_id: tenantA }]);
    const serialisedQuery = JSON.stringify(mocks.execute.mock.calls[0][0]);
    expect(serialisedQuery).toContain(tenantA);
    expect(serialisedQuery).not.toContain(tenantB);
  });
});
