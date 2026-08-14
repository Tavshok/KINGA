import { describe, expect, it } from "vitest";
import { classifyLegacyQuoteEvidenceRows } from "../../shared/legacyQuoteEvidence";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { renderCostDecisionSummaryHtml } from "./costDecisionPresentation";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("AUD-P1-001 — qualified legacy quotation history", () => {
  it("does not invent active comparison evidence for unknown legacy rows", () => {
    const rows = classifyLegacyQuoteEvidenceRows([{ id: 1, panelBeaterName: "Alpha", quotedAmount: 125000 }]);
    expect(rows).toMatchObject([{ status: "legacy_unverified", quoteId: "1" }]);
  });

  it("renders legacy quotation history with a qualification and no L1 fallback", () => {
    const integrity = resolveReportCostIntegrity({}, [{ id: 1, panel_beater_name: "Alpha", quoted_amount: 125000, currency_code: "USD" }]);
    const html = renderCostDecisionSummaryHtml({
      costIntegrity: integrity,
      formatAmount: (amount) => amount === null ? "Not available" : `$${amount.toFixed(2)}`,
      escapeHtml: (value) => String(value),
      repairability: { totalLossIndicated: false, repairToValueRatio: 0.2 },
    });
    expect(html).toContain("Legacy quotation history — not used as active comparison evidence");
    expect(integrity.l1SubmittedCostUsd).toBeNull();
  });

  it("keeps canonical-ledger active evidence unchanged", () => {
    const integrity = resolveReportCostIntegrity({ compositeOptimisation: { canonicalQuoteLedger: [{ panelBeater: "Alpha", totalCostUsd: 1250, status: "active", quoteId: 1 }] } }, []);
    expect(integrity.activeQuotes).toHaveLength(1);
    expect(integrity.submittedQuotes).toHaveLength(1);
    expect(integrity.legacyHistoryQualified).toBe(false);
  });

  it("keeps every CL, CI, FR, and client quote surface on the qualified submitted-history boundary", () => {
    const root = resolve(import.meta.dirname, "../..");
    const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");
    expect(read("server/reporting/claimsIntelligenceReport.ts")).toContain("costIntegrity.submittedQuotes");
    expect(read("server/reporting/forensicDecisionReport.ts")).toContain("costIntegrity.submittedQuotes");
    expect(read("server/reporting/reportDefinitions.ts")).toContain("costIntegrity.submittedQuotes");
    const client = read("client/src/components/KingaClaimsReport.tsx");
    expect(client).toContain("classifyLegacyQuoteEvidenceRows(quotes)");
    expect(client).toContain("legacy quotation histor");
    expect(client).toContain("const matrixQuotes: MatrixQuote[] = comparisonQuotes.map");
  });
});
