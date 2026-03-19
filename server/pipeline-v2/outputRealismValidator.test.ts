/**
 * Stage 40 — Output Realism Validator Tests
 *
 * Covers:
 *  - Physics realism: delta-V ceiling, force proportionality, kinetic energy range, deceleration ceiling
 *  - Cost realism: labour ratio, cost per component, breakdown sum, total positive
 *  - Fraud realism: high score requires indicators, score reflects indicators, score range, no duplicate categories
 *  - Non-collision physics bypass
 *  - Composite bundle
 *  - Boundary conditions and edge cases
 */

import { describe, it, expect } from "vitest";
import {
  validatePhysicsRealism,
  validateCostRealism,
  validateFraudRealism,
  buildRealismBundle,
  type RealismResult,
} from "./outputRealismValidator";
import type { Stage7Output, Stage8Output, Stage9Output, FraudIndicator } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePhysics(overrides: Partial<Stage7Output> = {}): Stage7Output {
  return {
    impactForceKn: 60,           // 60 kN / 30 km/h = 2 kN per km/h ✓
    impactVector: { direction: "frontal", magnitude: 30, angle: 0 },
    energyDistribution: {
      kineticEnergyJ: 52_083,    // ½ × 1500 × (30/3.6)² ≈ 52 083 J ✓
      energyDissipatedJ: 50_000,
      energyDissipatedKj: 50,
    },
    estimatedSpeedKmh: 30,
    deltaVKmh: 30,
    decelerationG: 8,            // well within 50g ceiling ✓
    accidentSeverity: "moderate",
    accidentReconstructionSummary: "Frontal collision at 30 km/h",
    damageConsistencyScore: 0.8,
    latentDamageProbability: { engine: 0.1, transmission: 0.05, suspension: 0.2, frame: 0.1, electrical: 0.05 },
    physicsExecuted: true,
    ...overrides,
  };
}

function makeStage9(overrides: Partial<Stage9Output> = {}): Stage9Output {
  return {
    expectedRepairCostCents: 250_000,
    quoteDeviationPct: null,
    recommendedCostRange: { lowCents: 200_000, highCents: 300_000 },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: 100_000,
      labourCostCents: 100_000,   // 100k / 250k = 40% ✓
      paintCostCents: 30_000,
      hiddenDamageCostCents: 20_000,
      totalCents: 250_000,        // sum = 250k ✓
    },
    labourRateUsdPerHour: 45,
    marketRegion: "ZA",
    currency: "ZAR",
    repairIntelligence: [],
    partsReconciliation: [],
    ...overrides,
  };
}

function makeIndicator(category: string, score = 0.3): FraudIndicator {
  return { indicator: `${category}_indicator`, category, score, description: `${category} flag` };
}

