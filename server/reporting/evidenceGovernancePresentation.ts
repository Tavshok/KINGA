import type mysql from "mysql2/promise";

import { renderEvidenceGapIntelligence, type EvidenceGapReportRow } from "./evidenceGapPresentation";

type LedgerRow = {
  quote_id: number | null;
  description: string;
  amount_cents: number;
  currency: string;
  source_document_id: number;
  source_page: number | null;
  source_location: string | null;
  source_row_label: string | null;
  /** Optional forward-compatible normalised label; source row label remains authoritative. */
  canonical_component?: string | null;
  financial_role: string;
  tax_basis: string;
  scope_fingerprint: string | null;
  revision_status: string;
  evidence_status: string;
};

type FindingRow = {
  finding_code: string;
  title: string;
  summary: string | null;
  evidence_status: string;
  severity: string;
  source_document_id: number | null;
  source_page: number | null;
  source_location: string | null;
};

export type EvidenceGovernanceReportData = {
  ledger: LedgerRow[];
  findings: FindingRow[];
  gaps?: EvidenceGapReportRow[];
};

export type ProgressiveL2Comparison = {
  activeSourceRows: number;
  selectedRows: number;
  crossQuoteRows: number;
  totalsByCurrency: Array<{ currency: string; amountCents: number }>;
};

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character] ?? character));
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(amountCents: number, currency: string): string {
  return `${currency} ${(Number(amountCents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function comparisonKey(row: LedgerRow): string {
  const label = (row.canonical_component ?? row.source_row_label ?? row.description)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${row.financial_role}:${label}`;
}

/**
 * Produces evidence-qualified L2 intelligence from explicit submitted rows. It
 * takes the lowest verified row per exact-normalised source label across active
 * quotes only. It never allocates residuals, infers VAT, or publishes an all-in
 * payable repair total.
 */
export function buildProgressiveL2Comparison(
  data: EvidenceGovernanceReportData,
  activeQuoteIds?: Set<string>,
): ProgressiveL2Comparison {
  const candidates = data.ledger.filter((row) => {
    const active = !activeQuoteIds || (row.quote_id !== null && activeQuoteIds.has(String(row.quote_id)));
    const explicitFinancialRow = !["quote_total", "subtotal"].includes(row.financial_role);
    const verified = ["verified", "documented_revision"].includes(row.evidence_status);
    return active && explicitFinancialRow && verified && Number(row.amount_cents) > 0;
  });
  const selected = new Map<string, { row: LedgerRow; quoteIds: Set<string> }>();
  for (const row of candidates) {
    const key = comparisonKey(row);
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, { row, quoteIds: new Set(row.quote_id === null ? [] : [String(row.quote_id)]) });
      continue;
    }
    if (row.quote_id !== null) existing.quoteIds.add(String(row.quote_id));
    if (Number(row.amount_cents) < Number(existing.row.amount_cents)) existing.row = row;
  }
  const totals = new Map<string, number>();
  let crossQuoteRows = 0;
  for (const selection of selected.values()) {
    if (selection.quoteIds.size > 1) crossQuoteRows += 1;
    totals.set(selection.row.currency, (totals.get(selection.row.currency) ?? 0) + Number(selection.row.amount_cents));
  }
  return {
    activeSourceRows: candidates.length,
    selectedRows: selected.size,
    crossQuoteRows,
    totalsByCurrency: [...totals.entries()].map(([currency, amountCents]) => ({ currency, amountCents })),
  };
}

