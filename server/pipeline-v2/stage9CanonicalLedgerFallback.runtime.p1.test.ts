import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  insertCostLearningRecord: vi.fn(async () => undefined),
  getActiveCalibrationMultiplier: vi.fn(async () => null),
  getComponentBenchmarks: vi.fn(async () => {
    throw new Error("simulated benchmark-source failure");
  }),
  getComponentBenchmarksFromTrainingData: vi.fn(async () => []),
}));

const { runCostOptimisationStage } = await import("./stage-9-cost");

describe("AUD-P1-008 no-write Stage 9 canonical evidence persistence", () => {
  it("retains active canonical quote state, source count, and L1 on the real Stage 9 execution path", async () => {
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
        ],
      },
    } as any;
    const damageAnalysis = { damagedParts: [{ name: "Front Bumper", severity: "moderate" }] } as any;
    const physicsAnalysis = { accidentSeverity: "minor" } as any;

    const result = await runCostOptimisationStage(ctx, claimRecord, damageAnalysis, physicsAnalysis, stage3, null);
    const composite = (result.data as any).compositeOptimisation;

    expect(result.status).toBe("degraded");
    expect(composite).toMatchObject({
      quoteReceiptStatus: "quotes_received",
      l1SubmittedCostUsd: 1200,
      quotesEvaluated: 2,
      sourceQuotesReceived: 2,
    });
    expect(["incomplete_scope", "evidence_qualified", "reconciliation_required", "complete"]).toContain(composite.l2Status);
    expect(composite.canonicalQuoteLedger).toMatchObject([
      { quoteId: "q-1", status: "active", evidenceEligibility: "final_l2_eligible" },
      { quoteId: "q-2", status: "active", evidenceEligibility: "final_l2_eligible" },
    ]);
  });
});
