import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCostDecisionPresentationContract } from "../../shared/costDecisionPresentation";

type Fixture = {
  name: "no_quote" | "total_only" | "incomplete_itemised" | "complete_all_in";
  input: Parameters<typeof buildCostDecisionPresentationContract>[0];
  expected: {
    verification: "QUOTATION REQUIRED" | "SCOPE GAP" | "PASSED";
    amount: number | null;
    detail: string;
  };
};

const fixtures: Fixture[] = [
  {
    name: "no_quote",
    input: { quoteReceiptStatus: "no_quotes", activeQuoteCount: 0, allInReconciliationRequired: false, unreconciledQuoteCount: 0, l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: null, missingRequiredComponents: [], duplicateQuotesExcluded: 0, reconciliationRepairers: [] },
    expected: { verification: "QUOTATION REQUIRED", amount: null, detail: "Pending submitted quotation evidence." },
  },
  {
    name: "total_only",
    input: { quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: false, unreconciledQuoteCount: 0, l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 1240, missingRequiredComponents: [], duplicateQuotesExcluded: 0, reconciliationRepairers: [] },
    expected: { verification: "SCOPE GAP", amount: 1240, detail: "Available comparison retained pending the identified quote evidence." },
  },
  {
    name: "incomplete_itemised",
    input: { quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: false, unreconciledQuoteCount: 0, l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 1480, missingRequiredComponents: ["Headlamp alignment"], duplicateQuotesExcluded: 0, reconciliationRepairers: [] },
    expected: { verification: "SCOPE GAP", amount: 1480, detail: "Available comparison retained pending the identified quote evidence." },
  },
  {
    name: "complete_all_in",
    input: { quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: false, unreconciledQuoteCount: 0, l2IsComplete: true, l2OptimisedCostUsd: 1725, l2EvidenceQualifiedComparisonUsd: null, missingRequiredComponents: [], duplicateQuotesExcluded: 0, reconciliationRepairers: [] },
    expected: { verification: "PASSED", amount: 1725, detail: "KINGA insurer cost recommendation." },
  },
];

describe("Approved R0 same-snapshot top-cost contract acceptance", () => {
  it.each(fixtures)("projects the approved evidence state for $name without inferred payable amounts", (fixture) => {
    const presentation = buildCostDecisionPresentationContract(fixture.input);

    expect(presentation.quoteVerification).toBe(fixture.expected.verification);
    expect(presentation.optimisedQuoteLabel).toBe("KINGA Optimised Quote");
    expect(presentation.optimisedQuoteAmount).toBe(fixture.expected.amount);
    expect(presentation.optimisedQuoteDetail).toBe(fixture.expected.detail);
    expect(presentation.quoteIssue).not.toMatch(/labour|VAT|fee|paint|settlement/i);
  });

  it("keeps a concrete reconciliation issue separate from the evidence-qualified comparison amount", () => {
    const presentation = buildCostDecisionPresentationContract({
      quoteReceiptStatus: "quotes_received", activeQuoteCount: 2, allInReconciliationRequired: true, unreconciledQuoteCount: 1,
      l2IsComplete: false, l2OptimisedCostUsd: null, l2EvidenceQualifiedComparisonUsd: 990,
      missingRequiredComponents: [], duplicateQuotesExcluded: 0, reconciliationRepairers: ["Repairer Alpha"],
    });
    expect(presentation).toMatchObject({ quoteVerification: "RECONCILIATION REQUIRED", optimisedQuoteAmount: 990, quoteIssue: "Repairer Alpha: submitted total requires line-item reconciliation." });
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
