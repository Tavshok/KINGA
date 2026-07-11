/**
 * Workflow Governance Router
 * 
 * Provides tRPC procedures for workflow configuration and governance.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getWorkflowConfig, updateWorkflowConfig } from "../workflow/integration";

export const workflowRouter = router({
  /**
   * Get Workflow Configuration
   */
  getConfiguration: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    
    // Only insurer admins can view configuration
    if (ctx.user.insurerRole !== "insurer_admin" && ctx.user.insurerRole !== "executive") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only insurer admins can view workflow configuration",
      });
    }
    
    const tenantId = ctx.user.tenantId || "default";
    return await getWorkflowConfig(tenantId);
  }),

  /**
   * Update Workflow Configuration
   */
  updateConfiguration: protectedProcedure
    .input(
      z.object({
        riskManagerEnabled: z.boolean(),
        highValueThreshold: z.number().min(0),
        executiveReviewThreshold: z.number().min(0),
        aiFastTrackEnabled: z.boolean(),
        externalAssessorEnabled: z.boolean(),
        maxSequentialStagesByUser: z.number().min(1).max(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      
      // Only insurer admins can update configuration
      if (ctx.user.insurerRole !== "insurer_admin" && ctx.user.insurerRole !== "executive") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only insurer admins can update workflow configuration",
        });
      }
      
      const tenantId = ctx.user.tenantId || "default";
      
      await updateWorkflowConfig({
        tenantId,
        ...input,
      });
      
      return { success: true };
    }),
});
