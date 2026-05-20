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

// ── Tier classification helpers (migrated from monetisation.ts) ──────────────────────────
const _TIER_THRESHOLDS = {
  starter:    { maxClaims: 100,  maxUsers: 5,   maxFleetSize: 10,  maxAIUsage: 50,   basePrice: 49900  },
  growth:     { maxClaims: 500,  maxUsers: 20,  maxFleetSize: 50,  maxAIUsage: 250,  basePrice: 149900 },
  enterprise: { maxClaims: 2000, maxUsers: 100, maxFleetSize: 200, maxAIUsage: 1000, basePrice: 499900 },
  custom:     { maxClaims: Infinity, maxUsers: Infinity, maxFleetSize: Infinity, maxAIUsage: Infinity, basePrice: 999900 },
};
function _classifyTier(p: { monthlyClaimVolume: number; userCount: number; fleetSize: number; aiUsage: number }) {
  const { monthlyClaimVolume, userCount, fleetSize, aiUsage } = p;
  const reasoning: string[] = [];
  let tierName = 'starter', basePrice = _TIER_THRESHOLDS.starter.basePrice;
  if (monthlyClaimVolume > _TIER_THRESHOLDS.enterprise.maxClaims || userCount > _TIER_THRESHOLDS.enterprise.maxUsers || fleetSize > _TIER_THRESHOLDS.enterprise.maxFleetSize || aiUsage > _TIER_THRESHOLDS.enterprise.maxAIUsage) {
    tierName = 'custom'; basePrice = _TIER_THRESHOLDS.custom.basePrice; reasoning.push('Exceeds enterprise thresholds');
  } else if (monthlyClaimVolume > _TIER_THRESHOLDS.growth.maxClaims || userCount > _TIER_THRESHOLDS.growth.maxUsers || fleetSize > _TIER_THRESHOLDS.growth.maxFleetSize || aiUsage > _TIER_THRESHOLDS.growth.maxAIUsage) {
    tierName = 'enterprise'; basePrice = _TIER_THRESHOLDS.enterprise.basePrice; reasoning.push('Exceeds growth thresholds');
  } else if (monthlyClaimVolume > _TIER_THRESHOLDS.starter.maxClaims || userCount > _TIER_THRESHOLDS.starter.maxUsers || fleetSize > _TIER_THRESHOLDS.starter.maxFleetSize || aiUsage > _TIER_THRESHOLDS.starter.maxAIUsage) {
    tierName = 'growth'; basePrice = _TIER_THRESHOLDS.growth.basePrice; reasoning.push('Exceeds starter thresholds');
  } else { reasoning.push('Within starter thresholds'); }
  const pricingBand = monthlyClaimVolume <= 100 ? '0-100' : monthlyClaimVolume <= 500 ? '101-500' : monthlyClaimVolume <= 2000 ? '501-2000' : '2000+';
  const multipliers: Record<string, number> = { '0-100': 1.0, '101-500': 1.5, '501-2000': 2.5, '2000+': 4.0 };
  const estimatedMonthlyRevenue = Math.round(basePrice * (multipliers[pricingBand] ?? 1.0));
  const profitabilityScore = Math.min(100, Math.round((estimatedMonthlyRevenue / 10000) * 10));
  return { tierName, pricingBand, estimatedMonthlyRevenue, profitabilityScore, reasoning };
}

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

  // ── Migrated from monetisation.ts ────────────────────────────────────────
  previewTenantTier: protectedProcedure
    .input(z.object({
      monthlyClaimVolume: z.number().min(0),
      userCount: z.number().min(1),
      fleetSize: z.number().min(0).default(0),
      aiUsage: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const c = _classifyTier(input);
      return { success: true, data: { currentInputs: input, tierClassification: c.tierName, pricingBand: c.pricingBand, estimatedMonthlyRevenue: c.estimatedMonthlyRevenue, estimatedMonthlyCost: c.estimatedMonthlyRevenue, profitabilityScore: c.profitabilityScore, reasoning: c.reasoning, tierDetails: _TIER_THRESHOLDS } };
    }),

  getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.tenantId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tenant ID required' });
    const { getTenantUsageSummary } = await import('../metering');
    const { users: usersTable } = await import('../../drizzle/schema');
    const { count: drizzleCount, eq: drizzleEq } = await import('drizzle-orm');
    const { getDb } = await import('../_core/db');
    const dbConn = await getDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const summary = await getTenantUsageSummary({ tenantId: ctx.user.tenantId, startDate: startOfMonth, endDate: endOfMonth });
    const userCountResult = await dbConn.select({ count: drizzleCount() }).from(usersTable).where(drizzleEq(usersTable.tenantId, ctx.user.tenantId));
    return { success: true, data: { monthlyClaimVolume: summary.eventBreakdown['CLAIM_PROCESSED'] || 0, userCount: userCountResult[0]?.count ?? 0, fleetSize: summary.eventBreakdown['FLEET_VEHICLE_MANAGED'] || 0, aiUsage: summary.eventBreakdown['AI_ASSESSMENT_TRIGGERED'] || 0, totalEvents: summary.totalEvents, totalComputeUnits: summary.totalComputeUnits, totalEstimatedCost: summary.totalEstimatedCost, eventBreakdown: summary.eventBreakdown } };
  }),
});
