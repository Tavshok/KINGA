// @ts-nocheck
/**
 * Policy Management Router
 * 
 * tRPC procedures for automation policy management:
 * - Policy profile templates
 * - Policy creation from profiles
 * - Policy activation/deactivation
 * - Policy CRUD operations
 * 
 * Role-based access: insurer_admin, executive only
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getAllPolicyProfiles,
  getPolicyProfileTemplate,
  PolicyProfileType,
} from "../services/policy-profiles";
import {
  createPolicyFromProfile,
  activatePolicy,
  getActivePolicy,
  getAllPolicies,
  updatePolicy,
  deletePolicy,
} from "../services/policy-activation";
import {
  simulateRoutingDistribution,
  comparePolicySimulations,
  simulateSingleClaimRouting,
  PolicySimulationInput,
} from "../services/policy-simulation";
import {
  getPolicyImpactMetrics,
  comparePolicyPerformance,
  getAllPolicyImpactMetrics,
} from "../services/policy-impact-analytics";

/**
 * Role-based access control middleware
 * Only insurer_admin and executive can manage policies
 */
const policyManagementProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowedRoles = ["insurer_admin", "executive"];
  
  if (!ctx.user.insurerRole || !allowedRoles.includes(ctx.user.insurerRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied: Only insurer_admin and executive roles can manage policies",
    });
  }

  return next({ ctx });
});

