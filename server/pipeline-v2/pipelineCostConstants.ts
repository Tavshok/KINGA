/**
 * pipelineCostConstants.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared cost-related thresholds used across the KINGA pipeline.
 *
 * IMPORTANT: All adjuster-facing write-off and cost-tier decisions must import
 * from this file rather than hardcoding thresholds inline. This ensures that
 * a single policy change propagates consistently to the decision panel,
 * the cost intelligence narrative, and the learning database.
 *
 * Threshold hierarchy:
 *   WRITE_OFF_WARNING_THRESHOLD (0.65) — assessor/reviewer warning only.
 *   WRITE_OFF_RECOMMENDATION_THRESHOLD (0.70) — KINGA human-overridable recommendation threshold.
 *     Used by: claimTruthLayer (decision panel), costIntelligenceNarrative (narrative text).
 *     Meaning: complete KINGA Optimised Quote ≥ 70% of verified market value →
 *     economic write-off recommendation. This does not create settlement authority.
 *
 *   COST_TIER_TOTAL_LOSS_THRESHOLD (0.75) — learning DB cost tier classification only.
 *     Used by: caseSignatureGenerator (inferCostTier).
 *     Meaning: repair cost ≥ 75% of market value → cost tier = "total_loss" for benchmarking.
 *     This is intentionally higher than WRITE_OFF_RECOMMENDATION_THRESHOLD because the learning DB
 *     uses a stricter threshold to avoid classifying borderline cases as total-loss benchmarks.
 *     It is NOT an adjuster-facing decision threshold.
 *
 * User-confirmed policy: 65% surfaces a warning and 70% permits a recommendation.
 * The 0.75 learning cost-tier threshold remains classification-only.
 */

import {
  WRITE_OFF_RECOMMENDATION_THRESHOLD as SHARED_WRITE_OFF_RECOMMENDATION_THRESHOLD,
  WRITE_OFF_WARNING_THRESHOLD as SHARED_WRITE_OFF_WARNING_THRESHOLD,
  classifyRepairToValueRatio,
  type WriteOffPolicyBand,
} from "../../shared/writeOffPolicy";

/** 65% — early warning for assessor/reviewer attention; never a recommendation. */
export const WRITE_OFF_WARNING_THRESHOLD = SHARED_WRITE_OFF_WARNING_THRESHOLD;
/** 70% — human-overridable KINGA economic write-off recommendation. */
export const WRITE_OFF_RECOMMENDATION_THRESHOLD = SHARED_WRITE_OFF_RECOMMENDATION_THRESHOLD;
/** @deprecated Use WRITE_OFF_RECOMMENDATION_THRESHOLD. */
export const ECONOMIC_WRITE_OFF_THRESHOLD = WRITE_OFF_RECOMMENDATION_THRESHOLD;
export { classifyRepairToValueRatio, type WriteOffPolicyBand };

/**
 * Repair-to-value ratio at which a claim is classified as "total_loss" cost tier
 * in the learning database case signature. This is intentionally higher than
 * WRITE_OFF_RECOMMENDATION_THRESHOLD to avoid polluting the total_loss benchmark pool
 * with borderline economic write-off cases.
 * Applies to: caseSignatureGenerator.inferCostTier only.
 */
export const COST_TIER_TOTAL_LOSS_THRESHOLD = 0.75; // 75% — learning DB classification only

/**
 * Repair-to-value ratio above which the cost narrative flags the claim as elevated
 * but not yet at write-off level. Used for the intermediate narrative tier.
 * Applies to: costIntelligenceNarrative.repairToValueComment only.
 */
export const RTV_ELEVATED_THRESHOLD = 0.50; // 50% — elevated, insurer should confirm market value
