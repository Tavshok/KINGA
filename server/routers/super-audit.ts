// @ts-nocheck
/**
 * Super Audit Mode tRPC Router
 * 
 * Provides super-admin audit capabilities:
 * - Tenant selection
 * - Role impersonation
 * - Read-only dashboard access
 * - Claim replay and AI scoring inspection
 */

import { z } from "zod";
import { router } from "./_core/trpc";
import { protectedProcedure } from "./_core/procedures";
import { TRPCError } from "@trpc/server";
import {
  createSuperAuditSession,
  setAuditContext,
  trackAccessedClaim,
  trackReplayedClaim,
  trackAiScoringView,
  trackRoutingLogicView,
  endSuperAuditSession,
  getActiveAuditSession,
  getAllTenants,
} from "./services/super-audit-mode";

/**
 * Super-admin only middleware
 */
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super-admin access required",
    });
  }
  return next({ ctx });
});

export const superAuditRouter = router({
  /**
   * Create new super audit session
   */
  createSession: superAdminProcedure.mutation(async ({ ctx }) => {
    const sessionId = await createSuperAuditSession(
      ctx.user.id,
      ctx.user.name || "Unknown Super Admin"
    );
    
    return {
      sessionId,
      message: "Super audit session created",
    };
  }),
  
  /**
   * Get all tenants (for tenant selector)
   */
  getAllTenants: superAdminProcedure.query(async () => {
    const tenants = await getAllTenants();
    return tenants;
  }),
  
  /**
   * Set audit context (tenant + role impersonation)
   */
  setAuditContext: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        tenantId: z.string(),
        role: z.enum([
          "claimant",
          "assessor",
          "panel_beater",
          "claims_processor",
          "assessor_internal",
          "assessor_external",
          "risk_manager",
          "claims_manager",
          "executive",
          "insurer_admin",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setAuditContext(
        input.sessionId,
        ctx.user.id,
        input.tenantId,
        input.role
      );
      
      return {
        message: "Audit context set",
        tenantId: input.tenantId,
        role: input.role,
      };
    }),
  
  /**
   * Get active audit session
   */
  getActiveSession: superAdminProcedure.query(async ({ ctx }) => {
    const session = await getActiveAuditSession(ctx.user.id);
    return session;
  }),
  
  /**
   * Track accessed claim
   */
  trackAccessedClaim: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        claimId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackAccessedClaim(input.sessionId, ctx.user.id, input.claimId);
      return { message: "Claim access tracked" };
    }),
  
  /**
   * Track replayed claim
   */
  trackReplayedClaim: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        claimId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackReplayedClaim(input.sessionId, ctx.user.id, input.claimId);
      return { message: "Claim replay tracked" };
    }),
  
  /**
   * Track AI scoring view
   */
  trackAiScoringView: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        claimId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackAiScoringView(input.sessionId, ctx.user.id, input.claimId);
      return { message: "AI scoring view tracked" };
    }),
  
  /**
   * Track routing logic view
   */
  trackRoutingLogicView: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
        claimId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await trackRoutingLogicView(input.sessionId, ctx.user.id, input.claimId);
      return { message: "Routing logic view tracked" };
    }),
  
  /**
   * End super audit session
   */
  endSession: superAdminProcedure
    .input(
      z.object({
        sessionId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await endSuperAuditSession(input.sessionId, ctx.user.id);
      return { message: "Super audit session ended" };
    }),
});
