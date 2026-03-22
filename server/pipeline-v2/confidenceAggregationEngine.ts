/**
 * confidenceAggregationEngine.ts
 *
 * Confidence Aggregation Engine — Stage 7d
 *
 * Computes the overall pipeline confidence using the weakest-link rule:
 * the final confidence is the MINIMUM of all component scores, not an average.
 * This ensures that a single unreliable component cannot be masked by strong
 * performance in other areas.
 *
 * Output contract:
 * {
 *   "overall_confidence": 0-100,
 *   "weakest_component": "<component name>",
 *   "confidence_level": "LOW | MEDIUM | HIGH"
 * }
 *
 * Thresholds:
 *   HIGH   → overall_confidence >= 75
 *   MEDIUM → overall_confidence >= 45
 *   LOW    → overall_confidence < 45
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ConfidenceAggregationInput {
  /** Physics engine confidence 0-100. Null if physics was not executed. */
  physics_confidence: number | null;
  /** Damage analysis confidence 0-100. Null if damage analysis was skipped. */
  damage_confidence: number | null;
  /** Fraud analysis confidence 0-100 (inverse of fraud risk, or explicit score). */
  fraud_confidence: number | null;
  /** Cross-engine consistency score 0-100. Null if consistency check was skipped. */
  consistency_score: number | null;
  /**
   * Optional additional component scores keyed by name.
   * These are included in the weakest-link calculation alongside the four
   * primary components.
   */
  additional_components?: Record<string, number | null>;
}

export interface ConfidenceComponentDetail {
  /** Component name */
  name: string;
  /** Raw score 0-100, or null if unavailable */
  score: number | null;
  /** Whether this component was available (non-null) */
  available: boolean;
  /** Whether this component is the weakest link */
  is_weakest: boolean;
}