export async function loadEvidenceGovernanceReportData(
  conn: mysql.Connection,
  claimId: number,
  tenantId?: string,
): Promise<EvidenceGovernanceReportData> {
  const tenancy = tenantId ? " AND tenant_id = ?" : "";
  const params = tenantId ? [claimId, tenantId] : [claimId];
  const [ledger] = await conn.execute(
    `SELECT quote_id, description, amount_cents, currency, source_document_id, source_page, source_location,
            source_row_label, financial_role, tax_basis, scope_fingerprint, revision_status, evidence_status
     FROM quote_evidence_ledger
     WHERE claim_id = ?${tenancy}
     ORDER BY quote_id, id`,
    params,
  ) as [LedgerRow[], unknown];
  const [findings] = await conn.execute(
    `SELECT finding_code, title, summary, evidence_status, severity,
            source_document_id, source_page, source_location
     FROM claim_evidence_findings
     WHERE claim_id = ?${tenancy}
     ORDER BY severity DESC, id ASC`,
    params,
  ) as [FindingRow[], unknown];
  const [gaps] = await conn.execute(
    `SELECT quote_id, quote_line_item_id, source_document_id, source_page, source_location, source_crop_ref,
            source_text, observable_characters, ambiguity_description, component_confidence, quantity_confidence,
            unit_price_confidence, extended_amount_confidence, transcription_method, candidate_readings_json,
            arithmetic_residual_cents, currency, impact_json, resolution_status, review_fields_json
     FROM quote_evidence_gaps
     WHERE claim_id = ?${tenancy}
     ORDER BY source_document_id, source_page, id`,
    params,
  ) as [EvidenceGapReportRow[], unknown];
  return { ledger, findings, gaps };
}

/**
 * Neutral report presentation: preserves evidence facts and explicitly
 * separates review signals from fraud, adjustment, settlement, and payment.
 */
