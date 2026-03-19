/**
 * pipeline-v2/causalChainBuilder.ts
 *
 * STAGE 37 — CAUSAL CHAIN BUILDER
 *
 * Traces every final decision step-by-step from raw input through
 * analysis, result, and decision. Produces a structured causal_chain
 * array displayed in the Decision Report.
 *
 * Architecture:
 *   input → analysis → result → decision
 *
 * Example chain:
 *   "Rear impact (physics) → front damage detected
 *    → mismatch identified → fraud score increased → decision escalated"
 *
 * Output contract:
 *   { causal_chain, chain_summary, decision_outcome, confidence_score,
 *     escalation_required, generated_at, step_count,
 *     critical_step_count, warning_step_count }
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  AccidentSeverity,
  CollisionDirection,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Exported constants (used by tests and other modules)
// ─────────────────────────────────────────────────────────────────────────────

/** Fraud levels that trigger immediate escalation */
export const ESCALATION_FRAUD_LEVELS = new Set<string>(["high", "elevated"]);

/** Fraud levels that trigger manual review (below escalation) */
export const MANUAL_REVIEW_FRAUD_LEVELS = new Set<string>(["medium"]);

/** Minimum confidence score required to produce a decision (below → insufficient_data) */
export const MIN_CONFIDENCE_FOR_DECISION = 20;

/** Fraud score at or above this value → critical severity */
export const FRAUD_SCORE_CRITICAL_THRESHOLD = 65;

/** Fraud score at or above this value → warning severity */
export const FRAUD_SCORE_WARNING_THRESHOLD = 40;

/** Damage consistency score below this value → warning */
export const DAMAGE_CONSISTENCY_WARNING_THRESHOLD = 70;

/** Damage consistency score below this value → critical */
export const DAMAGE_CONSISTENCY_CRITICAL_THRESHOLD = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StepCategory = "input" | "analysis" | "result" | "decision";
export type StepSeverity = "info" | "warning" | "critical";

export type DecisionOutcome =
  | "approve"
  | "approve_with_notes"
  | "manual_review"
  | "escalate"
  | "reject_pending"
  | "insufficient_data";

export interface CausalStep {
  /** 1-based sequential step number */
  step: number;
  /** Logical category of this step */
  category: StepCategory;
  /** Machine-readable key for programmatic use */
  key: string;
  /** Human-readable description of what happened */
  description: string;
  /** Severity level of this step */
  severity: StepSeverity;
  /** Which pipeline stage produced this information */
  source_stage: string;
  /** Optional structured value (score, cost, zone name, etc.) */
  value?: string | number | boolean | null;
}

