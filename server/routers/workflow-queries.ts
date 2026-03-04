// @ts-nocheck
/**
 * Workflow Query Router
 *
 * Centralized procedures for querying claims by workflow state with:
 * - Tenant isolation via insurerDomainProcedure (ctx.insurerTenantId always set)
 * - Role-based access control
 * - Pagination support
 * - Total count tracking
 */

import { router, insurerDomainProcedure } from "../_core/trpc";
import { z } from "zod";
import { claims } from "../../drizzle/schema";
import { eq, and, count, inArray, desc } from "drizzle-orm";
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

function canAccessState(role: InsurerRole, state: WorkflowState): boolean {
  const allowedStates = ROLE_STATE_ACCESS[role];
  return allowedStates.includes(state);
}

export const workflowQueriesRouter = router({
  /**
   * Get claims by workflow state with pagination and role-based filtering.
   * Strictly isolated to ctx.insurerTenantId — no cross-tenant leakage possible.
   */
  getClaimsByState: insurerDomainProcedure
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

      // ctx.insurerTenantId is guaranteed non-null by insurerDomainProcedure
      const { insurerTenantId } = ctx;

      // Role-based state access (admin users bypass role check)
      const isAdmin = ctx.user.role === "admin";
      if (!isAdmin && ctx.user.insurerRole) {
        const state = input.state as WorkflowState;
        if (!canAccessState(ctx.user.insurerRole, state)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Your role (${ctx.user.insurerRole}) does not have access to claims in state '${state}'`,
          });
        }
      }

      const whereConditions = and(
        eq(claims.workflowState, input.state),
        eq(claims.tenantId, insurerTenantId)   // ← strict tenant isolation
      );

      const [countResult] = await db
        .select({ count: count() })
        .from(claims)
        .where(whereConditions);

      const total = countResult?.count || 0;

      const claimsList = await db
        .select()
        .from(claims)
        .where(whereConditions)
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(claims.createdAt);

      return {
        claims: claimsList,
        items: claimsList,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + claimsList.length < total,
      };
    }),

  /**
   * Get claims by status values with pagination.
   * Strictly isolated to ctx.insurerTenantId.
   */
  getClaimsByStatus: insurerDomainProcedure
    .input(
      z.object({
        statuses: z.array(z.string()).min(1).max(20),
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { insurerTenantId } = ctx;

      const whereConditions = and(
        inArray(claims.status, input.statuses),
        eq(claims.tenantId, insurerTenantId)   // ← strict tenant isolation
      );

      const [countResult] = await db
        .select({ count: count() })
        .from(claims)
        .where(whereConditions);

      const total = countResult?.count || 0;

      const claimsList = await db
        .select()
        .from(claims)
        .where(whereConditions)
        .orderBy(desc(claims.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        claims: claimsList,
        items: claimsList,
        total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + claimsList.length < total,
      };
    }),

  /**
   * Get accessible workflow states for the current user's insurer role.
   */
  getAccessibleStates: insurerDomainProcedure.query(async ({ ctx }) => {
    if (!ctx.user.insurerRole) {
      return { role: null, accessibleStates: [] };
    }
    return {
      role: ctx.user.insurerRole,
      accessibleStates: ROLE_STATE_ACCESS[ctx.user.insurerRole as InsurerRole] ?? [],
    };
  }),
});
