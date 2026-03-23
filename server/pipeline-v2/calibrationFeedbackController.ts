/**
 * Calibration Feedback Controller
 *
 * Safety-gated engine that decides whether learning insights should be applied
 * to the system calibration. Reads drift, fraud pattern, and cost pattern reports
 * and proposes jurisdiction-scoped updates with strict safety constraints.
 *
 * Rules:
 * 1. Minimum Data: sample_size >= 20 AND confidence >= 60 required
 * 2. Drift Handling: cost drift > 20% → propose cost_multiplier correction
 * 3. Fraud Adjustment: FP rate > 30% → reduce weight; confirmed pattern → increase
 * 4. Safety: NEVER apply > 50% adjustment; always gradual corrections
 * 5. Jurisdiction Awareness: updates scoped to jurisdiction, not global unless justified
 * 6. Philosophy: prefer NOT applying over risky changes; stability > aggressive learning
 */

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface DriftReport {
  drift_detected: boolean;
  drift_areas: DriftArea[];
  severity: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
}

export interface DriftArea {
  dimension: string; // "cost" | "severity" | "fraud"
  direction: "OVER" | "UNDER" | "MIXED";
  magnitude_pct: number; // e.g. 25 = 25% drift
  is_continuous: boolean;
  window_count?: number;
  sample_count?: number;
}

export interface FraudPatternReport {
  emerging_patterns: EmergingPattern[];
  high_risk_indicators: HighRiskIndicator[];
  false_positive_patterns: FalsePositivePattern[];
}

export interface EmergingPattern {
  pattern_id: string;
  description: string;
  frequency: number;
  trend: "INCREASING" | "STABLE" | "DECREASING";
  confidence: number;
}

export interface HighRiskIndicator {
  flag_key: string;
  precision: number; // 0–1
  recall: number; // 0–1
  f1_score: number; // 0–1
  sample_count: number;
  recommended_weight_adjustment: number; // -1.0 to +1.0
}

export interface FalsePositivePattern {
  flag_key: string;
  false_positive_rate: number; // 0–1
  sample_count: number;
  suggested_score_reduction: number; // 0–100
}

export interface CostPatternReport {
  total_claims_analysed: number;
  mean_cost_error_pct: number; // positive = AI overestimates
  median_cost_error_pct: number;
  cost_drivers: CostDriver[];
  jurisdiction_breakdown?: JurisdictionCostBreakdown[];
}

export interface CostDriver {
  driver_key: string;
  contribution_pct: number;
  trend: "INCREASING" | "STABLE" | "DECREASING";
}

