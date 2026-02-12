/**
 * KINGA - Automation Policies Router
 * 
 * tRPC procedures for managing confidence-governed automation policies.
 * Allows insurers to configure AI confidence thresholds, claim type eligibility,
 * approval amounts, fraud cutoffs, and vehicle category rules.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { 
  createAutomationPolicy, 
  getActiveAutomationPolicy, 
  getTenantPolicies,
  updateAutomationPolicy 
} from "../automation-policy-manager";

export const automationPoliciesRouter = router({
  /**
   * Create a new automation policy
   */
  createPolicy: protectedProcedure
    .input(
      z.object({
        minAutomationConfidence: z.number().min(0).max(100),
        minHybridConfidence: z.number().min(0).max(100),
        maxAiOnlyApprovalAmount: z.number().positive(),
        maxHybridApprovalAmount: z.number().positive(),
        maxFraudScoreForAutomation: z.number().min(0).max(100),
        eligibleClaimTypes: z.array(z.string()),
        excludedClaimTypes: z.array(z.string()),
        eligibleVehicleCategories: z.array(z.string()),
        excludedVehicleMakes: z.array(z.string()),
        maxVehicleAge: z.number().positive(),
        requireManagerApprovalAbove: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId || "default";
      
      const policyId = await createAutomationPolicy({
        tenantId,
        policyName: `Automation Policy ${new Date().toISOString().split('T')[0]}`,
        minAutomationConfidence: input.minAutomationConfidence,
        minHybridConfidence: input.minHybridConfidence,
        maxAiOnlyApprovalAmount: input.maxAiOnlyApprovalAmount,
        maxHybridApprovalAmount: input.maxHybridApprovalAmount,
        maxFraudScoreForAutomation: input.maxFraudScoreForAutomation,
        eligibleClaimTypes: input.eligibleClaimTypes,
        excludedClaimTypes: input.excludedClaimTypes,
        eligibleVehicleCategories: input.eligibleVehicleCategories,
        excludedVehicleMakes: input.excludedVehicleMakes,
        maxVehicleAge: input.maxVehicleAge,
        requireManagerApprovalAbove: input.requireManagerApprovalAbove,
      });

      return { success: true, policyId };
    }),

  /**
   * Get the active automation policy for the current tenant
   */
  getActivePolicy: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId || "default";
    const policy = await getActiveAutomationPolicy(tenantId);
    return policy;
  }),

  /**
   * Get policy history for the current tenant
   */
  getPolicyHistory: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.tenantId || "default";
    const history = await getTenantPolicies(tenantId);
    return history;
  }),

  /**
   * Update an existing automation policy
   */
  updatePolicy: protectedProcedure
    .input(
      z.object({
        policyId: z.number(),
        minAutomationConfidence: z.number().min(0).max(100),
        minHybridConfidence: z.number().min(0).max(100),
        maxAiOnlyApprovalAmount: z.number().positive(),
        maxHybridApprovalAmount: z.number().positive(),
        maxFraudScoreForAutomation: z.number().min(0).max(100),
        eligibleClaimTypes: z.array(z.string()),
        excludedClaimTypes: z.array(z.string()),
        eligibleVehicleCategories: z.array(z.string()),
        excludedVehicleMakes: z.array(z.string()),
        maxVehicleAge: z.number().positive(),
        requireManagerApprovalAbove: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateAutomationPolicy(input.policyId, {
        minAutomationConfidence: input.minAutomationConfidence,
        minHybridConfidence: input.minHybridConfidence,
        maxAiOnlyApprovalAmount: input.maxAiOnlyApprovalAmount,
        maxHybridApprovalAmount: input.maxHybridApprovalAmount,
        maxFraudScoreForAutomation: input.maxFraudScoreForAutomation,
        eligibleClaimTypes: input.eligibleClaimTypes,
        excludedClaimTypes: input.excludedClaimTypes,
        eligibleVehicleCategories: input.eligibleVehicleCategories,
        excludedVehicleMakes: input.excludedVehicleMakes,
        maxVehicleAge: input.maxVehicleAge,
        requireManagerApprovalAbove: input.requireManagerApprovalAbove,
      });

      return { success: true };
    }),
});
