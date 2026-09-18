import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import { renderCostEvidenceStateHtml } from "./costEvidenceStatePresentation";
import type { ReportCostIntegrity } from "./costIntegrity";

const root = __dirname;
const reportSources = [
  resolve(root, "reportDefinitions.ts"),
  resolve(root, "claimsIntelligenceReport.ts"),
  resolve(root, "forensicDecisionReport.ts"),
];

function cost(overrides: Partial<ReportCostIntegrity> = {}): ReportCostIntegrity {
  return {
    activeQuotes: [{ repairer: "Repairer Alpha", amountUsd: 1240, currency: "USD", status: "active", sourceReference: "q-1", statusReason: "Active" }],
    submittedQuotes: [{ repairer: "Repairer Alpha", amountUsd: 1240, currency: "USD", status: "active", sourceReference: "q-1", statusReason: "Active" }],
    historicalQuotes: [],
    sourceQuoteCount: 1,
    quoteReceiptStatus: "quotes_received",
    quoteScopeStatus: "complete",
    l2Status: "complete",
    duplicateQuotesExcluded: 0,
    supersededQuotesExcluded: 0,
    lowestSubmittedDocumentTotalUsd: null,
    l1SubmittedCostUsd: 1240,
    l2OptimisedCostUsd: 1160,
    l2EvidenceQualifiedComparisonUsd: null,
    l2EvidenceCoveragePercent: 100,
    l3BenchmarkReferenceCostUsd: 1200,
    partialPricedScopeUsd: null,
    l2IsComplete: true,
    missingRequiredComponents: [],
    costBasis: "submitted_price_composite",
    assessorCalibrationCostUsd: null,
    allInReconciliationRequired: false,
    unreconciledQuoteCount: 0,
    quoteReconciliations: [],
    quoteQualityIssues: [],
    ...overrides,
  } as ReportCostIntegrity;
}

function renderCostSummary(costIntegrity: ReportCostIntegrity): string {
  return renderCostDecisionSummaryHtml({
    costIntegrity,
    formatAmount: (amount) => amount === null ? "Not available" : `USD ${amount.toFixed(2)}`,
    escapeHtml: String,
    repairability: { totalLossIndicated: false, repairToValueRatio: 42 },
  });
}

function renderCostState(costIntegrity: ReportCostIntegrity): string {
  return renderCostEvidenceStateHtml({
    costIntegrity,
    formatAmount: (amount) => `USD ${amount.toFixed(2)}`,
    escapeHtml: String,
  });
}

describe("R1 report cost provenance disclosures", () => {
  it("labels documented assessor cost as calibration-only in CL, CI, and FR", () => {
    for (const path of reportSources) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("Assessor documented cost — calibration reference only");
      expect(source).toContain("not a submitted quote, L2 value");
    }
  });

  it("delegates CL, CI, and FR to the shared cost presentation while retaining current evidence labels", () => {
    for (const path of reportSources) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("renderCostDecisionSummaryHtml");
      expect(source).toContain("renderCostEvidenceStateHtml");
    }
    for (const path of reportSources.slice(0, 2)) {
      expect(readFileSync(path, "utf8")).toContain("resolveReportCostIntegrity");
    }
    const forensicSource = readFileSync(reportSources[2], "utf8");
    const forensicModel = readFileSync(resolve(root, "forensicReportModel.ts"), "utf8");
    expect(forensicSource).toContain("resolveForensicReportModel");
    expect(forensicSource).toContain("forensicModel.executive.costIntegrity");
    expect(forensicModel).toContain("resolveReportCostIntegrity(costIntel, quoteRows)");

    const completeSummary = renderCostSummary(cost());
    const completeState = renderCostState(cost());
    expect(completeSummary).toContain("Submitted Quotations");
    expect(completeSummary).toContain("KINGA Optimised Quote");
    expect(completeSummary).toContain("Potential savings");
    expect(completeState).toContain("Evidence-qualified L1");
    expect(completeState).toContain("Final L2");
    expect(completeState).not.toContain("L3");
  });

  it("withholds L2, savings, and settlement authority for incomplete or unreconciled evidence", () => {
    const incomplete = cost({
      l2Status: "incomplete_scope",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      partialPricedScopeUsd: null,
      missingRequiredComponents: ["Headlamp alignment"],
    });
    const reconciliationRequired = cost({
      l2Status: "reconciliation_required",
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      allInReconciliationRequired: true,
      unreconciledQuoteCount: 1,
      quoteReconciliations: [{ repairer: "Repairer Alpha", status: "reconciliation_required" }],
    });

    expect(renderCostSummary(incomplete)).toContain("Human review required");
    expect(renderCostSummary(incomplete)).not.toContain("Potential savings");
    expect(renderCostState(incomplete)).toContain("no L2 total, savings, or settlement value is shown");
    expect(renderCostState(incomplete)).not.toContain("Final L2");
    expect(renderCostState(reconciliationRequired)).toContain("require reconciliation");
    expect(renderCostState(reconciliationRequired)).not.toContain("Final L2");
  });

  it("uses a recommendation label rather than an asserted settlement agreement in FR", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("Settlement Recommendation");
    expect(source).not.toContain("Settlement Agreed");
  });

  it("quarantines legacy Forensic interpretation cost findings while L2 cannot be published", () => {
    const source = readFileSync(reportSources[2], "utf8");
    expect(source).toContain("const isCostSection");
    expect(source).toContain("isCostSection && kingaOptimised === null");
    expect(source).toContain("cost optimisation unavailable.");
  });
});
