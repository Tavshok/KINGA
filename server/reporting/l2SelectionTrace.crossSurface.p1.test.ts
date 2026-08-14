import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const end = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: { createConnection: vi.fn(async () => ({ execute, end })) },
}));
vi.mock("./evidenceGovernancePresentation", () => ({
  loadEvidenceGovernanceReportData: vi.fn(async () => ({ findings: [], summary: null })),
  renderEvidenceGovernancePanel: vi.fn(() => ""),
}));

const { generateReportHtml } = await import("./reportDefinitions");
const { generateClaimsIntelligenceReport } = await import("./claimsIntelligenceReport");
const { generateForensicDecisionReport } = await import("./forensicDecisionReport");

const costIntelligence = {
  compositeOptimisation: {
    isComplete: true,
    l2Status: "complete",
    quoteReceiptStatus: "quotes_received",
    quoteScopeStatus: "complete",
    l1SubmittedCostUsd: 1200,
    l2CompositeOptimisedCostUsd: 1180,
    quotesEvaluated: 2,
    sourceQuotesReceived: 2,
    canonicalQuoteLedger: [
      { quoteId: "1", panelBeater: "Alpha Repairs", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "2", panelBeater: "Beta Repairs", totalCostUsd: 1350, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
    ],
    compositeLineItems: [
      { componentName: "Front bumper", selectedCostUsd: 100, l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT", benchmarkP50Usd: 100, benchmarkDeviationPct: 10, lineItemSpreadPct: 12, highLineItemVariance: false },
      { componentName: "Headlamp", selectedCostUsd: 120, l2SelectionMethod: "LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT", benchmarkP50Usd: 150, benchmarkDeviationPct: 41.7, lineItemSpreadPct: 25, highLineItemVariance: true, lineItemVarianceRemark: "High submitted-price spread; verify like-for-like scope." },
    ],
  },
};

const claim = {
  id: 990010, claim_reference: "KNG-L2-TRACE", tenant_id: "tenant-test", status: "analysis_complete", workflow_state: "analysis_complete",
  vehicle_make: "Toyota", vehicle_model: "Hilux", vehicle_year: 2021, vehicle_description: "Toyota Hilux 2021", vehicle_registration: "TEST-001",
  insurer_name: "Test Insurer", created_at: "2026-08-14T12:00:00.000Z", incident_date: "2026-08-13T12:00:00.000Z",
  estimated_cost: 118000, vehicle_market_value: 500000, total_loss_indicated: 0, repair_to_value_ratio: 24,
  fraud_score: 0, fraud_risk_level: "low", recommendation: "REPAIR", confidence_score: 90, model_version: "test",
  cost_intelligence_json: JSON.stringify(costIntelligence), repair_intelligence_json: "{}", fraud_score_breakdown_json: "{}",
  physics_analysis: "{}", physics_truth_json: "{}", cross_validation_json: "{}", claim_truth_json: "{}", enriched_photos_json: "[]",
  decision_authority_json: "{}", ife_result_json: "{}", narrative_analysis_json: "{}", cgi_result_json: "{}", interpretation_result_json: "{}",
  assessment_date: "2026-08-14T12:00:00.000Z",
};
const quotes = [
  { id: 1, quoted_amount: 120000, currency: "USD", currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", panel_beater_name: "Alpha Repairs" },
  { id: 2, quoted_amount: 135000, currency: "USD", currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", panel_beater_name: "Beta Repairs" },
];

describe("AUD-P1-006 executed L2 selection traceability across CL, CI, and FR", () => {
  beforeEach(() => {
    execute.mockReset(); end.mockReset();
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[claim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...quotes], undefined];
      return [[], undefined];
    });
  });

  it("renders benchmark method, deviation, and high-variance evidence without changing the L2 decision amount", async () => {
    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId: 990010 }, "tenant-test"),
      generateClaimsIntelligenceReport(990010, "tenant-test"),
      generateForensicDecisionReport(990010, "tenant-test"),
    ]);
    for (const html of outputs) {
      expect(html).toContain("L2 Component Validation");
      expect(html).toContain("Benchmark selected within 30% · 10.0% variance");
      expect(html).toContain("Outside 30% · lower validated value selected · 41.7% variance");
      expect(html).toContain("High submitted-price spread; verify like-for-like scope.");
      expect(html).toContain("$1,180.00");
    }
    expect(end).toHaveBeenCalledTimes(3);
  });
});
