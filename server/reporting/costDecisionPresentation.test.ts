import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentation, renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

function cost(overrides: Partial<ReportCostIntegrity> = {}): ReportCostIntegrity {
  return {
    activeQuotes: [
      { repairer: "Repairer A", amountUsd: 4280, currency: "USD", status: "active", sourceReference: "a", statusReason: "Active" },
      { repairer: "Repairer B", amountUsd: 3120, currency: "USD", status: "active", sourceReference: "b", statusReason: "Active" },
    ],
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
      quoteIssue: "No material quote issue identified.",
    });
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: cost(),
      formatAmount: (amount) => `USD ${amount?.toFixed(2) ?? "—"}`,
      escapeHtml: String,
    });
    expect(html).toContain("Submitted Quotations");
    expect(html).toContain("Repairer A");
    expect(html).toContain("KINGA Quote Verification");
    expect(html).toContain("KINGA Optimised Quote");
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
      missingRequiredComponents: ["Front bumper garnish"],
    }));
    expect(presentation.quoteVerification).toBe("SCOPE GAP");
    expect(presentation.optimisedQuoteAmount).toBe(2740);
    expect(presentation.quoteIssue).toBe("Missing submitted price: Front bumper garnish.");
  });

  it("names a concrete quote reconciliation issue rather than inventing a charge or amount", () => {
    const presentation = buildCostDecisionPresentation(cost({
      quoteScopeStatus: "reconciliation_required",
      l2Status: "reconciliation_required",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 2600,
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      quoteReconciliations: [
        { repairer: "Repairer A", quoteId: "a", submittedHeaderTotalUsd: 4280, submittedItemisedTotalUsd: 4000, unexplainedResidualUsd: 280, residualCategory: "source_to_ledger_reconciliation", status: "reconciliation_required" },
      ],
    }));
    expect(presentation.quoteVerification).toBe("RECONCILIATION REQUIRED");
    expect(presentation.quoteIssue).toBe("Repairer A: submitted total requires line-item reconciliation.");
  });
});