export function renderEvidenceGovernancePanel(data: EvidenceGovernanceReportData, activeQuoteIds?: Set<string>): string {
  if (data.ledger.length === 0 && data.findings.length === 0 && (data.gaps?.length ?? 0) === 0) {
    return `<div style="margin-top:10px;padding:7px 10px;background:#f3f7fb;border-left:3px solid #2d5f8b;font-size:10px;color:#294a66;"><b>Cost Evidence &amp; Comparability.</b> No document-backed evidence register has been recorded for this assessment yet. KINGA will not treat legacy ledger values as verified equivalence without source, scope, tax-basis, and revision traceability.</div>`;
  }

  const reviewSignals = data.findings.filter((finding) => finding.evidence_status === "pricing_variance_review_signal");
  const reconciliation = data.findings.filter((finding) => finding.evidence_status !== "pricing_variance_review_signal");
  const comparisonRows = data.ledger.filter((row) => !["quote_total", "subtotal"].includes(row.financial_role));
  const verifiedRows = comparisonRows.filter((row) => ["verified", "documented_revision"].includes(row.evidence_status));
  const coverageLabel = comparisonRows.length > 0
    ? `${verifiedRows.length} of ${comparisonRows.length} explicit source rows verified (${Math.round((verifiedRows.length / comparisonRows.length) * 100)}% evidence coverage)`
    : "No explicit source rows are available for comparison yet";
  const comparisonState = comparisonRows.length > 0 && reconciliation.length === 0 && verifiedRows.length === comparisonRows.length
    ? "Verified comparison basis"
    : "Comparison available — qualification required";
  const progressive = buildProgressiveL2Comparison(data, activeQuoteIds);
  const progressiveSubtotal = progressive.totalsByCurrency
    .map((total) => `${esc(money(total.amountCents, total.currency))} evidence-qualified comparison subtotal`)
    .join(" · ");
  const evidenceGapPanel = renderEvidenceGapIntelligence(data.gaps ?? [], progressive.totalsByCurrency);

  return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #dbe5ee;">
    <div style="font-size:10px;font-weight:700;color:#294a66;text-transform:uppercase;letter-spacing:.45px;margin-bottom:5px;">L2 Evidence Reconciliation</div>
    <div style="font-size:9px;color:#4a5c6b;margin-bottom:4px;">Every explicit submitted component or charge is retained as a separate source-backed row. KINGA does not create, allocate, silently absorb, or replace an amount.</div>
    <div style="margin-bottom:6px;padding:5px 7px;background:#f3f7fb;border-left:3px solid #2d5f8b;font-size:9px;color:#294a66;"><b>${esc(comparisonState)}.</b> ${esc(coverageLabel)}. L2 intelligence remains available while exceptions are reconciled.</div>
    ${progressive.selectedRows > 0 ? `<div style="margin-bottom:7px;padding:5px 7px;background:#f7faf7;border-left:3px solid #3c7844;font-size:9px;color:#294a66;"><b>Evidence-qualified submitted-price L2 comparison.</b> ${progressive.selectedRows} exact-normalised source row(s) selected from ${progressive.activeSourceRows} verified active source row(s); ${progressive.crossQuoteRows} row(s) have two or more submitted quote sources. ${progressiveSubtotal}. This subtotal remains separate from a final optimised payable total, savings figure, or settlement recommendation.</div>` : ""}
    ${data.ledger.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr style="background:#eef4f8;"><th style="text-align:left;padding:4px 5px;">Submitted source row</th><th style="text-align:right;padding:4px 5px;">Amount</th><th style="text-align:left;padding:4px 5px;">Role</th><th style="text-align:left;padding:4px 5px;">Source</th><th style="text-align:left;padding:4px 5px;">Scope / Tax / Revision</th><th style="text-align:left;padding:4px 5px;">Status</th></tr></thead><tbody>${data.ledger.map((row) => `<tr style="border-bottom:1px solid #edf1f4;"><td style="padding:4px 5px;">${esc(row.description)}${row.source_row_label ? `<br><span style="color:#667788;">${esc(row.source_row_label)}</span>` : ""}</td><td style="padding:4px 5px;text-align:right;font-family:monospace;">${esc(money(row.amount_cents, row.currency))}</td><td style="padding:4px 5px;">${esc(titleCase(row.financial_role))}</td><td style="padding:4px 5px;">Document ${esc(row.source_document_id)}${row.source_page ? ` · p${esc(row.source_page)}` : ""}${row.source_location ? ` · ${esc(row.source_location)}` : " · location pending"}</td><td style="padding:4px 5px;">${esc(row.scope_fingerprint ?? "scope pending")} · ${esc(titleCase(row.tax_basis))} · ${esc(titleCase(row.revision_status))}</td><td style="padding:4px 5px;">${esc(titleCase(row.evidence_status))}</td></tr>`).join("")}</tbody></table>` : ""}
    ${evidenceGapPanel}
    ${reconciliation.length > 0 ? `<div style="margin-top:7px;font-size:9px;"><b>Reconciliation findings</b>${reconciliation.map((finding) => `<div style="margin-top:3px;padding:4px 6px;background:#fff8e8;border-left:2px solid #c28a20;"><b>${esc(finding.title)} — ${esc(titleCase(finding.evidence_status))}.</b> ${esc(finding.summary ?? "Verification required.")}${finding.source_document_id ? ` Source: document ${esc(finding.source_document_id)}${finding.source_page ? `, page ${esc(finding.source_page)}` : ""}${finding.source_location ? `, ${esc(finding.source_location)}` : ""}.` : ""}</div>`).join("")}</div>` : ""}
    ${reviewSignals.length > 0 ? `<div style="margin-top:7px;font-size:9px;"><b>Pricing variance review signals</b>${reviewSignals.map((finding) => `<div style="margin-top:3px;padding:4px 6px;background:#f3f7fb;border-left:2px solid #2d5f8b;"><b>${esc(finding.title)}.</b> ${esc(finding.summary ?? "Review recommended.")} This is a review signal only; it is not a fraud conclusion, automatic adjustment, settlement authority, or payment instruction.</div>`).join("")}</div>` : ""}
    <div style="margin-top:7px;font-size:9px;color:#294a66;"><b>Financial decision boundary:</b> L2 continues to compare the evidence that is available. A final optimised total, savings figure, or settlement recommendation is shown only where its complete evidence basis is equivalent and reconciled. This panel does not convert a partial comparison, source discrepancy, or review signal into a payable repair total, fraud conclusion, or payment instruction.</div>
  </div>`;
}
