/**
 * stage-validation-loop.ts — Wave 4A: Historical Validation Loop
 *
 * Runs after every pipeline completion to:
 * 1. Write a physics_validation_records row with predicted values from PhysicsTruth
 * 2. When a claim is settled (actual values provided), compute deviation scores and
 *    update the record with accuracy metrics
 * 3. Aggregate accuracy statistics for calibration feedback to the speed ensemble
 *
 * This engine is NON-FATAL — all errors are caught and logged without affecting
 * the main pipeline result.
 */

import type { PhysicsTruth } from "./physicsTruth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationPrediction {
  claimId: string;
  assessmentId: number;
  physicsTruth: PhysicsTruth;
}

export interface ActualOutcome {
  claimId: string;
  assessmentId: number;
  actualSpeedKmh?: number;
  actualRepairCostLocal?: number;
  actualDamageZone?: string;
  actualSettlementAmount?: number;
  adjusterOverrideReason?: string;
}

export interface ValidationDeviationResult {
  speedDeviationPct: number | null;       // |predicted - actual| / actual × 100
  costDeviationPct: number | null;
  speedWithinCI: boolean | null;          // true if actual speed falls within predicted CI
  calibrationFeedback: MethodAccuracy[];
  overallAccuracyGrade: "A" | "B" | "C" | "D" | "F";
}

export interface MethodAccuracy {
  method: string;
  predictedKmh: number;
  actualKmh: number;
  deviationPct: number;
  withinTolerance: boolean;  // within 15% = acceptable
}

export interface ValidationLoopStats {
  totalValidated: number;
  speedMAPE: number;          // Mean Absolute Percentage Error for speed
  costMAPE: number;
  ciCoverageRate: number;     // % of claims where actual speed fell within predicted CI
  gradeDistribution: Record<string, number>;
  methodAccuracy: Record<string, number>;  // per-method MAPE
  calibrationDrift: number;   // trend in MAPE over last 30 claims (positive = getting worse)
  lastUpdated: string;
}

// ─── Prediction Writer ────────────────────────────────────────────────────────

/**
 * Writes a validation record immediately after pipeline completion.
 * Populates only the predicted fields — actual values come later when the claim settles.
 */
export function buildValidationPrediction(input: ValidationPrediction): Record<string, unknown> {
  const pt = input.physicsTruth;

  const predictedSpeedKmh = pt.speed?.canonical?.value ?? null;
  const predictedSpeedLowKmh = pt.speed?.canonical?.min ?? null;
  const predictedSpeedHighKmh = pt.speed?.canonical?.max ?? null;
  const predictedCrushDepthMm = pt.geometry?.crushDepth?.canonical?.value != null
    ? pt.geometry.crushDepth.canonical.value * 1000
    : null;
  const predictedRepairCostLocal = (pt.energy as any)?.estimatedRepairCostLocal ?? null;
  const predictedDeltaVKmh = pt.speed?.deltaVKmh?.value ?? null;
  const uncertaintyGrade = (pt as any)?.uncertaintyGrade ?? null;
  const integrityScore = (pt.integrityCheck?.flags?.length ?? 0) > 0
    ? Math.max(0, 100 - pt.integrityCheck.flags.filter(f => f.severity === 'CRITICAL').length * 30
        - pt.integrityCheck.flags.filter(f => f.severity === 'WARNING').length * 10)
    : 100;

  return {
    claim_id: input.claimId,
    assessment_id: input.assessmentId,
    predicted_speed_kmh: predictedSpeedKmh,
    predicted_speed_low_kmh: predictedSpeedLowKmh,
    predicted_speed_high_kmh: predictedSpeedHighKmh,
    predicted_crush_depth_mm: predictedCrushDepthMm,
    predicted_repair_cost_local: predictedRepairCostLocal,
    predicted_delta_v_kmh: predictedDeltaVKmh,
    uncertainty_grade: uncertaintyGrade,
    integrity_score: integrityScore,
    validation_status: "pending",
  };
}

// ─── Deviation Scorer ─────────────────────────────────────────────────────────

/**
 * Computes deviation metrics when actual outcome values are provided.
 * Called when an adjuster closes/settles a claim.
 */
