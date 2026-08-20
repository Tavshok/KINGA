/**
 * ML Router - Machine Learning & Training Data Management
 * 
 * Handles confidence scoring, batch ingestion, and review queue for safe historical claims learning.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  calculateConfidenceScore,
  saveConfidenceScore,
  addToReviewQueue,
  processClaimConfidenceScore,
} from "../ml/confidence-scoring";
import {
  historicalClaims,
  trainingDataScores,
  claimReviewQueue,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

function requireMlTenant(ctx: { user?: { tenantId?: string | null } | null }): string {
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  return tenantId;
}

export const mlRouter = router({
  // ============================================================================
  // CONFIDENCE SCORING
  // ============================================================================

  /**
   * Calculate confidence score for a historical claim
   */
  calculateConfidenceScore: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [claim] = await db.select({ id: historicalClaims.id }).from(historicalClaims)
        .where(and(eq(historicalClaims.id, input.claimId), eq(historicalClaims.tenantId, requireMlTenant(ctx))))
        .limit(1);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Historical claim not found" });
      const result = await calculateConfidenceScore(input.claimId);
      return result;
    }),

  /**
   * Calculate and save confidence score with review queue routing
   */
  processConfidenceScore: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireMlTenant(ctx);
      const result = await processClaimConfidenceScore(input.claimId, tenantId);
      return result;
    }),

  /**
   * Get confidence score for a claim
   */
  getConfidenceScore: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const tenantId = requireMlTenant(ctx);

      const scores = await db
        .select()
        .from(trainingDataScores)
        .innerJoin(historicalClaims, eq(trainingDataScores.historicalClaimId, historicalClaims.id))
        .where(and(
          eq(trainingDataScores.historicalClaimId, input.claimId),
          eq(historicalClaims.tenantId, tenantId),
        ))
        .limit(1);

      if (scores.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Confidence score not found" });
      }

      return scores[0];
    }),

  // ============================================================================
  // REVIEW QUEUE
  // ============================================================================

  /**
   * Get pending claims in review queue
   */
  getReviewQueue: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending_review", "in_review", "approved", "rejected", "needs_more_info"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = requireMlTenant(ctx);

      let query = db
        .select({
          queueItem: claimReviewQueue,
          claim: historicalClaims,
          score: trainingDataScores,
        })
        .from(claimReviewQueue)
        .leftJoin(historicalClaims, eq(claimReviewQueue.historicalClaimId, historicalClaims.id))
        .leftJoin(trainingDataScores, eq(claimReviewQueue.historicalClaimId, trainingDataScores.historicalClaimId))
        .where(eq(claimReviewQueue.tenantId, tenantId))
        .orderBy(desc(claimReviewQueue.reviewPriority), desc(claimReviewQueue.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const results = await query;

      return {
        items: results,
        total: results.length,
      };
    }),

  /**
   * Approve claim for training dataset
   */
  approveForTraining: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Update review queue status
      await db
        .update(claimReviewQueue)
        .set({
          reviewStatus: "approved",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date().toISOString(),
          reviewDecision: "approve",
          reviewNotes: input.reviewNotes,
          includeInTrainingDataset: 1,
        })
        .where(and(
          eq(claimReviewQueue.historicalClaimId, input.claimId),
          eq(claimReviewQueue.tenantId, requireMlTenant(ctx)),
        ));

      return { success: true };
    }),

  /**
   * Reject claim from training dataset
   */
  rejectForTraining: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        reviewNotes: z.string(),
        rejectionReason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Update review queue status
      await db
        .update(claimReviewQueue)
        .set({
          reviewStatus: "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date().toISOString(),
          reviewDecision: "reject",
          reviewNotes: `${input.rejectionReason}\n\n${input.reviewNotes}`,
          includeInTrainingDataset: 0,
        })
        .where(and(
          eq(claimReviewQueue.historicalClaimId, input.claimId),
          eq(claimReviewQueue.tenantId, requireMlTenant(ctx)),
        ));

      return { success: true };
    }),

  /**
   * Get review queue statistics
   */
  getReviewQueueStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const tenantId = requireMlTenant(ctx);

    // Get counts by status
    const allItems = await db
      .select()
      .from(claimReviewQueue)
      .where(eq(claimReviewQueue.tenantId, tenantId));

    const stats = {
      total: allItems.length,
      pending: allItems.filter((item: typeof allItems[number]) => item.reviewStatus === "pending_review").length,
      inReview: allItems.filter((item: typeof allItems[number]) => item.reviewStatus === "in_review").length,
      approved: allItems.filter((item: typeof allItems[number]) => item.reviewStatus === "approved").length,
      rejected: allItems.filter((item: typeof allItems[number]) => item.reviewStatus === "rejected").length,
      needsMoreInfo: allItems.filter((item: typeof allItems[number]) => item.reviewStatus === "needs_more_info").length,
      highPriority: allItems.filter((item: typeof allItems[number]) => item.reviewPriority === "high").length,
    };

    return stats;
  }),
});
