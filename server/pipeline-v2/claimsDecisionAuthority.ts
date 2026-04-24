/**
 * claimsDecisionAuthority.ts
 *
 * Claims Decision Authority — Phase 4 of the KINGA AI pipeline.
 *
 * This is the ONLY component authorised to issue a final recommendation.
 * It synthesises all upstream validated signals and produces a single,
 * non-contradictory decision. It NEVER overrides validated upstream facts.
 *
 * Return shape (matches the prompt contract):
 * {
 *   "recommendation": "APPROVE | REVIEW | REJECT",
 *   "confidence": 0-100,
 *   "decision_basis": "assessor_validated | system_validated | insufficient_data",
 *   "key_drivers": [],
 *   "reasoning": ""
 * }
 *
 * Extended output also includes:
 *   - decision_trace       — ordered list of rule evaluations applied
 *   - blocking_factors     — reasons that prevented APPROVE
 *   - override_flags       — any upstream signals that were deterministic
 *   - warnings             — non-blocking data quality issues
 *   - metadata             — engine version, timestamp, input summary
 */

import type { FraudRiskLevel, AccidentSeverity } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionRecommendation = "APPROVE" | "REVIEW" | "REJECT";
export type DecisionBasis = "assessor_validated" | "system_validated" | "insufficient_data";

/** Simplified physics result shape accepted by the Decision Authority */
export interface PhysicsResultInput {
  /** Whether the physics model found the claim physically plausible */
  is_plausible?: boolean | null;
  /** Confidence score from the physics engine (0-100) */
  confidence?: number | null;
  /** Whether there is a critical physical inconsistency */
  has_critical_inconsistency?: boolean | null;
  /** Short summary from the physics engine */
  summary?: string | null;
}

/** Simplified damage validation result */
export interface DamageValidationInput {
  /** Whether damage is consistent with the reported incident */
  is_consistent?: boolean | null;
  /** Consistency score (0-100) */
  consistency_score?: number | null;
  /** Whether there are unexplained damage patterns */
  has_unexplained_damage?: boolean | null;
  /** Short summary */
  summary?: string | null;
}

/** Simplified fraud result */
export interface FraudResultInput {
  /** Fraud risk level */
  fraud_risk_level?: FraudRiskLevel | null;
  /** Fraud risk score (0-100) */
  fraud_risk_score?: number | null;
  /** Number of critical fraud flags */
  critical_flag_count?: number | null;
  /** Whether the scenario fraud engine flagged this claim */
  scenario_fraud_flagged?: boolean | null;
  /** Short reasoning from the fraud engine */
  reasoning?: string | null;
}

/** Simplified cost decision result */
export interface CostDecisionInput {
  /** Cost recommendation from the cost engine */
  recommendation?: "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE" | null;
  /** Whether the cost is within acceptable range */
  is_within_range?: boolean | null;
  /** Confidence score from the cost engine (0-100) */
  confidence?: number | null;
  /** Whether there are cost anomalies */
  has_anomalies?: boolean | null;
  /** Short reasoning */
  reasoning?: string | null;
}

/** Consistency status from the cross-engine consistency checker */
export interface ConsistencyStatusInput {
  /** Overall consistency status */
  overall_status?: "CONSISTENT" | "CONFLICTED" | null;
  /** Number of critical conflicts */
  critical_conflict_count?: number | null;
  /** Whether the claim should proceed to final decision */
  proceed?: boolean | null;
  /** Short summary */
  summary?: string | null;
}

export interface ClaimsDecisionInput {
  /** Incident scenario type (e.g. "animal_strike", "vehicle_collision") */
  scenario_type?: string | null;
  /** Assessed severity level */
  severity?: AccidentSeverity | string | null;
  /** Physics engine result */
  physics_result?: PhysicsResultInput | null;
  /** Damage validation result */
  damage_validation?: DamageValidationInput | null;
  /** Fraud analysis result */
  fraud_result?: FraudResultInput | null;
  /** Cost decision result */
  costDecision?: CostDecisionInput | null;
  /** Overall pipeline confidence (0-100) */
  overall_confidence?: number | null;
  /** Cross-engine consistency status */
  consistency_status?: ConsistencyStatusInput | null;
  /**
   * Whether an assessor has manually validated this claim.
   * When true, decision_basis becomes "assessor_validated".
   */
  assessor_validated?: boolean | null;
  /**
   * Whether this is a high-value claim requiring mandatory review.
   * Overrides APPROVE to REVIEW when true.
   */
  is_high_value?: boolean | null;
}

