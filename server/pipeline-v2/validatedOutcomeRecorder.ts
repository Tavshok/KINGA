/**
 * pipeline-v2/validatedOutcomeRecorder.ts
 *
 * VALIDATED OUTCOME RECORDER
 * Phase 3 — Learning and Calibration Engine
 *
 * Decides whether a processed claim result should be stored for model learning.
 * This is the quality gate for the learning pipeline — only high-signal outcomes
 * are admitted to the calibration dataset.
 *
 * INPUT:
 *   - costDecision.true_cost_usd     (validated cost in USD)
 *   - costDecision.confidence        (0–100 decision confidence)
 *   - decision.recommendation        (claim decision from Stage 10)
 *   - assessor_present               (true = assessor reviewed this claim)
 *
 * OUTPUT:
 *   {
 *     "store": true/false,
 *     "reason": "",
 *     "quality_tier": "HIGH | MEDIUM | LOW"
 *   }
 *
 * ADMISSION RULES:
 *   1. assessor_validated  → ALWAYS store (HIGH tier)
 *      - Assessor has reviewed and confirmed the outcome
 *      - Highest signal quality — ground truth for calibration
 *
 *   2. system_optimised AND confidence ≥ 60 → store (MEDIUM tier)
 *      - AI pipeline produced a confident outcome without assessor
 *      - Useful for pattern learning but weighted less than validated
 *
 *   3. All other cases → do NOT store
 *      - Low confidence, missing cost, or invalid recommendation
 *      - Storing these would pollute the calibration dataset
 *
 * DESIGN PRINCIPLES:
 *   - Pure function — no side effects, no DB calls
 *   - Explicit rejection reasons for audit trails
 *   - Recommendation-aware: some decisions carry implicit quality signals
 *   - Null-safe: handles missing/undefined inputs gracefully
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum confidence for system_optimised records to be admitted */
const SYSTEM_OPTIMISED_MIN_CONFIDENCE = 60;

/**
 * Recommendations that carry a valid learning signal.
 * DECLINED claims with no cost are not useful for cost learning.
 * PENDING claims are incomplete — outcome not yet known.
 */
const VALID_LEARNING_RECOMMENDATIONS = new Set([
  "approve",
  "approve_with_conditions",
  "manual_review",
  "partial_approval",
  "settle",
  "total_loss",
]);

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type QualityTier = "HIGH" | "MEDIUM" | "LOW";

export interface CostDecisionInput {
  /** Validated true cost in USD from costDecisionEngine */
  true_cost_usd: number | null | undefined;
  /** Decision confidence 0–100 from costDecisionEngine */
  confidence: number | null | undefined;
}

export interface DecisionInput {
  /** Final claim recommendation from Stage 10 */
  recommendation: string | null | undefined;
}

export interface ValidatedOutcomeInput {
  /** Cost decision output from Stage 9/10 */
  costDecision: CostDecisionInput;
  /** Claim decision output from Stage 10 */
  decision: DecisionInput;
  /**
   * Whether an assessor has reviewed and validated this claim.
   * true  → assessor_validated (HIGH tier)
   * false → system_optimised (MEDIUM if confidence ≥ 60, else rejected)
   */
  assessor_present: boolean;
}

