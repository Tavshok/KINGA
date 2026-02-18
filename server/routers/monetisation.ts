/**
 * Monetisation Router - Usage Simulation & Revenue Analytics
 * 
 * Provides:
 * 1. Usage simulation endpoint for tier classification
 * 2. Super-admin revenue dashboard analytics
 * 3. Tenant usage ranking and profitability analysis
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { usageEvents, tenants, users } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, count, sum, avg, sql } from "drizzle-orm";
import { getTenantUsageSummary } from "../metering";

/**
 * Super-admin only middleware
 */
const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Super-admin role required.",
    });
  }
  return next({ ctx });
});

/**
 * Tier classification thresholds
 */
const TIER_THRESHOLDS = {
  starter: {
    maxClaims: 100,
    maxUsers: 5,
    maxFleetSize: 10,
    maxAIUsage: 50,
    basePrice: 49900, // $499/month in cents
  },
  growth: {
    maxClaims: 500,
    maxUsers: 20,
    maxFleetSize: 50,
    maxAIUsage: 250,
    basePrice: 149900, // $1,499/month in cents
  },
  enterprise: {
    maxClaims: 2000,
    maxUsers: 100,
    maxFleetSize: 200,
    maxAIUsage: 1000,
    basePrice: 499900, // $4,999/month in cents
  },
  custom: {
    maxClaims: Infinity,
    maxUsers: Infinity,
    maxFleetSize: Infinity,
    maxAIUsage: Infinity,
    basePrice: 999900, // $9,999/month minimum in cents
  },
};

/**
 * Pricing bands for variable pricing
 */
const PRICING_BANDS = {
  "0-100": { multiplier: 1.0, label: "Starter" },
  "101-500": { multiplier: 1.5, label: "Growth" },
  "501-2000": { multiplier: 2.5, label: "Enterprise" },
  "2000+": { multiplier: 4.0, label: "Custom" },
};

/**
 * Calculate tier classification based on usage
 */
function classifyTier(params: {
  monthlyClaimVolume: number;
  userCount: number;
  fleetSize: number;
  aiUsage: number;
}): {
  tierName: string;
  pricingBand: string;
  estimatedMonthlyRevenue: number;
  profitabilityScore: number;
  reasoning: string[];
} {
  const { monthlyClaimVolume, userCount, fleetSize, aiUsage } = params;
  const reasoning: string[] = [];

  // Determine tier based on highest threshold exceeded
  let tierName = "starter";
  let basePrice = TIER_THRESHOLDS.starter.basePrice;

  if (
    monthlyClaimVolume > TIER_THRESHOLDS.enterprise.maxClaims ||
    userCount > TIER_THRESHOLDS.enterprise.maxUsers ||
    fleetSize > TIER_THRESHOLDS.enterprise.maxFleetSize ||
    aiUsage > TIER_THRESHOLDS.enterprise.maxAIUsage
  ) {
    tierName = "custom";
    basePrice = TIER_THRESHOLDS.custom.basePrice;
    reasoning.push("Exceeds enterprise thresholds - requires custom pricing");
  } else if (
    monthlyClaimVolume > TIER_THRESHOLDS.growth.maxClaims ||
    userCount > TIER_THRESHOLDS.growth.maxUsers ||
    fleetSize > TIER_THRESHOLDS.growth.maxFleetSize ||
    aiUsage > TIER_THRESHOLDS.growth.maxAIUsage
  ) {
    tierName = "enterprise";
    basePrice = TIER_THRESHOLDS.enterprise.basePrice;
    reasoning.push("High volume usage - enterprise tier recommended");
  } else if (
    monthlyClaimVolume > TIER_THRESHOLDS.starter.maxClaims ||
    userCount > TIER_THRESHOLDS.starter.maxUsers ||
    fleetSize > TIER_THRESHOLDS.starter.maxFleetSize ||
    aiUsage > TIER_THRESHOLDS.starter.maxAIUsage
  ) {
    tierName = "growth";
    basePrice = TIER_THRESHOLDS.growth.basePrice;
    reasoning.push("Growing usage - growth tier recommended");
  } else {
    reasoning.push("Low volume - starter tier sufficient");
  }

  // Determine pricing band based on claim volume
  let pricingBand = "0-100";
  let multiplier = 1.0;

  if (monthlyClaimVolume > 2000) {
    pricingBand = "2000+";
    multiplier = PRICING_BANDS["2000+"].multiplier;
  } else if (monthlyClaimVolume > 500) {
    pricingBand = "501-2000";
    multiplier = PRICING_BANDS["501-2000"].multiplier;
  } else if (monthlyClaimVolume > 100) {
    pricingBand = "101-500";
    multiplier = PRICING_BANDS["101-500"].multiplier;
  }

  // Calculate estimated revenue
  const estimatedMonthlyRevenue = Math.round(basePrice * multiplier);

  // Calculate profitability score (0-100)
  // Higher usage with lower user count = more profitable
  const usageScore = (monthlyClaimVolume + fleetSize + aiUsage) / 10;
  const efficiencyScore = userCount > 0 ? usageScore / userCount : 0;
  const profitabilityScore = Math.min(100, Math.round(efficiencyScore * 10));

  if (profitabilityScore > 70) {
    reasoning.push("High profitability - efficient usage per user");
  } else if (profitabilityScore < 30) {
    reasoning.push("Low profitability - consider upselling or optimization");
  }

  return {
    tierName,
    pricingBand,
    estimatedMonthlyRevenue,
    profitabilityScore,
    reasoning,
  };
}

