/**
 * pipeline-v2/orchestrator.ts
 *
 * Pipeline Orchestrator — wires all 10 stages together.
 *
 * This is the single entry point for the new deterministic pipeline.
 * Each stage receives typed input and returns typed output.
 * The orchestrator manages the flow and saves results to the database.
 */

import type {
  PipelineContext,
  PipelineRunSummary,
  PipelineStageSummary,
  ClaimRecord,
  Stage1Output,
  Stage2Output,
  Stage3Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  Stage10Output,
} from "./types";

import { runIngestionStage } from "./stage-1-ingestion";
import { runExtractionStage } from "./stage-2-extraction";
import { runStructuredExtractionStage } from "./stage-3-structured-extraction";
import { runValidationStage } from "./stage-4-validation";
import { runAssemblyStage } from "./stage-5-assembly";
import { runDamageAnalysisStage } from "./stage-6-damage-analysis";
import { runPhysicsStage } from "./stage-7-physics";
import { runFraudAnalysisStage } from "./stage-8-fraud";
import { runCostOptimisationStage } from "./stage-9-cost";
import { runReportGenerationStage } from "./stage-10-report";

/**
 * Run the full 10-stage pipeline.
 *
 * Returns a PipelineRunSummary with per-stage status,
 * plus the final ClaimRecord and report for DB persistence.
 */
export async function runPipelineV2(
  ctx: PipelineContext
): Promise<{
  summary: PipelineRunSummary;
  claimRecord: ClaimRecord | null;
  report: Stage10Output | null;
  damageAnalysis: Stage6Output | null;
  physicsAnalysis: Stage7Output | null;
  fraudAnalysis: Stage8Output | null;
  costAnalysis: Stage9Output | null;
}> {
  const pipelineStart = Date.now();
  const stages: Record<string, PipelineStageSummary> = {};

  ctx.log("Pipeline", `Starting 10-stage pipeline for claim ${ctx.claimId}`);

  let stage1Data: Stage1Output | null = null;
  let stage2Data: Stage2Output | null = null;
  let stage3Data: Stage3Output | null = null;
  let stage4Data: Stage4Output | null = null;
  let stage5Data: Stage5Output | null = null;
  let stage6Data: Stage6Output | null = null;
  let stage7Data: Stage7Output | null = null;
  let stage8Data: Stage8Output | null = null;
  let stage9Data: Stage9Output | null = null;
  let stage10Data: Stage10Output | null = null;

  // ── STAGE 1: Document Ingestion ──────────────────────────────────────
  const s1 = await runIngestionStage(ctx);
  stages["1_ingestion"] = { status: s1.status, durationMs: s1.durationMs, savedToDb: s1.savedToDb, error: s1.error };
  if (s1.status === "failed" || !s1.data) {
    ctx.log("Pipeline", "ABORTED at Stage 1 — no documents to process");
    return buildResult(stages, pipelineStart, ctx.claimId, null, null, null, null, null, null);
  }
  stage1Data = s1.data;

  // ── STAGE 2: OCR & Text Extraction ───────────────────────────────────
  const s2 = await runExtractionStage(ctx, stage1Data);
  stages["2_extraction"] = { status: s2.status, durationMs: s2.durationMs, savedToDb: s2.savedToDb, error: s2.error };
  if (s2.status === "failed" || !s2.data) {
    ctx.log("Pipeline", "ABORTED at Stage 2 — text extraction failed");
    return buildResult(stages, pipelineStart, ctx.claimId, null, null, null, null, null, null);
  }
  stage2Data = s2.data;

  // ── STAGE 3: Structured Data Extraction ──────────────────────────────
  const s3 = await runStructuredExtractionStage(ctx, stage1Data, stage2Data);
  stages["3_structured_extraction"] = { status: s3.status, durationMs: s3.durationMs, savedToDb: s3.savedToDb, error: s3.error };
  if (s3.status === "failed" || !s3.data) {
    ctx.log("Pipeline", "ABORTED at Stage 3 — structured extraction failed");
    return buildResult(stages, pipelineStart, ctx.claimId, null, null, null, null, null, null);
  }
  stage3Data = s3.data;

  // ── STAGE 4: Data Validation ─────────────────────────────────────────
  const s4 = await runValidationStage(ctx, stage3Data);
  stages["4_validation"] = { status: s4.status, durationMs: s4.durationMs, savedToDb: s4.savedToDb, error: s4.error };
  if (s4.status === "failed" || !s4.data) {
    ctx.log("Pipeline", "ABORTED at Stage 4 — validation failed");
    return buildResult(stages, pipelineStart, ctx.claimId, null, null, null, null, null, null);
  }
  stage4Data = s4.data;

  // ── STAGE 5: Claim Data Assembly ─────────────────────────────────────
  const s5 = await runAssemblyStage(ctx, stage4Data);
  stages["5_assembly"] = { status: s5.status, durationMs: s5.durationMs, savedToDb: s5.savedToDb, error: s5.error };
  if (s5.status === "failed" || !s5.data) {
    ctx.log("Pipeline", "ABORTED at Stage 5 — claim assembly failed");
    return buildResult(stages, pipelineStart, ctx.claimId, null, null, null, null, null, null);
  }
  stage5Data = s5.data;
  const claimRecord = stage5Data.claimRecord;

  // ── STAGE 6: Damage Analysis ─────────────────────────────────────────
  const s6 = await runDamageAnalysisStage(ctx, claimRecord);
  stages["6_damage_analysis"] = { status: s6.status, durationMs: s6.durationMs, savedToDb: s6.savedToDb, error: s6.error };
  if (s6.status === "failed" || !s6.data) {
    ctx.log("Pipeline", "ABORTED at Stage 6 — damage analysis failed");
    return buildResult(stages, pipelineStart, ctx.claimId, claimRecord, null, null, null, null, null);
  }
  stage6Data = s6.data;

  // ── STAGE 7: Physics Analysis ────────────────────────────────────────
  const s7 = await runPhysicsStage(ctx, claimRecord, stage6Data);
  stages["7_physics"] = { status: s7.status, durationMs: s7.durationMs, savedToDb: s7.savedToDb, error: s7.error };
  // Physics can be skipped (non-collision) — still continue
  stage7Data = s7.data!;

  // ── STAGE 8: Fraud Analysis ──────────────────────────────────────────
  const s8 = await runFraudAnalysisStage(ctx, claimRecord, stage6Data, stage7Data);
  stages["8_fraud"] = { status: s8.status, durationMs: s8.durationMs, savedToDb: s8.savedToDb, error: s8.error };
  if (s8.status === "failed" || !s8.data) {
    ctx.log("Pipeline", "WARNING: Stage 8 fraud analysis failed — continuing with defaults");
    stage8Data = buildDefaultFraudOutput();
  } else {
    stage8Data = s8.data;
  }

  // ── STAGE 9: Cost Optimisation ───────────────────────────────────────
  const s9 = await runCostOptimisationStage(ctx, claimRecord, stage6Data, stage7Data);
  stages["9_cost"] = { status: s9.status, durationMs: s9.durationMs, savedToDb: s9.savedToDb, error: s9.error };
  if (s9.status === "failed" || !s9.data) {
    ctx.log("Pipeline", "WARNING: Stage 9 cost optimisation failed — continuing with defaults");
    stage9Data = buildDefaultCostOutput();
  } else {
    stage9Data = s9.data;
  }

  // ── STAGE 10: Report Generation ──────────────────────────────────────
  const s10 = await runReportGenerationStage(ctx, claimRecord, stage6Data, stage7Data, stage8Data, stage9Data);
  stages["10_report"] = { status: s10.status, durationMs: s10.durationMs, savedToDb: s10.savedToDb, error: s10.error };
  stage10Data = s10.data || null;

  ctx.log("Pipeline", `Pipeline complete. Total: ${Date.now() - pipelineStart}ms`);

  return buildResult(
    stages, pipelineStart, ctx.claimId,
    claimRecord, stage10Data,
    stage6Data, stage7Data, stage8Data, stage9Data
  );
}

