/**
 * calibrationStabilityGuard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 32 — Calibration Stability Guard
 *
 * Before any new weight adjustment is applied, this module:
 *
 *  1. Fetches the last N (default 10) adjustments for the given mismatch type
 *     from weight_adjustment_log.
 *  2. Calculates the variance of those newMultiplier values.
 *  3. If variance > VARIANCE_THRESHOLD → freezes the adjustment, keeps the
 *     previous multiplier, and logs "Calibration unstable — locked".
 *  4. If variance ≤ threshold → allows the new multiplier to proceed.
 *
 * Design principles
 * ─────────────────
 * • Pure computation functions (calculateVariance, assessStability) are
 *   exported for unit testing without database dependencies.
 * • The async guard function (checkCalibrationStability) handles DB access
 *   and returns a structured GuardResult.
 * • Manual override support is scaffolded (future phase) via the
 *   CalibrationOverride interface — the guard checks for an active override
 *   before applying the freeze.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { weightAdjustmentLog } from "../../drizzle/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Number of recent adjustments to consider when computing variance.
 * Spec: "last 10 adjustments".
 */
export const STABILITY_WINDOW = 10;

/**
 * Variance threshold above which calibration is considered unstable.
 *
 * The multiplier range is [0.75, 1.20] — a span of 0.45.
 * A variance of 0.005 corresponds to a standard deviation of ~0.071,
 * which represents roughly ±16% of the full range — a meaningful oscillation.
 *
 * Rationale: if the last 10 adjustments swing between e.g. 0.75 and 1.20
 * the variance would be ~0.05; a threshold of 0.005 catches moderate
 * oscillation well before it reaches extremes.
 */
export const VARIANCE_THRESHOLD = 0.005;

/**
 * Minimum number of historical adjustments required before variance is
 * meaningful.  If fewer exist, the guard always allows the adjustment.
 */
export const MIN_HISTORY_FOR_VARIANCE = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StabilityAssessment {
  /** True when the new adjustment is safe to apply. */
  stable: boolean;
  /** Variance of the last STABILITY_WINDOW multiplier values. */
  variance: number;
  /** Number of historical records used in the variance calculation. */
  history_count: number;
  /** The multiplier value that should be used (new or frozen previous). */
  effective_multiplier: number;
  /** Human-readable reason for the decision. */
  reason: string;
  /** True when the freeze was triggered. */
  frozen: boolean;
}

export interface GuardResult extends StabilityAssessment {
  /** ISO timestamp of when the guard was evaluated. */
  evaluated_at: string;
  /** The mismatch type this guard run was for. */
  mismatch_type: string;
}

/**
 * Scaffold for future manual override support (Phase 2).
 * When an active override exists, the guard skips the variance check.
 */
export interface CalibrationOverride {
  mismatch_type: string;
  override_multiplier: number;
  override_reason: string;
  expires_at: number; // Unix ms
}

// ─── Pure computation helpers ─────────────────────────────────────────────────

/**
 * Calculate the population variance of an array of numbers.
 * Returns 0 for arrays with fewer than 2 elements.
 */
export function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

/**
 * Assess calibration stability given a history of multiplier values and
 * a proposed new multiplier.
 *
 * This is a pure function — no I/O, fully testable.
 *
 * @param history       - Array of recent newMultiplier values (oldest first).
 * @param proposedValue - The new multiplier being considered.
 * @param threshold     - Variance threshold (defaults to VARIANCE_THRESHOLD).
 */
