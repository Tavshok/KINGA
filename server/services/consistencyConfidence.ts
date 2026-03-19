/**
 * consistencyConfidence.ts
 *
 * Computes a calibrated confidence score for a damage consistency check result
 * by combining three independent signals:
 *
 *   Signal A — Historical Confirmation Rate  (weight: 0.40)
 *     How often adjusters have confirmed mismatches of the types found in this
 *     check. A high confirmation rate means the engine's detections are reliable.
 *
 *   Signal B — Data Completeness             (weight: 0.35)
 *     How many of the three input sources (document, photos, physics) are
 *     available. Missing sources reduce confidence regardless of score.
 *
 *   Signal C — Mismatch Frequency            (weight: 0.25)
 *     Inverse of the number of mismatches found. More mismatches = more
 *     uncertainty about the true damage picture.
 *
 * Final confidence_score = Σ(signal × weight), clamped to [0.00, 1.00].
 * Band thresholds:
 *   HIGH   ≥ 0.70
 *   MEDIUM ≥ 0.45
 *   LOW    <  0.45
 *
 * The output shape matches the requested contract:
 *   { confidence: "HIGH" | "MEDIUM" | "LOW", confidence_score: number }
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
}

export interface ConfidenceOutput {
  /** Categorical band derived from confidence_score */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  /** Composite score in [0.00, 1.00], rounded to 2 decimal places */
  confidence_score: number;
  /** Breakdown of each signal's contribution for audit/display */
  breakdown: {
    signal_a_confirmation_rate: number;   // 0.0–1.0
    signal_b_data_completeness: number;   // 0.0–1.0
    signal_c_mismatch_frequency: number;  // 0.0–1.0
    weight_a: number;
    weight_b: number;
    weight_c: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Weights must sum to 1.0 */
export const WEIGHT_A = 0.40;  // historical confirmation rate
export const WEIGHT_B = 0.35;  // data completeness
export const WEIGHT_C = 0.25;  // mismatch frequency (inverse)

/** Band thresholds */
export const THRESHOLD_HIGH   = 0.70;
export const THRESHOLD_MEDIUM = 0.45;

/**
 * Fallback confirmation rate used when no annotation data is available
 * for a given mismatch type. 0.5 represents maximum uncertainty.
 */
const DEFAULT_CONFIRMATION_RATE = 0.5;

/**
 * Maximum number of mismatches above which Signal C reaches its floor (0.0).
 * A check with ≥ MAX_MISMATCHES_FOR_FLOOR mismatches gets the minimum
 * frequency score.
 */
export const MAX_MISMATCHES_FOR_FLOOR = 8;

// ─── Signal A: Historical Confirmation Rate ───────────────────────────────────

/**
 * Computes Signal A from the historical confirmation rates of the mismatch
 * types detected in this check.
 *
 * Algorithm:
 *   1. For each detected mismatch type, look up its confirmation_rate from
 *      annotationStats (if available and sample-sufficient).
 *   2. Average the rates across all detected types.
 *   3. If no types are detected, return the neutral value (0.5).
 *
 * A higher confirmation rate means adjusters historically agree with the
 * engine's detections → higher confidence.
 *
 * @param detectedTypes   Mismatch types found in the current check
 * @param annotationStats Per-type stats from the adaptive weight engine
 * @returns               Signal A value in [0.0, 1.0]
 */
export function computeSignalA(
  detectedTypes: MismatchType[],
  annotationStats: MismatchTypeStats[] = [],
): number {
  if (detectedTypes.length === 0) {
    // No mismatches detected — maximum confirmation confidence
    return 1.0;
  }

  // Build a lookup map from the provided stats
  const rateByType = new Map<string, number>();
  for (const stat of annotationStats) {
    // Only use rates from sample-sufficient types
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
 *
 * Score table:
 *   3 sources available → 1.00
 *   2 sources available → 0.67
 *   1 source  available → 0.33
 *   0 sources available → 0.00
 *
 * @param sourcesAvailable Which of the three sources are present
 * @returns                Signal B value in [0.0, 1.0]
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
 *
 * Formula:
 *   signal_c = 1 − min(mismatchCount, MAX_MISMATCHES_FOR_FLOOR) / MAX_MISMATCHES_FOR_FLOOR
 *
 * Interpretation:
 *   0 mismatches → 1.00 (maximum confidence from frequency perspective)
 *   4 mismatches → 0.50
 *   8+ mismatches → 0.00 (floor)
 *
 * @param mismatchCount Total number of mismatches found
 * @returns             Signal C value in [0.0, 1.0]
 */
export function computeSignalC(mismatchCount: number): number {
  const clamped = Math.min(mismatchCount, MAX_MISMATCHES_FOR_FLOOR);
  return parseFloat((1 - clamped / MAX_MISMATCHES_FOR_FLOOR).toFixed(4));
}

// ─── Band classification ──────────────────────────────────────────────────────

/**
 * Maps a composite score to a confidence band.
 *
 * @param score Composite score in [0.0, 1.0]
 * @returns     "HIGH" | "MEDIUM" | "LOW"
 */
export function scoreToConfidenceBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= THRESHOLD_HIGH)   return "HIGH";
  if (score >= THRESHOLD_MEDIUM) return "MEDIUM";
  return "LOW";
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Computes the full confidence output for a consistency check result.
 *
 * @param input  All three signal inputs
 * @returns      { confidence, confidence_score, breakdown }
 */
export function computeConsistencyConfidence(input: ConfidenceInput): ConfidenceOutput {
  const signalA = computeSignalA(
    input.detectedMismatchTypes,
    input.annotationStats ?? [],
  );
  const signalB = computeSignalB(input.sourcesAvailable);
  const signalC = computeSignalC(input.mismatchCount);

  const raw = WEIGHT_A * signalA + WEIGHT_B * signalB + WEIGHT_C * signalC;
  const confidence_score = parseFloat(
    Math.min(1.0, Math.max(0.0, raw)).toFixed(2),
  );

  return {
    confidence: scoreToConfidenceBand(confidence_score),
    confidence_score,
    breakdown: {
      signal_a_confirmation_rate: signalA,
      signal_b_data_completeness: signalB,
      signal_c_mismatch_frequency: signalC,
      weight_a: WEIGHT_A,
      weight_b: WEIGHT_B,
      weight_c: WEIGHT_C,
    },
  };
}
