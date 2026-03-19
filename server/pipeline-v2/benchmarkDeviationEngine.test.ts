/**
 * Stage 41 — Benchmark Deviation Engine Tests
 *
 * Covers:
 *   - Dimension classifiers (vehicle class, segment, year band, damage type, severity, impact zone, region)
 *   - Cold-start static benchmarks (0 comparable claims)
 *   - Blended benchmarks (30–99 comparable claims)
 *   - Live benchmarks (100+ comparable claims)
 *   - Deviation flag threshold (>20%)
 *   - Cost deviation: all dimension multipliers
 *   - Physics deviation: non-collision passthrough, year band factor
 *   - Fraud deviation: all damage types
 *   - Composite bundle
 *   - Narrative content (OEC structure, no hedges)
 *   - Benchmark key audit trail
 */

import { describe, it, expect } from "vitest";
import {
  classifyVehicle,
  classifySegment,
  classifyYearBand,
  normaliseDamageType,
  normaliseSeverity,
  normaliseImpactZone,
  normaliseRegion,
  computeDeviationPct,
  getBenchmarkSource,
  computeCostDeviation,
  computePhysicsDeviation,
  computeFraudDeviation,
  buildBenchmarkBundle,
  COLD_START_THRESHOLD,
  LIVE_THRESHOLD,
  DEVIATION_FLAG_THRESHOLD_PCT,
  REGION_COST_SCALE,
  YEAR_BAND_COST_FACTOR,
  SEGMENT_COST_FACTOR,
  IMPACT_ZONE_COST_FACTOR,
  YEAR_BAND_DELTAV_FACTOR,
  type LiveBenchmarkStats,
  type BenchmarkInputContext,
} from "./benchmarkDeviationEngine";
import type { Stage7Output, Stage8Output, Stage9Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const COLD_STATS: LiveBenchmarkStats = { comparableClaimCount: 0 };
const BLENDED_STATS: LiveBenchmarkStats = {
  comparableClaimCount: 50,
  cost: { meanCents: 3_500_000, stdDevCents: 800_000, p10Cents: 2_000_000, p90Cents: 5_000_000 },
  physics: { meanDeltaVKmh: 40, stdDevDeltaVKmh: 10, p10DeltaVKmh: 25, p90DeltaVKmh: 60 },
  fraud: { meanScore: 0.20, stdDevScore: 0.08, p10Score: 0.08, p90Score: 0.35 },
};
const LIVE_STATS: LiveBenchmarkStats = {
  comparableClaimCount: 150,
  cost: { meanCents: 3_200_000, stdDevCents: 700_000, p10Cents: 1_800_000, p90Cents: 4_800_000 },
  physics: { meanDeltaVKmh: 38, stdDevDeltaVKmh: 9, p10DeltaVKmh: 22, p90DeltaVKmh: 56 },
  fraud: { meanScore: 0.18, stdDevScore: 0.07, p10Score: 0.07, p90Score: 0.32 },
};

function makeStage7(deltaVKmh = 40, direction = "frontal" as any): Stage7Output {
  return {
    impactForceKn: 120,
    impactVector: { direction, magnitude: 120, angle: 0 },
    energyDistribution: { kineticEnergyJ: 200_000, energyDissipatedJ: 180_000, energyDissipatedKj: 180 },
    estimatedSpeedKmh: 60,
    deltaVKmh,
    decelerationG: 8,
    accidentSeverity: "moderate",
    accidentReconstructionSummary: "Moderate frontal collision",
    damageConsistencyScore: 0.85,
    latentDamageProbability: { engine: 0.1, transmission: 0.05, suspension: 0.1, frame: 0.05, electrical: 0.03 },
    physicsEngineRan: true,
    physicsSkipReason: null,
    assumptions: [],
    recoveryActions: [],
  } as any;
}

function makeStage8(fraudRiskScore = 0.22): Stage8Output {
  return {
    fraudRiskScore,
    fraudRiskLevel: fraudRiskScore > 0.5 ? "HIGH" : fraudRiskScore > 0.3 ? "MEDIUM" : "LOW",
    fraudIndicators: [
      { category: "damage_inconsistency", description: "Test indicator", severity: "LOW", confidence: 0.5 },
      { category: "timeline_anomaly", description: "Test indicator 2", severity: "LOW", confidence: 0.4 },
    ],
    fraudExplanation: "Low fraud risk",
    recommendations: [],
    assumptions: [],
    recoveryActions: [],
  } as any;
}

function makeStage9(expectedRepairCostCents = 3_200_000): Stage9Output {
  return {
    expectedRepairCostCents,
    labourCostCents: 1_200_000,
    partsCostCents: 2_000_000,
    labourHours: 16,
    labourRatePerHour: 75_000,
    marketRegion: "ZA",
    partsReconciliation: [],
    costBreakdown: [],
    assumptions: [],
    recoveryActions: [],
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension classifiers
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyVehicle", () => {
  it("classifies null/undefined as light", () => {
    expect(classifyVehicle(null)).toBe("light");
    expect(classifyVehicle(undefined)).toBe("light");
    expect(classifyVehicle(0)).toBe("light");
  });
  it("classifies <2000 kg as light", () => {
    expect(classifyVehicle(1_200)).toBe("light");
    expect(classifyVehicle(1_999)).toBe("light");
  });
  it("classifies 2000–3500 kg as medium", () => {
    expect(classifyVehicle(2_000)).toBe("medium");
    expect(classifyVehicle(3_500)).toBe("medium");
  });
  it("classifies >3500 kg as heavy", () => {
    expect(classifyVehicle(3_501)).toBe("heavy");
    expect(classifyVehicle(12_000)).toBe("heavy");
  });
});

describe("classifySegment", () => {
  it("classifies Rolls-Royce as luxury", () => {
    expect(classifySegment("Rolls-Royce", "Ghost")).toBe("luxury");
  });
  it("classifies BMW 7 Series as luxury", () => {
    expect(classifySegment("BMW", "7 Series")).toBe("luxury");
  });
  it("classifies BMW 3 Series as premium", () => {
    expect(classifySegment("BMW", "3 Series")).toBe("premium");
  });
  it("classifies Mercedes as premium", () => {
    expect(classifySegment("Mercedes", "A-Class")).toBe("premium");
  });
  it("classifies Toyota Hilux as commercial", () => {
    expect(classifySegment("Toyota", "Hilux")).toBe("commercial");
  });
  it("classifies Datsun as economy", () => {
    expect(classifySegment("Datsun", "Go")).toBe("economy");
  });
  it("classifies Toyota Corolla as mid-range", () => {
    expect(classifySegment("Toyota", "Corolla")).toBe("mid-range");
  });
  it("classifies null/undefined as mid-range", () => {
    expect(classifySegment(null, null)).toBe("mid-range");
  });
});

describe("classifyYearBand", () => {
  it("classifies null as 2010-2019", () => {
    expect(classifyYearBand(null)).toBe("2010-2019");
  });
  it("classifies 1998 as pre2000", () => {
    expect(classifyYearBand(1998)).toBe("pre2000");
  });
  it("classifies 2005 as 2000-2009", () => {
    expect(classifyYearBand(2005)).toBe("2000-2009");
  });
  it("classifies 2015 as 2010-2019", () => {
    expect(classifyYearBand(2015)).toBe("2010-2019");
  });
  it("classifies 2022 as 2020plus", () => {
    expect(classifyYearBand(2022)).toBe("2020plus");
  });
});

describe("normaliseDamageType", () => {
  it("maps collision and accident to collision", () => {
    expect(normaliseDamageType("collision")).toBe("collision");
    expect(normaliseDamageType("accident")).toBe("collision");
  });
  it("maps hijacking to theft", () => {
    expect(normaliseDamageType("hijacking")).toBe("theft");
  });
  it("maps unknown to other", () => {
    expect(normaliseDamageType("earthquake")).toBe("other");
    expect(normaliseDamageType(null)).toBe("other");
  });
});

describe("normaliseSeverity", () => {
  it("maps cosmetic to minor", () => {
    expect(normaliseSeverity("cosmetic")).toBe("minor");
  });
  it("maps catastrophic to severe", () => {
    expect(normaliseSeverity("catastrophic")).toBe("severe");
  });
  it("defaults to moderate", () => {
    expect(normaliseSeverity(null)).toBe("moderate");
    expect(normaliseSeverity("unknown")).toBe("moderate");
  });
});

describe("normaliseImpactZone", () => {
  it("maps frontal to front", () => {
    expect(normaliseImpactZone("frontal")).toBe("front");
  });
  it("maps side_driver to side", () => {
    expect(normaliseImpactZone("side_driver")).toBe("side");
  });
  it("maps rollover to multi", () => {
    expect(normaliseImpactZone("rollover")).toBe("multi");
  });
  it("defaults to non-directional", () => {
    expect(normaliseImpactZone(null)).toBe("non-directional");
  });
});

describe("normaliseRegion", () => {
  it("maps RSA to ZA", () => {
    expect(normaliseRegion("RSA")).toBe("ZA");
  });
  it("maps GB to UK", () => {
    expect(normaliseRegion("GB")).toBe("UK");
  });
  it("defaults to ZA", () => {
    expect(normaliseRegion(null)).toBe("ZA");
    expect(normaliseRegion("UNKNOWN")).toBe("ZA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds and constants
// ─────────────────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("COLD_START_THRESHOLD is 30", () => {
    expect(COLD_START_THRESHOLD).toBe(30);
  });
  it("LIVE_THRESHOLD is 100", () => {
    expect(LIVE_THRESHOLD).toBe(100);
  });
  it("DEVIATION_FLAG_THRESHOLD_PCT is 20", () => {
    expect(DEVIATION_FLAG_THRESHOLD_PCT).toBe(20);
  });
  it("ZA region scale is 1.0 (baseline)", () => {
    expect(REGION_COST_SCALE["ZA"]).toBe(1.0);
  });
  it("UK region scale is higher than ZA", () => {
    expect(REGION_COST_SCALE["UK"]).toBeGreaterThan(REGION_COST_SCALE["ZA"]);
  });
  it("2020plus year band costs more than 2010-2019", () => {
    expect(YEAR_BAND_COST_FACTOR["2020plus"]).toBeGreaterThan(YEAR_BAND_COST_FACTOR["2010-2019"]);
  });
  it("pre2000 year band costs less than 2010-2019", () => {
    expect(YEAR_BAND_COST_FACTOR["pre2000"]).toBeLessThan(YEAR_BAND_COST_FACTOR["2010-2019"]);
  });
  it("luxury segment costs more than mid-range", () => {
    expect(SEGMENT_COST_FACTOR["luxury"]).toBeGreaterThan(SEGMENT_COST_FACTOR["mid-range"]);
  });
  it("multi impact zone costs more than side", () => {
    expect(IMPACT_ZONE_COST_FACTOR["multi"]).toBeGreaterThan(IMPACT_ZONE_COST_FACTOR["side"]);
  });
  it("2020plus delta-V factor is higher than 2010-2019", () => {
    expect(YEAR_BAND_DELTAV_FACTOR["2020plus"]).toBeGreaterThan(YEAR_BAND_DELTAV_FACTOR["2010-2019"]);
  });
});

describe("computeDeviationPct", () => {
  it("returns 0 when mean is 0", () => {
    expect(computeDeviationPct(100, 0)).toBe(0);
  });
  it("returns positive when value > mean", () => {
    expect(computeDeviationPct(120, 100)).toBe(20);
  });
  it("returns negative when value < mean", () => {
    expect(computeDeviationPct(80, 100)).toBe(-20);
  });
  it("returns 0 when value equals mean", () => {
    expect(computeDeviationPct(100, 100)).toBe(0);
  });
  it("rounds to 1 decimal place", () => {
    expect(computeDeviationPct(115, 100)).toBe(15);
    expect(computeDeviationPct(133, 100)).toBe(33);
  });
});

describe("getBenchmarkSource", () => {
  it("returns static for 0 claims", () => {
    expect(getBenchmarkSource(0)).toBe("static");
  });
  it("returns static for 29 claims", () => {
    expect(getBenchmarkSource(29)).toBe("static");
  });
  it("returns blended for 30 claims", () => {
    expect(getBenchmarkSource(30)).toBe("blended");
  });
  it("returns blended for 99 claims", () => {
    expect(getBenchmarkSource(99)).toBe("blended");
  });
  it("returns live for 100 claims", () => {
    expect(getBenchmarkSource(100)).toBe("live");
  });
  it("returns live for 500 claims", () => {
    expect(getBenchmarkSource(500)).toBe("live");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cost deviation
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCostDeviation — cold start", () => {
  it("returns static source with 0 comparable claims", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.source).toBe("static");
    expect(result.comparable_claim_count).toBe(0);
  });

  it("does not flag when cost is within range", () => {
    // mid-range light collision moderate ZA front baseline mean = 3_200_000
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.deviation_flag).toBe(false);
    expect(result.deviation_percent).toBe(0);
  });

  it("flags when cost is >20% above mean", () => {
    // 3_200_000 * 1.25 = 4_000_000 → 25% above
    const result = computeCostDeviation(
      makeStage9(4_000_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeGreaterThan(20);
  });

  it("flags when cost is >20% below mean", () => {
    // 3_200_000 * 0.75 = 2_400_000 → 25% below
    const result = computeCostDeviation(
      makeStage9(2_400_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeLessThan(-20);
  });

  it("applies luxury segment multiplier (2.5x)", () => {
    const base = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const luxury = computeCostDeviation(
      makeStage9(3_200_000), "light", "luxury", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    // Luxury mean should be ~2.5x base mean
    expect(luxury.benchmark_range.mean).toBeCloseTo(base.benchmark_range.mean * 2.5, -5);
  });

  it("applies 2020plus year band multiplier (1.35x)", () => {
    const base = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const modern = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2020plus", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(modern.benchmark_range.mean).toBeCloseTo(base.benchmark_range.mean * 1.35, -5);
  });

  it("applies UK region scale factor (4.2x)", () => {
    const za = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const uk = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "UK", COLD_STATS
    );
    expect(uk.benchmark_range.mean).toBeCloseTo(za.benchmark_range.mean * 4.2, -5);
  });

  it("applies multi impact zone multiplier (1.4x)", () => {
    const front = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const multi = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "multi", "ZA", COLD_STATS
    );
    expect(multi.benchmark_range.mean).toBeCloseTo(front.benchmark_range.mean * 1.4, -5);
  });

  it("applies pre2000 year band (0.55x) — cheaper repair", () => {
    const base = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const old = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "pre2000", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(old.benchmark_range.mean).toBeCloseTo(base.benchmark_range.mean * 0.55, -5);
  });

  it("includes benchmark_key in output", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.benchmark_key).toContain("light");
    expect(result.benchmark_key).toContain("collision");
    expect(result.benchmark_key).toContain("ZA");
  });

  it("includes all 7 dimensions in dimensions_used", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.dimensions_used).toHaveLength(7);
  });

  it("narrative contains value and range when not flagged", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.narrative).toContain("falls within");
    expect(result.narrative).toContain("source: static");
  });

  it("narrative contains deviation percent when flagged", () => {
    const result = computeCostDeviation(
      makeStage9(8_000_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    expect(result.narrative).toContain("requires verification");
    expect(result.narrative).toMatch(/\d+\.\d+%/);
  });
});

