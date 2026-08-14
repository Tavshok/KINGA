import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";
import { R0_QUOTE_EVIDENCE_FIXTURES } from "./r0QuoteEvidenceFixtures";

describe("Approved R0 same-snapshot top-cost contract acceptance", () => {
  it.each(R0_QUOTE_EVIDENCE_FIXTURES)("projects the approved evidence state for $name without inferred payable amounts", (fixture) => {
    const presentation = buildCostDecisionPresentationContract(fixture.presentationEvidence);
    expect(presentation.quoteVerification).toBe(fixture.expected.verification);
    expect(presentation.optimisedQuoteLabel).toBe("KINGA Optimised Quote");
    expect(presentation.optimisedQuoteAmount).toBe(fixture.expected.presentationAmount);
    expect(presentation.optimisedQuoteState).toBe(fixture.expected.presentationState);
    expect(presentation.optimisedQuoteDetail).toBe(fixture.expected.presentationDetail);
    expect(presentation.quoteIssue).not.toMatch(/labour|VAT|fee|paint|settlement/i);
  });

  it("keeps a concrete reconciliation issue separate from a human-review priced scope", () => {
    const presentation = buildCostDecisionPresentationContract({
      quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: true, unreconciledQuoteCount: 1,
      l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 990, partialPricedScopeUsd: 990, l1SubmittedCostUsd: 1200,
      missingRequiredComponents: [], duplicateQuotesExcluded: 0, reconciliationRepairers: ["Repairer Alpha"],
    });
    expect(presentation).toMatchObject({ quoteVerification: "SCOPE GAP", optimisedQuoteState: "human_review_required", optimisedQuoteAmount: 990, quoteIssue: "Repairer Alpha: submitted total requires line-item reconciliation." });
  });

  it("uses the shared contract in the browser top-cost view and preserves the visible submitted-quotation ledger", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/KingaClaimsReport.tsx"), "utf8");
    expect(source).toContain("buildCostDecisionPresentationContract");
    expect(source).toContain("submittedQuotes.map");
    expect(source).toContain("costDecision.quoteVerificationDetail");
    expect(source).toContain("costDecision.optimisedQuoteDetail");
    expect(source).not.toContain("KINGA computed fair repair cost");
  });
});
