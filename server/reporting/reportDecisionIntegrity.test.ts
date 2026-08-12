import { describe, expect, it } from "vitest";
import { resolveReportDecisionIntegrity } from "./reportDecisionIntegrity";

const incompleteCost = {
  activeQuotes: [],
  sourceQuoteCount: 3,
  quoteReceiptStatus: "quotes_received" as const,
  quoteScopeStatus: "incomplete_scope" as const,
  l2Status: "incomplete_scope" as const,
  duplicateQuotesExcluded: 0,
  supersededQuotesExcluded: 0,
  l1SubmittedCostUsd: 1995.33,
  l2OptimisedCostUsd: null,
  l3BenchmarkReferenceCostUsd: null,
  partialPricedScopeUsd: null,
  l2IsComplete: false,
  missingRequiredComponents: ["itemised repair scope"],
  costBasis: null,
  assessorCalibrationCostUsd: null,
};

describe("resolveReportDecisionIntegrity", () => {
  it("overrides a stale approval when L2 repair scope is incomplete", () => {
    const decision = resolveReportDecisionIntegrity({
      recommendation: "APPROVE",
      workflowState: "technical_approval",
      costIntegrity: incompleteCost,
    });
    expect(decision.status).toBe("REVIEW_REQUIRED");
    expect(decision.chipClass).toBe("review");
    expect(decision.holdReason).toContain("L2");
  });

  it("retains approval only when the all-in L2 contract and workflow are clear", () => {
    const decision = resolveReportDecisionIntegrity({
      recommendation: "APPROVE",
      workflowState: "financial_decision",
      costIntegrity: { ...incompleteCost, l2Status: "complete", quoteScopeStatus: "complete", l2IsComplete: true, l2OptimisedCostUsd: 1800 },
    });
    expect(decision.status).toBe("APPROVED");
  });
});