function buildResult(
  stages: Record<string, PipelineStageSummary>,
  pipelineStart: number,
  claimId: number,
  claimRecord: ClaimRecord | null,
  report: Stage10Output | null,
  damageAnalysis: Stage6Output | null,
  physicsAnalysis: Stage7Output | null,
  fraudAnalysis: Stage8Output | null,
  costAnalysis: Stage9Output | null
) {
  const allSaved = Object.values(stages).every(s => s.savedToDb || s.status === "skipped");
  return {
    summary: {
      claimId,
      stages,
      allSavedToDb: allSaved,
      totalDurationMs: Date.now() - pipelineStart,
      completedAt: new Date().toISOString(),
    },
    claimRecord,
    report,
    damageAnalysis,
    physicsAnalysis,
    fraudAnalysis,
    costAnalysis,
  };
}

function buildDefaultFraudOutput(): Stage8Output {
  return {
    fraudRiskScore: 0,
    fraudRiskLevel: "minimal",
    indicators: [],
    quoteDeviation: null,
    repairerHistory: { flagged: false, notes: "Analysis unavailable." },
    claimantClaimFrequency: { flagged: false, notes: "Analysis unavailable." },
    vehicleClaimHistory: { flagged: false, notes: "Analysis unavailable." },
    damageConsistencyScore: 50,
    damageConsistencyNotes: "Fraud analysis was not completed.",
  };
}

function buildDefaultCostOutput(): Stage9Output {
  return {
    expectedRepairCostCents: 0,
    quoteDeviationPct: null,
    recommendedCostRange: { lowCents: 0, highCents: 0 },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: 0,
      labourCostCents: 0,
      paintCostCents: 0,
      hiddenDamageCostCents: 0,
      totalCents: 0,
    },
    labourRateUsdPerHour: 0,
    marketRegion: "DEFAULT",
    currency: "USD",
  };
}
