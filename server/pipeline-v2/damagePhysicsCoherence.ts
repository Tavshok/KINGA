/**
 * Stage 35 — Damage-Physics Coherence Validator
 *
 * Maps damage zones to expected impact directions, detects mismatches,
 * reduces confidence, flags high-severity mismatches, generates neutral
 * explanations, and produces inputs for the consistency and fraud engines.
 *
 * Rules:
 * 1. Map damage_zone ↔ impact_direction using CollisionDirection values
 * 2. Validate: front damage ↔ frontal, rear damage ↔ rear, side damage ↔ side_driver/side_passenger
 * 3. On mismatch: reduce confidence_score, flag high_severity_mismatch, trigger fraud penalty input
 * 4. Generate neutral explanation (no accusatory language)
 * 5. Feed result into consistency engine and fraud engine
 *
 * CollisionDirection values (from types.ts):
 *   "frontal" | "rear" | "side_driver" | "side_passenger" | "rollover" | "multi_impact" | "unknown"
 */

import type { Stage6Output, Stage7Output, CollisionDirection } from "./types";

// ─── Zone → Expected Direction Mapping ───────────────────────────────────────

export interface ZoneDirectionEntry {
  zone: string;
  expectedDirections: CollisionDirection[];
  mismatchSeverity: "high" | "medium" | "low";
}

/**
 * Maps each damage zone to the set of CollisionDirection values that are
 * physically consistent with damage in that zone.
 *
 * Exported for testing.
 */
