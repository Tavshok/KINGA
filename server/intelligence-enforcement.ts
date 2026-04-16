/**
 * intelligence-enforcement.ts
 *
 * KINGA Intelligence Enforcement Layer
 *
 * This module is the final validation pass applied to every AI assessment
 * before it is stored or returned to the frontend. It enforces:
 *
 *   1. Physics Enforcement   — estimates velocity/force/energy from delta-V
 *                              when the physics engine returns zeros.
 *   2. Impact Consistency    — flags damage consistency < 50% as HIGH anomaly
 *                              and increases fraud weighting.
 *   3. Direction vs Damage   — detects mismatch between impact_direction and
 *                              damage zones; generates explanation.
 *   4. Cost Enforcement      — always produces a fair cost range and benchmark
 *                              even when no quotes exist.
 *   5. Fraud Score Mapping   — enforces strict label thresholds:
 *                              0–20 Minimal | 21–40 Low | 41–60 Moderate |
 *                              61–80 High | 81–100 Critical
 *   6. Output Enhancement    — converts raw values into decision insights and
 *                              generates top-3 critical alerts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type FraudLevelEnforced = "minimal" | "low" | "moderate" | "high" | "elevated";

export interface PhysicsEstimate {
  velocityRangeKmh: { min: number; max: number };
  estimatedVelocityKmh: number;
  impactForceKn: { min: number; max: number };
  energyKj: { min: number; max: number };
  deltaVKmh: number;
  estimated: true;
  basis: string;
  insight: string;
}

export interface ImpactConsistencyFlag {
  flagged: boolean;
  score: number;
  anomalyLevel: "none" | "low" | "medium" | "high";
  explanation: string;
  fraudWeightIncrease: number;
}

export interface DirectionDamageFlag {
  mismatch: boolean;
  impactDirection: string;
  damageZones: string[];
  explanation: string;
  possibleExplanations: string[];
}

export interface CostBenchmark {
  estimatedFairMin: number;
  estimatedFairMax: number;
  estimatedFairMid: number;
  partsProjection: number;
  labourProjection: number;
  basis: string;
  confidence: "low" | "medium" | "high";
}

export interface CriticalAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  engine: string;
}

export interface CostVerdict {
  /** AI estimated cost in USD */
  aiEstimatedCost: number;
  /** Highest quoted cost (0 if no quotes) */
  quotedCost: number;
  /** Fair cost range */
  fairMin: number;
  fairMax: number;
  /** Deviation % = ((Quoted - AI) / AI) * 100 */
  deviationPercent: number | null;
  /** OVERPRICED | FAIR | UNDERPRICED | NO_QUOTE */
  verdict: "OVERPRICED" | "FAIR" | "UNDERPRICED" | "NO_QUOTE";
  /** Rule that determined the verdict */
  ruleApplied: string;
  /** Human-readable explanation */
  explanation: string;
}

export interface ConfidenceBreakdown {
  /** Final confidence score (0-100) */
  score: number;
  /** Starting value */
  base: number;
  /** Penalty factors applied */
  penalties: Array<{ factor: string; deduction: number; reason: string }>;
  /** Human-readable summary */
  summary: string;
}

export type FinalDecision = "FINALISE_CLAIM" | "REVIEW_REQUIRED" | "ESCALATE_INVESTIGATION";

export interface FinalDecisionResult {
  decision: FinalDecision;
  label: string;
  color: "green" | "amber" | "red";
  /** Ordered list of rules that triggered this decision */
  ruleTrace: Array<{ rule: string; value: string | number; threshold: string; triggered: boolean }>;
  /** Primary reason for the decision */
  primaryReason: string;
  /** Recommended next actions */
  recommendedActions: string[];
}

export interface FraudScoreBreakdown {
  /** Final adjusted fraud score */
  totalScore: number;
  /** Base score from AI pipeline */
  baseScore: number;
  /** Weighted component contributions */
  components: Array<{ factor: string; contribution: number; weight: string }>;
  /** Enforcement adjustments applied */
  adjustments: Array<{ source: string; delta: number; reason: string }>;
  /** Enforced label */
  level: FraudLevelEnforced;
  label: string;
}

