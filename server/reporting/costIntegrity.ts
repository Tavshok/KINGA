/** Shared, provenance-safe cost presentation model for CL, CI, and FR. */

export type ReportQuoteStatus = "active" | "supplementary" | "duplicate" | "superseded" | "excluded";

export interface ReportQuoteLedgerRow {
  repairer: string;
  amountUsd: number | null;
  currency: string;
  status: ReportQuoteStatus;
  sourceReference: string | null;
  statusReason: string;
}

export interface ReportCostIntegrity {
  activeQuotes: ReportQuoteLedgerRow[];
  sourceQuoteCount: number;
  duplicateQuotesExcluded: number;
  supersededQuotesExcluded: number;
  l1SubmittedCostUsd: number | null;
  l2OptimisedCostUsd: number | null;
  l3BenchmarkReferenceCostUsd: number | null;
  partialPricedScopeUsd: number | null;
  l2IsComplete: boolean;
  missingRequiredComponents: string[];
  costBasis: string | null;
  assessorCalibrationCostUsd: number | null;
}

function finitePositive(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function legacyQuoteRows(dbQuotes: unknown[]): ReportQuoteLedgerRow[] {
  return dbQuotes.map((value, index) => {
    const quote = record(value);
    const cents = finitePositive(quote.quoted_amount);
    return {
      repairer: String(quote.panel_beater_name ?? quote.panel_beater ?? `Repairer ${index + 1}`),
      amountUsd: cents === null ? null : cents / 100,
      currency: String(quote.currency_code ?? "USD"),
      status: "active",
      sourceReference: quote.id === undefined || quote.id === null ? null : String(quote.id),
      statusReason: "Legacy quotation record; no R1 ledger metadata available.",
    };
  });
}

/**
 * Resolves report-safe costs. It intentionally refuses every legacy L2 fallback:
 * estimated cost, documented agreed cost, and weighted quote averages are not L2.
 */
export function resolveReportCostIntegrity(costIntel: unknown, dbQuotes: unknown[]): ReportCostIntegrity {
  const intelligence = record(costIntel);
  const composite = record(intelligence.compositeOptimisation);
  const rawLedger = Array.isArray(composite.canonicalQuoteLedger)
    ? composite.canonicalQuoteLedger.map(record)
    : [];
  const ledgerRows = rawLedger.map((entry): ReportQuoteLedgerRow => ({
    repairer: String(entry.panelBeater ?? "Unknown repairer"),
    amountUsd: finitePositive(entry.totalCostUsd),
    currency: String(entry.currency ?? "USD"),
    status: String(entry.status ?? "excluded") as ReportQuoteStatus,
    sourceReference: entry.quoteId === null || entry.quoteId === undefined ? null : String(entry.quoteId),
    statusReason: String(entry.statusReason ?? ""),
  }));
  const activeQuotes = ledgerRows.length > 0
    ? ledgerRows.filter((quote) => quote.status === "active" || quote.status === "supplementary")
    : legacyQuoteRows(dbQuotes);
  const lowestActiveQuoteUsd = activeQuotes
    .map((quote) => quote.amountUsd)
    .filter((amount): amount is number => amount !== null)
    .sort((a, b) => a - b)[0] ?? null;

  const complete = composite.isComplete === true;
  const l2 = complete ? finitePositive(composite.l2CompositeOptimisedCostUsd) : null;
  return {
    activeQuotes,
    sourceQuoteCount: Number(composite.sourceQuotesReceived ?? rawLedger.length ?? dbQuotes.length) || dbQuotes.length,
    duplicateQuotesExcluded: Number(composite.duplicateQuotesExcluded ?? ledgerRows.filter((row) => row.status === "duplicate").length) || 0,
    supersededQuotesExcluded: Number(composite.supersededQuotesExcluded ?? ledgerRows.filter((row) => row.status === "superseded").length) || 0,
    l1SubmittedCostUsd: finitePositive(composite.l1LowestSubmittedCostUsd)
      ?? finitePositive(composite.l1SubmittedCostUsd)
      ?? lowestActiveQuoteUsd,
    l2OptimisedCostUsd: l2,
    l3BenchmarkReferenceCostUsd: finitePositive(composite.l3BenchmarkReferenceCostUsd),
    partialPricedScopeUsd: finitePositive(composite.partialPricedScopeUsd),
    l2IsComplete: complete && l2 !== null,
    missingRequiredComponents: Array.isArray(composite.missingRequiredComponents)
      ? composite.missingRequiredComponents.map(String)
      : [],
    costBasis: typeof composite.costBasis === "string" ? composite.costBasis : null,
    assessorCalibrationCostUsd: finitePositive(intelligence.documentedAgreedCostUsd),
  };
}