export const ZONE_DIRECTION_MAP: ZoneDirectionEntry[] = [
  // ── Front zones ──────────────────────────────────────────────────────────
  {
    zone: "front",
    expectedDirections: ["frontal", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "front_left",
    expectedDirections: ["frontal", "side_driver", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "front_right",
    expectedDirections: ["frontal", "side_passenger", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "hood",
    expectedDirections: ["frontal", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "bumper_front",
    expectedDirections: ["frontal", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "grille",
    expectedDirections: ["frontal", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "headlight_left",
    expectedDirections: ["frontal", "side_driver", "multi_impact"],
    mismatchSeverity: "medium",
  },
  {
    zone: "headlight_right",
    expectedDirections: ["frontal", "side_passenger", "multi_impact"],
    mismatchSeverity: "medium",
  },
  {
    zone: "windshield",
    expectedDirections: ["frontal", "rollover", "multi_impact"],
    mismatchSeverity: "medium",
  },

  // ── Rear zones ───────────────────────────────────────────────────────────
  {
    zone: "rear",
    expectedDirections: ["rear", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "rear_left",
    expectedDirections: ["rear", "side_driver", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "rear_right",
    expectedDirections: ["rear", "side_passenger", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "trunk",
    expectedDirections: ["rear", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "bumper_rear",
    expectedDirections: ["rear", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "taillight_left",
    expectedDirections: ["rear", "side_driver", "multi_impact"],
    mismatchSeverity: "medium",
  },
  {
    zone: "taillight_right",
    expectedDirections: ["rear", "side_passenger", "multi_impact"],
    mismatchSeverity: "medium",
  },

  // ── Side zones ───────────────────────────────────────────────────────────
  {
    zone: "driver_side",
    expectedDirections: ["side_driver", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "passenger_side",
    expectedDirections: ["side_passenger", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "left",
    expectedDirections: ["side_driver", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "right",
    expectedDirections: ["side_passenger", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "driver_door",
    expectedDirections: ["side_driver", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "passenger_door",
    expectedDirections: ["side_passenger", "multi_impact"],
    mismatchSeverity: "high",
  },
  {
    zone: "left_quarter",
    expectedDirections: ["side_driver", "rear", "multi_impact"],
    mismatchSeverity: "medium",
  },
  {
    zone: "right_quarter",
    expectedDirections: ["side_passenger", "rear", "multi_impact"],
    mismatchSeverity: "medium",
  },

  // ── Roof / undercarriage ─────────────────────────────────────────────────
  {
    zone: "roof",
    expectedDirections: ["rollover", "frontal", "rear", "side_driver", "side_passenger", "multi_impact"],
    mismatchSeverity: "low",
  },
  {
    zone: "undercarriage",
    expectedDirections: ["rollover", "frontal", "rear", "multi_impact"],
    mismatchSeverity: "low",
  },
];

// ─── Exported Constants (for tests) ──────────────────────────────────────────

/**
 * Per-mismatch confidence reduction applied when computing the factor.
 * 1 high-severity mismatch  → ×0.80 (−20%)
 * 2+ high-severity mismatches → ×0.65 (−35%)
 * Only medium mismatches     → ×0.90 (−10%)
 * Exported for test assertions.
 */
export const CONFIDENCE_REDUCTION_PER_MISMATCH = 0.20;

/** Severity string that qualifies as "high severity" */
export const HIGH_SEVERITY_THRESHOLD = "high" as const;

/**
 * Minimum number of high-severity mismatches required to trigger a fraud
 * penalty input to the fraud engine.
 */
export const FRAUD_PENALTY_TRIGGER_COUNT = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoherenceMismatch {
  /** The damage zone that was detected */
  zone: string;
  /** The impact direction reported by physics */
  actual_direction: string;
  /** Directions that would be consistent with this zone */
  expected_directions: string[];
  /** Neutral human-readable explanation */
  explanation: string;
  /** Severity of this individual mismatch */
  severity: "high" | "medium" | "low";
  /** Whether this mismatch should trigger a fraud penalty input */
  fraud_penalty_trigger: boolean;
}

export interface DamagePhysicsCoherenceResult {
  /** Whether any zone-direction mismatches were detected */
  has_mismatch: boolean;
  /** Number of high-severity mismatches */
  high_severity_mismatch_count: number;
  /** All detected mismatches */
  mismatches: CoherenceMismatch[];
  /** Confidence reduction to apply (0–1 multiplier, 1 = no reduction) */
  confidence_reduction_factor: number;
  /** Whether the fraud engine should receive a penalty input */
  fraud_penalty_triggered: boolean;
  /** Number of zones that are coherent with physics */
  coherent_zone_count: number;
  /** Number of zones checked */
  zones_checked: number;
  /** Dominant physics direction used for comparison */
  direction_checked: string;
  /** Human-readable summary */
  summary: string;
}

// ─── Confidence Reduction Computation ────────────────────────────────────────

function computeConfidenceReductionFactor(mismatches: CoherenceMismatch[]): number {
  const highCount = mismatches.filter((m) => m.severity === "high").length;
  const mediumCount = mismatches.filter((m) => m.severity === "medium").length;

  // Floor at 0.30 to prevent total confidence collapse
  if (highCount >= 2) return Math.max(0.30, 0.65);
  if (highCount === 1) return Math.max(0.30, 0.80);
  if (mediumCount >= 1) return Math.max(0.30, 0.90);
  return 1.00;
}

// ─── Direction Label ──────────────────────────────────────────────────────────

const DIRECTION_LABEL: Record<string, string> = {
  frontal: "frontal impact",
  rear: "rear impact",
  side_driver: "driver-side impact",
  side_passenger: "passenger-side impact",
  rollover: "rollover",
  multi_impact: "multiple-point impact",
  unknown: "undetermined impact direction",
};

function labelDirection(dir: string): string {
  return DIRECTION_LABEL[dir.toLowerCase()] ?? `${dir.replace(/_/g, " ")} impact`;
}

function labelZone(zone: string): string {
  return zone.replace(/_/g, " ").replace(/-/g, " ");
}

// ─── Explanation Generator ────────────────────────────────────────────────────

/**
 * Generates a neutral, non-accusatory explanation for a zone-direction mismatch.
 * Follows Stage 22 external narrative rules: no suspicion language, no scoring
 * references, no internal logic exposed.
 */
function generateExplanation(
  zone: string,
  actualDirection: string,
  expectedDirections: string[],
  severity: "high" | "medium" | "low"
): string {
  const zoneLabel = labelZone(zone);
  const actualLabel = labelDirection(actualDirection);
  const expectedLabel = expectedDirections.slice(0, 2).map(labelDirection).join(" or ");

  if (severity === "high") {
    return (
      `${actualLabel.charAt(0).toUpperCase() + actualLabel.slice(1)} indicated by technical analysis; ` +
      `however, ${zoneLabel} damage was also detected. ` +
      `Further review and additional documentation may be required.`
    );
  }

  if (severity === "medium") {
    return (
      `${zoneLabel.charAt(0).toUpperCase() + zoneLabel.slice(1)} damage noted; ` +
      `technical analysis indicates ${actualLabel}. ` +
      `${expectedLabel.charAt(0).toUpperCase() + expectedLabel.slice(1)} would typically be associated with this zone — ` +
      `additional verification needed.`
    );
  }

  return (
    `${zoneLabel.charAt(0).toUpperCase() + zoneLabel.slice(1)} damage and ${actualLabel} detected — ` +
    `relationship requires further assessment.`
  );
}

// ─── Zone Normaliser ──────────────────────────────────────────────────────────

/**
 * Normalises a raw zone string to lowercase with underscores, matching the
 * ZONE_DIRECTION_MAP keys.
 */
function normaliseZone(raw: string): string {
  return raw.toLowerCase().replace(/[-\s]+/g, "_").trim();
}

/**
 * Normalises a raw direction string to lowercase, matching CollisionDirection values.
 */
function normaliseDirection(raw: string): string {
  return raw.toLowerCase().replace(/[-\s]+/g, "_").trim();
}

// ─── Main Validator ───────────────────────────────────────────────────────────

/**
 * Validates that detected damage zones are physically consistent with the
 * impact direction reported by the physics engine.
 *
 * @param damageAnalysis  Stage 6 output (damage zones)
 * @param physicsAnalysis Stage 7 output (impact vector)
 * @returns               Coherence result with mismatches, confidence reduction, and fraud flag
 */
export function validateDamagePhysicsCoherence(
  damageAnalysis: Stage6Output | null | undefined,
  physicsAnalysis: Stage7Output | null | undefined
): DamagePhysicsCoherenceResult {
  const emptyResult = (direction: string = "unknown", zonesChecked = 0): DamagePhysicsCoherenceResult => ({
    has_mismatch: false,
    high_severity_mismatch_count: 0,
    mismatches: [],
    confidence_reduction_factor: 1.0,
    fraud_penalty_triggered: false,
    coherent_zone_count: 0,
    zones_checked: zonesChecked,
    direction_checked: direction,
    summary: "Coherence check not performed — insufficient data.",
  });

  // Cannot validate without both inputs
  if (!damageAnalysis || !physicsAnalysis) return emptyResult();

  // Extract physics direction from impactVector.direction
  const rawDirection: string | undefined =
    physicsAnalysis.impactVector?.direction ?? undefined;

  if (!rawDirection) return emptyResult();

  const normDirection = normaliseDirection(rawDirection);

  // Extract damage zones from Stage 6 damageZones array
  const rawZones: string[] = [];
  const damageZones = (damageAnalysis as any).damageZones;
  if (Array.isArray(damageZones)) {
    for (const z of damageZones) {
      if (z?.zone) rawZones.push(z.zone);
    }
  }

  // Also check damagedParts.location as a secondary source
  const damagedParts = (damageAnalysis as any).damagedParts;
  if (Array.isArray(damagedParts)) {
    for (const p of damagedParts) {
      if (p?.location) rawZones.push(p.location);
    }
  }

  // Deduplicate and normalise
  const uniqueZones = Array.from(new Set(rawZones.map(normaliseZone)));

  if (uniqueZones.length === 0) return emptyResult(normDirection, 0);

  const mismatches: CoherenceMismatch[] = [];
  let coherentCount = 0;

  for (const zone of uniqueZones) {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === zone);

    // Unknown zone — cannot validate, treat as coherent to avoid false positives
    if (!entry) {
      coherentCount++;
      continue;
    }

    const expectedNorm = entry.expectedDirections.map((d) => normaliseDirection(d));
    const isCoherent = expectedNorm.some(
      (expected) =>
        normDirection === expected ||
        normDirection.includes(expected) ||
        expected.includes(normDirection)
    );

    if (isCoherent) {
      coherentCount++;
      continue;
    }

    // Mismatch detected
    const severity = entry.mismatchSeverity;
    const explanation = generateExplanation(zone, normDirection, entry.expectedDirections, severity);

    mismatches.push({
      zone,
      actual_direction: normDirection,
      expected_directions: entry.expectedDirections,
      explanation,
      severity,
      fraud_penalty_trigger: severity === "high",
    });
  }

  const highSeverityCount = mismatches.filter((m) => m.severity === "high").length;
  const fraudPenaltyTriggered = highSeverityCount >= FRAUD_PENALTY_TRIGGER_COUNT;
  const confidenceReductionFactor = computeConfidenceReductionFactor(mismatches);

  const summary =
    mismatches.length === 0
      ? `All ${uniqueZones.length} damage zone(s) are consistent with ${labelDirection(normDirection)}.`
      : `${mismatches.length} zone-direction inconsistency(ies) detected across ${uniqueZones.length} zone(s). ` +
        `High-severity: ${highSeverityCount}. Further review required.`;

  return {
    has_mismatch: mismatches.length > 0,
    high_severity_mismatch_count: highSeverityCount,
    mismatches,
    confidence_reduction_factor: confidenceReductionFactor,
    fraud_penalty_triggered: fraudPenaltyTriggered,
    coherent_zone_count: coherentCount,
    zones_checked: uniqueZones.length,
    direction_checked: normDirection,
    summary,
  };
}

// ─── Consistency Engine Input Builder ────────────────────────────────────────

/**
 * Converts the coherence result into the format expected by the consistency
 * engine (runDamageConsistencyCheck / computeConsistencyConfidence).
 */
export interface CoherenceConsistencyInput {
  /** Whether any mismatches were detected */
  hasMismatch: boolean;
  /** Number of high-severity mismatches for the conflict penalty rule */
  highSeverityMismatchCount: number;
  /** Whether physics data is available (affects coherence enforcement) */
  physicsAvailable: boolean;
  /** Confidence reduction factor to apply on top of the base score */
  confidenceReductionFactor: number;
  /** Human-readable mismatch explanations for the consistency report */
  mismatchExplanations: string[];
}

export function buildCoherenceConsistencyInput(
  result: DamagePhysicsCoherenceResult
): CoherenceConsistencyInput {
  return {
    hasMismatch: result.has_mismatch,
    highSeverityMismatchCount: result.high_severity_mismatch_count,
    physicsAvailable: result.direction_checked !== "unknown" && result.zones_checked > 0,
    confidenceReductionFactor: result.confidence_reduction_factor,
    mismatchExplanations: result.mismatches.map((m) => m.explanation),
  };
}

// ─── Fraud Engine Input Builder ───────────────────────────────────────────────

/**
 * Converts the coherence result into the format expected by the fraud engine's
 * multiSourceConflict / consistencyCheckJson input.
 */
export interface CoherenceFraudInput {
  /** Source identifier for the fraud engine */
  source: string;
  /** Whether the consistency check is complete (required by fraud penalty gate) */
  status: "complete" | "incomplete";
  /** Whether the fraud penalty should be triggered */
  penalty_triggered: boolean;
  /** High-severity mismatches formatted as fraud engine conflict entries */
  high_severity_conflicts: Array<{
    mismatch_type: string;
    description: string;
    severity: "high";
  }>;
  /** Total number of high-severity mismatches */
  high_severity_count: number;
}

export function buildCoherenceFraudInput(
  result: DamagePhysicsCoherenceResult
): CoherenceFraudInput {
  const highMismatches = result.mismatches.filter((m) => m.severity === "high");

  return {
    source: "damage_physics_coherence_validator",
    status: result.zones_checked > 0 ? "complete" : "incomplete",
    penalty_triggered: result.fraud_penalty_triggered,
    high_severity_conflicts: highMismatches.map((m) => ({
      mismatch_type: `zone_direction_mismatch:${m.zone}`,
      description: m.explanation,
      severity: "high" as const,
    })),
    high_severity_count: result.high_severity_mismatch_count,
  };
}
