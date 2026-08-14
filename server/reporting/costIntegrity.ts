/** Shared, provenance-safe cost presentation model for CL, CI, and FR. */

import { classifyLegacyQuoteEvidenceRows } from "../../shared/legacyQuoteEvidence";

export type ReportQuoteStatus = "active" | "supplementary" | "duplicate" | "superseded" | "historical" | "excluded" | "legacy_unverified";

export interface ReportQuoteLedgerRow {
  repairer: string;
  amountUsd: number | null;
  currency: string;
  status: ReportQuoteStatus;
  sourceReference: string | null;
  statusReason: string;
  workflowStatus: string | null;
  evidenceEligibility: "final_l2_eligible" | "comparison_only" | "ineligible" | null;
  evidenceEligibilityReason: string | null;
}

export interface ReportL2ComponentSelection {
  componentName: string;
  selectedCostUsd: number | null;
  selectionMethod: string | null;
  benchmarkP50Usd: number | null;
  benchmarkDeviationPct: number | null;
  lineItemSpreadPct: number | null;
  highLineItemVariance: boolean;
  lineItemVarianceRemark: string | null;
}

export interface ReportCostIntegrity {
  activeQuotes: ReportQuoteLedgerRow[];
  submittedQuotes: ReportQuoteLedgerRow[];
  historicalQuotes: ReportQuoteLedgerRow[];
  legacyHistoryQualified: boolean;
  sourceQuoteCount: number;
  quoteReceiptStatus: "no_quotes" | "quotes_received";
  quoteScopeStatus: "complete" | "evidence_qualified" | "incomplete_scope" | "reconciliation_required" | "not_evaluated";
  l2Status: "complete" | "evidence_qualified" | "incomplete_scope" | "reconciliation_required" | "unavailable";
  duplicateQuotesExcluded: number;
  supersededQuotesExcluded: number;
  l1SubmittedCostUsd: number | null;
  l2OptimisedCostUsd: number | null;
  l2EvidenceQualifiedComparisonUsd: number | null;
  l2EvidenceCoveragePercent: number | null;
  l3BenchmarkReferenceCostUsd: number | null;
  partialPricedScopeUsd: number | null;
  l2IsComplete: boolean;
  missingRequiredComponents: string[];
  costBasis: string | null;
  assessorCalibrationCostUsd: number | null;
  allInReconciliationRequired: boolean;
  unreconciledQuoteCount: number;
	/** Evidence-only explanation of the benchmark-validated L2 component selections. */
  l2ComponentSelections?: ReportL2ComponentSelection[];
	quoteReconciliations: Array<{
		repairer: string;
		quoteId: string | null;
		submittedHeaderTotalUsd: number | null;
		submittedItemisedTotalUsd: number;
		unexplainedResidualUsd: number | null;
		residualCategory: "source_to_ledger_reconciliation" | null;
		status: "reconciled" | "reconciliation_required" | "total_only" | "line_items_only";
	}>;
}

