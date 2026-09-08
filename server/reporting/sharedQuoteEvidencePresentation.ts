/**
 * Shared canonical quotation presentation for the CL, CI and FR report tiers.
 *
 * This module is deliberately presentation-only.  It neither queries data nor
 * recalculates quote eligibility, L1, L2, savings, currency conversion, or
 * component selection.  Those determinations remain the responsibility of the
 * canonical ReportCostIntegrity contract.
 */

import type { ReportCostIntegrity, ReportQuoteEvidencePresentation } from "./costIntegrity";
import type { QuoteEvidence } from "./resolvedReportRecord";

export interface SharedQuoteEvidencePresentationInput {
  costIntegrity: ReportCostIntegrity;
  quoteEvidence: readonly QuoteEvidence[];
  quotePresentation: ReportQuoteEvidencePresentation;
  escapeHtml: (value: unknown) => string;
}

type ActiveQuote = {
  id: string;
  repairer: string;
  amount: number | null;
  currency: string;
  lineItems: readonly QuoteEvidence["lineItems"];
};

type MatrixRow = {
  component: string;
  amounts: Map<string, number | null>;
  l2Amount: number | null;
  l2Method: string | null;
};

const QUOTES_PER_TABLE = 3;

function numericAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalisedComponent(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formattedRecordedAmount(amount: number | null, currency: string): string {
  if (amount === null) return "Amount unavailable";
  const numeric = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency.toUpperCase() === "USD" ? `$${numeric}` : `${currency.toUpperCase()} ${numeric}`;
}

function formattedUsd(amount: number | null): string {
  if (amount === null) return "Not available";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function buildActiveQuotes(
  quotePresentation: ReportQuoteEvidencePresentation,
  quoteEvidence: readonly QuoteEvidence[],
): ActiveQuote[] {
  const evidenceByQuoteId = new Map(quoteEvidence.map((quote) => [String(quote.quoteId), quote]));
  return quotePresentation.activeComparisonQuotes.map((quote) => {
    const evidence = quote.sourceReference === null ? undefined : evidenceByQuoteId.get(quote.sourceReference);
    return {
      id: quote.sourceReference ?? `${quote.repairer}-${quote.currency}`,
      repairer: quote.repairer || "Unnamed repairer",
      amount: quote.amountUsd,
      currency: quote.currency || "USD",
      lineItems: evidence?.lineItems ?? [],
    };
  });
}

function buildMatrixRows(costIntegrity: ReportCostIntegrity, activeQuotes: readonly ActiveQuote[]): MatrixRow[] {
  const rowsByComponent = new Map<string, MatrixRow>();
  const l2ByComponent = new Map(
    (costIntegrity.l2ComponentSelections ?? []).map((selection) => [
      normalisedComponent(selection.componentName),
      selection,
    ]),
  );

  for (const quote of activeQuotes) {
    for (const item of quote.lineItems) {
      const key = normalisedComponent(item.description);
      if (!key) continue;
      const existing = rowsByComponent.get(key);
      const selected = l2ByComponent.get(key);
      const row = existing ?? {
        component: String(item.description ?? "Component").trim(),
        amounts: new Map<string, number | null>(),
        l2Amount: selected?.selectedCostUsd ?? null,
        l2Method: selected?.selectionMethod ?? null,
      };
      row.amounts.set(quote.id, numericAmount(item.lineTotal) ?? numericAmount(item.unitPrice));
      rowsByComponent.set(key, row);
    }
  }

  return Array.from(rowsByComponent.values()).sort((left, right) => left.component.localeCompare(right.component));
}

function activeComparisonTable(
  activeQuotes: readonly ActiveQuote[],
  rows: readonly MatrixRow[],
  includeL2Evidence: boolean,
  escapeHtml: (value: unknown) => string,
): string {
  return chunk(activeQuotes, QUOTES_PER_TABLE).map((quoteGroup, groupIndex) => {
    const continuation = groupIndex === 0 ? "" : ` <span style="font-weight:400;">(continuation ${groupIndex + 1})</span>`;
    return `
<div data-shared-quote-evidence-matrix="active" style="margin-top:${groupIndex === 0 ? "8px" : "14px"};page-break-inside:avoid;">
  <div style="font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 5px;">Eligible quotation comparison${continuation}</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;">
    <thead>
      <tr style="background:#f3f4f6;border-bottom:2px solid #d1d5db;">
        <th style="width:30%;padding:5px 7px;text-align:left;font-size:9px;color:#374151;">Component</th>
        ${quoteGroup.map((quote) => `<th style="padding:5px 7px;text-align:right;font-size:9px;color:#374151;">${escapeHtml(quote.repairer)}<br><span style="font-weight:400;color:#6b7280;">${formattedRecordedAmount(quote.amount, quote.currency)}</span></th>`).join("")}
        ${includeL2Evidence ? '<th style="padding:5px 7px;text-align:right;font-size:9px;color:#17603a;background:#edf7ef;">KINGA L2 evidence</th>' : ""}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:4px 7px;font-weight:600;vertical-align:top;">${escapeHtml(row.component)}</td>
        ${quoteGroup.map((quote) => {
          const amount = row.amounts.get(quote.id) ?? null;
          return `<td style="padding:4px 7px;text-align:right;font-family:monospace;vertical-align:top;${amount === null ? "color:#6b7280;font-style:italic;" : ""}">${amount === null ? "Not quoted" : formattedRecordedAmount(amount, quote.currency)}</td>`;
        }).join("")}
        ${includeL2Evidence ? `<td style="padding:4px 7px;text-align:right;font-family:monospace;vertical-align:top;background:#f5fbf6;color:${row.l2Amount === null ? "#6b7280" : "#17603a"};">${row.l2Amount === null ? "Not available" : formattedUsd(row.l2Amount)}${row.l2Method ? `<br><span style="font-family:inherit;font-size:8px;color:#6b7280;">${escapeHtml(row.l2Method.replaceAll("_", " ").toLowerCase())}</span>` : ""}</td>` : ""}
      </tr>`).join("")}
    </tbody>
    <tfoot>
      <tr style="border-top:2px solid #d1d5db;background:#fafafa;font-weight:700;">
        <td style="padding:5px 7px;">Recorded header total</td>
        ${quoteGroup.map((quote) => `<td style="padding:5px 7px;text-align:right;font-family:monospace;">${formattedRecordedAmount(quote.amount, quote.currency)}</td>`).join("")}
        ${includeL2Evidence ? `<td style="padding:5px 7px;text-align:right;font-family:monospace;background:#edf7ef;color:#17603a;">${formattedUsd(null)}</td>` : ""}
      </tr>
    </tfoot>
  </table>
</div>`;
  }).join("");
}