export interface ConfidenceAggregationOutput {
  /** The overall pipeline confidence — equal to the minimum available score */
  overall_confidence: number;
  /** The name of the component that produced the lowest score */
  weakest_component: string;
  /** Human-readable confidence band */
  confidence_level: ConfidenceLevel;
  /**
   * Number of components that were available (non-null) for this calculation.
   * A low count indicates the result is based on limited evidence.
   */
  components_available: number;
  /**
   * Total number of components considered (including unavailable ones).
   */
  components_total: number;
  /** Per-component breakdown for transparency */
  component_detail: ConfidenceComponentDetail[];
  /**
   * Human-readable explanation of how the confidence was determined,
   * including which component was the weakest link and why.
   */
  reasoning: string;
  /**
   * Warning flags — populated when the result may be unreliable.
   * Examples: "only 1 component available", "all components unavailable"
   */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_THRESHOLD = 75;
const MEDIUM_THRESHOLD = 45;

/**
 * Default score applied when a component is unavailable (null).
 * Using null-as-unavailable means we skip it from the MIN calculation
 * rather than penalising the overall score for an engine that was
 * legitimately not run (e.g. physics for a theft claim).
 */
const UNAVAILABLE_LABEL = "unavailable";

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute overall pipeline confidence using the weakest-link rule.
 *
 * Key design decisions:
 * 1. NULL inputs are treated as "not available" — they are excluded from the
 *    MIN calculation. This prevents a legitimately skipped engine (e.g. physics
 *    for a theft claim) from artificially dragging down confidence.
 * 2. If ALL components are null, the output is overall_confidence=0 with
 *    confidence_level=LOW and a warning.
 * 3. If only one component is available, the result is valid but a warning
 *    is emitted to indicate limited evidence.
 * 4. Scores are clamped to [0, 100] before comparison to guard against
 *    out-of-range inputs from upstream engines.
 * 5. In the event of a tie (multiple components share the minimum score),
 *    the weakest_component is the first one encountered in priority order:
 *    physics → damage → fraud → consistency → additional.
 */
export function aggregateConfidence(
  input: ConfidenceAggregationInput
): ConfidenceAggregationOutput {
  // ── 1. Build the component list ──────────────────────────────────────────
  const primaryComponents: Array<{ name: string; score: number | null }> = [
    { name: "physics", score: input.physics_confidence },
    { name: "damage", score: input.damage_confidence },
    { name: "fraud", score: input.fraud_confidence },
    { name: "consistency", score: input.consistency_score },
  ];

  const additionalComponents: Array<{ name: string; score: number | null }> = [];
  if (input.additional_components) {
    for (const [name, score] of Object.entries(input.additional_components)) {
      additionalComponents.push({ name, score });
    }
  }

  const allComponents = [...primaryComponents, ...additionalComponents];
  const total = allComponents.length;

  // ── 2. Clamp and mark availability ───────────────────────────────────────
  const details: ConfidenceComponentDetail[] = allComponents.map((c) => ({
    name: c.name,
    score: c.score !== null && c.score !== undefined ? Math.max(0, Math.min(100, Math.round(c.score))) : null,
    available: c.score !== null && c.score !== undefined,
    is_weakest: false,
  }));

  const available = details.filter((d) => d.available);
  const warnings: string[] = [];

  // ── 3. Handle edge cases ─────────────────────────────────────────────────
  if (available.length === 0) {
    warnings.push("No confidence components were available — result is unreliable.");
    return {
      overall_confidence: 0,
      weakest_component: UNAVAILABLE_LABEL,
      confidence_level: "LOW",
      components_available: 0,
      components_total: total,
      component_detail: details,
      reasoning:
        "No confidence scores were provided by any pipeline engine. " +
        "The overall confidence cannot be determined. Manual review is required.",
      warnings,
    };
  }

  if (available.length === 1) {
    warnings.push(
      `Only 1 of ${total} confidence components was available (${available[0].name}). ` +
      "Result is based on limited evidence."
    );
  }

  // ── 4. Find the minimum (weakest link) ───────────────────────────────────
  let minScore = Infinity;
  let weakestName = "";

  for (const d of available) {
    const s = d.score as number;
    if (s < minScore) {
      minScore = s;
      weakestName = d.name;
    }
  }

  // Mark the weakest component
  for (const d of details) {
    d.is_weakest = d.name === weakestName && d.available;
  }

  const overallConfidence = minScore;

  // ── 5. Determine confidence level ────────────────────────────────────────
  let confidenceLevel: ConfidenceLevel;
  if (overallConfidence >= HIGH_THRESHOLD) {
    confidenceLevel = "HIGH";
  } else if (overallConfidence >= MEDIUM_THRESHOLD) {
    confidenceLevel = "MEDIUM";
  } else {
    confidenceLevel = "LOW";
  }

  // ── 6. Build reasoning string ─────────────────────────────────────────────
  const availableScoresSummary = available
    .map((d) => `${d.name}=${d.score}`)
    .join(", ");

  const unavailableNames = details
    .filter((d) => !d.available)
    .map((d) => d.name);

  let reasoning =
    `Weakest-link rule applied across ${available.length} available component(s): ` +
    `${availableScoresSummary}. ` +
    `Minimum score is ${overallConfidence} from "${weakestName}", ` +
    `which defines the overall pipeline confidence. `;

  if (unavailableNames.length > 0) {
    reasoning += `Components excluded (not available): ${unavailableNames.join(", ")}. `;
  }

  if (confidenceLevel === "HIGH") {
    reasoning +=
      `All available components scored ${HIGH_THRESHOLD}+, indicating strong agreement ` +
      "across the pipeline. The claim assessment can be treated with high reliability.";
  } else if (confidenceLevel === "MEDIUM") {
    reasoning +=
      `The weakest component (${weakestName}=${overallConfidence}) falls in the MEDIUM band ` +
      `(${MEDIUM_THRESHOLD}–${HIGH_THRESHOLD - 1}). ` +
      "The assessment is usable but assessor review of the flagged component is recommended.";
  } else {
    reasoning +=
      `The weakest component (${weakestName}=${overallConfidence}) is below ${MEDIUM_THRESHOLD}, ` +
      "indicating LOW confidence. Manual review is strongly recommended before any decision is made.";
  }

  return {
    overall_confidence: overallConfidence,
    weakest_component: weakestName,
    confidence_level: confidenceLevel,
    components_available: available.length,
    components_total: total,
    component_detail: details,
    reasoning,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a ConfidenceAggregationInput from the pipeline stage outputs.
 *
 * Maps:
 * - stage7.damageConsistencyScore → physics_confidence
 *   (the physics engine's internal consistency score, 0-1 → scaled to 0-100)
 * - stage6.overallSeverityScore → damage_confidence
 *   (damage analysis confidence proxy — high severity score = high confidence
 *    in the damage assessment)
 * - stage8.fraudRiskScore → fraud_confidence
 *   (inverted: fraud_confidence = 100 - fraudRiskScore, since a high fraud
 *    score means low confidence in the claim's legitimacy)
 * - stage8.crossEngineConsistency.consistency_score → consistency_score
 * - stage7.severityConsensus.confidence → severity_confidence (additional)
 * - stage7.damagePatternValidation.confidence → damage_pattern_confidence (additional)
 * - stage8.scenarioFraudResult.confidence → scenario_fraud_confidence (additional)
 */
export function buildConfidenceAggregationInput(
  stage6: Record<string, any> | null,
  stage7: Record<string, any> | null,
  stage8: Record<string, any> | null
): ConfidenceAggregationInput {
  // Physics confidence: use damageConsistencyScore (0-1 scale) × 100
  let physicsConfidence: number | null = null;
  if (stage7?.physicsExecuted === true && stage7?.damageConsistencyScore != null) {
    physicsConfidence = Math.round(Number(stage7.damageConsistencyScore) * 100);
  } else if (stage7?.physicsExecuted === false && stage7?.damageConsistencyScore != null) {
    // Physics was skipped (non-collision) — use the fallback consistency score
    physicsConfidence = Math.round(Number(stage7.damageConsistencyScore) * 100);
  }

  // Damage confidence: use overallSeverityScore directly (already 0-100)
  let damageConfidence: number | null = null;
  if (stage6?.overallSeverityScore != null) {
    // overallSeverityScore measures damage extent, not analysis confidence.
    // We use the damage analysis's internal confidence field if available,
    // otherwise fall back to a proxy: higher severity = more evidence = higher confidence
    if (stage6?.analysisConfidence != null) {
      damageConfidence = Math.round(Number(stage6.analysisConfidence));
    } else {
      // Proxy: moderate-to-high severity scores indicate more confident damage assessment
      const severityScore = Number(stage6.overallSeverityScore);
      // Confidence proxy: 40 base + up to 50 from severity evidence
      damageConfidence = Math.min(100, Math.round(40 + severityScore * 0.5));
    }
  }

  // Fraud confidence: invert fraud risk score (high fraud risk = low confidence)
  let fraudConfidence: number | null = null;
  if (stage8?.fraudRiskScore != null) {
    fraudConfidence = Math.max(0, Math.min(100, Math.round(100 - Number(stage8.fraudRiskScore))));
  }

  // Consistency score: from cross-engine consistency validator
  let consistencyScore: number | null = null;
  if (stage8?.crossEngineConsistency?.consistency_score != null) {
    consistencyScore = Math.round(Number(stage8.crossEngineConsistency.consistency_score));
  }

  // Additional components
  const additional: Record<string, number | null> = {};

  // Severity consensus confidence
  if (stage7?.severityConsensus?.confidence != null) {
    additional["severity_consensus"] = Math.round(Number(stage7.severityConsensus.confidence));
  }

  // Damage pattern validation confidence
  if (stage7?.damagePatternValidation?.confidence != null) {
    additional["damage_pattern"] = Math.round(Number(stage7.damagePatternValidation.confidence));
  }

  // Scenario fraud engine confidence
  if (stage8?.scenarioFraudResult?.confidence != null) {
    additional["scenario_fraud"] = Math.round(Number(stage8.scenarioFraudResult.confidence));
  }

  return {
    physics_confidence: physicsConfidence,
    damage_confidence: damageConfidence,
    fraud_confidence: fraudConfidence,
    consistency_score: consistencyScore,
    additional_components: Object.keys(additional).length > 0 ? additional : undefined,
  };
}
