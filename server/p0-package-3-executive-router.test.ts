import { describe, expect, it, beforeEach, vi } from "vitest";
import { P0_B1_FRAUD_DECISION_HOLD } from "./evidence-governance/p0FraudDecisionHold";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  audit: vi.fn(),
  validate: vi.fn(),
  insert: vi.fn(),
  db: null as any,
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));
vi.mock("./security/p0TenantBoundary", async () => {
  const actual = await vi.importActual<
    typeof import("./security/p0TenantBoundary")
  >("./security/p0TenantBoundary");
  return {
    ...actual,
    auditP0CrossTenantAccess: mocks.audit,
    validateP0TenantScope: mocks.validate,
  };
});

import { executiveRouter } from "./routers/executive";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const executiveA = {
  user: {
    id: 101,
    role: "insurer",
    insurerRole: "executive",
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const superAdmin = {
  user: {
    id: 1,
    role: "platform_super_admin",
    insurerRole: null,
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const processorA = {
  user: {
    id: 102,
    role: "insurer",
    insurerRole: "claims_processor",
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const executiveWithoutTenant = {
  user: { id: 103, role: "insurer", insurerRole: "executive", tenantId: null },
  insurerTenantId: null,
  req: { headers: {} },
} as any;
const superAdminWithoutTenant = {
  user: {
    id: 2,
    role: "platform_super_admin",
    insurerRole: null,
    tenantId: null,
  },
  insurerTenantId: null,
  req: { headers: {} },
} as any;

describe("P0 Package 3 runtime — Executive operational detail", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.execute.mockReset();
    mocks.select.mockReset();
    mocks.audit.mockReset();
    mocks.validate.mockReset();
    mocks.insert.mockReset();
    mocks.insert.mockReturnValue({ values: async () => ({}) });
    mocks.db = {
      execute: mocks.execute,
      select: mocks.select,
      insert: mocks.insert,
    };
    mocks.getDb.mockResolvedValue(mocks.db);
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: tenantB }] }) }),
    });
  });

  it("returns the canonical P0 hold only after a same-tenant executive clears authorization", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("denies an ordinary executive tenant override before the object query", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 88, tenantId: tenantB })
    ).rejects.toThrow("does not match the authenticated session");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("denies an ordinary claims processor access to Executive operational detail", async () => {
    await expect(
      executiveRouter
        .createCaller(processorA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("Executive access required");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not disclose a direct foreign numeric claim identifier after the caller clears tenant authorization", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 999 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("contains the legacy high-fraud filter behind the canonical hold", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ filter: "high_fraud" })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed when an ordinary Executive request has no tenant context", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveWithoutTenant)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("not associated with an insurer tenant");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires explicit tenant selection when a platform super-admin has no session tenant", async () => {
    await expect(
      executiveRouter
        .createCaller(superAdminWithoutTenant)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("Explicit tenant selection is required");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not read the database before the P0 hold when a same-tenant request has no database", async () => {
    mocks.db = null;
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns the P0 hold to a platform super-admin only after explicit cross-tenant selection and audit", async () => {
    await expect(
      executiveRouter
        .createCaller(superAdmin)
        .getOperationalClaimDetail({ claimId: 88, tenantId: tenantB })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: tenantB, isCrossTenant: true }),
      "executive_operational_detail",
      "88",
      expect.anything()
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
