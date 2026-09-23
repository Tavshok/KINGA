import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { P0_B1_FRAUD_DECISION_HOLD } from "../shared/p0FraudDecisionHoldPresentation";
import { projectP0B1ClaimReview } from "./routers/claims-core";

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("P0-B1 browser fraud publication containment", () => {
  it("allows Claim Review descriptive claim, assessment, assessor, and quote evidence while removing stored fraud values", () => {
    const review = projectP0B1ClaimReview(
      {
        id: 71,
        claimNumber: "P0B1-BROWSER-71",
        vehicleRegistration: "P0B1-71",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        policyNumber: "POL-71",
        createdAt: "2026-09-23T10:00:00.000Z",
        incidentDate: "2026-09-22",
        incidentType: "collision",
        technicallyApprovedAt: null,
        financiallyApprovedAt: null,
        closedAt: null,
        fraudRiskScore: 97,
        fraudRiskLevel: "high",
        fraudFlags: '["P0B1 forbidden claim flag"]',
      },
      {
        estimatedCost: 1750,
        damageDescription: "Front bumper damage",
        detectedDamageTypes: '["bumper"]',
        fraudIndicators: '["P0B1 forbidden assessment indicator"]',
        fraudScore: 93,
      },
      {
        createdAt: "2026-09-23T11:00:00.000Z",
        damageAssessment: "Replace bumper cover",
        laborCost: 300,
        partsCost: 700,
        estimatedRepairCost: 1000,
        estimatedDuration: 3,
        recommendations: "Request repair quote",
        disagreesWithAi: 0,
        aiDisagreementReason: null,
        fraudRiskLevel: "elevated",
      },
      [
        {
          id: 22,
          panelBeaterName: "Safe Repairer",
          quotedAmount: 1100,
          status: "received",
          createdAt: "2026-09-23T12:00:00.000Z",
          fraudRiskScore: 88,
        },
      ]
    );

    expect(review).toMatchObject({
      claim: {
        id: 71,
        claimNumber: "P0B1-BROWSER-71",
        vehicleRegistration: "P0B1-71",
      },
      aiAssessment: {
        estimatedCost: 1750,
        damageDescription: "Front bumper damage",
      },
      assessorEval: {
        estimatedRepairCost: 1000,
        recommendations: "Request repair quote",
      },
      quotes: [{ id: 22, panelBeaterName: "Safe Repairer", amount: 1100 }],
      fraudDecision: {
        status: "FRAUD_DECISION_WITHHELD",
        requiredEvidence: P0_B1_FRAUD_DECISION_HOLD.requiredEvidence,
      },
    });
    expect(JSON.stringify(review)).not.toMatch(
      /fraudRiskScore|fraudRiskLevel|fraudFlags|fraudIndicators|fraudScore|P0B1 forbidden/
    );
  });

  it("uses a tenant-scoped, field-allowlisted review route instead of four raw data endpoints", () => {
    const claimsCore = source("server/routers/claims-core.ts");
    const dialog = source("client/src/components/ClaimReviewDialog.tsx");
    const reviewRoute = claimsCore.slice(
      claimsCore.indexOf("getReviewView: protectedProcedure"),
      claimsCore.indexOf("// Get single claim by ID")
    );

    expect(reviewRoute).toContain("requireTenantScopedClaim");
    expect(reviewRoute).toContain("getAiAssessmentByClaimId");
    expect(reviewRoute).toContain("getLatestAcceptedAssessorEvaluation");
    expect(reviewRoute).toContain("getQuotesByClaimId");
    expect(reviewRoute).toContain("projectP0B1ClaimReview");
    expect(dialog).toContain("trpc.claims.getReviewView.useQuery");
    expect(dialog).not.toContain("trpc.claims.getById.useQuery");
    expect(dialog).not.toContain("trpc.aiAssessments.byClaim.useQuery");
    expect(dialog).not.toContain("trpc.assessorEvaluations.byClaim.useQuery");
    expect(dialog).not.toContain("trpc.quotes.byClaim.useQuery");
  });

  it("replaces all four Claim Review fraud display locations with the actionable manual-review hold", () => {
    const dialog = source("client/src/components/ClaimReviewDialog.tsx");

    expect(dialog).toContain("P0FraudValidationHold hold={fraudDecision}");
    expect(
      dialog.match(/P0FraudValidationHold hold=\{fraudDecision\}/g) ?? []
    ).toHaveLength(4);
    expect(dialog).not.toMatch(
      /fraudRiskScore|fraudRiskLevel|fraudFlags|fraudIndicators|fraudLevelDisplayLabel|normaliseFraudLevel/
    );
  });

  it("replaces Executive Dashboard alert-bar fraud counts with the actionable manual-review hold", () => {
    const dashboard = source("client/src/pages/ExecutiveDashboard.tsx");
    const alertBar = dashboard.slice(
      dashboard.indexOf("{/* Alert bar */}"),
      dashboard.indexOf("{/* ── TAB CONTENT")
    );

    expect(alertBar).toContain('data-p0-b1-fraud-alert-hold="true"');
    expect(alertBar).toContain(
      "P0FraudValidationHold hold={P0_B1_FRAUD_DECISION_HOLD}"
    );
    expect(alertBar).not.toContain("fraudFlags");
    expect(alertBar).not.toContain("highRisk");

    expect(dashboard).toContain(
      "const slaBreach = kpis?.slaBreachedCount ?? 0;"
    );
    expect(dashboard).not.toContain(
      "const slaBreach = kpis?.slaBreachedCount ?? kpis?.highRiskCount"
    );

    const holdRenderer = source("client/src/components/ValidationGate.tsx");
    expect(holdRenderer).toContain("What is missing:");
    expect(holdRenderer).toContain("What resolves this:");
  });
});
