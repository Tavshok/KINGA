/**
 * Claim Completion Router
 * 
 * Handles claim closure tracking with closedBy and closedAt fields.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getClaimById } from "../db";
import { createAuditEntry } from "../db";

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
      
      // Get claim
      const claim = await getClaimById(input.claimId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      
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
      if (claim.approvedAmount && claim.approvedAmount > 2500000) { // High-value threshold (configurable per tenant)
        if (!claim.financiallyApprovedBy || !claim.financiallyApprovedAt) {
          throw new TRPCError({ 
            code: "PRECONDITION_FAILED", 
            message: "High-value claim requires financial approval before completion" 
          });
        }
      }
      
      // Validate state transition to completed
      const { validateStateTransition } = await import("../workflow-validator");
      validateStateTransition(claim.status as any, "completed");
      
      // Update claim to completed with closure tracking
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(claims).set({
        status: "completed",
        closedBy: ctx.user.id,
        closedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(claims.id, input.claimId));
      
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

      // Capture claim intelligence dataset for continuous learning
      // Non-blocking: errors won't fail claim completion
      try {
        const { captureClaimIntelligenceDataset } = await import("../dataset-capture");
        
        // Prepare approval data
        const approvalData = {
          approvedAmount: claim.approvedAmount || 0,
          approvedBy: claim.technicallyApprovedBy || ctx.user.id,
          approvedAt: claim.technicallyApprovedAt || new Date(),
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
      if (ctx.user.role !== "admin" && ctx.user.insurerRole !== "claims_manager" && ctx.user.insurerRole !== "executive") {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Reopening claims requires Claims Manager or Executive role" 
        });
      }
      
      // Get claim
      const claim = await getClaimById(input.claimId);
      if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
      
      // Verify claim is completed
      if (claim.status !== "completed") {
        throw new TRPCError({ 
          code: "PRECONDITION_FAILED", 
          message: `Only completed claims can be reopened. Current status: ${claim.status}` 
        });
      }
      
      // Validate state transition to repair_in_progress (reopening)
      // Note: This is a special case - reopening from terminal state
      // We validate this explicitly rather than adding to ALLOWED_TRANSITIONS
      // to keep the workflow validator strict for normal operations
      
      // Update claim to repair_in_progress and clear closure tracking
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db.update(claims).set({
        status: "repair_in_progress",
        closedBy: null,
        closedAt: null,
        updatedAt: new Date(),
      }).where(eq(claims.id, input.claimId));
      
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
