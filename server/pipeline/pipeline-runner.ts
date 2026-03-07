/**
 * pipeline/pipeline-runner.ts
 *
 * Pipeline Orchestrator
 *
 * Runs all analysis stages sequentially with per-stage fault isolation.
 * Each stage:
 *   1. Receives the PipelineContext (immutable) + outputs from previous stages
 *   2. Saves its own output to DB immediately on success
 *   3. Returns a StageResult<T> — never throws
 *
 * A failure in any stage is logged and recorded in PipelineRunSummary,
 * but NEVER prevents subsequent stages from running.
 *
 * Entry point: runPipeline(ctx, extraction)
 */

import type { PipelineContext, ExtractedDocumentData, PipelineRunSummary } from "./types";
import { runClassificationStage } from "./stage-2-classification";
import { runPhysicsStage } from "./stage-3-physics";
import { runHiddenDamageStage } from "./stage-4-hidden-damage";

export async function runPipeline(
  ctx: PipelineContext,
  extraction: ExtractedDocumentData
): Promise<PipelineRunSummary> {
  const pipelineStart = Date.now();
  const summary: PipelineRunSummary = {
    claimId: ctx.claimId,
    stages: {},
    allSavedToDb: true,
    totalDurationMs: 0,
    completedAt: new Date().toISOString(),
  };

  ctx.log("Pipeline Runner", `Starting pipeline for claim ${ctx.claimId}`);

  // ── Stage 2: Classification ───────────────────────────────────────────────
  const classificationResult = await runClassificationStage(ctx, extraction);
  summary.stages["classification"] = {
    status: classificationResult.status,
    durationMs: classificationResult.durationMs,
    savedToDb: classificationResult.savedToDb,
    error: classificationResult.error,
  };
  if (classificationResult.status !== "success" || !classificationResult.data) {
    ctx.log("Pipeline Runner", "Classification failed — aborting pipeline (cannot proceed without incident type)");
    summary.totalDurationMs = Date.now() - pipelineStart;
    summary.allSavedToDb = false;
    return summary;
  }
  const classification = classificationResult.data;

  // ── Stage 3: Physics Analysis ─────────────────────────────────────────────
  const physicsResult = await runPhysicsStage(ctx, extraction, classification);
  summary.stages["physics"] = {
    status: physicsResult.status,
    durationMs: physicsResult.durationMs,
    savedToDb: physicsResult.savedToDb,
    error: physicsResult.error,
  };
  if (!physicsResult.savedToDb) summary.allSavedToDb = false;
  // Physics failure is non-fatal — stage 4 handles null physics gracefully
  const physics = physicsResult.data ?? null;

  // ── Stage 4: Hidden Damage Inference ──────────────────────────────────────
  const hiddenDamageResult = await runHiddenDamageStage(ctx, extraction, classification, physics);
  summary.stages["hiddenDamage"] = {
    status: hiddenDamageResult.status,
    durationMs: hiddenDamageResult.durationMs,
    savedToDb: hiddenDamageResult.savedToDb,
    error: hiddenDamageResult.error,
  };
  if (!hiddenDamageResult.savedToDb) summary.allSavedToDb = false;

  // ── Future stages (5–7) will be added here following the same pattern ─────
  // Each stage receives only the data it needs from previous stages.
  // Each stage saves to DB independently.
  // Each stage failure is recorded but never propagated.

  summary.totalDurationMs = Date.now() - pipelineStart;
  summary.completedAt = new Date().toISOString();

  ctx.log(
    "Pipeline Runner",
    `Pipeline complete in ${summary.totalDurationMs}ms. ` +
    `Stages: ${Object.entries(summary.stages).map(([k, v]) => `${k}:${v.status}`).join(", ")}`
  );

  return summary;
}
