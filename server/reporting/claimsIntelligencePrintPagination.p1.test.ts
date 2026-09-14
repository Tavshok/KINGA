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
  id: 990002,
  claim_reference: "KNG-TEST-CI-PRINT",
  tenant_id: "tenant-ci-print",
  vehicle_make: "Toyota",
  vehicle_model: "Corolla",
  vehicle_year: 2022,
  vehicle_description: "Toyota Corolla 2022",
  created_at: "2026-09-08T10:00:00.000Z",
  incident_date: "2026-09-07T10:00:00.000Z",
  workflow_state: "analysis_complete",
  estimated_cost: 0,
  total_loss_indicated: 0,
  repair_to_value_ratio: 20,
  fraud_score: 0,
  fraud_risk_level: "low",
  recommendation: "REVIEW",
  cost_intelligence_json: JSON.stringify({ compositeOptimisation: null, quoteCount: 0, quotesReceived: 0 }),
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
  assessment_date: "2026-09-08T10:00:00.000Z",
  model_version: "test",
};

describe("CI report A4 print pagination", () => {
  beforeEach(() => {
    execute.mockReset();
    end.mockReset();
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[claim], undefined];
      return [[], undefined];
    });
  });

  it("uses explicit A4 section breaks and stable section footers rather than false two-page counters", async () => {
    const html = await generateClaimsIntelligenceReport(claim.id, claim.tenant_id);

    expect(html).toContain("@page{ size:A4; margin:12mm; }");
    expect(html).toContain(".page-break{break-before:page; page-break-before:always;}");
    expect(html).toContain("thead { display:table-header-group; }");
    expect(html).toContain("table { break-inside:auto; page-break-inside:auto; }");
    expect((html.match(/class="page page-break"/g) ?? [])).toHaveLength(5);
    expect(html).toContain('<div class="page">\n<div class="section">');
    expect(html).not.toContain("Page 1 of 2");
    expect(html).not.toContain("Page 2 of 2");
    expect(html).toContain("Report overview");
    expect(html).toContain("Section 01 · Claim Identity &amp; Policy");
    expect(html).toContain("Section P · Policy &amp; Coverage Check");
    expect(html).toContain("Section 02 · Cost Intelligence");
    expect(html).toContain("Section 03 · Risk Indicators");
    expect(html).toContain("Section 04 · Evidence Snapshot");
    expect(html).toContain("Section 05 · Decision &amp; Next Steps");
    expect(html).toContain("How to Read These Cost Results");
    expect(end).toHaveBeenCalledOnce();
  });
});
