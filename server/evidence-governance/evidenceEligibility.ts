import type { EvidenceFinding, EvidenceStatus, MonetaryEvidence, TaxBasis } from "./types";

const L2_ELIGIBLE_STATUSES = new Set<EvidenceStatus>(["verified", "documented_revision"]);

export type L2Eligibility = {
  eligible: boolean;
  reasonCodes: string[];
  findings: EvidenceFinding[];
};

function hasTraceableSource(evidence: MonetaryEvidence): boolean {
  return Boolean(
    evidence.sourceDocumentId
    && evidence.sourcePage
    && evidence.sourceLocation
    && evidence.description.trim()
    && evidence.amountCents > 0
    && evidence.currency.trim(),
  );
}

export function assessL2EvidenceEligibility(
  evidence: MonetaryEvidence,
  expectedScopeFingerprint: string,
  expectedTaxBasis: TaxBasis,
): L2Eligibility {
  const reasonCodes: string[] = [];
  const findings: EvidenceFinding[] = [];

  if (!L2_ELIGIBLE_STATUSES.has(evidence.evidenceStatus)) {
    reasonCodes.push("evidence_status_not_eligible");
    findings.push({
      code: "evidence_status_not_eligible",
      status: evidence.evidenceStatus,
      severity: "blocking",
      title: "Evidence is not eligible for verified L2 comparison",
      summary: `The value is recorded as ${evidence.evidenceStatus.replaceAll("_", " ")}.`,
      sourceDocumentId: evidence.sourceDocumentId,
      sourcePage: evidence.sourcePage,
      sourceLocation: evidence.sourceLocation,
    });
  }

  if (!hasTraceableSource(evidence)) {
    reasonCodes.push("source_provenance_incomplete");
    findings.push({
      code: "source_provenance_incomplete",
      status: "evidence_gap",
      severity: "blocking",
      title: "Source provenance is incomplete",
      summary: "A verified L2 line requires a document, page, location, currency, description, and positive submitted amount.",
      sourceDocumentId: evidence.sourceDocumentId,
      sourcePage: evidence.sourcePage,
      sourceLocation: evidence.sourceLocation,
    });
  }

  if (!evidence.scopeFingerprint || evidence.scopeFingerprint !== expectedScopeFingerprint) {
    reasonCodes.push("scope_not_equivalent");
    findings.push({
      code: "scope_not_equivalent",
      status: "scope_difference",
      severity: "review",
      title: "Repair scope is not established as equivalent",
      summary: "The submitted amount cannot be compared until its repair scope matches the requested comparison scope.",
      sourceDocumentId: evidence.sourceDocumentId,
      sourcePage: evidence.sourcePage,
      sourceLocation: evidence.sourceLocation,
    });
  }

  if (evidence.taxBasis !== expectedTaxBasis) {
    reasonCodes.push("tax_basis_not_equivalent");
    findings.push({
      code: "tax_basis_not_equivalent",
      status: "scope_difference",
      severity: "review",
      title: "Tax basis is not established as equivalent",
      summary: "KINGA will not combine or compare submitted amounts with different tax bases.",
      sourceDocumentId: evidence.sourceDocumentId,
      sourcePage: evidence.sourcePage,
      sourceLocation: evidence.sourceLocation,
    });
  }

  if (evidence.revisionStatus === "superseded" || evidence.revisionStatus === "unknown") {
    reasonCodes.push("revision_not_eligible");
    findings.push({
      code: "revision_not_eligible",
      status: evidence.revisionStatus === "unknown" ? "unresolved" : "documented_revision",
      severity: "blocking",
      title: "Revision status is not eligible for L2",
      summary: "KINGA cannot use a superseded or revision-unknown submitted amount in a verified comparison.",
      sourceDocumentId: evidence.sourceDocumentId,
      sourcePage: evidence.sourcePage,
      sourceLocation: evidence.sourceLocation,
    });
  }

  return { eligible: reasonCodes.length === 0, reasonCodes, findings };
}

export function selectLowestVerifiedEquivalent(
  candidates: MonetaryEvidence[],
  expectedScopeFingerprint: string,
  expectedTaxBasis: TaxBasis,
): { selected: MonetaryEvidence | null; ineligibleFindings: EvidenceFinding[] } {
  const assessed = candidates.map((candidate) => ({
    candidate,
    eligibility: assessL2EvidenceEligibility(candidate, expectedScopeFingerprint, expectedTaxBasis),
  }));
  const eligible = assessed
    .filter(({ eligibility }) => eligibility.eligible)
    .map(({ candidate }) => candidate)
    .sort((left, right) => left.amountCents - right.amountCents);

  return {
    selected: eligible[0] ?? null,
    ineligibleFindings: assessed.flatMap(({ eligibility }) => eligibility.findings),
  };
}
