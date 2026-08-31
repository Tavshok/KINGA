import { describe, expect, it } from "vitest";
import { resolveCanonicalClaimReportPresentation } from "./canonicalClaimReportPresentation";

describe("canonical claim report presentation", () => {
  it("uses the shared normalisation priority for renderer fraud, cost, and verdict values", () => {
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

    expect(presentation.claim.fraudScore).toBe(57);
    expect(presentation.report.fraud.score).toBe(57);
    expect(presentation.report.costs.totalUsd).toBe(3980);
    expect(presentation.report.costs.aiEstimateUsd).toBe(4250);
    expect(presentation.report.verdict.verdict).toBe("REVIEW");
  });

  it("parses persisted JSON only at the canonical adapter boundary", () => {
    const presentation = resolveCanonicalClaimReportPresentation({
      estimated_cost: 0,
      fraud_score_breakdown_json: JSON.stringify({ overallScore: 68 }),
      cost_intelligence_json: JSON.stringify({ breakdown: { partsCostCents: 120000, labourCostCents: 80000 } }),
    });

    expect(presentation.report.fraud.score).toBe(68);
    expect(presentation.report.costs.totalUsd).toBe(2000);
  });
});
