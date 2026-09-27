import { beforeEach, describe, expect, it, vi } from "vitest";
import { P0_B1_FRAUD_DECISION_HOLD } from "../shared/p0FraudDecisionHoldPresentation";

const mocks = vi.hoisted(() => ({
  requireGovernedTenantClaim: vi.fn(),
  getDb: vi.fn(),
  getClaimById: vi.fn(),
  saveDecisionSnapshot: vi.fn(),
  getLatestSnapshotJson: vi.fn(),
  getDecisionSnapshots: vi.fn(),
  getOrCreateLifecycle: vi.fn(),
  isReplayAllowed: vi.fn(),
  saveReplayLog: vi.fn(),
  replayDecision: vi.fn(),
  transitionLifecycle: vi.fn(),
  markAuthoritativeSnapshot: vi.fn(),
  enforceGovernance: vi.fn(),
  getAuditLog: vi.fn(),
  getReplayLogs: vi.fn(),
  createAuditEntry: vi.fn(),
  createNotification: vi.fn(),
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
  getQuotesByClaimId: vi.fn(),
  getQuotesByPanelBeater: vi.fn(),
  getQuoteLineItemsByQuoteId: vi.fn(),
  getLatestAcceptedAssessorEvaluation: vi.fn(),
  getAiAssessmentByClaimId: vi.fn(),
  getTenantRates: vi.fn(),
  getPanelBeaterById: vi.fn(),
  getUserById: vi.fn(),
  getActivePipelineCount: vi.fn(),
  getPipelineQueueLength: vi.fn(),
  createAuditEntry: mocks.createAuditEntry,
  createNotification: mocks.createNotification,
  emitClaimEvent: vi.fn(),
  checkAssignmentCap: vi.fn(),
  markClaimAssignmentNotification: vi.fn(),
  saveDecisionSnapshot: mocks.saveDecisionSnapshot,
  getLatestSnapshotJson: mocks.getLatestSnapshotJson,
  getDecisionSnapshots: mocks.getDecisionSnapshots,
}));

vi.mock("./services/governedClaimAuthority", () => ({
  requireGovernedTenantClaim: mocks.requireGovernedTenantClaim,
}));

vi.mock("./decision-lifecycle", () => ({
  getOrCreateLifecycle: mocks.getOrCreateLifecycle,
  isReplayAllowed: mocks.isReplayAllowed,
  saveReplayLog: mocks.saveReplayLog,
  transitionLifecycle: mocks.transitionLifecycle,
  markAuthoritativeSnapshot: mocks.markAuthoritativeSnapshot,
  getReplayLogs: mocks.getReplayLogs,
}));

vi.mock("./decision-governance", () => ({
  enforceGovernance: mocks.enforceGovernance,
  getAuditLog: mocks.getAuditLog,
}));

vi.mock("./decision-replay", () => ({
  replayDecision: mocks.replayDecision,
}));

vi.mock("./agency/agencyAssistedClaimantIdentity", () => ({
  assertRestrictedAgencyAssistedCapability:
    mocks.assertRestrictedAgencyAssistedCapability,
}));

import { aiAssessmentsRouter } from "./routers/ai-assessments-core";
import { claimsRouter } from "./routers/claims-core";

const tenantId = "p0-b1-bt1-runtime-tenant";
const foreignTenantId = "p0-b1-bt1-foreign-tenant";
const claimId = "101";
const numericClaimId = Number(claimId);

function contextFor(
  sessionTenantId = tenantId,
  overrides: Record<string, unknown> = {}
) {
  return {
    user: {
      id: 71,
      name: "P0 B-T1 Reviewer",
      role: "insurer",
      insurerRole: "insurer_admin",
      tenantId: sessionTenantId,
      isUnregisteredClaimant: 0,
      ...overrides,
    },
    req: { headers: {} },
  } as any;
}

const authorizedContext = contextFor();

const saveSnapshotInput = {
  claimId,
  verdict: {
    decision: "REVIEW_REQUIRED",
    primaryReason: "Independent evidence review is required",
    confidence: 0,
  },
  cost: {
    aiEstimate: 0,
    quoted: 0,
    deviationPercent: 0,
    fairRangeMin: 0,
    fairRangeMax: 0,
    verdict: "REVIEW_REQUIRED",
  },
  fraud: { score: 0, level: "WITHHELD", contributions: [] },
  physics: {
    deltaV: 0,
    velocityRange: "WITHHELD",
    energyKj: 0,
    forceKn: 0,
    estimated: true,
  },
  damage: { zones: [], severity: "unknown", consistencyScore: 0 },
  enforcementTrace: [],
  confidenceBreakdown: [],
  dataQuality: {
    missingFields: ["qualified fraud evidence"],
    estimatedFields: [],
    extractionConfidence: 0,
  },
};

