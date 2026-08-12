/**
 * Canonical repair-quote ledger for Stage 9.
 *
 * The ledger preserves every extracted quotation for audit, but exposes only
 * active repair quotations to L1, L2, price variance, savings, and reports.
 * A duplicate is never discarded: it remains traceable with its source index
 * and the active quote it duplicates.
 */

export type QuoteLedgerStatus =
  | "active"
  | "duplicate"
  | "superseded"
  | "supplementary"
  | "excluded";

export interface QuoteLedgerSource {
  panel_beater?: string | null;
  panel_beater_id?: number | string | null;
  panelBeaterId?: number | string | null;
  quote_id?: number | string | null;
  quoteId?: number | string | null;
  source_document_id?: number | string | null;
  sourceDocumentId?: number | string | null;
  parent_quote_id?: number | string | null;
  parentQuoteId?: number | string | null;
  quote_type?: string | null;
  quoteType?: string | null;
  document_category?: string | null;
  total_cost?: number | null;
  currency?: string | null;
  line_items?: Array<{
    component?: string | null;
    description?: string | null;
    line_total?: number | null;
    unit_cost?: number | null;
    quantity?: number | null;
  }>;
  [key: string]: unknown;
}

export interface CanonicalQuoteLedgerEntry {
  ledgerId: string;
  sourceIndex: number;
  quoteId: string | null;
  sourceDocumentId: string | null;
  panelBeater: string;
  repairerKey: string;
  currency: string;
  totalCostUsd: number | null;
  quoteType: string;
  parentQuoteId: string | null;
  scopeFingerprint: string;
  status: QuoteLedgerStatus;
  duplicateOfLedgerId: string | null;
  statusReason: string;
}

export interface CanonicalQuoteLedger {
  entries: CanonicalQuoteLedgerEntry[];
  activeQuotes: QuoteLedgerSource[];
  activeQuoteCount: number;
  duplicateCount: number;
  supersededCount: number;
  excludedCount: number;
}

const REPAIR_DOCUMENT_CATEGORY = "repair quote";
const NON_REPAIR_CATEGORIES = new Set(["parts quote", "assessor report", "agreed cost", "other"]);
const NON_REPAIR_QUOTE_TYPES = new Set(["parts supplier", "assessor report", "agreed cost"]);
const REVISION_TYPES = new Set(["revised", "assessor_adjusted", "strip_requote"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalises common trading-name extensions without conflating unrelated repairers.
 * A durable panel-beater ID, when present, always wins over a text key.
 */
export function canonicalRepairerKey(quote: QuoteLedgerSource): string {
  const panelBeaterId = quote.panel_beater_id ?? quote.panelBeaterId;
  if (panelBeaterId !== null && panelBeaterId !== undefined && String(panelBeaterId).trim()) {
    return `panel:${String(panelBeaterId).trim()}`;
  }

  const rawName = text(quote.panel_beater) || "unknown repairer";
  const reducedName = canonicalText(rawName)
    .replace(/\b(and )?spray painters?\b/g, "")
    .replace(/\bauto body\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `name:${reducedName || canonicalText(rawName)}`;
}

function quoteIdOf(quote: QuoteLedgerSource): string | null {
  const value = quote.quote_id ?? quote.quoteId;
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value);
}

function sourceDocumentIdOf(quote: QuoteLedgerSource): string | null {
  const value = quote.source_document_id ?? quote.sourceDocumentId;
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value);
}

function parentQuoteIdOf(quote: QuoteLedgerSource): string | null {
  const value = quote.parent_quote_id ?? quote.parentQuoteId;
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value);
}

function amountInCents(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.round(numeric * 100)) : "none";
}

/** Builds a stable scope signature for duplicate detection and audit display. */
export function buildScopeFingerprint(quote: QuoteLedgerSource): string {
  const rows = (quote.line_items ?? [])
    .map((line) => {
      const component = canonicalText(text(line.component) || text(line.description));
      const amount = Number(line.line_total ?? line.unit_cost ?? 0);
      const quantity = Number(line.quantity ?? 1);
      if (!component || !Number.isFinite(amount) || amount <= 0) return null;
      return `${component}:${Math.round(amount * 100)}:${Number.isFinite(quantity) && quantity > 0 ? quantity : 1}`;
    })
    .filter((row): row is string => Boolean(row))
    .sort();

  return rows.length > 0 ? rows.join("|") : `header:${amountInCents(quote.total_cost)}`;
}

