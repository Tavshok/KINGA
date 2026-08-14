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
});
