import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { P0_B1_FRAUD_DECISION_HOLD } from "../shared/p0FraudDecisionHoldPresentation";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getAiAssessmentByClaimId: vi.fn(),
  createNotification: vi.fn(),
  requireGovernedTenantClaim: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
  getClaimById: vi.fn(),
  updateClaimStatus: vi.fn(),
  createAuditEntry: vi.fn(),
  createNotification: mocks.createNotification,
  triggerAiAssessment: vi.fn(),
  getUsersByInsurerRoles: vi.fn(),
  getActivePipelineCount: vi.fn(),
  getPipelineQueueLength: vi.fn(),
  getAiAssessmentByClaimId: mocks.getAiAssessmentByClaimId,
  getDecisionSnapshots: vi.fn(),
  getLatestSnapshotJson: vi.fn(),
  getQuoteLineItemsByQuoteId: vi.fn(),
  getQuotesByClaimId: vi.fn(),
  saveDecisionSnapshot: vi.fn(),
}));

vi.mock("./services/governedClaimAuthority", () => ({
  requireGovernedTenantClaim: mocks.requireGovernedTenantClaim,
}));

import { aiAssessmentsRouter } from "./routers/ai-assessments-core";

const tenantId = "p0-b1-client-runtime-tenant";
const authorizedContext = {
  user: {
    id: 71,
    role: "insurer",
    insurerRole: "insurer_admin",
    tenantId,
    isUnregisteredClaimant: 0,
  },
  req: { headers: {} },
} as any;

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("P0-B1 client runtime authority hardening", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getAiAssessmentByClaimId.mockReset();
    mocks.createNotification.mockReset();
    mocks.requireGovernedTenantClaim.mockReset();
    mocks.requireGovernedTenantClaim.mockResolvedValue({ tenantId });
  });

  it("checks tenant-owned claim authority before withholding report sharing without database reads or recipient notifications", async () => {
    await expect(
      aiAssessmentsRouter.createCaller(authorizedContext).pushReportToRole({
        claimId: 71,
        targetRole: "claims_processor",
      })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);

    expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
      "71",
      tenantId
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.getAiAssessmentByClaimId).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("does not return the P0 hold until claim authority completes", async () => {
    mocks.requireGovernedTenantClaim.mockRejectedValue(
      new Error("Claim is outside the authenticated tenant")
    );

    await expect(
      aiAssessmentsRouter.createCaller(authorizedContext).pushReportToRole({
        claimId: 72,
        targetRole: "claims_processor",
      })
    ).rejects.toThrow("Claim is outside the authenticated tenant");

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("withholds shared-role lookup after tenant authority without an assessment read", async () => {
    await expect(
      aiAssessmentsRouter
        .createCaller(authorizedContext)
        .getSharedRoles({ claimId: 74 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);

    expect(mocks.requireGovernedTenantClaim).toHaveBeenCalledWith(
      "74",
      tenantId
    );
    expect(mocks.getAiAssessmentByClaimId).not.toHaveBeenCalled();
  });

  it("does not resolve the assessment reader at router module initialization", () => {
    const routerSource = source("server/routers/ai-assessments-core.ts");
    const moduleImports = routerSource.slice(
      0,
      routerSource.indexOf("export const aiAssessmentsRouter")
    );
    const sharedRolesStart = routerSource.indexOf("getSharedRoles:");
    const sharedRolesEnd = routerSource.indexOf(
      "\n  // Get all claims",
      sharedRolesStart
    );
    const sharedRoles = routerSource.slice(sharedRolesStart, sharedRolesEnd);
    const pushReportStart = routerSource.indexOf("pushReportToRole:");
    const pushReportEnd = routerSource.indexOf(
      "\n  // Get which roles",
      pushReportStart
    );
    const pushReport = routerSource.slice(pushReportStart, pushReportEnd);

    expect(moduleImports).not.toMatch(/\bgetAiAssessmentByClaimId\b/);
    expect(sharedRoles.indexOf("throwP0B1FraudDecisionHold")).toBeLessThan(
      sharedRoles.indexOf('await import("../db")')
    );
    expect(pushReport.indexOf("requireGovernedTenantClaim")).toBeLessThan(
      pushReport.indexOf("throwP0B1FraudDecisionHold")
    );
    expect(pushReport.indexOf("throwP0B1FraudDecisionHold")).toBeLessThan(
      pushReport.indexOf('await import("../db")')
    );
    expect(pushReport.indexOf("throwP0B1FraudDecisionHold")).toBeLessThan(
      pushReport.indexOf('await import("../../drizzle/schema")')
    );
    expect(pushReport.indexOf("throwP0B1FraudDecisionHold")).toBeLessThan(
      pushReport.indexOf('await import("drizzle-orm")')
    );
  });

  it("denies an ineligible role before tenant lookup or the P0 hold", async () => {
    const ineligibleContext = {
      ...authorizedContext,
      user: { ...authorizedContext.user, role: "assessor" },
    };

    await expect(
      aiAssessmentsRouter.createCaller(ineligibleContext).pushReportToRole({
        claimId: 73,
        targetRole: "claims_processor",
      })
    ).rejects.toThrow("Only insurer users or platform administrators");

    expect(mocks.requireGovernedTenantClaim).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("routes every confirmed Group A browser read through the shared hold discriminator before legacy rendering", () => {
    const paths = [
      "client/src/components/replay/ReplayResultsTable.tsx",
      "client/src/components/replay/ReplayStatisticsCards.tsx",
      "client/src/pages/AssessorClaimDetails.tsx",
      "client/src/pages/BatchExport.tsx",
      "client/src/pages/admin/LearningDashboard.tsx",
      "client/src/pages/InsurerComparisonView.tsx",
    ];

    for (const file of paths.slice(2)) {
      const text = source(file);
      expect(text, file).toContain("getP0B1FraudDecisionHold");
    }

    const replayResults = source(
      "client/src/components/replay/ReplayResultsTable.tsx"
    );
    expect(replayResults).toContain("getP0B1FraudDecisionHold");
    expect(replayResults).toContain("Replay Results Unavailable");

    const replayStatistics = source(
      "client/src/components/replay/ReplayStatisticsCards.tsx"
    );
    expect(replayStatistics).toContain("getP0B1FraudDecisionHold");
    expect(replayStatistics).toContain("Replay Statistics Unavailable");

    const assessor = source("client/src/pages/AssessorClaimDetails.tsx");
    expect(assessor).toContain("assessmentFraudDecisionHold ?");
    expect(assessor.indexOf("assessmentFraudDecisionHold ?")).toBeLessThan(
      assessor.indexOf("Confidence: {aiAssessment.confidenceScore || 0}%")
    );

    const batch = source("client/src/pages/BatchExport.tsx");
    expect(batch).toContain("isWithheldAssessment");
    expect(batch).toContain("exportableClaims");
    expect(batch).toContain("selectedExportableClaims");
    expect(batch).toMatch(/setSelectedClaims\(\s*currentSelection\s*=>/);
    expect(batch).toContain("checked={selectedExportableClaims.has(claim.id)}");
    expect(batch).toContain("Withheld assessments cannot be exported");

    const learning = source("client/src/pages/admin/LearningDashboard.tsx");
    expect(learning).toContain("Calibration Recommendation Withheld");
    expect(learning).toContain(
      "const hold = getP0B1FraudDecisionHold(result.data)"
    );
    expect(learning).toContain("const hold = getP0B1FraudDecisionHold(result)");

    const comparison = source("client/src/pages/InsurerComparisonView.tsx");
    expect(comparison).toContain("assessmentFraudDecisionHold");
    expect(comparison).toContain("!assessmentFraudDecisionHold");
    expect(comparison).toContain("Boolean(aiAssessmentResponse)");
    expect(comparison).toContain("Automated Fraud Decision Withheld");
  });
});