describe("computeCostDeviation — blended", () => {
  it("returns blended source with 50 comparable claims", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", BLENDED_STATS
    );
    expect(result.source).toBe("blended");
    expect(result.comparable_claim_count).toBe(50);
  });

  it("blended mean is between static and live", () => {
    const staticResult = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", COLD_STATS
    );
    const blendedResult = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", BLENDED_STATS
    );
    const liveMean = BLENDED_STATS.cost!.meanCents;
    const staticMean = staticResult.benchmark_range.mean;
    // Blended should be between static and live
    const minMean = Math.min(staticMean, liveMean);
    const maxMean = Math.max(staticMean, liveMean);
    expect(blendedResult.benchmark_range.mean).toBeGreaterThanOrEqual(minMean - 1);
    expect(blendedResult.benchmark_range.mean).toBeLessThanOrEqual(maxMean + 1);
  });
});

describe("computeCostDeviation — live", () => {
  it("returns live source with 150 comparable claims", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", LIVE_STATS
    );
    expect(result.source).toBe("live");
    expect(result.comparable_claim_count).toBe(150);
  });

  it("live mean matches live stats mean", () => {
    const result = computeCostDeviation(
      makeStage9(3_200_000), "light", "mid-range", "2010-2019", "collision", "moderate", "front", "ZA", LIVE_STATS
    );
    expect(result.benchmark_range.mean).toBeCloseTo(LIVE_STATS.cost!.meanCents, -3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Physics deviation
// ─────────────────────────────────────────────────────────────────────────────

describe("computePhysicsDeviation — non-collision", () => {
  it("returns no deviation flag for hail", () => {
    const result = computePhysicsDeviation(makeStage7(0), "hail", "moderate", "2010-2019", COLD_STATS);
    expect(result.deviation_flag).toBe(false);
    expect(result.deviation_percent).toBe(0);
    expect(result.benchmark_range.mean).toBe(0);
  });

  it("returns informational narrative for non-collision", () => {
    const result = computePhysicsDeviation(makeStage7(0), "fire", "severe", "2010-2019", COLD_STATS);
    expect(result.narrative).toContain("not applicable");
  });

  it("returns static source for non-collision regardless of claim count", () => {
    const result = computePhysicsDeviation(makeStage7(0), "theft", "minor", "2010-2019", LIVE_STATS);
    expect(result.source).toBe("static");
    expect(result.comparable_claim_count).toBe(0);
  });
});

describe("computePhysicsDeviation — collision", () => {
  it("does not flag delta-V within expected range", () => {
    // Moderate collision baseline mean = 42 km/h (2010-2019 factor = 1.0)
    const result = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "2010-2019", COLD_STATS);
    expect(result.deviation_flag).toBe(false);
    expect(result.deviation_percent).toBe(0);
  });

  it("flags delta-V >20% above mean", () => {
    // 42 * 1.3 = 54.6 → ~30% above
    const result = computePhysicsDeviation(makeStage7(55), "collision", "moderate", "2010-2019", COLD_STATS);
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeGreaterThan(20);
  });

  it("flags delta-V >20% below mean", () => {
    // 42 * 0.7 = 29.4 → ~30% below
    const result = computePhysicsDeviation(makeStage7(28), "collision", "moderate", "2010-2019", COLD_STATS);
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeLessThan(-20);
  });

  it("applies 2020plus year band factor (1.1x) to delta-V range", () => {
    const base = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "2010-2019", COLD_STATS);
    const modern = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "2020plus", COLD_STATS);
    expect(modern.benchmark_range.mean).toBeCloseTo(base.benchmark_range.mean * 1.1, 1);
  });

  it("applies pre2000 year band factor (0.8x) to delta-V range", () => {
    const base = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "2010-2019", COLD_STATS);
    const old = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "pre2000", COLD_STATS);
    expect(old.benchmark_range.mean).toBeCloseTo(base.benchmark_range.mean * 0.8, 1);
  });

  it("narrative contains km/h and source", () => {
    const result = computePhysicsDeviation(makeStage7(42), "collision", "moderate", "2010-2019", COLD_STATS);
    expect(result.narrative).toContain("km/h");
    expect(result.narrative).toContain("source: static");
  });

  it("uses live mean when 150 comparable claims", () => {
    const result = computePhysicsDeviation(makeStage7(38), "collision", "moderate", "2010-2019", LIVE_STATS);
    expect(result.source).toBe("live");
    expect(result.benchmark_range.mean).toBeCloseTo(LIVE_STATS.physics!.meanDeltaVKmh, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fraud deviation
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFraudDeviation", () => {
  it("does not flag score within expected range", () => {
    // collision baseline mean = 0.22
    const result = computeFraudDeviation(makeStage8(0.22), "collision", COLD_STATS);
    expect(result.deviation_flag).toBe(false);
    expect(result.deviation_percent).toBe(0);
  });

  it("flags score >20% above mean", () => {
    // 0.22 * 1.3 = 0.286 → ~30% above
    const result = computeFraudDeviation(makeStage8(0.29), "collision", COLD_STATS);
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeGreaterThan(20);
  });

  it("flags score >20% below mean", () => {
    // 0.22 * 0.7 = 0.154 → ~30% below
    const result = computeFraudDeviation(makeStage8(0.15), "collision", COLD_STATS);
    expect(result.deviation_flag).toBe(true);
    expect(result.deviation_percent).toBeLessThan(-20);
  });

  it("theft has higher baseline mean than hail", () => {
    const theft = computeFraudDeviation(makeStage8(0.22), "theft", COLD_STATS);
    const hail = computeFraudDeviation(makeStage8(0.22), "hail", COLD_STATS);
    expect(theft.benchmark_range.mean).toBeGreaterThan(hail.benchmark_range.mean);
  });

  it("fire has higher baseline mean than flood", () => {
    const fire = computeFraudDeviation(makeStage8(0.22), "fire", COLD_STATS);
    const flood = computeFraudDeviation(makeStage8(0.22), "flood", COLD_STATS);
    expect(fire.benchmark_range.mean).toBeGreaterThan(flood.benchmark_range.mean);
  });

  it("narrative contains score and range", () => {
    const result = computeFraudDeviation(makeStage8(0.22), "collision", COLD_STATS);
    expect(result.narrative).toContain("0.220");
    expect(result.narrative).toContain("source: static");
  });

  it("narrative flags deviation when score is high", () => {
    const result = computeFraudDeviation(makeStage8(0.80), "collision", COLD_STATS);
    expect(result.narrative).toContain("requires verification");
  });

  it("uses live mean when 150 comparable claims", () => {
    const result = computeFraudDeviation(makeStage8(0.18), "collision", LIVE_STATS);
    expect(result.source).toBe("live");
    expect(result.benchmark_range.mean).toBeCloseTo(LIVE_STATS.fraud!.meanScore, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Composite bundle
// ─────────────────────────────────────────────────────────────────────────────

describe("buildBenchmarkBundle", () => {
  const ctx: BenchmarkInputContext = {
    vehicleMassKg: 1_400,
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleYear: 2015,
    incidentType: "collision",
    severity: "moderate",
    impactDirection: "frontal",
    marketRegion: "ZA",
  };

  it("returns a bundle with all three engines", () => {
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), ctx, COLD_STATS);
    expect(bundle.cost).toBeDefined();
    expect(bundle.physics).toBeDefined();
    expect(bundle.fraud).toBeDefined();
  });

  it("sets overall_deviation_flag to false when all engines are within range", () => {
    const bundle = buildBenchmarkBundle(makeStage7(42), makeStage8(0.22), makeStage9(3_200_000), ctx, COLD_STATS);
    expect(bundle.overall_deviation_flag).toBe(false);
  });

  it("sets overall_deviation_flag to true when any engine flags", () => {
    // High cost will flag
    const bundle = buildBenchmarkBundle(makeStage7(42), makeStage8(0.22), makeStage9(20_000_000), ctx, COLD_STATS);
    expect(bundle.overall_deviation_flag).toBe(true);
  });

  it("vehicle_profile is populated correctly", () => {
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), ctx, COLD_STATS);
    expect(bundle.vehicle_profile.vehicleClass).toBe("light");
    expect(bundle.vehicle_profile.vehicleSegment).toBe("mid-range");
    expect(bundle.vehicle_profile.yearBand).toBe("2010-2019");
    expect(bundle.vehicle_profile.region).toBe("ZA");
  });

  it("benchmark_source reflects cold start", () => {
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), ctx, COLD_STATS);
    expect(bundle.benchmark_source).toBe("static");
  });

  it("benchmark_source reflects live when 150 claims", () => {
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), ctx, LIVE_STATS);
    expect(bundle.benchmark_source).toBe("live");
  });

  it("classifies BMW as premium segment", () => {
    const bmwCtx: BenchmarkInputContext = { ...ctx, vehicleMake: "BMW", vehicleModel: "3 Series" };
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), bmwCtx, COLD_STATS);
    expect(bundle.vehicle_profile.vehicleSegment).toBe("premium");
  });

  it("classifies 2022 vehicle as 2020plus year band", () => {
    const newCtx: BenchmarkInputContext = { ...ctx, vehicleYear: 2022 };
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), newCtx, COLD_STATS);
    expect(bundle.vehicle_profile.yearBand).toBe("2020plus");
  });

  it("handles null context gracefully", () => {
    const nullCtx: BenchmarkInputContext = {};
    const bundle = buildBenchmarkBundle(makeStage7(), makeStage8(), makeStage9(), nullCtx, COLD_STATS);
    expect(bundle).toBeDefined();
    expect(bundle.vehicle_profile.vehicleClass).toBe("light");
    expect(bundle.vehicle_profile.vehicleSegment).toBe("mid-range");
  });
});
