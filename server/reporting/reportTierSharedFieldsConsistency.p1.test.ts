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

const tenantId = "tenant-report-consistency";
const claimId = 990071;
const shared = {
  decisionStatus: "REVIEW",
  fraudScore: "57",
  marketValue: "$54,321.00",
};

const claim = {
  id: claimId,
  claim_reference: "KNG-TIER-CONSISTENCY",
  tenant_id: tenantId,
  status: "analysis_complete",
  workflow_state: "analysis_complete",
  vehicle_make: "Toyota",
  vehicle_model: "Hilux",
  vehicle_year: 2021,
  vehicle_description: "Toyota Hilux 2021",
  vehicle_registration: "CONSISTENCY-001",
  insurer_name: "Consistency Insurer",
  created_at: "2026-08-20T10:00:00.000Z",
  incident_date: "2026-08-19T10:00:00.000Z",
  estimated_cost: 180000,
  vehicle_market_value: 5432100,
  total_loss_indicated: 0,
  repair_to_value_ratio: 3.31,
  fraud_score: 57,
  fraud_risk_level: "moderate",
  recommendation: "REVIEW",
  confidence_score: 90,
  model_version: "tier-consistency-test",
  cost_intelligence_json: JSON.stringify({ compositeOptimisation: { isComplete: false, l2Status: "incomplete_scope", quoteReceiptStatus: "no_quotes", quoteScopeStatus: "incomplete_scope", canonicalQuoteLedger: [] } }),
  repair_intelligence_json: "{}",
  fraud_score_breakdown_json: "{}",
  physics_analysis: "{}",
  physics_truth_json: "{}",
  cross_validation_json: "{}",
  claim_truth_json: "{}",
  enriched_photos_json: "[]",
  decision_authority_json: "{}",
  ife_result_json: "{}",
  narrative_analysis_json: "{}",
  cgi_result_json: "{}",
  interpretation_result_json: "{}",
  assessment_date: "2026-08-20T10:00:00.000Z",
};

function extractSharedFields(html: string) {
  const fraud =
    html.match(/Fraud (?:Score|Risk)[\s\S]{0,300}?class="value">(\d{1,3})/i)?.[1] ??
    html.match(/font-family:monospace">(\d{1,3})<\/div>\s*<div[^>]*>Fraud Score<\/div>/i)?.[1];
  const market = html.includes(shared.marketValue) ? shared.marketValue : undefined;
  const decision = html.match(/\b(REVIEW)\b/i)?.[1]?.toUpperCase();
  return { decision, fraud, market };
}

function extractCostState(html: string) {
  return html.match(/<table class="kv cost-evidence-state"><tbody>[\s\S]*?<\/table>/)?.[0];
}

describe("report tier shared-field consistency", () => {
  beforeEach(() => {
    execute.mockReset();
    end.mockReset();
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[claim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[], undefined];
      return [[], undefined];
    });
  });

  it("renders identical decision status, fraud score, and market value from one claim fixture across CL, CI, and FR", async () => {
    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId }, tenantId),
      generateClaimsIntelligenceReport(claimId, tenantId),
      generateForensicDecisionReport(claimId, tenantId),
    ]);

    const actual = outputs.map(extractSharedFields);
    for (const rendered of actual) {
      expect(rendered).toEqual({
        decision: shared.decisionStatus,
        fraud: shared.fraudScore,
        market: shared.marketValue,
      });
    }
    expect(actual[0]).toEqual(actual[1]);
    expect(actual[1]).toEqual(actual[2]);
    // Claim Assessment and Claims Intelligence each resolve one canonical
    // report record. The Forensic tier resolves its own ForensicReportModel
    // connection in addition to its canonical report record: four scoped
    // connections in total. Package C's pure presenter opens none.
    expect(end).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["unavailable", { isComplete: false, l2Status: "incomplete_scope", canonicalQuoteLedger: [] }, "Unavailable — reconciliation required."],
    ["partial evidence", { isComplete: false, l2Status: "evidence_qualified", l2EvidenceQualifiedComparisonUsd: 90, canonicalQuoteLedger: [{ panelBeater: "Repairer A", totalCostUsd: 100, currency: "USD", status: "active" }] }, "Partial evidence comparison"],
    ["final L2", { isComplete: true, l2Status: "complete", l1LowestSubmittedCostUsd: 100, l2CompositeOptimisedCostUsd: 90, canonicalQuoteLedger: [{ panelBeater: "Repairer A", totalCostUsd: 100, currency: "USD", status: "active" }] }, "Final L2"],
  ])("renders an identical canonical cost state across all tiers: %s", async (_name, composite, expected) => {
    claim.cost_intelligence_json = JSON.stringify({ compositeOptimisation: composite });
    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId }, tenantId),
      generateClaimsIntelligenceReport(claimId, tenantId),
      generateForensicDecisionReport(claimId, tenantId),
    ]);
    const states = outputs.map(extractCostState);
    expect(states.every((state) => state === states[0])).toBe(true);
    expect(states[0]).toContain(expected);
  });
});
