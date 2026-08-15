import { buildCostDecisionPresentationContract } from "@shared/costDecisionPresentation";

type RawQuote = Record<string, unknown>;

function parseJson(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function asPositiveAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Produces the Claims Manager cost state from the same persisted Stage 9
 * evidence consumed by CL, CI, FR, and the client top-cost surface. Raw quote
 * rows remain visible, but only canonical active/final-L2-eligible entries can
 * form L1/L2 or a savings conclusion.
 */
export function buildClaimsManagerCostProjection(
  costIntelligenceJson: unknown,
  rawQuotes: RawQuote[] | null | undefined,
) {
  const costIntelligence = parseJson(costIntelligenceJson);
  const composite = costIntelligence?.compositeOptimisation ?? {};
  const ledger = Array.isArray(composite.canonicalQuoteLedger) ? composite.canonicalQuoteLedger as Array<Record<string, any>> : [];
  const eligibleLedger = ledger.filter((entry) => {
    const active = entry?.status === "active" || entry?.status === "supplementary";
    const eligibility = entry?.evidenceEligibility;
    return active && (eligibility === undefined || eligibility === "final_l2_eligible");
  });
  const eligibleQuoteIds = new Set(eligibleLedger
    .map((entry) => entry?.quoteId)
    .filter((quoteId) => quoteId !== null && quoteId !== undefined)
    .map(String));
  const quotes = Array.isArray(rawQuotes) ? rawQuotes : [];
  const eligibleQuotes = quotes.filter((quote) => eligibleQuoteIds.has(String(quote.id)));
  const historyQuotes = quotes.filter((quote) => !eligibleQuoteIds.has(String(quote.id)));
  const complete = composite.isComplete === true && asPositiveAmount(composite.l2CompositeOptimisedCostUsd) !== null;
  const reconciliationRequired = composite.allInReconciliationRequired === true
    || composite.l2Status === "reconciliation_required"
    || composite.quoteScopeStatus === "reconciliation_required";
  const missingRequiredComponents = Array.isArray(composite.missingRequiredComponents)
    ? composite.missingRequiredComponents.map(String)
    : [];
  const l1SubmittedCostUsd = asPositiveAmount(composite.l1LowestSubmittedCostUsd ?? composite.l1SubmittedCostUsd);
  const l2OptimisedCostUsd = complete ? asPositiveAmount(composite.l2CompositeOptimisedCostUsd) : null;
  const costDecision = buildCostDecisionPresentationContract({
    quoteReceiptStatus: eligibleQuotes.length > 0 ? "quotes_received" : "no_quotes",
    activeQuoteCount: eligibleQuotes.length,
    allInReconciliationRequired: reconciliationRequired,
    unreconciledQuoteCount: reconciliationRequired ? 1 : 0,
    l2IsComplete: complete,
    l2OptimisedCostUsd,
    l2EvidenceQualifiedComparisonUsd: asPositiveAmount(composite.l2EvidenceQualifiedComparisonUsd ?? composite.partialPricedScopeUsd),
    partialPricedScopeUsd: asPositiveAmount(composite.partialPricedScopeUsd),
    l1SubmittedCostUsd,
    missingRequiredComponents,
    duplicateQuotesExcluded: Number(composite.duplicateQuotesExcluded ?? 0) || 0,
    quoteQualityIssues: Array.isArray(composite.quoteQualityIssues) ? composite.quoteQualityIssues : [],
    reconciliationRepairers: [],
  });

  return {
    eligibleQuoteIds,
    eligibleQuotes,
    historyQuotes,
    l1SubmittedCostUsd,
    l2OptimisedCostUsd,
    costDecision,
  };
}
