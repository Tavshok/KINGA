// @ts-nocheck
/**
 * Routing Policy Version Router
 * 
 * tRPC procedures for policy versioning, historical policy retrieval,
 * routing decision replay, and audit reproducibility.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createPolicyVersion,
  getHistoricalPolicyByVersion,
  getHistoricalPolicyByTimestamp,
  getPolicyVersionHistory,
  comparePolicyVersions,
  replayRoutingDecision,
  validateReplayAccuracy,
} from "../routing-policy-version-manager";
import { TRPCError } from "@trpc/server";

export const routingPolicyVersionRouter = router({
  /**
   * Get policy version history for tenant
   * Returns all policy versions ordered by version number (newest first)
   */
  getPolicyVersionHistory: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(), // Optional for super_admin
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot view policy versions for other tenants",
        });
      }

      const versions = await getPolicyVersionHistory(tenantId);

      return {
        tenantId,
        versions,
        totalVersions: versions.length,
      };
    }),

  /**
   * Get historical policy by version number
   */
  getHistoricalPolicyByVersion: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      version: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot view policy versions for other tenants",
        });
      }

      const policy = await getHistoricalPolicyByVersion(tenantId, input.version);

      if (!policy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Policy version ${input.version} not found`,
        });
      }

      return policy;
    }),

  /**
   * Get historical policy by timestamp
   * Returns the policy that was active at the given timestamp
   */
  getHistoricalPolicyByTimestamp: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      timestamp: z.string().datetime(), // ISO 8601 datetime string
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot view policy versions for other tenants",
        });
      }

      const timestamp = new Date(input.timestamp);
      const policy = await getHistoricalPolicyByTimestamp(tenantId, timestamp);

      if (!policy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No policy found active at ${input.timestamp}`,
        });
      }

      return policy;
    }),

  /**
   * Compare two policy versions
   * Returns the differences between two policy versions
   */
  comparePolicyVersions: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      version1: z.number().int().positive(),
      version2: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot compare policy versions for other tenants",
        });
      }

      const comparison = await comparePolicyVersions(
        tenantId,
        input.version1,
        input.version2
      );

      return comparison;
    }),

  /**
   * Replay routing decision using historical policy
   * Re-routes a claim using a specific historical policy version
   * Claims Manager and Executive only
   */
  replayRoutingDecision: protectedProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      tenantId: z.string().optional(),
      policyVersion: z.number().int().positive(),
      confidenceScore: z.number().min(0).max(100),
      claimValue: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      const allowedRoles = ["claims_manager", "executive", "super_admin"];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Only Claims Managers and Executives can replay routing decisions",
        });
      }

      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot replay routing decisions for other tenants",
        });
      }

      const result = await replayRoutingDecision(
        input.claimId,
        tenantId,
        input.policyVersion,
        input.confidenceScore,
        input.claimValue
      );

      return {
        claimId: input.claimId,
        policyVersion: input.policyVersion,
        routedWorkflow: result.routedWorkflow,
        routingReason: result.routingReason,
        policyUsed: result.policyUsed,
        replayedAt: new Date().toISOString(),
        replayedBy: ctx.user.id,
      };
    }),

  /**
   * Validate replay accuracy
   * Compares a historical routing decision with a replayed decision
   * to ensure reproducibility
   * Claims Manager and Executive only
   */
  validateReplayAccuracy: protectedProcedure
    .input(z.object({
      originalDecisionId: z.number().int().positive(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      // Role-based access control
      const allowedRoles = ["claims_manager", "executive", "super_admin"];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Only Claims Managers and Executives can validate replay accuracy",
        });
      }

      if (ctx.user.role !== "super_admin" && ctx.user.tenantId !== tenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied: Cannot validate replay accuracy for other tenants",
        });
      }

      const validation = await validateReplayAccuracy(
        input.originalDecisionId,
        tenantId
      );

      return validation;
    }),
});