function expectCanonicalHold(result: unknown) {
  expect(result).toMatchObject({
    status: P0_B1_FRAUD_DECISION_HOLD.status,
    reviewRequired: true,
    actionAllowed: false,
    explanation: P0_B1_FRAUD_DECISION_HOLD.explanation,
  });
}

const protectedCapabilitySpies = [
  mocks.getDb,
  mocks.saveDecisionSnapshot,
  mocks.getLatestSnapshotJson,
  mocks.getDecisionSnapshots,
  mocks.getOrCreateLifecycle,
  mocks.isReplayAllowed,
  mocks.saveReplayLog,
  mocks.replayDecision,
  mocks.transitionLifecycle,
  mocks.markAuthoritativeSnapshot,
  mocks.enforceGovernance,
  mocks.getAuditLog,
  mocks.getReplayLogs,
  mocks.createAuditEntry,
  mocks.createNotification,
];

function expectNoProtectedCapabilityCall() {
  for (const capability of protectedCapabilitySpies) {
    expect(capability).not.toHaveBeenCalled();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const decisionActions = [
  {
    name: "saveSnapshot",
    invoke: (caller: any) => caller.saveSnapshot(saveSnapshotInput),
  },
  {
    name: "getLatestSnapshot",
    invoke: (caller: any) => caller.getLatestSnapshot({ claimId }),
  },
  {
    name: "replayDecision",
    invoke: (caller: any) => caller.replayDecision({ claimId }),
  },
  {
    name: "getLifecycle",
    invoke: (caller: any) => caller.getLifecycle({ claimId }),
  },
  {
    name: "markReviewed",
    invoke: (caller: any) =>
      caller.markReviewed({
        claimId,
        reason: "Independent reviewer confirmed the decision record.",
      }),
  },
  {
    name: "finaliseDecision",
    invoke: (caller: any) =>
      caller.finaliseDecision({
        claimId,
        finalDecisionChoice: "REVIEW_REQUIRED",
        reason: "Qualified evidence remains required before finalisation.",
      }),
  },
  {
    name: "lockDecision",
    invoke: (caller: any) =>
      caller.lockDecision({
        claimId,
        reason: "The decision must remain available for manual review.",
      }),
  },
  {
    name: "getAuditLog",
    invoke: (caller: any) => caller.getAuditLog({ claimId }),
  },
  {
    name: "getReplayLogs",
    invoke: (caller: any) => caller.getReplayLogs({ claimId }),
  },
  {
    name: "getSnapshots",
    invoke: (caller: any) => caller.getSnapshots({ claimId }),
  },
] as const;

const governedResourceDenials = [
  {
    name: "missing governed claim",
    sessionTenantId: tenantId,
    message: "Claim not found",
  },
  {
    name: "foreign governed claim",
    sessionTenantId: foreignTenantId,
    message: "Claim is outside the authenticated tenant",
  },
] as const;

describe("P0-B1 B-T1 executable decision-action authority proof", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.requireGovernedTenantClaim.mockResolvedValue({ tenantId });
    mocks.getClaimById.mockResolvedValue({
      id: numericClaimId,
      tenantId,
      claimNumber: "P0-BT1-101",
      workflowState: "financial_decision",
      claimantId: 999,
    });
  });

  for (const action of decisionActions) {
    it(`denies a same-tenant non-governance actor before claim lookup, hold, or protected capability for ${action.name}`, async () => {
      const ineligibleContext = contextFor(tenantId, {
        insurerRole: "claims_processor",
      });
      const caller = aiAssessmentsRouter.createCaller(ineligibleContext) as any;

      await expect(action.invoke(caller)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message:
          "Decision lifecycle access requires one of: insurer_admin, executive, risk_manager, claims_manager",
      });

      expect(mocks.requireGovernedTenantClaim).not.toHaveBeenCalled();
      expectNoProtectedCapabilityCall();
    });

    it(`awaits governed claim authority before returning the canonical hold for authorized ${action.name}`, async () => {
      const authority = deferred<{ tenantId: string }>();
      mocks.requireGovernedTenantClaim.mockReturnValueOnce(authority.promise);
      const caller = aiAssessmentsRouter.createCaller(authorizedContext) as any;
      let settled = false;

      const resultPromise = Promise.resolve(action.invoke(caller));
      resultPromise.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await flushMicrotasks();
      await vi.waitFor(
        () =>
          expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
            claimId,
            tenantId
          ),
        { interval: 1, timeout: 1_000 }
      );

      expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
        claimId,
        tenantId
      );
      expect(settled).toBe(false);
      expectNoProtectedCapabilityCall();

      authority.resolve({ tenantId });
      const result = await resultPromise;

      expectCanonicalHold(result);
      expectNoProtectedCapabilityCall();
    });

    for (const denial of governedResourceDenials) {
      it(`denies ${denial.name} before returning a hold or invoking a protected capability for ${action.name}`, async () => {
        mocks.requireGovernedTenantClaim.mockRejectedValueOnce(
          new Error(denial.message)
        );
        const caller = aiAssessmentsRouter.createCaller(
          contextFor(denial.sessionTenantId)
        ) as any;

        await expect(action.invoke(caller)).rejects.toThrow(denial.message);

        expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
          claimId,
          denial.sessionTenantId
        );
        expectNoProtectedCapabilityCall();
      });
    }
  }

  for (const [name, overrides] of [
    ["insurer administrator", { insurerRole: "insurer_admin" }],
    ["executive", { insurerRole: "executive" }],
    ["risk manager", { insurerRole: "risk_manager" }],
    ["claims manager", { insurerRole: "claims_manager" }],
    ["platform administrator", { role: "admin", insurerRole: null }],
  ] as const) {
    it(`allows the authorized ${name} class to reach the governed hold boundary`, async () => {
      const caller = aiAssessmentsRouter.createCaller(
        contextFor(tenantId, overrides)
      ) as any;

      const result = await caller.getLifecycle({ claimId });

      expectCanonicalHold(result);
      expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
        claimId,
        tenantId
      );
      expectNoProtectedCapabilityCall();
    });
  }

  it("preserves the global restricted-agency denial before decision actor or claim resolution", async () => {
    const restrictedContext = contextFor(tenantId, {
      role: "claimant",
      insurerRole: null,
      isUnregisteredClaimant: 1,
    });
    const caller = aiAssessmentsRouter.createCaller(restrictedContext) as any;

    await expect(caller.getLifecycle({ claimId })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "This agency-assisted claim identity is restricted to the agency claim workflow until it is verified and linked to My Portal.",
    });

    expect(mocks.requireGovernedTenantClaim).not.toHaveBeenCalled();
    expectNoProtectedCapabilityCall();
  });

  it("returns the canonical payment hold after tenant-owned claim validation without a database write, audit, or notification", async () => {
    const caller = claimsRouter.createCaller(authorizedContext) as any;

    const result = await caller.authorizePayment({
      claimId: numericClaimId,
      settlementAmountCents: 125_000,
      notes: "Manual review evidence is pending.",
    });

    expectCanonicalHold(result);
    expect(mocks.assertRestrictedAgencyAssistedCapability).toHaveBeenCalledWith(
      authorizedContext.user,
      "payment_authority"
    );
    expect(mocks.getClaimById).toHaveBeenCalledWith(numericClaimId, tenantId);
    expectNoProtectedCapabilityCall();
  });

  it("denies a missing payment claim before returning a hold or opening the payment database", async () => {
    mocks.getClaimById.mockResolvedValue(null);
    const caller = claimsRouter.createCaller(authorizedContext) as any;

    await expect(
      caller.authorizePayment({ claimId: numericClaimId })
    ).rejects.toThrow("Claim not found");

    expect(mocks.assertRestrictedAgencyAssistedCapability).toHaveBeenCalledWith(
      authorizedContext.user,
      "payment_authority"
    );
    expect(mocks.getClaimById).toHaveBeenCalledWith(numericClaimId, tenantId);
    expectNoProtectedCapabilityCall();
  });

  it("denies a foreign payment claim using the caller tenant before returning a hold or opening the payment database", async () => {
    mocks.getClaimById.mockResolvedValue(null);
    const foreignContext = contextFor(foreignTenantId);
    const caller = claimsRouter.createCaller(foreignContext) as any;

    await expect(
      caller.authorizePayment({ claimId: numericClaimId })
    ).rejects.toThrow("Claim not found");

    expect(mocks.assertRestrictedAgencyAssistedCapability).toHaveBeenCalledWith(
      foreignContext.user,
      "payment_authority"
    );
    expect(mocks.getClaimById).toHaveBeenCalledWith(
      numericClaimId,
      foreignTenantId
    );
    expectNoProtectedCapabilityCall();
  });
});