export function assessStability(
  history: number[],
  proposedValue: number,
  threshold: number = VARIANCE_THRESHOLD
): StabilityAssessment {
  // Include the proposed value in the variance window to assess what would
  // happen if it were applied — this is the most conservative approach.
  const window = [...history.slice(-STABILITY_WINDOW), proposedValue];
  const variance = calculateVariance(window);
  const historyCount = history.length;

  // Not enough history — always allow
  if (historyCount < MIN_HISTORY_FOR_VARIANCE) {
    return {
      stable: true,
      variance,
      history_count: historyCount,
      effective_multiplier: proposedValue,
      reason: `Insufficient history (${historyCount}/${MIN_HISTORY_FOR_VARIANCE} required). Adjustment allowed.`,
      frozen: false,
    };
  }

  if (variance > threshold) {
    // Freeze: use the most recent historical value as the effective multiplier
    const previousMultiplier = history[history.length - 1] ?? 1.0;
    return {
      stable: false,
      variance,
      history_count: historyCount,
      effective_multiplier: previousMultiplier,
      reason: `Calibration unstable — locked. Variance ${variance.toFixed(6)} exceeds threshold ${threshold}. Keeping previous multiplier ${previousMultiplier}.`,
      frozen: true,
    };
  }

  return {
    stable: true,
    variance,
    history_count: historyCount,
    effective_multiplier: proposedValue,
    reason: `Calibration stable. Variance ${variance.toFixed(6)} within threshold ${threshold}. Adjustment applied.`,
    frozen: false,
  };
}

// ─── Async guard (with DB access) ────────────────────────────────────────────

/**
 * Check calibration stability for a given mismatch type before applying
 * a new weight adjustment.
 *
 * Fetches the last STABILITY_WINDOW adjustments from weight_adjustment_log,
 * runs the variance check, and — if frozen — logs the lock event.
 *
 * @param mismatchType    - The mismatch type being adjusted.
 * @param proposedValue   - The new smoothed multiplier being considered.
 * @param override        - Optional manual override (future phase).
 */
export async function checkCalibrationStability(
  mismatchType: string,
  proposedValue: number,
  override?: CalibrationOverride
): Promise<GuardResult> {
  const evaluatedAt = new Date().toISOString();

  // ── Future phase: manual override ────────────────────────────────────────
  if (override && override.mismatch_type === mismatchType) {
    const now = Date.now();
    if (override.expires_at > now) {
      return {
        stable: true,
        variance: 0,
        history_count: 0,
        effective_multiplier: override.override_multiplier,
        reason: `Manual override active: ${override.override_reason}`,
        frozen: false,
        evaluated_at: evaluatedAt,
        mismatch_type: mismatchType,
      };
    }
  }

  // ── Fetch recent adjustment history ──────────────────────────────────────
  let history: number[] = [];
  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select({ newMultiplier: weightAdjustmentLog.newMultiplier })
        .from(weightAdjustmentLog)
        .where(eq(weightAdjustmentLog.mismatchType, mismatchType))
        .orderBy(desc(weightAdjustmentLog.createdAt))
        .limit(STABILITY_WINDOW);
      // Reverse so oldest is first (for variance window ordering)
      history = rows.map((r) => Number(r.newMultiplier)).reverse();
    }
  } catch {
    // DB failure — allow adjustment to proceed (fail open)
    return {
      stable: true,
      variance: 0,
      history_count: 0,
      effective_multiplier: proposedValue,
      reason: "DB unavailable for history lookup. Adjustment allowed (fail-open).",
      frozen: false,
      evaluated_at: evaluatedAt,
      mismatch_type: mismatchType,
    };
  }

  // ── Run stability assessment ──────────────────────────────────────────────
  const assessment = assessStability(history, proposedValue);

  // ── Log the lock event when frozen ───────────────────────────────────────
  if (assessment.frozen) {
    try {
      const db = await getDb();
      if (db) {
        await db.insert(weightAdjustmentLog).values({
          mismatchType,
          oldMultiplier: assessment.effective_multiplier,
          rawMultiplier: proposedValue,
          newMultiplier: assessment.effective_multiplier, // unchanged — frozen
          totalAnnotations: 0,
          confirmationRate: 0,
          sensitivityDirection: "decrease", // placeholder — frozen events don't have a direction
          reason: assessment.reason,        // "Calibration unstable — locked"
          createdAt: Date.now(),
        });
      }
    } catch {
      // Log failure must not block the response
    }
  }

  return {
    ...assessment,
    evaluated_at: evaluatedAt,
    mismatch_type: mismatchType,
  };
}
