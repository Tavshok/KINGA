import { describe, expect, it } from "vitest";
import { renderCostEvidenceStateHtml } from "./costEvidenceStatePresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

const base = (): ReportCostIntegrity => ({ activeQuotes: [], submittedQuotes: [], historicalQuotes: [], legacyHistoryQualified: false, sourceQuoteCount: 0, quoteReceiptStatus: "no_quotes", quoteScopeStatus: "not_evaluated", l2Status: "unavailable", duplicateQuotesExcluded: 0, supersededQuotesExcluded: 0, lowestSubmittedDocumentTotalUsd: null, l1SubmittedCostUsd: null, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: null, l2EvidenceCoveragePercent: null, l3BenchmarkReferenceCostUsd: null, partialPricedScopeUsd: null, l2IsComplete: false, missingRequiredComponents: [], costBasis: null, assessorCalibrationCostUsd: null, allInReconciliationRequired: false, unreconciledQuoteCount: 0, quoteQualityIssues: [], quoteReconciliations: [] });
const render = (costIntegrity: ReportCostIntegrity) => renderCostEvidenceStateHtml({ costIntegrity, formatAmount: (amount) => `$${amount}`, escapeHtml: (value) => value });

describe("Package C cost-evidence state presentation", () => {
  it("labels a submitted total as unreconciled rather than L1", () => {
    const state = base(); state.lowestSubmittedDocumentTotalUsd = 120;
    const html = render(state);
    expect(html).toContain("Lowest submitted document total");
    expect(html).toContain("unreconciled; not L1 decision evidence");
    expect(html).not.toContain("Evidence-qualified L1");
  });
  it("renders canonical qualified and unavailable L2 states without a savings figure", () => {
    const complete = base(); complete.activeQuotes = [{ repairer: "A", amountUsd: 100, currency: "USD", status: "active", sourceReference: "1", statusReason: "", workflowStatus: null, evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: null }]; complete.l1SubmittedCostUsd = 100; complete.l2Status = "complete"; complete.l2OptimisedCostUsd = 90;
    expect(render(complete)).toContain("Final L2");
    const partial = base(); partial.l2Status = "evidence_qualified"; partial.l2EvidenceQualifiedComparisonUsd = 80;
    expect(render(partial)).toContain("not a payable total");
    expect(render(base())).toContain("Unavailable — no eligible active comparison evidence is available.");
  });

  it("explains mixed-currency submitted records without inventing a minimum, L1, or L2", () => {
    const state = base();
    state.sourceQuoteCount = 2;
    state.quoteReceiptStatus = "quotes_received";
    state.quoteScopeStatus = "incomplete_scope";
    state.l2Status = "incomplete_scope";
    state.submittedQuotes = [
      { repairer: "A", amountUsd: 100, currency: "USD", status: "legacy_unverified", sourceReference: "1", statusReason: "", workflowStatus: "submitted", evidenceEligibility: "comparison_only", evidenceEligibilityReason: null },
      { repairer: "B", amountUsd: 200, currency: "ZWL", status: "legacy_unverified", sourceReference: "2", statusReason: "", workflowStatus: "submitted", evidenceEligibility: "comparison_only", evidenceEligibilityReason: null },
    ];

    const html = render(state);
    expect(html).toContain("Recorded in USD and ZWL");
    expect(html).toContain("no lowest total, L1, or L2 is calculated across mixed currencies");
    expect(html).toContain("active comparison evidence is incomplete");
    expect(html).not.toContain("Final L2");
  });
});
