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
 *   ECONOMIC_WRITE_OFF_THRESHOLD (0.70) — KINGA economic write-off recommendation threshold.
 *     Used by: claimTruthLayer (decision panel), costIntelligenceNarrative (narrative text).
 *     Meaning: complete KINGA Optimised Quote ≥ 70% of verified market value →
 *     economic write-off recommendation. This does not create settlement authority.
 *
 *   COST_TIER_TOTAL_LOSS_THRESHOLD (0.75) — learning DB cost tier classification only.
 *     Used by: caseSignatureGenerator (inferCostTier).
 *     Meaning: repair cost ≥ 75% of market value → cost tier = "total_loss" for benchmarking.
 *     This is intentionally higher than ECONOMIC_WRITE_OFF_THRESHOLD because the learning DB
 *     uses a stricter threshold to avoid classifying borderline cases as total-loss benchmarks.
 *     It is NOT an adjuster-facing decision threshold.
 *
 * User-confirmed policy: all economic write-off recommendation paths use 0.70.
 * The 0.75 learning cost-tier threshold remains classification-only.
 */

/**
 * Repair-to-value ratio at which a vehicle is considered an economic write-off.
 * This is the single source of truth for adjuster-facing write-off decisions.
 * Applies to: decision panel (claimTruthLayer) and cost narrative text (costIntelligenceNarrative).
 */
export const ECONOMIC_WRITE_OFF_THRESHOLD = 0.7; // 70% — KINGA recommendation threshold

/**
 * Repair-to-value ratio at which a claim is classified as "total_loss" cost tier
 * in the learning database case signature. This is intentionally higher than
 * ECONOMIC_WRITE_OFF_THRESHOLD to avoid polluting the total_loss benchmark pool
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
