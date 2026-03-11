/**
 * pipeline-v2/stage-9b-turnaround.ts
 *
 * STAGE 9b — TURNAROUND TIME ANALYSIS (Self-Healing)
 *
 * Estimates repair turnaround time based on damage severity,
 * component count, and repair complexity.
 *
 * NEVER halts — produces estimated turnaround even with minimal data.
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage9Output,
  TurnaroundTimeOutput,
  Assumption,
  RecoveryAction,
} from "./types";

/**
 * Base repair days by severity level.
 */
const SEVERITY_BASE_DAYS: Record<string, number> = {
  cosmetic: 1,
  minor: 2,
  moderate: 4,
  severe: 7,
  catastrophic: 14,
};

/**
 * Estimate turnaround time from damage analysis and cost data.
 */
function estimateTurnaroundDays(
  damageAnalysis: Stage6Output,
  costData: Stage9Output | null,
  claimRecord: ClaimRecord,
  assumptions: Assumption[]
): {
  estimatedDays: number;
  breakdown: { assessmentDays: number; partsSourcingDays: number; repairDays: number; paintDays: number; qualityCheckDays: number };
} {
  // Assessment phase: 1-2 days
  const assessmentDays = 1;

  // Parts sourcing: depends on component count and availability
  let partsSourcingDays = 3; // Default
  const componentCount = damageAnalysis.damagedParts.length;
  if (componentCount > 10) {
    partsSourcingDays = 7;
  } else if (componentCount > 5) {
    partsSourcingDays = 5;
  }

  // Adjust for market region (Zimbabwe may have longer sourcing times)
  if (claimRecord.marketRegion === "ZW") {
    partsSourcingDays = Math.round(partsSourcingDays * 1.5);
    assumptions.push({
      field: "partsSourcingDays",
      assumedValue: partsSourcingDays,
      reason: "Zimbabwe market — parts sourcing time increased by 50% due to import dependencies.",
      strategy: "contextual_inference",
      confidence: 50,
      stage: "Stage 9b",
    });
  }

  // Repair days: based on max severity
  let repairDays = 3; // Default
  if (damageAnalysis.damagedParts.length > 0) {
    const maxSeverity = damageAnalysis.damagedParts.reduce((max, p) => {
      const order = ["cosmetic", "minor", "moderate", "severe", "catastrophic"];
      return order.indexOf(p.severity) > order.indexOf(max) ? p.severity : max;
    }, "cosmetic");
    repairDays = SEVERITY_BASE_DAYS[maxSeverity] || 4;

    // Add days for structural damage
    if (damageAnalysis.structuralDamageDetected) {
      repairDays += 5;
    }

    // Scale with component count
    repairDays += Math.floor(componentCount / 3);
  } else {
    assumptions.push({
      field: "repairDays",
      assumedValue: 3,
      reason: "No damage components available. Using default estimate of 3 repair days.",
      strategy: "default_value",
      confidence: 25,
      stage: "Stage 9b",
    });
  }

  // Paint days
  const paintDays = damageAnalysis.damagedParts.length > 5 ? 3 : damageAnalysis.damagedParts.length > 0 ? 2 : 1;

  // Quality check
  const qualityCheckDays = 1;

  const estimatedDays = assessmentDays + partsSourcingDays + repairDays + paintDays + qualityCheckDays;

  return {
    estimatedDays,
    breakdown: { assessmentDays, partsSourcingDays, repairDays, paintDays, qualityCheckDays },
  };
}

export async function runTurnaroundTimeStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  costData: Stage9Output | null
): Promise<StageResult<TurnaroundTimeOutput>> {
  const start = Date.now();
  ctx.log("Stage 9b", "Turnaround time analysis starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const { estimatedDays, breakdown } = estimateTurnaroundDays(
      damageAnalysis, costData, claimRecord, assumptions
    );

    // Compute confidence range
    const bestCaseDays = Math.max(3, Math.round(estimatedDays * 0.7));
    const worstCaseDays = Math.round(estimatedDays * 1.5);

    // Determine confidence based on data quality
    let confidence = 70;
    if (damageAnalysis.damagedParts.length === 0) {
      confidence = 25;
      isDegraded = true;
    } else if (claimRecord.dataQuality.completenessScore < 50) {
      confidence = 40;
      isDegraded = true;
    }

    // Bottleneck identification
    const bottlenecks: string[] = [];
    if (breakdown.partsSourcingDays > 5) {
      bottlenecks.push("Parts sourcing — extended lead time expected");
    }
    if (breakdown.repairDays > 7) {
      bottlenecks.push("Complex repair — structural work required");
    }
    if (damageAnalysis.structuralDamageDetected) {
      bottlenecks.push("Structural damage — specialist equipment needed");
    }

    const output: TurnaroundTimeOutput = {
      estimatedRepairDays: estimatedDays,
      bestCaseDays,
      worstCaseDays,
      confidence,
      breakdown,
      bottlenecks,
      marketRegion: claimRecord.marketRegion || "ZW",
    };

    ctx.log("Stage 9b", `Turnaround estimate: ${estimatedDays} days (best: ${bestCaseDays}, worst: ${worstCaseDays}), confidence: ${confidence}%, bottlenecks: ${bottlenecks.length}`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 9b", `Turnaround analysis failed: ${String(err)} — producing default estimate`);

    return {
      status: "degraded",
      data: {
        estimatedRepairDays: 14,
        bestCaseDays: 7,
        worstCaseDays: 21,
        confidence: 10,
        breakdown: {
          assessmentDays: 1,
          partsSourcingDays: 5,
          repairDays: 5,
          paintDays: 2,
          qualityCheckDays: 1,
        },
        bottlenecks: ["Analysis failed — using generic estimate"],
        marketRegion: claimRecord.marketRegion || "ZW",
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "turnaroundTime",
        assumedValue: "14 days default",
        reason: `Turnaround analysis failed: ${String(err)}. Using generic 14-day estimate.`,
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 9b",
      }],
      recoveryActions: [{
        target: "turnaround_error",
        strategy: "default_value",
        success: true,
        description: `Turnaround analysis error caught. Using 14-day default estimate.`,
      }],
      degraded: true,
    };
  }
}
