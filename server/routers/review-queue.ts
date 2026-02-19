// @ts-nocheck
/**
 * Review Queue Router
 * tRPC procedures for human review queue management
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getPendingReviews,
  getReviewQueueStats,
  submitReviewDecision,
  getClaimReviewHistory,
  bulkApproveReviews,
} from "../services/ingestion-review-queue";

export const reviewQueueRouter = router({
  /**
   * Get pending review queue items
   */
  getPending: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getPendingReviews({
        tenantId: ctx.user.tenantId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get review queue statistics
   */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      return getReviewQueueStats({
        tenantId: ctx.user.tenantId,
      });
    }),

  /**
   * Submit a review decision
   */
  submitDecision: protectedProcedure
    .input(z.object({
      reviewQueueId: z.number(),
      decision: z.enum(["approve", "reject", "needs_correction"]),
      reviewerNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await submitReviewDecision({
        tenantId: ctx.user.tenantId,
        reviewQueueId: input.reviewQueueId,
        reviewerId: ctx.user.id,
        reviewerName: ctx.user.name || ctx.user.email,
        decision: input.decision,
        reviewerNotes: input.reviewerNotes,
      });

      return { success: true };
    }),

  /**
   * Get review history for a claim
   */
  getClaimHistory: protectedProcedure
    .input(z.object({
      historicalClaimId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      return getClaimReviewHistory({
        tenantId: ctx.user.tenantId,
        historicalClaimId: input.historicalClaimId,
      });
    }),

  /**
   * Bulk approve claims
   */
  bulkApprove: protectedProcedure
    .input(z.object({
      reviewQueueIds: z.array(z.number()),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bulkApproveReviews({
        tenantId: ctx.user.tenantId,
        reviewQueueIds: input.reviewQueueIds,
        reviewerId: ctx.user.id,
        reviewerName: ctx.user.name || ctx.user.email,
        notes: input.notes,
      });
    }),
});