export interface ValidatedOutcomeResult {
  /** Whether this outcome should be stored for learning */
  store: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Quality tier — only set when store = true */
  quality_tier: QualityTier;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve confidence to a clamped 0–100 integer.
 * Returns null if the value is missing or invalid.
 */
function resolveConfidence(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || isNaN(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Resolve true_cost_usd to a positive number.
 * Returns null if missing, zero, or negative.
 */
function resolveTrueCost(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || isNaN(raw)) return null;
  if (raw <= 0) return null;
  return raw;
}

/**
 * Normalise a recommendation string to lowercase trimmed form.
 */
function normaliseRecommendation(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  return raw.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Check if a recommendation carries a valid learning signal.
 */
function isValidRecommendation(recommendation: string | null): boolean {
  if (!recommendation) return false;
  return VALID_LEARNING_RECOMMENDATIONS.has(recommendation);
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function reject(reason: string): ValidatedOutcomeResult {
  return { store: false, reason, quality_tier: "LOW" };
}

function admit(quality_tier: QualityTier, reason: string): ValidatedOutcomeResult {
  return { store: true, reason, quality_tier };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether a processed claim outcome should be stored for learning.
 *
 * This is a pure function — it has no side effects and does not write to the
 * database. The caller is responsible for persisting the outcome when
 * result.store === true.
 *
 * @param input  The validated outcome inputs
 * @returns      A decision with store flag, reason, and quality tier
 */
export function recordValidatedOutcome(
  input: ValidatedOutcomeInput
): ValidatedOutcomeResult {
  const { costDecision, decision, assessor_present } = input;

  // ── 1. Resolve and validate inputs ─────────────────────────────────────────
  const trueCostUsd = resolveTrueCost(costDecision?.true_cost_usd);
  const confidence = resolveConfidence(costDecision?.confidence);
  const recommendation = normaliseRecommendation(decision?.recommendation);

  // ── 2. Validate true_cost_usd is present ───────────────────────────────────
  if (trueCostUsd === null) {
    return reject(
      "No validated cost available (true_cost_usd is null, zero, or negative). " +
      "Claim outcome cannot be stored without a confirmed cost figure."
    );
  }

  // ── 3. Validate recommendation carries a learning signal ───────────────────
  if (!isValidRecommendation(recommendation)) {
    const recDisplay = recommendation ?? "null";
    return reject(
      `Recommendation "${recDisplay}" does not carry a valid learning signal. ` +
      "Only approved, settled, or manual-review outcomes are stored."
    );
  }

  // ── 4. RULE 1: Assessor-validated → HIGH tier, always store ────────────────
  if (assessor_present === true) {
    return admit(
      "HIGH",
      `Assessor-validated outcome stored at HIGH quality tier. ` +
      `Cost: $${trueCostUsd.toFixed(2)} USD. Recommendation: ${recommendation}. ` +
      "Assessor confirmation provides ground-truth signal for calibration."
    );
  }

  // ── 5. RULE 2: System-optimised with sufficient confidence → MEDIUM tier ───
  if (confidence !== null && confidence >= SYSTEM_OPTIMISED_MIN_CONFIDENCE) {
    return admit(
      "MEDIUM",
      `System-optimised outcome stored at MEDIUM quality tier. ` +
      `Confidence: ${confidence}/100 (≥${SYSTEM_OPTIMISED_MIN_CONFIDENCE} threshold met). ` +
      `Cost: $${trueCostUsd.toFixed(2)} USD. Recommendation: ${recommendation}.`
    );
  }

  // ── 6. RULE 3: System-optimised but confidence too low → reject ─────────────
  if (confidence !== null && confidence < SYSTEM_OPTIMISED_MIN_CONFIDENCE) {
    return reject(
      `System-optimised outcome rejected: confidence ${confidence}/100 is below ` +
      `the minimum threshold of ${SYSTEM_OPTIMISED_MIN_CONFIDENCE}. ` +
      "Low-confidence outcomes are not stored to protect calibration data quality."
    );
  }

  // ── 7. Confidence not available → reject ───────────────────────────────────
  return reject(
    "Confidence score is missing or invalid. Cannot determine if this system-optimised " +
    "outcome meets the minimum quality threshold for storage."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchOutcomeResult {
  /** Index in the input array */
  index: number;
  /** Claim ID if provided */
  claim_id?: string | number;
  /** The recorder decision */
  result: ValidatedOutcomeResult;
}

export interface BatchOutcomeSummary {
  /** Total claims evaluated */
  total: number;
  /** Claims admitted for storage */
  admitted: number;
  /** Claims rejected */
  rejected: number;
  /** HIGH tier count */
  high_tier: number;
  /** MEDIUM tier count */
  medium_tier: number;
  /** Per-claim results */
  results: BatchOutcomeResult[];
}

/**
 * Evaluate a batch of claim outcomes and return admission decisions.
 * Useful for bulk post-processing of historical claims.
 */
export function evaluateBatchOutcomes(
  inputs: Array<ValidatedOutcomeInput & { claim_id?: string | number }>
): BatchOutcomeSummary {
  const results: BatchOutcomeResult[] = inputs.map((input, index) => ({
    index,
    claim_id: input.claim_id,
    result: recordValidatedOutcome(input),
  }));

  const admitted = results.filter(r => r.result.store);
  const highTier = admitted.filter(r => r.result.quality_tier === "HIGH");
  const mediumTier = admitted.filter(r => r.result.quality_tier === "MEDIUM");

  return {
    total: inputs.length,
    admitted: admitted.length,
    rejected: inputs.length - admitted.length,
    high_tier: highTier.length,
    medium_tier: mediumTier.length,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Build input from pipeline Stage 9/10 outputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a ValidatedOutcomeInput from pipeline Stage 9 and Stage 10 outputs.
 * This is the standard adapter used by the orchestrator.
 */
export function buildValidatedOutcomeInput(params: {
  trueCostUsd: number | null | undefined;
  decisionConfidence: number | null | undefined;
  recommendation: string | null | undefined;
  assessorPresent: boolean;
}): ValidatedOutcomeInput {
  return {
    costDecision: {
      true_cost_usd: params.trueCostUsd,
      confidence: params.decisionConfidence,
    },
    decision: {
      recommendation: params.recommendation,
    },
    assessor_present: params.assessorPresent,
  };
}
