export type LegacyQuoteEvidenceStatus = "legacy_unverified" | "superseded" | "excluded";

export interface LegacyQuoteEvidenceRow {
  repairer: string;
  amountCents: number | null;
  currency: string;
  quoteId: string | null;
  status: LegacyQuoteEvidenceStatus;
  statusReason: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): string | null {
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value);
}

function cents(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Classifies database quote rows only when their own persisted metadata makes a
 * state deterministic. A row without the canonical R1 ledger is deliberately
 * visible as legacy history, never promoted to active comparison evidence.
 */
export function classifyLegacyQuoteEvidenceRows(values: unknown[]): LegacyQuoteEvidenceRow[] {
  const rows = values.map((value, index) => {
    const quote = record(value);
    const quoteId = identifier(quote.id ?? quote.quote_id ?? quote.quoteId);
    const workflowStatus = text(quote.status).toLowerCase();
    const excluded = workflowStatus === "rejected" || workflowStatus === "cancelled";
    return {
      repairer: text(quote.panel_beater_name ?? quote.panelBeaterName ?? quote.repairerName ?? quote.panel_beater) || `Repairer ${index + 1}`,
      amountCents: cents(quote.quoted_amount ?? quote.quotedAmount),
      currency: text(quote.currency_code ?? quote.currencyCode ?? quote.currency).toUpperCase() || "USD",
      quoteId,
      status: excluded ? "excluded" as const : "legacy_unverified" as const,
      statusReason: excluded
        ? "Legacy quotation excluded because its persisted workflow status is not available for comparison."
        : "Legacy quotation history; canonical ledger metadata is unavailable, so it is not comparison evidence.",
      parentQuoteId: identifier(quote.parent_quote_id ?? quote.parentQuoteId),
      quoteType: text(quote.quote_type ?? quote.quoteType).toLowerCase(),
    };
  });

  const byId = new Map(rows.filter((row) => row.quoteId).map((row) => [row.quoteId!, row]));
  for (const row of rows) {
    if (!row.parentQuoteId || !["revised", "assessor_adjusted", "strip_requote"].includes(row.quoteType)) continue;
    const parent = byId.get(row.parentQuoteId);
    if (parent && parent.status !== "excluded") {
      parent.status = "superseded";
      parent.statusReason = `Legacy quotation superseded by persisted ${row.quoteType} revision ${row.quoteId ?? "record"}.`;
    }
  }

  return rows.map(({ parentQuoteId: _parentQuoteId, quoteType: _quoteType, ...row }) => row);
}
