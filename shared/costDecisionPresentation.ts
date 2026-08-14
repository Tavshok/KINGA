export type QuoteVerification = "PASSED" | "REVIEW REQUIRED" | "RECONCILIATION REQUIRED" | "SCOPE GAP" | "QUOTATION REQUIRED";

export type CostDecisionPresentation = {
  quoteVerification: QuoteVerification;
  quoteVerificationDetail: string;
  quoteIssue: string;
  optimisedQuoteLabel: "KINGA Optimised Quote";
  optimisedQuoteAmount: number | null;
  optimisedQuoteState: "complete" | "evidence_qualified" | "human_review_required" | "pending";
  optimisedQuoteDetail: string;
  reviewAnchorLabel?: string;
  reviewAnchorAmount?: number | null;
};

export type QuoteQualityIssue = {
  code: string;
  title: string;
  summary: string;
};

/**
 * Retains ordinary source-provenance and extraction-quality findings next to a
 * published L2. These findings require review, but do not create a cost or
 * invalidate eligible submitted component coverage.
 */
export function extractNonBlockingQuoteQualityIssues(composite: unknown): QuoteQualityIssue[] {
  const record = composite && typeof composite === "object" ? composite as Record<string, unknown> : {};
  const governance = record.evidenceGovernance && typeof record.evidenceGovernance === "object"
    ? record.evidenceGovernance as Record<string, unknown>
    : {};
  const findings = Array.isArray(governance.findings) ? governance.findings : [];
  const allowedCodes = new Set(["source_provenance_pending", "line_pricing_not_source_verified"]);
  const seen = new Set<string>();
  return findings
    .filter((finding): finding is Record<string, unknown> => Boolean(finding) && typeof finding === "object")
    .filter((finding) => allowedCodes.has(String(finding.code ?? "")))
    .map((finding): QuoteQualityIssue => ({
      code: String(finding.code ?? "quote_quality_review"),
      title: String(finding.title ?? "Quote quality review"),
      summary: String(finding.summary ?? finding.title ?? "Quote quality requires review."),
    }))
    .filter((finding) => {
      const key = `${finding.code}|${finding.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type CostDecisionEvidence = {
  quoteReceiptStatus: "no_quotes" | "quotes_received";
  activeQuoteCount: number;
  allInReconciliationRequired: boolean;
  unreconciledQuoteCount: number;
  l2IsComplete: boolean;
  l2OptimisedCostUsd: number | null;
  l2EvidenceQualifiedComparisonUsd: number | null;
  partialPricedScopeUsd?: number | null;
  l1SubmittedCostUsd?: number | null;
  missingRequiredComponents: string[];
  duplicateQuotesExcluded: number;
  reconciliationRepairers: string[];
  quoteQualityIssues?: QuoteQualityIssue[];
};

function quoteIssue(evidence: CostDecisionEvidence): string {
  if (evidence.quoteReceiptStatus === "no_quotes") return "No submitted repair quotation received.";
  const issues: string[] = [];
  if (evidence.unreconciledQuoteCount > 0) {
    const repairers = evidence.reconciliationRepairers.slice(0, 3);
    issues.push(`${repairers.length ? `${repairers.join(", ")}: ` : ""}submitted total requires line-item reconciliation.`);
  }
  if (evidence.missingRequiredComponents.length > 0) {
    issues.push(`Missing submitted price: ${evidence.missingRequiredComponents.slice(0, 3).join(", ")}.`);
  }
  if (evidence.duplicateQuotesExcluded > 0) {
    issues.push(`${evidence.duplicateQuotesExcluded} duplicate quotation record${evidence.duplicateQuotesExcluded === 1 ? "" : "s"} excluded from comparison.`);
  }
  for (const issue of evidence.quoteQualityIssues ?? []) {
    if (issue.summary.trim()) issues.push(issue.summary.trim());
    else if (issue.title.trim()) issues.push(issue.title.trim());
  }
  return issues.length > 0 ? Array.from(new Set(issues)).join(" ") : "No material quote issue identified.";
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
      quoteVerificationDetail: "No submitted quotation is available for verification; human quotation review is required.",
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: null,
      optimisedQuoteState: "human_review_required",
      optimisedQuoteDetail: "Human review required — no supported submitted component amount is available. Obtain a repair quotation; KINGA will not invent a cost.",
    };
  }
  if (!evidence.l2IsComplete) {
    const partialScope = evidence.partialPricedScopeUsd ?? null;
    const eligibleWholeQuoteAnchor = evidence.l1SubmittedCostUsd ?? evidence.l2EvidenceQualifiedComparisonUsd ?? null;
    const hasPartialScope = partialScope !== null && partialScope > 0;
    return {
      quoteVerification: "SCOPE GAP",
      quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"} verified for available scope; human review is required for unresolved repair evidence.`,
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: hasPartialScope ? partialScope : null,
      optimisedQuoteState: "human_review_required",
      optimisedQuoteDetail: hasPartialScope
        ? "Review-required priced submitted component scope — not all-in. KINGA identifies the unresolved evidence and recommends human review; no missing price is invented."
        : "Human review required — no supported submitted component amount is available for the unresolved scope. KINGA will not invent a cost.",
      reviewAnchorLabel: eligibleWholeQuoteAnchor !== null && eligibleWholeQuoteAnchor > 0
        ? "Eligible submitted whole-quote anchor (not component-optimised)"
        : undefined,
      reviewAnchorAmount: eligibleWholeQuoteAnchor !== null && eligibleWholeQuoteAnchor > 0
        ? eligibleWholeQuoteAnchor
        : undefined,
    };
  }
  if (evidence.allInReconciliationRequired || evidence.unreconciledQuoteCount > 0) {
    const l2Published = evidence.l2IsComplete && evidence.l2OptimisedCostUsd !== null && evidence.l2OptimisedCostUsd > 0;
    return {
      quoteVerification: "RECONCILIATION REQUIRED",
      quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"}; a submitted total requires reconciliation.`,
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: l2Published ? evidence.l2OptimisedCostUsd : evidence.l2EvidenceQualifiedComparisonUsd,
      optimisedQuoteState: l2Published ? "complete" : evidence.l2EvidenceQualifiedComparisonUsd === null ? "pending" : "evidence_qualified",
      optimisedQuoteDetail: l2Published
        ? "KINGA insurer cost recommendation. Quote reconciliation issue retained separately."
        : "Available comparison retained pending the identified quote evidence.",
    };
  }
  if ((evidence.quoteQualityIssues ?? []).length > 0) {
    return {
      quoteVerification: "REVIEW REQUIRED",
      quoteVerificationDetail: `${evidence.activeQuoteCount} active submitted quotation${evidence.activeQuoteCount === 1 ? "" : "s"}; repair scope is complete and quote-quality findings remain visible for review.`,
      quoteIssue: quoteIssueDetail,
      optimisedQuoteLabel: "KINGA Optimised Quote",
      optimisedQuoteAmount: evidence.l2OptimisedCostUsd,
      optimisedQuoteState: "complete",
      optimisedQuoteDetail: "KINGA insurer cost recommendation. Quote-quality findings retained separately.",
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
