/**
 * Mismatch Annotation Service
 *
 * Tracks adjuster confirm/dismiss actions on individual damage mismatches.
 * Computes per-type confirmation rates and produces adaptive weight adjustments
 * for the consistency scoring engine.
 *
 * Adaptive logic:
 *   - Confirmation rate >= 0.75  → increase sensitivity (weight multiplier > 1)
 *   - Confirmation rate <= 0.25  → reduce weight (multiplier < 1)
 *   - 0.25 < rate < 0.75        → neutral (multiplier = 1.0)
 *   - Minimum sample size of 5 annotations required before any adjustment fires
 */

import { getDb } from "../db";
import { mismatchAnnotations, type InsertMismatchAnnotation } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
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
  weight_multiplier: number;          // applied to mismatch penalty in scoring
  sensitivity_direction: "increase" | "decrease" | "neutral";
  reason: string;
  sample_size_sufficient: boolean;    // false when < MIN_SAMPLE_SIZE
}

export interface AdaptiveWeightsOutput {
  generated_at: string;               // ISO timestamp
  total_annotations_analysed: number;
  adjustments: MismatchTypeStats[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum number of annotations before any weight adjustment is applied */
const MIN_SAMPLE_SIZE = 5;

/** Confirmation rate threshold above which sensitivity is increased */
const HIGH_CONFIRM_THRESHOLD = 0.75;

/** Confirmation rate threshold below which weight is reduced */
const LOW_CONFIRM_THRESHOLD = 0.25;

/** Multiplier applied when confirmation rate is high (increase sensitivity) */
const HIGH_MULTIPLIER = 1.25;

/** Multiplier applied when confirmation rate is low (reduce weight) */
const LOW_MULTIPLIER = 0.6;

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Records a single adjuster annotation for a mismatch.
 */
export async function recordAnnotation(input: AnnotationInput): Promise<{ id: number }> {
  const db = await getDb();
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
 */
export function computeTypeStats(
  mismatchType: MismatchType,
  confirmed: number,
  dismissed: number,
): MismatchTypeStats {
  const total = confirmed + dismissed;
  const confirmationRate = total === 0 ? 0 : confirmed / total;
  const sampleSufficient = total >= MIN_SAMPLE_SIZE;

  let adjustment: SystemAdjustment;

  if (!sampleSufficient) {
    adjustment = {
      weight_multiplier: 1.0,
      sensitivity_direction: "neutral",
      reason: `Insufficient sample size (${total}/${MIN_SAMPLE_SIZE} required). No adjustment applied.`,
      sample_size_sufficient: false,
    };
  } else if (confirmationRate >= HIGH_CONFIRM_THRESHOLD) {
    adjustment = {
      weight_multiplier: HIGH_MULTIPLIER,
      sensitivity_direction: "increase",
      reason: `High confirmation rate (${(confirmationRate * 100).toFixed(0)}% of ${total} annotations). Increasing sensitivity by ${((HIGH_MULTIPLIER - 1) * 100).toFixed(0)}%.`,
      sample_size_sufficient: true,
    };
  } else if (confirmationRate <= LOW_CONFIRM_THRESHOLD) {
    adjustment = {
      weight_multiplier: LOW_MULTIPLIER,
      sensitivity_direction: "decrease",
      reason: `Low confirmation rate (${(confirmationRate * 100).toFixed(0)}% of ${total} annotations). Reducing weight by ${((1 - LOW_MULTIPLIER) * 100).toFixed(0)}%.`,
      sample_size_sufficient: true,
    };
  } else {
    adjustment = {
      weight_multiplier: 1.0,
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
 */
export async function getAdaptiveWeights(tenantFilter?: string): Promise<AdaptiveWeightsOutput> {
  const db = await getDb();
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

  // Build stats for every type that has at least one annotation
  const adjustments: MismatchTypeStats[] = Array.from(pivot.entries()).map(
    ([type, counts]) => computeTypeStats(type as MismatchType, counts.confirmed, counts.dismissed)
  );

  // Sort by total_annotations descending for readability
  adjustments.sort((a, b) => b.total_annotations - a.total_annotations);

  return {
    generated_at: new Date().toISOString(),
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
    ([type, counts]) => computeTypeStats(type as MismatchType, counts.confirmed, counts.dismissed)
  );
}

/**
 * Returns all annotations for a specific claim (for audit display).
 */
export async function getClaimAnnotations(claimId: number) {
  const db = await getDb();
  return db
    .select()
    .from(mismatchAnnotations)
    .where(eq(mismatchAnnotations.claimId, claimId))
    .orderBy(mismatchAnnotations.createdAt);
}
