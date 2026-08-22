import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentation, extractExplicitStructuralReviewEvidence, renderCostDecisionSummaryHtml, resolveRepairabilityVerdict } from "./costDecisionPresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

function cost(overrides: Partial<ReportCostIntegrity> = {}): ReportCostIntegrity {
  return {
    activeQuotes: [
      { repairer: "Repairer A", amountUsd: 4280, currency: "USD", status: "active", sourceReference: "a", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." },
      { repairer: "Repairer B", amountUsd: 3120, currency: "USD", status: "active", sourceReference: "b", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." },
    ],
    submittedQuotes: [
      { repairer: "Repairer A", amountUsd: 4280, currency: "USD", status: "active", sourceReference: "a", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." },
      { repairer: "Repairer B", amountUsd: 3120, currency: "USD", status: "active", sourceReference: "b", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." },
    ],
    historicalQuotes: [],
    legacyHistoryQualified: false,
    sourceQuoteCount: 2,
    quoteReceiptStatus: "quotes_received",
    quoteScopeStatus: "complete",
    l2Status: "complete",
    duplicateQuotesExcluded: 0,
    supersededQuotesExcluded: 0,
    l1SubmittedCostUsd: 3120,
    l2OptimisedCostUsd: 2940,
    l2EvidenceQualifiedComparisonUsd: null,
    l2EvidenceCoveragePercent: 100,
    l3BenchmarkReferenceCostUsd: 3000,
    partialPricedScopeUsd: null,
    l2IsComplete: true,
    missingRequiredComponents: [],
    costBasis: "submitted_price_composite",
    assessorCalibrationCostUsd: null,
    allInReconciliationRequired: false,
    unreconciledQuoteCount: 0,
    quoteReconciliations: [
      { repairer: "Repairer A", quoteId: "a", submittedHeaderTotalUsd: 4280, submittedItemisedTotalUsd: 4280, unexplainedResidualUsd: null, residualCategory: null, status: "reconciled" },
      { repairer: "Repairer B", quoteId: "b", submittedHeaderTotalUsd: 3120, submittedItemisedTotalUsd: 3120, unexplainedResidualUsd: null, residualCategory: null, status: "reconciled" },
    ],
    ...overrides,
  };
}

describe("R0 concise cost decision presentation", () => {
  it("presents verified submitted quotations and the complete L2 result as KINGA Optimised Quote without benchmark replacement narrative", () => {
    const presentation = buildCostDecisionPresentation(cost());
    expect(presentation).toMatchObject({
      quoteVerification: "PASSED",
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: 2940,
      potentialSavingsAmount: 180,
      potentialSavingsLabel: "Potential savings",
      quoteIssue: "No material quote issue identified.",
    });
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: cost(),
      formatAmount: (amount) => `USD ${amount?.toFixed(2) ?? "—"}`,
      escapeHtml: String,
      repairability: { totalLossIndicated: false, repairToValueRatio: 42 },
    });
    expect(html).toContain("Submitted Quotations");
    expect(html).toContain("Repairer A");
    expect(html).toContain("KINGA Quote Verification");
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("Potential savings");
    expect(html).toContain("USD 180.00");
    expect(html).toContain("Repairability");
    expect(html).toContain("Repairable");
    expect(html).toContain("USD 2940.00");
    expect(html).not.toContain("3000.00");
    expect(html).not.toContain("benchmark");
  });

  it("names only the concrete missing submitted price when scope is incomplete", () => {
    const presentation = buildCostDecisionPresentation(cost({
      quoteScopeStatus: "incomplete_scope",
      l2Status: "incomplete_scope",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 2740,
      partialPricedScopeUsd: 2740,
      missingRequiredComponents: ["Front bumper garnish"],
    }));
    expect(presentation.quoteVerification).toBe("SCOPE GAP");
    expect(presentation.optimisedQuoteAmount).toBe(2740);
    expect(presentation.optimisedQuoteState).toBe("human_review_required");
    expect(presentation.quoteIssue).toBe("Missing submitted price: Front bumper garnish.");
    expect(presentation.potentialSavingsAmount).toBeNull();
  });

  it("names a concrete quote reconciliation issue without suppressing a complete L2 from submitted component evidence", () => {
    const presentation = buildCostDecisionPresentation(cost({
      quoteScopeStatus: "reconciliation_required",
      l2Status: "complete",
      l2IsComplete: true,
      l2OptimisedCostUsd: 2940,
      l2EvidenceQualifiedComparisonUsd: null,
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      quoteReconciliations: [
        { repairer: "Repairer A", quoteId: "a", submittedHeaderTotalUsd: 4280, submittedItemisedTotalUsd: 4000, unexplainedResidualUsd: 280, residualCategory: "source_to_ledger_reconciliation", status: "reconciliation_required" },
      ],
    }));
    expect(presentation.quoteVerification).toBe("RECONCILIATION REQUIRED");
    expect(presentation.quoteIssue).toBe("Repairer A: submitted total requires line-item reconciliation.");
    expect(presentation).toMatchObject({
      optimisedQuoteAmount: 2940,
      optimisedQuoteState: "complete",
      optimisedQuoteDetail: "KINGA’s fair repair-cost recommendation. Quote verification issue retained separately.",
    });
  });

  it("keeps a complete L2 published while provenance and extraction findings remain visible as Quote Issues", () => {
    const presentation = buildCostDecisionPresentation(cost({
      quoteQualityIssues: [
        { code: "source_provenance_pending", title: "Source provenance pending", summary: "Document and page provenance requires confirmation." },
        { code: "line_pricing_not_source_verified", title: "Extraction review", summary: "One or more submitted line prices require extraction review." },
      ],
    }));
    expect(presentation).toMatchObject({
      quoteVerification: "REVIEW REQUIRED",
      optimisedQuoteAmount: 2940,
      optimisedQuoteState: "complete",
      quoteIssue: "Document and page provenance requires confirmation. One or more submitted line prices require extraction review.",
    });
  });

  it("keeps repairability as a separate evidence-grounded verdict without inventing a threshold", () => {
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 48 }).label).toBe("Repairable");
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: null }).label).toBe("Repairable with conditions");
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 48, structuralReviewRequired: true }).label).toBe("Further structural review required");
    expect(resolveRepairabilityVerdict({ totalLossIndicated: true, repairToValueRatio: 48 }).label).toBe("Total loss indicated");
  });

  it("classifies the 65-70% warning band from the raw ratio when no kingaRecommendation was recorded (legacy claims / JSON parse failures)", () => {
    // repairToValueRatio here is a 0-100 percentage, matching the persisted DB column.
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 67 }).label)
      .toBe("Approaching write-off territory — review required");
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 64 }).label).toBe("Repairable");
    expect(resolveRepairabilityVerdict({ totalLossIndicated: false, repairToValueRatio: 40 }).label).toBe("Repairable");
  });

  it("propagates only explicit persisted structural-review evidence and rationale", () => {
    expect(extractExplicitStructuralReviewEvidence({ structuralReviewRequired: true, structuralReviewRationale: "Front rail alignment measurement is required." }))
      .toEqual({ structuralReviewRequired: true, structuralReviewDetail: "Front rail alignment measurement is required." });
    expect(extractExplicitStructuralReviewEvidence({ structuralGaps: [{ severity: "critical" }] }))
      .toEqual({ structuralReviewRequired: false, structuralReviewDetail: null });
  });

  it("renders comparison-only and ineligible price evidence separately from active payable comparison", () => {
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: cost({
        activeQuotes: [{ repairer: "Eligible Repairs", amountUsd: 1200, currency: "USD", status: "active", sourceReference: "a", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." }],
        submittedQuotes: [{ repairer: "Eligible Repairs", amountUsd: 1200, currency: "USD", status: "active", sourceReference: "a", statusReason: "Active", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Active submitted repair quotation." }],
        historicalQuotes: [
          { repairer: "Withdrawn Repairs", amountUsd: 900, currency: "USD", status: "historical", sourceReference: "w", statusReason: "Withdrawn", workflowStatus: "cancelled", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Withdrawn quotation retained as historical price evidence only." },
          { repairer: "Scope Defect", amountUsd: 1100, currency: "USD", status: "excluded", sourceReference: "s", statusReason: "Unsupported", workflowStatus: "submitted", evidenceEligibility: "ineligible", evidenceEligibilityReason: "Unsupported repair scope." },
        ],
        legacyHistoryQualified: true,
        l2IsComplete: false,
        l2Status: "incomplete_scope",
        l2OptimisedCostUsd: null,
        l2EvidenceQualifiedComparisonUsd: null,
      }),
      formatAmount: (amount) => `USD ${amount?.toFixed(2) ?? "—"}`,
      escapeHtml: String,
      repairability: { totalLossIndicated: false, repairToValueRatio: 42 },
    });
    expect(html).toContain("Historical quotation evidence is retained separately");
    expect(html).toContain("Withdrawn Repairs · USD 900.00 · Withdrawn quotation retained as historical price evidence only.");
    expect(html).toContain("Scope Defect · USD 1100.00 · Unsupported repair scope.");
    expect(html).not.toContain("KINGA Optimised Quote</div><div style=\"margin-top:5px;font-size:16px;font-weight:800;color:#0d5849;\">USD 900.00");
  });

  it("keeps KINGA Optimised Quote visible as human review when every quote is comparison-only or ineligible", () => {
    const noEligibleEvidence = cost({
      activeQuotes: [],
      submittedQuotes: [],
      historicalQuotes: [
        { repairer: "Cancelled Repairs", amountUsd: 900, currency: "USD", status: "historical", sourceReference: "cancelled", statusReason: "Cancelled", workflowStatus: "cancelled", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Cancelled quotation retained as history only." },
        { repairer: "Unsupported Scope", amountUsd: 1200, currency: "USD", status: "excluded", sourceReference: "ineligible", statusReason: "Unsupported", workflowStatus: "submitted", evidenceEligibility: "ineligible", evidenceEligibilityReason: "Unsupported repair scope." },
      ],
      legacyHistoryQualified: true,
      sourceQuoteCount: 2,
      quoteReceiptStatus: "quotes_received",
      quoteScopeStatus: "incomplete_scope",
      l2Status: "incomplete_scope",
      l1SubmittedCostUsd: null,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      partialPricedScopeUsd: null,
      l2IsComplete: false,
      missingRequiredComponents: ["No eligible active submitted component evidence"],
    });
    const presentation = buildCostDecisionPresentation(noEligibleEvidence);
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: noEligibleEvidence,
      formatAmount: (amount) => `USD ${amount?.toFixed(2) ?? "—"}`,
      escapeHtml: String,
      repairability: { totalLossIndicated: false, repairToValueRatio: null },
    });

    expect(presentation.optimisedQuoteState).toBe("human_review_required");
    expect(presentation.optimisedQuoteAmount).toBeNull();
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("Human review required");
    expect(html).toContain("Cancelled Repairs · USD 900.00 · Cancelled quotation retained as history only.");
    expect(html).toContain("Unsupported Scope · USD 1200.00 · Unsupported repair scope.");
    expect(html).not.toContain("USD 900.00</div><div style=\"margin-top:3px;font-size:8px;color:#62726e;line-height:1.35;\">");
  });

  it("renders benchmark-selection and high line-item variance evidence as explanation, not a separate decision", () => {
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: cost({
        l2ComponentSelections: [
          {
            componentName: "Front bumper",
            selectedCostUsd: 100,
            selectionMethod: "BENCHMARK_WITHIN_30_PCT",
            benchmarkP50Usd: 100,
            benchmarkDeviationPct: 10,
            lineItemSpreadPct: 12,
            highLineItemVariance: false,
            lineItemVarianceRemark: null,
          },
          {
            componentName: "Headlamp",
            selectedCostUsd: 120,
            selectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT",
            benchmarkP50Usd: 150,
            benchmarkDeviationPct: 41.7,
            lineItemSpreadPct: 25,
            highLineItemVariance: true,
            lineItemVarianceRemark: "High submitted-price spread; verify like-for-like scope.",
          },
        ],
      }),
      formatAmount: (amount) => `USD ${amount?.toFixed(2) ?? "—"}`,
      escapeHtml: String,
      repairability: { totalLossIndicated: false, repairToValueRatio: 42 },
    });
    expect(html).toContain("L2 Component Validation");
    expect(html).toContain("Front bumper");
    expect(html).toContain("Benchmark selected within 30% · 10.0% variance");
    expect(html).toContain("Outside 30% · lower validated value selected · 41.7% variance");
    expect(html).toContain("High submitted-price spread; verify like-for-like scope.");
  });
});
