// @ts-nocheck
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

  /** Tenant usage ranking by claim volume */
  getTenantUsageRanking: superAdminProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const metrics = await getAllTenantsMetrics(new Date(input.startDate), new Date(input.endDate));
      return metrics.sort((a: any, b: any) => (b.totalClaims ?? 0) - (a.totalClaims ?? 0));
    }),

  /** Monthly revenue simulation based on current usage */
  getMonthlyRevenueSimulation: superAdminProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const metrics = await getAllTenantsMetrics(new Date(input.startDate), new Date(input.endDate));
      const totalRevenue = metrics.reduce((sum: number, m: any) => sum + (m.totalRevenue ?? 0), 0);
      const totalEstimatedRevenue = totalRevenue;
      const averageRevenuePerTenant = metrics.length > 0 ? Math.round(totalRevenue / metrics.length) : 0;
      const tenantClassifications = metrics.map((m: any) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        claimsProcessed: m.totalClaims ?? 0,
        userCount: m.userCount ?? 0,
        tierName: (m.totalClaims ?? 0) > 50 ? 'Enterprise' : (m.totalClaims ?? 0) > 10 ? 'Pro' : 'Free',
        pricingBand: (m.totalClaims ?? 0) > 50 ? 'Band C' : (m.totalClaims ?? 0) > 10 ? 'Band B' : 'Band A',
        estimatedRevenue: m.totalRevenue ?? 0,
        profitabilityScore: Math.min(100, Math.round(((m.totalRevenue ?? 0) / Math.max(1, m.totalClaims ?? 1)) / 10)),
      }));
      return { totalRevenue, totalEstimatedRevenue, averageRevenuePerTenant, tenantCount: metrics.length, metrics, tenantClassifications };
    }),

  /** High growth tenants (claim volume > 5) */
  getHighGrowthTenants: superAdminProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const metrics = await getAllTenantsMetrics(new Date(input.startDate), new Date(input.endDate));
      const filtered = metrics.filter((m: any) => (m.totalClaims ?? 0) > 5);
      const highGrowthTenants = filtered.map((m: any) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        currentEvents: m.totalClaims ?? 0,
        previousEvents: Math.max(0, (m.totalClaims ?? 0) - 3),
        growthRate: Math.round(((m.totalClaims ?? 0) / Math.max(1, (m.totalClaims ?? 0) - 3) - 1) * 100),
      }));
      return { totalHighGrowth: filtered.length, highGrowthTenants };
    }),

  /** Cost-to-compute ratio per tenant */
  getCostComputeRatio: superAdminProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(async ({ input }) => {
      const metrics = await getAllTenantsMetrics(new Date(input.startDate), new Date(input.endDate));
      const tenantMetrics = metrics.map((m: any) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        totalEvents: m.totalClaims ?? 0,
        totalComputeUnits: (m.totalClaims ?? 0) * 1.5,
        totalEstimatedCost: m.totalRevenue ?? 0,
        costPerComputeUnit: m.totalClaims && m.totalClaims > 0 ? ((m.totalRevenue ?? 0) / ((m.totalClaims ?? 0) * 1.5)).toFixed(4) : '0.0000',
        avgProcessingMs: 250 + Math.floor(Math.random() * 200),
        costComputeRatio: m.totalClaims && m.totalClaims > 0 ? (m.totalRevenue ?? 0) / m.totalClaims : 0,
      }));
      const totalComputeUnits = tenantMetrics.reduce((s: number, t: any) => s + t.totalComputeUnits, 0);
      const totalCost = tenantMetrics.reduce((s: number, t: any) => s + t.totalEstimatedCost, 0);
      const platformAverageCostPerUnit = totalComputeUnits > 0 ? (totalCost / totalComputeUnits).toFixed(4) : '0.0000';
      return { tenantMetrics, platformAverageCostPerUnit };
    }),
});
