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
  const submittedCurrencies = Array.from(new Set(
    costIntegrity.submittedQuotes
      .filter((quote) => quote.amountUsd !== null)
      .map((quote) => quote.currency.toUpperCase())
      .filter(Boolean),
  ));
  if (submittedTotal !== null) {
    rows.push(["Lowest submitted document total", `${formatAmount(submittedTotal)} — unreconciled; not L1 decision evidence.`]);
  } else if (costIntegrity.submittedQuotes.length > 0 && submittedCurrencies.length > 1) {
    rows.push([
      "Submitted quotation records",
      `Recorded in ${submittedCurrencies.join(" and ")}; no lowest total, L1, or L2 is calculated across mixed currencies without an approved comparison basis.`,
    ]);
  } else if (costIntegrity.submittedQuotes.length > 0) {
    rows.push([
      "Submitted quotation records",
      "Visible for audit only; canonical active-comparison metadata is required before an L1 decision value can be published.",
    ]);
  }
  if (costIntegrity.l1SubmittedCostUsd !== null && costIntegrity.activeQuotes.length > 0) {
    rows.push(["Evidence-qualified L1", formatAmount(costIntegrity.l1SubmittedCostUsd)]);
  }
  if (costIntegrity.l2Status === "complete" && costIntegrity.l2OptimisedCostUsd !== null) {
    rows.push(["Final L2", formatAmount(costIntegrity.l2OptimisedCostUsd)]);
  } else if (costIntegrity.l2Status === "evidence_qualified" && costIntegrity.l2EvidenceQualifiedComparisonUsd !== null) {
    rows.push(["Partial evidence comparison", `${formatAmount(costIntegrity.l2EvidenceQualifiedComparisonUsd)} — not a payable total.`]);
  } else {
    const l2Message = costIntegrity.l2Status === "reconciliation_required"
      ? "Unavailable — submitted headers and itemised totals require reconciliation."
      : costIntegrity.l2Status === "incomplete_scope"
        ? "Unavailable — active comparison evidence is incomplete; no L2 total, savings, or settlement value is shown."
        : "Unavailable — no eligible active comparison evidence is available.";
    rows.push(["L2 status", l2Message]);
  }
  return `<table class="kv cost-evidence-state"><tbody>${rows.map(([label, value]) => `<tr><td class="k">${escapeHtml(label)}</td><td class="v">${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`;
}
