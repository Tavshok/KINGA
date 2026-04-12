/**
 * phase2-fixes.test.ts
 *
 * Tests for Phase 2A, 2B, and 2C implementations:
 *   - Phase 2A: Forensic Confidence Degradation Index (FCDI)
 *   - Phase 2B: Economic Context Engine (ECE) — policy-based currency
 *   - Phase 2C: Cross-Engine Consensus D9/D10 + Assumption FLAGGED_EXCEPTION routing
 */

import { describe, it, expect } from "vitest";
import { computeFCDI, type FCDIInput } from "./pipeline-v2/forensicCDI";
import { deriveEconomicContext, applyNCI, type EconomicContextInput } from "./pipeline-v2/economicContextEngine";
import { computeConsensus } from "./pipeline-v2/crossEngineConsensus";
import { createPipelineStateMachine } from "./pipeline-v2/pipelineStateMachine";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2A: FCDI Tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal FCDIInput from a simple description.
 * The actual API takes stages: Record<string, { status, degraded?, _timedOut?, confidenceScore? }>
 * and totalAssumptionCount.
 */
function buildFCDIInput(opts: {
  fallbackCount?: number;
  timedOutCount?: number;
  skippedCritical?: string[];
  assumptionCount?: number;
  lowConfStages?: number;
}): FCDIInput {
  const stages: FCDIInput["stages"] = {};
  const { fallbackCount = 0, timedOutCount = 0, skippedCritical = [], assumptionCount = 0, lowConfStages = 0 } = opts;

  // Add normal stages
  for (let i = 0; i < 10; i++) {
    stages[`stage_${i}`] = { status: "complete", confidenceScore: 85 };
  }

  // Mark fallback stages
  for (let i = 0; i < fallbackCount; i++) {
    stages[`stage_${i}`] = { status: "degraded", degraded: true, confidenceScore: 60 };
  }

  // Mark timed-out stages
  for (let i = fallbackCount; i < fallbackCount + timedOutCount; i++) {
    stages[`stage_${i}`] = { status: "degraded", _timedOut: true, confidenceScore: 40 };
  }

  // Mark skipped critical stages
  for (const stageId of skippedCritical) {
    stages[stageId] = { status: "skipped" };
  }

  // Mark low-confidence stages
  for (let i = 0; i < lowConfStages; i++) {
    stages[`low_conf_${i}`] = { status: "complete", confidenceScore: 30 };
  }

  return { stages, totalAssumptionCount: assumptionCount };
}