export function computeDeviationScores(
  predicted: {
    speedKmh: number | null;
    speedLowKmh: number | null;
    speedHighKmh: number | null;
    repairCostLocal: number | null;
    methodEstimates?: Array<{ method: string; speedKmh: number }>;
  },
  actual: ActualOutcome
): ValidationDeviationResult {
  // Speed deviation
  let speedDeviationPct: number | null = null;
  let speedWithinCI: boolean | null = null;

  if (predicted.speedKmh != null && actual.actualSpeedKmh != null && actual.actualSpeedKmh > 0) {
    speedDeviationPct = Math.abs(predicted.speedKmh - actual.actualSpeedKmh) / actual.actualSpeedKmh * 100;
  }

  if (predicted.speedLowKmh != null && predicted.speedHighKmh != null && actual.actualSpeedKmh != null) {
    speedWithinCI = actual.actualSpeedKmh >= predicted.speedLowKmh && actual.actualSpeedKmh <= predicted.speedHighKmh;
  }

  // Cost deviation
  let costDeviationPct: number | null = null;
  if (predicted.repairCostLocal != null && actual.actualRepairCostLocal != null && actual.actualRepairCostLocal > 0) {
    costDeviationPct = Math.abs(predicted.repairCostLocal - actual.actualRepairCostLocal) / actual.actualRepairCostLocal * 100;
  }

  // Per-method accuracy
  const calibrationFeedback: MethodAccuracy[] = [];
  if (predicted.methodEstimates && actual.actualSpeedKmh != null && actual.actualSpeedKmh > 0) {
    for (const me of predicted.methodEstimates) {
      const dev = Math.abs(me.speedKmh - actual.actualSpeedKmh) / actual.actualSpeedKmh * 100;
      calibrationFeedback.push({
        method: me.method,
        predictedKmh: me.speedKmh,
        actualKmh: actual.actualSpeedKmh,
        deviationPct: dev,
        withinTolerance: dev <= 15,
      });
    }
  }

  // Overall accuracy grade
  const speedDev = speedDeviationPct ?? 100;
  const costDev = costDeviationPct ?? 100;
  const avgDev = (speedDev + costDev) / 2;

  let overallAccuracyGrade: "A" | "B" | "C" | "D" | "F";
  if (avgDev <= 10) overallAccuracyGrade = "A";
  else if (avgDev <= 20) overallAccuracyGrade = "B";
  else if (avgDev <= 35) overallAccuracyGrade = "C";
  else if (avgDev <= 50) overallAccuracyGrade = "D";
  else overallAccuracyGrade = "F";

  return {
    speedDeviationPct,
    costDeviationPct,
    speedWithinCI,
    calibrationFeedback,
    overallAccuracyGrade,
  };
}

// ─── Aggregate Statistics ─────────────────────────────────────────────────────

/**
 * Computes aggregate accuracy statistics from a set of validated records.
 * Used by the admin accuracy dashboard.
 */
export function computeValidationStats(
  records: Array<{
    speedDeviationPct: number | null;
    costDeviationPct: number | null;
    speedWithinCI: number | null;  // tinyint 0/1
    calibrationFeedbackJson: unknown;
    uncertaintyGrade: string | null;
    createdAt: Date | string;
  }>
): ValidationLoopStats {
  const validated = records.filter(r => r.speedDeviationPct != null);
  const n = validated.length;

  // Grade distribution — computed from ALL records regardless of validation status
  const gradeDistribution: Record<string, number> = {};
  for (const r of records) {
    const g = r.uncertaintyGrade ?? "?";
    gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
  }

  if (n === 0) {
    return {
      totalValidated: 0,
      speedMAPE: 0,
      costMAPE: 0,
      ciCoverageRate: 0,
      gradeDistribution,
      methodAccuracy: {},
      calibrationDrift: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // MAPE
  const speedMAPE = validated.reduce((s, r) => s + (r.speedDeviationPct ?? 0), 0) / n;
  const costValidated = validated.filter(r => r.costDeviationPct != null);
  const costMAPE = costValidated.length > 0
    ? costValidated.reduce((s, r) => s + (r.costDeviationPct ?? 0), 0) / costValidated.length
    : 0;

  // CI coverage
  const ciRecords = validated.filter(r => r.speedWithinCI != null);
  const ciCoverageRate = ciRecords.length > 0
    ? ciRecords.filter(r => r.speedWithinCI === 1).length / ciRecords.length * 100
    : 0;

  // Per-method accuracy from calibration feedback
  const methodAccuracy: Record<string, { sum: number; count: number }> = {};
  for (const r of validated) {
    if (!r.calibrationFeedbackJson) continue;
    const fb = r.calibrationFeedbackJson as MethodAccuracy[];
    if (!Array.isArray(fb)) continue;
    for (const m of fb) {
      if (!methodAccuracy[m.method]) methodAccuracy[m.method] = { sum: 0, count: 0 };
      methodAccuracy[m.method].sum += m.deviationPct;
      methodAccuracy[m.method].count += 1;
    }
  }
  const methodMAPE: Record<string, number> = {};
  for (const [method, { sum, count }] of Object.entries(methodAccuracy)) {
    methodMAPE[method] = sum / count;
  }

  // Calibration drift — compare MAPE of last 10 vs previous 20
  const sorted = [...validated].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  let calibrationDrift = 0;
  if (sorted.length >= 10) {
    const recent = sorted.slice(-10);
    const older = sorted.slice(-30, -10);
    const recentMAPE = recent.reduce((s, r) => s + (r.speedDeviationPct ?? 0), 0) / recent.length;
    const olderMAPE = older.length > 0
      ? older.reduce((s, r) => s + (r.speedDeviationPct ?? 0), 0) / older.length
      : recentMAPE;
    calibrationDrift = recentMAPE - olderMAPE;  // positive = getting worse
  }

  return {
    totalValidated: n,
    speedMAPE: Math.round(speedMAPE * 10) / 10,
    costMAPE: Math.round(costMAPE * 10) / 10,
    ciCoverageRate: Math.round(ciCoverageRate * 10) / 10,
    gradeDistribution,
    methodAccuracy: Object.fromEntries(
      Object.entries(methodMAPE).map(([k, v]) => [k, Math.round(v * 10) / 10])
    ),
    calibrationDrift: Math.round(calibrationDrift * 10) / 10,
    lastUpdated: new Date().toISOString(),
  };
}
