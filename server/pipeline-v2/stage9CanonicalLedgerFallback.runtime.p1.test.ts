import { describe, expect, it, vi } from "vitest";

const getComponentBenchmarks = vi.fn();
const getComponentBenchmarksFromTrainingData = vi.fn();

vi.mock("../db", () => ({
  insertCostLearningRecord: vi.fn(async () => undefined),
  getActiveCalibrationMultiplier: vi.fn(async () => null),
  getComponentBenchmarks,
  getComponentBenchmarksFromTrainingData,
}));

const { runCostOptimisationStage } = await import("./stage-9-cost");

describe("AUD-P1-008 no-write Stage 9 canonical evidence persistence", () => {
  it("retains active canonical quote state, source count, and L1 on the real Stage 9 execution path", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockRejectedValue(new Error("simulated benchmark-source failure"));
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const ctx = {
      log: vi.fn(),
      db: null,
      tenantRates: null,
      tenantCountry: "ZW",
      runId: "no-write-stage-9",
    } as any;
    const claimRecord = {
      claimId: 990002,
      marketRegion: "ZW",
      vehicle: { make: "Toyota", model: "Hilux", year: 2021 },
      repairQuote: {},
      valuation: null,
    } as any;
    const stage3 = {
      inputRecovery: {
        extracted_quotes: [
          {
            quote_id: "q-1",
            panel_beater: "Repairer Alpha",
            total_cost: 1200,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 1200, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-2",
            panel_beater: "Repairer Beta",
            total_cost: 1500,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 1500, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-cancelled",
            panel_beater: "Withdrawn Repairs",
            total_cost: 900,
            currency: "USD",
            quote_type: "original",
            workflow_status: "cancelled",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 900, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-rejected",
            panel_beater: "Rejected Repairs",
            total_cost: 800,
            currency: "USD",
            quote_type: "original",
            workflow_status: "rejected",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 800, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-ineligible",
            panel_beater: "Scope Defect Repairs",
            total_cost: 700,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            evidence_eligibility: "ineligible",
            evidence_eligibility_reason: "Unsupported repair scope.",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 700, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-original",
            panel_beater: "Revision Repairs",
            total_cost: 1600,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 1600, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
          {
            quote_id: "q-revised",
            parent_quote_id: "q-original",
            panel_beater: "Revision Repairs",
            total_cost: 1300,
            currency: "USD",
            quote_type: "revised",
            workflow_status: "submitted",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 1300, is_repair: true, is_replacement: false }],
            confidence: "high",
          },
        ],
      },
    } as any;
    const damageAnalysis = { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any;
    const physicsAnalysis = { accidentSeverity: "minor" } as any;

    const result = await runCostOptimisationStage(ctx, claimRecord, damageAnalysis, physicsAnalysis, stage3, null);
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;

    expect(result.status).toBe("degraded");
    expect(composite).toMatchObject({
      quoteReceiptStatus: "quotes_received",
      l1SubmittedCostUsd: 1200,
      quotesEvaluated: 3,
      sourceQuotesReceived: 7,
    });
    expect(["incomplete_scope", "evidence_qualified", "reconciliation_required", "complete"]).toContain(composite.l2Status);
    expect(composite.canonicalQuoteLedger).toMatchObject([
      { quoteId: "q-1", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "q-2", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "q-cancelled", status: "historical", evidenceEligibility: "comparison_only" },
      { quoteId: "q-rejected", status: "historical", evidenceEligibility: "comparison_only" },
      { quoteId: "q-ineligible", status: "excluded", evidenceEligibility: "ineligible" },
      { quoteId: "q-original", status: "superseded", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "q-revised", status: "active", evidenceEligibility: "final_l2_eligible" },
    ]);
  });

  it("selects a complete final L2 only from eligible active quotes when cancelled, rejected, ineligible, and superseded evidence is also present", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockResolvedValue([
      { component: "mystery part", outcome: "repair", p25Usd: 1100, medianUsd: 1200, p75Usd: 1300, sampleSize: 12, vehicleMakeFiltered: false },
    ]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const quote = (quoteId: string, amount: number, workflowStatus: string, extra: Record<string, unknown> = {}) => ({
      quote_id: quoteId, panel_beater: quoteId, total_cost: amount, currency: "USD", quote_type: "original",
      workflow_status: workflowStatus, document_category: "repair_quote", components: ["Mystery Part"],
      source_document_index: 1, source_page_numbers: [1],
      line_items: [{ component: "Mystery Part", line_total: amount, is_repair: true, is_replacement: false }], confidence: "high", ...extra,
    });
    const ctx = { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-final-l2" } as any;
    const stage3 = {
      inputRecovery: {
        extracted_quotes: [
          quote("q-active-low", 1200, "submitted"),
          quote("q-active-high", 1500, "submitted"),
          quote("q-cancelled", 900, "cancelled"),
          quote("q-rejected", 800, "rejected"),
          quote("q-ineligible", 700, "submitted", { evidence_eligibility: "ineligible" }),
          quote("q-original", 1600, "submitted"),
          quote("q-revised", 1300, "submitted", { quote_type: "revised", parent_quote_id: "q-original" }),
        ],
      },
    } as any;
    const result = await runCostOptimisationStage(
      ctx,
      { claimId: 990003, marketRegion: "ZW", vehicle: { make: "Unknown", model: "Fixture", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Mystery Part", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      stage3,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;

    expect(composite).toMatchObject({
      l1SubmittedCostUsd: 1200,
      l2CompositeOptimisedCostUsd: 1200,
      l2Status: "complete",
      quotesEvaluated: 3,
      sourceQuotesReceived: 7,
      isComplete: true,
    });
    expect(composite.compositeLineItems).toMatchObject([
      { componentName: "mystery part", selectedCostUsd: 1200, l2SelectionMethod: "BENCHMARK_WITHIN_30_PCT" },
    ]);
    expect(composite.canonicalQuoteLedger.filter((entry: any) => entry.status === "active").map((entry: any) => entry.quoteId))
      .toEqual(["q-active-low", "q-active-high", "q-revised"]);
    expect(composite.canonicalQuoteLedger.filter((entry: any) => entry.status !== "active").map((entry: any) => entry.quoteId))
      .toEqual(expect.arrayContaining(["q-cancelled", "q-rejected", "q-ineligible", "q-original"]));
  });

  it("publishes L2 from covered active submitted lines while retaining provenance and header reconciliation as quote issues", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockResolvedValue([]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const result = await runCostOptimisationStage(
      { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-quote-issues-published-l2" } as any,
      { claimId: 990004, marketRegion: "ZW", vehicle: { make: "Unknown", model: "Fixture", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      {
        inputRecovery: {
          extracted_quotes: [{
            quote_id: "q-warning-only",
            panel_beater: "Repairer With A Quote Issue",
            total_cost: 1100,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            document_category: "repair_quote",
            components: ["Front Bumper"],
            // Deliberately no source document/page metadata. The itemised price
            // is still submitted evidence and must remain usable for L2.
            line_items: [{ component: "Front Bumper", line_total: 1000, is_repair: true, is_replacement: false }],
            confidence: "high",
          }],
        },
      } as any,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;

    expect(composite).toMatchObject({
      l1SubmittedCostUsd: 1100,
      l2Status: "complete",
      isComplete: true,
      allInReconciliationRequired: true,
      evidenceGovernance: {
        readiness: "published_with_quote_issues",
        l2Eligible: true,
      },
    });
    expect(composite.l2CompositeOptimisedCostUsd).toBeGreaterThan(0);
    expect(composite.savingsL1vsL2Usd).toBe(
      composite.l1LowestSubmittedCostUsd - composite.l2CompositeOptimisedCostUsd,
    );
    expect(composite.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: "Front Bumper",
        allQuotedPrices: expect.arrayContaining([expect.objectContaining({ costUsd: 1000 })]),
      }),
    ]));
    expect(composite.evidenceGovernance.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "source_provenance_pending" }),
    ]));
    expect(composite.quoteReconciliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "reconciliation_required", unexplainedResidualUsd: 100 }),
    ]));
  });

  it("presents human review with no numeric L1/L2 when every price is an extraction fallback", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockResolvedValue([]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const result = await runCostOptimisationStage(
      { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-inferred-price-hard-stop" } as any,
      { claimId: 990005, marketRegion: "ZW", vehicle: { make: "Unknown", model: "Fixture", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      {
        inputRecovery: {
          extracted_quotes: [{
            quote_id: "q-inferred-only",
            panel_beater: "Repairer With Inferred Pricing",
            total_cost: 1000,
            currency: "USD",
            quote_type: "original",
            workflow_status: "submitted",
            document_category: "repair_quote",
            source_document_index: 1,
            source_page_numbers: [1],
            extraction_warnings: ["proportional_fallback_used"],
            components: ["Front Bumper"],
            line_items: [{ component: "Front Bumper", line_total: 1000, is_repair: true, is_replacement: false }],
            confidence: "high",
          }],
        },
      } as any,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;

    expect(composite).toMatchObject({
      l1SubmittedCostUsd: null,
      l2CompositeOptimisedCostUsd: null,
      l2Status: "unavailable",
      isComplete: false,
    });
    expect(composite.canonicalQuoteLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({ quoteId: "q-inferred-only", status: "historical", evidenceEligibility: "comparison_only" }),
    ]));
  });

  it("continues final L2 from the remaining eligible submitted line when another active quote has only inferred pricing", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockResolvedValue([]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const result = await runCostOptimisationStage(
      { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-remaining-eligible-l2" } as any,
      { claimId: 990006, marketRegion: "ZW", vehicle: { make: "Unknown", model: "Fixture", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      {
        inputRecovery: {
          extracted_quotes: [
            {
              quote_id: "q-eligible", panel_beater: "Eligible Repairs", total_cost: 1100, currency: "USD",
              quote_type: "original", workflow_status: "submitted", document_category: "repair_quote",
              source_document_index: 1, source_page_numbers: [1], components: ["Front Bumper"],
              line_items: [{ component: "Front Bumper", line_total: 1000, is_repair: true, is_replacement: false }], confidence: "high",
            },
            {
              quote_id: "q-defective", panel_beater: "Defective Extraction", total_cost: 900, currency: "USD",
              quote_type: "original", workflow_status: "submitted", document_category: "repair_quote",
              source_document_index: 2, source_page_numbers: [1], extraction_warnings: ["proportional_fallback_used"], components: ["Front Bumper"],
              line_items: [{ component: "Front Bumper", line_total: 900, is_repair: true, is_replacement: false }], confidence: "low",
            },
          ],
        },
      } as any,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;

    expect(composite).toMatchObject({
      l1SubmittedCostUsd: 1100,
      l2Status: "complete",
      isComplete: true,
      quotesEvaluated: 1,
    });
    expect(composite.l2CompositeOptimisedCostUsd).toBeGreaterThan(0);
    expect(composite.savingsL1vsL2Usd).toBe(
      composite.l1LowestSubmittedCostUsd - composite.l2CompositeOptimisedCostUsd,
    );
    expect(composite.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: "Front Bumper",
        selectedSubmittedFromQuote: "Eligible Repairs",
        allQuotedPrices: [expect.objectContaining({ quote: "Eligible Repairs", costUsd: 1000 })],
      }),
    ]));
    expect(composite.canonicalQuoteLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({ quoteId: "q-defective", status: "historical", evidenceEligibility: "comparison_only" }),
    ]));
  });

  it("isolates every non-selected quote state while preserving L1, L2, savings, and review findings from remaining eligible evidence", async () => {
    getComponentBenchmarks.mockReset();
    getComponentBenchmarksFromTrainingData.mockReset();
    getComponentBenchmarks.mockResolvedValue([]);
    getComponentBenchmarksFromTrainingData.mockResolvedValue([]);
    vi.useFakeTimers();
    const quote = (quoteId: string, repairer: string, total: number, workflowStatus: string, lineItems: any[], extra: Record<string, unknown> = {}) => ({
      quote_id: quoteId, panel_beater: repairer, total_cost: total, currency: "USD", quote_type: "original",
      workflow_status: workflowStatus, document_category: "repair_quote", source_document_index: 1, source_page_numbers: [1],
      components: ["Front Bumper"], line_items: lineItems, confidence: "high", ...extra,
    });
    const result = await runCostOptimisationStage(
      { log: vi.fn(), db: null, tenantRates: null, tenantCountry: "ZW", runId: "no-write-all-nonselected-states" } as any,
      { claimId: 990007, marketRegion: "ZW", vehicle: { make: "Unknown", model: "Fixture", year: 2021 }, repairQuote: {}, valuation: null } as any,
      { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any,
      { accidentSeverity: "minor" } as any,
      { inputRecovery: { extracted_quotes: [
        quote("q-eligible", "Eligible Repairs", 1100, "submitted", [{ component: "Front Bumper", line_total: 1000, is_repair: true, is_replacement: false }]),
        quote("q-defective", "Defective Extraction", 900, "submitted", [{ component: "Front Bumper", line_total: 900, is_repair: true, is_replacement: false }], { extraction_warnings: ["proportional_fallback_used"] }),
        quote("q-total-only", "Total-only Quote", 1300, "submitted", []),
        quote("q-incomplete", "Incomplete Scope", 1250, "submitted", [{ component: "Door Trim", line_total: 1250, is_repair: true, is_replacement: false }]),
        quote("q-cancelled", "Cancelled Quote", 16000, "cancelled", [{ component: "Front Bumper", line_total: 16000, is_repair: true, is_replacement: false }]),
        quote("q-rejected", "Rejected Quote", 15000, "rejected", [{ component: "Front Bumper", line_total: 15000, is_repair: true, is_replacement: false }]),
        quote("q-ineligible", "Unsupported Scope", 13000, "submitted", [{ component: "Front Bumper", line_total: 13000, is_repair: true, is_replacement: false }], { evidence_eligibility: "ineligible" }),
        quote("q-original", "Revised Repairer", 14000, "submitted", [{ component: "Front Bumper", line_total: 14000, is_repair: true, is_replacement: false }]),
        quote("q-revised", "Revised Repairer", 1400, "submitted", [], { quote_type: "revised", parent_quote_id: "q-original" }),
      ] } } as any,
      null,
    );
    vi.clearAllTimers();
    vi.useRealTimers();
    const composite = (result.data as any).compositeOptimisation;
    expect(composite).toMatchObject({
      l1SubmittedCostUsd: 1100,
      l2Status: "complete",
      isComplete: true,
      quotesEvaluated: 4,
      sourceQuotesReceived: 9,
    });
    expect(composite.l2CompositeOptimisedCostUsd).toBeGreaterThan(0);
    expect(composite.savingsL1vsL2Usd).toBe(composite.l1LowestSubmittedCostUsd - composite.l2CompositeOptimisedCostUsd);
    expect(composite.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentName: "Front Bumper", selectedSubmittedFromQuote: "Eligible Repairs" }),
    ]));
    const statusByQuote = Object.fromEntries(composite.canonicalQuoteLedger.map((entry: any) => [entry.quoteId, entry.status]));
    expect(statusByQuote).toMatchObject({
      "q-eligible": "active", "q-defective": "historical", "q-total-only": "active", "q-incomplete": "active", "q-cancelled": "historical", "q-rejected": "historical", "q-ineligible": "excluded", "q-original": "superseded", "q-revised": "active",
    });
    expect(composite.canonicalQuoteLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({ quoteId: "q-defective", status: "historical", evidenceEligibility: "comparison_only" }),
    ]));
    const costDecision = (result.data as any).costDecision;
    expect(costDecision?.deviation_analysis.highest_quote_usd).toBe(1400);
    expect(costDecision?.recommendation).toBe("PROCEED_TO_ASSESSMENT");
    expect(costDecision?.anomalies).toEqual([]);
    expect(costDecision?.negotiation_guidance).toMatchObject({
      target_usd: 1100,
      overpriced_quotes: [],
      strategy: expect.stringContaining("within acceptable range"),
    });
    expect(JSON.stringify(costDecision)).not.toContain("Cancelled Quote");
    expect(JSON.stringify(costDecision)).not.toContain("Rejected Quote");
    expect(JSON.stringify(costDecision)).not.toContain("Unsupported Scope");
    expect(JSON.stringify(costDecision)).not.toContain("Defective Extraction");
  });
});