function knownEvidenceBlockers(costIntegrity: ReportCostIntegrity): string[] {
  const blockers: string[] = [];
  for (const reconciliation of costIntegrity.quoteReconciliations) {
    if (reconciliation.status === "reconciled") continue;
    const residual = reconciliation.unexplainedResidualUsd === null
      ? ""
      : ` Recorded unexplained residual: ${formattedUsd(reconciliation.unexplainedResidualUsd)}.`;
    blockers.push(`${reconciliation.repairer}: ${reconciliation.status.replaceAll("_", " ")}.${residual}`);
  }
  if (costIntegrity.missingRequiredComponents.length > 0) {
    blockers.push(`Missing traceable submitted prices: ${costIntegrity.missingRequiredComponents.join(", ")}.`);
  }
  for (const issue of costIntegrity.quoteQualityIssues) {
    if (issue.summary.trim()) blockers.push(issue.summary.trim());
  }
  return Array.from(new Set(blockers));
}

function legacyHistoryPresentation(
  costIntegrity: ReportCostIntegrity,
  quoteEvidence: readonly QuoteEvidence[],
  quotePresentation: ReportQuoteEvidencePresentation,
  escapeHtml: (value: unknown) => string,
): string {
  const supersededQuoteIds = new Set(
    quoteEvidence
      .filter((quote) => quote.quoteType === "revised" && quote.parentQuoteId !== null)
      .map((quote) => String(quote.parentQuoteId)),
  );
  const visibleQuotes = quotePresentation.visibleQuotes.filter((quote) =>
    quote.sourceReference === null || !supersededQuoteIds.has(quote.sourceReference),
  );
  const blockers = knownEvidenceBlockers(costIntegrity);
  return `
<section data-shared-quote-evidence="legacy-history-only" style="margin-top:10px;page-break-inside:avoid;">
  <div style="padding:7px 10px;background:#fff8e1;border-left:3px solid #b8720b;font-size:10px;color:#6b4f00;"><b>Historical quotation evidence — not a comparison.</b> ${visibleQuotes.length} submitted quotation record${visibleQuotes.length === 1 ? "" : "s"} remain visible for audit. KINGA does not rank these records, derive savings, or publish L1/L2 from this evidence state.</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;table-layout:fixed;">
    <thead><tr style="background:#f5f5f5;border-bottom:2px solid #d9d9d9;"><th style="width:26%;padding:5px 7px;text-align:left;font-size:9px;color:#4a4a4a;">Repairer</th><th style="width:18%;padding:5px 7px;text-align:right;font-size:9px;color:#4a4a4a;">Recorded total</th><th style="width:14%;padding:5px 7px;text-align:left;font-size:9px;color:#4a4a4a;">Currency</th><th style="width:42%;padding:5px 7px;text-align:left;font-size:9px;color:#4a4a4a;">Evidence status</th></tr></thead>
    <tbody>
      ${visibleQuotes.map((quote) => `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:5px 7px;font-weight:600;">${escapeHtml(quote.repairer || "Unnamed repairer")}</td><td style="padding:5px 7px;text-align:right;font-family:monospace;">${formattedRecordedAmount(quote.amountUsd, quote.currency)}</td><td style="padding:5px 7px;">${escapeHtml(quote.currency.toUpperCase())}</td><td style="padding:5px 7px;color:#6b7280;">${escapeHtml(quote.statusReason || quote.evidenceEligibilityReason || "Historical submission; review required before it can support comparison.")}</td></tr>`).join("")}
    </tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">
    <tr style="background:#fafafa;border-top:1px solid #d1d5db;"><td style="padding:5px 7px;font-weight:700;">L1 — lowest eligible submitted quote</td><td style="padding:5px 7px;text-align:right;color:#6b7280;">Not available</td><td style="padding:5px 7px;font-weight:700;">L2 — KINGA Optimised</td><td style="padding:5px 7px;text-align:right;color:#6b7280;">Not available</td></tr>
  </table>
  ${blockers.length > 0 ? `<div style="margin-top:8px;padding:7px 10px;background:#fff8e1;border-left:3px solid #b8720b;font-size:10px;color:#6b4f00;"><b>Evidence review required.</b><ul style="margin:4px 0 0;padding-left:16px;">${blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul></div>` : '<p style="font-size:9px;color:#6b7280;margin:6px 0 0;">No comparison evidence is available. Preserve the submitted documents and obtain traceable, scope-equivalent pricing before comparison.</p>'}
</section>`;
}

function noQuotePresentation(): string {
  return `<section data-shared-quote-evidence="no-quotes" style="margin-top:10px;padding:8px 10px;background:#f5f5f5;border-left:3px solid #8a8a8a;font-size:10px;color:#4a4a4a;"><b>No submitted repair quotation is available.</b> No comparison, savings, L1, or L2 value has been created.</section>`;
}

/**
 * Renders active and historical quote evidence from canonical inputs only.
 */
export function renderSharedQuoteEvidencePresentation({
  costIntegrity,
  quoteEvidence,
  quotePresentation,
  escapeHtml,
}: SharedQuoteEvidencePresentationInput): string {
  const activeQuotes = buildActiveQuotes(quotePresentation, quoteEvidence);
  if (activeQuotes.length === 0) {
    return quotePresentation.state === "legacy_history_only"
      ? legacyHistoryPresentation(costIntegrity, quoteEvidence, quotePresentation, escapeHtml)
      : noQuotePresentation();
  }

  const currencies = new Set(activeQuotes.map((quote) => quote.currency.toUpperCase()));
  if (currencies.size !== 1) {
    return `<div data-shared-quote-evidence-matrix="currency-blocked" style="margin-top:8px;padding:8px 10px;border-left:3px solid #a16207;background:#fffbeb;font-size:10px;color:#713f12;"><b>Comparison withheld.</b> Eligible quotations are recorded in more than one currency. KINGA does not rank, combine, or derive an L1/L2 value across currencies without an approved comparison basis.</div>`;
  }

  const rows = buildMatrixRows(costIntegrity, activeQuotes);
  const includeL2Evidence = (costIntegrity.l2ComponentSelections ?? []).length > 0;
  const l2Total = costIntegrity.l2IsComplete ? costIntegrity.l2OptimisedCostUsd : null;

  return `
<section data-shared-quote-evidence="active-comparison" style="margin-top:10px;page-break-inside:avoid;">
  <div style="padding:7px 10px;background:#edf4ed;border-left:3px solid #3c7844;font-size:10px;color:#1f5130;"><b>Active comparison evidence.</b> ${activeQuotes.length} eligible repair quotation${activeQuotes.length === 1 ? "" : "s"} with a shared ${escapeHtml(Array.from(currencies)[0])} basis. Values below are presented from the canonical quote ledger; missing prices are explicitly marked, not treated as zero.</div>
  ${rows.length > 0
    ? activeComparisonTable(activeQuotes, rows, includeL2Evidence, escapeHtml)
    : '<div style="margin-top:8px;padding:8px 10px;border-left:3px solid #a16207;background:#fffbeb;font-size:10px;color:#713f12;"><b>Line-item comparison unavailable.</b> The active quotation ledger contains no explicit component price rows; no component values have been inferred.</div>'}
  <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">
    <tr style="background:#fafafa;border-top:1px solid #d1d5db;"><td style="padding:5px 7px;font-weight:700;">L1 — lowest eligible submitted quote</td><td style="padding:5px 7px;text-align:right;font-family:monospace;">${formattedUsd(costIntegrity.l1SubmittedCostUsd)}</td><td style="padding:5px 7px;font-weight:700;">L2 — KINGA Optimised</td><td style="padding:5px 7px;text-align:right;font-family:monospace;color:${l2Total === null ? "#6b7280" : "#17603a"};">${formattedUsd(l2Total)}</td></tr>
  </table>
  ${l2Total === null ? '<p style="font-size:9px;color:#6b7280;margin:4px 0 0;">L2 is not shown as a final amount because the canonical cost-integrity gate has not provided a complete optimised total.</p>' : ""}
</section>`;
}