export interface ClaimsDecisionOutput {
  /** The single final recommendation — APPROVE, REVIEW, or REJECT */
  recommendation: DecisionRecommendation;
  /** Confidence in this recommendation (0-100) */
  confidence: number;
  /** The basis on which this decision was made */
  decision_basis: DecisionBasis;
  /** The primary factors that drove this decision */
  key_drivers: string[];
  /** Human-readable explanation of the decision */
  reasoning: string;
  /** Ordered trace of rule evaluations applied */
  decision_trace: string[];
  /** Factors that prevented a more favourable outcome */
  blocking_factors: string[];
  /** Upstream signals that were deterministic (cannot be overridden) */
  override_flags: string[];
  /** Non-blocking data quality warnings */
  warnings: string[];
  /** Engine metadata */
  metadata: {
    engine: "ClaimsDecisionAuthority";
    version: "1.0.0";
    inputs_available: Record<string, boolean>;
    scenario_type: string;
    severity: string;
    timestamp_utc: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confidence threshold below which a claim is automatically sent to REVIEW */
const CONFIDENCE_REVIEW_THRESHOLD = 60;

/** Confidence threshold below which a claim is sent to REVIEW (not REJECT) */
const CONFIDENCE_INSUFFICIENT_THRESHOLD = 40;

/** Fraud risk levels that trigger automatic REJECT */
const REJECT_FRAUD_LEVELS: FraudRiskLevel[] = ["high", "elevated"];

/** Fraud risk levels that trigger REVIEW */
const REVIEW_FRAUD_LEVELS: FraudRiskLevel[] = ["medium"];

/** Severity levels considered high-risk for auto-approval */
const HIGH_SEVERITY_LEVELS = ["severe", "catastrophic"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseFraudLevel(level: string | null | undefined): FraudRiskLevel | null {
  if (!level) return null;
  const l = level.toLowerCase().trim();
  if (l === "high" || l === "elevated" || l === "medium" || l === "low" || l === "minimal") {
    return l as FraudRiskLevel;
  }
  // Map common aliases
  if (l === "HIGH") return "high";
  if (l === "MEDIUM" || l === "MODERATE") return "medium";
  if (l === "LOW") return "low";
  return null;
}

function inputAvailability(input: ClaimsDecisionInput): Record<string, boolean> {
  return {
    scenario_type: input.scenario_type != null,
    severity: input.severity != null,
    physics_result: input.physics_result != null,
    damage_validation: input.damage_validation != null,
    fraud_result: input.fraud_result != null,
    costDecision: input.costDecision != null,
    overall_confidence: input.overall_confidence != null,
    consistency_status: input.consistency_status != null,
    assessor_validated: input.assessor_validated != null,
  };
}

function countAvailableInputs(availability: Record<string, boolean>): number {
  return Object.values(availability).filter(Boolean).length;
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Evaluate all upstream signals and produce the single final claim recommendation.
 *
 * Decision priority order (highest to lowest):
 * 1. REJECT — deterministic hard stops (fraud HIGH/ELEVATED, critical physical inconsistency)
 * 2. REJECT — critical cross-engine conflicts with proceed=false
 * 3. REVIEW — moderate fraud risk (MEDIUM)
 * 4. REVIEW — confidence below threshold (40–59)
 * 5. REVIEW — physical inconsistency without critical flag
 * 6. REVIEW — damage inconsistency
 * 7. REVIEW — cost escalation required
 * 8. REVIEW — high severity requiring human oversight
 * 9. REVIEW — insufficient data
 * 10. APPROVE — all conditions met
 */
export function evaluateClaimDecision(input: ClaimsDecisionInput): ClaimsDecisionOutput {
  const trace: string[] = [];
  const keyDrivers: string[] = [];
  const blockingFactors: string[] = [];
  const overrideFlags: string[] = [];
  const warnings: string[] = [];

  const availability = inputAvailability(input);
  const availableCount = countAvailableInputs(availability);

  const scenarioType = input.scenario_type ?? "unknown";
  const severity = input.severity ?? "unknown";
  const overallConfidence = input.overall_confidence ?? null;

  trace.push(`[INIT] Evaluating claim: scenario=${scenarioType}, severity=${severity}, confidence=${overallConfidence ?? "unknown"}`);

  // ── Normalise fraud level ──────────────────────────────────────────────────

  const fraudLevel = normaliseFraudLevel(
    input.fraud_result?.fraud_risk_level ??
    (input.fraud_result?.fraud_risk_score != null
      ? input.fraud_result.fraud_risk_score >= 70 ? "high"
        : input.fraud_result.fraud_risk_score >= 45 ? "medium"
        : input.fraud_result.fraud_risk_score >= 20 ? "low"
        : "minimal"
      : null)
  );

  // ── RULE 1: Hard REJECT — Fraud HIGH or ELEVATED ──────────────────────────

  if (fraudLevel && REJECT_FRAUD_LEVELS.includes(fraudLevel)) {
    trace.push(`[RULE-1] REJECT triggered: fraud_risk_level=${fraudLevel}`);
    overrideFlags.push(`fraud_risk_level=${fraudLevel}`);
    keyDrivers.push(`Fraud risk level: ${fraudLevel.toUpperCase()}`);
    blockingFactors.push(`Fraud risk level is ${fraudLevel.toUpperCase()}, which exceeds the acceptable threshold for approval or review`);

    if (input.fraud_result?.reasoning) {
      keyDrivers.push(`Fraud reasoning: ${input.fraud_result.reasoning.substring(0, 120)}`);
    }

    const confidence = Math.max(10, Math.min(95, 100 - (input.fraud_result?.fraud_risk_score ?? 80)));

    return buildOutput({
      recommendation: "REJECT",
      confidence,
      decision_basis: input.assessor_validated ? "assessor_validated" : "system_validated",
      key_drivers: keyDrivers,
      reasoning: buildRejectionReasoning("fraud", fraudLevel, input),
      decision_trace: trace,
      blocking_factors: blockingFactors,
      override_flags: overrideFlags,
      warnings,
      availability,
      scenarioType,
      severity,
    });
  }

  trace.push(`[RULE-1] PASS: fraud_risk_level=${fraudLevel ?? "unknown"}`);

  // ── RULE 2: Hard REJECT — Critical physical inconsistency ─────────────────

  const hasCriticalPhysicsInconsistency = input.physics_result?.has_critical_inconsistency === true;
  const physicsIsPlausible = input.physics_result?.is_plausible;

  if (hasCriticalPhysicsInconsistency) {
    trace.push(`[RULE-2] REJECT triggered: critical physical inconsistency detected`);
    overrideFlags.push("physics_critical_inconsistency=true");
    keyDrivers.push("Critical physical inconsistency detected by physics engine");
    blockingFactors.push("The physics engine identified a critical inconsistency that cannot be reconciled with the reported incident");

    if (input.physics_result?.summary) {
      keyDrivers.push(`Physics summary: ${input.physics_result.summary.substring(0, 120)}`);
    }

    return buildOutput({
      recommendation: "REJECT",
      confidence: Math.min(90, (input.physics_result?.confidence ?? 70)),
      decision_basis: input.assessor_validated ? "assessor_validated" : "system_validated",
      key_drivers: keyDrivers,
      reasoning: buildRejectionReasoning("physics", null, input),
      decision_trace: trace,
      blocking_factors: blockingFactors,
      override_flags: overrideFlags,
      warnings,
      availability,
      scenarioType,
      severity,
    });
  }

  trace.push(`[RULE-2] PASS: no critical physics inconsistency`);

  // ── RULE 3: Hard REJECT — Critical cross-engine conflicts ─────────────────

  const criticalConflictCount = input.consistency_status?.critical_conflict_count ?? 0;
  const consistencyProceed = input.consistency_status?.proceed;

  if (consistencyProceed === false && criticalConflictCount > 0) {
    trace.push(`[RULE-3] REJECT triggered: consistency_proceed=false, critical_conflicts=${criticalConflictCount}`);
    overrideFlags.push(`critical_conflict_count=${criticalConflictCount}`);
    keyDrivers.push(`${criticalConflictCount} critical cross-engine conflict(s) detected`);
    blockingFactors.push("Cross-engine consistency check determined that the claim cannot proceed to final decision due to critical conflicts");

    return buildOutput({
      recommendation: "REJECT",
      confidence: 75,
      decision_basis: input.assessor_validated ? "assessor_validated" : "system_validated",
      key_drivers: keyDrivers,
      reasoning: buildRejectionReasoning("consistency", null, input),
      decision_trace: trace,
      blocking_factors: blockingFactors,
      override_flags: overrideFlags,
      warnings,
      availability,
      scenarioType,
      severity,
    });
  }

  trace.push(`[RULE-3] PASS: no blocking critical conflicts`);

  // ── From here: REVIEW or APPROVE ─────────────────────────────────────────

  const reviewReasons: string[] = [];

  // ── RULE 4: REVIEW — Moderate fraud risk ──────────────────────────────────

  if (fraudLevel && REVIEW_FRAUD_LEVELS.includes(fraudLevel)) {
    trace.push(`[RULE-4] REVIEW flag: fraud_risk_level=${fraudLevel}`);
    reviewReasons.push(`Moderate fraud risk (${fraudLevel.toUpperCase()}) requires assessor review`);
    keyDrivers.push(`Fraud risk level: ${fraudLevel.toUpperCase()}`);
  } else {
    trace.push(`[RULE-4] PASS: fraud_risk_level=${fraudLevel ?? "unknown"}`);
  }

  // ── RULE 5: REVIEW — Confidence below threshold ───────────────────────────

  if (overallConfidence !== null) {
    if (overallConfidence < CONFIDENCE_REVIEW_THRESHOLD) {
      trace.push(`[RULE-5] REVIEW flag: overall_confidence=${overallConfidence} < ${CONFIDENCE_REVIEW_THRESHOLD}`);
      reviewReasons.push(`Overall confidence (${overallConfidence}%) is below the ${CONFIDENCE_REVIEW_THRESHOLD}% approval threshold`);
      keyDrivers.push(`Low pipeline confidence: ${overallConfidence}%`);
    } else {
      trace.push(`[RULE-5] PASS: overall_confidence=${overallConfidence} ≥ ${CONFIDENCE_REVIEW_THRESHOLD}`);
    }
  } else {
    trace.push(`[RULE-5] SKIP: overall_confidence not provided`);
    warnings.push("overall_confidence not provided — confidence threshold check skipped");
  }

  // ── RULE 6: REVIEW — Physics not plausible (non-critical) ────────────────

  if (physicsIsPlausible === false && !hasCriticalPhysicsInconsistency) {
    trace.push(`[RULE-6] REVIEW flag: physics_is_plausible=false (non-critical)`);
    reviewReasons.push("Physics engine found the claim scenario implausible — assessor review required");
    keyDrivers.push("Physics implausibility (non-critical)");
  } else {
    trace.push(`[RULE-6] PASS: physics plausibility check`);
  }

  // ── RULE 7: REVIEW — Damage inconsistency ────────────────────────────────

  const damageConsistent = input.damage_validation?.is_consistent;
  const hasUnexplainedDamage = input.damage_validation?.has_unexplained_damage;

  if (damageConsistent === false || hasUnexplainedDamage === true) {
    trace.push(`[RULE-7] REVIEW flag: damage_consistent=${damageConsistent}, unexplained_damage=${hasUnexplainedDamage}`);
    reviewReasons.push("Damage validation found inconsistencies or unexplained damage patterns");
    keyDrivers.push("Damage inconsistency detected");
    if (input.damage_validation?.summary) {
      keyDrivers.push(`Damage summary: ${input.damage_validation.summary.substring(0, 100)}`);
    }
  } else {
    trace.push(`[RULE-7] PASS: damage consistency check`);
  }

  // ── RULE 8: REVIEW — Cost escalation required ────────────────────────────

  if (input.costDecision?.recommendation === "ESCALATE") {
    trace.push(`[RULE-8] REVIEW flag: cost_recommendation=ESCALATE`);
    reviewReasons.push("Cost decision engine recommends escalation — manual cost review required");
    keyDrivers.push("Cost escalation required");
  } else {
    trace.push(`[RULE-8] PASS: cost recommendation=${input.costDecision?.recommendation ?? "unknown"}`);
  }

  // ── RULE 9: REVIEW — High severity requiring human oversight ─────────────

  if (HIGH_SEVERITY_LEVELS.includes(severity) && !input.assessor_validated) {
    trace.push(`[RULE-9] REVIEW flag: severity=${severity} requires human oversight`);
    reviewReasons.push(`High severity (${severity}) claims require assessor validation before approval`);
    keyDrivers.push(`High severity: ${severity}`);
  } else {
    trace.push(`[RULE-9] PASS: severity=${severity}`);
  }

  // ── RULE 10: REVIEW — Insufficient data ──────────────────────────────────

  const criticalInputsMissing =
    !availability.physics_result &&
    !availability.damage_validation &&
    !availability.fraud_result;

  if (criticalInputsMissing || availableCount < 3) {
    trace.push(`[RULE-10] REVIEW flag: insufficient data (${availableCount}/9 inputs available)`);
    reviewReasons.push(`Insufficient data for automated decision (${availableCount}/9 inputs available)`);
    keyDrivers.push(`Insufficient data: ${availableCount}/9 inputs available`);
    warnings.push(`Only ${availableCount} of 9 expected inputs were provided`);
  } else {
    trace.push(`[RULE-10] PASS: ${availableCount}/9 inputs available`);
  }

  // ── RULE 11: REVIEW — High-value claim override ───────────────────────────

  if (input.is_high_value === true) {
    trace.push(`[RULE-11] REVIEW flag: is_high_value=true`);
    reviewReasons.push("High-value claim — mandatory assessor review regardless of automated signals");
    keyDrivers.push("High-value claim flag");
  } else {
    trace.push(`[RULE-11] PASS: is_high_value=${input.is_high_value ?? false}`);
  }

  // ── Final decision ────────────────────────────────────────────────────────

  if (reviewReasons.length > 0) {
    // At least one REVIEW condition triggered
    trace.push(`[DECISION] REVIEW: ${reviewReasons.length} review condition(s) triggered`);
    blockingFactors.push(...reviewReasons);

    const decisionBasis: DecisionBasis =
      input.assessor_validated ? "assessor_validated"
      : availableCount < 3 ? "insufficient_data"
      : "system_validated";

    // Confidence for REVIEW: use overall_confidence if available, else estimate from available inputs
    const reviewConfidence = overallConfidence !== null
      ? Math.min(overallConfidence, 75) // cap REVIEW confidence at 75
      : Math.round(40 + (availableCount / 9) * 30);

    return buildOutput({
      recommendation: "REVIEW",
      confidence: reviewConfidence,
      decision_basis: decisionBasis,
      key_drivers: keyDrivers.length > 0 ? keyDrivers : ["Multiple signals require assessor review"],
      reasoning: buildReviewReasoning(reviewReasons, input),
      decision_trace: trace,
      blocking_factors: blockingFactors,
      override_flags: overrideFlags,
      warnings,
      availability,
      scenarioType,
      severity,
    });
  }

  // ── APPROVE ───────────────────────────────────────────────────────────────

  trace.push(`[DECISION] APPROVE: all conditions met`);

  const approveConfidence = overallConfidence !== null
    ? Math.max(60, overallConfidence)
    : Math.round(60 + (availableCount / 9) * 35);

  const approveDrivers: string[] = [];
  if (damageConsistent === true) approveDrivers.push("Damage consistent with reported incident");
  if (fraudLevel && (fraudLevel === "low" || fraudLevel === "minimal")) approveDrivers.push(`Fraud risk: ${fraudLevel.toUpperCase()}`);
  if (physicsIsPlausible === true) approveDrivers.push("Physics analysis confirms plausibility");
  if (input.consistency_status?.overall_status === "CONSISTENT") approveDrivers.push("Cross-engine signals are consistent");
  if (input.costDecision?.recommendation === "PROCEED_TO_ASSESSMENT") approveDrivers.push("Cost within acceptable range");
  if (approveDrivers.length === 0) approveDrivers.push("All automated checks passed");

  return buildOutput({
    recommendation: "APPROVE",
    confidence: approveConfidence,
    decision_basis: input.assessor_validated ? "assessor_validated" : "system_validated",
    key_drivers: approveDrivers,
    reasoning: buildApprovalReasoning(input, approveDrivers),
    decision_trace: trace,
    blocking_factors: [],
    override_flags: overrideFlags,
    warnings,
    availability,
    scenarioType,
    severity,
  });
}

// ─── Output Builder ───────────────────────────────────────────────────────────

interface BuildOutputParams {
  recommendation: DecisionRecommendation;
  confidence: number;
  decision_basis: DecisionBasis;
  key_drivers: string[];
  reasoning: string;
  decision_trace: string[];
  blocking_factors: string[];
  override_flags: string[];
  warnings: string[];
  availability: Record<string, boolean>;
  scenarioType: string;
  severity: string;
}

function buildOutput(p: BuildOutputParams): ClaimsDecisionOutput {
  return {
    recommendation: p.recommendation,
    confidence: Math.max(0, Math.min(100, Math.round(p.confidence))),
    decision_basis: p.decision_basis,
    key_drivers: p.key_drivers.slice(0, 8), // cap at 8 drivers
    reasoning: p.reasoning,
    decision_trace: p.decision_trace,
    blocking_factors: p.blocking_factors,
    override_flags: p.override_flags,
    warnings: p.warnings,
    metadata: {
      engine: "ClaimsDecisionAuthority",
      version: "1.0.0",
      inputs_available: p.availability,
      scenario_type: p.scenarioType,
      severity: p.severity,
      timestamp_utc: new Date().toISOString(),
    },
  };
}

// ─── Reasoning Builders ───────────────────────────────────────────────────────

function buildRejectionReasoning(
  cause: "fraud" | "physics" | "consistency",
  fraudLevel: FraudRiskLevel | null,
  input: ClaimsDecisionInput
): string {
  const scenario = input.scenario_type ?? "unknown scenario";
  const severity = input.severity ?? "unknown severity";

  if (cause === "fraud") {
    const score = input.fraud_result?.fraud_risk_score;
    return `This ${scenario} claim (severity: ${severity}) has been rejected due to ${fraudLevel?.toUpperCase()} fraud risk${score != null ? ` (score: ${score}/100)` : ""}. The fraud analysis engine identified indicators that exceed the acceptable threshold for automated approval or review. This decision is deterministic and cannot be overridden by downstream processing. The claim must be escalated to the fraud investigation team for manual review.${input.fraud_result?.reasoning ? " Fraud engine reasoning: " + input.fraud_result.reasoning.substring(0, 200) : ""}`;
  }

  if (cause === "physics") {
    return `This ${scenario} claim (severity: ${severity}) has been rejected due to a critical physical inconsistency identified by the physics analysis engine. The reported incident mechanics are not consistent with the observed damage pattern. This is a deterministic rejection — the physics engine's critical inconsistency flag cannot be overridden.${input.physics_result?.summary ? " Physics summary: " + input.physics_result.summary.substring(0, 200) : ""}`;
  }

  // consistency
  const conflictCount = input.consistency_status?.critical_conflict_count ?? 0;
  return `This ${scenario} claim (severity: ${severity}) has been rejected because the cross-engine consistency checker identified ${conflictCount} critical conflict(s) that prevent the claim from proceeding to a final decision. The consistency checker's proceed=false flag is a hard stop that cannot be overridden.${input.consistency_status?.summary ? " Consistency summary: " + input.consistency_status.summary.substring(0, 200) : ""}`;
}

function buildReviewReasoning(reviewReasons: string[], input: ClaimsDecisionInput): string {
  const scenario = input.scenario_type ?? "unknown scenario";
  const severity = input.severity ?? "unknown severity";
  const confidence = input.overall_confidence;

  const intro = `This ${scenario} claim (severity: ${severity}${confidence != null ? `, confidence: ${confidence}%` : ""}) has been sent for assessor review because ${reviewReasons.length === 1 ? "one condition" : `${reviewReasons.length} conditions`} require human validation before a final decision can be issued.`;

  const conditionList = reviewReasons
    .slice(0, 5)
    .map((r, i) => `(${i + 1}) ${r}`)
    .join(" ");

  return `${intro} Conditions: ${conditionList}. The Claims Decision Authority cannot issue an APPROVE or REJECT without assessor input on the flagged items.`;
}

function buildApprovalReasoning(input: ClaimsDecisionInput, drivers: string[]): string {
  const scenario = input.scenario_type ?? "unknown scenario";
  const severity = input.severity ?? "unknown severity";
  const confidence = input.overall_confidence;

  return `This ${scenario} claim (severity: ${severity}${confidence != null ? `, confidence: ${confidence}%` : ""}) has been approved. All automated validation checks passed: ${drivers.join("; ")}. No fraud indicators, physical inconsistencies, or critical conflicts were detected. The claim meets the criteria for automated approval.`;
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

export interface BatchDecisionInput {
  claim_id: string | number;
  input: ClaimsDecisionInput;
}

export interface BatchDecisionResult {
  claim_id: string | number;
  result: ClaimsDecisionOutput;
}

/**
 * Evaluate decisions for multiple claims in one call.
 */
export function evaluateClaimDecisionBatch(
  claims: BatchDecisionInput[]
): BatchDecisionResult[] {
  return claims.map((c) => ({
    claim_id: c.claim_id,
    result: evaluateClaimDecision(c.input),
  }));
}

// ─── Decision Summary ─────────────────────────────────────────────────────────

export interface DecisionSummary {
  total: number;
  approve_count: number;
  review_count: number;
  reject_count: number;
  approve_rate: number;
  review_rate: number;
  reject_rate: number;
  average_confidence: number;
  by_decision_basis: Record<DecisionBasis, number>;
  top_key_drivers: Array<{ driver: string; count: number }>;
}

/**
 * Aggregate batch decision results into a summary.
 */
export function aggregateDecisionSummary(results: BatchDecisionResult[]): DecisionSummary {
  if (results.length === 0) {
    return {
      total: 0,
      approve_count: 0,
      review_count: 0,
      reject_count: 0,
      approve_rate: 0,
      review_rate: 0,
      reject_rate: 0,
      average_confidence: 0,
      by_decision_basis: { assessor_validated: 0, system_validated: 0, insufficient_data: 0 },
      top_key_drivers: [],
    };
  }

  let approveCount = 0;
  let reviewCount = 0;
  let rejectCount = 0;
  let totalConfidence = 0;
  const basisCounts: Record<DecisionBasis, number> = {
    assessor_validated: 0,
    system_validated: 0,
    insufficient_data: 0,
  };
  const driverMap = new Map<string, number>();

  for (const { result } of results) {
    if (result.recommendation === "APPROVE") approveCount++;
    else if (result.recommendation === "REVIEW") reviewCount++;
    else rejectCount++;

    totalConfidence += result.confidence;
    basisCounts[result.decision_basis]++;

    for (const driver of result.key_drivers) {
      // Normalise driver to first 60 chars for grouping
      const key = driver.substring(0, 60);
      driverMap.set(key, (driverMap.get(key) ?? 0) + 1);
    }
  }

  const topDrivers = Array.from(driverMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([driver, count]) => ({ driver, count }));

  return {
    total: results.length,
    approve_count: approveCount,
    review_count: reviewCount,
    reject_count: rejectCount,
    approve_rate: Math.round((approveCount / results.length) * 1000) / 1000,
    review_rate: Math.round((reviewCount / results.length) * 1000) / 1000,
    reject_rate: Math.round((rejectCount / results.length) * 1000) / 1000,
    average_confidence: Math.round((totalConfidence / results.length) * 10) / 10,
    by_decision_basis: basisCounts,
    top_key_drivers: topDrivers,
  };
}
