import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getClaimById: vi.fn(),
  getQuotesByClaimId: vi.fn(),
  assertRestrictedAgencyAssistedCapability: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getClaimById: mocks.getClaimById,
  getClaimByNumber: vi.fn(),
  getClaimsByClaimant: vi.fn(),
  searchClaimsByIdentifier: vi.fn(),
  getClaimsByAssessor: vi.fn(),
  getClaimsForPanelBeater: vi.fn(),
  createClaim: vi.fn(),
  updateClaimStatus: vi.fn(),
  assignClaimToAssessor: vi.fn(),
  updateClaimPolicyVerification: vi.fn(),
  triggerAiAssessment: vi.fn(),
  getUsersByRole: vi.fn(),
  getUsersByInsurerRoles: vi.fn(),
  getQuotesByClaimId: mocks.getQuotesByClaimId,
  getQuotesByPanelBeater: vi.fn(),
  getQuoteLineItemsByQuoteId: vi.fn(),
  getLatestAcceptedAssessorEvaluation: vi.fn(),
  getAiAssessmentByClaimId: vi.fn(),
  getTenantRates: vi.fn(),
  getPanelBeaterById: vi.fn(),
  getUserById: vi.fn(),
  getActivePipelineCount: vi.fn(),
  getPipelineQueueLength: vi.fn(),
  createAuditEntry: vi.fn(),
  createNotification: vi.fn(),
  emitClaimEvent: vi.fn(),
  checkAssignmentCap: vi.fn(),
  markClaimAssignmentNotification: vi.fn(),
}));

vi.mock("./agency/agencyAssistedClaimantIdentity", () => ({
  assertRestrictedAgencyAssistedCapability:
    mocks.assertRestrictedAgencyAssistedCapability,
}));

import {
  claimsRouter,
  projectP0B1ProcessorQueueRows,
} from "./routers/claims-core";
import {
  projectP0B1ClaimsProcessorStatusRows as projectStatusRows,
  workflowQueriesRouter,
} from "./routers/workflow-queries";