describe("Phase 2A: Forensic Confidence Degradation Index (FCDI)", () => {
  it("returns HIGH label when no fallbacks and no assumptions", () => {
    const result = computeFCDI(buildFCDIInput({ fallbackCount: 0, assumptionCount: 0 }));
    // No penalties → score should be 1.0 → 100% → label HIGH
    expect(result.scorePercent).toBe(100);
    expect(result.label).toBe("HIGH");
    expect(result.breakdown.totalPenalty).toBe(0);
  });

  it("returns MEDIUM or LOW label when multiple fallbacks present", () => {
    // 4 fallbacks + 1 timeout + 8 assumptions → significant penalty
    const result = computeFCDI(buildFCDIInput({
      fallbackCount: 4,
      timedOutCount: 1,
      assumptionCount: 8,
    }));
    expect(result.scorePercent).toBeLessThan(80);
    expect(["MEDIUM", "LOW", "CRITICAL"]).toContain(result.label);
  });

  it("returns CRITICAL label and maximum penalty when critical stages skipped", () => {
    // 5 fallbacks + 2 timeouts + 15 assumptions + 2 critical stages skipped
    const result = computeFCDI(buildFCDIInput({
      fallbackCount: 5,
      timedOutCount: 2,
      assumptionCount: 15,
      skippedCritical: ["1_ingestion", "2_extraction"],
    }));
    expect(result.scorePercent).toBeLessThan(40);
    expect(result.label).toBe("CRITICAL");
    expect(result.breakdown.skippedPenalty).toBeGreaterThan(0);
  });

  it("penalises timeout stages more than fallback stages", () => {
    const withFallback = computeFCDI(buildFCDIInput({ fallbackCount: 1, timedOutCount: 0 }));
    const withTimeout = computeFCDI(buildFCDIInput({ fallbackCount: 0, timedOutCount: 1 }));
    // Timeout penalty weight (W_TIMEOUT) > fallback penalty weight (W_FALLBACK)
    expect(withTimeout.breakdown.totalPenalty).toBeGreaterThan(withFallback.breakdown.totalPenalty);
  });

  it("breakdown fields are all non-negative numbers", () => {
    const result = computeFCDI(buildFCDIInput({
      fallbackCount: 3,
      timedOutCount: 1,
      assumptionCount: 6,
    }));
    const b = result.breakdown;
    expect(b.fallbackCount).toBe(3);
    expect(b.timeoutCount).toBe(1);
    expect(b.assumptionCount).toBe(6);
    expect(b.fallbackPenalty).toBeGreaterThan(0);
    expect(b.timeoutPenalty).toBeGreaterThan(0);
    expect(b.assumptionPenalty).toBeGreaterThan(0);
    expect(b.totalPenalty).toBeGreaterThan(0);
    expect(b.totalPenalty).toBeLessThanOrEqual(1.0);
  });

  it("score is always between 0 and 1", () => {
    // Extreme case — everything wrong
    const extreme = computeFCDI(buildFCDIInput({
      fallbackCount: 13,
      timedOutCount: 13,
      assumptionCount: 100,
      skippedCritical: ["1_ingestion", "2_extraction", "6_damage_analysis", "7_unified", "8_fraud"],
    }));
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(1);
    expect(extreme.scorePercent).toBeGreaterThanOrEqual(0);
    expect(extreme.scorePercent).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2B: Economic Context Engine Tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal EconomicContextInput for testing.
 * deriveEconomicContext is async (it queries the DB for exchange rates),
 * so we test the synchronous helpers (applyNCI) and the pure logic separately.
 */
describe("Phase 2B: Economic Context Engine (ECE)", () => {
  it("applyNCI scales USD cost by normalised cost index", () => {
    // NCI = 0.5 means costs in policy currency are half the USD benchmark
    const result = applyNCI(100_00, 0.5); // $100 USD → $50 in policy currency
    expect(result).toBeCloseTo(50_00, 0);
  });

  it("applyNCI with NCI=1.0 returns the same cost (USD baseline)", () => {
    const result = applyNCI(250_00, 1.0);
    expect(result).toBe(250_00);
  });

  it("applyNCI with NCI>1.0 returns higher cost (weak currency market)", () => {
    // NCI=2.0 means local currency costs are 2x the USD benchmark
    const result = applyNCI(100_00, 2.0);
    expect(result).toBeCloseTo(200_00, 0);
  });

  it("deriveEconomicContext returns policy currency — not incident location", async () => {
    // Policy is Zimbabwean — ECE must use ZWG regardless of where the incident occurred
    const input: EconomicContextInput = {
      tenantId: "test-tenant-zw",
      primaryCurrency: "ZWG",
      primaryCurrencySymbol: "ZWG",
      labourRateUsdPerHour: 8,
      marketRegion: "ZW",
    };
    const ctx = await deriveEconomicContext(input);
    expect(ctx.currency).toBe("ZWG");
    // PPP factor for ZW should be > 1 (money goes further)
    expect(ctx.pppFactor).toBeGreaterThan(1.0);
    // Parts source profile should be defined
    expect(ctx.partsSourceProfile).toBeDefined();
  });

  it("deriveEconomicContext computes labour rate in policy currency", async () => {
    const input: EconomicContextInput = {
      tenantId: "test-tenant-za",
      primaryCurrency: "ZAR",
      primaryCurrencySymbol: "R",
      labourRateUsdPerHour: 25,
      marketRegion: "ZA",
    };
    const ctx = await deriveEconomicContext(input);
    // Labour rate in policy currency = USD rate × exchange rate
    // The exchange rate comes from DB (or defaults to 1.0 if not found)
    expect(ctx.labourRatePolicyCurrencyPerHour).toBeGreaterThan(0);
    expect(ctx.currency).toBe("ZAR");
  });

  it("deriveEconomicContext includes normalisedCostIndex", async () => {
    const input: EconomicContextInput = {
      tenantId: "test-tenant-us",
      primaryCurrency: "USD",
      primaryCurrencySymbol: "$",
      labourRateUsdPerHour: 85,
      marketRegion: "US",
    };
    const ctx = await deriveEconomicContext(input);
    // NCI for US should be close to 1.0 (baseline)
    expect(ctx.normalisedCostIndex).toBeGreaterThan(0);
    expect(ctx.normalisedCostIndex).toBeLessThan(5);
  });

  it("deriveEconomicContext handles unknown region gracefully with DEFAULT PPP", async () => {
    const input: EconomicContextInput = {
      tenantId: "test-tenant-xx",
      primaryCurrency: "XYZ",
      primaryCurrencySymbol: "X",
      labourRateUsdPerHour: 10,
      marketRegion: "XX", // Unknown region
    };
    const ctx = await deriveEconomicContext(input);
    // Should not throw — should use DEFAULT PPP factor (1.8)
    expect(ctx.pppFactor).toBe(1.8);
    expect(ctx.currency).toBe("XYZ");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C: Cross-Engine Consensus D9/D10 Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 2C: Cross-Engine Consensus — D9 Damage-Cost + D10 Cost-Fraud", () => {
  const minimalStage6 = (severityScore: number) => ({
    damagedParts: [],
    damageZones: [],
    overallSeverityScore: severityScore,
    structuralDamageDetected: false,
    totalDamageArea: 0,
  });

  const minimalStage8 = (fraudScore: number) => ({
    fraudRiskScore: fraudScore,
    fraudRiskLevel: "medium" as const,
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: "" },
    claimantClaimFrequency: { flagged: false, notes: "" },
    vehicleClaimHistory: { flagged: false, notes: "" },
    damageConsistencyScore: 50,
    damageConsistencyNotes: "",
    scenarioFraudResult: null,
    crossEngineConsistency: null,
  });

  const minimalStage9 = (totalCents: number, deviationPct: number) => ({
    expectedRepairCostCents: totalCents,
    quoteDeviationPct: deviationPct,
    recommendedCostRange: { lowCents: totalCents * 0.8, highCents: totalCents * 1.2 },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: totalCents * 0.6,
      labourCostCents: totalCents * 0.3,
      paintCostCents: totalCents * 0.1,
      hiddenDamageCostCents: 0,
      totalCents,
    },
    labourRateUsdPerHour: 25,
    marketRegion: "ZW",
    currency: "ZWG",
    repairIntelligence: [],
    partsReconciliation: [],
    reconciliationSummary: null,
    alignmentResult: null,
    costNarrative: null,
    costReliability: null,
    quoteOptimisation: null,
    costDecision: null,
    documentedOriginalQuoteUsd: null,
    documentedAgreedCostUsd: null,
    panelBeaterName: null,
    documentedLabourCostUsd: null,
    documentedPartsCostUsd: null,
    economicContext: null,
  });

  it("D9: flags conflict when minor damage has very high cost", () => {
    const result = computeConsensus(
      null,
      minimalStage6(20) as any, // minor damage (severity=20)
      null,
      null,
      null,
      undefined,
      minimalStage9(800_000, 5) as any // $8,000 — very high for minor damage
    );
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency");
    expect(d9).toBeDefined();
    expect(d9!.conflict).toBe(true);
    expect(d9!.agreement_score).toBeLessThan(50);
  });

  it("D9: no conflict when moderate damage has proportionate cost", () => {
    const result = computeConsensus(
      null,
      minimalStage6(55) as any, // moderate damage
      null,
      null,
      null,
      undefined,
      minimalStage9(500_000, 0) as any // $5,000 — proportionate for moderate damage
    );
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency");
    expect(d9).toBeDefined();
    expect(d9!.conflict).toBe(false);
    expect(d9!.agreement_score).toBeGreaterThanOrEqual(80);
  });

  it("D10: flags suspicious pattern when high fraud + low deviation", () => {
    const result = computeConsensus(
      null,
      null,
      null,
      minimalStage8(80) as any, // high fraud risk
      null,
      undefined,
      minimalStage9(300_000, 2) as any // only 2% deviation — inconsistent with high fraud
    );
    const d10 = result.dimensions.find(d => d.dimension_id === "d10_cost_fraud_consistency");
    expect(d10).toBeDefined();
    expect(d10!.conflict).toBe(true);
    expect(d10!.agreement_score).toBeLessThan(50);
  });

  it("D10: consistent pattern when high fraud + high deviation", () => {
    const result = computeConsensus(
      null,
      null,
      null,
      minimalStage8(80) as any, // high fraud risk
      null,
      undefined,
      minimalStage9(300_000, 35) as any // 35% deviation — consistent with fraud motive
    );
    const d10 = result.dimensions.find(d => d.dimension_id === "d10_cost_fraud_consistency");
    expect(d10).toBeDefined();
    expect(d10!.conflict).toBe(false);
    expect(d10!.agreement_score).toBeGreaterThanOrEqual(80);
  });

  it("consensus always includes 10 dimensions (D9 and D10 always present)", () => {
    // D9 and D10 are always computed — they return score=50 when stage9 is null (insufficient data)
    const result = computeConsensus(null, null, null, null, null);
    expect(result.dimensions).toHaveLength(10);
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency");
    const d10 = result.dimensions.find(d => d.dimension_id === "d10_cost_fraud_consistency");
    expect(d9).toBeDefined();
    expect(d10).toBeDefined();
    // When stage9 is null, both dimensions return score=50 (insufficient data — not a conflict)
    expect(d9!.agreement_score).toBe(50);
    expect(d10!.agreement_score).toBe(50);
  });

  it("consensus_score is between 0 and 100", () => {
    const result = computeConsensus(null, null, null, null, null);
    expect(result.consensus_score).toBeGreaterThanOrEqual(0);
    expect(result.consensus_score).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C: Assumption Registry — FLAGGED_EXCEPTION routing
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 2C: Assumption Registry — FLAGGED_EXCEPTION routing", () => {
  it("flags exception when assumption confidence < 30", () => {
    const psm = createPipelineStateMachine("test-claim-001");

    // Simulate what recordStage does for a high-impact assumption
    const highImpactAssumption = {
      field: "vehicleValue",
      assumedValue: "industry_average",
      reason: "No vehicle value found in document",
      strategy: "default_value" as const,
      confidence: 15, // < 30 — HIGH impact
      stage: "Stage 3",
    };

    if ((highImpactAssumption.confidence ?? 50) < 30) {
      psm.flagException(
        `HIGH-impact assumption in 3_structured_extraction: field="${highImpactAssumption.field}" assumed="${highImpactAssumption.assumedValue}" confidence=${highImpactAssumption.confidence}% — ${highImpactAssumption.reason}`
      );
    }

    const summary = psm.toSummary();
    // flagReason holds the exception message
    expect(summary.flagReason).not.toBeNull();
    expect(summary.flagReason).toContain("HIGH-impact assumption");
    expect(summary.flagReason).toContain("vehicleValue");
    // State should be FLAGGED_EXCEPTION
    expect(summary.currentState).toBe("FLAGGED_EXCEPTION");
  });

  it("does NOT flag exception when assumption confidence >= 30", () => {
    const psm = createPipelineStateMachine("test-claim-002");

    const normalAssumption = {
      field: "repairTime",
      assumedValue: "5_days",
      reason: "Estimated from damage severity",
      strategy: "default_value" as const,
      confidence: 45, // >= 30 — normal
      stage: "Stage 9",
    };

    if ((normalAssumption.confidence ?? 50) < 30) {
      psm.flagException("should not be called");
    }

    const summary = psm.toSummary();
    // No exception flagged — flagReason should be null and state should be INGESTED (initial)
    expect(summary.flagReason).toBeNull();
    expect(summary.currentState).toBe("INGESTED");
  });

  it("FLAGGED_EXCEPTION is a terminal state and records the reason", () => {
    const psm = createPipelineStateMachine("test-claim-003");

    // Advance partway through the pipeline
    psm.advanceForStage("1_ingestion", "ingestion complete");
    psm.advanceForStage("2_extraction", "extraction complete");
    psm.advanceForStage("5_assembly", "assembly complete");

    // Flag an exception due to HIGH-impact assumption
    const exceptionReason = "HIGH-impact assumption in 3_structured_extraction: confidence=10%";
    psm.flagException(exceptionReason);

    const summary = psm.toSummary();
    // State should be FLAGGED_EXCEPTION — a terminal state
    expect(summary.currentState).toBe("FLAGGED_EXCEPTION");
    // The reason should be recorded
    expect(summary.flagReason).toBe(exceptionReason);
    // isTerminal() should return true
    expect(psm.isTerminal()).toBe(true);
    // isSuccess() should return false — this is not a successful completion
    expect(psm.isSuccess()).toBe(false);
  });
});