export interface IntelligenceEnforcementResult {
  /** Corrected fraud level using strict 5-band mapping */
  fraudLevelEnforced: FraudLevelEnforced;
  fraudLevelLabel: string;
  /** Physics estimates when raw values are zero */
  physicsEstimate: PhysicsEstimate | null;
  /** Human-readable physics insight */
  physicsInsight: string;
  /** Impact consistency analysis */
  consistencyFlag: ImpactConsistencyFlag;
  /** Direction vs damage zone validation */
  directionFlag: DirectionDamageFlag;
  /** Cost benchmark (always populated) */
  costBenchmark: CostBenchmark;
  /** Cost verdict with deviation calculation */
  costVerdict: CostVerdict;
  /** Weighted fraud score breakdown */
  fraudScoreBreakdown: FraudScoreBreakdown;
  /** Confidence score with penalty breakdown */
  confidenceBreakdown: ConfidenceBreakdown;
  /** Final claim decision with rule trace */
  finalDecision: FinalDecisionResult;
  /** Top-3 critical alerts */
  alerts: CriticalAlert[];
  /** Additional fraud score adjustment from enforcement rules */
  fraudScoreAdjustment: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Vehicle mass defaults by body type (kg) */
const VEHICLE_MASS_DEFAULTS: Record<string, number> = {
  suv: 1900,
  pickup: 2100,
  sedan: 1400,
  hatchback: 1200,
  van: 2400,
  truck: 3500,
  sports: 1350,
  compact: 1150,
  default: 1600,
};

/** Labour rate for Zimbabwe/Southern Africa market (USD/hour) */
const LABOUR_RATE_USD_PER_HOUR = 25;

/** Parts-to-labour ratio by damage severity */
const PARTS_LABOUR_RATIO: Record<string, { parts: number; labour: number }> = {
  cosmetic: { parts: 0.70, labour: 0.30 },
  minor:    { parts: 0.65, labour: 0.35 },
  moderate: { parts: 0.60, labour: 0.40 },
  severe:   { parts: 0.55, labour: 0.45 },
  catastrophic: { parts: 0.50, labour: 0.50 },
};

/** Cost range multipliers by severity */
const SEVERITY_COST_RANGE: Record<string, { base: number; min: number; max: number }> = {
  cosmetic:    { base: 350,   min: 150,   max: 800    },
  minor:       { base: 900,   min: 400,   max: 2500   },
  moderate:    { base: 3500,  min: 1500,  max: 8000   },
  severe:      { base: 12000, min: 6000,  max: 25000  },
  catastrophic:{ base: 35000, min: 20000, max: 80000  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. FRAUD SCORE LABEL ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforces strict 5-band fraud score mapping.
 * The legacy system used "very_high" for 76+; enforcement replaces this
 * with "elevated" for 81+ and adjusts all band boundaries.
 */
export function enforceFraudLevel(score: number): { level: FraudLevelEnforced; label: string } {
  if (score >= 81) return { level: "elevated", label: "Elevated Risk" };
  if (score >= 61) return { level: "high",      label: "High Risk"      };
  if (score >= 41) return { level: "moderate",  label: "Moderate Risk"  };
  if (score >= 21) return { level: "low",       label: "Low Risk"       };
  return                  { level: "minimal",   label: "Minimal Risk"   };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PHYSICS ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the physics engine returns zero velocity/force/energy but delta-V
 * is known, estimate the missing values using simplified Newtonian mechanics.
 *
 * Formulas:
 *   - Estimated velocity = delta-V × 1.5 to 2.5 (typical collision ratio)
 *   - Kinetic energy (J) = 0.5 × mass × (v_ms)²
 *   - Impact force (N) = KE / crush_depth (assumed 0.15m for minor, 0.30m moderate)
 */
export function enforcePhysics(params: {
  estimatedSpeedKmh: number;
  deltaVKmh: number;
  impactForceKn: number;
  energyKj: number;
  vehicleMassKg: number;
  accidentSeverity: string;
  damageComponents: number;
}): PhysicsEstimate | null {
  const { estimatedSpeedKmh, deltaVKmh, impactForceKn, energyKj, vehicleMassKg, accidentSeverity, damageComponents } = params;

  // If physics engine already produced real values, no enforcement needed
  if (estimatedSpeedKmh > 0 && impactForceKn > 0 && energyKj > 0) return null;

  // Need at least delta-V or damage severity to estimate
  if (deltaVKmh <= 0 && damageComponents === 0) return null;

  const mass = vehicleMassKg > 0 ? vehicleMassKg : VEHICLE_MASS_DEFAULTS.default;

  // Estimate velocity from delta-V (delta-V is typically 40-70% of impact speed)
  let velocityEstKmh: number;
  let velocityMin: number;
  let velocityMax: number;

  if (deltaVKmh > 0) {
    // delta-V = velocity × (1 - restitution_coefficient)
    // For typical collisions, restitution ≈ 0.3–0.5
    velocityEstKmh = deltaVKmh * 1.8;
    velocityMin = Math.round(deltaVKmh * 1.4);
    velocityMax = Math.round(deltaVKmh * 2.5);
  } else {
    // Fall back to severity-based estimate
    const severitySpeed: Record<string, { min: number; est: number; max: number }> = {
      cosmetic:    { min: 5,  est: 10, max: 20  },
      minor:       { min: 15, est: 25, max: 40  },
      moderate:    { min: 30, est: 50, max: 70  },
      severe:      { min: 60, est: 80, max: 110 },
      catastrophic:{ min: 90, est: 120, max: 160 },
    };
    const s = severitySpeed[accidentSeverity] ?? severitySpeed.minor;
    velocityEstKmh = s.est;
    velocityMin = s.min;
    velocityMax = s.max;
  }

  const velocityMs = velocityEstKmh / 3.6;
  const velocityMinMs = velocityMin / 3.6;
  const velocityMaxMs = velocityMax / 3.6;

  // Kinetic energy
  const keJ = 0.5 * mass * velocityMs * velocityMs;
  const keMinJ = 0.5 * mass * velocityMinMs * velocityMinMs;
  const keMaxJ = 0.5 * mass * velocityMaxMs * velocityMaxMs;

  // Crush depth assumption by severity
  const crushDepth: Record<string, number> = {
    cosmetic: 0.02, minor: 0.08, moderate: 0.20, severe: 0.40, catastrophic: 0.70
  };
  const depth = crushDepth[accidentSeverity] ?? 0.10;

  // Impact force = KE / crush_depth
  const forceN = keJ / depth;
  const forceMinN = keMinJ / depth;
  const forceMaxN = keMaxJ / depth;

  const basis = deltaVKmh > 0
    ? `Estimated from delta-V of ${deltaVKmh} km/h using Newtonian mechanics (mass: ${mass}kg)`
    : `Estimated from damage severity (${accidentSeverity}) using industry averages`;

  const insight = buildPhysicsInsight(velocityEstKmh, deltaVKmh, accidentSeverity, damageComponents);

  return {
    velocityRangeKmh: { min: velocityMin, max: velocityMax },
    estimatedVelocityKmh: Math.round(velocityEstKmh),
    impactForceKn: {
      min: Math.round(forceMinN / 1000 * 10) / 10,
      max: Math.round(forceMaxN / 1000 * 10) / 10,
    },
    energyKj: {
      min: Math.round(keMinJ / 1000 * 10) / 10,
      max: Math.round(keMaxJ / 1000 * 10) / 10,
    },
    deltaVKmh,
    estimated: true,
    basis,
    insight,
  };
}

function buildPhysicsInsight(
  velocityKmh: number,
  deltaV: number,
  severity: string,
  componentCount: number
): string {
  const speedDesc = velocityKmh < 30 ? "Low-speed"
    : velocityKmh < 60 ? "Moderate-speed"
    : velocityKmh < 100 ? "High-speed"
    : "Very high-speed";

  const severityDesc = severity === "minor" ? "minor"
    : severity === "moderate" ? "moderate"
    : severity === "severe" ? "significant"
    : severity === "catastrophic" ? "catastrophic"
    : "cosmetic";

  const parts = [
    `${speedDesc} impact (estimated ${Math.round(velocityKmh)} km/h) consistent with ${severityDesc} ${componentCount > 0 ? `${componentCount}-component` : ""} front-end damage.`,
    deltaV > 0 ? `Delta-V of ${deltaV} km/h indicates a ${deltaV < 20 ? "low-energy" : deltaV < 40 ? "moderate-energy" : "high-energy"} collision event.` : null,
    severity === "moderate" || severity === "severe"
      ? "Structural inspection recommended to assess hidden frame deformation."
      : null,
  ].filter(Boolean);

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IMPACT CONSISTENCY ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

export function enforceImpactConsistency(params: {
  consistencyScore: number;
  fraudScore: number;
  impactDirection: string;
  accidentSeverity: string;
}): ImpactConsistencyFlag {
  const { consistencyScore, impactDirection, accidentSeverity } = params;

  if (consistencyScore >= 50) {
    return {
      flagged: false,
      score: consistencyScore,
      anomalyLevel: consistencyScore >= 75 ? "none" : "low",
      explanation: `Damage pattern is consistent with reported ${impactDirection} impact (${consistencyScore}% match).`,
      fraudWeightIncrease: 0,
    };
  }

  // Below 50% — HIGH anomaly
  const fraudWeightIncrease = consistencyScore < 25 ? 15 : 8;
  const anomalyLevel: "high" | "medium" = consistencyScore < 25 ? "high" : "medium";

  return {
    flagged: true,
    score: consistencyScore,
    anomalyLevel,
    explanation: `Damage pattern does not align with reported impact direction (${consistencyScore}% consistency). `
      + `Expected damage distribution for a ${impactDirection} ${accidentSeverity} collision is significantly different from what was detected.`,
    fraudWeightIncrease,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DIRECTION VS DAMAGE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/** Maps impact direction to expected primary damage zones */
const DIRECTION_ZONE_MAP: Record<string, string[]> = {
  frontal:         ["front", "hood", "windshield", "windscreen", "engine", "bonnet", "bumper", "grille", "headlamp", "headlight", "fender", "wing", "radiator", "intercooler"],
  rear:            ["rear", "boot", "back", "tail", "tailgate", "tow"],
  side_driver:     ["left", "driver", "door_left", "pillar_left"],
  side_passenger:  ["right", "passenger", "door_right", "pillar_right"],
  rollover:        ["roof", "cabin", "pillar", "side", "a-pillar", "b-pillar"],
  multi_impact:    [], // any zone valid
  unknown:         [], // skip validation
};

export function enforceDirectionDamageConsistency(params: {
  impactDirection: string;
  damageZones: string[];
  damageComponents: string[];
  /** Pass incidentType so animal_strike claims always use frontal zone map */
  incidentType?: string;
}): DirectionDamageFlag {
  const { impactDirection, damageZones, damageComponents, incidentType } = params;

  // Animal strikes always produce frontal impact regardless of vehicle trajectory.
  // The vehicle may swerve/roll AFTER hitting the animal, but the primary damage
  // is always frontal. Override the direction for zone-matching purposes only.
  const effectiveDirection =
    incidentType === "animal_strike" ? "frontal" : impactDirection;

  const expectedZones = DIRECTION_ZONE_MAP[effectiveDirection] ?? [];

  // Skip if direction unknown or multi-impact
  if (expectedZones.length === 0) {
    return {
      mismatch: false,
      impactDirection,
      damageZones,
      explanation: "Direction-damage validation skipped — impact direction is unknown or multi-impact.",
      possibleExplanations: [],
    };
  }

  const allDamageText = [...damageZones, ...damageComponents].map(s => s.toLowerCase()).join(" ");
  const hasExpectedZone = expectedZones.some(zone => allDamageText.includes(zone));

  if (hasExpectedZone) {
    return {
      mismatch: false,
      impactDirection,
      damageZones,
      explanation: incidentType === "animal_strike"
        ? "Damage zones are consistent with an animal strike (frontal impact pattern)."
        : `Damage zones are consistent with reported ${effectiveDirection.replace(/_/g, " ")} impact direction.`,
      possibleExplanations: [],
    };
  }

  return {
    mismatch: true,
    impactDirection,
    damageZones,
    explanation: incidentType === "animal_strike"
      ? `Damage zones (${damageZones.join(", ") || "unspecified"}) do not match expected frontal zones for an animal strike.`
      : `Damage zones (${damageZones.join(", ") || "unspecified"}) do not match expected zones for a ${effectiveDirection.replace(/_/g, " ")} collision.`,
    possibleExplanations: [
      "Secondary impact may have caused damage to unexpected zones",
      "Accident direction may have been misreported in the claim form",
      "Pre-existing damage may be included in the damage assessment",
      "Vehicle may have rotated during the collision event",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COST ENGINE ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Always produces a fair cost range and benchmark.
 * When no quotes exist, uses AI estimate + severity-based range.
 * When quotes exist, uses median ± 20% as fair range.
 */
export function enforceCostBenchmark(params: {
  aiEstimatedCost: number;
  quotedAmounts: number[];
  accidentSeverity: string;
  componentCount: number;
  vehicleMake: string;
}): CostBenchmark {
  const { aiEstimatedCost, quotedAmounts, accidentSeverity, componentCount } = params;

  const severityRange = SEVERITY_COST_RANGE[accidentSeverity] ?? SEVERITY_COST_RANGE.minor;
  const ratio = PARTS_LABOUR_RATIO[accidentSeverity] ?? PARTS_LABOUR_RATIO.minor;

  // Component count adjustment: each additional component adds ~15% to base
  const componentMultiplier = 1 + Math.max(0, componentCount - 1) * 0.15;

  if (quotedAmounts.length >= 2) {
    // Use median of quotes as fair mid-point
    const sorted = [...quotedAmounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const fairMin = Math.round(median * 0.80);
    const fairMax = Math.round(median * 1.20);
    const partsProjection = Math.round(median * ratio.parts);
    const labourProjection = Math.round(median * ratio.labour);

    return {
      estimatedFairMin: fairMin,
      estimatedFairMax: fairMax,
      estimatedFairMid: median,
      partsProjection,
      labourProjection,
      basis: `Derived from median of ${quotedAmounts.length} quotes (±20% fair range)`,
      confidence: "high",
    };
  }

  if (quotedAmounts.length === 1) {
    const quote = quotedAmounts[0];
    const fairMin = Math.round(Math.min(quote, aiEstimatedCost) * 0.85);
    const fairMax = Math.round(Math.max(quote, aiEstimatedCost) * 1.15);
    const fairMid = Math.round((fairMin + fairMax) / 2);

    return {
      estimatedFairMin: fairMin,
      estimatedFairMax: fairMax,
      estimatedFairMid: fairMid,
      partsProjection: Math.round(fairMid * ratio.parts),
      labourProjection: Math.round(fairMid * ratio.labour),
      basis: "Derived from single quote and AI estimate (±15% fair range)",
      confidence: "medium",
    };
  }

  // No quotes — use AI estimate or severity benchmark
  const base = aiEstimatedCost > 0
    ? aiEstimatedCost
    : Math.round(severityRange.base * componentMultiplier);

  const fairMin = aiEstimatedCost > 0
    ? Math.round(aiEstimatedCost * 0.85)
    : Math.round(severityRange.min * componentMultiplier);

  const fairMax = aiEstimatedCost > 0
    ? Math.round(aiEstimatedCost * 1.30)
    : Math.round(severityRange.max * componentMultiplier);

  return {
    estimatedFairMin: fairMin,
    estimatedFairMax: fairMax,
    estimatedFairMid: base,
    partsProjection: Math.round(base * ratio.parts),
    labourProjection: Math.round(base * ratio.labour),
    basis: aiEstimatedCost > 0
      ? `AI estimate of $${aiEstimatedCost.toLocaleString()} with ±15–30% market range`
      : `Severity-based benchmark (${accidentSeverity}, ${componentCount} components)`,
    confidence: aiEstimatedCost > 0 ? "medium" : "low",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CRITICAL ALERTS GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateCriticalAlerts(params: {
  consistencyFlag: ImpactConsistencyFlag;
  directionFlag: DirectionDamageFlag;
  fraudScore: number;
  fraudLevel: FraudLevelEnforced;
  aiEstimatedCost: number;
  quotedAmounts: number[];
  physicsEstimate: PhysicsEstimate | null;
  accidentSeverity: string;
  componentCount: number;
  vehicleMake: string;
  hasPreviousClaims: boolean;
}): CriticalAlert[] {
  const alerts: Array<CriticalAlert & { priority: number }> = [];

  // Alert: High/Critical fraud risk
  if (params.fraudScore >= 61) {
    alerts.push({
      id: "fraud_high",
      severity: "critical",
      title: `${params.fraudLevel === "elevated" ? "Elevated" : "High"} Fraud Risk Detected`,
      detail: `Fraud score of ${params.fraudScore}/100 exceeds the ${params.fraudLevel === "elevated" ? "elevated (81+)" : "high (61+)"} threshold. Escalate to senior assessor before approving.`,
      engine: "Fraud Detection Engine",
      priority: 10,
    });
  } else if (params.fraudScore >= 41) {
    alerts.push({
      id: "fraud_moderate",
      severity: "warning",
      title: "Moderate Fraud Risk — Manual Review Recommended",
      detail: `Fraud score of ${params.fraudScore}/100 indicates elevated risk. Independent verification of damage and incident details is recommended.`,
      engine: "Fraud Detection Engine",
      priority: 6,
    });
  }

  // Alert: Damage consistency anomaly
  if (params.consistencyFlag.flagged) {
    alerts.push({
      id: "consistency_anomaly",
      severity: params.consistencyFlag.anomalyLevel === "high" ? "critical" : "warning",
      title: `Damage Consistency Anomaly (${params.consistencyFlag.score}%)`,
      detail: params.consistencyFlag.explanation,
      engine: "Physics Engine",
      priority: params.consistencyFlag.anomalyLevel === "high" ? 9 : 5,
    });
  }

  // Alert: Direction vs damage mismatch
  if (params.directionFlag.mismatch) {
    alerts.push({
      id: "direction_mismatch",
      severity: "warning",
      title: "Impact Direction vs Damage Zone Mismatch",
      detail: params.directionFlag.explanation + " Possible explanations: " + params.directionFlag.possibleExplanations.slice(0, 2).join("; ") + ".",
      engine: "Impact Vector Analysis",
      priority: 7,
    });
  }

  // Alert: Cost overpricing
  if (params.quotedAmounts.length > 0 && params.aiEstimatedCost > 0) {
    const maxQuote = Math.max(...params.quotedAmounts);
    const overpriceRatio = maxQuote / params.aiEstimatedCost;
    if (overpriceRatio > 1.5) {
      alerts.push({
        id: "cost_overpricing",
        severity: overpriceRatio > 2.5 ? "critical" : "warning",
        title: `Quote ${Math.round((overpriceRatio - 1) * 100)}% Above AI Estimate`,
        detail: `Highest quote of $${maxQuote.toLocaleString()} is ${Math.round((overpriceRatio - 1) * 100)}% above the AI-estimated fair cost of $${params.aiEstimatedCost.toLocaleString()}. Verify parts pricing and labour rates.`,
        engine: "Repair Cost Engine",
        priority: overpriceRatio > 2.5 ? 8 : 4,
      });
    }
  }

  // Alert: Physics estimation used (informational)
  if (params.physicsEstimate) {
    alerts.push({
      id: "physics_estimated",
      severity: "info",
      title: "Physics Values Estimated from Delta-V",
      detail: params.physicsEstimate.basis + `. Estimated impact speed: ${params.physicsEstimate.estimatedVelocityKmh} km/h (range: ${params.physicsEstimate.velocityRangeKmh.min}–${params.physicsEstimate.velocityRangeKmh.max} km/h).`,
      engine: "Physics Engine",
      priority: 2,
    });
  }

  // Alert: Severe damage with no structural inspection
  if ((params.accidentSeverity === "severe" || params.accidentSeverity === "catastrophic") && params.componentCount >= 4) {
    alerts.push({
      id: "structural_inspection",
      severity: "warning",
      title: "Structural Inspection Required",
      detail: `${params.accidentSeverity.charAt(0).toUpperCase() + params.accidentSeverity.slice(1)} damage with ${params.componentCount} components detected. Frame and unibody inspection is mandatory before repair authorisation.`,
      engine: "Damage Classification Engine",
      priority: 7,
    });
  }

  // Sort by priority descending and return top 3
  return alerts
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map(({ priority: _p, ...alert }) => alert);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. COST VERDICT ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes cost deviation % and applies OVERPRICED/FAIR/UNDERPRICED verdict.
 * Formula: deviation = ((Quoted - AI) / AI) * 100
 * OVERPRICED if deviation > +15%, UNDERPRICED if < -15%, else FAIR.
 */
export function enforceCostVerdict(params: {
  aiEstimatedCost: number;
  quotedAmounts: number[];
  fairMin: number;
  fairMax: number;
}): CostVerdict {
  const { aiEstimatedCost, quotedAmounts, fairMin, fairMax } = params;

  if (quotedAmounts.length === 0 || aiEstimatedCost <= 0) {
    return {
      aiEstimatedCost,
      quotedCost: 0,
      fairMin,
      fairMax,
      deviationPercent: null,
      verdict: "NO_QUOTE",
      ruleApplied: "No quotes submitted — verdict deferred",
      explanation: `AI estimated cost is $${aiEstimatedCost.toLocaleString()}. Fair range: $${fairMin.toLocaleString()}–$${fairMax.toLocaleString()}. No panel beater quotes have been submitted yet.`,
    };
  }

  const quotedCost = Math.max(...quotedAmounts);
  const deviationPercent = Math.round(((quotedCost - aiEstimatedCost) / aiEstimatedCost) * 1000) / 10;

  let verdict: CostVerdict["verdict"];
  let ruleApplied: string;
  let explanation: string;

  if (deviationPercent > 15) {
    verdict = "OVERPRICED";
    ruleApplied = `Deviation ${deviationPercent}% > +15% threshold → OVERPRICED`;
    explanation = `Highest quote of $${quotedCost.toLocaleString()} is ${deviationPercent}% above the AI estimate of $${aiEstimatedCost.toLocaleString()}. This exceeds the +15% overpricing threshold. Negotiate or seek an alternative quote.`;
  } else if (deviationPercent < -15) {
    verdict = "UNDERPRICED";
    ruleApplied = `Deviation ${deviationPercent}% < -15% threshold → UNDERPRICED`;
    explanation = `Highest quote of $${quotedCost.toLocaleString()} is ${Math.abs(deviationPercent)}% below the AI estimate of $${aiEstimatedCost.toLocaleString()}. This may indicate incomplete scope of work or missing components.`;
  } else {
    verdict = "FAIR";
    ruleApplied = `Deviation ${deviationPercent}% within ±15% threshold → FAIR`;
    explanation = `Highest quote of $${quotedCost.toLocaleString()} is within the acceptable ±15% range of the AI estimate ($${aiEstimatedCost.toLocaleString()}). Cost is reasonable.`;
  }

  return { aiEstimatedCost, quotedCost, fairMin, fairMax, deviationPercent, verdict, ruleApplied, explanation };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CONFIDENCE SCORE ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a confidence score by starting at 100 and subtracting penalties.
 * Penalties:
 *   - Missing physics data (speed=0, force=0): -10
 *   - Low damage consistency (<50%): -15
 *   - High cost deviation (>30%): -10
 *   - Weak extraction confidence (<70%): -10
 */
export function enforceConfidenceScore(params: {
  hasRealPhysics: boolean;
  consistencyScore: number;
  costDeviationPercent: number | null;
  extractionConfidence: number;
  hasDirectionMismatch: boolean;
}): ConfidenceBreakdown {
  const { hasRealPhysics, consistencyScore, costDeviationPercent, extractionConfidence, hasDirectionMismatch } = params;

  const base = 100;
  const penalties: ConfidenceBreakdown["penalties"] = [];

  if (!hasRealPhysics) {
    penalties.push({ factor: "Missing physics data", deduction: 10, reason: "Velocity and force values not directly measured — estimated from delta-V" });
  }
  if (consistencyScore < 50) {
    penalties.push({ factor: "Low damage consistency", deduction: 15, reason: `Damage consistency score of ${consistencyScore}% is below the 50% threshold` });
  } else if (consistencyScore < 75) {
    penalties.push({ factor: "Moderate damage consistency", deduction: 5, reason: `Damage consistency score of ${consistencyScore}% is below the 75% optimal threshold` });
  }
  if (costDeviationPercent !== null && Math.abs(costDeviationPercent) > 30) {
    penalties.push({ factor: "High cost deviation", deduction: 10, reason: `Cost deviation of ${costDeviationPercent}% exceeds the ±30% confidence threshold` });
  }
  if (extractionConfidence < 70) {
    penalties.push({ factor: "Weak document extraction", deduction: 10, reason: `Document extraction confidence of ${extractionConfidence}% is below the 70% threshold` });
  }
  if (hasDirectionMismatch) {
    penalties.push({ factor: "Direction-damage mismatch", deduction: 5, reason: "Impact direction does not match detected damage zones" });
  }

  const totalDeduction = penalties.reduce((sum, p) => sum + p.deduction, 0);
  const score = Math.max(0, base - totalDeduction);

  const summary = penalties.length === 0
    ? `Full confidence (${score}/100) — all data sources are consistent and complete.`
    : `Confidence reduced to ${score}/100 due to: ${penalties.map(p => p.factor.toLowerCase()).join(", ")}.`;

  return { score, base, penalties, summary };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. FRAUD SCORE BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a weighted fraud score breakdown from available signals.
 * Base score comes from the AI pipeline; enforcement rules add adjustments.
 */
export function buildFraudScoreBreakdown(params: {
  baseScore: number;
  fraudScoreBreakdownJson: Array<{ indicator: string; score: number }> | null;
  consistencyAdjustment: number;
  directionMismatchAdjustment: number;
  costDeviationPercent: number | null;
}): FraudScoreBreakdown {
  const { baseScore, fraudScoreBreakdownJson, consistencyAdjustment, directionMismatchAdjustment, costDeviationPercent } = params;

  // Build components from AI pipeline breakdown
  const components: FraudScoreBreakdown["components"] = [];
  if (fraudScoreBreakdownJson && fraudScoreBreakdownJson.length > 0) {
    for (const item of fraudScoreBreakdownJson) {
      components.push({
        factor: item.indicator,
        contribution: item.score,
        weight: item.score >= 20 ? "HIGH" : item.score >= 10 ? "MEDIUM" : "LOW",
      });
    }
  } else {
    // No breakdown available — show base score as single component
    components.push({ factor: "AI Pipeline Assessment", contribution: baseScore, weight: "BASE" });
  }

  // Build enforcement adjustments
  const adjustments: FraudScoreBreakdown["adjustments"] = [];
  if (consistencyAdjustment > 0) {
    adjustments.push({ source: "Damage Consistency Enforcement", delta: consistencyAdjustment, reason: `Damage consistency below 50% threshold — +${consistencyAdjustment} points` });
  }
  if (directionMismatchAdjustment > 0) {
    adjustments.push({ source: "Direction-Damage Mismatch", delta: directionMismatchAdjustment, reason: `Impact direction does not match damage zones — +${directionMismatchAdjustment} points` });
  }
  if (costDeviationPercent !== null && costDeviationPercent > 30) {
    const costAdj = Math.min(10, Math.round((costDeviationPercent - 30) / 5));
    adjustments.push({ source: "Cost Overpricing Signal", delta: costAdj, reason: `Quote ${costDeviationPercent}% above AI estimate — +${costAdj} points` });
  }

  const totalAdjustment = adjustments.reduce((sum, a) => sum + a.delta, 0);
  const totalScore = Math.min(100, baseScore + totalAdjustment);
  const { level, label } = enforceFraudLevel(totalScore);

  return { totalScore, baseScore, components, adjustments, level, label };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. FINAL DECISION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies the mandatory FINALISE / REVIEW REQUIRED / ESCALATE INVESTIGATION
 * decision logic with a full rule trace.
 *
 * ESCALATE if: fraud score > 60 OR severe inconsistency
 * REVIEW if: fraud score 40-60 OR missing critical data
 * FINALISE if: fraud score < 40 AND cost FAIR AND no major inconsistencies
 */
export function computeFinalDecision(params: {
  fraudScore: number;
  costVerdict: CostVerdict;
  consistencyFlag: ImpactConsistencyFlag;
  directionFlag: DirectionDamageFlag;
  confidenceScore: number;
  hasPhysicsData: boolean;
}): FinalDecisionResult {
  const { fraudScore, costVerdict, consistencyFlag, directionFlag, confidenceScore, hasPhysicsData } = params;

  const ruleTrace: FinalDecisionResult["ruleTrace"] = [
    {
      rule: "Fraud Score Threshold (ESCALATE)",
      value: fraudScore,
      threshold: "> 60",
      triggered: fraudScore > 60,
    },
    {
      rule: "Severe Inconsistency (ESCALATE)",
      value: consistencyFlag.anomalyLevel,
      threshold: "anomalyLevel = high",
      triggered: consistencyFlag.anomalyLevel === "high",
    },
    {
      rule: "Fraud Score Threshold (REVIEW)",
      value: fraudScore,
      threshold: "40–60",
      triggered: fraudScore >= 40 && fraudScore <= 60,
    },
    {
      rule: "Missing Critical Data (REVIEW)",
      value: hasPhysicsData ? "present" : "missing",
      threshold: "physics data present",
      triggered: !hasPhysicsData,
    },
    {
      rule: "Cost Verdict (REVIEW)",
      value: costVerdict.verdict,
      threshold: "FAIR",
      triggered: costVerdict.verdict === "OVERPRICED" || costVerdict.verdict === "UNDERPRICED",
    },
    {
      rule: "Direction-Damage Mismatch (REVIEW)",
      value: directionFlag.mismatch ? "mismatch" : "consistent",
      threshold: "consistent",
      triggered: directionFlag.mismatch,
    },
    {
      rule: "Confidence Score (REVIEW)",
      value: confidenceScore,
      threshold: ">= 70",
      triggered: confidenceScore < 70,
    },
  ];

  // ESCALATE conditions
  if (fraudScore > 60 || consistencyFlag.anomalyLevel === "high") {
    const reasons = [];
    if (fraudScore > 60) reasons.push(`fraud score of ${fraudScore}/100 exceeds the 60-point escalation threshold`);
    if (consistencyFlag.anomalyLevel === "high") reasons.push(`damage consistency of ${consistencyFlag.score}% indicates a severe anomaly`);

    return {
      decision: "ESCALATE_INVESTIGATION",
      label: "Escalate Investigation",
      color: "red",
      ruleTrace,
      primaryReason: `Escalation triggered: ${reasons.join(" and ")}.`,
      recommendedActions: [
        "Refer to senior assessor or special investigations unit",
        "Request independent physical inspection of the vehicle",
        "Verify incident report with third-party witnesses or police records",
        "Cross-check claimant history for prior claims",
      ],
    };
  }

  // REVIEW conditions
  const reviewTriggers = ruleTrace.filter(r => r.triggered && r.rule.includes("REVIEW"));
  if (reviewTriggers.length > 0) {
    const triggerNames = reviewTriggers.map(r => r.rule.replace(" (REVIEW)", "")).join("; ");
    return {
      decision: "REVIEW_REQUIRED",
      label: "Review Required",
      color: "amber",
      ruleTrace,
      primaryReason: `Manual review required: ${triggerNames}.`,
      recommendedActions: [
        "Assign to internal assessor for manual verification",
        reviewTriggers.some(r => r.rule.includes("Cost")) ? "Request revised quote from panel beater" : "Verify all supporting documentation",
        reviewTriggers.some(r => r.rule.includes("Missing")) ? "Request additional accident reconstruction data" : "Confirm incident details with claimant",
        "Document review findings before proceeding",
      ],
    };
  }

  // FINALISE conditions
  return {
    decision: "FINALISE_CLAIM",
    label: "Finalise Claim",
    color: "green",
    ruleTrace,
    primaryReason: `All decision rules passed: fraud score ${fraudScore}/100 (< 40), cost verdict ${costVerdict.verdict}, no major inconsistencies detected.`,
    recommendedActions: [
      "Approve claim for processing",
      "Assign repair to selected panel beater",
      "Issue repair authorisation",
      "Schedule follow-up inspection on completion",
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENFORCEMENT FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export interface EnforcementInput {
  fraudScore: number;
  fraudRiskLevel: string;
  estimatedSpeedKmh: number;
  deltaVKmh: number;
  impactForceKn: number;
  energyKj: number;
  vehicleMassKg: number;
  accidentSeverity: string;
  consistencyScore: number;
  impactDirection: string;
  damageZones: string[];
  damageComponents: string[];
  aiEstimatedCost: number;
  quotedAmounts: number[];
  vehicleMake: string;
  hasPreviousClaims: boolean;
  /** Raw fraud score breakdown from AI pipeline (array of {indicator, score}) */
  fraudScoreBreakdownJson?: Array<{ indicator: string; score: number }> | null;
  /** Document extraction confidence from AI pipeline (0-100) */
  extractionConfidence?: number;
  /** Incident type — used to apply correct direction-damage zone mapping */
  incidentType?: string;
}

export function applyIntelligenceEnforcement(input: EnforcementInput): IntelligenceEnforcementResult {
  // 1. Fraud level enforcement
  const { level: fraudLevelEnforced, label: fraudLevelLabel } = enforceFraudLevel(input.fraudScore);

  // 2. Physics enforcement
  const physicsEstimate = enforcePhysics({
    estimatedSpeedKmh: input.estimatedSpeedKmh,
    deltaVKmh: input.deltaVKmh,
    impactForceKn: input.impactForceKn,
    energyKj: input.energyKj,
    vehicleMassKg: input.vehicleMassKg,
    accidentSeverity: input.accidentSeverity,
    damageComponents: input.damageComponents.length,
  });

  // Physics insight (use real values if available, else estimated)
  const speedForInsight = input.estimatedSpeedKmh > 0 ? input.estimatedSpeedKmh : physicsEstimate?.estimatedVelocityKmh ?? 0;
  const physicsInsight = buildPhysicsInsight(
    speedForInsight,
    input.deltaVKmh,
    input.accidentSeverity,
    input.damageComponents.length
  );

  // 3. Impact consistency enforcement
  const consistencyFlag = enforceImpactConsistency({
    consistencyScore: input.consistencyScore,
    fraudScore: input.fraudScore,
    impactDirection: input.impactDirection,
    accidentSeverity: input.accidentSeverity,
  });

  // 4. Direction vs damage validation
  const directionFlag = enforceDirectionDamageConsistency({
    impactDirection: input.impactDirection,
    damageZones: input.damageZones,
    damageComponents: input.damageComponents,
    incidentType: input.incidentType,
  });

  // 5. Cost benchmark enforcement
  const costBenchmark = enforceCostBenchmark({
    aiEstimatedCost: input.aiEstimatedCost,
    quotedAmounts: input.quotedAmounts,
    accidentSeverity: input.accidentSeverity,
    componentCount: input.damageComponents.length,
    vehicleMake: input.vehicleMake,
  });

  // 6. Fraud score adjustment from consistency anomaly and direction mismatch
  const fraudScoreAdjustment = consistencyFlag.fraudWeightIncrease
    + (directionFlag.mismatch ? 5 : 0);
  const adjustedFraudScore = Math.min(100, input.fraudScore + fraudScoreAdjustment);

  // 7. Cost verdict with deviation calculation
  const costVerdict = enforceCostVerdict({
    aiEstimatedCost: input.aiEstimatedCost,
    quotedAmounts: input.quotedAmounts,
    fairMin: costBenchmark.estimatedFairMin,
    fairMax: costBenchmark.estimatedFairMax,
  });

  // 8. Weighted fraud score breakdown
  const fraudScoreBreakdown = buildFraudScoreBreakdown({
    baseScore: input.fraudScore,
    fraudScoreBreakdownJson: input.fraudScoreBreakdownJson ?? null,
    consistencyAdjustment: consistencyFlag.fraudWeightIncrease,
    directionMismatchAdjustment: directionFlag.mismatch ? 5 : 0,
    costDeviationPercent: costVerdict.deviationPercent,
  });

  // 9. Confidence score breakdown
  const hasRealPhysics = input.estimatedSpeedKmh > 0 && input.impactForceKn > 0;
  const confidenceBreakdown = enforceConfidenceScore({
    hasRealPhysics,
    consistencyScore: input.consistencyScore,
    costDeviationPercent: costVerdict.deviationPercent,
    extractionConfidence: input.extractionConfidence ?? 75,
    hasDirectionMismatch: directionFlag.mismatch,
  });

  // 10. Final decision with rule trace
  const finalDecision = computeFinalDecision({
    fraudScore: adjustedFraudScore,
    costVerdict,
    consistencyFlag,
    directionFlag,
    confidenceScore: confidenceBreakdown.score,
    hasPhysicsData: hasRealPhysics || physicsEstimate !== null,
  });

  // 11. Critical alerts (using adjusted fraud score)
  const alerts = generateCriticalAlerts({
    consistencyFlag,
    directionFlag,
    fraudScore: adjustedFraudScore,
    fraudLevel: fraudScoreBreakdown.level,
    aiEstimatedCost: input.aiEstimatedCost,
    quotedAmounts: input.quotedAmounts,
    physicsEstimate,
    accidentSeverity: input.accidentSeverity,
    componentCount: input.damageComponents.length,
    vehicleMake: input.vehicleMake,
    hasPreviousClaims: input.hasPreviousClaims,
  });

  return {
    fraudLevelEnforced: fraudScoreBreakdown.level,
    fraudLevelLabel: fraudScoreBreakdown.label,
    physicsEstimate,
    physicsInsight,
    consistencyFlag,
    directionFlag,
    costBenchmark,
    costVerdict,
    fraudScoreBreakdown,
    confidenceBreakdown,
    finalDecision,
    alerts,
    fraudScoreAdjustment,
  };
}
