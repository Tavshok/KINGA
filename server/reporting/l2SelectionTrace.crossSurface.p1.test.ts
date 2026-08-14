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
    evidenceGovernance: {
      findings: [
        { code: "source_provenance_pending", title: "Alpha Repairs requires document and page provenance", summary: "Document and page provenance requires confirmation; the submitted component evidence remains visible for review." },
        { code: "line_pricing_not_source_verified", title: "Defective Extraction contains non-verifiable line pricing", summary: "Defective Extraction: one or more submitted line prices require extraction review; no cost has been created or inferred." },
      ],
    },
    canonicalQuoteLedger: [
      { quoteId: "1", panelBeater: "Alpha Repairs", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "2", panelBeater: "Defective Extraction", totalCostUsd: 1350, currency: "USD", status: "supplementary", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Line prices retained for review but not used as submitted component evidence." },
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
  { id: 2, quoted_amount: 135000, currency: "USD", currency_code: "USD", quote_type: "original", parent_quote_id: null, status: "submitted", panel_beater_name: "Defective Extraction" },
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

  it("renders benchmark evidence and non-blocking provenance/extraction warnings without changing the complete L2 decision amount", async () => {
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
      expect(html).toContain("Document and page provenance requires confirmation; the submitted component evidence remains visible for review.");
      expect(html).toContain("Defective Extraction: one or more submitted line prices require extraction review; no cost has been created or inferred.");
      expect(html).toContain("Defective Extraction");
      expect(html).toContain("KINGA Optimised Quote");
    }
    expect(end).toHaveBeenCalledTimes(3);
  });

  it("keeps KINGA Optimised Quote visible as a review-required priced scope across CL, CI, and FR", async () => {
    const reviewCost = JSON.parse(JSON.stringify(costIntelligence));
    Object.assign(reviewCost.compositeOptimisation, {
      isComplete: false,
      l2Status: "incomplete_scope",
      quoteScopeStatus: "incomplete_scope",
      l2CompositeOptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: 990,
      partialPricedScopeUsd: 990,
      l1LowestSubmittedCostUsd: 1200,
      missingRequiredComponents: ["Headlamp alignment"],
      canonicalQuoteLedger: [
        { quoteId: "q-eligible", panelBeater: "Eligible Repairs", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
        { quoteId: "q-defective", panelBeater: "Defective Extraction", totalCostUsd: 900, currency: "USD", status: "supplementary", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Inferred line price excluded from component selection." },
        { quoteId: "q-total-only", panelBeater: "Total-only Quote", totalCostUsd: 1300, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Whole-quote anchor only; no submitted component rows." },
        { quoteId: "q-incomplete", panelBeater: "Incomplete Scope", totalCostUsd: 1250, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Does not price the required Headlamp alignment component." },
        { quoteId: "q-cancelled", panelBeater: "Cancelled Quote", totalCostUsd: 600, currency: "USD", status: "historical", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Cancelled quotation retained as history." },
        { quoteId: "q-rejected", panelBeater: "Rejected Quote", totalCostUsd: 650, currency: "USD", status: "historical", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Rejected quotation retained as history." },
        { quoteId: "q-ineligible", panelBeater: "Unsupported Scope", totalCostUsd: 500, currency: "USD", status: "excluded", evidenceEligibility: "ineligible", evidenceEligibilityReason: "Unsupported repair scope." },
        { quoteId: "q-original", panelBeater: "Revised Repairer", totalCostUsd: 1500, currency: "USD", status: "superseded", evidenceEligibility: "final_l2_eligible", evidenceEligibilityReason: "Superseded by revised quotation." },
        { quoteId: "q-revised", panelBeater: "Revised Repairer", totalCostUsd: 1400, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
      ],
    });
    const reviewClaim = { ...claim, cost_intelligence_json: JSON.stringify(reviewCost) };
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[reviewClaim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...quotes], undefined];
      return [[], undefined];
    });

    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId: 990010 }, "tenant-test"),
      generateClaimsIntelligenceReport(990010, "tenant-test"),
      generateForensicDecisionReport(990010, "tenant-test"),
    ]);
    for (const html of outputs) {
      expect(html).toContain("KINGA Optimised Quote");
      expect(html).toContain("Review-required priced scope");
      expect(html).toContain("not all-in");
      expect(html).toContain("Headlamp alignment");
      expect(html).toContain("human review");
      expect(html).toContain("Defective Extraction");
      expect(html).toContain("Total-only Quote");
      expect(html).toContain("Incomplete Scope");
      expect(html).toContain("Cancelled Quote");
      expect(html).toContain("Rejected Quote");
      expect(html).toContain("Unsupported Scope");
      expect(html).not.toContain("KINGA insurer cost recommendation.");
    }
  });

  it("keeps KINGA Optimised Quote visible as human review when all quote evidence is comparison-only or ineligible", async () => {
    const noEligibleCost = JSON.parse(JSON.stringify(costIntelligence));
    Object.assign(noEligibleCost.compositeOptimisation, {
      isComplete: false,
      l2Status: "incomplete_scope",
      quoteScopeStatus: "incomplete_scope",
      l1SubmittedCostUsd: null,
      l2CompositeOptimisedCostUsd: null,
      l2EvidenceQualifiedComparisonUsd: null,
      partialPricedScopeUsd: null,
      missingRequiredComponents: ["No eligible active submitted component evidence"],
      canonicalQuoteLedger: [
        { quoteId: "q-cancelled", panelBeater: "Cancelled Quote", totalCostUsd: 600, currency: "USD", status: "historical", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Cancelled quotation retained as history only." },
        { quoteId: "q-rejected", panelBeater: "Rejected Quote", totalCostUsd: 650, currency: "USD", status: "historical", evidenceEligibility: "comparison_only", evidenceEligibilityReason: "Rejected quotation retained as history only." },
        { quoteId: "q-ineligible", panelBeater: "Unsupported Scope", totalCostUsd: 500, currency: "USD", status: "excluded", evidenceEligibility: "ineligible", evidenceEligibilityReason: "Unsupported repair scope." },
      ],
    });
    const noEligibleClaim = { ...claim, cost_intelligence_json: JSON.stringify(noEligibleCost) };
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[noEligibleClaim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...quotes], undefined];
      return [[], undefined];
    });

    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId: 990010 }, "tenant-test"),
      generateClaimsIntelligenceReport(990010, "tenant-test"),
      generateForensicDecisionReport(990010, "tenant-test"),
    ]);
    for (const html of outputs) {
      expect(html).toContain("KINGA Optimised Quote");
      expect(html).toContain("Human review required");
      expect(html).toContain("No eligible active submitted component evidence");
      expect(html).toContain("Cancelled Quote");
      expect(html).toContain("Rejected Quote");
      expect(html).toContain("Unsupported Scope");
      expect(html).not.toContain("Review-required priced scope");
    }
  });

  it("renders the same combined KINGA economic and technical write-off recommendation across CL, CI, and FR", async () => {
    const writeOffCost = JSON.parse(JSON.stringify(costIntelligence));
    writeOffCost.repairabilityDecision = {
      kind: "economic_and_technical_write_off_recommended",
      label: "Economic and technical write-off recommended",
      detail: "KINGA’s complete repair-to-value assessment is 85.0%, meeting the 70% economic threshold; dedicated structural analysis and severe physics evidence also support technical write-off.",
      writeOffRecommended: true,
      repairToValueRatio: 0.85,
      economicEvidenceComplete: true,
      technicalEvidenceComplete: true,
    };
    const writeOffClaim = {
      ...claim,
      total_loss_indicated: 1,
      repair_to_value_ratio: 85,
      cost_intelligence_json: JSON.stringify(writeOffCost),
    };
    execute.mockImplementation(async (query: string) => {
      if (query.includes("FROM claims c")) return [[writeOffClaim], undefined];
      if (query.includes("FROM ai_assessments a WHERE a.claim_id")) return [[{ damaged_components_json: "[]" }], undefined];
      if (query.includes("FROM panel_beater_quotes q")) return [[...quotes], undefined];
      return [[], undefined];
    });

    const outputs = await Promise.all([
      generateReportHtml("claim.assessment", { claimId: 990010 }, "tenant-test"),
      generateClaimsIntelligenceReport(990010, "tenant-test"),
      generateForensicDecisionReport(990010, "tenant-test"),
    ]);
    for (const html of outputs) {
      expect(html).toContain("Economic and technical write-off recommended");
      expect(html).toContain("70% economic threshold");
      expect(html).toContain("severe physics evidence");
      expect(html).not.toContain("Settlement authorised");
    }
  });
});
