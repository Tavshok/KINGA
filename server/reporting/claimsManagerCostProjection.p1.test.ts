import { describe, expect, it } from "vitest";
import { buildClaimsManagerCostProjection } from "../../client/src/lib/claimsManagerCostProjection";

describe("AUD-P1-017/018 Claims Manager canonical cost projection", () => {
  it("uses only canonical active final-L2-eligible quotation evidence for L1/L2 while preserving raw exclusions as history", () => {
    const projection = buildClaimsManagerCostProjection({
      compositeOptimisation: {
        isComplete: true,
        l1LowestSubmittedCostUsd: 1200,
        l2CompositeOptimisedCostUsd: 1100,
        canonicalQuoteLedger: [
          { quoteId: 1, status: "cancelled", evidenceEligibility: "comparison_only" },
          { quoteId: 2, status: "active", evidenceEligibility: "final_l2_eligible" },
          { quoteId: 3, status: "active", evidenceEligibility: "ineligible" },
        ],
      },
    }, [
      { id: 1, quotedAmount: 80000, status: "cancelled" },
      { id: 2, quotedAmount: 120000, status: "submitted" },
      { id: 3, quotedAmount: 90000, status: "submitted" },
    ]);

    expect([...projection.eligibleQuoteIds]).toEqual(["2"]);
    expect(projection.eligibleQuotes.map((quote) => quote.id)).toEqual([2]);
    expect(projection.historyQuotes.map((quote) => quote.id)).toEqual([1, 3]);
    expect(projection.l1SubmittedCostUsd).toBe(1200);
    expect(projection.l2OptimisedCostUsd).toBe(1100);
    expect(projection.costDecision.potentialSavingsAmount).toBe(100);
  });
});
