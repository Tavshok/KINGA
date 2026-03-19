/**
 * Stage 36 — Cost Realism Validator
 *
 * Validates that the cost estimation output from Stage 9 is mechanically and
 * economically realistic. Applies four sequential validation rules:
 *
 * Rule 1 — Labour ratio gate:
 *   labour_cost / total_cost must be between 20% and 60%.
 *   If outside this band, labour is proportionally adjusted to bring the ratio
 *   to the nearest bound (20% or 60%).
 *
 * Rule 2 — Parts alignment gate:
 *   parts_cost must align with number_of_components × average_component_cost.
 *   Tolerance: ±40% of the expected parts cost.
 *   If outside tolerance, parts cost is adjusted to the expected value.
 *
 * Rule 3 — Proportional adjustment:
 *   When any adjustment is applied, all downstream totals are recomputed
 *   proportionally so the breakdown remains internally consistent.
 *
 * Rule 4 — Severity ↔ cost cross-check:
 *   Validates that the total cost falls within the expected range for the
 *   accident severity level. Reduces confidence when mismatched.
 *
 * Output contract:
 *   Always returns { validated_cost: boolean, adjustments_applied: boolean, ... }
 *
 * All values are in cents (integer) throughout to avoid floating-point drift.
 */

import type { Stage9Output, AccidentSeverity } from "./types";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum acceptable labour/total ratio */
export const LABOUR_RATIO_MIN = 0.20;

/** Maximum acceptable labour/total ratio */
export const LABOUR_RATIO_MAX = 0.60;

/**
 * Tolerance for parts cost vs expected (component_count × avg_component_cost).
 * ±40% is intentionally generous to accommodate regional pricing variance.
 */
export const PARTS_ALIGNMENT_TOLERANCE = 0.40;

/**
 * Average cost per damaged component (in cents) used when no component-level
 * data is available. Based on regional average for moderate damage.
 * Default: USD 350 per component.
 */
export const DEFAULT_AVG_COMPONENT_COST_CENTS = 35_000;

/**
 * Severity ↔ total cost ranges (in cents).
 * These are indicative bounds; costs outside these ranges trigger a confidence
 * reduction but do NOT force an adjustment (cost is preserved as-is).
 *
 * Ranges are intentionally wide to accommodate multi-component claims.
 * Source: industry repair cost benchmarks (ZA/ZW market, 2024).
 */
export const SEVERITY_COST_RANGES_CENTS: Record<
  AccidentSeverity,
  { minCents: number; maxCents: number }
> = {
  none: { minCents: 0, maxCents: 10_000 },
  cosmetic: { minCents: 5_000, maxCents: 200_000 },
  minor: { minCents: 20_000, maxCents: 500_000 },
  moderate: { minCents: 100_000, maxCents: 1_500_000 },
  severe: { minCents: 500_000, maxCents: 5_000_000 },
  catastrophic: { minCents: 2_000_000, maxCents: 50_000_000 },
};

/**
 * Confidence reduction applied when severity ↔ cost mismatch is detected.
 * Expressed as a multiplier (e.g. 0.85 = −15%).
 */
export const SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION = 0.85;

/**
 * Confidence reduction applied when labour ratio is outside the valid band.
 */
export const LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION = 0.90;

/**
 * Confidence reduction applied when parts cost is outside the alignment tolerance.
 */
export const PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION = 0.90;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostValidationAdjustment {
  /** Which rule triggered this adjustment */
  rule: "labour_ratio" | "parts_alignment" | "severity_cost_mismatch";
  /** Human-readable description of what was adjusted */
  description: string;
  /** The field that was adjusted */
  field: string;
  /** Value before adjustment (cents) */
  original_value_cents: number;
  /** Value after adjustment (cents) */
  adjusted_value_cents: number;
  /** Whether a confidence reduction was applied */
  confidence_reduced: boolean;
  /** Confidence multiplier applied (1.0 = no reduction) */
  confidence_multiplier: number;
}

