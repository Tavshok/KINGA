/**
 * db-validation.ts — Wave 4A persistence helpers
 *
 * Provides `saveValidationPrediction()` which inserts a row into
 * `physics_validation_records` immediately after each pipeline run.
 * The actual outcome fields (speed, cost, etc.) are populated later
 * when an adjuster closes/settles the claim.
 */

import { getDb } from "./db";
import { physicsValidationRecords } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { aiAssessments } from "../drizzle/schema";

/**
 * Persist a validation prediction row for a completed pipeline run.
 *
 * @param claimId  The numeric claim ID (used to look up the latest assessment ID).
 * @param row      The prediction row built by buildValidationPrediction().
 */
export async function saveValidationPrediction(
  claimId: number,
  row: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Resolve the latest assessment ID for this claim so the record is linked
  let assessmentId: number | null = null;
  try {
    const [latest] = await db
      .select({ id: aiAssessments.id })
      .from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.createdAt))
      .limit(1);
    assessmentId = latest?.id ?? null;
  } catch {
    // Non-fatal — proceed without assessment linkage
  }

  // Coerce decimal strings to numbers for Drizzle's typed insert
  const toNum = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  await db.insert(physicsValidationRecords).values({
    claimId: String(row.claim_id ?? claimId),
    assessmentId: assessmentId ?? undefined,
    predictedSpeedKmh: toNum(row.predicted_speed_kmh)?.toFixed(2) as any,
    predictedSpeedLowKmh: toNum(row.predicted_speed_low_kmh)?.toFixed(2) as any,
    predictedSpeedHighKmh: toNum(row.predicted_speed_high_kmh)?.toFixed(2) as any,
    predictedCrushDepthMm: toNum(row.predicted_crush_depth_mm)?.toFixed(2) as any,
    predictedRepairCostLocal: toNum(row.predicted_repair_cost_local)?.toFixed(2) as any,
    predictedDeltaVKmh: toNum(row.predicted_delta_v_kmh)?.toFixed(2) as any,
    uncertaintyGrade: (row.uncertainty_grade as string) ?? null,
    integrityScore: toNum(row.integrity_score) ?? null,
    validationStatus: "pending",
  });
}

/**
 * Fetch all validation records for the accuracy dashboard.
 * Returns the most recent `limit` records, ordered by creation date desc.
 */
export async function getValidationRecords(opts?: {
  limit?: number;
  validatedOnly?: boolean;
}): Promise<Array<{
  id: number;
  claimId: string;
  assessmentId: number | null;
  predictedSpeedKmh: string | null;
  predictedSpeedLowKmh: string | null;
  predictedSpeedHighKmh: string | null;
  predictedCrushDepthMm: string | null;
  predictedRepairCostLocal: string | null;
  predictedDeltaVKmh: string | null;
  uncertaintyGrade: string | null;
  integrityScore: number | null;
  actualSpeedKmh: string | null;
  actualRepairCostLocal: string | null;
  speedDeviationPct: string | null;
  costDeviationPct: string | null;
  speedWithinCI: number | null;
  validationStatus: string;
  createdAt: Date | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  const limit = opts?.limit ?? 200;

  // Use raw SQL to avoid Drizzle query builder issues with decimal columns
  const [rows] = await (db as any).execute(
    `SELECT
      id, claim_id, assessment_id,
      predicted_speed_kmh, predicted_speed_low_kmh, predicted_speed_high_kmh,
      predicted_crush_depth_mm, predicted_repair_cost_local, predicted_delta_v_kmh,
      uncertainty_grade, integrity_score,
      actual_speed_kmh, actual_repair_cost_local,
      speed_deviation_pct, cost_deviation_pct, speed_within_ci,
      validation_status, created_at
    FROM physics_validation_records
    ${opts?.validatedOnly ? "WHERE validation_status = 'validated'" : ""}
    ORDER BY created_at DESC
    LIMIT ?`,
    [limit]
  );

  return (rows as any[]).map(r => ({
    id: r.id,
    claimId: r.claim_id,
    assessmentId: r.assessment_id ?? null,
    predictedSpeedKmh: r.predicted_speed_kmh ?? null,
    predictedSpeedLowKmh: r.predicted_speed_low_kmh ?? null,
    predictedSpeedHighKmh: r.predicted_speed_high_kmh ?? null,
    predictedCrushDepthMm: r.predicted_crush_depth_mm ?? null,
    predictedRepairCostLocal: r.predicted_repair_cost_local ?? null,
    predictedDeltaVKmh: r.predicted_delta_v_kmh ?? null,
    uncertaintyGrade: r.uncertainty_grade ?? null,
    integrityScore: r.integrity_score ?? null,
    actualSpeedKmh: r.actual_speed_kmh ?? null,
    actualRepairCostLocal: r.actual_repair_cost_local ?? null,
    speedDeviationPct: r.speed_deviation_pct ?? null,
    costDeviationPct: r.cost_deviation_pct ?? null,
    speedWithinCI: r.speed_within_ci ?? null,
    validationStatus: r.validation_status ?? "pending",
    createdAt: r.created_at ? new Date(r.created_at) : null,
  }));
}
