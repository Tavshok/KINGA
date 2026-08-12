import type { EvidenceFinding, MonetaryEvidence } from "./types";

export type QuoteSourceInput = {
  quoteId: number;
  quoteLineItemId?: number | null;
  sourceDocumentId: number;
  sourcePage: number | null;
  sourceLocation: string | null;
  sourceRowLabel?: string | null;
  sourceText?: string | null;
  description: string;
  canonicalComponent?: string | null;
  financialRole: MonetaryEvidence["financialRole"];
  amountCents: number;
  currency: string;
  taxBasis: MonetaryEvidence["taxBasis"];
  scopeFingerprint?: string | null;
  revisionStatus: MonetaryEvidence["revisionStatus"];
  extractionMethod: MonetaryEvidence["extractionMethod"];
  extractionConfidence?: number | null;
};

/**
 * Creates a monetary evidence candidate without asserting more certainty than
 * the supplied source coordinates permit. Only a precisely locatable document
 * value is marked verified; other recoveries remain reconstructed for review.
 */
export function buildSourceEvidence(input: QuoteSourceInput): MonetaryEvidence {
  const sourceIsPrecise = Boolean(input.sourceDocumentId && input.sourcePage && input.sourceLocation);
  return {
    quoteId: input.quoteId,
    quoteLineItemId: input.quoteLineItemId ?? null,
    sourceDocumentId: input.sourceDocumentId,
    sourcePage: input.sourcePage,
    sourceLocation: input.sourceLocation,
    description: input.description,
    canonicalComponent: input.canonicalComponent ?? null,
    financialRole: input.financialRole,
    amountCents: input.amountCents,
    currency: input.currency,
    taxBasis: input.taxBasis,
    scopeFingerprint: input.scopeFingerprint ?? null,
    revisionStatus: input.revisionStatus,
    evidenceStatus: sourceIsPrecise ? "verified" : "reconstructed",
    extractionMethod: input.extractionMethod,
    extractionConfidence: input.extractionConfidence ?? null,
  };
}

export function buildQuoteReconciliationFinding(input: {
  quoteId: number;
  sourceDocumentId: number;
  sourcePage: number | null;
  sourceLocation: string | null;
  repairer: string;
  sourceTotalCents: number;
  structuredTotalCents: number | null;
  currency: string;
}): EvidenceFinding | null {
  if (input.structuredTotalCents === input.sourceTotalCents) return null;

  const sourceKnown = input.sourceTotalCents > 0;
  const ledgerKnown = input.structuredTotalCents !== null && input.structuredTotalCents > 0;
  const difference = sourceKnown && ledgerKnown
    ? Math.abs(input.sourceTotalCents - input.structuredTotalCents)
    : null;

  return {
    code: "source_to_ledger_mismatch",
    status: sourceKnown && ledgerKnown ? "extraction_defect" : "unresolved",
    severity: "blocking",
    title: "Source-to-ledger quotation mismatch",
    summary: difference === null
      ? `${input.repairer} has incomplete source or structured total evidence; no verified comparison total is available.`
      : `${input.repairer} source quotation and structured record differ by ${(difference / 100).toFixed(2)} ${input.currency}. The structured value is excluded until a documented revision or correction is established.`,
    sourceDocumentId: input.sourceDocumentId,
    sourcePage: input.sourcePage,
    sourceLocation: input.sourceLocation,
    subjectKey: `quote:${input.quoteId}`,
  };
}
