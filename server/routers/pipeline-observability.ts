/**
 * Pipeline Observability Router (Phase 1)
 *
 * Provides tRPC queries for the admin pipeline dashboard:
 * - getRecentRuns: last N pipeline runs with stage summaries
 * - getRunDetail: all stage records for a specific runId
 * - getStageHealth: aggregate success/failure/degraded counts per stageId
 * - getClaimRuns: all runs for a specific claimId
 *
 * All procedures are admin-only (insurerRole: claims_manager | executive | admin).
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { pipelineRuns, pipelineJobs } from "../../drizzle/schema";
import { desc, eq, gte, sql } from "drizzle-orm";

const ADMIN_ROLES = new Set(["claims_manager", "executive", "admin", "super_admin"]);

function assertAdmin(user: { insurerRole?: string | null; role?: string | null }) {
  const role = user.insurerRole ?? user.role ?? "";
  if (!ADMIN_ROLES.has(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Pipeline observability requires admin access" });
  }
}

export const pipelineObservabilityRouter = router({
  /**
   * Get the most recent pipeline runs (default: last 50).
   * Returns run-level summary — no stage detail.
   */
  getRecentRuns: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const runs = await db
        .select()
        .from(pipelineRuns)
        .orderBy(desc(pipelineRuns.startedAt))
        .limit(input.limit);

      return runs;
    }),

  /**
   * Get all stage records for a specific runId.
   */
  getRunDetail: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [run] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.runId, input.runId))
        .limit(1);

      const jobs = await db
        .select()
        .from(pipelineJobs)
        .where(eq(pipelineJobs.runId, input.runId))
        .orderBy(pipelineJobs.stageIndex);

      return { run: run ?? null, jobs };
    }),

  /**
   * Aggregate stage health across all runs in the last N days.
   * Returns per-stageId: total, completed, failed, degraded, avgDurationMs.
   */
  getStageHealth: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const rows = await db
        .select({
          stageId: pipelineJobs.stageId,
          stageLabel: pipelineJobs.stageLabel,
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
          degraded: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'degraded' THEN 1 ELSE 0 END)`,
          avgDurationMs: sql<number>`AVG(${pipelineJobs.durationMs})`,
          p95DurationMs: sql<number>`MAX(${pipelineJobs.durationMs})`,
        })
        .from(pipelineJobs)
        .where(gte(pipelineJobs.startedAt, since))
        .groupBy(pipelineJobs.stageId, pipelineJobs.stageLabel)
        .orderBy(pipelineJobs.stageId);

      return rows;
    }),

  /**
   * Get all pipeline runs for a specific claim.
   */
  getClaimRuns: protectedProcedure
    .input(z.object({ claimId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const runs = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.claimId, input.claimId))
        .orderBy(desc(pipelineRuns.startedAt))
        .limit(20);

      return runs;
    }),

  /**
   * Dashboard summary: run counts, success rate, avg duration over last N days.
   */
  getDashboardSummary: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const [summary] = await db
        .select({
          totalRuns: sql<number>`COUNT(*)`,
          completedRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
          failedRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
          partialRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'partial' THEN 1 ELSE 0 END)`,
          runningRuns: sql<number>`SUM(CASE WHEN ${pipelineRuns.status} = 'running' THEN 1 ELSE 0 END)`,
          avgDurationMs: sql<number>`AVG(${pipelineRuns.totalDurationMs})`,
          totalLlmTokens: sql<number>`SUM(${pipelineRuns.totalLlmTokens})`,
        })
        .from(pipelineRuns)
        .where(gte(pipelineRuns.startedAt, since));

      return summary ?? {
        totalRuns: 0, completedRuns: 0, failedRuns: 0, partialRuns: 0,
        runningRuns: 0, avgDurationMs: 0, totalLlmTokens: 0,
      };
    }),
});
