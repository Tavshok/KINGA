/**
 * KINGA Monetisation Router
 * 
 * Internal API for super-admin dashboard to monitor per-tenant usage
 * and calculate projected billing.
 * 
 * ACCESS CONTROL: Super-admin only - NO INSURER VISIBILITY
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getTenantMetrics,
  getAllTenantsMetrics,
  getAggregateMetrics,
} from "../services/monetization-metrics";

/**
 * Super-admin procedure - restricts access to super-admin role only
 */
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  // Check if user has super-admin role
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super-admin privileges required.",
    });
  }
  
  return next({ ctx });
});

export const monetizationRouter = router({
  /**
   * Get monetization metrics for a specific tenant
   */
  getTenantMetrics: superAdminProcedure
    .input(
      z.object({
        tenantId: z.string(),
        startDate: z.string(), // ISO date string
        endDate: z.string(),   // ISO date string
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      const metrics = await getTenantMetrics(input.tenantId, startDate, endDate);
      
      if (!metrics) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Tenant not found: ${input.tenantId}`,
        });
      }
      
      return metrics;
    }),

  /**
   * Get monetization metrics for all tenants
   */
  getAllTenantsMetrics: superAdminProcedure
    .input(
      z.object({
        startDate: z.string(), // ISO date string
        endDate: z.string(),   // ISO date string
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      const metrics = await getAllTenantsMetrics(startDate, endDate);
      
      return metrics;
    }),

  /**
   * Get aggregate metrics across all tenants
   */
  getAggregateMetrics: superAdminProcedure
    .input(
      z.object({
        startDate: z.string(), // ISO date string
        endDate: z.string(),   // ISO date string
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      const aggregateMetrics = await getAggregateMetrics(startDate, endDate);
      
      return aggregateMetrics;
    }),

  /**
   * Get current month metrics for all tenants (convenience endpoint)
   */
  getCurrentMonthMetrics: superAdminProcedure.query(async () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    const metrics = await getAllTenantsMetrics(startDate, endDate);
    
    return metrics;
  }),

  /**
   * Get previous month metrics for all tenants (convenience endpoint)
   */
  getPreviousMonthMetrics: superAdminProcedure.query(async () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    const metrics = await getAllTenantsMetrics(startDate, endDate);
    
    return metrics;
  }),
});
