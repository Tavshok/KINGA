/**
 * consistencyConfidence.ts
 *
 * Computes a calibrated confidence score for a damage consistency check result
 * by combining three independent signals, then applying four post-scoring rules:
 *
 *   Signal A — Historical Confirmation Rate  (weight: 0.40)
 *   Signal B — Data Completeness             (weight: 0.35)
 *   Signal C — Mismatch Frequency            (weight: 0.25)
 *
 * Post-scoring rules (Stage 30):
 *   Rule 1 — Conflict penalty:  if high_severity_mismatches >= 2 → score *= 0.85
 *   Rule 2 — Clamp:             score clamped to [0.10, 0.95]
 *   Rule 3 — Band remap:        >= 0.80 → HIGH | 0.60–0.79 → MEDIUM | < 0.60 → LOW
 *   Rule 4 — Coherence:         HIGH cannot coexist with severe_mismatch=true OR
 *                                physics_available=false → downgrade to MEDIUM
 */

import type { MismatchType } from "./damageConsistency";
import type { MismatchTypeStats } from "./mismatchAnnotation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfidenceInput {
  /**
   * Mismatch types detected in the current consistency check.
   * Used to look up historical confirmation rates.
   */
  detectedMismatchTypes: MismatchType[];

  /**
   * Number of mismatches found (total, not unique types).
   * Used for the mismatch-frequency signal.
   */
  mismatchCount: number;

  /**
   * Which of the three input sources are available for this check.
   */
  sourcesAvailable: {
    document: boolean;
    photos: boolean;
    physics: boolean;
  };

  /**
   * Per-type annotation statistics from the adaptive weight engine.
   * When provided, Signal A uses the actual historical confirmation rates.
   * When omitted or empty, Signal A falls back to the neutral value (0.5).
   */
  annotationStats?: MismatchTypeStats[];

  // ── Stage 30 additions ────────────────────────────────────────────────────

  /**
   * Number of high-severity mismatches in the current check.
   * Used for Rule 1 (conflict penalty).
   * Defaults to 0 if omitted.
   */
  highSeverityMismatchCount?: number;

  /**
   * Whether any mismatch in this check is classified as "severe".
   * Used for Rule 4 (coherence enforcement).
   * Defaults to false if omitted.
   */
  hasSevereMismatch?: boolean;
}

export interface ConfidenceOutput {
  /** Categorical band derived from confidence_score (after all post-scoring rules) */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Final score in [0.10, 0.95], rounded to 2 decimal places */
  confidence_score: number;
  /** Breakdown of each signal's contribution for audit/display */
  breakdown: {
    signal_a_confirmation_rate: number;   // 0.0–1.0
    signal_b_data_completeness: number;   // 0.0–1.0
    signal_c_mismatch_frequency: number;  // 0.0–1.0
    weight_a: number;
    weight_b: number;
    weight_c: number;
    /** Stage 30: raw composite score before post-scoring rules */
    raw_composite_score: number;
    /** Stage 30: score after conflict penalty (before clamp) */
    post_penalty_score: number;
    /** Stage 30: whether the conflict penalty was applied */
    conflict_penalty_applied: boolean;
    /** Stage 30: whether the coherence rule downgraded the band */
    coherence_downgrade_applied: boolean;
    /** Stage 30: reason for coherence downgrade, if any */
    coherence_downgrade_reason?: string;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Weights must sum to 1.0 */
export const WEIGHT_A = 0.40;  // historical confirmation rate
export const WEIGHT_B = 0.35;  // data completeness
export const WEIGHT_C = 0.25;  // mismatch frequency (inverse)

/** Stage 30 band thresholds (updated from Stage 24) */
export const THRESHOLD_HIGH   = 0.80;  // was 0.70
export const THRESHOLD_MEDIUM = 0.60;  // was 0.45

/** Stage 30 clamp boundaries */
export const CLAMP_MIN = 0.10;
export const CLAMP_MAX = 0.95;

/** Stage 30 conflict penalty multiplier (applied when high_severity >= 2) */
export const CONFLICT_PENALTY_MULTIPLIER = 0.85;
export const CONFLICT_PENALTY_THRESHOLD  = 2;

/**
 * Fallback confirmation rate used when no annotation data is available
 * for a given mismatch type. 0.5 represents maximum uncertainty.
 */
const DEFAULT_CONFIRMATION_RATE = 0.5;

/**
 * Maximum number of mismatches above which Signal C reaches its floor (0.0).
 */
export const MAX_MISMATCHES_FOR_FLOOR = 8;

// ─── Signal A: Historical Confirmation Rate ───────────────────────────────────

/**
 * Computes Signal A from the historical confirmation rates of the mismatch
 * types detected in this check.
 */
export function computeSignalA(
  detectedTypes: MismatchType[],
  annotationStats: MismatchTypeStats[] = [],
): number {
  if (detectedTypes.length === 0) {
    return 1.0;
  }

  const rateByType = new Map<string, number>();
  for (const stat of annotationStats) {
    if (stat.system_adjustment.sample_size_sufficient) {
      rateByType.set(stat.mismatch_type, stat.confirmation_rate);
    }
  }

  const rates = detectedTypes.map(
    (type) => rateByType.get(type) ?? DEFAULT_CONFIRMATION_RATE,
  );

  const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  return parseFloat(Math.min(1.0, Math.max(0.0, avg)).toFixed(4));
}

// ─── Signal B: Data Completeness ─────────────────────────────────────────────

/**
 * Computes Signal B from the number of input sources available.
 */
export function computeSignalB(sourcesAvailable: {
  document: boolean;
  photos: boolean;
  physics: boolean;
}): number {
  const count =
    (sourcesAvailable.document ? 1 : 0) +
    (sourcesAvailable.photos ? 1 : 0) +
    (sourcesAvailable.physics ? 1 : 0);

  return parseFloat((count / 3).toFixed(4));
}

// ─── Signal C: Mismatch Frequency ────────────────────────────────────────────

/**
 * Computes Signal C as the inverse of mismatch count, normalised to [0.0, 1.0].
 */
export function computeSignalC(mismatchCount: number): number {
  const clamped = Math.min(mismatchCount, MAX_MISMATCHES_FOR_FLOOR);
  return parseFloat((1 - clamped / MAX_MISMATCHES_FOR_FLOOR).toFixed(4));
}

// ─── Stage 30: Band classification (updated thresholds) ──────────────────────

/**
 * Maps a composite score to a confidence band using the Stage 30 thresholds.
 *
 * >= 0.80 → HIGH
 * 0.60–0.79 → MEDIUM
 * < 0.60 → LOW
 */
export function scoreToConfidenceBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= THRESHOLD_HIGH)   return "HIGH";
  if (score >= THRESHOLD_MEDIUM) return "MEDIUM";
  return "LOW";
}

