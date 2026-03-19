/**
 * enrichmentGate.ts
 *
 * Controls whether LLM narrative enrichment should run for a given mismatch,
 * preventing unnecessary version churn and LLM cost when the current narrative
 * is already high-quality.
 *
 * Gate conditions (OR logic — enrichment runs if EITHER is true):
 *
 *   Condition 1 — Source is "template"
 *     The current active narrative was produced by the deterministic template
 *     engine and has never been enriched by the LLM. Enrichment is always
 *     worthwhile in this case.
 *
 *   Condition 2 — Negative feedback rate > 0.20
 *     More than 20% of adjuster annotations for this mismatch type are
 *     "dismiss" actions, indicating the current narrative is not meeting
 *     adjuster expectations. Re-enrichment may produce a better result.
 *
 * If NEITHER condition is true:
 *   → SKIP enrichment (return { shouldEnrich: false })
 *
 * "Negative feedback" is defined as adjuster annotations with action = "dismiss".
 * The rate is computed as:  dismissed / (confirmed + dismissed)
 * A minimum sample size of 5 annotations is required before the rate is
 * considered reliable. Below that threshold, the rate is treated as 0.0
 * (insufficient evidence → do not trigger enrichment on feedback alone).
 *
 * Output shape:
 *   {
 *     shouldEnrich: boolean,
 *     reason: "source_is_template" | "high_negative_feedback_rate" | "skip",
 *     negative_feedback_rate: number,   // 0.0–1.0, 0.0 if insufficient sample
 *     current_source: string,
 *   }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnrichmentGateReason =
  | "source_is_template"
  | "high_negative_feedback_rate"
  | "skip";

export interface EnrichmentGateInput {
  /**
   * The `source` field of the current active narrative version row.
   * Typically "template", "llm_background", or "manual".
   */
  currentVersionSource: string;

  /**
   * Total number of "confirm" annotations for this mismatch type
   * across all claims (global signal).
   */
  confirmedCount: number;

  /**
   * Total number of "dismiss" annotations for this mismatch type
   * across all claims (global signal).
   */
  dismissedCount: number;
}

export interface EnrichmentGateOutput {
  /** Whether LLM enrichment should proceed */
  shouldEnrich: boolean;
  /** The primary reason for the decision */
  reason: EnrichmentGateReason;
  /** Computed negative feedback rate in [0.0, 1.0] */
  negative_feedback_rate: number;
  /** The source value that was evaluated */
  current_source: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum total annotations before feedback rate is considered reliable */
export const MIN_FEEDBACK_SAMPLE = 5;

/** Negative feedback rate threshold above which enrichment is triggered */
export const NEGATIVE_FEEDBACK_THRESHOLD = 0.20;

// ─── Feedback rate computation ────────────────────────────────────────────────

/**
 * Computes the negative feedback rate from confirmed and dismissed counts.
 *
 * Returns 0.0 when the total sample is below MIN_FEEDBACK_SAMPLE to avoid
 * triggering enrichment on noisy low-volume data.
 *
 * @param confirmedCount  Number of "confirm" annotations
 * @param dismissedCount  Number of "dismiss" annotations
 * @returns               Rate in [0.0, 1.0]
 */
export function computeNegativeFeedbackRate(
  confirmedCount: number,
  dismissedCount: number,
): number {
  const total = confirmedCount + dismissedCount;
  if (total < MIN_FEEDBACK_SAMPLE) return 0.0;
  return parseFloat((dismissedCount / total).toFixed(4));
}

// ─── Gate function ────────────────────────────────────────────────────────────

/**
 * Evaluates whether LLM enrichment should run for the given mismatch context.
 *
 * @param input  Current version source and annotation counts
 * @returns      Gate decision with reason and computed feedback rate
 */
export function evaluateEnrichmentGate(input: EnrichmentGateInput): EnrichmentGateOutput {
  const { currentVersionSource, confirmedCount, dismissedCount } = input;

  const negative_feedback_rate = computeNegativeFeedbackRate(confirmedCount, dismissedCount);

  // Condition 1: current narrative was template-generated
  if (currentVersionSource === "template") {
    return {
      shouldEnrich: true,
      reason: "source_is_template",
      negative_feedback_rate,
      current_source: currentVersionSource,
    };
  }

  // Condition 2: negative feedback rate exceeds threshold
  if (negative_feedback_rate > NEGATIVE_FEEDBACK_THRESHOLD) {
    return {
      shouldEnrich: true,
      reason: "high_negative_feedback_rate",
      negative_feedback_rate,
      current_source: currentVersionSource,
    };
  }

  // Neither condition met — skip enrichment
  return {
    shouldEnrich: false,
    reason: "skip",
    negative_feedback_rate,
    current_source: currentVersionSource,
  };
}
