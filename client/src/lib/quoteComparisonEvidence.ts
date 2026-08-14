import { classifyLegacyQuoteEvidenceRows, type LegacyQuoteEvidenceRow } from "@shared/legacyQuoteEvidence";

type QuoteRecord = Record<string, unknown>;

function identifier(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Produces the client quote-comparison state from the same evidence rules as the
 * server report fallback. Raw legacy rows remain visible as history but cannot
 * enter matrix comparison, L1, L2, savings, or settlement calculation.
 */
export function resolveQuoteComparisonEvidence(rawQuotes: QuoteRecord[], composite: Record<string, unknown> | null | undefined) {
  const ledger = Array.isArray(composite?.canonicalQuoteLedger) ? composite.canonicalQuoteLedger as Array<Record<string, unknown>> : [];
  const activeIds = new Set(ledger
    .filter((entry) => entry.status === "active" || entry.status === "supplementary")
    .map((entry) => identifier(entry.quoteId))
    .filter(Boolean));
  const legacyHistory: LegacyQuoteEvidenceRow[] = ledger.length === 0 ? classifyLegacyQuoteEvidenceRows(rawQuotes) : [];
  const legacyHistoryQualified = ledger.length === 0 && legacyHistory.some((quote) => quote.status === "legacy_unverified");
  const comparisonQuotes = ledger.length > 0
    ? rawQuotes.filter((quote) => activeIds.has(identifier(quote.id)))
    : [];

  return { comparisonQuotes, legacyHistory, legacyHistoryQualified };
}
