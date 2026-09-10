import { describe, expect, it } from "vitest";
import type { ReportCostIntegrity } from "./costIntegrity";
import type { QuoteEvidence } from "./resolvedReportRecord";
import { renderSharedQuoteEvidencePresentation } from "./sharedQuoteEvidencePresentation";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const activeQuotes = [
  { repairer: "TEST Repairer Alpha", amountUsd: 1_150, currency: "USD", status: "active" as const, sourceReference: "101", statusReason: "Eligible", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible" as const, evidenceEligibilityReason: "Test fixture" },
  { repairer: "TEST Repairer Beta", amountUsd: 1_280, currency: "USD", status: "active" as const, sourceReference: "102", statusReason: "Eligible", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible" as const, evidenceEligibilityReason: "Test fixture" },
  { repairer: "TEST Repairer Gamma", amountUsd: 1_210, currency: "USD", status: "active" as const, sourceReference: "103", statusReason: "Eligible", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible" as const, evidenceEligibilityReason: "Test fixture" },
  { repairer: "TEST Repairer Delta", amountUsd: 1_240, currency: "USD", status: "active" as const, sourceReference: "104", statusReason: "Eligible", workflowStatus: "submitted", evidenceEligibility: "final_l2_eligible" as const, evidenceEligibilityReason: "Test fixture" },
];

const costIntegrity: ReportCostIntegrity = {
  activeQuotes,
  submittedQuotes: activeQuotes,
  historicalQuotes: [],
  legacyHistoryQualified: false,
  sourceQuoteCount: 4,
  quoteReceiptStatus: "quotes_received",
  quoteScopeStatus: "complete",
  l2Status: "complete",
  duplicateQuotesExcluded: 0,
  supersededQuotesExcluded: 0,
  l1SubmittedCostUsd: 1_150,
  l2OptimisedCostUsd: 1_090,
  l2EvidenceQualifiedComparisonUsd: null,
  l2EvidenceCoveragePercent: 100,
  l3BenchmarkReferenceCostUsd: null,
  partialPricedScopeUsd: null,
  l2IsComplete: true,
  missingRequiredComponents: [],
  costBasis: "test_fixture",
  assessorCalibrationCostUsd: null,
  allInReconciliationRequired: false,
  unreconciledQuoteCount: 0,
  quoteQualityIssues: [],
  l2ComponentSelections: [
    { componentName: "Front bumper", selectedCostUsd: 410, selectionMethod: "TEST_CANONICAL_SELECTION", benchmarkP50Usd: null, benchmarkDeviationPct: null, lineItemSpreadPct: null, highLineItemVariance: false, lineItemVarianceRemark: null },
    { componentName: "Headlamp", selectedCostUsd: 210, selectionMethod: "TEST_CANONICAL_SELECTION", benchmarkP50Usd: null, benchmarkDeviationPct: null, lineItemSpreadPct: null, highLineItemVariance: false, lineItemVarianceRemark: null },
  ],
  quoteReconciliations: [],
};

const quoteEvidence: readonly QuoteEvidence[] = [
  { quoteId: 101, panelBeaterName: "TEST Repairer Alpha", quotedAmount: 115_000, currencyCode: "USD", quoteStatus: "submitted", quoteType: "original", parentQuoteId: null, quoteCongruencyScore: null, createdAt: null, lineItems: [{ description: "Front bumper", category: "parts", unitPrice: 450, lineTotal: 450 }] },
  { quoteId: 102, panelBeaterName: "TEST Repairer Beta", quotedAmount: 128_000, currencyCode: "USD", quoteStatus: "submitted", quoteType: "original", parentQuoteId: null, quoteCongruencyScore: null, createdAt: null, lineItems: [{ description: "Front bumper", category: "parts", unitPrice: 420, lineTotal: 420 }, { description: "Headlamp", category: "parts", unitPrice: 220, lineTotal: 220 }] },
  { quoteId: 103, panelBeaterName: "TEST Repairer Gamma", quotedAmount: 121_000, currencyCode: "USD", quoteStatus: "submitted", quoteType: "original", parentQuoteId: null, quoteCongruencyScore: null, createdAt: null, lineItems: [{ description: "Headlamp", category: "parts", unitPrice: 215, lineTotal: 215 }] },
  { quoteId: 104, panelBeaterName: "TEST Repairer Delta", quotedAmount: 124_000, currencyCode: "USD", quoteStatus: "submitted", quoteType: "original", parentQuoteId: null, quoteCongruencyScore: null, createdAt: null, lineItems: [{ description: "Front bumper", category: "parts", unitPrice: 440, lineTotal: 440 }] },
];

describe("Package B shared quote-evidence presentation", () => {
  it("renders a canonical four-repairer active matrix with explicit not-quoted cells, canonical L1/L2, and repeated continuation headers", () => {
    const html = renderSharedQuoteEvidencePresentation({
      costIntegrity,
      quoteEvidence,
      quotePresentation: {
        visibleQuotes: activeQuotes,
        activeComparisonQuotes: activeQuotes,
        visibleQuoteCount: 4,
        activeQuoteCount: 4,
        reportedQuoteCount: 4,
        state: "active_comparison",
        highestActiveQuoteUsd: 1_280,
        lowestActiveQuoteUsd: 1_150,
      },
      escapeHtml,
    });

    expect(html).toContain('data-shared-quote-evidence="active-comparison"');
    expect(html).toContain("TEST Repairer Alpha");
    expect(html).toContain("TEST Repairer Delta");
    expect(html).toContain("Not quoted");
    expect(html).toContain("$1,150.00");
    expect(html).toContain("$1,090.00");
    expect(html).toContain("KINGA Optimised (L2)");
    expect(html).toContain("test canonical selection");
    expect(html).toContain("continuation 2");
    expect(html.match(/<th[^>]*>Component<\/th>/g)).toHaveLength(2);
  });

  it("renders legacy submitted history with its stored reconciliation blocker and withholds comparison, savings, L1, and L2", () => {
    const legacyQuotes = [
      { repairer: "Package A Repairer One", amountUsd: 1_387.50, currency: "USD", status: "legacy_unverified" as const, sourceReference: "201", statusReason: "Historical record only; source total requires reconciliation.", workflowStatus: "submitted", evidenceEligibility: "comparison_only" as const, evidenceEligibilityReason: "Not eligible for active comparison." },
      { repairer: "Package A Repairer Two", amountUsd: 53_000, currency: "ZWL", status: "legacy_unverified" as const, sourceReference: "202", statusReason: "Historical record only; amount requires human verification.", workflowStatus: "submitted", evidenceEligibility: "comparison_only" as const, evidenceEligibilityReason: "Not eligible for active comparison." },
    ];
    const legacyIntegrity: ReportCostIntegrity = {
      ...costIntegrity,
      activeQuotes: [],
      submittedQuotes: legacyQuotes,
      historicalQuotes: [],
      legacyHistoryQualified: true,
      sourceQuoteCount: 2,
      quoteScopeStatus: "reconciliation_required",
      l2Status: "reconciliation_required",
      l1SubmittedCostUsd: null,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      l2EvidenceCoveragePercent: null,
      l2IsComplete: false,
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      missingRequiredComponents: ["Front bumper reinforcement"],
      quoteQualityIssues: [{ code: "line_pricing_not_source_verified", title: "Human verification required", summary: "One or more recorded line prices require human verification." }],
      quoteReconciliations: [{ repairer: "Package A Repairer One", quoteId: "201", submittedHeaderTotalUsd: 1_387.50, submittedItemisedTotalUsd: 1_140, unexplainedResidualUsd: 247.50, residualCategory: "source_to_ledger_reconciliation", status: "reconciliation_required" }],
    };

    const html = renderSharedQuoteEvidencePresentation({
      costIntegrity: legacyIntegrity,
      quoteEvidence: [],
      quotePresentation: {
        visibleQuotes: legacyQuotes,
        activeComparisonQuotes: [],
        visibleQuoteCount: 2,
        activeQuoteCount: 0,
        reportedQuoteCount: 2,
        state: "legacy_history_only",
        highestActiveQuoteUsd: null,
        lowestActiveQuoteUsd: null,
      },
      escapeHtml,
    });

    expect(html).toContain('data-shared-quote-evidence="legacy-history-only"');
    expect(html).toContain("Historical quotation evidence — not a comparison.");
    expect(html).toContain("Package A Repairer One");
    expect(html).toContain("$1,387.50");
    expect(html).toContain("ZWL 53,000.00");
    expect(html).toContain("reconciliation required");
    expect(html).toContain("Recorded unexplained residual: $247.50.");
    expect(html).toContain("One or more recorded line prices require human verification.");
    expect(html).toContain("L1 — lowest eligible submitted quote");
    expect(html).toContain("L2 — KINGA Optimised");
    expect(html).not.toContain('data-shared-quote-evidence-matrix="active"');
    expect(html).not.toContain("Active comparison evidence.");
    expect(html).not.toContain("Savings Opportunity");
  });
});