const tenantId = "p0-b1-tier-one-tenant";
const riskManagerContext = {
  user: {
    id: 81,
    role: "insurer",
    insurerRole: "risk_manager",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;
const claimsProcessorContext = {
  user: {
    id: 82,
    role: "insurer",
    insurerRole: "claims_processor",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;
const claimsManagerContext = {
  user: {
    id: 83,
    role: "insurer",
    insurerRole: "claims_manager",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;

describe("P0-B1 first-tier raw fraud boundary", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("removes every raw fraud column from Claims Processor status publication while retaining operational fields", () => {
    const [projection] = projectStatusRows([
      {
        id: 17,
        claimNumber: "P0-CP-17",
        status: "intake_pending",
        workflowState: "intake_queue",
        fraudRiskScore: 91,
        fraudRiskLevel: "critical",
        fraudFlags: '["P0-RAW-FLAG"]',
        earlyFraudSuspicion: 1,
        vehicleRegistration: "P0-CP-REG",
      },
    ]);

    expect(projection).toMatchObject({
      id: 17,
      claimNumber: "P0-CP-17",
      status: "intake_pending",
      workflowState: "intake_queue",
      vehicleRegistration: "P0-CP-REG",
    });
    expect(projection).not.toHaveProperty("fraudRiskScore");
    expect(projection).not.toHaveProperty("fraudRiskLevel");
    expect(projection).not.toHaveProperty("fraudFlags");
    expect(projection).not.toHaveProperty("earlyFraudSuspicion");
    expect(JSON.stringify(projection)).not.toContain("P0-RAW-FLAG");
  });

  it.each(["admin", "platform_super_admin"])(
    "server-projects the Claims Processor status feed for %s before publishing rows",
    async role => {
      const rawRow = {
        id: 31,
        claimNumber: "P0-CP-31",
        status: "intake_pending",
        workflowState: "intake_queue",
        fraudRiskScore: 96,
        fraudRiskLevel: "critical",
        fraudFlags: "P0-CP-RAW-FLAGS",
        earlyFraudSuspicion: 1,
      };
      const countWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
      const rowsOffset = vi.fn().mockResolvedValue([rawRow]);
      const rowsLimit = vi.fn().mockReturnValue({ offset: rowsOffset });
      const rowsOrder = vi.fn().mockReturnValue({ limit: rowsLimit });
      const rowsWhere = vi.fn().mockReturnValue({ orderBy: rowsOrder });
      const db = {
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({ where: countWhere }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({ where: rowsWhere }),
          }),
      };
      mocks.getDb.mockResolvedValue(db);
      const caller = workflowQueriesRouter.createCaller({
        user: {
          id: role === "admin" ? 84 : 85,
          role,
          tenantId,
          insurerRole: null,
        },
        req: { headers: {} },
      } as any);

      const result = await caller.getClaimsByStatus({
        statuses: ["intake_pending"],
      });
      const [published] = result.claims;

      expect(result).toMatchObject({
        total: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });
      expect(published).toMatchObject({
        id: 31,
        claimNumber: "P0-CP-31",
        status: "intake_pending",
        workflowState: "intake_queue",
      });
      expect(published).not.toHaveProperty("fraudRiskScore");
      expect(published).not.toHaveProperty("fraudRiskLevel");
      expect(published).not.toHaveProperty("fraudFlags");
      expect(published).not.toHaveProperty("earlyFraudSuspicion");
      expect(JSON.stringify(result.claims)).not.toContain("P0-CP-RAW-FLAGS");
      expect(rowsOrder).toHaveBeenCalledTimes(1);
      expect(rowsLimit).toHaveBeenCalledWith(100);
      expect(rowsOffset).toHaveBeenCalledWith(0);
    }
  );

  it("keeps the existing processor-queue projection free of raw score and level fields", () => {
    const [projection] = projectP0B1ProcessorQueueRows([
      {
        id: 18,
        createdAt: "2026-09-27T00:00:00.000Z",
        fraudRiskScore: 99,
        fraudRiskLevel: "critical",
        claimNumber: "P0-PQ-18",
      },
    ]);

    expect(projection).toMatchObject({ id: 18, claimNumber: "P0-PQ-18" });
    expect(projection).not.toHaveProperty("fraudRiskScore");
    expect(projection).not.toHaveProperty("fraudRiskLevel");
  });

  it("denies the Risk Manager before any legacy raw route reaches a database handle", async () => {
    const caller = claimsRouter.createCaller(riskManagerContext) as any;

    await expect(
      caller.byStatus({ status: "technical_approval" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.getActiveClaims()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns only the canonical hold from the retired financial queue without a database read", async () => {
    const caller = claimsRouter.createCaller(riskManagerContext) as any;

    await expect(caller.getFinancialDecisionQueue()).resolves.toMatchObject({
      status: "FRAUD_DECISION_WITHHELD",
      actionAllowed: false,
      reviewRequired: true,
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("denies an ineligible approval actor before claim lookup, fraud hold, quotes, or writes", async () => {
    const caller = claimsRouter.createCaller(claimsProcessorContext) as any;

    await expect(
      caller.approveClaim({ claimId: 19, selectedQuoteId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.getClaimById).not.toHaveBeenCalled();
    expect(mocks.getQuotesByClaimId).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("keeps an authorised approval actor behind the canonical hold before quote or database work", async () => {
    mocks.getClaimById.mockResolvedValue({
      id: 20,
      tenantId,
      claimNumber: "P0-AP-20",
    });
    const caller = claimsRouter.createCaller(claimsManagerContext) as any;

    await expect(
      caller.approveClaim({ claimId: 20, selectedQuoteId: 1 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mocks.getClaimById).toHaveBeenCalledWith(20, tenantId);
    expect(mocks.getQuotesByClaimId).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
