import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const execute = vi.fn();
const end = vi.fn();
const getComponentBenchmarks = vi.fn();
const getComponentBenchmarksFromTrainingData = vi.fn();
const getVehicleSpecificComponentBenchmarks = vi.fn();
const getVehicleSpecificTrainingBenchmarks = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: { createConnection: vi.fn(async () => ({ execute, end })) },
}));
vi.mock("../db", () => ({
  insertCostLearningRecord: vi.fn(async () => undefined),
  getActiveCalibrationMultiplier: vi.fn(async () => null),
  getComponentBenchmarks,
  getComponentBenchmarksFromTrainingData,
  getVehicleSpecificComponentBenchmarks,
  getVehicleSpecificTrainingBenchmarks,
}));
vi.mock("./evidenceGovernancePresentation", () => ({
  loadEvidenceGovernanceReportData: vi.fn(async () => ({ findings: [], summary: null })),
  renderEvidenceGovernancePanel: vi.fn(() => ""),
}));
vi.mock("../../client/src/components/ReportSectionThread", () => ({
  ReportSectionThread: () => null,
}));

const { runCostOptimisationStage } = await import("../pipeline-v2/stage-9-cost");
const { buildCostDecisionPresentationContract } = await import("../../shared/costDecisionPresentation");
const { ClientCostDecisionStrip } = await import("../../client/src/components/KingaClaimsReport");
const { generateReportHtml } = await import("./reportDefinitions");
const { generateClaimsIntelligenceReport } = await import("./claimsIntelligenceReport");
const { generateForensicDecisionReport } = await import("./forensicDecisionReport");

const tenantId = "tenant-source-trace";
const claimId = 990021;

