/**
 * KINGA Pipeline Observability Helpers
 * 
 * Fire-and-forget write helpers and safe-read helpers for pipeline run tracking.
 * All write helpers swallow errors (never throw) — pipeline failures must not
 * cascade into observability failures.
 * All read helpers return empty/null on DB failure.
 * 
 * Tables: pipeline_runs, pipeline_jobs
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import { pipelineRuns, pipelineJobs } from "../drizzle/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RunStartPayload {
  runId: string;
  claimId: number;
  tenantId?: string | null;
  triggeredBy?: string | null;
  triggerReason?: string | null;
  isRerun?: boolean;
  startedAt?: string;
}

export interface RunCompletePayload {
  runId: string;
  status: "completed" | "failed" | "partial";
  totalDurationMs: number;
  stagesCompleted: number;
  stagesFailed: number;
  stagesDegraded: number;
  totalLlmTokens?: number;
}

export interface StageStartPayload {
  runId: string;
  claimId: number;
  stageId: string;
  stageIndex: number;
  stageLabel: string;
  tenantId?: string | null;
}

export interface StageCompletePayload {
  runId: string;
  stageId: string;
  status: "completed" | "failed" | "skipped" | "degraded";
  durationMs: number;
  isDegraded?: boolean;
  isTimeout?: boolean;
  llmTokensInput?: number;
  llmTokensOutput?: number;
  llmModel?: string;
  assumptionCount?: number;
  recoveryActionCount?: number;
  errorMessage?: string;
}

// ─── Write helpers (fire-and-forget) ─────────────────────────────────────────

export async function recordRunStart(payload: RunStartPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(pipelineRuns).values({
      runId: payload.runId,
      claimId: payload.claimId,
      tenantId: payload.tenantId ?? null,
      triggeredBy: payload.triggeredBy ?? null,
      triggerReason: payload.triggerReason ?? null,
      isRerun: payload.isRerun ? 1 : 0,
      status: "running",
      startedAt: payload.startedAt ?? new Date().toISOString(),
    });
  } catch {
    // Fire-and-forget: never throw
  }
}

export async function recordRunComplete(payload: RunCompletePayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(pipelineRuns)
      .set({
        status: payload.status,
        totalDurationMs: payload.totalDurationMs,
        stagesCompleted: payload.stagesCompleted,
        stagesFailed: payload.stagesFailed,
        stagesDegraded: payload.stagesDegraded,
        totalLlmTokens: payload.totalLlmTokens ?? 0,
        completedAt: new Date().toISOString(),
      })
      .where(eq(pipelineRuns.runId, payload.runId));
  } catch {
    // Fire-and-forget: never throw
  }
}

export async function recordStageStart(payload: StageStartPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(pipelineJobs).values({
      runId: payload.runId,
      claimId: payload.claimId,
      stageId: payload.stageId,
      stageIndex: payload.stageIndex,
      stageLabel: payload.stageLabel,
      tenantId: payload.tenantId ?? null,
      status: "running",
      startedAt: new Date().toISOString(),
    });
  } catch {
    // Fire-and-forget: never throw
  }
}

export async function recordStageComplete(payload: StageCompletePayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(pipelineJobs)
      .set({
        status: payload.status,
        durationMs: payload.durationMs,
        isDegraded: payload.isDegraded ? 1 : 0,
        isTimeout: payload.isTimeout ? 1 : 0,
        llmTokensInput: payload.llmTokensInput ?? 0,
        llmTokensOutput: payload.llmTokensOutput ?? 0,
        llmModel: payload.llmModel ?? null,
        assumptionCount: payload.assumptionCount ?? 0,
        recoveryActionCount: payload.recoveryActionCount ?? 0,
        errorMessage: payload.errorMessage ?? null,
        completedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(pipelineJobs.runId, payload.runId),
          eq(pipelineJobs.stageId, payload.stageId),
        )
      );
  } catch {
    // Fire-and-forget: never throw
  }
}

// ─── Read helpers (return safe defaults on failure) ───────────────────────────

export async function getRunStages(runId: string): Promise<typeof pipelineJobs.$inferSelect[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.select()
      .from(pipelineJobs)
      .where(eq(pipelineJobs.runId, runId))
      .orderBy(pipelineJobs.stageIndex);
  } catch {
    return [];
  }
}

export async function getLatestRunForClaim(claimId: number): Promise<typeof pipelineRuns.$inferSelect | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.claimId, claimId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getRecentRuns(limit = 50): Promise<typeof pipelineRuns.$inferSelect[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getStageHealthStats(): Promise<{
  stageId: string;
  stageLabel: string;
  totalRuns: number;
  failedRuns: number;
  avgDurationMs: number;
}[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      stageId: pipelineJobs.stageId,
      stageLabel: pipelineJobs.stageLabel,
      totalRuns: sql<number>`COUNT(*)`,
      failedRuns: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
      avgDurationMs: sql<number>`AVG(${pipelineJobs.durationMs})`,
    })
      .from(pipelineJobs)
      .groupBy(pipelineJobs.stageId, pipelineJobs.stageLabel)
      .orderBy(pipelineJobs.stageId);
    return rows as any;
  } catch {
    return [];
  }
}

export async function getPipelineOverallStats(): Promise<{
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  avgDurationMs: number;
} | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select({
      totalRuns: sql<number>`COUNT(*)`,
      completedRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
      failedRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
      avgDurationMs: sql<number>`AVG(${pipelineRuns.totalDurationMs})`,
    }).from(pipelineRuns);
    return (rows[0] as any) ?? null;
  } catch {
    return null;
  }
}

// ─── Stage result cache (resume support) ─────────────────────────────────────

/**
 * Persist a completed stage's output JSON so the pipeline can resume
 * from a checkpoint if interrupted.
 * Fire-and-forget — never throws.
 */
export async function saveStageResult(runId: string, stageId: string, data: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(pipelineJobs)
      .set({ resultJson: JSON.stringify(data) })
      .where(
        and(
          eq(pipelineJobs.runId, runId),
          eq(pipelineJobs.stageId, stageId),
        )
      );
  } catch {
    // Fire-and-forget: never throw
  }
}

/**
 * Load all completed stage results for a run so the pipeline can skip
 * already-completed stages on resume.
 * Returns an empty map on failure.
 */
export async function loadCompletedStages(runId: string): Promise<Record<string, unknown>> {
  try {
    const db = await getDb();
    if (!db) return {};
    const rows = await db.select({
      stageId: pipelineJobs.stageId,
      status: pipelineJobs.status,
      resultJson: (pipelineJobs as any).resultJson,
    })
      .from(pipelineJobs)
      .where(
        and(
          eq(pipelineJobs.runId, runId),
          eq(pipelineJobs.status, "completed"),
        )
      );
    const cache: Record<string, unknown> = {};
    for (const row of rows) {
      if (row.resultJson) {
        try { cache[row.stageId] = JSON.parse(row.resultJson as string); } catch { /* skip */ }
      }
    }
    return cache;
  } catch {
    return {};
  }
}
