
/**
 * Claim Completion Router
 * 
 * Handles claim closure tracking with closedBy and closedAt fields.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { claims } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { getClaimById } from "../db";
import { createAuditEntry } from "../db";
import { FINANCIAL_APPROVAL_THRESHOLD_CENTS } from "../../shared/const";
import { isAdminRole } from "@shared/role-permissions";

const db = getDb();

async function requireCompletionTenantClaim(claimId: number, tenantId: string | null | undefined) {
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required" });
  }
  const connection = await getDb();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [claim] = await connection
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }
  return claim;
}

export const claimCompletionRouter = router({
  /**
   * Mark claim as completed
   * 
   * Transitions claim to 'completed' status and sets closedBy/closedAt.
   * Requires approval tracking to be populated.
   */
  completeClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      
      const claim = await requireCompletionTenantClaim(input.claimId, ctx.user.tenantId);
      
      // Verify claim is in repair_in_progress status
      if (claim.status !== "repair_in_progress") {
        throw new TRPCError({ 
          code: "PRECONDITION_FAILED", 
          message: `Claim must be in repair_in_progress status to complete. Current status: ${claim.status}` 
        });
      }
      
      // Verify approval tracking is populated
      if (!claim.technicallyApprovedBy || !claim.technicallyApprovedAt) {
        throw new TRPCError({ 
          code: "PRECONDITION_FAILED", 
          message: "Claim must have technical approval before completion" 
        });
      }
      
      // For high-value claims, verify financial approval
      if (claim.approvedAmount && claim.approvedAmount > FINANCIAL_APPROVAL_THRESHOLD_CENTS) { // High-value threshold — see shared/const.ts
        if (!claim.financiallyApprovedBy || !claim.financiallyApprovedAt) {
          throw new TRPCError({ 
            code: "PRECONDITION_FAILED", 
            message: "High-value claim requires financial approval before completion" 
          });
        }
      }
      
      // Use WorkflowEngine for governance-compliant state transition
      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      
      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: "closed",
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole as any || "claims_manager",
        decisionData: {
          comments: `Claim completed and closed`,
        },
      });
      
      // Update additional closure tracking fields (not part of workflow state)
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(claims).set({
        closedBy: ctx.user.id,
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(and(eq(claims.id, input.claimId), eq(claims.tenantId, ctx.user.tenantId!)));
      
      // Create audit entry
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_completed",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim completed and closed by user ${ctx.user.id}`,
      });
      
      console.log(`[Completion] Claim ${claim.claimNumber} completed and closed by user ${ctx.user.id}`);

      // C-03: Update vehicle damage history and fleet risk profile
      // Non-blocking fire-and-forget: errors won't fail claim completion
      ;(async () => {
        try {
          const { insertDamageHistory } = await import('../vehicle-damage-history');
          const { vehicleRegistry, fleetRiskScores } = await import('../../drizzle/schema');
          const { eq: eqDrizzle, sql: sqlDrizzle } = await import('drizzle-orm');
          // Get the AI assessment for this claim to extract damage data
          const [assessment] = await db
            .select()
            .from((await import('../../drizzle/schema')).aiAssessments)
            .where(eqDrizzle((await import('../../drizzle/schema')).aiAssessments.claimId, input.claimId))
            .orderBy((await import('drizzle-orm')).desc((await import('../../drizzle/schema')).aiAssessments.createdAt))
            .limit(1);
          // Look up vehicle in registry by registration number
          let vehicleId: number | null = null;
          if (claim.vehicleRegistration) {
            const reg = claim.vehicleRegistration.toUpperCase().replace(/\s/g, '');
            const [regRow] = await db
              .select({ id: vehicleRegistry.id })
              .from(vehicleRegistry)
              .where(eqDrizzle(vehicleRegistry.registrationNumber, reg))
              .limit(1);
            vehicleId = regRow?.id ?? null;
          }
          if (vehicleId && assessment) {
            // Parse damaged components from assessment
            let damagedComponents: Array<{ name: string; severity?: string | null; zone?: string | null; estimatedCost?: number | null }> = [];
            try {
              const parsed = assessment.damagedComponentsJson ? JSON.parse(assessment.damagedComponentsJson) : [];
              damagedComponents = Array.isArray(parsed) ? parsed : [];
            } catch {}
            // Parse physics data
            let estimatedSpeedKmh: number | null = null;
            let impactForceKn: number | null = null;
            try {
              const physics = assessment.physicsAnalysis ? JSON.parse(assessment.physicsAnalysis) : null;
              estimatedSpeedKmh = physics?.estimatedSpeedKmh ?? null;
              impactForceKn = physics?.impactForceKn ?? null;
            } catch {}
            await insertDamageHistory({
              vehicleId,
              claimId: input.claimId,
              vehicleRegistration: claim.vehicleRegistration ?? null, // DEF-001: direct registration for vehicle-centric queries
              damagedComponents,
              impactDirection: null, // collision direction not on claims table; sourced from physics analysis if available
              estimatedSpeedKmh,
              impactForceKn,
              structuralDamageSeverity: assessment.structuralDamageSeverity ?? null,
              hasStructuralDamage: (assessment.structuralDamageSeverity ?? 'none') !== 'none',
              repairCostEstimateCents: assessment.estimatedCost ?? 0,
              fraudRiskScore: assessment.fraudScore ?? 0,
              tenantId: claim.tenantId ?? null,
            });
            console.log(`[C-03] Vehicle damage history inserted for claim ${claim.claimNumber} vehicle ${vehicleId}`);
            // Update vehicleRegistry aggregate counters
            await db.update(vehicleRegistry)
              .set({
                totalClaimsCount: sqlDrizzle`total_claims_count + 1`,
                totalRepairCostCents: sqlDrizzle`total_repair_cost_cents + ${assessment.estimatedCost ?? 0}`,
                lastClaimDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
                lastSeenAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
              })
              .where(eqDrizzle(vehicleRegistry.id, vehicleId));
          }
          // Update fleet risk score if vehicle belongs to a fleet
          if (vehicleId) {
            const { fleetVehicles } = await import('../../drizzle/schema');
            const [fleetVehicle] = await db
              .select({ fleetId: fleetVehicles.fleetId })
              .from(fleetVehicles)
              .where(eqDrizzle(fleetVehicles.id, vehicleId))
              .limit(1);
            if (fleetVehicle?.fleetId) {
              // Bump fleet risk score by fraud score delta (capped at 100)
              const fraudDelta = Math.min(assessment?.fraudScore ?? 0, 20);
              await db.update(fleetRiskScores)
                .set({
                  overallRiskScore: sqlDrizzle`LEAST(100, overall_risk_score + ${fraudDelta})`,
                })
                .where(eqDrizzle(fleetRiskScores.fleetId, fleetVehicle.fleetId));
              console.log(`[C-03] Fleet risk score updated for fleet ${fleetVehicle.fleetId}`);
            }
          }
        } catch (err) {
          console.error(`[C-03] Vehicle damage history update failed for claim ${input.claimId}:`, err);
        }
      })();

      // Capture claim intelligence dataset for continuous learning
      // Non-blocking: errors won't fail claim completion
      try {
        const { captureClaimIntelligenceDataset } = await import("../dataset-capture");
        
        // Prepare approval data
        const approvalData = {
          approvedAmount: claim.approvedAmount || 0,
          approvedBy: claim.technicallyApprovedBy || ctx.user.id,
          approvedAt: claim.technicallyApprovedAt ? new Date(claim.technicallyApprovedAt) : new Date(),
        };
        
        await captureClaimIntelligenceDataset(input.claimId, approvalData);
        console.log(`[Dataset] Captured intelligence dataset for claim ${claim.claimNumber}`);
      } catch (error) {
        // Log error but don't fail claim completion
        console.error(`[Dataset] Failed to capture intelligence dataset for claim ${claim.claimNumber}:`, error);
      }

      return { success: true };
    }),
  
  /**
   * Reopen completed claim
   * 
   * Transitions claim back to repair_in_progress and clears closure tracking.
   * Requires Claims Manager or Executive role.
   */
  reopenClaim: protectedProcedure
    .input(z.object({
      claimId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      
      // Verify user has authority to reopen claims (Claims Manager, Executive, or Admin)
      if (!isAdminRole(ctx.user.role) && ctx.user.insurerRole !== "claims_manager" && ctx.user.insurerRole !== "executive") {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Reopening claims requires Claims Manager or Executive role" 
        });
      }
      
      const claim = await requireCompletionTenantClaim(input.claimId, ctx.user.tenantId);
      
      // Verify claim is completed
      if (claim.status !== "completed") {
        throw new TRPCError({ 
          code: "PRECONDITION_FAILED", 
          message: `Only completed claims can be reopened. Current status: ${claim.status}` 
        });
      }
      
      // Use WorkflowEngine for governance-compliant state transition
      // Note: Reopening from closed state requires executive override
      const { transition } = await import("../workflow-engine");
      const { statusToWorkflowState } = await import("../workflow-migration");
      
      const fromState = claim.workflowState || statusToWorkflowState(claim.status as any);
      
      await transition({
        claimId: input.claimId,
        fromState: fromState as any,
        toState: "disputed", // Reopened claims go to disputed state for review
        userId: ctx.user.id,
        userRole: ctx.user.insurerRole as any || "claims_manager",
        executiveOverride: true,
        overrideReason: `Claim reopened: ${input.reason}`,
        decisionData: {
          comments: input.reason,
        },
      });
      
      // Clear closure tracking fields
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(claims).set({
        closedBy: null,
        closedAt: null,
        updatedAt: new Date().toISOString(),
      }).where(and(eq(claims.id, input.claimId), eq(claims.tenantId, ctx.user.tenantId!)));
      
      // Create audit entry
      await createAuditEntry({
        claimId: input.claimId,
        userId: ctx.user.id,
        action: "claim_reopened",
        entityType: "claim",
        entityId: input.claimId,
        changeDescription: `Claim reopened by user ${ctx.user.id}. Reason: ${input.reason}`,
      });
      
      console.log(`[Completion] Claim ${claim.claimNumber} reopened by user ${ctx.user.id}`);

      return { success: true };
    }),
});
