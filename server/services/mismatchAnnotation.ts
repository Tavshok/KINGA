/**
 * Mismatch Annotation Service
 *
 * Tracks adjuster confirm/dismiss actions on individual damage mismatches.
 * Computes per-type confirmation rates and produces adaptive weight adjustments
 * for the consistency scoring engine.
 *
 * Adaptive calibration rules (Stage 23):
 *   1. MINIMUM SAMPLE GATE  — no adjustment fires unless total_annotations >= 20
 *   2. MULTIPLIER CLAMP     — raw multiplier is clamped to [0.75, 1.20]
 *   3. SMOOTHING            — new_weight = (0.7 × current) + (0.3 × suggested)
 *   4. ADJUSTMENT LOG       — every change is written to weight_adjustment_log
 *
 * Previous behaviour (MIN_SAMPLE_SIZE = 5, HIGH_MULTIPLIER = 1.25, LOW_MULTIPLIER = 0.6)
 * is superseded by the above rules.
 */

import { getDb } from "../db";
import {
  mismatchAnnotations,
  weightAdjustmentLog,
  type InsertMismatchAnnotation,
  type InsertWeightAdjustmentLog,
} from "../../drizzle/schema";
import { eq, sql, desc } from "drizzle-orm";
import type { MismatchType } from "./damageConsistency";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnnotationAction = "confirm" | "dismiss";

export interface AnnotationInput {
  claimId: number;
  assessmentId: number;
  mismatchType: MismatchType;
  mismatchIndex: number;
  action: AnnotationAction;
  note?: string;
  userId: number;
  userRole?: string;
}

export interface MismatchTypeStats {
  mismatch_type: MismatchType;
  total_annotations: number;
  confirmed: number;
  dismissed: number;
  confirmation_rate: number;          // 0.0 – 1.0
  system_adjustment: SystemAdjustment;
}

export interface SystemAdjustment {
  weight_multiplier: number;          // smoothed, clamped multiplier applied to scoring
  raw_multiplier: number;             // pre-smoothing, pre-clamp value (for audit)
  sensitivity_direction: "increase" | "decrease" | "neutral";
  reason: string;
  sample_size_sufficient: boolean;    // false when < MIN_SAMPLE_SIZE
}

export interface AdaptiveWeightsOutput {
  generated_at: string;               // ISO timestamp
  total_annotations_analysed: number;
  adjustments: MismatchTypeStats[];
}

export interface WeightAdjustmentLogEntry {
  id: number;
  mismatch_type: string;
  old_multiplier: number;
  raw_multiplier: number;
  new_multiplier: number;
  total_annotations: number;
  confirmation_rate: number;
  reason: string;
  created_at: number;                 // Unix ms timestamp
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum number of annotations required before any weight adjustment fires.
 * Below this threshold the multiplier is always 1.0 (no change).
 */
export const MIN_SAMPLE_SIZE = 20;

/** Confirmation rate threshold above which sensitivity is increased */
const HIGH_CONFIRM_THRESHOLD = 0.75;

/** Confirmation rate threshold below which weight is reduced */
const LOW_CONFIRM_THRESHOLD = 0.25;

/**
 * Raw (pre-smoothing) multiplier applied when confirmation rate is high.
 * Will be smoothed before use.
 */
const RAW_HIGH_MULTIPLIER = 1.25;

/**
 * Raw (pre-smoothing) multiplier applied when confirmation rate is low.
 * Will be smoothed before use.
 */
const RAW_LOW_MULTIPLIER = 0.6;

/**
 * Multiplier range after clamping.
 * Ensures no single feedback loop can push weights outside safe bounds.
 */
export const MULTIPLIER_MIN = 0.75;
export const MULTIPLIER_MAX = 1.20;

/**
 * Smoothing coefficients.
 * new_weight = (SMOOTH_CURRENT × current) + (SMOOTH_SUGGESTED × suggested)
 */
const SMOOTH_CURRENT   = 0.7;
const SMOOTH_SUGGESTED = 0.3;

// ─── Smoothing & clamping helpers ─────────────────────────────────────────────

/**
 * Applies exponential smoothing to blend the current multiplier with the
 * newly suggested multiplier, then clamps the result to [MULTIPLIER_MIN, MULTIPLIER_MAX].
 *
 * @param current   The multiplier currently in use (defaults to 1.0 if unknown)
 * @param suggested The raw multiplier derived from the confirmation rate
 * @returns         The smoothed, clamped multiplier
 */
export function applySmoothing(current: number, suggested: number): number {
  const smoothed = SMOOTH_CURRENT * current + SMOOTH_SUGGESTED * suggested;
  return parseFloat(
    Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, smoothed)).toFixed(4)
  );
}

/**
 * Clamps a raw multiplier to [MULTIPLIER_MIN, MULTIPLIER_MAX] without smoothing.
 * Used to report the raw value before smoothing is applied.
 */
export function clampMultiplier(raw: number): number {
  return parseFloat(
    Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, raw)).toFixed(4)
  );
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Records a single adjuster annotation for a mismatch.
 */
