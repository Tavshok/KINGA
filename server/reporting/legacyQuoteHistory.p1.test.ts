import { describe, expect, it } from "vitest";
import { classifyLegacyQuoteEvidenceRows } from "../../shared/legacyQuoteEvidence";
import { resolveReportCostIntegrity } from "./costIntegrity";
import { renderCostDecisionSummaryHtml } from "./costDecisionPresentation";

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
    expect(html).toContain("Historical quotation evidence is retained separately");
    expect(html).toContain("not used as active payable comparison evidence");
    expect(integrity.submittedQuotes).toHaveLength(1);
    expect(integrity.activeQuotes).toHaveLength(0);
    expect(integrity.legacyHistoryQualified).toBe(true);
    expect(integrity.l1SubmittedCostUsd).toBeNull();
  });

  it("keeps canonical-ledger active evidence unchanged", () => {
    const integrity = resolveReportCostIntegrity({ compositeOptimisation: { canonicalQuoteLedger: [{ panelBeater: "Alpha", totalCostUsd: 1250, status: "active", quoteId: 1 }] } }, []);
    expect(integrity.activeQuotes).toHaveLength(1);
    expect(integrity.submittedQuotes).toHaveLength(1);
    expect(integrity.legacyHistoryQualified).toBe(false);
  });
});
