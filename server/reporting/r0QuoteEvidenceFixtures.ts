import type { CostDecisionEvidence } from "../../shared/costDecisionPresentation";

export type R0QuoteEvidenceState = "no_quote" | "total_only" | "incomplete_itemised" | "complete_all_in";

export type R0QuoteEvidenceFixture = {
  name: R0QuoteEvidenceState;
  costIntel: Record<string, unknown>;
  dbQuotes: Array<Record<string, unknown>>;
  presentationEvidence: CostDecisionEvidence;
  expected: {
    l2Status: "unavailable" | "evidence_qualified" | "complete";
    quoteReceiptStatus: "no_quotes" | "quotes_received";
    comparisonUsd: number | null;
    presentationAmount: number | null;
    complete: boolean;
    conclusion: "review" | "approved";
    verification: "QUOTATION REQUIRED" | "SCOPE GAP" | "PASSED";
    presentationState: "human_review_required" | "evidence_qualified" | "complete";
    presentationDetail: string;
  };
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

/**
 * Test-only source of truth for all approved R0 quote-evidence states.
 * The frozen values represent immutable report snapshots and must never be
 * reused for production claim persistence or workflow decisions.
 */
export const R0_QUOTE_EVIDENCE_FIXTURES: readonly R0QuoteEvidenceFixture[] = deepFreeze([
  {
    name: "no_quote",
    costIntel: {
      compositeOptimisation: {
        l2Status: "unavailable",
        quoteScopeStatus: "not_evaluated",
        sourceQuotesReceived: 0,
      },
    },
    dbQuotes: [],
    presentationEvidence: {
      quoteReceiptStatus: "no_quotes",
      activeQuoteCount: 0,
      allInReconciliationRequired: false,
      unreconciledQuoteCount: 0,
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      missingRequiredComponents: [],
      duplicateQuotesExcluded: 0,
      reconciliationRepairers: [],
    },
    expected: {
      l2Status: "unavailable",
      quoteReceiptStatus: "no_quotes",
      comparisonUsd: null,
      presentationAmount: null,
      complete: false,
      conclusion: "review",
      verification: "QUOTATION REQUIRED",
      presentationState: "human_review_required",
      presentationDetail: "Human review required — no supported submitted component amount is available. Obtain a repair quotation; KINGA will not invent a cost.",
    },
  },
  {
    name: "total_only",
    costIntel: {
      compositeOptimisation: {
        l2Status: "evidence_qualified",
        quoteScopeStatus: "evidence_qualified",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1240,
        l2EvidenceQualifiedComparisonUsd: 1240,
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1240, currency: "USD", status: "active", quoteId: "q-1" },
          { panelBeater: "Beta", totalCostUsd: 1320, currency: "USD", status: "active", quoteId: "q-2" },
        ],
      },
    },
    dbQuotes: [],
    presentationEvidence: {
      quoteReceiptStatus: "quotes_received",
      activeQuoteCount: 2,
      allInReconciliationRequired: false,
      unreconciledQuoteCount: 0,
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 1240,
      l1SubmittedCostUsd: 1240,
      missingRequiredComponents: [],
      duplicateQuotesExcluded: 0,
      reconciliationRepairers: [],
    },
    expected: {
      l2Status: "evidence_qualified",
      quoteReceiptStatus: "quotes_received",
      comparisonUsd: 1240,
      presentationAmount: null,
      complete: false,
      conclusion: "review",
      verification: "SCOPE GAP",
      presentationState: "human_review_required",
      presentationDetail: "Human review required — no supported submitted component amount is available for the unresolved scope. KINGA will not invent a cost.",
    },
  },
  {
    name: "incomplete_itemised",
    costIntel: {
      compositeOptimisation: {
        l2Status: "evidence_qualified",
        quoteScopeStatus: "incomplete_scope",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1820,
        l2EvidenceQualifiedComparisonUsd: 1480,
        partialPricedScopeUsd: 1480,
        missingRequiredComponents: ["Headlamp alignment"],
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1820, currency: "USD", status: "active", quoteId: "q-3" },
          { panelBeater: "Beta", totalCostUsd: 1980, currency: "USD", status: "active", quoteId: "q-4" },
        ],
      },
    },
    dbQuotes: [],
    presentationEvidence: {
      quoteReceiptStatus: "quotes_received",
      activeQuoteCount: 2,
      allInReconciliationRequired: false,
      unreconciledQuoteCount: 0,
      l2IsComplete: false,
      l2OptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 1480,
      partialPricedScopeUsd: 1480,
      l1SubmittedCostUsd: 1820,
      missingRequiredComponents: ["Headlamp alignment"],
      duplicateQuotesExcluded: 0,
      reconciliationRepairers: [],
    },
    expected: {
      l2Status: "evidence_qualified",
      quoteReceiptStatus: "quotes_received",
      comparisonUsd: 1480,
      presentationAmount: 1480,
      complete: false,
      conclusion: "review",
      verification: "SCOPE GAP",
      presentationState: "human_review_required",
      presentationDetail: "Review-required priced submitted component scope — not all-in. KINGA identifies the unresolved evidence and recommends human review; no missing price is invented.",
    },
  },
  {
    name: "complete_all_in",
    costIntel: {
      compositeOptimisation: {
        isComplete: true,
        l2Status: "complete",
        quoteScopeStatus: "complete",
        sourceQuotesReceived: 2,
        l1LowestSubmittedCostUsd: 1850,
        l2CompositeOptimisedCostUsd: 1725,
        costBasis: "all_in_payable_repair_cost",
        canonicalQuoteLedger: [
          { panelBeater: "Alpha", totalCostUsd: 1850, currency: "USD", status: "active", quoteId: "q-5" },
          { panelBeater: "Beta", totalCostUsd: 1925, currency: "USD", status: "active", quoteId: "q-6" },
          { panelBeater: "Old Beta", totalCostUsd: 1990, currency: "USD", status: "superseded", quoteId: "q-7" },
        ],
      },
    },
    dbQuotes: [],
    presentationEvidence: {
      quoteReceiptStatus: "quotes_received",
      activeQuoteCount: 2,
      allInReconciliationRequired: false,
      unreconciledQuoteCount: 0,
      l2IsComplete: true,
      l2OptimisedCostUsd: 1725,
      l2EvidenceQualifiedComparisonUsd: null,
      missingRequiredComponents: [],
      duplicateQuotesExcluded: 0,
      reconciliationRepairers: [],
    },
    expected: {
      l2Status: "complete",
      quoteReceiptStatus: "quotes_received",
      comparisonUsd: 1725,
      presentationAmount: 1725,
      complete: true,
      conclusion: "approved",
      verification: "PASSED",
      presentationState: "complete",
      presentationDetail: "KINGA insurer cost recommendation.",
    },
  },
]);

export function r0QuoteEvidenceFixture(name: R0QuoteEvidenceState): R0QuoteEvidenceFixture {
  const fixture = R0_QUOTE_EVIDENCE_FIXTURES.find((entry) => entry.name === name);
  if (!fixture) throw new Error(`Unknown R0 quote-evidence fixture: ${name}`);
  return fixture;
}