export async function recordAnnotation(input: AnnotationInput): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("[mismatchAnnotation] Database not available");
  const row: InsertMismatchAnnotation = {
    claimId: input.claimId,
    assessmentId: input.assessmentId,
    mismatchType: input.mismatchType,
    mismatchIndex: input.mismatchIndex,
    action: input.action,
    note: input.note ?? null,
    userId: input.userId,
    userRole: input.userRole ?? null,
    createdAt: Date.now(),
  };

  const [result] = await db.insert(mismatchAnnotations).values(row);
  return { id: (result as any).insertId ?? 0 };
}

/**
 * Computes confirmation rate statistics for a single mismatch type.
 *
 * Applies all four Stage 23 calibration rules:
 *   1. Sample gate  — returns neutral multiplier (1.0) if total < MIN_SAMPLE_SIZE
 *   2. Raw multiplier derived from confirmation rate
 *   3. Smoothing    — blends current (1.0 baseline) with suggested raw multiplier
 *   4. Clamp        — final value constrained to [MULTIPLIER_MIN, MULTIPLIER_MAX]
 *
 * @param mismatchType  The mismatch type being evaluated
 * @param confirmed     Number of "confirm" annotations for this type
 * @param dismissed     Number of "dismiss" annotations for this type
 * @param currentMultiplier  The multiplier currently in use (default 1.0)
 */
export function computeTypeStats(
  mismatchType: MismatchType,
  confirmed: number,
  dismissed: number,
  currentMultiplier = 1.0,
): MismatchTypeStats {
  const total = confirmed + dismissed;
  const confirmationRate = total === 0 ? 0 : confirmed / total;
  const sampleSufficient = total >= MIN_SAMPLE_SIZE;

  let adjustment: SystemAdjustment;

  if (!sampleSufficient) {
    // Rule 1: Sample gate — not enough data to adjust
    adjustment = {
      weight_multiplier: 1.0,
      raw_multiplier: 1.0,
      sensitivity_direction: "neutral",
      reason: `Insufficient sample size (${total}/${MIN_SAMPLE_SIZE} required). No adjustment applied.`,
      sample_size_sufficient: false,
    };
  } else if (confirmationRate >= HIGH_CONFIRM_THRESHOLD) {
    // Rule 2: High confirmation rate → increase sensitivity
    const rawMultiplier = RAW_HIGH_MULTIPLIER;
    const clampedRaw = clampMultiplier(rawMultiplier);
    const smoothed = applySmoothing(currentMultiplier, clampedRaw);
    adjustment = {
      weight_multiplier: smoothed,
      raw_multiplier: clampedRaw,
      sensitivity_direction: "increase",
      reason:
        `High confirmation rate (${(confirmationRate * 100).toFixed(0)}% of ${total} annotations). ` +
        `Raw multiplier ${clampedRaw} smoothed to ${smoothed} (current=${currentMultiplier}).`,
      sample_size_sufficient: true,
    };
  } else if (confirmationRate <= LOW_CONFIRM_THRESHOLD) {
    // Rule 2: Low confirmation rate → reduce weight
    const rawMultiplier = RAW_LOW_MULTIPLIER;
    const clampedRaw = clampMultiplier(rawMultiplier);
    const smoothed = applySmoothing(currentMultiplier, clampedRaw);
    adjustment = {
      weight_multiplier: smoothed,
      raw_multiplier: clampedRaw,
      sensitivity_direction: "decrease",
      reason:
        `Low confirmation rate (${(confirmationRate * 100).toFixed(0)}% of ${total} annotations). ` +
        `Raw multiplier ${clampedRaw} smoothed to ${smoothed} (current=${currentMultiplier}).`,
      sample_size_sufficient: true,
    };
  } else {
    // Neutral zone — no adjustment needed
    adjustment = {
      weight_multiplier: 1.0,
      raw_multiplier: 1.0,
      sensitivity_direction: "neutral",
      reason: `Neutral confirmation rate (${(confirmationRate * 100).toFixed(0)}% of ${total} annotations). No adjustment applied.`,
      sample_size_sufficient: true,
    };
  }

  return {
    mismatch_type: mismatchType,
    total_annotations: total,
    confirmed,
    dismissed,
    confirmation_rate: parseFloat(confirmationRate.toFixed(4)),
    system_adjustment: adjustment,
  };
}

/**
 * Queries the database for annotation counts per mismatch type and
 * returns the full adaptive weights output.
 *
 * When a weight adjustment fires (sample sufficient + non-neutral direction),
 * a log entry is written to weight_adjustment_log.
 */
