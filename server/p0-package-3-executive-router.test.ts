import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  audit: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: async () => ({ execute: mocks.execute, select: mocks.select }),
}));
vi.mock("./security/p0TenantBoundary", async () => {
  const actual = await vi.importActual<typeof import("./security/p0TenantBoundary")>("./security/p0TenantBoundary");
  return { ...actual, auditP0CrossTenantAccess: mocks.audit, validateP0TenantScope: mocks.validate };
});

import { executiveRouter } from "./routers/executive";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const executiveA = {
  user: { id: 101, role: "insurer", insurerRole: "executive", tenantId: tenantA },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const superAdmin = {
  user: { id: 1, role: "platform_super_admin", insurerRole: null, tenantId: tenantA },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;

describe("P0 Package 3 runtime — Executive operational detail", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.select.mockReset();
    mocks.audit.mockReset();
    mocks.validate.mockReset();
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: tenantB }] }) }) });
  });

  it("returns minimum authoritative fields for a same-tenant executive without fabricated fallbacks", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: 77, claimNumber: "AUTH-77", status: "submitted", workflowState: "intake_pending", incidentType: "collision", createdAt: "2026-08-12T10:00:00Z", totalClaimAmount: null, approvedAmount: null, fraudRiskScore: null, fraudRiskLevel: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const detail = await executiveRouter.createCaller(executiveA).getOperationalClaimDetail({ claimId: 77 });
    expect(detail).toMatchObject({ state: "available", claims: [{ id: 77, claimNumber: "AUTH-77", totalClaimAmount: null, fraudRiskScore: null }] });
    expect(detail.workflowHistory).toEqual([]);
    expect(detail.overrideHistory).toEqual([]);
  });

  it("denies an ordinary executive tenant override before the object query", async () => {
    await expect(executiveRouter.createCaller(executiveA).getOperationalClaimDetail({ claimId: 88, tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable state for a foreign or absent authorised claim", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const detail = await executiveRouter.createCaller(executiveA).getOperationalClaimDetail({ claimId: 999 });
    expect(detail).toEqual(expect.objectContaining({ state: "unavailable", claims: [], workflowHistory: [], overrideHistory: [] }));
  });

  it("allows a platform super-admin only after explicit tenant selection and records the selected claim audit", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: 88, claimNumber: "TENANT-B-88", status: "submitted", workflowState: null, incidentType: null, createdAt: null, totalClaimAmount: null, approvedAmount: null, fraudRiskScore: null, fraudRiskLevel: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const detail = await executiveRouter.createCaller(superAdmin).getOperationalClaimDetail({ claimId: 88, tenantId: tenantB });
    expect(detail.state).toBe("available");
    expect(mocks.validate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: tenantB, isCrossTenant: true }), "executive_operational_detail", "88", expect.anything());
  });
});
