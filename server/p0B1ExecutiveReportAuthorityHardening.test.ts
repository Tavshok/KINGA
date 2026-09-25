import { beforeEach, describe, expect, it, vi } from "vitest";

import { P0_B1_FRAUD_DECISION_HOLD } from "./evidence-governance/p0FraudDecisionHold";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));

import { reportsRouter } from "./routers/reports";

const tenantId = "p0-b1-executive-report-tenant";

const authorizedContext = {
  user: {
    id: 1,
    role: "insurer",
    insurerRole: "insurer_admin",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;

const wrongRoleContext = {
  user: {
    id: 2,
    role: "insurer",
    insurerRole: "claims_processor",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;

const wrongRoleRestrictedAgencyContext = {
  user: {
    id: 3,
    role: "insurer",
    insurerRole: "claims_processor",
    tenantId,
    isUnregisteredClaimant: 1,
  },
  req: { headers: {} },
} as any;

const restrictedAgencyContext = {
  user: {
    id: 4,
    role: "insurer",
    insurerRole: "insurer_admin",
    tenantId,
    isUnregisteredClaimant: 1,
  },
  req: { headers: {} },
} as any;

const tenantlessContext = {
  user: {
    id: 5,
    role: "insurer",
    insurerRole: "insurer_admin",
    tenantId: null,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;

const unauthenticatedContext = {
  user: null,
  req: { headers: {} },
} as any;

describe("P0-B1 executive report authority hardening", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it("denies an unauthenticated caller before report authority, the P0 hold, and database access", async () => {
    await expect(
      reportsRouter
        .createCaller(unauthenticatedContext)
        .generateExecutiveReport({})
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies a caller without the executive report role before the P0 hold and any database access", async () => {
    await expect(
      reportsRouter.createCaller(wrongRoleContext).generateExecutiveReport({})
    ).rejects.toThrow("You do not have access to this report type.");

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("gives report-role denial precedence over agency restriction for a combined wrong-role restricted identity", async () => {
    await expect(
      reportsRouter
        .createCaller(wrongRoleRestrictedAgencyContext)
        .generateExecutiveReport({})
    ).rejects.toThrow("You do not have access to this report type.");

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies an authorized-role restricted agency identity through the report-access guard before tenant authority, the P0 hold, and database access", async () => {
    await expect(
      reportsRouter
        .createCaller(restrictedAgencyContext)
        .generateExecutiveReport({})
    ).rejects.toThrow(
      "A restricted agency-assisted claimant cannot independently perform independent report access."
    );

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("preserves global restricted-agency denial on sibling protected report routes", async () => {
    await expect(
      reportsRouter
        .createCaller(restrictedAgencyContext)
        .generateFinancialSummary({})
    ).rejects.toThrow("restricted to the agency claim workflow");

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies a tenantless report session before the P0 hold and any database access", async () => {
    await expect(
      reportsRouter.createCaller(tenantlessContext).generateExecutiveReport({})
    ).rejects.toThrow("A tenant-scoped session is required");

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies a requested tenant mismatch before the P0 hold and any database access", async () => {
    await expect(
      reportsRouter
        .createCaller(authorizedContext)
        .generateExecutiveReport({ tenantId: "other-tenant" })
    ).rejects.toThrow(
      "Requested tenant does not match the authenticated tenant"
    );

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns the canonical actionable P0 hold only after report role, agency, and tenant authorization complete", async () => {
    await expect(
      reportsRouter
        .createCaller(authorizedContext)
        .generateExecutiveReport({ tenantId })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);

    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
