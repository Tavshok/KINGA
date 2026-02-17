import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  logWorkflowTransition,
  updateClaimStateWithAudit,
  getClaimWorkflowHistory,
  type WorkflowState,
  type UserRole,
} from "../utils/workflow-audit";

const workflowStateSchema = z.enum([
  "created",
  "intake_verified",
  "assigned",
  "under_assessment",
  "internal_review",
  "technical_approval",
  "financial_decision",
  "payment_authorized",
  "closed",
  "disputed",
]);

const userRoleSchema = z.enum([
  "claims_processor",
  "assessor_internal",
  "assessor_external",
  "risk_manager",
  "claims_manager",
  "executive",
  "insurer_admin",
]);

export const workflowAuditRouter = router({
  /**
   * Log a workflow transition
   * 
   * This procedure logs a state transition without updating the claim.
   * Use updateClaimState for atomic updates.
   */
  logTransition: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        previousState: workflowStateSchema.nullable(),
        newState: workflowStateSchema,
        comments: z.string().optional(),
        decisionValue: z.number().optional(),
        aiScore: z.number().optional(),
        confidenceScore: z.number().optional(),
        executiveOverride: z.boolean().optional(),
        overrideReason: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const auditRecord = await logWorkflowTransition({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: (ctx.user.insurerRole || "claims_processor") as UserRole,
        previousState: input.previousState,
        newState: input.newState,
        comments: input.comments,
        decisionValue: input.decisionValue,
        aiScore: input.aiScore,
        confidenceScore: input.confidenceScore,
        executiveOverride: input.executiveOverride,
        overrideReason: input.overrideReason,
        metadata: input.metadata,
      });

      return {
        success: true,
        auditRecord,
      };
    }),

  /**
   * Update claim state with automatic audit logging
   * 
   * This procedure updates the claim workflow state and logs
   * the transition atomically in a single transaction.
   */
  updateClaimState: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        newState: workflowStateSchema,
        comments: z.string().optional(),
        decisionValue: z.number().optional(),
        aiScore: z.number().optional(),
        confidenceScore: z.number().optional(),
        executiveOverride: z.boolean().optional(),
        overrideReason: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await updateClaimStateWithAudit({
        claimId: input.claimId,
        userId: ctx.user.id,
        userRole: (ctx.user.insurerRole || "claims_processor") as UserRole,
        previousState: null, // Will be fetched from current claim state
        newState: input.newState,
        comments: input.comments,
        decisionValue: input.decisionValue,
        aiScore: input.aiScore,
        confidenceScore: input.confidenceScore,
        executiveOverride: input.executiveOverride,
        overrideReason: input.overrideReason,
        metadata: input.metadata,
      });

      return {
        success: true,
        claim: result.claim,
        auditRecord: result.auditRecord,
      };
    }),

  /**
   * Get workflow history for a claim
   * 
   * Returns all workflow transitions for a specific claim
   * in chronological order.
   */
  getClaimHistory: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const history = await getClaimWorkflowHistory(input.claimId);

      return {
        success: true,
        history,
      };
    }),
});
