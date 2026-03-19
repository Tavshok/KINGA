/**
 * Stage 40 — Output Realism Validator
 *
 * Post-validates physics, cost, and fraud engine outputs for physical,
 * economic, and statistical plausibility.  Unrealistic outputs receive:
 *   • realism_flag: false
 *   • confidence_multiplier < 1.0
 *   • adjustment_reason (human-readable)
 *
 * Rules are intentionally conservative — they catch gross violations only,
 * not edge cases that require domain expertise to adjudicate.
 */

import type { Stage7Output } from "./types";
import type { Stage8Output } from "./types";
import type { Stage9Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared output contract
// ─────────────────────────────────────────────────────────────────────────────

export interface RealismResult {
  /** True when all realism checks pass */
  realism_flag: boolean;
  /** Multiplicative confidence penalty (1.0 = no penalty) */
  confidence_multiplier: number;
  /** Human-readable reasons for any failed checks */
  adjustment_reasons: string[];
  /** Per-check detail for audit trail */
  checks: RealismCheck[];
}

export interface RealismCheck {
  rule: string;
  passed: boolean;
  observed: string;
  expected: string;
  penalty: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics realism constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum delta-V (km/h) that should produce measurable force (>0 kN) */
const PHYSICS_MIN_DELTA_V_FOR_FORCE_KMH = 1;

/**
 * Expected force range per km/h of delta-V for a typical passenger vehicle
 * (~1 500 kg).  F = m·a; at 10 km/h delta-V over 0.1 s → ~41 kN.
 * We use a wide band to accommodate different vehicle masses and crush depths.
 *
 * Lower bound: 0.5 kN per km/h  (light vehicle, long crush)
 * Upper bound: 15 kN per km/h   (heavy vehicle, rigid barrier)
 */
const PHYSICS_FORCE_PER_KMH_MIN = 0.5; // kN per km/h
const PHYSICS_FORCE_PER_KMH_MAX = 15;  // kN per km/h

/**
 * Kinetic energy sanity: KE = ½mv²
 * For a 1 500 kg vehicle at delta-V km/h:
 *   KE_J = 0.5 × 1500 × (deltaV / 3.6)²
 * We allow ±80% band to cover mass variation (800 kg – 4 500 kg).
 */
const VEHICLE_MASS_KG_NOMINAL = 1500;
const PHYSICS_ENERGY_BAND_FACTOR = 0.80; // ±80%

/** Maximum physically plausible delta-V for a road accident (km/h) */
const PHYSICS_MAX_DELTA_V_KMH = 200;

/** Maximum plausible deceleration for a road accident (g) */
const PHYSICS_MAX_DECEL_G = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Cost realism constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum cost per damaged component (cents) — even a small scratch costs something */
const COST_MIN_PER_COMPONENT_CENTS = 5_000; // R 50 / $5

/** Maximum cost per damaged component (cents) — exotic parts ceiling */
const COST_MAX_PER_COMPONENT_CENTS = 500_000_00; // R 500 000 / $50 000

/** Labour ratio band (same as Stage 36) */
const COST_LABOUR_RATIO_MIN = 0.20;
const COST_LABOUR_RATIO_MAX = 0.60;

// ─────────────────────────────────────────────────────────────────────────────
// Fraud realism constants
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum independent indicators required to justify a HIGH fraud risk score */
const FRAUD_MIN_INDICATORS_FOR_HIGH = 2;

/** Threshold above which a score is considered HIGH */
const FRAUD_HIGH_SCORE_THRESHOLD = 0.65;

/** Minimum score that should be present when any indicator fires */
const FRAUD_MIN_SCORE_WITH_INDICATORS = 0.10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildResult(checks: RealismCheck[]): RealismResult {
  const failed = checks.filter((c) => !c.passed);
  const realism_flag = failed.length === 0;
  // Compound all penalties (multiplicative)
  const confidence_multiplier = failed.reduce(
    (acc, c) => acc * (1 - c.penalty),
    1.0
  );
  const adjustment_reasons = failed.map(
    (c) => `[${c.rule}] ${c.observed} — expected ${c.expected}`
  );
  return { realism_flag, confidence_multiplier, adjustment_reasons, checks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics realism validator
// ─────────────────────────────────────────────────────────────────────────────

export function validatePhysicsRealism(physics: Stage7Output): RealismResult {
  const checks: RealismCheck[] = [];

  // Skip all checks when physics engine was not executed (non-collision claim)
  if (!physics.physicsExecuted) {
    return { realism_flag: true, confidence_multiplier: 1.0, adjustment_reasons: [], checks: [] };
  }

  const { deltaVKmh, impactForceKn, energyDistribution, decelerationG } = physics;

  // ── Rule 1: delta-V ceiling ──────────────────────────────────────────────
  const deltaVCeilingPassed = deltaVKmh <= PHYSICS_MAX_DELTA_V_KMH;
  checks.push({
    rule: "physics.deltaV_ceiling",
    passed: deltaVCeilingPassed,
    observed: `delta-V = ${deltaVKmh.toFixed(1)} km/h`,
    expected: `≤ ${PHYSICS_MAX_DELTA_V_KMH} km/h`,
    penalty: 0.20,
  });

  // ── Rule 2: force proportional to delta-V ───────────────────────────────
  if (deltaVKmh >= PHYSICS_MIN_DELTA_V_FOR_FORCE_KMH) {
    const forcePerKmh = impactForceKn / deltaVKmh;
    const forceProportionalPassed =
      forcePerKmh >= PHYSICS_FORCE_PER_KMH_MIN &&
      forcePerKmh <= PHYSICS_FORCE_PER_KMH_MAX;
    checks.push({
      rule: "physics.force_proportional_to_deltaV",
      passed: forceProportionalPassed,
      observed: `force/delta-V = ${forcePerKmh.toFixed(2)} kN per km/h`,
      expected: `${PHYSICS_FORCE_PER_KMH_MIN}–${PHYSICS_FORCE_PER_KMH_MAX} kN per km/h`,
      penalty: 0.15,
    });
  }

  // ── Rule 3: kinetic energy within expected range ─────────────────────────
  const deltaVMs = deltaVKmh / 3.6;
  const expectedKEJ = 0.5 * VEHICLE_MASS_KG_NOMINAL * deltaVMs * deltaVMs;
  const keMin = expectedKEJ * (1 - PHYSICS_ENERGY_BAND_FACTOR);
  const keMax = expectedKEJ * (1 + PHYSICS_ENERGY_BAND_FACTOR);
  const actualKEJ = energyDistribution.kineticEnergyJ;
  const energyInRangePassed = actualKEJ >= keMin && actualKEJ <= keMax;
  checks.push({
    rule: "physics.kinetic_energy_range",
    passed: energyInRangePassed,
    observed: `KE = ${Math.round(actualKEJ).toLocaleString()} J`,
    expected: `${Math.round(keMin).toLocaleString()}–${Math.round(keMax).toLocaleString()} J (±80% of nominal 1 500 kg vehicle)`,
    penalty: 0.15,
  });

  // ── Rule 4: deceleration ceiling ────────────────────────────────────────
  const decelPassed = decelerationG <= PHYSICS_MAX_DECEL_G;
  checks.push({
    rule: "physics.deceleration_ceiling",
    passed: decelPassed,
    observed: `deceleration = ${decelerationG.toFixed(1)} g`,
    expected: `≤ ${PHYSICS_MAX_DECEL_G} g`,
    penalty: 0.10,
  });

  return buildResult(checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost realism validator
// ─────────────────────────────────────────────────────────────────────────────

export function validateCostRealism(
  cost: Stage9Output,
  componentCount: number
): RealismResult {
  const checks: RealismCheck[] = [];

  const { breakdown } = cost;
  const total = breakdown.totalCents;

  // ── Rule 1: labour ratio band ────────────────────────────────────────────
  if (total > 0) {
    const labourRatio = breakdown.labourCostCents / total;
    const labourRatioPassed =
      labourRatio >= COST_LABOUR_RATIO_MIN && labourRatio <= COST_LABOUR_RATIO_MAX;
    checks.push({
      rule: "cost.labour_ratio",
      passed: labourRatioPassed,
      observed: `labour ratio = ${(labourRatio * 100).toFixed(1)}%`,
      expected: `${COST_LABOUR_RATIO_MIN * 100}–${COST_LABOUR_RATIO_MAX * 100}%`,
      penalty: 0.15,
    });
  }

  // ── Rule 2: cost per component plausibility ──────────────────────────────
  if (componentCount > 0 && total > 0) {
    const costPerComponent = total / componentCount;
    const costPerComponentPassed =
      costPerComponent >= COST_MIN_PER_COMPONENT_CENTS &&
      costPerComponent <= COST_MAX_PER_COMPONENT_CENTS;
    checks.push({
      rule: "cost.cost_per_component",
      passed: costPerComponentPassed,
      observed: `cost per component = ${Math.round(costPerComponent / 100).toLocaleString()} (currency units)`,
      expected: `${Math.round(COST_MIN_PER_COMPONENT_CENTS / 100).toLocaleString()}–${Math.round(COST_MAX_PER_COMPONENT_CENTS / 100).toLocaleString()} per component`,
      penalty: 0.15,
    });
  }

  // ── Rule 3: parts + labour + paint + hidden ≈ total ─────────────────────
  const sumOfParts =
    breakdown.partsCostCents +
    breakdown.labourCostCents +
    breakdown.paintCostCents +
    breakdown.hiddenDamageCostCents;
  const breakdownMatchesPassed = Math.abs(sumOfParts - total) <= 1; // allow 1 cent rounding
  checks.push({
    rule: "cost.breakdown_sum_matches_total",
    passed: breakdownMatchesPassed,
    observed: `parts + labour + paint + hidden = ${Math.round(sumOfParts / 100).toLocaleString()}, total = ${Math.round(total / 100).toLocaleString()}`,
    expected: "sum of breakdown components must equal total (±1 cent)",
    penalty: 0.20,
  });

  // ── Rule 4: total cost > 0 ───────────────────────────────────────────────
  const totalPositivePassed = total > 0;
  checks.push({
    rule: "cost.total_positive",
    passed: totalPositivePassed,
    observed: `total = ${total}`,
    expected: "> 0",
    penalty: 0.25,
  });

  return buildResult(checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fraud realism validator
// ─────────────────────────────────────────────────────────────────────────────

export function validateFraudRealism(fraud: Stage8Output): RealismResult {
  const checks: RealismCheck[] = [];

  const { fraudRiskScore, indicators } = fraud;
  const indicatorCount = indicators.length;

  // ── Rule 1: HIGH score requires ≥ 2 independent indicators ───────────────
  if (fraudRiskScore >= FRAUD_HIGH_SCORE_THRESHOLD) {
    const highScoreSupported = indicatorCount >= FRAUD_MIN_INDICATORS_FOR_HIGH;
    checks.push({
      rule: "fraud.high_score_requires_indicators",
      passed: highScoreSupported,
      observed: `fraud score = ${fraudRiskScore.toFixed(2)} with ${indicatorCount} indicator(s)`,
      expected: `≥ ${FRAUD_MIN_INDICATORS_FOR_HIGH} indicators when score ≥ ${FRAUD_HIGH_SCORE_THRESHOLD}`,
      penalty: 0.20,
    });
  }

  // ── Rule 2: indicators present → score must be non-trivial ───────────────
  if (indicatorCount > 0) {
    const scoreNonTrivialPassed = fraudRiskScore >= FRAUD_MIN_SCORE_WITH_INDICATORS;
    checks.push({
      rule: "fraud.score_reflects_indicators",
      passed: scoreNonTrivialPassed,
      observed: `fraud score = ${fraudRiskScore.toFixed(2)} with ${indicatorCount} indicator(s)`,
      expected: `score ≥ ${FRAUD_MIN_SCORE_WITH_INDICATORS} when indicators are present`,
      penalty: 0.15,
    });
  }

  // ── Rule 3: score in valid range [0, 1] ──────────────────────────────────
  const scoreInRangePassed = fraudRiskScore >= 0 && fraudRiskScore <= 1;
  checks.push({
    rule: "fraud.score_in_range",
    passed: scoreInRangePassed,
    observed: `fraud score = ${fraudRiskScore}`,
    expected: "0.0–1.0",
    penalty: 0.25,
  });

  // ── Rule 4: no duplicate indicator categories ────────────────────────────
  const categories = indicators.map((i) => i.category);
  const uniqueCategories = new Set(categories);
  const noDuplicateCategoriesPassed = uniqueCategories.size === categories.length;
  checks.push({
    rule: "fraud.no_duplicate_indicator_categories",
    passed: noDuplicateCategoriesPassed,
    observed: `${categories.length} indicator(s), ${uniqueCategories.size} unique categor${uniqueCategories.size === 1 ? "y" : "ies"}`,
    expected: "each indicator category must appear at most once",
    penalty: 0.10,
  });

  return buildResult(checks);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite bundle
// ─────────────────────────────────────────────────────────────────────────────

export interface RealismBundle {
  physics: RealismResult;
  cost: RealismResult;
  fraud: RealismResult;
  /** Overall flag — true only when all three engines pass */
  overall_realism_flag: boolean;
  /** Compound confidence multiplier across all engines */
  overall_confidence_multiplier: number;
}

export function buildRealismBundle(
  physics: Stage7Output,
  cost: Stage9Output,
  fraud: Stage8Output,
  componentCount: number
): RealismBundle {
  const physicsResult = validatePhysicsRealism(physics);
  const costResult = validateCostRealism(cost, componentCount);
  const fraudResult = validateFraudRealism(fraud);

  const overall_realism_flag =
    physicsResult.realism_flag &&
    costResult.realism_flag &&
    fraudResult.realism_flag;

  const overall_confidence_multiplier =
    physicsResult.confidence_multiplier *
    costResult.confidence_multiplier *
    fraudResult.confidence_multiplier;

  return {
    physics: physicsResult,
    cost: costResult,
    fraud: fraudResult,
    overall_realism_flag,
    overall_confidence_multiplier,
  };
}
