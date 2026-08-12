import type mysql from "mysql2/promise";

type LedgerRow = {
  description: string;
  amount_cents: number;
  currency: string;
  source_document_id: number;
  source_page: number | null;
  source_location: string | null;
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

export async function loadEvidenceGovernanceReportData(
  conn: mysql.Connection,
  claimId: number,
  tenantId?: string,
): Promise<EvidenceGovernanceReportData> {
  const tenancy = tenantId ? " AND tenant_id = ?" : "";
  const params = tenantId ? [claimId, tenantId] : [claimId];
  const [ledger] = await conn.execute(
    `SELECT description, amount_cents, currency, source_document_id, source_page, source_location,
            tax_basis, scope_fingerprint, revision_status, evidence_status
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
  return { ledger, findings };
}

/**
 * Neutral report presentation: it preserves evidence facts and explicitly
 * separates a pricing review signal from fraud, adjustment, settlement, and payment decisions.
 */
export function renderEvidenceGovernancePanel(data: EvidenceGovernanceReportData): string {
  if (data.ledger.length === 0 && data.findings.length === 0) {
    return `<div style="margin-top:10px;padding:7px 10px;background:#f3f7fb;border-left:3px solid #2d5f8b;font-size:10px;color:#294a66;"><b>Cost Evidence &amp; Comparability.</b> No document-backed evidence register has been recorded for this assessment yet. KINGA will not treat legacy ledger values as verified equivalence without source, scope, tax-basis, and revision traceability.</div>`;
  }

  const reviewSignals = data.findings.filter((finding) => finding.evidence_status === "pricing_variance_review_signal");
  const reconciliation = data.findings.filter((finding) => finding.evidence_status !== "pricing_variance_review_signal");
  return `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #dbe5ee;">
    <div style="font-size:10px;font-weight:700;color:#294a66;text-transform:uppercase;letter-spacing:.45px;margin-bottom:5px;">Cost Evidence &amp; Comparability</div>
    <div style="font-size:9px;color:#4a5c6b;margin-bottom:6px;">Every amount below is shown with its submitted source, scope, tax basis, revision state, and evidence status. KINGA does not create, allocate, or silently absorb an amount.</div>
    ${data.ledger.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:9px;"><thead><tr style="background:#eef4f8;"><th style="text-align:left;padding:4px 5px;">Submitted evidence</th><th style="text-align:right;padding:4px 5px;">Amount</th><th style="text-align:left;padding:4px 5px;">Source</th><th style="text-align:left;padding:4px 5px;">Scope / Tax / Revision</th><th style="text-align:left;padding:4px 5px;">Status</th></tr></thead><tbody>${data.ledger.map((row) => `<tr style="border-bottom:1px solid #edf1f4;"><td style="padding:4px 5px;">${esc(row.description)}</td><td style="padding:4px 5px;text-align:right;font-family:monospace;">${esc(money(row.amount_cents, row.currency))}</td><td style="padding:4px 5px;">Document ${esc(row.source_document_id)}${row.source_page ? ` · p${esc(row.source_page)}` : ""}${row.source_location ? ` · ${esc(row.source_location)}` : " · location pending"}</td><td style="padding:4px 5px;">${esc(row.scope_fingerprint ?? "scope pending")} · ${esc(titleCase(row.tax_basis))} · ${esc(titleCase(row.revision_status))}</td><td style="padding:4px 5px;">${esc(titleCase(row.evidence_status))}</td></tr>`).join("")}</tbody></table>` : ""}
    ${reconciliation.length > 0 ? `<div style="margin-top:7px;font-size:9px;"><b>Reconciliation findings</b>${reconciliation.map((finding) => `<div style="margin-top:3px;padding:4px 6px;background:#fff8e8;border-left:2px solid #c28a20;"><b>${esc(finding.title)} — ${esc(titleCase(finding.evidence_status))}.</b> ${esc(finding.summary ?? "Verification required.")}${finding.source_document_id ? ` Source: document ${esc(finding.source_document_id)}${finding.source_page ? `, page ${esc(finding.source_page)}` : ""}${finding.source_location ? `, ${esc(finding.source_location)}` : ""}.` : ""}</div>`).join("")}</div>` : ""}
    ${reviewSignals.length > 0 ? `<div style="margin-top:7px;font-size:9px;"><b>Pricing variance review signals</b>${reviewSignals.map((finding) => `<div style="margin-top:3px;padding:4px 6px;background:#f3f7fb;border-left:2px solid #2d5f8b;"><b>${esc(finding.title)}.</b> ${esc(finding.summary ?? "Review recommended.")} This is a review signal only; it is not a fraud conclusion, automatic adjustment, settlement authority, or payment instruction.</div>`).join("")}</div>` : ""}
    <div style="margin-top:7px;font-size:9px;color:#294a66;"><b>Decision boundary:</b> An unresolved reconciliation, non-equivalent scope, or non-equivalent tax basis withholds the relevant L2 comparison. The claim assessment continues and the evidence is routed for review.</div>
  </div>`;
}
