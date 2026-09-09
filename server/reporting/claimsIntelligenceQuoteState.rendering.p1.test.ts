import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const end = vi.fn();

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(async () => ({ execute, end })),
  },
}));

vi.mock("./evidenceGovernancePresentation", () => ({
  loadEvidenceGovernanceReportData: vi.fn(async () => ({ findings: [], summary: null })),
  renderEvidenceGovernancePanel: vi.fn(() => ""),
}));

const { generateClaimsIntelligenceReport } = await import("./claimsIntelligenceReport");

const claim = {
  id: 990001,
  claim_reference: "KNG-TEST-QUOTE-STATE",
  tenant_id: "tenant-test",
  vehicle_make: "Toyota",
  vehicle_model: "Hilux",
  vehicle_year: 2021,
  vehicle_description: "Toyota Hilux 2021",
  created_at: "2026-08-14T12:00:00.000Z",
  incident_date: "2026-08-13T12:00:00.000Z",
  workflow_state: "analysis_complete",
  estimated_cost: 0,
  total_loss_indicated: 0,
  repair_to_value_ratio: 20,
  fraud_score: 0,
  fraud_risk_level: "low",
  recommendation: "REVIEW",
  cost_intelligence_json: JSON.stringify({
    compositeOptimisation: null,
    quoteOptimisation: { quotes_evaluated: 2 },
    quoteCount: 2,
    quotesReceived: 2,
  }),
  repair_intelligence_json: "[]",
  fraud_score_breakdown_json: "{}",
  ife_result_json: "{}",
  narrative_analysis_json: "{}",
  physics_analysis: "{}",
  physics_truth_json: "{}",
  cross_validation_json: "{}",
  claim_truth_json: "{}",
  enriched_photos_json: "[]",
  cgi_result_json: "{}",
  interpretation_result_json: "{}",
  assessment_date: "2026-08-14T12:00:00.000Z",
  model_version: "test",
};

const legacyQuotes = [
  { id: 1, quoted_amount: 564000, currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", quote_congruency_score: null, panel_beater_name: "The Dent Doctor" },
  { id: 2, quoted_amount: 834900, currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", quote_congruency_score: null, panel_beater_name: "Dynamic Africa Trading" },
];

describe("AUD-P1-007 executed Claims Intelligence quote-state rendering", () => {
  beforeEach(() => {
    execute.mockReset();
    end.mockReset();
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[claim], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...legacyQuotes], undefined];
      return [[], undefined];
    });
  });

  it("keeps legacy submitted amounts visible without labelling them active or rendering a false zero highest quote", async () => {
    const html = await generateClaimsIntelligenceReport(990001, "tenant-test");

    expect(html).toContain("The Dent Doctor");
    expect(html).toContain("Dynamic Africa Trading");
    expect(html).toContain('data-shared-quote-evidence="legacy-history-only"');
    expect(html).toContain("Historical quotation evidence — not a comparison.");
    expect(html).toContain("L1 — lowest eligible submitted quote");
    expect(html).toContain("L2 — KINGA Optimised");
    expect(html).toContain("Not available");
    expect(html).not.toContain("Active market quote");
    expect(html).not.toContain('data-shared-quote-evidence-matrix="active"');
    expect(end).toHaveBeenCalledOnce();
  });

  it("explains mixed-currency submitted documents without deriving an L1, L2, saving, or settlement", async () => {
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[claim], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[
        { ...legacyQuotes[0], currency_code: "USD" },
        { ...legacyQuotes[1], currency_code: "ZWL" },
      ], undefined];
      return [[], undefined];
    });

    const html = await generateClaimsIntelligenceReport(990001, "tenant-test");

    expect(html).toContain("L2 unavailable — 2 submitted quotation documents are recorded in USD and ZWL");
    expect(html).toContain("will not convert, rank, combine, or derive a lowest total, L1, L2, savings, or settlement figure");
    expect(html).toContain("Recorded in USD and ZWL");
    expect(html).not.toContain("Final L2");
  });
});
