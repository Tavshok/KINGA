/**
 * Intake Gate Router
 * 
 * Handles Claims Manager intake queue operations including processor assignment.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { auditTrail } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

/**
 * Intake Gate Router
 */
export const intakeGateRouter = router({
  /**
   * Assign claim to processor
   * Access: claims_manager only
   */
  assignToProcessor: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        processorId: z.number(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        earlyFraudSuspicion: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Validate claims_manager role
      if (ctx.user.insurerRole !== "claims_manager" && ctx.user.insurerRole !== "insurer_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Claims Managers can assign processors",
        });
      }

      // Fetch claim with tenant validation
      const [claim] = await db
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.id, input.claimId),
            eq(claims.tenantId, ctx.user.tenantId!)
          )
        )
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found or access denied",
        });
      }

      // Validate claim is in intake_queue
      if (claim.workflowState !== "intake_queue") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Claim must be in intake_queue status. Current status: ${claim.workflowState}`,
        });
      }

      // Validate processor belongs to same tenant and has claims_processor role
      const [processor] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, input.processorId),
            eq(users.tenantId, ctx.user.tenantId!)
          )
        )
        .limit(1);

      if (!processor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Processor not found or does not belong to your organization",
        });
      }

      if (processor.insurerRole !== "claims_processor") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected user is not a claims processor",
        });
      }

      // Update claim: assign processor, set priority, transition to assigned
      await db
        .update(claims)
        .set({
          assignedProcessorId: input.processorId,
          priority: input.priority || claim.priority || "medium",
          earlyFraudSuspicion: input.earlyFraudSuspicion ? 1 : (claim.earlyFraudSuspicion || 0),
          workflowState: "assigned",
          updatedAt: new Date(),
        })
        .where(eq(claims.id, input.claimId));

      // Insert audit trail entry
      await db.insert(auditTrail).values({
        tenantId: ctx.user.tenantId!,
        userId: ctx.user.id,
        action: "ASSIGN_PROCESSOR",
        entityType: "claim",
        entityId: input.claimId.toString(),
        metadata: JSON.stringify({
          claimId: input.claimId,
          processorId: input.processorId,
          processorName: processor.name,
          priority: input.priority || claim.priority || "medium",
          earlyFraudSuspicion: input.earlyFraudSuspicion || false,
          previousState: "intake_queue",
          newState: "assigned",
        }),
        createdAt: new Date(),
      });

      return {
        success: true,
        message: `Claim assigned to ${processor.name}`,
        claimId: input.claimId,
        processorId: input.processorId,
      };
    }),

  /**
   * Get intake queue claims
   * Access: claims_manager, executive, insurer_admin
   */
  getIntakeQueue: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    // Validate role has intake queue access
    if (
      ctx.user.insurerRole !== "claims_manager" &&
      ctx.user.insurerRole !== "executive" &&
      ctx.user.insurerRole !== "insurer_admin"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have access to the intake queue",
      });
    }

    // Fetch claims in intake_queue
    const intakeClaims = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        claimType: claims.claimType,
        estimatedValue: claims.estimatedValue,
        priority: claims.priority,
        earlyFraudSuspicion: claims.earlyFraudSuspicion,
        workflowState: claims.workflowState,
        createdAt: claims.createdAt,
        // AI preliminary score (if exists)
        aiPreliminaryScore: sql<number | null>`(
          SELECT confidence_score 
          FROM ai_assessments 
          WHERE claim_id = ${claims.id} 
          AND is_reanalysis = 0 
          ORDER BY created_at DESC 
          LIMIT 1
        )`,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.user.tenantId!),
          eq(claims.workflowState, "intake_queue")
        )
      )
      .orderBy(claims.createdAt);

    return intakeClaims;
  }),

  /**
   * Get available processors for assignment
   * Access: claims_manager, insurer_admin
   */
  getAvailableProcessors: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    // Validate role
    if (
      ctx.user.insurerRole !== "claims_manager" &&
      ctx.user.insurerRole !== "insurer_admin"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only Claims Managers can view available processors",
      });
    }

    // Fetch claims processors in same tenant
    const processors = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        // Count assigned claims
        assignedClaimsCount: sql<number>`(
          SELECT COUNT(*) 
          FROM claims 
          WHERE assigned_processor_id = ${users.id} 
          AND workflow_state IN ('assigned', 'under_assessment', 'internal_review')
        )`,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, ctx.user.tenantId!),
          eq(users.insurerRole, "claims_processor")
        )
      )
      .orderBy(users.name);

    return processors;
  }),

  /**
   * Override intake gate (emergency bypass)
   * Access: claims_manager, executive, insurer_admin
   */
  overrideIntakeGate: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        reason: z.string().min(10),
        targetState: z.enum(["assigned", "under_assessment"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Validate role
      if (
        ctx.user.insurerRole !== "claims_manager" &&
        ctx.user.insurerRole !== "executive" &&
        ctx.user.insurerRole !== "insurer_admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Claims Managers or Executives can override intake gate",
        });
      }

      // Fetch claim
      const [claim] = await db
        .select()
        .from(claims)
        .where(
          and(
            eq(claims.id, input.claimId),
            eq(claims.tenantId, ctx.user.tenantId!)
          )
        )
        .limit(1);

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Update claim state
      await db
        .update(claims)
        .set({
          workflowState: input.targetState,
          updatedAt: new Date(),
        })
        .where(eq(claims.id, input.claimId));

      // Log override
      await db.insert(auditTrail).values({
        tenantId: ctx.user.tenantId!,
        userId: ctx.user.id,
        action: "INTAKE_OVERRIDE",
        entityType: "claim",
        entityId: input.claimId.toString(),
        metadata: JSON.stringify({
          claimId: input.claimId,
          reason: input.reason,
          previousState: claim.workflowState,
          newState: input.targetState,
          overriddenBy: ctx.user.name,
          overriddenRole: ctx.user.insurerRole,
        }),
        createdAt: new Date(),
      });

      return {
        success: true,
        message: "Intake gate overridden successfully",
      };
    }),

  /**
   * Get auto-assignment statistics (last 24 hours)
   * Access: claims_manager, executive
   */
  getAutoAssignStats: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();

    // Validate role
    if (
      ctx.user.insurerRole !== "claims_manager" &&
      ctx.user.insurerRole !== "executive" &&
      ctx.user.insurerRole !== "insurer_admin"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only Claims Managers and Executives can view auto-assignment stats",
      });
    }

    // Query auto-assignments in last 24 hours
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.tenantId, ctx.user.tenantId!),
          eq(auditTrail.action, "INTAKE_AUTO_ASSIGN"),
          sql`${auditTrail.createdAt} >= ${last24Hours}`
        )
      );

    return {
      count: Number(result[0]?.count || 0),
      period: "24 hours",
    };
  }),
});
