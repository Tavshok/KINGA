export type QuoteVerification = "PASSED" | "RECONCILIATION REQUIRED" | "SCOPE GAP" | "QUOTATION REQUIRED";

export type CostDecisionPresentation = {
  quoteVerification: QuoteVerification;
  quoteVerificationDetail: string;
  quoteIssue: string;
  optimisedQuoteLabel: "KINGA Optimised Quote";
  optimisedQuoteAmount: number | null;
  optimisedQuoteState: "complete" | "evidence_qualified" | "pending";
  optimisedQuoteDetail: string;
};

export type CostDecisionEvidence = {
  quoteReceiptStatus: "no_quotes" | "quotes_received";
  activeQuoteCount: number;
  allInReconciliationRequired: boolean;
  unreconciledQuoteCount: number;
  l2IsComplete: boolean;
  l2OptimisedCostUsd: number | null;
  l2EvidenceQualifiedComparisonUsd: number | null;
  missingRequiredComponents: string[];
  duplicateQuotesExcluded: number;
  reconciliationRepairers: string[];
};

function quoteIssue(evidence: CostDecisionEvidence): string {
  if (evidence.quoteReceiptStatus === "no_quotes") return "No submitted repair quotation received.";
  if (evidence.unreconciledQuoteCount > 0) {
    const repairers = evidence.reconciliationRepairers.slice(0, 3);
    return `${repairers.length ? `${repairers.join(", ")}: ` : ""}submitted total requires line-item reconciliation.`;
  }
  if (evidence.missingRequiredComponents.length > 0) {
    return `Missing submitted price: ${evidence.missingRequiredComponents.slice(0, 3).join(", ")}.`;
  }
  if (evidence.duplicateQuotesExcluded > 0) {
    return `${evidence.duplicateQuotesExcluded} duplicate quotation record${evidence.duplicateQuotesExcluded === 1 ? "" : "s"} excluded from comparison.`;
  }
  return "No material quote issue identified.";
}

/**
 * The approved cost-decision sequence shared by report renderers and the top-cost view.
 * It never introduces a benchmark, estimate, tax, labour, fee, paint, or settlement value.
 * A non-complete L2 can remain visible only as evidence-qualified comparison intelligence.
 */
export function buildCostDecisionPresentationContract(evidence: CostDecisionEvidence): CostDecisionPresentation {
  const quoteIssueDetail = quoteIssue(evidence);
  if (evidence.quoteReceiptStatus === "no_quotes") {
    return {
      quoteVerification: "QUOTATION REQUIRED",
      quoteVerificationDetail: "No submitted quotation is available for verification.",
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: null,
      optimisedQuoteState: "pending",
      optimisedQuoteDetail: "Pending submitted quotation evidence.",
    };
  }
  if (evidence.allInReconciliationRequired || evidence.unreconciledQuoteCount > 0) {
    return {
      quoteVerification: "RECONCILIATION REQUIRED",
      quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"}; a submitted total requires reconciliation.`,
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: evidence.l2EvidenceQualifiedComparisonUsd,
      optimisedQuoteState: evidence.l2EvidenceQualifiedComparisonUsd === null ? "pending" : "evidence_qualified",
      optimisedQuoteDetail: "Available comparison retained pending quote reconciliation.",
    };
  }
  if (!evidence.l2IsComplete) {
    return {
      quoteVerification: "SCOPE GAP",
      quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"} verified for available scope.`,
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: evidence.l2EvidenceQualifiedComparisonUsd,
      optimisedQuoteState: evidence.l2EvidenceQualifiedComparisonUsd === null ? "pending" : "evidence_qualified",
      optimisedQuoteDetail: "Available comparison retained pending the identified quote evidence.",
    };
  }
  return {
    quoteVerification: "PASSED",
    quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"} verified; repair scope is complete.`,
    quoteIssue: quoteIssueDetail,
    optimisedQuoteLabel: "KINGA Optimised Quote",
    optimisedQuoteAmount: evidence.l2OptimisedCostUsd,
    optimisedQuoteState: "complete",
    optimisedQuoteDetail: "KINGA insurer cost recommendation.",
  };
}
