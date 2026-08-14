import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../client/src/components/ReportSectionThread", () => ({ ReportSectionThread: () => null }));
vi.mock("../../client/src/components/ConfidenceImprovementChecklist", () => ({ ConfidenceImprovementChecklist: () => null }));

import { KingaClaimsReport } from "../../client/src/components/KingaClaimsReport";

const legacyQuotes = [
  { id: 1, quotedAmount: 125000, quoteType: "original", status: "submitted", panelBeaterName: "Alpha", lineItems: [] },
  { id: 2, quotedAmount: 135000, quoteType: "revised", parentQuoteId: 1, status: "submitted", panelBeaterName: "Alpha", lineItems: [] },
  { id: 3, quotedAmount: 140000, quoteType: "original", status: "submitted", panelBeaterName: "Beta", lineItems: [] },
];

describe("AUD-P1-001 executed client top-cost rendering", () => {
  it("renders legacy quote history as qualified evidence and withholds matrix comparison totals", () => {
    const html = renderToStaticMarkup(createElement(KingaClaimsReport, {
      claim: { referenceNumber: "KNG-LEGACY-9911", currencyCode: "USD", status: "submitted" },
      aiAssessment: { costIntelligenceJson: { compositeOptimisation: { l2Status: "incomplete_scope" } } },
      enforcement: {},
      quotes: legacyQuotes,
      claimId: 9911,
    }));

    expect(html).toContain("Legacy quotation history — not active comparison evidence until ledger verification.");
    expect(html).toContain("legacy quotation histories are visible but not comparison evidence until ledger verification");
    expect(html).toContain("No L1, L2, savings, settlement, or KINGA Optimised amount is displayed until ledger verification.");
    expect(html).not.toContain("$1,350.00</strong></td>");
  });
});