function finitePositive(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function legacyQuoteRows(dbQuotes: unknown[]): ReportQuoteLedgerRow[] {
  return classifyLegacyQuoteEvidenceRows(dbQuotes).map((quote) => {
    return {
      repairer: quote.repairer,
      amountUsd: quote.amountCents === null ? null : quote.amountCents / 100,
      currency: quote.currency,
      status: quote.status,
      sourceReference: quote.quoteId,
      statusReason: quote.statusReason,
      workflowStatus: null,
      evidenceEligibility: quote.status === "legacy_unverified" ? "comparison_only" : quote.status === "excluded" ? "ineligible" : null,
      evidenceEligibilityReason: quote.statusReason,
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
    workflowStatus: entry.workflowStatus === null || entry.workflowStatus === undefined ? null : String(entry.workflowStatus),
    evidenceEligibility: entry.evidenceEligibility === "final_l2_eligible" || entry.evidenceEligibility === "comparison_only" || entry.evidenceEligibility === "ineligible"
      ? entry.evidenceEligibility
      : null,
    evidenceEligibilityReason: entry.evidenceEligibilityReason === null || entry.evidenceEligibilityReason === undefined ? null : String(entry.evidenceEligibilityReason),
  }));
  const legacyRows = ledgerRows.length > 0 ? [] : legacyQuoteRows(dbQuotes);
  const activeQuotes = ledgerRows.length > 0
    ? ledgerRows.filter((quote) => quote.status === "active" || quote.status === "supplementary")
    : [];
  const submittedQuotes = ledgerRows.length > 0
    ? activeQuotes
    : legacyRows.filter((quote) => quote.status === "legacy_unverified");
  const historicalQuotes = ledgerRows.length > 0
    ? ledgerRows.filter((quote) => quote.status === "historical" || quote.status === "superseded" || quote.status === "excluded" || quote.status === "duplicate")
    : legacyRows.filter((quote) => quote.status !== "legacy_unverified");
  const lowestActiveQuoteUsd = activeQuotes
    .map((quote) => quote.amountUsd)
    .filter((amount): amount is number => amount !== null)
    .sort((a, b) => a - b)[0] ?? null;

  const complete = composite.isComplete === true;
  const l2 = complete ? finitePositive(composite.l2CompositeOptimisedCostUsd) : null;
  const sourceQuoteCount = Number(composite.sourceQuotesReceived ?? rawLedger.length ?? dbQuotes.length) || dbQuotes.length;
  const quoteReceiptStatus = sourceQuoteCount > 0 ? "quotes_received" : "no_quotes";
  const inferredScopeStatus = quoteReceiptStatus === "no_quotes"
    ? "not_evaluated"
    : complete ? "complete" : "incomplete_scope";
  const persistedScopeStatus = composite.quoteScopeStatus;
  const quoteScopeStatus = persistedScopeStatus === "complete" || persistedScopeStatus === "evidence_qualified" || persistedScopeStatus === "incomplete_scope" || persistedScopeStatus === "reconciliation_required"
    ? persistedScopeStatus
    : inferredScopeStatus;
  const persistedL2Status = composite.l2Status;
  const l2Status = persistedL2Status === "complete" || persistedL2Status === "evidence_qualified" || persistedL2Status === "incomplete_scope" || persistedL2Status === "reconciliation_required"
    ? persistedL2Status
    : l2 !== null ? "complete" : quoteReceiptStatus === "quotes_received" ? "incomplete_scope" : "unavailable";
  const quoteReconciliations = Array.isArray(composite.quoteReconciliations)
    ? composite.quoteReconciliations.map(record).map((quote) => {
      const rawStatus = String(quote.status ?? "");
      const status = rawStatus === "reconciled" || rawStatus === "reconciliation_required" || rawStatus === "total_only" || rawStatus === "line_items_only"
        ? rawStatus
        : "reconciliation_required";
      const residual = finitePositive(quote.unexplainedResidualUsd);
      return {
        repairer: String(quote.repairer ?? "Unknown repairer"),
        quoteId: quote.quoteId === null || quote.quoteId === undefined ? null : String(quote.quoteId),
				submittedHeaderTotalUsd: finitePositive(quote.submittedHeaderTotalUsd),
				submittedItemisedTotalUsd: finitePositive(quote.submittedItemisedTotalUsd) ?? 0,
				unexplainedResidualUsd: residual,
				residualCategory: residual === null ? null : "source_to_ledger_reconciliation" as const,
				status,
			};
    })
    : [];
  const unreconciledQuoteCount = quoteReconciliations.filter((quote) =>
    String(quote.status ?? "") !== "reconciled"
  ).length;
  const allInReconciliationRequired = composite.allInReconciliationRequired === true
    || l2Status === "reconciliation_required"
    || quoteScopeStatus === "reconciliation_required";
	const l2ComponentSelections = Array.isArray(composite.compositeLineItems)
	  ? composite.compositeLineItems.map(record).map((item): ReportL2ComponentSelection => ({
	      componentName: String(item.componentName ?? item.component ?? "Component"),
	      selectedCostUsd: finitePositive(item.selectedCostUsd ?? item.kingaOptimisedUsd),
	      selectionMethod: typeof item.l2SelectionMethod === "string" ? item.l2SelectionMethod : null,
	      benchmarkP50Usd: finitePositive(item.p50Usd ?? item.benchmarkP50Usd),
	      benchmarkDeviationPct: Number.isFinite(Number(item.benchmarkDeviationPct)) ? Number(item.benchmarkDeviationPct) : null,
	      lineItemSpreadPct: Number.isFinite(Number(item.lineItemSpreadPct)) ? Number(item.lineItemSpreadPct) : null,
	      highLineItemVariance: item.highLineItemVariance === true,
	      lineItemVarianceRemark: typeof item.lineItemVarianceRemark === "string" ? item.lineItemVarianceRemark : null,
	    }))
	  : [];
  return {
    activeQuotes,
    submittedQuotes,
    historicalQuotes,
    legacyHistoryQualified: historicalQuotes.length > 0 || (ledgerRows.length === 0 && submittedQuotes.length > 0),
    sourceQuoteCount,
    quoteReceiptStatus,
    quoteScopeStatus,
    l2Status,
    duplicateQuotesExcluded: Number(composite.duplicateQuotesExcluded ?? ledgerRows.filter((row) => row.status === "duplicate").length) || 0,
    supersededQuotesExcluded: Number(composite.supersededQuotesExcluded ?? ledgerRows.filter((row) => row.status === "superseded").length) || 0,
    l1SubmittedCostUsd: finitePositive(composite.l1LowestSubmittedCostUsd)
      ?? finitePositive(composite.l1SubmittedCostUsd)
      ?? lowestActiveQuoteUsd,
    l2OptimisedCostUsd: l2,
    l2EvidenceQualifiedComparisonUsd: l2Status === "evidence_qualified"
      ? finitePositive(composite.l2EvidenceQualifiedComparisonUsd) ?? finitePositive(composite.partialPricedScopeUsd)
      : null,
    l2EvidenceCoveragePercent: (() => {
      const coverage = record(composite.evidenceGovernance).evidenceCoverage;
      const percentage = record(coverage).percentage;
      const numeric = Number(percentage);
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
    })(),
    l3BenchmarkReferenceCostUsd: finitePositive(composite.l3BenchmarkReferenceCostUsd),
    partialPricedScopeUsd: finitePositive(composite.partialPricedScopeUsd),
    l2IsComplete: l2Status === "complete" && l2 !== null,
    missingRequiredComponents: Array.isArray(composite.missingRequiredComponents)
      ? composite.missingRequiredComponents.map(String)
      : [],
    costBasis: typeof composite.costBasis === "string" ? composite.costBasis : null,
    assessorCalibrationCostUsd: finitePositive(intelligence.documentedAgreedCostUsd),
    allInReconciliationRequired,
    unreconciledQuoteCount,
		l2ComponentSelections,
    quoteReconciliations,
  };
}