export interface JurisdictionCostBreakdown {
  jurisdiction: string;
  mean_cost_error_pct: number;
  sample_count: number;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface CalibrationUpdate {
  cost_multiplier: number; // 0.5–1.5; 1.0 = no change
  fraud_adjustments: Record<string, number>; // flag_key → weight delta (-0.5 to +0.5)
  notes: string;
}

export interface CalibrationFeedbackResult {
  apply_update: boolean;
  updates: CalibrationUpdate;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  // Additional metadata for the UI and audit trail
  blocked_reason?: string; // set when apply_update = false
  jurisdiction: string;
  sample_size: number;
  confidence: number;
  proposed_changes_count: number;
}

// ─── Input for the controller ─────────────────────────────────────────────────

export interface CalibrationFeedbackInput {
  drift_report: DriftReport;
  fraud_pattern_report: FraudPatternReport;
  cost_pattern_report: CostPatternReport;
  jurisdiction: string; // ISO-2, region name, or "global"
  sample_size: number;
  confidence: number; // 0–100
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 20;
const MIN_CONFIDENCE = 60;
const COST_DRIFT_THRESHOLD_PCT = 20; // flag if AI drifts > 20%
const FRAUD_FP_THRESHOLD = 0.30; // flag if FP rate > 30%
const FRAUD_CONFIRMED_THRESHOLD = 0.70; // increase weight if precision > 70%
const MAX_COST_MULTIPLIER_CHANGE = 0.50; // never move multiplier by more than 50%
const MAX_FRAUD_WEIGHT_CHANGE = 0.50; // never change a fraud weight by more than 50%
const GRADUAL_CORRECTION_FACTOR = 0.5; // apply 50% of the theoretical correction
const GLOBAL_JUSTIFICATION_MIN_SAMPLE = 100; // need 100+ samples to justify global override

// ─── Core Engine ──────────────────────────────────────────────────────────────

/**
 * Evaluate whether calibration updates should be applied and compute the
 * safe, gradual corrections.
 */
export function evaluateCalibrationFeedback(
  input: CalibrationFeedbackInput
): CalibrationFeedbackResult {
  const { drift_report, fraud_pattern_report, cost_pattern_report, jurisdiction, sample_size, confidence } = input;

  // ── Rule 1: Minimum Data Requirement ──────────────────────────────────────
  if (sample_size < MIN_SAMPLE_SIZE) {
    return buildBlockedResult(
      input,
      `Insufficient sample size: ${sample_size} claims (minimum ${MIN_SAMPLE_SIZE} required). Calibration updates require adequate data to avoid overfitting to noise.`,
      "LOW"
    );
  }

  if (confidence < MIN_CONFIDENCE) {
    return buildBlockedResult(
      input,
      `Confidence too low: ${confidence}% (minimum ${MIN_CONFIDENCE}% required). Calibration updates require reliable signal to avoid introducing systematic errors.`,
      "LOW"
    );
  }

  // ── Rule 5: Jurisdiction Awareness ────────────────────────────────────────
  const isGlobal = jurisdiction.toLowerCase() === "global";
  if (isGlobal && sample_size < GLOBAL_JUSTIFICATION_MIN_SAMPLE) {
    return buildBlockedResult(
      input,
      `Global overrides require at least ${GLOBAL_JUSTIFICATION_MIN_SAMPLE} samples (got ${sample_size}). Scope this update to a specific jurisdiction instead.`,
      "MEDIUM"
    );
  }

  // ── Compute proposed updates ───────────────────────────────────────────────
  const fraudAdjustments: Record<string, number> = {};
  const notes: string[] = [];
  let proposedChangesCount = 0;
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  // ── Rule 2: Cost Drift Handling ────────────────────────────────────────────
  let costMultiplier = 1.0;
  const costDriftArea = drift_report.drift_areas.find(a => a.dimension === "cost");

  if (costDriftArea && Math.abs(costDriftArea.magnitude_pct) > COST_DRIFT_THRESHOLD_PCT) {
    const rawDrift = costDriftArea.magnitude_pct / 100; // e.g. 25% → 0.25
    const direction = costDriftArea.direction;

    // AI overestimates (OVER) → multiplier < 1.0; underestimates (UNDER) → multiplier > 1.0
    const theoreticalMultiplier = direction === "OVER"
      ? 1.0 - rawDrift
      : 1.0 + rawDrift;

    // Apply gradual correction (50% of theoretical change)
    const gradualMultiplier = 1.0 + (theoreticalMultiplier - 1.0) * GRADUAL_CORRECTION_FACTOR;

    // ── Rule 4: Safety constraint — never move > 50% ──────────────────────
    const change = Math.abs(gradualMultiplier - 1.0);
    if (change > MAX_COST_MULTIPLIER_CHANGE) {
      notes.push(
        `Cost multiplier correction capped at ±${MAX_COST_MULTIPLIER_CHANGE * 100}% safety limit ` +
        `(theoretical correction was ${((theoreticalMultiplier - 1.0) * 100).toFixed(1)}%).`
      );
      costMultiplier = direction === "OVER"
        ? 1.0 - MAX_COST_MULTIPLIER_CHANGE
        : 1.0 + MAX_COST_MULTIPLIER_CHANGE;
    } else {
      costMultiplier = gradualMultiplier;
    }

    const pctChange = ((costMultiplier - 1.0) * 100).toFixed(1);
    notes.push(
      `Cost multiplier adjusted to ${costMultiplier.toFixed(3)} (${pctChange}% correction) ` +
      `based on ${costDriftArea.magnitude_pct.toFixed(1)}% ${direction === "OVER" ? "overestimation" : "underestimation"} drift ` +
      `across ${costDriftArea.sample_count ?? sample_size} claims in ${jurisdiction}.`
    );
    proposedChangesCount++;

    if (costDriftArea.is_continuous) {
      riskLevel = "HIGH";
      notes.push("Continuous cost drift detected — elevated risk level applied.");
    } else if (Math.abs(costDriftArea.magnitude_pct) > 35) {
      if ((riskLevel as string) !== "HIGH") riskLevel = "MEDIUM";
    }
  }

  // ── Rule 3: Fraud Adjustment ───────────────────────────────────────────────

  // Reduce weight for high false-positive flags
  for (const fp of fraud_pattern_report.false_positive_patterns) {
    if (fp.false_positive_rate > FRAUD_FP_THRESHOLD && fp.sample_count >= 10) {
      // Gradual reduction: 50% of the suggested reduction, capped at MAX_FRAUD_WEIGHT_CHANGE
      const rawReduction = fp.suggested_score_reduction / 100;
      const gradualReduction = rawReduction * GRADUAL_CORRECTION_FACTOR;
      const cappedReduction = Math.min(gradualReduction, MAX_FRAUD_WEIGHT_CHANGE);

      fraudAdjustments[fp.flag_key] = -cappedReduction;
      notes.push(
        `Fraud flag "${fp.flag_key}" weight reduced by ${(cappedReduction * 100).toFixed(1)}% ` +
        `(FP rate: ${(fp.false_positive_rate * 100).toFixed(1)}%, sample: ${fp.sample_count}).`
      );
      proposedChangesCount++;
      if (fp.false_positive_rate > 0.5) {
        if (riskLevel !== "HIGH") riskLevel = "MEDIUM";
      }
    }
  }

  // Increase weight for high-precision confirmed fraud indicators
  for (const indicator of fraud_pattern_report.high_risk_indicators) {
    if (
      indicator.precision > FRAUD_CONFIRMED_THRESHOLD &&
      indicator.sample_count >= 10 &&
      indicator.recommended_weight_adjustment > 0
    ) {
      const gradualIncrease = indicator.recommended_weight_adjustment * GRADUAL_CORRECTION_FACTOR;
      const cappedIncrease = Math.min(gradualIncrease, MAX_FRAUD_WEIGHT_CHANGE);

      // Don't double-apply if already in fraudAdjustments from FP check
      if (!(indicator.flag_key in fraudAdjustments)) {
        fraudAdjustments[indicator.flag_key] = cappedIncrease;
        notes.push(
          `Fraud flag "${indicator.flag_key}" weight increased by ${(cappedIncrease * 100).toFixed(1)}% ` +
          `(precision: ${(indicator.precision * 100).toFixed(1)}%, F1: ${indicator.f1_score.toFixed(2)}, sample: ${indicator.sample_count}).`
        );
        proposedChangesCount++;
      }
    }
  }

  // ── Rule 6: Philosophy — prefer not applying over risky changes ────────────
  if (proposedChangesCount === 0) {
    return buildBlockedResult(
      input,
      "No calibration updates required. All metrics are within acceptable bounds.",
      "LOW",
      true // this is a "no changes needed" result, not a block
    );
  }

  // Final risk assessment
  const totalFraudChanges = Object.keys(fraudAdjustments).length;
  if (totalFraudChanges > 5) {
    riskLevel = "HIGH";
    notes.push(`Large-scale fraud weight adjustment (${totalFraudChanges} flags) — HIGH risk.`);
  } else if (totalFraudChanges > 2 && riskLevel === "LOW") {
    riskLevel = "MEDIUM";
  }

  // Jurisdiction note
  if (isGlobal) {
    notes.push(`Global calibration update applied — affects all jurisdictions. Requires claims_manager approval.`);
    riskLevel = "HIGH"; // always HIGH for global
  } else {
    notes.push(`Update scoped to jurisdiction: ${jurisdiction}.`);
  }

  const reasoning = buildReasoning(input, costMultiplier, fraudAdjustments, riskLevel, notes);

  return {
    apply_update: true,
    updates: {
      cost_multiplier: Math.round(costMultiplier * 1000) / 1000, // 3 decimal places
      fraud_adjustments: fraudAdjustments,
      notes: notes.join(" "),
    },
    risk_level: riskLevel,
    reasoning,
    jurisdiction,
    sample_size,
    confidence,
    proposed_changes_count: proposedChangesCount,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBlockedResult(
  input: CalibrationFeedbackInput,
  reason: string,
  riskLevel: "LOW" | "MEDIUM" | "HIGH",
  noChangesNeeded = false
): CalibrationFeedbackResult {
  return {
    apply_update: false,
    updates: {
      cost_multiplier: 1.0,
      fraud_adjustments: {},
      notes: reason,
    },
    risk_level: riskLevel,
    reasoning: noChangesNeeded
      ? `No calibration adjustments warranted. ${reason}`
      : `Calibration update blocked. ${reason}`,
    blocked_reason: noChangesNeeded ? undefined : reason,
    jurisdiction: input.jurisdiction,
    sample_size: input.sample_size,
    confidence: input.confidence,
    proposed_changes_count: 0,
  };
}

function buildReasoning(
  input: CalibrationFeedbackInput,
  costMultiplier: number,
  fraudAdjustments: Record<string, number>,
  riskLevel: string,
  notes: string[]
): string {
  const parts: string[] = [];

  parts.push(
    `Calibration update approved for jurisdiction "${input.jurisdiction}" ` +
    `based on ${input.sample_size} claims at ${input.confidence}% confidence.`
  );

  if (costMultiplier !== 1.0) {
    const pct = ((costMultiplier - 1.0) * 100).toFixed(1);
    const direction = costMultiplier < 1.0 ? "reduce" : "increase";
    parts.push(
      `Cost multiplier set to ${costMultiplier.toFixed(3)} to ${direction} AI cost estimates by ${Math.abs(parseFloat(pct))}%.`
    );
  }

  const fpReductions = Object.entries(fraudAdjustments).filter(([, v]) => v < 0);
  const weightIncreases = Object.entries(fraudAdjustments).filter(([, v]) => v > 0);

  if (fpReductions.length > 0) {
    parts.push(
      `${fpReductions.length} fraud flag(s) have weight reduced due to high false-positive rates: ` +
      fpReductions.map(([k]) => `"${k}"`).join(", ") + "."
    );
  }

  if (weightIncreases.length > 0) {
    parts.push(
      `${weightIncreases.length} fraud flag(s) have weight increased due to confirmed high-precision patterns: ` +
      weightIncreases.map(([k]) => `"${k}"`).join(", ") + "."
    );
  }

  parts.push(`Risk level: ${riskLevel}. All changes are gradual (50% of theoretical correction) and capped at ±50%.`);

  return parts.join(" ");
}

// ─── Batch Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate calibration feedback for multiple jurisdictions at once.
 * Returns one result per jurisdiction.
 */
export function evaluateCalibrationFeedbackBatch(
  inputs: CalibrationFeedbackInput[]
): CalibrationFeedbackResult[] {
  return inputs.map(input => evaluateCalibrationFeedback(input));
}

/**
 * Summarise a batch of calibration results for the Learning Dashboard.
 */
export interface CalibrationBatchSummary {
  total_evaluated: number;
  updates_approved: number;
  updates_blocked: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  jurisdictions_affected: string[];
  total_proposed_changes: number;
  average_cost_multiplier: number;
}

export function summariseCalibrationBatch(
  results: CalibrationFeedbackResult[]
): CalibrationBatchSummary {
  const approved = results.filter(r => r.apply_update);
  const blocked = results.filter(r => !r.apply_update);

  const costMultipliers = approved.map(r => r.updates.cost_multiplier);
  const avgCostMultiplier = costMultipliers.length > 0
    ? costMultipliers.reduce((a, b) => a + b, 0) / costMultipliers.length
    : 1.0;

  return {
    total_evaluated: results.length,
    updates_approved: approved.length,
    updates_blocked: blocked.length,
    high_risk_count: results.filter(r => r.risk_level === "HIGH").length,
    medium_risk_count: results.filter(r => r.risk_level === "MEDIUM").length,
    low_risk_count: results.filter(r => r.risk_level === "LOW").length,
    jurisdictions_affected: approved.map(r => r.jurisdiction),
    total_proposed_changes: approved.reduce((sum, r) => sum + r.proposed_changes_count, 0),
    average_cost_multiplier: Math.round(avgCostMultiplier * 1000) / 1000,
  };
}