export const monetisationRouter = router({
  /**
   * Preview tenant tier classification
   * 
   * Simulates tier assignment based on projected usage.
   * Available to tenant admins for planning purposes.
   */
  previewTenantTier: protectedProcedure
    .input(
      z.object({
        monthlyClaimVolume: z.number().min(0),
        userCount: z.number().min(1),
        fleetSize: z.number().min(0).default(0),
        aiUsage: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const classification = classifyTier(input);

        return {
          success: true,
          data: {
            currentInputs: input,
            tierClassification: classification.tierName,
            pricingBand: classification.pricingBand,
            estimatedMonthlyRevenue: classification.estimatedMonthlyRevenue,
            estimatedMonthlyCost: classification.estimatedMonthlyRevenue, // Same for now
            profitabilityScore: classification.profitabilityScore,
            reasoning: classification.reasoning,
            tierDetails: {
              starter: TIER_THRESHOLDS.starter,
              growth: TIER_THRESHOLDS.growth,
              enterprise: TIER_THRESHOLDS.enterprise,
              custom: TIER_THRESHOLDS.custom,
            },
          },
        };
      } catch (error) {
        console.error("Error previewing tenant tier:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to preview tenant tier",
        });
      }
    }),

  /**
   * Get current tenant usage summary
   */
  getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (!ctx.user.tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant ID required",
        });
      }

      // Get current month usage
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const summary = await getTenantUsageSummary({
        tenantId: ctx.user.tenantId,
        startDate: startOfMonth,
        endDate: endOfMonth,
      });

      // Get user count
      const userCount = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, ctx.user.tenantId));

      // Calculate metrics
      const monthlyClaimVolume = summary.eventBreakdown["CLAIM_PROCESSED"] || 0;
      const aiUsage = summary.eventBreakdown["AI_ASSESSMENT_TRIGGERED"] || 0;
      const fleetSize = summary.eventBreakdown["FLEET_VEHICLE_MANAGED"] || 0;

      return {
        success: true,
        data: {
          monthlyClaimVolume,
          userCount: userCount[0].count,
          fleetSize,
          aiUsage,
          totalEvents: summary.totalEvents,
          totalComputeUnits: summary.totalComputeUnits,
          totalEstimatedCost: summary.totalEstimatedCost,
          eventBreakdown: summary.eventBreakdown,
        },
      };
    } catch (error) {
      console.error("Error fetching current usage:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch current usage",
      });
    }
  }),

  /**
   * SUPER-ADMIN: Get tenant usage ranking
   */
  getTenantUsageRanking: superAdminProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);

        // Get all tenants with usage
        const tenantUsage = await db
          .select({
            tenantId: usageEvents.tenantId,
            totalEvents: sql<number>`count(*)`.as('totalEvents'),
            totalComputeUnits: sql<string>`sum(${usageEvents.computeUnits})`.as('totalComputeUnits'),
            totalEstimatedCost: sql<string>`sum(${usageEvents.estimatedCost})`.as('totalEstimatedCost'),
          })
          .from(usageEvents)
          .where(and(gte(usageEvents.timestamp, startDate), lte(usageEvents.timestamp, endDate)))
          .groupBy(sql`${usageEvents.tenantId}`)
          .orderBy(sql`sum(${usageEvents.estimatedCost}) desc`)
          .limit(input.limit);

        return {
          success: true,
          data: tenantUsage,
        };
      } catch (error) {
        console.error("Error fetching tenant usage ranking:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch tenant usage ranking",
        });
      }
    }),

  /**
   * SUPER-ADMIN: Monthly revenue simulation
   */
  getMonthlyRevenueSimulation: superAdminProcedure
    .input(
      z.object({
        month: z.string(), // YYYY-MM format
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const [year, month] = input.month.split("-").map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Get all tenant usage for the month
        const tenantUsage = await db
          .select({
            tenantId: usageEvents.tenantId,
            claimsProcessed: sql<number>`count(*)`.as('claimsProcessed'),
            totalComputeUnits: sql<string>`sum(${usageEvents.computeUnits})`.as('totalComputeUnits'),
            totalEstimatedCost: sql<string>`sum(${usageEvents.estimatedCost})`.as('totalEstimatedCost'),
          })
          .from(usageEvents)
          .where(and(gte(usageEvents.timestamp, startDate), lte(usageEvents.timestamp, endDate)))
          .groupBy(sql`${usageEvents.tenantId}`);

        // Classify each tenant and calculate revenue
        const tenantClassifications = [];
        let totalEstimatedRevenue = 0;

        for (const usage of tenantUsage) {
          // Get user count for this tenant
          const userCount = await db
            .select({ count: count() })
            .from(users)
            .where(eq(users.tenantId, usage.tenantId));

          const classification = classifyTier({
            monthlyClaimVolume: usage.claimsProcessed,
            userCount: userCount[0].count,
            fleetSize: 0, // Would need to query fleet tables
            aiUsage: 0, // Would need to filter AI events
          });

          totalEstimatedRevenue += classification.estimatedMonthlyRevenue;

          tenantClassifications.push({
            tenantId: usage.tenantId,
            claimsProcessed: usage.claimsProcessed,
            userCount: userCount[0].count,
            tierName: classification.tierName,
            pricingBand: classification.pricingBand,
            estimatedRevenue: classification.estimatedMonthlyRevenue,
            profitabilityScore: classification.profitabilityScore,
            computeUnits: usage.totalComputeUnits,
            estimatedCost: usage.totalEstimatedCost,
          });
        }

        return {
          success: true,
          data: {
            month: input.month,
            totalTenants: tenantClassifications.length,
            totalEstimatedRevenue,
            averageRevenuePerTenant:
              tenantClassifications.length > 0
                ? Math.round(totalEstimatedRevenue / tenantClassifications.length)
                : 0,
            tenantClassifications: tenantClassifications.sort(
              (a, b) => b.estimatedRevenue - a.estimatedRevenue
            ),
          },
        };
      } catch (error) {
        console.error("Error simulating monthly revenue:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to simulate monthly revenue",
        });
      }
    }),

  /**
   * SUPER-ADMIN: Detect high-growth tenants
   */
  getHighGrowthTenants: superAdminProcedure
    .input(
      z.object({
        lookbackMonths: z.number().min(1).max(12).default(3),
        growthThreshold: z.number().min(0).max(100).default(50), // % growth
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - input.lookbackMonths,
          1
        );

        // Get current period usage
        const currentUsage = await db
          .select({
            tenantId: usageEvents.tenantId,
            eventCount: sql<number>`count(*)`.as('eventCount'),
          })
          .from(usageEvents)
          .where(gte(usageEvents.timestamp, currentMonthStart))
          .groupBy(sql`${usageEvents.tenantId}`);

        // Get previous period usage
        const previousUsage = await db
          .select({
            tenantId: usageEvents.tenantId,
            eventCount: sql<number>`count(*)`.as('eventCount'),
          })
          .from(usageEvents)
          .where(
            and(
              gte(usageEvents.timestamp, previousMonthStart),
              lte(usageEvents.timestamp, currentMonthStart)
            )
          )
          .groupBy(sql`${usageEvents.tenantId}`);

        // Calculate growth rates
        const growthAnalysis = currentUsage
          .map((current) => {
            const previous = previousUsage.find((p) => p.tenantId === current.tenantId);
            const previousCount = previous?.eventCount || 0;
            const growthRate =
              previousCount > 0 ? ((current.eventCount - previousCount) / previousCount) * 100 : 0;

            return {
              tenantId: current.tenantId,
              currentEvents: current.eventCount,
              previousEvents: previousCount,
              growthRate: Math.round(growthRate),
            };
          })
          .filter((t) => t.growthRate >= input.growthThreshold)
          .sort((a, b) => b.growthRate - a.growthRate);

        return {
          success: true,
          data: {
            highGrowthTenants: growthAnalysis,
            totalHighGrowth: growthAnalysis.length,
            averageGrowthRate:
              growthAnalysis.length > 0
                ? Math.round(
                    growthAnalysis.reduce((sum, t) => sum + t.growthRate, 0) / growthAnalysis.length
                  )
                : 0,
          },
        };
      } catch (error) {
        console.error("Error detecting high-growth tenants:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to detect high-growth tenants",
        });
      }
    }),

  /**
   * SUPER-ADMIN: Cost vs compute load ratio
   */
  getCostComputeRatio: superAdminProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);

        // Get aggregate metrics
        const metrics = await db
          .select({
            tenantId: usageEvents.tenantId,
            totalEvents: sql<number>`count(*)`.as('totalEvents'),
            totalComputeUnits: sql<string>`sum(${usageEvents.computeUnits})`.as('totalComputeUnits'),
            totalEstimatedCost: sql<string>`sum(${usageEvents.estimatedCost})`.as('totalEstimatedCost'),
            avgProcessingTime: sql<string>`avg(${usageEvents.processingTimeMs})`.as('avgProcessingTime'),
          })
          .from(usageEvents)
          .where(and(gte(usageEvents.timestamp, startDate), lte(usageEvents.timestamp, endDate)))
          .groupBy(sql`${usageEvents.tenantId}`);

        const ratioAnalysis = metrics.map((m) => {
          const computeUnits = parseFloat(m.totalComputeUnits || "0");
          const cost = parseFloat(m.totalEstimatedCost || "0");
          const ratio = computeUnits > 0 ? cost / computeUnits : 0;

          return {
            tenantId: m.tenantId,
            totalEvents: m.totalEvents,
            totalComputeUnits: computeUnits,
            totalEstimatedCost: cost,
            avgProcessingTime: parseFloat(m.avgProcessingTime || "0"),
            costPerComputeUnit: ratio.toFixed(4),
          };
        });

        return {
          success: true,
          data: {
            tenantMetrics: ratioAnalysis,
            platformAverageCostPerUnit:
              ratioAnalysis.length > 0
                ? (
                    ratioAnalysis.reduce((sum, t) => sum + parseFloat(t.costPerComputeUnit), 0) /
                    ratioAnalysis.length
                  ).toFixed(4)
                : "0.0000",
          },
        };
      } catch (error) {
        console.error("Error calculating cost/compute ratio:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate cost/compute ratio",
        });
      }
    }),
});
