import type { EvidenceFinding, MonetaryEvidence } from "./types";

export type ReportEvidencePresentation = {
  readiness: "verified_equivalent" | "reconciliation_required" | "evidence_gap" | "unresolved";
  heading: string;
  boundaryStatement: string;
  evidenceRegister: Array<{
    description: string;
    amountLabel: string;
    sourceLabel: string;
    taxBasis: string;
    statusLabel: string;
  }>;
  reconciliationMatrix: Array<{
    title: string;
    statusLabel: string;
    summary: string;
  }>;
  pricingVarianceReviewSignals: EvidenceFinding[];
};

function labelStatus(status: MonetaryEvidence["evidenceStatus"]): string {
  return status.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function moneyLabel(amountCents: number, currency: string): string {
  return `${currency} ${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildReportEvidencePresentation(
  evidence: MonetaryEvidence[],
  findings: EvidenceFinding[],
): ReportEvidencePresentation {
  const blocking = findings.some((finding) => finding.severity === "blocking");
  const gaps = findings.some((finding) => finding.status === "evidence_gap");
  const unresolved = findings.some((finding) => finding.status === "unresolved" || finding.status === "extraction_defect");
  const readiness = blocking || unresolved
    ? "reconciliation_required"
    : gaps
      ? "evidence_gap"
      : evidence.length > 0 && evidence.every((item) => item.evidenceStatus === "verified" || item.evidenceStatus === "documented_revision")
        ? "verified_equivalent"
        : "unresolved";

  return {
    readiness,
    heading: "Cost Evidence & Comparability",
    boundaryStatement: readiness === "verified_equivalent"
      ? "KINGA compares only equivalent, traceable submitted evidence. Benchmark values remain comparative references and do not replace submitted amounts."
      : "KINGA has identified evidence requiring reconciliation. This section does not create a repair cost, settlement amount, fraud conclusion, or pricing conclusion while the discrepancy remains unresolved.",
    evidenceRegister: evidence.map((item) => ({
      description: item.description,
      amountLabel: moneyLabel(item.amountCents, item.currency),
      sourceLabel: item.sourceDocumentId && item.sourcePage && item.sourceLocation
        ? `Document ${item.sourceDocumentId}, page ${item.sourcePage}, ${item.sourceLocation}`
        : "Source location requires verification",
      taxBasis: labelStatus(item.taxBasis),
      statusLabel: labelStatus(item.evidenceStatus),
    })),
    reconciliationMatrix: findings
      .filter((finding) => finding.code === "source_to_ledger_mismatch" || finding.status === "extraction_defect" || finding.status === "unresolved")
      .map((finding) => ({ title: finding.title, statusLabel: labelStatus(finding.status), summary: finding.summary })),
    pricingVarianceReviewSignals: findings.filter((finding) => finding.status === "pricing_variance_review_signal"),
  };
}
