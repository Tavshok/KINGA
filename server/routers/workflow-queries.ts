// @ts-nocheck
/**
 * Workflow Query Router
 * 
 * Centralized procedures for querying claims by workflow state with:
 * - Tenant isolation
 * - Role-based access control
 * - Pagination support
 * - Total count tracking
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { claims } from "../../drizzle/schema";
import { eq, and, count, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { InsurerRole, WorkflowState } from "../rbac";
import { getDb } from "../db";

// Role-based state access control matrix
const ROLE_STATE_ACCESS: Record<InsurerRole, readonly string[]> = {
  claims_processor: [
    "created", "intake_queue", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "approved", "rejected", "completed", "cancelled"
  ],
  assessor_internal: [
    "assigned", "under_assessment", "internal_review",
    "quotes_pending", "quotes_received", "comparison",
    "approved", "rejected", "completed", "cancelled"
  ],
  assessor_external: [
    "assigned", "under_assessment",
    "approved", "rejected", "completed", "cancelled"
  ],
  risk_manager: [
    "technical_approval", "financial_decision",
    "approved", "rejected", "completed", "cancelled"
  ],
  claims_manager: [
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
  executive: [
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
  insurer_admin: [
    "created", "intake_verified", "assigned", "under_assessment",
    "internal_review", "quotes_pending", "quotes_received", "comparison",
    "technical_approval", "financial_decision",
    "approved", "rejected", "payment_authorized", "payment_processing",
    "completed", "cancelled"
  ],
};

/**
 * Check if a role has access to a specific workflow state
 */
function canAccessState(role: InsurerRole, state: WorkflowState): boolean {
  const allowedStates = ROLE_STATE_ACCESS[role];
  return allowedStates.includes(state);
}

export const workflowQueriesRouter = router({
  /**
   * Get claims by workflow state with pagination and role-based filtering
   */
  getClaimsByState: protectedProcedure
    .input(
      z.object({
        state: z.string(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Allow admin users to bypass role checks (for testing)
      const isAdmin = ctx.user.role === "admin";

      // Only insurer users (or admins) can query claims by state
      if (!isAdmin && ctx.user.role !== "insurer") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer tenant members can query claims by workflow state",
        });
      }

      if (!isAdmin && !ctx.user.insurerRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insurer role not found for user",
        });
      }

      // Validate state access for user's role (skip for admin)
      const state = input.state as WorkflowState;
      if (!isAdmin && !canAccessState(ctx.user.insurerRole, state)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Your role (${ctx.user.insurerRole}) does not have access to claims in state '${state}'`,
        });
      }

      // Build query with tenant isolation
      // Admin users default to "demo-insurance" tenant for testing
      const effectiveTenantId = ctx.user.tenantId || (isAdmin ? "demo-insurance" : null);
      if (!effectiveTenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant not found" });
      }

      const whereConditions = and(
        eq(claims.workflowState, state),
        eq(claims.tenantId, effectiveTenantId)
      );

      // Get total count
      const [countResult] = await db
        .select({ count: count() })
        .from(claims)
        .where(whereConditions);

      const total = countResult?.count || 0;

      // Get paginated results
      const claimsList = await db
        .select()
        .from(claims)
        .where(whereConditions)
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(claims.createdAt);

      return {
        claims: claimsList,
        items: claimsList,  // alias for backward compatibility with dashboard
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + claimsList.length < total,
      };
    }),

  /**
   * Get accessible states for current user's role
   */
  getAccessibleStates: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === "admin";
    if (!isAdmin && ctx.user.role !== "insurer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only insurer tenant members can query accessible states",
      });
    }

    if (!isAdmin && !ctx.user.insurerRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insurer role not found for user",
      });
    }

    return {
      role: ctx.user.insurerRole,
      accessibleStates: ROLE_STATE_ACCESS[ctx.user.insurerRole],
    };
  }),
});
