/**
 * Platform Observability Router
 * 
 * Provides read-only cross-tenant access for platform super admins.
 * All procedures enforce:
 * - platform_super_admin role requirement
 * - Read-only access (no mutations)
 * - Audit logging for all accesses
 * - Zero governance bypass
 */

import { router } from "../_core/trpc";
import { platformSuperAdminProcedure, logPlatformSuperAdminAccess } from "../_core/platform-super-admin-guard";
import {
  getAllClaimsCrossTenant,
  getClaimTrace,
  getAIConfidenceBreakdown,
  getRoutingDecisionMetadata,
  getPlatformOverview,
  searchClaimsCrossTenant,
} from "../services/platform-observability";
import { z } from "zod";

export const platformObservabilityRouter = router({
  /**
   * Get platform overview with system-wide metrics
   */
  getOverview: platformSuperAdminProcedure.query(async ({ ctx }) => {
    // Log access
    await logPlatformSuperAdminAccess(
      ctx.user.id,
      "view_platform_overview",
      "platform",
      undefined,
      { timestamp: new Date().toISOString() }
    );
    
    return await getPlatformOverview();
  }),
  
  /**
   * Get all claims across all tenants
   */
  getAllClaims: platformSuperAdminProcedure
    .input(
      z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Log access
      await logPlatformSuperAdminAccess(
        ctx.user.id,
        "view_all_claims",
        "claims",
        undefined,
        { filters: input, timestamp: new Date().toISOString() }
      );
      
      return await getAllClaimsCrossTenant(input);
    }),
  
  /**
   * Search claims across all tenants
   */
  searchClaims: platformSuperAdminProcedure
    .input(
      z.object({
        searchTerm: z.string(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Log access
      await logPlatformSuperAdminAccess(
        ctx.user.id,
        "search_claims",
        "claims",
        undefined,
        { searchTerm: input.searchTerm, timestamp: new Date().toISOString() }
      );
      
      return await searchClaimsCrossTenant(input.searchTerm, {
        limit: input.limit,
        offset: input.offset,
      });
    }),
  
  /**
   * Get comprehensive claim trace
   */
  getClaimTrace: platformSuperAdminProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Log access
      await logPlatformSuperAdminAccess(
        ctx.user.id,
        "view_claim_trace",
        "claim",
        input.claimId,
        { timestamp: new Date().toISOString() }
      );
      
      return await getClaimTrace(input.claimId);
    }),
  
  /**
   * Get AI confidence breakdown for a claim
   */
  getAIConfidenceBreakdown: platformSuperAdminProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Log access
      await logPlatformSuperAdminAccess(
        ctx.user.id,
        "view_ai_confidence_breakdown",
        "ai_assessment",
        input.claimId,
        { timestamp: new Date().toISOString() }
      );
      
      return await getAIConfidenceBreakdown(input.claimId);
    }),
  
  /**
   * Get routing decision metadata for a claim
   */
  getRoutingMetadata: platformSuperAdminProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Log access
      await logPlatformSuperAdminAccess(
        ctx.user.id,
        "view_routing_metadata",
        "routing_log",
        input.claimId,
        { timestamp: new Date().toISOString() }
      );
      
      return await getRoutingDecisionMetadata(input.claimId);
    }),
});