export interface CausalChainOutput {
  causal_chain: CausalStep[];
  chain_summary: string;
  decision_outcome: DecisionOutcome;
  confidence_score: number;
  escalation_required: boolean;
  generated_at: string;
  step_count: number;
  critical_step_count: number;
  warning_step_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone → expected direction mapping (mirrors Stage 35)
// ─────────────────────────────────────────────────────────────────────────────

const ZONE_EXPECTED_DIRECTIONS: Record<string, CollisionDirection[]> = {
  front: ["frontal", "multi_impact"],
  rear: ["rear", "multi_impact"],
  side: ["side_driver", "side_passenger", "multi_impact"],
  side_driver: ["side_driver", "multi_impact"],
  side_passenger: ["side_passenger", "multi_impact"],
  roof: ["rollover", "multi_impact"],
  undercarriage: ["rollover", "multi_impact"],
  multi: ["multi_impact"],
};

function zonesMatchDirection(zone: string, direction: CollisionDirection): boolean {
  const expected = ZONE_EXPECTED_DIRECTIONS[zone.toLowerCase()] ?? [];
  return expected.includes(direction);
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity helpers
// ─────────────────────────────────────────────────────────────────────────────

function accidentSeverityToStep(severity: AccidentSeverity): StepSeverity {
  if (severity === "severe" || severity === "catastrophic") return "critical";
  if (severity === "moderate") return "warning";
  return "info";
}

function fraudScoreToSeverity(score: number): StepSeverity {
  if (score >= FRAUD_SCORE_CRITICAL_THRESHOLD) return "critical";
  if (score >= FRAUD_SCORE_WARNING_THRESHOLD) return "warning";
  return "info";
}

function consistencyScoreToSeverity(score: number): StepSeverity {
  if (score < DAMAGE_CONSISTENCY_CRITICAL_THRESHOLD) return "critical";
  if (score < DAMAGE_CONSISTENCY_WARNING_THRESHOLD) return "warning";
  return "info";
}

// ─────────────────────────────────────────────────────────────────────────────
// Step builder helpers
// ─────────────────────────────────────────────────────────────────────────────

let _stepCounter = 0;

function nextStep(
  category: StepCategory,
  key: string,
  description: string,
  severity: StepSeverity,
  source_stage: string,
  value?: CausalStep["value"]
): CausalStep {
  return {
    step: ++_stepCounter,
    category,
    key,
    description,
    severity,
    source_stage,
    ...(value !== undefined ? { value } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

function buildInputSteps(claimRecord: ClaimRecord | null): CausalStep[] {
  const steps: CausalStep[] = [];

  if (!claimRecord) {
    steps.push(nextStep(
      "input", "claim_data_unavailable",
      "Claim data could not be assembled — all downstream analysis unavailable.",
      "critical", "stage-5"
    ));
    return steps;
  }

  const v = claimRecord.vehicle;
  const vehicleDesc = [v?.year, v?.make, v?.model].filter(Boolean).join(" ") || "Unknown vehicle";
  const incidentType = claimRecord.accidentDetails?.incidentType ?? "unspecified";

  steps.push(nextStep(
    "input", "claim_received",
    `Claim received for ${vehicleDesc} — incident type: ${incidentType}.`,
    "info", "stage-1",
    vehicleDesc
  ));

  const quality = claimRecord.dataQuality;
  const completeness = quality?.completenessScore ?? 50;
  const qualitySeverity: StepSeverity = completeness >= 80 ? "info" : completeness >= 50 ? "warning" : "critical";

  steps.push(nextStep(
    "input", "data_quality",
    `Data completeness: ${completeness}%. ${completeness >= 80 ? "Sufficient for analysis." : completeness >= 50 ? "Partial data — some assumptions applied." : "Low data quality — results may be unreliable."}`,
    qualitySeverity, "stage-4",
    completeness
  ));

  const missingFields = quality?.missingFields ?? [];
  if (missingFields.length > 0) {
    steps.push(nextStep(
      "input", "missing_fields",
      `${missingFields.length} required field(s) missing: ${missingFields.slice(0, 3).join(", ")}${missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : ""}.`,
      missingFields.length >= 5 ? "critical" : "warning", "stage-4",
      missingFields.length
    ));
  }

  return steps;
}

function buildDamageSteps(damageAnalysis: Stage6Output | null): CausalStep[] {
  const steps: CausalStep[] = [];

  if (!damageAnalysis) {
    steps.push(nextStep(
      "analysis", "damage_analysis_unavailable",
      "Damage analysis could not be completed — zone and component data unavailable.",
      "warning", "stage-6"
    ));
    return steps;
  }

  // Primary zone (most components)
  const zones = damageAnalysis.damageZones ?? [];
  const primaryZone = zones.sort((a, b) => b.componentCount - a.componentCount)[0];

  if (primaryZone) {
    const zoneSeverity: StepSeverity =
      primaryZone.maxSeverity === "severe" || primaryZone.maxSeverity === "catastrophic" ? "critical"
      : primaryZone.maxSeverity === "moderate" ? "warning"
      : "info";

    steps.push(nextStep(
      "analysis", "damage_zone_identified",
      `Primary damage zone: ${primaryZone.zone} — ${primaryZone.componentCount} component(s), max severity: ${primaryZone.maxSeverity}.`,
      zoneSeverity, "stage-6",
      primaryZone.zone
    ));
  }

  const componentCount = damageAnalysis.damagedParts?.length ?? 0;
  if (componentCount > 0) {
    steps.push(nextStep(
      "analysis", "damage_components_identified",
      `${componentCount} damaged component(s) identified. Overall severity score: ${damageAnalysis.overallSeverityScore ?? "N/A"}/100.`,
      damageAnalysis.overallSeverityScore >= 70 ? "critical" : damageAnalysis.overallSeverityScore >= 40 ? "warning" : "info",
      "stage-6",
      componentCount
    ));
  }

  if (damageAnalysis.structuralDamageDetected) {
    steps.push(nextStep(
      "result", "structural_damage_flag",
      "Structural damage detected — repair complexity elevated, total-loss risk increased.",
      "critical", "stage-6",
      true
    ));
  }

  return steps;
}

function buildPhysicsSteps(
  physicsAnalysis: Stage7Output | null,
  damageAnalysis: Stage6Output | null
): { steps: CausalStep[]; hasMismatch: boolean } {
  const steps: CausalStep[] = [];
  let hasMismatch = false;

  if (!physicsAnalysis) {
    steps.push(nextStep(
      "analysis", "physics_analysis_unavailable",
      "Physics reconstruction could not be completed — impact direction and severity unavailable.",
      "warning", "stage-7"
    ));
    return { steps, hasMismatch };
  }

  const direction = physicsAnalysis.impactVector?.direction ?? "unknown";
  const severity = physicsAnalysis.accidentSeverity ?? "unknown";
  const impactSeverity = accidentSeverityToStep(severity as AccidentSeverity);

  steps.push(nextStep(
    "analysis", "impact_direction_determined",
    `Physics reconstruction: impact direction = ${direction}, accident severity = ${severity}, ΔV = ${physicsAnalysis.deltaVKmh ?? "N/A"} km/h.`,
    impactSeverity, "stage-7",
    direction
  ));

  // Cross-check direction vs primary damage zone
  if (damageAnalysis) {
    const zones = damageAnalysis.damageZones ?? [];
    const primaryZone = zones.sort((a, b) => b.componentCount - a.componentCount)[0];

    if (primaryZone) {
      const isConsistent = zonesMatchDirection(primaryZone.zone, direction as CollisionDirection);

      if (isConsistent) {
        steps.push(nextStep(
          "result", "physics_damage_consistent",
          `Physics coherence validated: ${direction} impact is consistent with ${primaryZone.zone} damage zone.`,
          "info", "stage-35"
        ));
      } else {
        hasMismatch = true;
        steps.push(nextStep(
          "result", "physics_damage_mismatch",
          `Physics coherence FAILED: ${direction} impact expected but ${primaryZone.zone} damage detected — requires verification.`,
          "critical", "stage-35"
        ));
        steps.push(nextStep(
          "decision", "mismatch_fraud_score_increased",
          `Fraud score increased due to physics-damage mismatch. Claim flagged for investigator review.`,
          "critical", "stage-35"
        ));
      }
    }
  }

  return { steps, hasMismatch };
}

function buildFraudSteps(
  fraudAnalysis: Stage8Output | null
): { steps: CausalStep[]; hasEscalation: boolean; hasManualReview: boolean } {
  const steps: CausalStep[] = [];
  let hasEscalation = false;
  let hasManualReview = false;

  if (!fraudAnalysis) {
    steps.push(nextStep(
      "analysis", "fraud_analysis_unavailable",
      "Fraud analysis could not be completed — risk score unavailable.",
      "warning", "stage-8"
    ));
    return { steps, hasEscalation, hasManualReview };
  }

  const score = fraudAnalysis.fraudRiskScore ?? 0;
  const level = fraudAnalysis.fraudRiskLevel ?? "low";
  const scoreSeverity = fraudScoreToSeverity(score);

  steps.push(nextStep(
    "analysis", "fraud_score_computed",
    `Fraud risk score: ${score}/100 — level: ${level}.`,
    scoreSeverity, "stage-8",
    score
  ));

  // Damage consistency
  const consistency = fraudAnalysis.damageConsistencyScore ?? 100;
  if (consistency < DAMAGE_CONSISTENCY_WARNING_THRESHOLD) {
    steps.push(nextStep(
      "result", "damage_consistency_low",
      `Damage consistency score: ${consistency}/100 — ${fraudAnalysis.damageConsistencyNotes ?? "inconsistencies detected"}.`,
      consistencyScoreToSeverity(consistency), "stage-8",
      consistency
    ));
  }

  // Repairer history
  if (fraudAnalysis.repairerHistory?.flagged) {
    steps.push(nextStep(
      "result", "repairer_history_flagged",
      `Repairer history flagged: ${fraudAnalysis.repairerHistory.notes || "suspicious pattern detected"}.`,
      "warning", "stage-8"
    ));
  }

  // Claimant frequency
  if (fraudAnalysis.claimantClaimFrequency?.flagged) {
    steps.push(nextStep(
      "result", "claimant_frequency_flagged",
      `Claimant claim frequency flagged: ${fraudAnalysis.claimantClaimFrequency.notes || "above expected frequency"}.`,
      "warning", "stage-8"
    ));
  }

  // Vehicle history
  if (fraudAnalysis.vehicleClaimHistory?.flagged) {
    steps.push(nextStep(
      "result", "vehicle_history_flagged",
      `Vehicle claim history flagged: ${fraudAnalysis.vehicleClaimHistory.notes || "repeated claim pattern"}.`,
      "warning", "stage-8"
    ));
  }

  // Quote deviation
  if (fraudAnalysis.quoteDeviation !== null && Math.abs(fraudAnalysis.quoteDeviation) > 30) {
    steps.push(nextStep(
      "result", "quote_deviation_flagged",
      `Quote deviation: ${fraudAnalysis.quoteDeviation > 0 ? "+" : ""}${fraudAnalysis.quoteDeviation.toFixed(1)}% from expected range.`,
      Math.abs(fraudAnalysis.quoteDeviation) > 50 ? "critical" : "warning",
      "stage-8",
      fraudAnalysis.quoteDeviation
    ));
  }

  // Escalation / manual review decision
  if (ESCALATION_FRAUD_LEVELS.has(level)) {
    hasEscalation = true;
    steps.push(nextStep(
      "decision", "fraud_escalation_triggered",
      `Fraud risk level '${level}' exceeds escalation threshold — claim escalated to senior investigator.`,
      "critical", "stage-8"
    ));
  } else if (MANUAL_REVIEW_FRAUD_LEVELS.has(level)) {
    hasManualReview = true;
    steps.push(nextStep(
      "decision", "fraud_manual_review_triggered",
      `Fraud risk level '${level}' requires manual review before decision.`,
      "warning", "stage-8"
    ));
  }

  return { steps, hasEscalation, hasManualReview };
}

interface CostValidationSnapshot {
  validated_cost: boolean;
  adjustments_applied: boolean;
  adjustments_count: number;
  confidence_multiplier: number;
  severity_cost_consistent: boolean;
  issues_count: number;
  summary: string;
}

function buildCostSteps(costAnalysis: Stage9Output | null): CausalStep[] {
  const steps: CausalStep[] = [];

  if (!costAnalysis) {
    steps.push(nextStep(
      "analysis", "cost_analysis_unavailable",
      "Cost estimation could not be completed — repair cost unavailable.",
      "warning", "stage-9"
    ));
    return steps;
  }

  const total = costAnalysis.expectedRepairCostCents ?? 0;
  const deviation = costAnalysis.quoteDeviationPct;
  const deviationSeverity: StepSeverity =
    deviation !== null && Math.abs(deviation) > 50 ? "critical"
    : deviation !== null && Math.abs(deviation) > 30 ? "warning"
    : "info";

  steps.push(nextStep(
    "analysis", "repair_cost_estimated",
    `Estimated repair cost: ${(total / 100).toFixed(2)} (currency: ${costAnalysis.currency ?? "USD"}).${deviation !== null ? ` Quote deviation: ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}%.` : ""}`,
    deviationSeverity, "stage-9",
    total
  ));

  // Stage 36 cost validation results (attached by orchestrator)
  const cv = (costAnalysis as any).costValidation as CostValidationSnapshot | undefined;
  if (cv) {
    if (cv.adjustments_applied) {
      steps.push(nextStep(
        "result", "cost_adjustment_applied",
        `Cost realism validation applied ${cv.adjustments_count} adjustment(s): ${cv.summary}`,
        "warning", "stage-36"
      ));
    }

    if (!cv.severity_cost_consistent) {
      steps.push(nextStep(
        "result", "severity_cost_mismatch",
        `Cost-severity mismatch detected: ${cv.summary}`,
        "warning", "stage-36"
      ));
    }

    if (cv.confidence_multiplier < 1.0) {
      steps.push(nextStep(
        "result", "cost_confidence_reduced",
        `Cost confidence reduced to ×${cv.confidence_multiplier.toFixed(2)} due to ${cv.issues_count} issue(s).`,
        cv.confidence_multiplier < 0.75 ? "critical" : "warning",
        "stage-36",
        cv.confidence_multiplier
      ));
    }
  }

  // Savings opportunity
  const savings = costAnalysis.savingsOpportunityCents ?? 0;
  if (savings > 0) {
    steps.push(nextStep(
      "result", "savings_opportunity",
      `Savings opportunity identified: ${(savings / 100).toFixed(2)} through repair optimisation.`,
      "info", "stage-9",
      savings
    ));
  }

  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision outcome derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveOutcome(
  confidence: number,
  hasMismatch: boolean,
  hasEscalation: boolean,
  hasManualReview: boolean,
  criticalCount: number,
  warningCount: number
): DecisionOutcome {
  if (confidence < MIN_CONFIDENCE_FOR_DECISION) return "insufficient_data";
  if (hasEscalation && hasMismatch) return "reject_pending";
  if (hasEscalation) return "escalate";
  if (hasMismatch) return "escalate";
  if (hasManualReview) return "manual_review";
  if (criticalCount > 0) return "approve_with_notes";
  if (warningCount > 0) return "approve_with_notes";
  return "approve";
}

function buildFinalDecisionStep(outcome: DecisionOutcome): CausalStep {
  const descriptions: Record<DecisionOutcome, string> = {
    approve: "All checks passed — claim approved for processing.",
    approve_with_notes: "Claim approved with notes — minor issues recorded for adjuster review.",
    manual_review: "Claim requires manual review before a decision can be issued.",
    escalate: "Claim escalated to senior investigator — critical issues identified.",
    reject_pending: "Claim pending rejection — multiple critical indicators require investigation.",
    insufficient_data: "Insufficient data to reach a decision — additional documentation required.",
  };

  const severities: Record<DecisionOutcome, StepSeverity> = {
    approve: "info",
    approve_with_notes: "warning",
    manual_review: "warning",
    escalate: "critical",
    reject_pending: "critical",
    insufficient_data: "critical",
  };

  return {
    step: ++_stepCounter,
    category: "decision",
    key: `final_decision_${outcome}`,
    description: descriptions[outcome],
    severity: severities[outcome],
    source_stage: "stage-37",
    value: outcome,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain summary
// ─────────────────────────────────────────────────────────────────────────────

function buildChainSummary(
  chain: CausalStep[],
  outcome: DecisionOutcome,
  confidence: number
): string {
  const keySteps = chain
    .filter((s) => s.severity === "critical" || s.category === "decision")
    .slice(0, 4)
    .map((s) => s.description.split(" — ")[0].split(":")[0].trim());

  const prefix = keySteps.length > 0
    ? keySteps.join(" → ")
    : "Claim analysed";

  const outcomeLabel: Record<DecisionOutcome, string> = {
    approve: "decision: APPROVE",
    approve_with_notes: "decision: APPROVE WITH NOTES",
    manual_review: "decision: MANUAL REVIEW REQUIRED",
    escalate: "decision: ESCALATE",
    reject_pending: "decision: REJECT PENDING INVESTIGATION",
    insufficient_data: "decision: INSUFFICIENT DATA",
  };

  return `${prefix} → ${outcomeLabel[outcome]} (confidence: ${confidence}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a complete causal chain from all available pipeline outputs.
 *
 * @param claimRecord   Stage 5 assembled claim record (may be null)
 * @param damageAnalysis Stage 6 damage analysis (may be null)
 * @param physicsAnalysis Stage 7 physics reconstruction (may be null)
 * @param fraudAnalysis Stage 8 fraud analysis (may be null)
 * @param costAnalysis  Stage 9 cost estimation (may be null)
 * @param confidenceScore Overall confidence score (0–100)
 */
export function buildCausalChain(
  claimRecord: ClaimRecord | null,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null,
  fraudAnalysis: Stage8Output | null,
  costAnalysis: Stage9Output | null,
  confidenceScore: number
): CausalChainOutput {
  // Reset counter for this run
  _stepCounter = 0;

  const chain: CausalStep[] = [];

  // ── 1. Input steps ────────────────────────────────────────────────────────
  chain.push(...buildInputSteps(claimRecord));

  // ── 2. Damage analysis steps ──────────────────────────────────────────────
  chain.push(...buildDamageSteps(damageAnalysis));

  // ── 3. Physics steps + coherence cross-check ──────────────────────────────
  const { steps: physicsSteps, hasMismatch } = buildPhysicsSteps(physicsAnalysis, damageAnalysis);
  chain.push(...physicsSteps);

  // ── 4. Fraud steps ────────────────────────────────────────────────────────
  const { steps: fraudSteps, hasEscalation, hasManualReview } = buildFraudSteps(fraudAnalysis);
  chain.push(...fraudSteps);

  // ── 5. Cost steps ─────────────────────────────────────────────────────────
  chain.push(...buildCostSteps(costAnalysis));

  // ── 6. Final decision step ────────────────────────────────────────────────
  const criticalCount = chain.filter((s) => s.severity === "critical").length;
  const warningCount = chain.filter((s) => s.severity === "warning").length;

  const outcome = deriveOutcome(
    confidenceScore,
    hasMismatch,
    hasEscalation,
    hasManualReview,
    criticalCount,
    warningCount
  );

  chain.push(buildFinalDecisionStep(outcome));

  // ── 7. Renumber steps sequentially ───────────────────────────────────────
  chain.forEach((s, i) => { s.step = i + 1; });

  const escalationRequired = outcome === "escalate" || outcome === "reject_pending";
  const summary = buildChainSummary(chain, outcome, confidenceScore);

  return {
    causal_chain: chain,
    chain_summary: summary,
    decision_outcome: outcome,
    confidence_score: confidenceScore,
    escalation_required: escalationRequired,
    generated_at: new Date().toISOString(),
    step_count: chain.length,
    critical_step_count: chain.filter((s) => s.severity === "critical").length,
    warning_step_count: chain.filter((s) => s.severity === "warning").length,
  };
}
