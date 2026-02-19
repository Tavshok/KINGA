// @ts-nocheck
/**
 * AI Analysis Router
 * 
 * tRPC procedures for governed AI rerun capability.
 * 
 * Procedures:
 * - triggerRerun: Trigger AI analysis rerun (all insurer roles)
 * - recalculateConfidence: Recalculate confidence score (claims_manager, executive only)
 * - triggerRoutingReevaluation: Trigger routing reevaluation (claims_manager, executive only)
 * - getVersionHistory: Get AI analysis version history (all insurer roles)
 * - getRateLimitStatus: Get current rate limit status (all insurer roles)
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  triggerAIAnalysis,
  recalculateConfidenceScore,
  triggerRoutingReevaluation,
  getAIAnalysisVersionHistory,
  canTriggerAIAnalysis,
  canRecalculateConfidence,
} from "../ai-rerun-service";
import {
  checkRateLimit,
  recordRateLimitAction,
  getRateLimitStatus,
} from "../rate-limiter";
import { TRPCError } from "@trpc/server";

export const aiAnalysisRouter = router({
  /**
   * Trigger AI analysis rerun
   * 
   * All insurer roles can trigger this operation.
   * Rate limited per user per hour (tenant-configurable).
   */
  triggerRerun: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { claimId, reason } = input;

      // Verify user has insurer role
      if (!user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users can trigger AI analysis",
        });
      }

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Permission check
      if (!canTriggerAIAnalysis(user.insurerRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient permissions to trigger AI analysis",
        });
      }

      // Rate limit check
      await checkRateLimit(user.id, user.tenantId, "ai_rerun");

      // Trigger AI analysis
      const result = await triggerAIAnalysis(
        claimId,
        user.id,
        user.insurerRole,
        user.tenantId,
        reason
      );

      // Record rate limit action
      await recordRateLimitAction(user.id, user.tenantId, "ai_rerun");

      return result;
    }),

  /**
   * Recalculate confidence score
   * 
   * Only claims_manager and executive can trigger this operation.
   * Rate limited per user per hour (tenant-configurable).
   */
  recalculateConfidence: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { claimId } = input;

      // Verify user has insurer role
      if (!user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users can recalculate confidence scores",
        });
      }

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Permission check
      if (!canRecalculateConfidence(user.insurerRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only claims_manager and executive can recalculate confidence scores",
        });
      }

      // Rate limit check
      await checkRateLimit(user.id, user.tenantId, "confidence_recalc");

      // Recalculate confidence score
      const result = await recalculateConfidenceScore(
        claimId,
        user.id,
        user.insurerRole,
        user.tenantId
      );

      // Record rate limit action
      await recordRateLimitAction(user.id, user.tenantId, "confidence_recalc");

      return result;
    }),

  /**
   * Trigger routing reevaluation
   * 
   * Only claims_manager and executive can trigger this operation.
   * Rate limited per user per hour (tenant-configurable).
   */
  triggerRoutingReevaluation: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const { claimId } = input;

      // Verify user has insurer role
      if (!user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users can trigger routing reevaluation",
        });
      }

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Permission check
      if (!canRecalculateConfidence(user.insurerRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only claims_manager and executive can trigger routing reevaluation",
        });
      }

      // Rate limit check
      await checkRateLimit(user.id, user.tenantId, "routing_reevaluation");

      // Trigger routing reevaluation
      const result = await triggerRoutingReevaluation(
        claimId,
        user.id,
        user.insurerRole,
        user.tenantId
      );

      // Record rate limit action
      await recordRateLimitAction(user.id, user.tenantId, "routing_reevaluation");

      return result;
    }),

  /**
   * Get AI analysis version history
   * 
   * Returns all AI assessment versions for a claim.
   * All insurer roles can view version history.
   */
  getVersionHistory: protectedProcedure
    .input(
      z.object({
        claimId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { claimId } = input;

      // Verify user has insurer role
      if (!user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users can view AI analysis version history",
        });
      }

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Permission check
      if (!canTriggerAIAnalysis(user.insurerRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient permissions to view AI analysis version history",
        });
      }

      // Get version history
      const versions = await getAIAnalysisVersionHistory(claimId, user.tenantId);

      return versions;
    }),

  /**
   * Get rate limit status
   * 
   * Returns current rate limit status for the user (current count, limit, remaining quota).
   * All insurer roles can check their rate limit status.
   */
  getRateLimitStatus: protectedProcedure
    .input(
      z.object({
        actionType: z.enum(["ai_rerun", "confidence_recalc", "routing_reevaluation"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const { user } = ctx;
      const { actionType } = input;

      // Verify user has insurer role
      if (!user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer users can check rate limit status",
        });
      }

      // Verify user has tenant
      if (!user.tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User must belong to a tenant",
        });
      }

      // Get rate limit status
      const status = await getRateLimitStatus(user.id, user.tenantId, actionType);

      return status;
    }),
});
