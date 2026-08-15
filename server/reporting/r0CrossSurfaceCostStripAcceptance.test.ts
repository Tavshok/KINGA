import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";
import { renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

function cost(overrides: Partial<ReportCostIntegrity> = {}): ReportCostIntegrity {
  return {
    activeQuotes: [
      { repairer: "Repairer Alpha", amountUsd: 1240, currency: "USD", status: "active", sourceReference: "q-1", statusReason: "Active" },
      { repairer: "Repairer Beta", amountUsd: 1320, currency: "USD", status: "active", sourceReference: "q-2", statusReason: "Active" },
    ],
    sourceQuoteCount: 2, quoteReceiptStatus: "quotes_received", quoteScopeStatus: "complete", l2Status: "complete",
    duplicateQuotesExcluded: 0, supersededQuotesExcluded: 0, l1SubmittedCostUsd: 1240, l2OptimisedCostUsd: 1160,
    l2EvidenceQualifiedComparisonUsd: null, l2EvidenceCoveragePercent: 100, l3BenchmarkReferenceCostUsd: 1200,
    partialPricedScopeUsd: null, l2IsComplete: true, missingRequiredComponents: [], costBasis: "submitted_price_composite",
    assessorCalibrationCostUsd: null, allInReconciliationRequired: false, unreconciledQuoteCount: 0, quoteReconciliations: [], ...overrides,
  };
}

describe("Approved R0-H/R0-I cross-surface cost-strip acceptance", () => {
  it("renders every active submitted quotation and a complete L2 as a distinct KINGA Optimised Quote", () => {
    const html = renderCostDecisionSummaryHtml({ costIntegrity: cost(), formatAmount: (amount) => `USD ${amount?.toFixed(2)}`, escapeHtml: String, repairability: { totalLossIndicated: false, repairToValueRatio: 42 } });
    expect(html).toContain("Repairer Alpha");
    expect(html).toContain("Repairer Beta");
    expect(html).toContain("KINGA Optimised Quote");
    expect(html).toContain("USD 1160.00");
    expect(html).toContain("Potential savings");
    expect(html).toContain("USD 80.00");
    expect(html).not.toContain("benchmark");
  });

  it("keeps an incomplete L2 visible as a review-required priced scope, never a complete payable quote", () => {
    const presentation = buildCostDecisionPresentationContract({
      quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: false, unreconciledQuoteCount: 0,
      l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 990, partialPricedScopeUsd: 990,
      missingRequiredComponents: ["Headlamp alignment"], duplicateQuotesExcluded: 0, reconciliationRepairers: [],
    });
    expect(presentation).toMatchObject({ optimisedQuoteState: "human_review_required", optimisedQuoteAmount: 990, optimisedQuoteDetail: "Review-required priced submitted component scope — not all-in. KINGA identifies the unresolved evidence and recommends human review; no missing price is invented." });
    const html = renderCostDecisionSummaryHtml({ costIntegrity: cost({ quoteScopeStatus: "incomplete_scope", l2Status: "incomplete_scope", l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 990, partialPricedScopeUsd: 990, missingRequiredComponents: ["Headlamp alignment"] }), formatAmount: (amount) => `USD ${amount?.toFixed(2)}`, escapeHtml: String, repairability: { totalLossIndicated: false, repairToValueRatio: 42 } });
    expect(html).toContain("Review-required priced scope · USD 990.00");
    expect(html).not.toContain("KINGA insurer cost recommendation.");
  });

  it("keeps all CL, CI, FR and client top strips on the active-ledger and typed L2 boundary", () => {
    for (const file of ["server/reporting/reportDefinitions.ts", "server/reporting/claimsIntelligenceReport.ts", "server/reporting/forensicDecisionReport.ts"]) {
      const source = read(file);
      expect(source).toContain("renderCostDecisionSummaryHtml");
      expect(source).toContain("Submitted quotation ledger");
      expect(source).toContain("l2LedgerLabel");
      expect(source).toContain("KINGA Optimised Quote");
    }
    const client = read("client/src/components/KingaClaimsReport.tsx");
    expect(client).toContain("submittedQuotes.map");
    expect(client).toContain("const isReviewRequired = costDecision.optimisedQuoteState === \"human_review_required\"");
    expect(client).toContain("KINGA needs further repair evidence before a complete recommendation.");
    expect(client).toContain("Potential savings");
  });

  it("guards CI and FR savings and settlement conclusions behind a complete KINGA Optimised Quote", () => {
    const ci = read("server/reporting/claimsIntelligenceReport.ts");
    const fr = read("server/reporting/forensicDecisionReport.ts");
    expect(ci).toContain("if (kingaOptimised === null || recommendedSettlement === null)");
    expect(ci).toContain("No savings or settlement figure is calculated from an incomplete L2.");
    expect(fr).toContain("const hasSavings = savings > 0 && kingaOptimised !== null");
    expect(fr).toContain("const recommendedSettlement = kingaOptimised === null");
    expect(fr).toContain("L2 integrity hold");
  });
});