function isRepairQuote(quote: QuoteLedgerSource): boolean {
  const category = canonicalText(text(quote.document_category));
  if (category) return category === REPAIR_DOCUMENT_CATEGORY;

  const quoteType = canonicalText(text(quote.quote_type) || text(quote.quoteType));
  return !NON_REPAIR_QUOTE_TYPES.has(quoteType) && !NON_REPAIR_CATEGORIES.has(quoteType);
}

function quoteTypeOf(quote: QuoteLedgerSource): string {
  return canonicalText(text(quote.quote_type) || text(quote.quoteType)) || "original";
}

/**
 * Produces a claim-scoped repair ledger. Exact same-repairer/same-currency/
 * same-total/same-scope submissions are duplicates. Revisions supersede their
 * parent; supplementary work remains active as a separate scoped submission.
 */
export function buildCanonicalQuoteLedger(quotes: QuoteLedgerSource[]): CanonicalQuoteLedger {
  const entries: CanonicalQuoteLedgerEntry[] = quotes.map((quote, sourceIndex) => {
    const quoteType = quoteTypeOf(quote);
    const repairQuote = isRepairQuote(quote);
    const status: QuoteLedgerStatus = !repairQuote
      ? "excluded"
      : quoteType === "supplementary"
        ? "supplementary"
        : "active";
    const reason = !repairQuote
      ? "Non-repair document excluded from repair-quote ledger."
      : quoteType === "supplementary"
        ? "Supplementary quote retained as a distinct additional-scope submission."
        : "Active repair quotation.";
    return {
      ledgerId: `quote-${sourceIndex + 1}`,
      sourceIndex,
      quoteId: quoteIdOf(quote),
      sourceDocumentId: sourceDocumentIdOf(quote),
      panelBeater: text(quote.panel_beater) || "Unknown repairer",
      repairerKey: canonicalRepairerKey(quote),
      currency: text(quote.currency).toUpperCase() || "USD",
      totalCostUsd: Number.isFinite(Number(quote.total_cost)) && Number(quote.total_cost) > 0
        ? Number(quote.total_cost)
        : null,
      quoteType,
      parentQuoteId: parentQuoteIdOf(quote),
      scopeFingerprint: buildScopeFingerprint(quote),
      status,
      duplicateOfLedgerId: null,
      statusReason: reason,
    };
  });

  const byQuoteId = new Map(entries.filter((entry) => entry.quoteId).map((entry) => [entry.quoteId!, entry]));
  for (const entry of entries) {
    if (!entry.parentQuoteId || !REVISION_TYPES.has(entry.quoteType)) continue;
    const parent = byQuoteId.get(entry.parentQuoteId);
    if (parent && parent.status !== "excluded") {
      parent.status = "superseded";
      parent.statusReason = `Superseded by ${entry.quoteType} quotation ${entry.ledgerId}.`;
    }
  }

  const activeByFingerprint = new Map<string, CanonicalQuoteLedgerEntry>();
  for (const entry of entries) {
    if (entry.status !== "active" && entry.status !== "supplementary") continue;
    const duplicateKey = [
      entry.repairerKey,
      entry.currency,
      amountInCents(entry.totalCostUsd),
      entry.scopeFingerprint,
    ].join("||");
    const existing = activeByFingerprint.get(duplicateKey);
    if (existing) {
      entry.status = "duplicate";
      entry.duplicateOfLedgerId = existing.ledgerId;
      entry.statusReason = `Duplicate of ${existing.ledgerId}: same repairer, currency, quoted total, and normalised scope.`;
    } else {
      activeByFingerprint.set(duplicateKey, entry);
    }
  }

  const activeEntries = entries.filter((entry) => entry.status === "active" || entry.status === "supplementary");
  return {
    entries,
    activeQuotes: activeEntries.map((entry) => ({
      ...quotes[entry.sourceIndex],
      canonical_quote_ledger_id: entry.ledgerId,
      canonical_quote_status: entry.status,
      canonical_repairer_key: entry.repairerKey,
      canonical_scope_fingerprint: entry.scopeFingerprint,
    })),
    activeQuoteCount: activeEntries.length,
    duplicateCount: entries.filter((entry) => entry.status === "duplicate").length,
    supersededCount: entries.filter((entry) => entry.status === "superseded").length,
    excludedCount: entries.filter((entry) => entry.status === "excluded").length,
  };
}
