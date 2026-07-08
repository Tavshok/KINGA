/**
 * R-CX-01a Audit Tests
 *
 * Verifies that:
 *   CX-01-C  inferCostTier absolute fallback path is NCI-scaled
 *   CX-01-D  deriveCostTier is NCI-scaled
 *   CX-01-E  d9_damageCostConsistency (via computeConsensus) uses NCI-scaled thresholds
 *   CX-01-W  generateCostIntelligenceNarrative uses currency-aware fmtCost()
 */

import { describe, it, expect } from "vitest";
import { inferCostTier } from "./caseSignatureGenerator";
import { deriveCostTier } from "./costLearningRecorder";
import { computeConsensus } from "./crossEngineConsensus";
import { generateCostIntelligenceNarrative } from "./costIntelligenceNarrative";
import type { Stage6Output, Stage9Output } from "./types";

// ---------------------------------------------------------------------------
// CX-01-C: inferCostTier NCI scaling
// ---------------------------------------------------------------------------

describe("CX-01-C: inferCostTier NCI scaling", () => {
  // Ratio path is currency-agnostic; NCI has no effect on it
  it("ratio path: total_loss at 0.75 regardless of NCI", () => {
    expect(inferCostTier(75000, 100000, 18.5)).toBe("total_loss");
    expect(inferCostTier(75000, 100000, 1.0)).toBe("total_loss");
  });

  it("ratio path: high at 0.40 regardless of NCI", () => {
    expect(inferCostTier(40000, 100000, 18.5)).toBe("high");
    expect(inferCostTier(40000, 100000, 1.0)).toBe("high");
  });

  // Absolute fallback path - USD baseline (nci=1.0)
  it("USD (nci=1.0): >= $15,000 -> total_loss", () => {
    expect(inferCostTier(15000)).toBe("total_loss");
    expect(inferCostTier(20000, undefined, 1.0)).toBe("total_loss");
  });

  it("USD (nci=1.0): $5,000-$14,999 -> high", () => {
    expect(inferCostTier(5000)).toBe("high");
    expect(inferCostTier(10000, undefined, 1.0)).toBe("high");
  });

  it("USD (nci=1.0): $1,500-$4,999 -> medium", () => {
    expect(inferCostTier(1500)).toBe("medium");
    expect(inferCostTier(3000, undefined, 1.0)).toBe("medium");
  });

  it("USD (nci=1.0): < $1,500 -> low", () => {
    expect(inferCostTier(1000)).toBe("low");
    expect(inferCostTier(500, undefined, 1.0)).toBe("low");
  });

  // ZAR (NCI ~18.5): thresholds scale to ZAR 27,750 / 92,500 / 277,500
  it("ZAR (nci=18.5): ZAR 277,500 -> total_loss", () => {
    expect(inferCostTier(277500, undefined, 18.5)).toBe("total_loss");
  });

  it("ZAR (nci=18.5): ZAR 92,500 -> high", () => {
    expect(inferCostTier(92500, undefined, 18.5)).toBe("high");
  });

  it("ZAR (nci=18.5): ZAR 50,000 -> medium (between ZAR 27,750 and 92,500)", () => {
    expect(inferCostTier(50000, undefined, 18.5)).toBe("medium");
  });

  it("ZAR (nci=18.5): ZAR 10,000 -> low (below ZAR 27,750)", () => {
    expect(inferCostTier(10000, undefined, 18.5)).toBe("low");
  });

  // ZMW (NCI ~0.36): thresholds scale DOWN
  // ZMW 14,000 / 0.36 = USD 38,889 -> above $15k total_loss threshold
  it("ZMW (nci=0.36): ZMW 14,000 -> total_loss (USD equiv $38,889 > $15k)", () => {
    expect(inferCostTier(14000, undefined, 0.36)).toBe("total_loss");
  });

  // ZMW 4,000 / 0.36 = USD 11,111 -> between $5k and $15k -> high
  it("ZMW (nci=0.36): ZMW 4,000 -> high (USD equiv $11,111)", () => {
    expect(inferCostTier(4000, undefined, 0.36)).toBe("high");
  });

  // Guard: nci=0 should not throw
  it("nci=0 guard: does not throw", () => {
    const result = inferCostTier(20000, undefined, 0);
    expect(["total_loss", "high", "medium", "low"]).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// CX-01-D: deriveCostTier NCI scaling
// ---------------------------------------------------------------------------

describe("CX-01-D: deriveCostTier NCI scaling", () => {
  // USD baseline (nci=1.0 default)
  it("USD (nci=1.0): < $1,500 -> low", () => {
    expect(deriveCostTier(1000)).toBe("low");
    expect(deriveCostTier(1499, 1.0)).toBe("low");
  });

  it("USD (nci=1.0): $1,500-$5,000 -> medium", () => {
    expect(deriveCostTier(1500)).toBe("medium");
    expect(deriveCostTier(5000, 1.0)).toBe("medium");
  });

  it("USD (nci=1.0): > $5,000 -> high", () => {
    expect(deriveCostTier(5001)).toBe("high");
    expect(deriveCostTier(50000, 1.0)).toBe("high");
  });

  // ZAR (NCI ~18.5): medium band is ZAR 27,750-92,500
  it("ZAR (nci=18.5): ZAR 66,600 -> medium (USD equiv $3,600)", () => {
    expect(deriveCostTier(66600, 18.5)).toBe("medium");
  });

  it("ZAR (nci=18.5): ZAR 10,000 -> low (USD equiv $540)", () => {
    expect(deriveCostTier(10000, 18.5)).toBe("low");
  });

  it("ZAR (nci=18.5): ZAR 200,000 -> high (USD equiv $10,811)", () => {
    expect(deriveCostTier(200000, 18.5)).toBe("high");
  });

  // Guard: nci=0 should not throw
  it("nci=0 guard: does not throw", () => {
    expect(() => deriveCostTier(5000, 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CX-01-E: d9_damageCostConsistency NCI scaling via computeConsensus
// ---------------------------------------------------------------------------

function makeStage6(severity: number): Stage6Output {
  return {
    overallSeverityScore: severity,
    componentDamageMap: {},
    primaryImpactZone: "front",
    repairComplexity: "moderate",
    estimatedRepairHours: 10,
    structuralIntegrityRisk: false,
    safetySystemsAffected: [],
    totalDamageScore: severity,
    damageNarrative: "",
    confidenceLevel: "medium",
    photoEvidenceQuality: "adequate",
    analysisVersion: "2",
  } as unknown as Stage6Output;
}

function makeStage9(totalCents: number): Stage9Output {
  return {
    breakdown: { totalCents },
    selectedQuoteId: "q1",
    costTier: "medium",
    repairToValueRatio: 0.3,
    recommendation: "APPROVE",
  } as unknown as Stage9Output;
}

describe("CX-01-E: d9_damageCostConsistency NCI scaling via computeConsensus", () => {
  // USD baseline: minor damage + $6,000 cost -> conflict (> $5,000 threshold)
  it("USD (nci=1.0): minor damage + $6,000 -> conflict (score=20)", () => {
    const result = computeConsensus(null, makeStage6(30), null, null, null, null, makeStage9(600000), 1.0, "$");
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency")!;
    expect(d9.agreement_score).toBe(20);
    expect(d9.conflict).toBe(true);
    expect(d9.detail).toContain("$6000");
  });

  // ZAR (nci=18.5): minor damage + ZAR 6,000 -> NOT a conflict (ZAR 6,000 < ZAR 92,500 threshold)
  it("ZAR (nci=18.5): minor damage + ZAR 6,000 -> no conflict (below scaled threshold)", () => {
    const result = computeConsensus(null, makeStage6(30), null, null, null, null, makeStage9(600000), 18.5, "R");
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency")!;
    expect(d9.agreement_score).not.toBe(20);
    expect(d9.conflict).toBe(false);
  });

  // ZAR (nci=18.5): minor damage + ZAR 100,000 -> conflict (> ZAR 92,500 threshold)
  it("ZAR (nci=18.5): minor damage + ZAR 100,000 -> conflict", () => {
    const result = computeConsensus(null, makeStage6(30), null, null, null, null, makeStage9(10000000), 18.5, "R");
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency")!;
    expect(d9.agreement_score).toBe(20);
    expect(d9.conflict).toBe(true);
    expect(d9.detail).toContain("R");
  });

  // Currency symbol appears in detail string (not hardcoded $)
  it("detail string uses provided currency symbol not hardcoded $", () => {
    const result = computeConsensus(null, makeStage6(30), null, null, null, null, makeStage9(600000), 1.0, "ZAR");
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency")!;
    expect(d9.detail).toContain("ZAR");
    expect(d9.detail).not.toContain("$6000");
  });

  // Default (no nci/symbol args): backward-compatible USD behaviour
  it("default args: backward-compatible USD $ symbol", () => {
    const result = computeConsensus(null, makeStage6(30), null, null, null, null, makeStage9(600000));
    const d9 = result.dimensions.find(d => d.dimension_id === "d9_damage_cost_consistency")!;
    expect(d9.detail).toContain("$");
  });
});

// ---------------------------------------------------------------------------
// CX-01-W: generateCostIntelligenceNarrative currency-aware formatting
// ---------------------------------------------------------------------------

const baseInput = {
  quotes: [
    { quote_id: "q1", panel_beater: "Alpha Panel", total_cost: 5000 },
    { quote_id: "q2", panel_beater: "Beta Body", total_cost: 8000 },
  ],
  selected_quote_id: "q1",
  agreed_cost_usd: null,
  ai_estimate_usd: null,
  market_value_usd: null,
  median_cost: null,
  flags: [],
  alignment_status: null as null,
  critical_missing: [],
  unrelated_items: [],
  engineering_comment: null,
  coverage_ratio: null,
  assessor_name: null,
  quote_count: 2,
};

describe("CX-01-W: generateCostIntelligenceNarrative currency-aware formatting", () => {
  it("defaults to USD prefix when no currency provided", () => {
    const output = generateCostIntelligenceNarrative(baseInput);
    expect(output.narrative).toContain("USD");
  });

  it("uses ISO currency code when currency field is set", () => {
    const output = generateCostIntelligenceNarrative({ ...baseInput, currency: "ZAR" });
    expect(output.narrative).toContain("ZAR");
    expect(output.narrative).not.toContain("USD");
  });

  it("uses currencySymbol when provided (overrides currency field)", () => {
    const output = generateCostIntelligenceNarrative({ ...baseInput, currency: "ZAR", currencySymbol: "R" });
    expect(output.narrative).toContain("R ");
    expect(output.narrative).not.toContain("USD");
  });

  it("ZMW currency code appears in spread sentence", () => {
    const output = generateCostIntelligenceNarrative({ ...baseInput, currency: "ZMW" });
    expect(output.narrative).toContain("ZMW");
  });

  it("agreed cost uses currency symbol in selection justification", () => {
    const output = generateCostIntelligenceNarrative({
      ...baseInput,
      agreed_cost_usd: 4500,
      assessor_name: "J. Moyo",
      currencySymbol: "ZK",
    });
    expect(output.narrative).toContain("ZK");
    expect(output.narrative).not.toContain("USD");
  });

  it("backward compat: existing callers without currency field still get USD", () => {
    const output = generateCostIntelligenceNarrative(baseInput);
    expect(output.narrative.length).toBeGreaterThan(0);
    expect(output.narrative).toContain("USD");
  });
});