describe("AUD source-to-decision L1/L2 trace — no-write", () => {
  beforeEach(() => {
    execute.mockReset();
    end.mockReset();
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getVehicleSpecificComponentBenchmarks.mockReset();
    getVehicleSpecificTrainingBenchmarks.mockReset();
    getComponentBenchmarks.mockResolvedValue([
      { component: "mystery trace part", outcome: "repair", p25Usd: 800, medianUsd: 900, p75Usd: 1000, sampleSize: 12, vehicleMakeFiltered: false },
    ]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    getVehicleSpecificComponentBenchmarks.mockResolvedValue([
      { component: "mystery trace part", outcome: "repair", p25Usd: 800, medianUsd: 900, p75Usd: 1000, sampleSize: 12, vehicleMakeFiltered: false, benchmarkStratum: "global_component" },
    ]);
    getVehicleSpecificTrainingBenchmarks.mockResolvedValue([]);
  });

  it("preserves the exact source, canonical-ledger, Stage 9, presentation, report, and client values", async () => {
    vi.useFakeTimers();
    const stageResult = await runCostOptimisationStage(
      { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-source-to-decision" } as any,
      { claimId, marketRegion: "ZW", vehicle: { make: "Toyota", model: "Hilux", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Mystery Trace Part", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      {
        inputRecovery: {
          extracted_quotes: [
            {
              quote_id: "q-source-low", panel_beater: "Source Repairer A", total_cost: 1000, currency: "USD",
              quote_type: "original", workflow_status: "submitted", document_category: "repair_quote",
              source_document_index: 1, source_page_numbers: [1], components: ["Mystery Trace Part"],
              line_items: [{ component: "Mystery Trace Part", line_total: 1000, is_repair: true, is_replacement: false }], confidence: "high",
            },
            {
              quote_id: "q-source-high", panel_beater: "Source Repairer B", total_cost: 1200, currency: "USD",
              quote_type: "original", workflow_status: "submitted", document_category: "repair_quote",
              source_document_index: 2, source_page_numbers: [1], components: ["Mystery Trace Part"],
              line_items: [{ component: "Mystery Trace Part", line_total: 1200, is_repair: true, is_replacement: false }], confidence: "high",
            },
          ],
        },
      } as any,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();

    const costIntelligence = stageResult.data as any;
    const composite = costIntelligence.compositeOptimisation;
    const activeLedger = composite.canonicalQuoteLedger.filter((entry: any) => entry.status === "active");

    // The isolated fixture intentionally has no persistence adapter. Stage 9
    // therefore reports non-blocking degradation while still producing the
    // canonical cost evidence used by every downstream decision surface.
    expect(stageResult.status).toBe("degraded");
    expect(activeLedger.map((entry: any) => [entry.quoteId, entry.totalCostUsd])).toEqual([
      ["q-source-low", 1000],
      ["q-source-high", 1200],
    ]);
    expect(composite).toMatchObject({
      quoteReceiptStatus: "quotes_received",
      sourceQuotesReceived: 2,
      quotesEvaluated: 2,
      l1SubmittedCostUsd: 1000,
      l2CompositeOptimisedCostUsd: 900,
      savingsL1vsL2Usd: 100,
      l2Status: "complete",
      isComplete: true,
    });
    expect(composite.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: "mystery trace part",
        lowestEligibleSubmittedCostUsd: 1000,
        selectedSubmittedFromQuote: "Source Repairer A",
        selectedCostUsd: 900,
        l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT",
      }),
    ]));

    const presentation = buildCostDecisionPresentationContract({
      quoteReceiptStatus: composite.quoteReceiptStatus,
      activeQuoteCount: composite.quotesEvaluated,
      allInReconciliationRequired: composite.allInReconciliationRequired,
      unreconciledQuoteCount: composite.quoteReconciliations.filter((entry: any) => entry.status === "reconciliation_required").length,
      l2IsComplete: composite.isComplete,
      l2OptimisedCostUsd: composite.l2CompositeOptimisedCostUsd,
      l2EvidenceQualifiedComparisonUsd: composite.l2EvidenceQualifiedComparisonUsd ?? null,
      partialPricedScopeUsd: composite.partialPricedScopeUsd ?? null,
      l1SubmittedCostUsd: composite.l1SubmittedCostUsd,
      missingRequiredComponents: composite.missingRequiredComponents ?? [],
      duplicateQuotesExcluded: composite.duplicateQuotesExcluded ?? 0,
      reconciliationRepairers: [],
    });
    expect(presentation).toMatchObject({
      optimisedQuoteAmount: 900,
      optimisedQuoteState: "complete",
      potentialSavingsAmount: 100,
      potentialSavingsLabel: "Potential savings",
    });

    const reportClaim = {
      id: claimId, claim_reference: "KNG-SOURCE-TRACE", tenant_id: tenantId, status: "analysis_complete", workflow_state: "analysis_complete",
      vehicle_make: "Toyota", vehicle_model: "Hilux", vehicle_year: 2021, vehicle_description: "Toyota Hilux 2021", vehicle_registration: "TRACE-001",
      insurer_name: "Trace Insurer", created_at: "2026-08-15T10:00:00.000Z", incident_date: "2026-08-14T10:00:00.000Z",
      estimated_cost: 90000, vehicle_market_value: 500000, total_loss_indicated: 0, repair_to_value_ratio: 18,
      fraud_score: 0, fraud_risk_level: "low", recommendation: "REPAIR", confidence_score: 90, model_version: "test",
      cost_intelligence_json: JSON.stringify(costIntelligence), repair_intelligence_json: "{}", fraud_score_breakdown_json: "{}",
      physics_analysis: "{}", physics_truth_json: "{}", cross_validation_json: "{}", claim_truth_json: "{}", enriched_photos_json: "[]",
      decision_authority_json: "{}", ife_result_json: "{}", narrative_analysis_json: "{}", cgi_result_json: "{}", interpretation_result_json: "{}",
      assessment_date: "2026-08-15T10:00:00.000Z",
    };
    const persistedQuotes = [
      { id: "q-source-low", quoted_amount: 100000, currency: "USD", currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", panel_beater_name: "Source Repairer A" },
      { id: "q-source-high", quoted_amount: 120000, currency: "USD", currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", panel_beater_name: "Source Repairer B" },
    ];
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[reportClaim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...persistedQuotes], undefined];
      return [[], undefined];
    });

    const reports = await Promise.all([
      generateReportHtml("claim.assessment", { claimId }, tenantId),
      generateClaimsIntelligenceReport(claimId, tenantId),
      generateForensicDecisionReport(claimId, tenantId),
    ]);
    for (const html of reports) {
      expect(html).toContain("KINGA Optimised Quote");
      expect(html).toContain("$900.00");
      expect(html).toContain("Potential savings");
      expect(html).toContain("$100.00");
    }

    const clientHtml = renderToStaticMarkup(React.createElement(ClientCostDecisionStrip, {
      costIntelligence,
      quotes: [],
      fmtCurrency: (amount: number | null | undefined) => `USD ${amount?.toFixed(2) ?? "—"}`,
      totalLossIndicated: false,
      repairToValueRatio: 18,
      audience: "client",
    }));
    expect(clientHtml).toContain("KINGA Optimised Quote");
    expect(clientHtml).toContain("USD 900.00");
    expect(clientHtml).toContain("Potential savings");
    expect(clientHtml).toContain("USD 100.00");
  });
});
