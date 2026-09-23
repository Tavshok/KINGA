import { describe, expect, it } from "vitest";
import { resolveCanonicalClaimReportPresentation } from "./canonicalClaimReportPresentation";

describe("canonical claim report presentation", () => {
  it("withholds historic fraud and verdict values while retaining cost presentation", () => {
    const presentation = resolveCanonicalClaimReportPresentation({
      estimated_cost: 425000,
      fraud_score: 57,
      recommendation: "REVIEW",
      currency_code: "USD",
      fraud_score_breakdown_json: JSON.stringify({ overallScore: 93 }),
      cost_intelligence_json: JSON.stringify({
        documentedOriginalQuoteUsd: 3980,
        costDecision: { recommendation: "APPROVE" },
      }),
    });

    expect(presentation.claim.fraudScore).toBeNull();
    expect(presentation.report.fraud.score).toBeNull();
    expect(presentation.report.costs.totalUsd).toBe(3980);
    expect(presentation.report.costs.aiEstimateUsd).toBe(4250);
    expect(presentation.report.verdict.verdict).not.toBe("REVIEW");
  });

  it("does not parse persisted fraud JSON into canonical presentation", () => {
    const presentation = resolveCanonicalClaimReportPresentation({
      estimated_cost: 0,
      fraud_score_breakdown_json: JSON.stringify({ overallScore: 68 }),
      cost_intelligence_json: JSON.stringify({
        breakdown: { partsCostCents: 120000, labourCostCents: 80000 },
      }),
    });

    expect(presentation.report.fraud.score).toBeNull();
    expect(presentation.report.costs.totalUsd).toBe(2000);
  });
});