function makeFraud(overrides: Partial<Stage8Output> = {}): Stage8Output {
  return {
    fraudRiskScore: 0.3,
    fraudRiskLevel: "low",
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: "" },
    claimantClaimFrequency: { flagged: false, notes: "" },
    vehicleClaimHistory: { flagged: false, notes: "" },
    damageConsistencyScore: 0.8,
    damageConsistencyNotes: "",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics realism tests
// ─────────────────────────────────────────────────────────────────────────────

describe("validatePhysicsRealism", () => {
  it("passes all checks for a realistic 30 km/h frontal collision", () => {
    const r = validatePhysicsRealism(makePhysics());
    expect(r.realism_flag).toBe(true);
    expect(r.confidence_multiplier).toBe(1.0);
    expect(r.adjustment_reasons).toHaveLength(0);
  });

  it("skips all checks when physicsExecuted is false", () => {
    const r = validatePhysicsRealism(makePhysics({ physicsExecuted: false }));
    expect(r.realism_flag).toBe(true);
    expect(r.checks).toHaveLength(0);
  });

  it("fails delta-V ceiling when delta-V exceeds 200 km/h", () => {
    const r = validatePhysicsRealism(makePhysics({
      deltaVKmh: 250,
      impactForceKn: 500,
      energyDistribution: {
        kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2,
        energyDissipatedJ: 100_000,
        energyDissipatedKj: 100,
      },
    }));
    const deltaVCheck = r.checks.find(c => c.rule === "physics.deltaV_ceiling");
    expect(deltaVCheck?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
    expect(r.confidence_multiplier).toBeLessThan(1.0);
  });

  it("fails force proportionality when force is too low for delta-V", () => {
    // 1 kN for 30 km/h = 0.033 kN/km/h — below 0.5 minimum
    const r = validatePhysicsRealism(makePhysics({ impactForceKn: 1 }));
    const forceCheck = r.checks.find(c => c.rule === "physics.force_proportional_to_deltaV");
    expect(forceCheck?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("fails force proportionality when force is too high for delta-V", () => {
    // 1000 kN for 30 km/h = 33.3 kN/km/h — above 15 maximum
    const r = validatePhysicsRealism(makePhysics({ impactForceKn: 1000 }));
    const forceCheck = r.checks.find(c => c.rule === "physics.force_proportional_to_deltaV");
    expect(forceCheck?.passed).toBe(false);
  });

  it("passes force check at lower boundary (0.5 kN per km/h)", () => {
    // 0.5 × 30 = 15 kN exactly
    const r = validatePhysicsRealism(makePhysics({ impactForceKn: 15 }));
    const forceCheck = r.checks.find(c => c.rule === "physics.force_proportional_to_deltaV");
    expect(forceCheck?.passed).toBe(true);
  });

  it("passes force check at upper boundary (15 kN per km/h)", () => {
    // 15 × 30 = 450 kN exactly
    const r = validatePhysicsRealism(makePhysics({ impactForceKn: 450 }));
    const forceCheck = r.checks.find(c => c.rule === "physics.force_proportional_to_deltaV");
    expect(forceCheck?.passed).toBe(true);
  });

  it("fails kinetic energy check when energy is far too low", () => {
    // Nominal KE for 30 km/h ≈ 52 083 J; 20% of that is 10 416 J — below 20% floor
    const r = validatePhysicsRealism(makePhysics({
      energyDistribution: {
        kineticEnergyJ: 1_000,   // way too low
        energyDissipatedJ: 900,
        energyDissipatedKj: 0.9,
      },
    }));
    const keCheck = r.checks.find(c => c.rule === "physics.kinetic_energy_range");
    expect(keCheck?.passed).toBe(false);
  });

  it("fails kinetic energy check when energy is far too high", () => {
    // Nominal KE for 30 km/h ≈ 52 083 J; 180% of that is 93 750 J — above 180% ceiling
    const r = validatePhysicsRealism(makePhysics({
      energyDistribution: {
        kineticEnergyJ: 500_000,  // way too high
        energyDissipatedJ: 490_000,
        energyDissipatedKj: 490,
      },
    }));
    const keCheck = r.checks.find(c => c.rule === "physics.kinetic_energy_range");
    expect(keCheck?.passed).toBe(false);
  });

  it("fails deceleration ceiling when deceleration exceeds 50g", () => {
    const r = validatePhysicsRealism(makePhysics({ decelerationG: 75 }));
    const decelCheck = r.checks.find(c => c.rule === "physics.deceleration_ceiling");
    expect(decelCheck?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("passes deceleration check at exactly 50g", () => {
    const r = validatePhysicsRealism(makePhysics({ decelerationG: 50 }));
    const decelCheck = r.checks.find(c => c.rule === "physics.deceleration_ceiling");
    expect(decelCheck?.passed).toBe(true);
  });

  it("compounds confidence penalties for multiple failures", () => {
    const r = validatePhysicsRealism(makePhysics({
      deltaVKmh: 250,
      impactForceKn: 1,         // too low
      decelerationG: 100,       // too high
      energyDistribution: {
        kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2,
        energyDissipatedJ: 100_000,
        energyDissipatedKj: 100,
      },
    }));
    expect(r.realism_flag).toBe(false);
    // Multiple penalties compound: should be well below 0.7
    expect(r.confidence_multiplier).toBeLessThan(0.7);
    expect(r.adjustment_reasons.length).toBeGreaterThan(1);
  });

  it("returns check detail for each rule", () => {
    const r = validatePhysicsRealism(makePhysics());
    // Should have at least 3 checks (delta-V, force, KE, decel)
    expect(r.checks.length).toBeGreaterThanOrEqual(3);
    r.checks.forEach(c => {
      expect(c).toHaveProperty("rule");
      expect(c).toHaveProperty("passed");
      expect(c).toHaveProperty("observed");
      expect(c).toHaveProperty("expected");
      expect(c).toHaveProperty("penalty");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cost realism tests
// ─────────────────────────────────────────────────────────────────────────────

describe("validateCostRealism", () => {
  it("passes all checks for a realistic cost breakdown", () => {
    const r = validateCostRealism(makeStage9(), 3);
    expect(r.realism_flag).toBe(true);
    expect(r.confidence_multiplier).toBe(1.0);
    expect(r.adjustment_reasons).toHaveLength(0);
  });

  it("fails labour ratio when labour is below 20%", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 200_000,
        labourCostCents: 10_000,   // 10/250 = 4% — below 20%
        paintCostCents: 30_000,
        hiddenDamageCostCents: 10_000,
        totalCents: 250_000,
      },
    }), 3);
    const check = r.checks.find(c => c.rule === "cost.labour_ratio");
    expect(check?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("fails labour ratio when labour exceeds 60%", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 50_000,
        labourCostCents: 180_000,  // 180/250 = 72% — above 60%
        paintCostCents: 10_000,
        hiddenDamageCostCents: 10_000,
        totalCents: 250_000,
      },
    }), 3);
    const check = r.checks.find(c => c.rule === "cost.labour_ratio");
    expect(check?.passed).toBe(false);
  });

  it("passes labour ratio at exactly 20%", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 150_000,
        labourCostCents: 50_000,   // 50/250 = 20% exactly
        paintCostCents: 30_000,
        hiddenDamageCostCents: 20_000,
        totalCents: 250_000,
      },
    }), 3);
    const check = r.checks.find(c => c.rule === "cost.labour_ratio");
    expect(check?.passed).toBe(true);
  });

  it("passes labour ratio at exactly 60%", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 50_000,
        labourCostCents: 150_000,  // 150/250 = 60% exactly
        paintCostCents: 30_000,
        hiddenDamageCostCents: 20_000,
        totalCents: 250_000,
      },
    }), 3);
    const check = r.checks.find(c => c.rule === "cost.labour_ratio");
    expect(check?.passed).toBe(true);
  });

  it("fails cost per component when cost is below minimum (R 50 per component)", () => {
    // 10 components, total = 250 000 cents = R 2500 → R 250 per component ✓
    // But 100 components → R 25 per component — below R 50 minimum
    const r = validateCostRealism(makeStage9(), 100_000);  // absurdly many components
    const check = r.checks.find(c => c.rule === "cost.cost_per_component");
    expect(check?.passed).toBe(false);
  });

  it("passes cost per component for 3 components at R 2500 total", () => {
    // 250 000 cents / 3 = R 833 per component — well within range
    const r = validateCostRealism(makeStage9(), 3);
    const check = r.checks.find(c => c.rule === "cost.cost_per_component");
    expect(check?.passed).toBe(true);
  });

  it("fails breakdown sum check when parts don't add up to total", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 100_000,
        labourCostCents: 100_000,
        paintCostCents: 30_000,
        hiddenDamageCostCents: 20_000,
        totalCents: 999_999,   // wrong total
      },
    }), 3);
    const check = r.checks.find(c => c.rule === "cost.breakdown_sum_matches_total");
    expect(check?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("passes breakdown sum check when parts add up exactly", () => {
    const r = validateCostRealism(makeStage9(), 3);
    const check = r.checks.find(c => c.rule === "cost.breakdown_sum_matches_total");
    expect(check?.passed).toBe(true);
  });

  it("fails total positive check when total is zero", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 0,
        labourCostCents: 0,
        paintCostCents: 0,
        hiddenDamageCostCents: 0,
        totalCents: 0,
      },
    }), 0);
    const check = r.checks.find(c => c.rule === "cost.total_positive");
    expect(check?.passed).toBe(false);
  });

  it("skips labour ratio and cost per component checks when total is zero", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 0,
        labourCostCents: 0,
        paintCostCents: 0,
        hiddenDamageCostCents: 0,
        totalCents: 0,
      },
    }), 0);
    // Labour ratio and cost per component checks are skipped when total=0 or componentCount=0
    const labourCheck = r.checks.find(c => c.rule === "cost.labour_ratio");
    const componentCheck = r.checks.find(c => c.rule === "cost.cost_per_component");
    expect(labourCheck).toBeUndefined();
    expect(componentCheck).toBeUndefined();
  });

  it("compounds confidence penalties for multiple cost failures", () => {
    const r = validateCostRealism(makeStage9({
      breakdown: {
        partsCostCents: 50_000,
        labourCostCents: 180_000,  // labour ratio violation
        paintCostCents: 10_000,
        hiddenDamageCostCents: 10_000,
        totalCents: 999_999,       // breakdown sum violation
      },
    }), 3);
    expect(r.realism_flag).toBe(false);
    expect(r.confidence_multiplier).toBeLessThan(0.8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fraud realism tests
// ─────────────────────────────────────────────────────────────────────────────

describe("validateFraudRealism", () => {
  it("passes all checks for a low-risk claim with no indicators", () => {
    const r = validateFraudRealism(makeFraud({ fraudRiskScore: 0.2, indicators: [] }));
    expect(r.realism_flag).toBe(true);
    expect(r.confidence_multiplier).toBe(1.0);
  });

  it("passes all checks for a high-risk claim with 3 distinct indicators", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.75,
      fraudRiskLevel: "high",
      indicators: [
        makeIndicator("photo_inconsistency"),
        makeIndicator("claim_frequency"),
        makeIndicator("repairer_history"),
      ],
    }));
    expect(r.realism_flag).toBe(true);
    expect(r.confidence_multiplier).toBe(1.0);
  });

  it("fails high_score_requires_indicators when HIGH score has only 1 indicator", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.80,
      fraudRiskLevel: "high",
      indicators: [makeIndicator("photo_inconsistency")],
    }));
    const check = r.checks.find(c => c.rule === "fraud.high_score_requires_indicators");
    expect(check?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("passes high_score_requires_indicators when HIGH score has exactly 2 indicators", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.70,
      fraudRiskLevel: "high",
      indicators: [makeIndicator("photo_inconsistency"), makeIndicator("claim_frequency")],
    }));
    const check = r.checks.find(c => c.rule === "fraud.high_score_requires_indicators");
    expect(check?.passed).toBe(true);
  });

  it("does not run high_score check when score is below HIGH threshold (0.65)", () => {
    const r = validateFraudRealism(makeFraud({ fraudRiskScore: 0.60, indicators: [] }));
    const check = r.checks.find(c => c.rule === "fraud.high_score_requires_indicators");
    expect(check).toBeUndefined();
  });

  it("fails score_reflects_indicators when indicators present but score is near zero", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.0,
      indicators: [makeIndicator("photo_inconsistency")],
    }));
    const check = r.checks.find(c => c.rule === "fraud.score_reflects_indicators");
    expect(check?.passed).toBe(false);
  });

  it("passes score_reflects_indicators when indicators present and score >= 0.10", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.10,
      indicators: [makeIndicator("photo_inconsistency")],
    }));
    const check = r.checks.find(c => c.rule === "fraud.score_reflects_indicators");
    expect(check?.passed).toBe(true);
  });

  it("does not run score_reflects_indicators when no indicators present", () => {
    const r = validateFraudRealism(makeFraud({ fraudRiskScore: 0.0, indicators: [] }));
    const check = r.checks.find(c => c.rule === "fraud.score_reflects_indicators");
    expect(check).toBeUndefined();
  });

  it("fails score_in_range when score exceeds 1.0", () => {
    const r = validateFraudRealism(makeFraud({ fraudRiskScore: 1.5 }));
    const check = r.checks.find(c => c.rule === "fraud.score_in_range");
    expect(check?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("fails score_in_range when score is negative", () => {
    const r = validateFraudRealism(makeFraud({ fraudRiskScore: -0.1 }));
    const check = r.checks.find(c => c.rule === "fraud.score_in_range");
    expect(check?.passed).toBe(false);
  });

  it("passes score_in_range at boundaries 0.0 and 1.0", () => {
    const r0 = validateFraudRealism(makeFraud({ fraudRiskScore: 0.0 }));
    const r1 = validateFraudRealism(makeFraud({ fraudRiskScore: 1.0, indicators: [makeIndicator("a"), makeIndicator("b")] }));
    expect(r0.checks.find(c => c.rule === "fraud.score_in_range")?.passed).toBe(true);
    expect(r1.checks.find(c => c.rule === "fraud.score_in_range")?.passed).toBe(true);
  });

  it("fails no_duplicate_indicator_categories when two indicators share a category", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.3,
      indicators: [
        makeIndicator("photo_inconsistency"),
        makeIndicator("photo_inconsistency"),  // duplicate category
      ],
    }));
    const check = r.checks.find(c => c.rule === "fraud.no_duplicate_indicator_categories");
    expect(check?.passed).toBe(false);
    expect(r.realism_flag).toBe(false);
  });

  it("passes no_duplicate_indicator_categories when all categories are unique", () => {
    const r = validateFraudRealism(makeFraud({
      fraudRiskScore: 0.3,
      indicators: [makeIndicator("photo_inconsistency"), makeIndicator("claim_frequency")],
    }));
    const check = r.checks.find(c => c.rule === "fraud.no_duplicate_indicator_categories");
    expect(check?.passed).toBe(true);
  });

  it("always includes score_in_range and no_duplicate_categories checks", () => {
    const r = validateFraudRealism(makeFraud());
    expect(r.checks.find(c => c.rule === "fraud.score_in_range")).toBeDefined();
    expect(r.checks.find(c => c.rule === "fraud.no_duplicate_indicator_categories")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Composite bundle tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRealismBundle", () => {
  it("returns overall_realism_flag true when all three engines pass", () => {
    const bundle = buildRealismBundle(makePhysics(), makeStage9(), makeFraud(), 3);
    expect(bundle.overall_realism_flag).toBe(true);
    expect(bundle.overall_confidence_multiplier).toBe(1.0);
    expect(bundle.physics.realism_flag).toBe(true);
    expect(bundle.cost.realism_flag).toBe(true);
    expect(bundle.fraud.realism_flag).toBe(true);
  });

  it("returns overall_realism_flag false when physics fails", () => {
    const bundle = buildRealismBundle(
      makePhysics({ deltaVKmh: 250, impactForceKn: 500, energyDistribution: { kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2, energyDissipatedJ: 100_000, energyDissipatedKj: 100 } }),
      makeStage9(),
      makeFraud(),
      3
    );
    expect(bundle.overall_realism_flag).toBe(false);
    expect(bundle.physics.realism_flag).toBe(false);
  });

  it("returns overall_realism_flag false when cost fails", () => {
    const bundle = buildRealismBundle(
      makePhysics(),
      makeStage9({ breakdown: { partsCostCents: 50_000, labourCostCents: 180_000, paintCostCents: 10_000, hiddenDamageCostCents: 10_000, totalCents: 999_999 } }),
      makeFraud(),
      3
    );
    expect(bundle.overall_realism_flag).toBe(false);
    expect(bundle.cost.realism_flag).toBe(false);
  });

  it("returns overall_realism_flag false when fraud fails", () => {
    const bundle = buildRealismBundle(
      makePhysics(),
      makeStage9(),
      makeFraud({ fraudRiskScore: 0.80, indicators: [makeIndicator("only_one")] }),
      3
    );
    expect(bundle.overall_realism_flag).toBe(false);
    expect(bundle.fraud.realism_flag).toBe(false);
  });

  it("compounds confidence multipliers across all three engines", () => {
    // Physics: 1 failure (penalty 0.20) → multiplier 0.80
    // Cost: 1 failure (penalty 0.15) → multiplier 0.85
    // Fraud: 1 failure (penalty 0.20) → multiplier 0.80
    // Combined: 0.80 × 0.85 × 0.80 ≈ 0.544
    const bundle = buildRealismBundle(
      makePhysics({ deltaVKmh: 250, impactForceKn: 500, energyDistribution: { kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2, energyDissipatedJ: 100_000, energyDissipatedKj: 100 } }),
      makeStage9({ breakdown: { partsCostCents: 50_000, labourCostCents: 180_000, paintCostCents: 10_000, hiddenDamageCostCents: 10_000, totalCents: 250_000 } }),
      makeFraud({ fraudRiskScore: 0.80, indicators: [makeIndicator("only_one")] }),
      3
    );
    expect(bundle.overall_confidence_multiplier).toBeLessThan(0.80);
    expect(bundle.overall_realism_flag).toBe(false);
  });

  it("returns all three engine results in the bundle", () => {
    const bundle = buildRealismBundle(makePhysics(), makeStage9(), makeFraud(), 3);
    expect(bundle).toHaveProperty("physics");
    expect(bundle).toHaveProperty("cost");
    expect(bundle).toHaveProperty("fraud");
    expect(bundle).toHaveProperty("overall_realism_flag");
    expect(bundle).toHaveProperty("overall_confidence_multiplier");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RealismResult contract tests
// ─────────────────────────────────────────────────────────────────────────────

describe("RealismResult contract", () => {
  it("always has realism_flag, confidence_multiplier, adjustment_reasons, checks", () => {
    const validators: Array<() => RealismResult> = [
      () => validatePhysicsRealism(makePhysics()),
      () => validateCostRealism(makeStage9(), 3),
      () => validateFraudRealism(makeFraud()),
    ];
    validators.forEach(fn => {
      const r = fn();
      expect(r).toHaveProperty("realism_flag");
      expect(r).toHaveProperty("confidence_multiplier");
      expect(r).toHaveProperty("adjustment_reasons");
      expect(r).toHaveProperty("checks");
      expect(typeof r.realism_flag).toBe("boolean");
      expect(typeof r.confidence_multiplier).toBe("number");
      expect(Array.isArray(r.adjustment_reasons)).toBe(true);
      expect(Array.isArray(r.checks)).toBe(true);
    });
  });

  it("confidence_multiplier is always between 0 and 1", () => {
    const r = validatePhysicsRealism(makePhysics({
      deltaVKmh: 250,
      impactForceKn: 1,
      decelerationG: 100,
      energyDistribution: { kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2, energyDissipatedJ: 100_000, energyDissipatedKj: 100 },
    }));
    expect(r.confidence_multiplier).toBeGreaterThan(0);
    expect(r.confidence_multiplier).toBeLessThanOrEqual(1);
  });

  it("adjustment_reasons length matches number of failed checks", () => {
    const r = validatePhysicsRealism(makePhysics({ deltaVKmh: 250, impactForceKn: 1, decelerationG: 100, energyDistribution: { kineticEnergyJ: 0.5 * 1500 * (250 / 3.6) ** 2, energyDissipatedJ: 100_000, energyDissipatedKj: 100 } }));
    const failedCount = r.checks.filter(c => !c.passed).length;
    expect(r.adjustment_reasons).toHaveLength(failedCount);
  });
});