export interface CostValidationIssue {
  /** Which rule was violated */
  rule: "labour_ratio" | "parts_alignment" | "severity_cost_mismatch";
  /** Human-readable description */
  description: string;
  /** Actual value that triggered the issue */
  actual_value: number;
  /** Expected value or range */
  expected_value: string;
  /** Severity of the issue */
  severity: "high" | "medium" | "low";
}

export interface CostRealismResult {
  /** Whether the cost passed all validation rules (after any adjustments) */
  validated_cost: boolean;
  /** Whether any proportional adjustments were applied */
  adjustments_applied: boolean;
  /** Validated (and possibly adjusted) cost breakdown */
  validated_breakdown: {
    parts_cost_cents: number;
    labour_cost_cents: number;
    paint_cost_cents: number;
    hidden_damage_cost_cents: number;
    total_cents: number;
  };
  /** Labour/total ratio after validation */
  labour_ratio: number;
  /** Confidence multiplier to apply to the overall cost confidence (product of all reductions) */
  confidence_multiplier: number;
  /** All issues detected (including those that were auto-corrected) */
  issues: CostValidationIssue[];
  /** All adjustments applied */
  adjustments: CostValidationAdjustment[];
  /** Whether severity ↔ cost is consistent */
  severity_cost_consistent: boolean;
  /** The severity used for the cross-check */
  severity_used: AccidentSeverity | null;
  /** Human-readable summary */
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp a value to [min, max] */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to nearest integer (cents) */
function roundCents(value: number): number {
  return Math.round(value);
}

/** Safe division — returns 0 if denominator is 0 */
function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

// ─── Rule 1: Labour Ratio Validation ─────────────────────────────────────────

interface LabourRuleResult {
  adjusted_labour_cents: number;
  adjusted_total_cents: number;
  ratio: number;
  issue: CostValidationIssue | null;
  adjustment: CostValidationAdjustment | null;
}

function validateLabourRatio(
  labourCents: number,
  totalCents: number
): LabourRuleResult {
  const ratio = safeDiv(labourCents, totalCents);

  // Within valid band — no action needed
  if (ratio >= LABOUR_RATIO_MIN && ratio <= LABOUR_RATIO_MAX) {
    return {
      adjusted_labour_cents: labourCents,
      adjusted_total_cents: totalCents,
      ratio,
      issue: null,
      adjustment: null,
    };
  }

  // Determine target ratio: clamp to nearest bound
  const targetRatio = ratio < LABOUR_RATIO_MIN ? LABOUR_RATIO_MIN : LABOUR_RATIO_MAX;

  // Adjust labour to hit the target ratio while keeping non-labour costs fixed
  // non_labour = total - labour; new_total = non_labour / (1 - targetRatio)
  const nonLabourCents = totalCents - labourCents;
  const newTotalCents = roundCents(safeDiv(nonLabourCents, 1 - targetRatio));
  const newLabourCents = roundCents(newTotalCents - nonLabourCents);
  const newRatio = safeDiv(newLabourCents, newTotalCents);

  const issue: CostValidationIssue = {
    rule: "labour_ratio",
    description:
      ratio < LABOUR_RATIO_MIN
        ? `Labour cost (${(ratio * 100).toFixed(1)}% of total) is below the minimum expected ratio of ${(LABOUR_RATIO_MIN * 100).toFixed(0)}%. Labour has been adjusted upward proportionally.`
        : `Labour cost (${(ratio * 100).toFixed(1)}% of total) exceeds the maximum expected ratio of ${(LABOUR_RATIO_MAX * 100).toFixed(0)}%. Labour has been adjusted downward proportionally.`,
    actual_value: ratio,
    expected_value: `${(LABOUR_RATIO_MIN * 100).toFixed(0)}%–${(LABOUR_RATIO_MAX * 100).toFixed(0)}%`,
    severity: ratio < LABOUR_RATIO_MIN * 0.5 || ratio > LABOUR_RATIO_MAX * 1.5 ? "high" : "medium",
  };

  const adjustment: CostValidationAdjustment = {
    rule: "labour_ratio",
    description: `Labour adjusted from ${(ratio * 100).toFixed(1)}% to ${(newRatio * 100).toFixed(1)}% of total cost.`,
    field: "labour_cost_cents",
    original_value_cents: labourCents,
    adjusted_value_cents: newLabourCents,
    confidence_reduced: true,
    confidence_multiplier: LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION,
  };

  return {
    adjusted_labour_cents: newLabourCents,
    adjusted_total_cents: newTotalCents,
    ratio: newRatio,
    issue,
    adjustment,
  };
}

// ─── Rule 2: Parts Alignment Validation ──────────────────────────────────────

interface PartsRuleResult {
  adjusted_parts_cents: number;
  issue: CostValidationIssue | null;
  adjustment: CostValidationAdjustment | null;
}

function validatePartsAlignment(
  partsCents: number,
  componentCount: number,
  avgComponentCostCents: number
): PartsRuleResult {
  // If no component data, skip validation
  if (componentCount <= 0) {
    return { adjusted_parts_cents: partsCents, issue: null, adjustment: null };
  }

  const expectedPartsCents = componentCount * avgComponentCostCents;
  const toleranceCents = expectedPartsCents * PARTS_ALIGNMENT_TOLERANCE;
  const lowerBound = expectedPartsCents - toleranceCents;
  const upperBound = expectedPartsCents + toleranceCents;

  // Within tolerance — no action needed
  if (partsCents >= lowerBound && partsCents <= upperBound) {
    return { adjusted_parts_cents: partsCents, issue: null, adjustment: null };
  }

  // Adjust to the expected value (clamp to bounds)
  const adjustedPartsCents = roundCents(clamp(partsCents, lowerBound, upperBound));

  const variancePct = safeDiv(Math.abs(partsCents - expectedPartsCents), expectedPartsCents) * 100;

  const issue: CostValidationIssue = {
    rule: "parts_alignment",
    description:
      `Parts cost (${(partsCents / 100).toFixed(2)}) deviates ${variancePct.toFixed(1)}% from ` +
      `the expected value based on ${componentCount} component(s) × average cost ` +
      `(${(expectedPartsCents / 100).toFixed(2)}). Parts cost has been adjusted to the nearest bound.`,
    actual_value: partsCents,
    expected_value: `${(lowerBound / 100).toFixed(2)}–${(upperBound / 100).toFixed(2)}`,
    severity: variancePct > 100 ? "high" : "medium",
  };

  const adjustment: CostValidationAdjustment = {
    rule: "parts_alignment",
    description:
      `Parts cost adjusted from ${(partsCents / 100).toFixed(2)} to ${(adjustedPartsCents / 100).toFixed(2)} ` +
      `(expected: ${(expectedPartsCents / 100).toFixed(2)} for ${componentCount} component(s)).`,
    field: "parts_cost_cents",
    original_value_cents: partsCents,
    adjusted_value_cents: adjustedPartsCents,
    confidence_reduced: true,
    confidence_multiplier: PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION,
  };

  return { adjusted_parts_cents: adjustedPartsCents, issue, adjustment };
}

// ─── Rule 4: Severity ↔ Cost Cross-check ─────────────────────────────────────

interface SeverityRuleResult {
  consistent: boolean;
  issue: CostValidationIssue | null;
  confidence_multiplier: number;
}

function validateSeverityCost(
  totalCents: number,
  severity: AccidentSeverity | null
): SeverityRuleResult {
  if (!severity || severity === "none" || severity === "unknown" as any) {
    return { consistent: true, issue: null, confidence_multiplier: 1.0 };
  }

  const range = SEVERITY_COST_RANGES_CENTS[severity];
  if (!range) {
    return { consistent: true, issue: null, confidence_multiplier: 1.0 };
  }

  if (totalCents >= range.minCents && totalCents <= range.maxCents) {
    return { consistent: true, issue: null, confidence_multiplier: 1.0 };
  }

  const direction = totalCents < range.minCents ? "below" : "above";
  const issue: CostValidationIssue = {
    rule: "severity_cost_mismatch",
    description:
      `Total cost (${(totalCents / 100).toFixed(2)}) is ${direction} the expected range ` +
      `for ${severity} damage (${(range.minCents / 100).toFixed(2)}–${(range.maxCents / 100).toFixed(2)}). ` +
      `Cost is preserved; confidence has been reduced.`,
    actual_value: totalCents,
    expected_value: `${(range.minCents / 100).toFixed(2)}–${(range.maxCents / 100).toFixed(2)}`,
    severity: "medium",
  };

  return {
    consistent: false,
    issue,
    confidence_multiplier: SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION,
  };
}

// ─── Main Validator ───────────────────────────────────────────────────────────

/**
 * Validates and, where necessary, adjusts the cost breakdown from Stage 9.
 *
 * @param costOutput       Stage 9 output (cost estimation)
 * @param componentCount   Number of damaged components from Stage 6
 * @param overallSeverity  Overall accident severity from Stage 6 or Stage 7
 * @param avgComponentCostCents  Optional override for average component cost
 * @returns                CostRealismResult with validated breakdown and contract fields
 */
export function validateCostRealism(
  costOutput: Stage9Output | null | undefined,
  componentCount: number = 0,
  overallSeverity: AccidentSeverity | null = null,
  avgComponentCostCents: number = DEFAULT_AVG_COMPONENT_COST_CENTS
): CostRealismResult {
  // ── Defensive fallback ───────────────────────────────────────────────────
  if (!costOutput) {
    return {
      validated_cost: false,
      adjustments_applied: false,
      validated_breakdown: {
        parts_cost_cents: 0,
        labour_cost_cents: 0,
        paint_cost_cents: 0,
        hidden_damage_cost_cents: 0,
        total_cents: 0,
      },
      labour_ratio: 0,
      confidence_multiplier: 1.0,
      issues: [],
      adjustments: [],
      severity_cost_consistent: true,
      severity_used: null,
      summary: "Cost realism validation skipped — no cost data available.",
    };
  }

  // ── Extract working values ───────────────────────────────────────────────
  const breakdown = costOutput.breakdown ?? {
    partsCostCents: 0,
    labourCostCents: 0,
    paintCostCents: 0,
    hiddenDamageCostCents: 0,
    totalCents: 0,
  };

  let partsCents = Math.max(0, breakdown.partsCostCents ?? 0);
  let labourCents = Math.max(0, breakdown.labourCostCents ?? 0);
  const paintCents = Math.max(0, breakdown.paintCostCents ?? 0);
  const hiddenDamageCents = Math.max(0, breakdown.hiddenDamageCostCents ?? 0);

  // Recompute total from components (do not trust the stored total)
  let totalCents = partsCents + labourCents + paintCents + hiddenDamageCents;

  // If total is 0, nothing to validate
  if (totalCents === 0) {
    return {
      validated_cost: false,
      adjustments_applied: false,
      validated_breakdown: {
        parts_cost_cents: 0,
        labour_cost_cents: 0,
        paint_cost_cents: 0,
        hidden_damage_cost_cents: 0,
        total_cents: 0,
      },
      labour_ratio: 0,
      confidence_multiplier: 1.0,
      issues: [],
      adjustments: [],
      severity_cost_consistent: true,
      severity_used: overallSeverity,
      summary: "Cost realism validation skipped — zero cost breakdown.",
    };
  }

  const issues: CostValidationIssue[] = [];
  const adjustments: CostValidationAdjustment[] = [];
  let confidenceMultiplier = 1.0;

  // ── Rule 2: Parts alignment ──────────────────────────────────────────────
  // Run before labour ratio so the total is correct before ratio check
  const partsResult = validatePartsAlignment(partsCents, componentCount, avgComponentCostCents);
  if (partsResult.issue) {
    issues.push(partsResult.issue);
    adjustments.push(partsResult.adjustment!);
    confidenceMultiplier *= partsResult.adjustment!.confidence_multiplier;
    partsCents = partsResult.adjusted_parts_cents;
    // Recompute total after parts adjustment
    totalCents = partsCents + labourCents + paintCents + hiddenDamageCents;
  }

  // ── Rule 1: Labour ratio ─────────────────────────────────────────────────
  const labourResult = validateLabourRatio(labourCents, totalCents);
  if (labourResult.issue) {
    issues.push(labourResult.issue);
    adjustments.push(labourResult.adjustment!);
    confidenceMultiplier *= labourResult.adjustment!.confidence_multiplier;
    labourCents = labourResult.adjusted_labour_cents;
    totalCents = labourResult.adjusted_total_cents;
  }

  // ── Rule 3: Recompute total proportionally ───────────────────────────────
  // After all adjustments, recompute total as the sum of all components
  const finalTotal = roundCents(partsCents + labourCents + paintCents + hiddenDamageCents);
  const finalLabourRatio = safeDiv(labourCents, finalTotal);

  // ── Rule 4: Severity ↔ cost cross-check ─────────────────────────────────
  const severityResult = validateSeverityCost(finalTotal, overallSeverity);
  if (severityResult.issue) {
    issues.push(severityResult.issue);
    confidenceMultiplier *= severityResult.confidence_multiplier;
  }

  // ── Build summary ────────────────────────────────────────────────────────
  const adjustmentsApplied = adjustments.length > 0;
  const allRulesPassed = issues.length === 0;

  let summary: string;
  if (allRulesPassed) {
    summary = `Cost breakdown validated. Labour ratio: ${(finalLabourRatio * 100).toFixed(1)}%. All checks passed.`;
  } else {
    const ruleNames = Array.from(new Set(issues.map((i) => i.rule))).join(", ");
    summary =
      `${issues.length} issue(s) detected (${ruleNames}). ` +
      (adjustmentsApplied
        ? `${adjustments.length} adjustment(s) applied. `
        : "") +
      `Confidence multiplier: ×${confidenceMultiplier.toFixed(2)}.`;
  }

  return {
    validated_cost: allRulesPassed || adjustmentsApplied,
    adjustments_applied: adjustmentsApplied,
    validated_breakdown: {
      parts_cost_cents: partsCents,
      labour_cost_cents: labourCents,
      paint_cost_cents: paintCents,
      hidden_damage_cost_cents: hiddenDamageCents,
      total_cents: finalTotal,
    },
    labour_ratio: finalLabourRatio,
    confidence_multiplier: confidenceMultiplier,
    issues,
    adjustments,
    severity_cost_consistent: severityResult.consistent,
    severity_used: overallSeverity,
    summary,
  };
}

// ─── Stage 9 Output Merger ────────────────────────────────────────────────────

/**
 * Merges the CostRealismResult back into the Stage9Output, replacing the
 * breakdown with the validated values and appending the validation metadata.
 *
 * Returns a new Stage9Output object — the original is not mutated.
 */
export function mergeValidatedCost(
  original: Stage9Output,
  validation: CostRealismResult
): Stage9Output & {
  costValidation: {
    validated_cost: boolean;
    adjustments_applied: boolean;
    confidence_multiplier: number;
    severity_cost_consistent: boolean;
    issues_count: number;
    adjustments_count: number;
    summary: string;
  };
} {
  const vb = validation.validated_breakdown;

  return {
    ...original,
    expectedRepairCostCents: vb.total_cents || original.expectedRepairCostCents,
    breakdown: {
      partsCostCents: vb.parts_cost_cents,
      labourCostCents: vb.labour_cost_cents,
      paintCostCents: vb.paint_cost_cents,
      hiddenDamageCostCents: vb.hidden_damage_cost_cents,
      totalCents: vb.total_cents,
    },
    recommendedCostRange: {
      lowCents: roundCents(vb.total_cents * 0.8),
      highCents: roundCents(vb.total_cents * 1.2),
    },
    costValidation: {
      validated_cost: validation.validated_cost,
      adjustments_applied: validation.adjustments_applied,
      confidence_multiplier: validation.confidence_multiplier,
      severity_cost_consistent: validation.severity_cost_consistent,
      issues_count: validation.issues.length,
      adjustments_count: validation.adjustments.length,
      summary: validation.summary,
    },
  };
}
