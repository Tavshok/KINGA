
/**
 * Claim Replay tRPC Router
 * 
 * API endpoints for historical claim replay functionality.
 * Enables re-processing historical claims through current KINGA AI system.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { historicalClaims, historicalReplayResults } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { replayHistoricalClaim } from "../services/claim-replay-comparison";

// Middleware for replay operations (requires insurer_admin or executive role)
const replayProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new Error("Unauthorized: Authentication required");
  }
  
  const allowedRoles = ["insurer_admin", "executive", "claims_manager"];
  if (!ctx.user.insurerRole || !allowedRoles.includes(ctx.user.insurerRole)) {
    throw new Error(`Forbidden: Requires one of the following roles: ${allowedRoles.join(", ")}`);
  }
  
  return next({ ctx });
});

export const claimReplayRouter = router({
  /**
   * Replay a single historical claim
   */
  replayHistoricalClaim: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await replayHistoricalClaim(
        input.historicalClaimId,
        ctx.user.id
      );
      
      return {
        success: true,
        replayResultId: result.replayResultId,
        metrics: result.metrics,
        message: `Replay completed: ${result.metrics.performanceSummary}`,
      };
    }),
  
  /**
   * Get replay results for a historical claim
   */
  getReplayResults: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const results = await db
        .select()
        .from(historicalReplayResults)
        .where(
          and(
            eq(historicalReplayResults.historicalClaimId, input.historicalClaimId),
            eq(historicalReplayResults.tenantId, ctx.user.tenantId!)
          )
        )
        .orderBy(desc(historicalReplayResults.replayVersion));
      
      return results;
    }),
  
  /**
   * Get latest replay result for a historical claim
   */
  getLatestReplayResult: replayProcedure
    .input(z.object({
      historicalClaimId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const [result] = await db
        .select()
        .from(historicalReplayResults)
        .where(
          and(
            eq(historicalReplayResults.historicalClaimId, input.historicalClaimId),
            eq(historicalReplayResults.tenantId, ctx.user.tenantId!)
          )
        )
        .orderBy(desc(historicalReplayResults.replayVersion))
        .limit(1);
      
      return result || null;
    }),
  
  /**
   * Get all replay results for tenant
   */
  getAllReplayResults: replayProcedure
    .input(z.object({
      limit: z.number().int().positive().optional().default(100),
      offset: z.number().int().nonnegative().optional().default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const results = await db
        .select()
        .from(historicalReplayResults)
        .where(eq(historicalReplayResults.tenantId, ctx.user.tenantId!))
        .orderBy(desc(historicalReplayResults.replayedAt))
        .limit(input.limit)
        .offset(input.offset);
      
      return results;
    }),
  
  /**
   * Get replay statistics for tenant
   */
  getReplayStatistics: replayProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const results = await db
        .select()
        .from(historicalReplayResults)
        .where(eq(historicalReplayResults.tenantId, ctx.user.tenantId!));
      
      if (results.length === 0) {
        return {
          totalReplays: 0,
          decisionMatchRate: 0,
          averagePayoutVariancePercentage: 0,
          averageProcessingTimeDeltaPercentage: 0,
          recommendedActions: {
            adopt_kinga: 0,
            review_policy: 0,
            manual_review: 0,
            no_action: 0,
          },
        };
      }
      
      const decisionMatches = results.filter((r: any) => r.decisionMatch === 1).length;
      const decisionMatchRate = (decisionMatches / results.length) * 100;
      
      const totalPayoutVariance = results.reduce((sum: number, r: any) => 
        sum + Math.abs(Number(r.payoutVariancePercentage) || 0), 0
      );
      const averagePayoutVariancePercentage = totalPayoutVariance / results.length;
      
      const totalProcessingTimeDelta = results.reduce((sum: number, r: any) => 
        sum + Math.abs(Number(r.processingTimeDeltaPercentage) || 0), 0
      );
      const averageProcessingTimeDeltaPercentage = totalProcessingTimeDelta / results.length;
      
      const recommendedActions = {
        adopt_kinga: results.filter((r: any) => r.recommendedAction === "adopt_kinga").length,
        review_policy: results.filter((r: any) => r.recommendedAction === "review_policy").length,
        manual_review: results.filter((r: any) => r.recommendedAction === "manual_review").length,
        no_action: results.filter((r: any) => r.recommendedAction === "no_action").length,
      };
      
      return {
        totalReplays: results.length,
        decisionMatchRate,
        averagePayoutVariancePercentage,
        averageProcessingTimeDeltaPercentage,
        recommendedActions,
      };
    }),
  
  /**
   * Batch replay multiple historical claims
   */
  batchReplayHistoricalClaims: replayProcedure
    .input(z.object({
      historicalClaimIds: z.array(z.number().int().positive()).max(100), // Max 100 claims per batch
    }))
    .mutation(async ({ input, ctx }) => {
      const results = [];
      const errors = [];
      
      for (const historicalClaimId of input.historicalClaimIds) {
        try {
          const result = await replayHistoricalClaim(historicalClaimId, ctx.user.id);
          results.push({
            historicalClaimId,
            success: true,
            replayResultId: result.replayResultId,
            metrics: result.metrics,
          });
        } catch (error) {
          errors.push({
            historicalClaimId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      
      return {
        totalProcessed: input.historicalClaimIds.length,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      };
    }),
  
  /**
   * Get historical claims eligible for replay
   */
  getEligibleHistoricalClaims: replayProcedure
    .input(z.object({
      limit: z.number().int().positive().optional().default(100),
      offset: z.number().int().nonnegative().optional().default(0),
      onlyUnreplayed: z.boolean().optional().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const whereClause = input.onlyUnreplayed
        ? and(eq(historicalClaims.tenantId, ctx.user.tenantId!), eq(historicalClaims.replayMode, 0))
        : eq(historicalClaims.tenantId, ctx.user.tenantId!);
      
      const claims = await db
        .select()
        .from(historicalClaims)
        .where(whereClause)
        .orderBy(desc(historicalClaims.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      
      return claims;
    }),
});
