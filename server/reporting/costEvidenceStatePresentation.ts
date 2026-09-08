import type { ReportCostIntegrity } from "./costIntegrity";

export type FormatAmount = (amount: number) => string;

export function renderCostEvidenceStateHtml(input: {
  costIntegrity: ReportCostIntegrity;
  formatAmount: FormatAmount;
  escapeHtml: (value: string) => string;
}): string {
  const { costIntegrity, formatAmount, escapeHtml } = input;
  const rows: Array<[string, string]> = [];
  const submittedTotal = costIntegrity.lowestSubmittedDocumentTotalUsd;
  if (submittedTotal !== null) {
    rows.push(["Lowest submitted document total", `${formatAmount(submittedTotal)} — unreconciled; not L1 decision evidence.`]);
  }
  if (costIntegrity.l1SubmittedCostUsd !== null && costIntegrity.activeQuotes.length > 0) {
    rows.push(["Evidence-qualified L1", formatAmount(costIntegrity.l1SubmittedCostUsd)]);
  }
  if (costIntegrity.l2Status === "complete" && costIntegrity.l2OptimisedCostUsd !== null) {
    rows.push(["Final L2", formatAmount(costIntegrity.l2OptimisedCostUsd)]);
  } else if (costIntegrity.l2Status === "evidence_qualified" && costIntegrity.l2EvidenceQualifiedComparisonUsd !== null) {
    rows.push(["Partial evidence comparison", `${formatAmount(costIntegrity.l2EvidenceQualifiedComparisonUsd)} — not a payable total.`]);
  } else {
    rows.push(["L2 status", costIntegrity.l2Status === "reconciliation_required" ? "Unavailable — reconciliation required." : "Unavailable — reconciliation required."]);
  }
  return `<table class="kv cost-evidence-state"><tbody>${rows.map(([label, value]) => `<tr><td class="k">${escapeHtml(label)}</td><td class="v">${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`;
}
