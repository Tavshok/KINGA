import type {
  EvidenceGap,
  EvidenceGapCandidate,
  EvidenceFinding,
  HumanVerificationRequest,
  UncertaintyEnvelope,
} from "./types";

function assertGapIsTraceable(gap: EvidenceGap): void {
  if (!gap.sourceDocumentId || !gap.ambiguityDescription.trim()) {
    throw new Error("Evidence gaps require a source document and a specific ambiguity description.");
  }
  for (const candidate of gap.candidates) {
    if (!candidate.rationale.trim() || candidate.confidence < 0 || candidate.confidence > 1) {
      throw new Error("Each candidate reading requires an evidence rationale and confidence from 0 to 1.");
    }
    if (candidate.amountCents !== undefined && candidate.amountCents !== null && candidate.amountCents < 0) {
      throw new Error("Candidate amounts cannot be negative.");
    }
  }
}

/**
 * Produces a neutral evidence-gap finding. Arithmetic residuals remain a
 * separate constraint and are never converted into an observed source amount.
 */
export function buildEvidenceGapFinding(gap: EvidenceGap): EvidenceFinding {
  assertGapIsTraceable(gap);
  const fields = gap.requiredReviewFields.join(", ") || "source row";
  return {
    code: "ambiguous_source_row",
    status: "evidence_gap",
    severity: gap.impact.affectsFinalAllInTotal ? "blocking" : "review",
    title: "Ambiguous submitted source row",
    summary: `${gap.ambiguityDescription} Human verification is required for: ${fields}. ${gap.impact.explanation}`,
    sourceDocumentId: gap.sourceDocumentId,
    sourcePage: gap.sourcePage ?? null,
    sourceLocation: gap.sourceLocation ?? null,
    subjectKey: gap.quoteId ? `quote:${gap.quoteId}` : `claim:${gap.claimId}`,
  };
}

/**
 * Builds a non-payable range only from direct, unselected amount candidates.
 * Missing candidates do not become zero or an inferred value.
 */
export function buildUncertaintyEnvelope(
  verifiedSubtotalCents: number,
  currency: string,
  gaps: EvidenceGap[],
): UncertaintyEnvelope | null {
  const ranges = gaps.map((gap) => {
    const amounts = gap.candidates
      .filter((candidate): candidate is EvidenceGapCandidate & { amountCents: number } =>
        candidate.field === "extended_amount" && typeof candidate.amountCents === "number",
      )
      .map((candidate) => candidate.amountCents);
    return amounts.length > 0 ? { min: Math.min(...amounts), max: Math.max(...amounts) } : null;
  }).filter((range): range is { min: number; max: number } => range !== null);

  if (ranges.length === 0) return null;
  const minimumCandidateExposureCents = ranges.reduce((sum, range) => sum + range.min, 0);
  const maximumCandidateExposureCents = ranges.reduce((sum, range) => sum + range.max, 0);
  return {
    currency,
    verifiedSubtotalCents,
    minimumCandidateExposureCents,
    maximumCandidateExposureCents,
    minimumPossibleSubtotalCents: verifiedSubtotalCents + minimumCandidateExposureCents,
    maximumPossibleSubtotalCents: verifiedSubtotalCents + maximumCandidateExposureCents,
    includedGapCount: ranges.length,
    isPayable: false,
  };
}

export function buildHumanVerificationRequest(gap: EvidenceGap): HumanVerificationRequest {
  assertGapIsTraceable(gap);
  return {
    sourceDocumentId: gap.sourceDocumentId,
    sourcePage: gap.sourcePage ?? null,
    sourceLocation: gap.sourceLocation ?? null,
    fields: gap.requiredReviewFields,
    reason: gap.ambiguityDescription,
    consequence: gap.impact.explanation,
    candidateReadings: gap.candidates,
  };
}