export const policyManagementRouter = router({
  /**
   * Get all policy profile templates
   * Returns: Conservative, Balanced, Aggressive, Fraud-Sensitive, Custom
   */
  getAllProfiles: policyManagementProcedure.query(async () => {
    const profiles = getAllPolicyProfiles();
    return profiles;
  }),

  /**
   * Get specific policy profile template
   */
  getProfileByType: policyManagementProcedure
    .input(z.object({
      profileType: z.enum(["conservative", "balanced", "aggressive", "fraud_sensitive", "custom"]),
    }))
    .query(async ({ input }) => {
      const profile = getPolicyProfileTemplate(input.profileType as PolicyProfileType);
      return profile;
    }),

  /**
   * Create new policy from profile template
   * Optionally customize profile parameters
   */
  createFromProfile: policyManagementProcedure
    .input(z.object({
      profileType: z.enum(["conservative", "balanced", "aggressive", "fraud_sensitive", "custom"]),
      tenantId: z.string().optional(), // Optional for super_admin
      customizations: z.object({
        policyName: z.string().optional(),
        minAutomationConfidence: z.number().min(0).max(100).optional(),
        minHybridConfidence: z.number().min(0).max(100).optional(),
        maxAiOnlyApprovalAmount: z.number().positive().optional(),
        maxHybridApprovalAmount: z.number().positive().optional(),
        maxFraudScoreForAutomation: z.number().min(0).max(100).optional(),
        fraudSensitivityMultiplier: z.number().min(0.5).max(2.0).optional(),
        eligibleClaimTypes: z.array(z.string()).optional(),
        excludedClaimTypes: z.array(z.string()).optional(),
        eligibleVehicleCategories: z.array(z.string()).optional(),
        excludedVehicleMakes: z.array(z.string()).optional(),
        minVehicleYear: z.number().optional(),
        maxVehicleAge: z.number().optional(),
        requireManagerApprovalAbove: z.number().positive().optional(),
        allowPolicyOverride: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const profile = getPolicyProfileTemplate(input.profileType as PolicyProfileType);

      const policyId = await createPolicyFromProfile(
        tenantId,
        profile,
        ctx.user.id,
        input.customizations
      );

      return {
        policyId,
        message: `Policy created from ${input.profileType} profile`,
      };
    }),

  /**
   * Activate a policy (deactivates all other policies for tenant)
   */
  activatePolicy: policyManagementProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      await activatePolicy(input.policyId, tenantId, ctx.user.id);

      return {
        success: true,
        message: `Policy ${input.policyId} activated`,
      };
    }),

  /**
   * Get active policy for tenant
   */
  getActivePolicy: policyManagementProcedure
    .input(z.object({
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const activePolicy = await getActivePolicy(tenantId);

      return activePolicy;
    }),

  /**
   * Get all policies for tenant (active and inactive)
   */
  getAllPolicies: policyManagementProcedure
    .input(z.object({
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const policies = await getAllPolicies(tenantId);

      return policies;
    }),

  /**
   * Update policy (creates new version)
   */
  updatePolicy: policyManagementProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      tenantId: z.string().optional(),
      updates: z.object({
        policyName: z.string().optional(),
        minAutomationConfidence: z.number().min(0).max(100).optional(),
        minHybridConfidence: z.number().min(0).max(100).optional(),
        maxAiOnlyApprovalAmount: z.number().positive().optional(),
        maxHybridApprovalAmount: z.number().positive().optional(),
        maxFraudScoreForAutomation: z.number().min(0).max(100).optional(),
        fraudSensitivityMultiplier: z.number().min(0.5).max(2.0).optional(),
        eligibleClaimTypes: z.array(z.string()).optional(),
        excludedClaimTypes: z.array(z.string()).optional(),
        eligibleVehicleCategories: z.array(z.string()).optional(),
        excludedVehicleMakes: z.array(z.string()).optional(),
        minVehicleYear: z.number().optional(),
        maxVehicleAge: z.number().optional(),
        requireManagerApprovalAbove: z.number().positive().optional(),
        allowPolicyOverride: z.boolean().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const newPolicyVersionId = await updatePolicy(
        input.policyId,
        tenantId,
        input.updates,
        ctx.user.id
      );

      return {
        newPolicyVersionId,
        message: `Policy updated (new version ${newPolicyVersionId} created)`,
      };
    }),

  /**
   * Delete policy (soft delete)
   * Historical policies cannot be deleted
   */
  deletePolicy: policyManagementProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      await deletePolicy(input.policyId, tenantId, ctx.user.id);

      return {
        success: true,
        message: `Policy ${input.policyId} deleted`,
      };
    }),

  /**
   * Simulate routing distribution using a draft policy
   */
  simulatePolicy: policyManagementProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      policyInput: z.object({
        minAutomationConfidence: z.number().min(0).max(100),
        minHybridConfidence: z.number().min(0).max(100),
        maxAiOnlyApprovalAmount: z.number().positive(),
        maxHybridApprovalAmount: z.number().positive(),
        maxFraudScoreForAutomation: z.number().min(0).max(100),
        fraudSensitivityMultiplier: z.number().min(0.5).max(2.0),
        eligibleClaimTypes: z.array(z.string()),
        excludedClaimTypes: z.array(z.string()),
        minVehicleYear: z.number(),
        maxVehicleAge: z.number(),
      }),
      daysToAnalyze: z.number().optional().default(30),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const simulationResults = await simulateRoutingDistribution(
        tenantId,
        input.policyInput as PolicySimulationInput,
        input.daysToAnalyze
      );

      return simulationResults;
    }),

  /**
   * Get policy impact metrics for a specific policy
   */
  getPolicyImpactMetrics: policyManagementProcedure
    .input(z.object({
      policyId: z.number().int().positive(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const impactMetrics = await getPolicyImpactMetrics(input.policyId, tenantId);

      return impactMetrics;
    }),

  /**
   * Compare performance between two policy versions
   */
  comparePolicyPerformance: policyManagementProcedure
    .input(z.object({
      policy1Id: z.number().int().positive(),
      policy2Id: z.number().int().positive(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const comparisonResults = await comparePolicyPerformance(
        input.policy1Id,
        input.policy2Id,
        tenantId
      );

      return comparisonResults;
    }),

  /**
   * Get impact metrics for all policies
   */
  getAllPolicyImpactMetrics: policyManagementProcedure
    .input(z.object({
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = input.tenantId || ctx.user.tenantId;

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID is required",
        });
      }

      const allMetrics = await getAllPolicyImpactMetrics(tenantId);

      return allMetrics;
    }),
});