// ─── Stage 30: Post-scoring rules ────────────────────────────────────────────

/**
 * Rule 1 — Conflict penalty.
 * If high_severity_mismatches >= 2, multiply score by 0.85.
 */
export function applyConflictPenalty(
  score: number,
  highSeverityMismatchCount: number,
): { score: number; applied: boolean } {
  if (highSeverityMismatchCount >= CONFLICT_PENALTY_THRESHOLD) {
    return { score: score * CONFLICT_PENALTY_MULTIPLIER, applied: true };
  }
  return { score, applied: false };
}

/**
 * Rule 2 — Clamp.
 * Clamp score to [CLAMP_MIN, CLAMP_MAX].
 */
export function clampConfidenceScore(score: number): number {
  return Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, score));
}

/**
 * Rule 4 — Coherence enforcement.
 * HIGH confidence cannot coexist with:
 *   - hasSevereMismatch = true
 *   - physics_available = false
 * If either condition is true, downgrade to MEDIUM.
 */
export function enforceCoherence(
  band: "HIGH" | "MEDIUM" | "LOW",
  hasSevereMismatch: boolean,
  physicsAvailable: boolean,
): { band: "HIGH" | "MEDIUM" | "LOW"; downgraded: boolean; reason?: string } {
  if (band !== "HIGH") {
    return { band, downgraded: false };
  }

  if (hasSevereMismatch && !physicsAvailable) {
    return {
      band: "MEDIUM",
      downgraded: true,
      reason: "HIGH downgraded: severe mismatch present and physics data unavailable",
    };
  }
  if (hasSevereMismatch) {
    return {
      band: "MEDIUM",
      downgraded: true,
      reason: "HIGH downgraded: severe mismatch present",
    };
  }
  if (!physicsAvailable) {
    return {
      band: "MEDIUM",
      downgraded: true,
      reason: "HIGH downgraded: physics data unavailable",
    };
  }

  return { band, downgraded: false };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Computes the full confidence output for a consistency check result,
 * including all four Stage 30 post-scoring rules.
 */
export function computeConsistencyConfidence(input: ConfidenceInput): ConfidenceOutput {
  // ── Three-signal composite ────────────────────────────────────────────────
  const signalA = computeSignalA(
    input.detectedMismatchTypes,
    input.annotationStats ?? [],
  );
  const signalB = computeSignalB(input.sourcesAvailable);
  const signalC = computeSignalC(input.mismatchCount);

  const rawComposite = WEIGHT_A * signalA + WEIGHT_B * signalB + WEIGHT_C * signalC;

  // ── Rule 1: Conflict penalty ──────────────────────────────────────────────
  const highSeverityCount = input.highSeverityMismatchCount ?? 0;
  const { score: postPenaltyScore, applied: conflictPenaltyApplied } =
    applyConflictPenalty(rawComposite, highSeverityCount);

  // ── Rule 2: Clamp ─────────────────────────────────────────────────────────
  const clampedScore = clampConfidenceScore(postPenaltyScore);

  // Round to 2 decimal places
  const confidence_score = parseFloat(clampedScore.toFixed(2));

  // ── Rule 3: Band remap ────────────────────────────────────────────────────
  const rawBand = scoreToConfidenceBand(confidence_score);

  // ── Rule 4: Coherence enforcement ────────────────────────────────────────
  const physicsAvailable = input.sourcesAvailable.physics;
  const hasSevereMismatch = input.hasSevereMismatch ?? false;
  const { band: finalBand, downgraded, reason: downgradeReason } = enforceCoherence(
    rawBand,
    hasSevereMismatch,
    physicsAvailable,
  );

  return {
    confidence: finalBand,
    confidence_score,
    breakdown: {
      signal_a_confirmation_rate: signalA,
      signal_b_data_completeness: signalB,
      signal_c_mismatch_frequency: signalC,
      weight_a: WEIGHT_A,
      weight_b: WEIGHT_B,
      weight_c: WEIGHT_C,
      raw_composite_score: parseFloat(rawComposite.toFixed(4)),
      post_penalty_score: parseFloat(postPenaltyScore.toFixed(4)),
      conflict_penalty_applied: conflictPenaltyApplied,
      coherence_downgrade_applied: downgraded,
      coherence_downgrade_reason: downgradeReason,
    },
  };
}
