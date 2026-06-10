/**
 * db-pipeline.ts
 *
 * Database helpers for pipeline observability (Phase 1).
 *
 * Provides lightweight read/write functions for:
 *   - pipeline_runs  — one row per full pipeline execution
 *   - pipeline_jobs  — one row per (runId, stageId) pair
 *
 * Design principles:
 *   • All writes are fire-and-forget (non-blocking) — pipeline execution
 *     is NEVER delayed or blocked by observability writes.
 *   • All writes are wrapped in try/catch — a DB failure here must never
 *     propagate to the pipeline and cause a claim to fail.
 *   • All reads are used only by the admin dashboard and tRPC queries —
 *     they are never on the critical path.
 */

// @ts-nocheck
import { eq, and, desc, sql as drizzleSql } from "drizzle-orm";
import { getDb } from "./db";
import { pipelineJobs, pipelineRuns } from "../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface StageStartPayload {
  runId: string;
  claimId: number;
  stageId: string;
  stageLabel: string;
  stageIndex: number;
  tenantId?: string | null;
}

export interface StageCompletePayload {
  runId: string;
  stageId: string;
  durationMs: number;
  isDegraded?: boolean;
  isTimeout?: boolean;
  errorMessage?: string | null;
  llmTokensInput?: number | null;
  llmTokensOutput?: number | null;
  llmModel?: string | null;
  assumptionCount?: number;
  recoveryActionCount?: number;
  status: "completed" | "failed" | "skipped" | "degraded";
}

export interface RunStartPayload {
  runId: string;
  claimId: number;
  tenantId?: string | null;
  triggeredBy?: string | null;
  triggerReason?: string | null;
  isRerun?: boolean;
}

export interface RunCompletePayload {
  runId: string;
  status: "completed" | "failed" | "partial";
  totalDurationMs: number;
  totalLlmTokens?: number;
  stagesCompleted: number;
  stagesFailed: number;
  stagesDegraded: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function recordRunStart(payload: RunStartPayload): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(pipelineRuns).values({
      runId: payload.runId,
      claimId: payload.claimId,
      tenantId: payload.tenantId ?? null,
      triggeredBy: payload.triggeredBy ?? null,
      triggerReason: payload.triggerReason ?? null,
      status: "running",
      isRerun: payload.isRerun ? 1 : 0,
      startedAt: nowStr(),
    });
  } catch (err) {
    console.warn("[db-pipeline] recordRunStart failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

export async function recordRunComplete(payload: RunCompletePayload): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(pipelineRuns)
      .set({
        status: payload.status,
        totalDurationMs: payload.totalDurationMs,
        totalLlmTokens: payload.totalLlmTokens ?? null,
        stagesCompleted: payload.stagesCompleted,
        stagesFailed: payload.stagesFailed,
        stagesDegraded: payload.stagesDegraded,
        completedAt: nowStr(),
      })
      .where(eq(pipelineRuns.runId, payload.runId));
  } catch (err) {
    console.warn("[db-pipeline] recordRunComplete failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export async function recordStageStart(payload: StageStartPayload): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(pipelineJobs).values({
      claimId: payload.claimId,
      runId: payload.runId,
      stageId: payload.stageId,
      stageLabel: payload.stageLabel,
      stageIndex: payload.stageIndex,
      status: "running",
      startedAt: nowStr(),
      tenantId: payload.tenantId ?? null,
    });
  } catch (err) {
    console.warn("[db-pipeline] recordStageStart failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

export async function recordStageComplete(payload: StageCompletePayload): Promise<void> {
  try {
    const db = await getDb();
    await db
      .update(pipelineJobs)
      .set({
        status: payload.status,
        completedAt: nowStr(),
        durationMs: payload.durationMs,
        isDegraded: payload.isDegraded ? 1 : 0,
        isTimeout: payload.isTimeout ? 1 : 0,
        errorMessage: payload.errorMessage ?? null,
        llmTokensInput: payload.llmTokensInput ?? null,
        llmTokensOutput: payload.llmTokensOutput ?? null,
        llmModel: payload.llmModel ?? null,
        assumptionCount: payload.assumptionCount ?? 0,
        recoveryActionCount: payload.recoveryActionCount ?? 0,
      })
      .where(
        and(
          eq(pipelineJobs.runId, payload.runId),
          eq(pipelineJobs.stageId, payload.stageId)
        )
      );
  } catch (err) {
    console.warn("[db-pipeline] recordStageComplete failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// READ HELPERS (admin dashboard + tRPC queries)
// ─────────────────────────────────────────────────────────────────────────────

export async function getRunStages(runId: string) {
  try {
    const db = await getDb();
    return await db
      .select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, runId))
      .orderBy(pipelineJobs.stageIndex);
  } catch (err) {
    console.warn("[db-pipeline] getRunStages failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getLatestRunForClaim(claimId: number) {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.claimId, claimId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.warn("[db-pipeline] getLatestRunForClaim failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function getRunHistoryForClaim(claimId: number, limit = 10) {
  try {
    const db = await getDb();
    return await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.claimId, claimId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
  } catch (err) {
    console.warn("[db-pipeline] getRunHistoryForClaim failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getRecentRuns(tenantId?: string | null, limit = 50) {
  try {
    const db = await getDb();
    return await db
      .select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
  } catch (err) {
    console.warn("[db-pipeline] getRecentRuns failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getStageHealthStats(tenantId?: string | null) {
  try {
    const db = await getDb();
    return await db
      .select({
        stageId: pipelineJobs.stageId,
        stageLabel: pipelineJobs.stageLabel,
        stageIndex: pipelineJobs.stageIndex,
        total: drizzleSql`COUNT(*)`,
        completed: drizzleSql`SUM(CASE WHEN ${pipelineJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: drizzleSql`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
        degraded: drizzleSql`SUM(CASE WHEN ${pipelineJobs.status} = 'degraded' THEN 1 ELSE 0 END)`,
        timedOut: drizzleSql`SUM(CASE WHEN ${pipelineJobs.isTimeout} = 1 THEN 1 ELSE 0 END)`,
        avgDurationMs: drizzleSql`ROUND(AVG(${pipelineJobs.durationMs}))`,
        maxDurationMs: drizzleSql`MAX(${pipelineJobs.durationMs})`,
        totalTokensIn: drizzleSql`SUM(${pipelineJobs.llmTokensInput})`,
        totalTokensOut: drizzleSql`SUM(${pipelineJobs.llmTokensOutput})`,
      })
      .from(pipelineJobs)
      .groupBy(pipelineJobs.stageId, pipelineJobs.stageLabel, pipelineJobs.stageIndex)
      .orderBy(pipelineJobs.stageIndex);
  } catch (err) {
    console.warn("[db-pipeline] getStageHealthStats failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function getPipelineOverallStats() {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        total: drizzleSql`COUNT(*)`,
        completed: drizzleSql`SUM(CASE WHEN ${pipelineRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: drizzleSql`SUM(CASE WHEN ${pipelineRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
        partial: drizzleSql`SUM(CASE WHEN ${pipelineRuns.status} = 'partial' THEN 1 ELSE 0 END)`,
        running: drizzleSql`SUM(CASE WHEN ${pipelineRuns.status} = 'running' THEN 1 ELSE 0 END)`,
        avgDurationMs: drizzleSql`ROUND(AVG(${pipelineRuns.totalDurationMs}))`,
        totalLlmTokens: drizzleSql`SUM(${pipelineRuns.totalLlmTokens})`,
      })
      .from(pipelineRuns);
    return rows[0] ?? null;
  } catch (err) {
    console.warn("[db-pipeline] getPipelineOverallStats failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