export async function getAdaptiveWeights(tenantFilter?: string): Promise<AdaptiveWeightsOutput> {
  const db = await getDb();
  if (!db) throw new Error("[mismatchAnnotation] Database not available");

  // Aggregate confirm/dismiss counts per mismatch_type
  const rows = await db
    .select({
      mismatch_type: mismatchAnnotations.mismatchType,
      action: mismatchAnnotations.action,
      count: sql<number>`COUNT(*)`,
    })
    .from(mismatchAnnotations)
    .groupBy(mismatchAnnotations.mismatchType, mismatchAnnotations.action);

  // Pivot into a map: type → { confirmed, dismissed }
  const pivot = new Map<string, { confirmed: number; dismissed: number }>();
  let totalAnnotations = 0;

  for (const row of rows) {
    const entry = pivot.get(row.mismatch_type) ?? { confirmed: 0, dismissed: 0 };
    const count = Number(row.count);
    totalAnnotations += count;
    if (row.action === "confirm") entry.confirmed += count;
    else entry.dismissed += count;
    pivot.set(row.mismatch_type, entry);
  }

  // Build stats for every type that has at least one annotation.
  // We use 1.0 as the baseline current multiplier (no persistent state yet).
  const adjustments: MismatchTypeStats[] = Array.from(pivot.entries()).map(
    ([type, counts]) =>
      computeTypeStats(type as MismatchType, counts.confirmed, counts.dismissed, 1.0)
  );

  // Sort by total_annotations descending for readability
  adjustments.sort((a, b) => b.total_annotations - a.total_annotations);

  // Rule 4: Persist a log entry for every non-neutral, sample-sufficient adjustment
  const now = Date.now();
  for (const stat of adjustments) {
    const adj = stat.system_adjustment;
    if (adj.sample_size_sufficient && adj.sensitivity_direction !== "neutral") {
      try {
        const logRow: InsertWeightAdjustmentLog = {
          mismatchType: stat.mismatch_type,
          oldMultiplier: 1.0,           // baseline before this run
          rawMultiplier: adj.raw_multiplier,
          newMultiplier: adj.weight_multiplier,
          totalAnnotations: stat.total_annotations,
          confirmationRate: stat.confirmation_rate,
          sensitivityDirection: adj.sensitivity_direction,
          reason: adj.reason,
          createdAt: now,
        };
        await db.insert(weightAdjustmentLog).values(logRow);
      } catch {
        // Log failure must not block the weights response
      }
    }
  }

  return {
    generated_at: new Date(now).toISOString(),
    total_annotations_analysed: totalAnnotations,
    adjustments,
  };
}

/**
 * Returns annotation stats for a specific claim's assessment.
 */
export async function getClaimAnnotationStats(
  claimId: number,
): Promise<MismatchTypeStats[]> {
  const db = await getDb();
  if (!db) throw new Error("[mismatchAnnotation] Database not available");
  const rows = await db
    .select({
      mismatch_type: mismatchAnnotations.mismatchType,
      action: mismatchAnnotations.action,
      count: sql<number>`COUNT(*)`,
    })
    .from(mismatchAnnotations)
    .where(eq(mismatchAnnotations.claimId, claimId))
    .groupBy(mismatchAnnotations.mismatchType, mismatchAnnotations.action);

  const pivot = new Map<string, { confirmed: number; dismissed: number }>();
  for (const row of rows) {
    const entry = pivot.get(row.mismatch_type) ?? { confirmed: 0, dismissed: 0 };
    const count = Number(row.count);
    if (row.action === "confirm") entry.confirmed += count;
    else entry.dismissed += count;
    pivot.set(row.mismatch_type, entry);
  }

  return Array.from(pivot.entries()).map(
    ([type, counts]) =>
      computeTypeStats(type as MismatchType, counts.confirmed, counts.dismissed, 1.0)
  );
}

/**
 * Returns all annotations for a specific claim (for audit display).
 */
export async function getClaimAnnotations(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("[mismatchAnnotation] Database not available");
  return db
    .select()
    .from(mismatchAnnotations)
    .where(eq(mismatchAnnotations.claimId, claimId))
    .orderBy(mismatchAnnotations.createdAt);
}

/**
 * Returns the weight adjustment log, most recent first.
 * Optionally filtered by mismatch type.
 */
export async function getWeightAdjustmentLog(
  mismatchType?: MismatchType,
  limit = 100,
): Promise<WeightAdjustmentLogEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("[mismatchAnnotation] Database not available");
  const query = db
    .select()
    .from(weightAdjustmentLog)
    .orderBy(desc(weightAdjustmentLog.createdAt))
    .limit(limit);

  const rows = mismatchType
    ? await db
        .select()
        .from(weightAdjustmentLog)
        .where(eq(weightAdjustmentLog.mismatchType, mismatchType))
        .orderBy(desc(weightAdjustmentLog.createdAt))
        .limit(limit)
    : await query;

  return rows.map((r) => ({
    id: r.id,
    mismatch_type: r.mismatchType,
    old_multiplier: r.oldMultiplier,
    raw_multiplier: r.rawMultiplier,
    new_multiplier: r.newMultiplier,
    total_annotations: r.totalAnnotations,
    confirmation_rate: r.confirmationRate,
    reason: r.reason,
    created_at: r.createdAt,
  }));
}
