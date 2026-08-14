import { describe, expect, it } from "vitest";
import { resolveQuoteComparisonEvidence } from "../../client/src/lib/quoteComparisonEvidence";

describe("AUD-P1-001 executed client quote comparison evidence", () => {
  it("keeps unknown legacy quote history out of the comparison matrix", () => {
    const resolved = resolveQuoteComparisonEvidence([{ id: 1, quotedAmount: 125000, panelBeaterName: "Alpha" }], null);
    expect(resolved.legacyHistoryQualified).toBe(true);
    expect(resolved.comparisonQuotes).toEqual([]);
    expect(resolved.legacyHistory).toMatchObject([{ status: "legacy_unverified", quoteId: "1" }]);
  });

  it("excludes a persisted legacy parent superseded by its revision", () => {
    const resolved = resolveQuoteComparisonEvidence([
      { id: 1, quotedAmount: 125000, quoteType: "original" },
      { id: 2, quotedAmount: 135000, quoteType: "revised", parentQuoteId: 1 },
    ], null);
    expect(resolved.legacyHistory.find((quote) => quote.quoteId === "1")?.status).toBe("superseded");
    expect(resolved.legacyHistory.find((quote) => quote.quoteId === "2")?.status).toBe("legacy_unverified");
    expect(resolved.comparisonQuotes).toEqual([]);
  });

  it("admits only canonical active or supplementary IDs into comparison", () => {
    const resolved = resolveQuoteComparisonEvidence([{ id: 1 }, { id: 2 }], {
      canonicalQuoteLedger: [{ quoteId: 1, status: "active" }, { quoteId: 2, status: "duplicate" }],
    });
    expect(resolved.legacyHistoryQualified).toBe(false);
    expect(resolved.comparisonQuotes).toEqual([{ id: 1 }]);
  });
});
