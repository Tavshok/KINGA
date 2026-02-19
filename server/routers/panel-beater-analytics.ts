// @ts-nocheck
/**
 * Panel Beater Analytics Router
 * 
 * Provides comprehensive performance analytics for panel beaters:
 * - Average repair time
 * - Average cost per claim
 * - Completion rate
 * - Rework frequency
 * - Performance trends over time
 * - Comparative analysis between panel beaters
 * 
 * Access: insurer_admin, executive, claims_manager roles
 * 
 * ALL QUERIES OPTIMIZED:
 * - Single-query JOINs where possible
 * - No N+1 patterns
 * - Indexed foreign keys only (panel_beater_id, claim_id, tenant_id)
 * - Proper pagination support
 */

import { router, protectedProcedure } from "../_core/trpc";
import { 
  panelBeaters, 
  panelBeaterQuotes, 
  claims 
} from "../../drizzle/schema";
import { eq, and, gte, sql, desc, inArray, count } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { safeNumber, safePercentage } from "../governance-helpers";

/**
 * Middleware to enforce insurer staff access only
 */
const panelBeaterAnalyticsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user?.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant ID required",
    });
  }

  // Check if user has appropriate role
  const hasAccess = 
    ctx.user.role === "admin" || 
    ctx.user.role === "executive" ||
    ctx.user.insurerRole === "insurer_admin" ||
    ctx.user.insurerRole === "claims_manager";

  if (!hasAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access restricted to insurer staff",
    });
  }

  return next({ ctx });
});

/**
 * Type definitions for analytics responses
 */
interface PanelBeaterPerformance {
  panelBeaterId: number;
  panelBeaterName: string;
  businessName: string;
  avgRepairTimeDays: number;
  avgCostPerClaim: number;
  completionRate: number;
  reworkFrequency: number;
  totalClaimsAssigned: number;
  totalClaimsCompleted: number;
  totalQuotesSubmitted: number;
  avgQuoteAmount: number;
  lastActivityDate: string | null;
}

interface TrendDataPoint {
  period: string;
  avgRepairTime: number;
  avgCost: number;
  completionRate: number;
  claimsCompleted: number;
}

interface ComparisonResult {
  panelBeaterId: number;
  panelBeaterName: string;
  avgRepairTimeDays: number;
  avgCostPerClaim: number;
  completionRate: number;
  reworkFrequency: number;
  rank: number;
}

export const panelBeaterAnalyticsRouter = router({
  /**
   * 1️⃣ GET ALL PERFORMANCE
   * 
   * Returns performance metrics for all panel beaters in tenant
   * 
   * Metrics:
   * - Avg repair time (days from claim assignment to completion)
   * - Avg cost per claim (from quotes)
   * - Completion rate (% of assigned claims completed)
   * - Rework frequency (% of claims requiring rework)
   * 
   * Query Strategy:
   * - Single query with LEFT JOINs
   * - Aggregations with GROUP BY panel_beater_id
   * - Indexed on panel_beater_id, tenant_id
   */
  getAllPerformance: panelBeaterAnalyticsProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        sortBy: z.enum(["avgRepairTime", "avgCost", "completionRate", "reworkFrequency", "name"]).default("completionRate"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { page, limit, sortBy, sortOrder } = input;
      const offset = (page - 1) * limit;

      try {
        // Get all panel beaters with aggregated metrics in a single query
        const performanceData = await db
          .select({
            panelBeaterId: panelBeaters.id,
            panelBeaterName: panelBeaters.name,
            businessName: panelBeaters.businessName,
            
            // Total claims assigned
            totalClaimsAssigned: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} THEN ${claims.id} END)`,
            
            // Total claims completed
            totalClaimsCompleted: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' THEN ${claims.id} END)`,
            
            // Avg repair time (days between assignment and completion)
            avgRepairTimeDays: sql<number>`AVG(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' AND ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) END)`,
            
            // Total quotes submitted
            totalQuotesSubmitted: sql<number>`COUNT(DISTINCT ${panelBeaterQuotes.id})`,
            
            // Avg quote amount (in cents)
            avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
            
            // Last activity date
            lastActivityDate: sql<string>`MAX(GREATEST(COALESCE(${claims.updatedAt}, '1970-01-01'), COALESCE(${panelBeaterQuotes.updatedAt}, '1970-01-01')))`,
          })
          .from(panelBeaters)
          .leftJoin(claims, eq(claims.assignedPanelBeaterId, panelBeaters.id))
          .leftJoin(panelBeaterQuotes, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(eq(panelBeaters.tenantId, ctx.user.tenantId!))
          .groupBy(panelBeaters.id, panelBeaters.name, panelBeaters.businessName);

        // Calculate derived metrics
        const results: PanelBeaterPerformance[] = performanceData.map((row) => {
          const totalAssigned = safeNumber(row.totalClaimsAssigned, 0);
          const totalCompleted = safeNumber(row.totalClaimsCompleted, 0);
          const avgRepairTime = safeNumber(row.avgRepairTimeDays, 0);
          const avgQuote = safeNumber(row.avgQuoteAmount, 0);

          // Completion rate
          const completionRate = safePercentage(totalCompleted, totalAssigned);

          // Rework frequency (placeholder - would need status transition tracking)
          // For now, estimate based on claims with multiple quotes
          const reworkFrequency = 0; // TODO: Implement rework tracking

          return {
            panelBeaterId: row.panelBeaterId,
            panelBeaterName: row.panelBeaterName,
            businessName: row.businessName,
            avgRepairTimeDays: Math.round(avgRepairTime * 10) / 10,
            avgCostPerClaim: Math.round(avgQuote / 100), // Convert cents to dollars
            completionRate,
            reworkFrequency,
            totalClaimsAssigned: totalAssigned,
            totalClaimsCompleted: totalCompleted,
            totalQuotesSubmitted: safeNumber(row.totalQuotesSubmitted, 0),
            avgQuoteAmount: Math.round(avgQuote / 100),
            lastActivityDate: row.lastActivityDate || null,
          };
        });

        // Sort results
        const sortedResults = results.sort((a, b) => {
          let aVal: number | string = 0;
          let bVal: number | string = 0;

          switch (sortBy) {
            case "avgRepairTime":
              aVal = a.avgRepairTimeDays;
              bVal = b.avgRepairTimeDays;
              break;
            case "avgCost":
              aVal = a.avgCostPerClaim;
              bVal = b.avgCostPerClaim;
              break;
            case "completionRate":
              aVal = a.completionRate;
              bVal = b.completionRate;
              break;
            case "reworkFrequency":
              aVal = a.reworkFrequency;
              bVal = b.reworkFrequency;
              break;
            case "name":
              aVal = a.panelBeaterName.toLowerCase();
              bVal = b.panelBeaterName.toLowerCase();
              break;
          }

          if (sortOrder === "asc") {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
          }
        });

        // Paginate
        const paginatedResults = sortedResults.slice(offset, offset + limit);

        return {
          success: true,
          data: paginatedResults,
          pagination: {
            page,
            limit,
            total: results.length,
            totalPages: Math.ceil(results.length / limit),
          },
        };
      } catch (error) {
        console.error("[PanelBeaterAnalytics] getAllPerformance error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch panel beater performance metrics",
        });
      }
    }),

  /**
   * 2️⃣ GET PERFORMANCE (Single Panel Beater)
   * 
   * Returns detailed performance metrics for a specific panel beater
   * 
   * Query Strategy:
   * - Single query with JOINs
   * - Filtered by panelBeaterId
   */
  getPerformance: panelBeaterAnalyticsProcedure
    .input(
      z.object({
        panelBeaterId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { panelBeaterId } = input;

      try {
        // Get panel beater details
        const [panelBeater] = await db
          .select()
          .from(panelBeaters)
          .where(
            and(
              eq(panelBeaters.id, panelBeaterId),
              eq(panelBeaters.tenantId, ctx.user.tenantId!)
            )
          )
          .limit(1);

        if (!panelBeater) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Panel beater not found",
          });
        }

        // Get performance metrics
        const [metrics] = await db
          .select({
            totalClaimsAssigned: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaterId} THEN ${claims.id} END)`,
            totalClaimsCompleted: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaterId} AND ${claims.status} = 'completed' THEN ${claims.id} END)`,
            avgRepairTimeDays: sql<number>`AVG(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaterId} AND ${claims.status} = 'completed' AND ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) END)`,
            totalQuotesSubmitted: count(panelBeaterQuotes.id),
            avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
            minQuoteAmount: sql<number>`MIN(${panelBeaterQuotes.quotedAmount})`,
            maxQuoteAmount: sql<number>`MAX(${panelBeaterQuotes.quotedAmount})`,
          })
          .from(panelBeaters)
          .leftJoin(claims, eq(claims.assignedPanelBeaterId, panelBeaters.id))
          .leftJoin(panelBeaterQuotes, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(
            and(
              eq(panelBeaters.id, panelBeaterId),
              eq(panelBeaters.tenantId, ctx.user.tenantId!)
            )
          );

        const totalAssigned = safeNumber(metrics.totalClaimsAssigned, 0);
        const totalCompleted = safeNumber(metrics.totalClaimsCompleted, 0);
        const avgRepairTime = safeNumber(metrics.avgRepairTimeDays, 0);
        const avgQuote = safeNumber(metrics.avgQuoteAmount, 0);

        const result: PanelBeaterPerformance = {
          panelBeaterId: panelBeater.id,
          panelBeaterName: panelBeater.name,
          businessName: panelBeater.businessName,
          avgRepairTimeDays: Math.round(avgRepairTime * 10) / 10,
          avgCostPerClaim: Math.round(avgQuote / 100),
          completionRate: safePercentage(totalCompleted, totalAssigned),
          reworkFrequency: 0, // TODO: Implement rework tracking
          totalClaimsAssigned: totalAssigned,
          totalClaimsCompleted: totalCompleted,
          totalQuotesSubmitted: safeNumber(metrics.totalQuotesSubmitted, 0),
          avgQuoteAmount: Math.round(avgQuote / 100),
          lastActivityDate: null,
        };

        return {
          success: true,
          data: result,
          details: {
            minQuoteAmount: Math.round(safeNumber(metrics.minQuoteAmount, 0) / 100),
            maxQuoteAmount: Math.round(safeNumber(metrics.maxQuoteAmount, 0) / 100),
            contactInfo: {
              email: panelBeater.email,
              phone: panelBeater.phone,
              address: panelBeater.address,
              city: panelBeater.city,
            },
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[PanelBeaterAnalytics] getPerformance error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch panel beater performance",
        });
      }
    }),

  /**
   * 3️⃣ GET TOP PANEL BEATERS
   * 
   * Returns top N panel beaters ranked by specified metric
   * 
   * Query Strategy:
   * - Reuse getAllPerformance logic
   * - Sort and limit results
   */
  getTopPanelBeaters: panelBeaterAnalyticsProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        rankBy: z.enum(["completionRate", "avgRepairTime", "avgCost"]).default("completionRate"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { limit, rankBy } = input;

      try {
        // Get all panel beaters with metrics
        const performanceData = await db
          .select({
            panelBeaterId: panelBeaters.id,
            panelBeaterName: panelBeaters.name,
            businessName: panelBeaters.businessName,
            totalClaimsAssigned: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} THEN ${claims.id} END)`,
            totalClaimsCompleted: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' THEN ${claims.id} END)`,
            avgRepairTimeDays: sql<number>`AVG(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' AND ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) END)`,
            avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
          })
          .from(panelBeaters)
          .leftJoin(claims, eq(claims.assignedPanelBeaterId, panelBeaters.id))
          .leftJoin(panelBeaterQuotes, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(eq(panelBeaters.tenantId, ctx.user.tenantId!))
          .groupBy(panelBeaters.id, panelBeaters.name, panelBeaters.businessName);

        // Calculate metrics and rank
        const results = performanceData
          .map((row) => {
            const totalAssigned = safeNumber(row.totalClaimsAssigned, 0);
            const totalCompleted = safeNumber(row.totalClaimsCompleted, 0);
            const avgRepairTime = safeNumber(row.avgRepairTimeDays, 0);
            const avgQuote = safeNumber(row.avgQuoteAmount, 0);

            return {
              panelBeaterId: row.panelBeaterId,
              panelBeaterName: row.panelBeaterName,
              avgRepairTimeDays: Math.round(avgRepairTime * 10) / 10,
              avgCostPerClaim: Math.round(avgQuote / 100),
              completionRate: safePercentage(totalCompleted, totalAssigned),
              reworkFrequency: 0,
              rank: 0, // Will be assigned after sorting
            };
          })
          .filter((row) => row.avgRepairTimeDays > 0 || row.completionRate > 0); // Filter out inactive panel beaters

        // Sort by ranking metric
        const sortedResults = results.sort((a, b) => {
          switch (rankBy) {
            case "completionRate":
              return b.completionRate - a.completionRate;
            case "avgRepairTime":
              return a.avgRepairTimeDays - b.avgRepairTimeDays; // Lower is better
            case "avgCost":
              return a.avgCostPerClaim - b.avgCostPerClaim; // Lower is better
            default:
              return 0;
          }
        });

        // Assign ranks and limit
        const rankedResults: ComparisonResult[] = sortedResults
          .slice(0, limit)
          .map((row, index) => ({
            ...row,
            rank: index + 1,
          }));

        return {
          success: true,
          data: rankedResults,
          rankBy,
        };
      } catch (error) {
        console.error("[PanelBeaterAnalytics] getTopPanelBeaters error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch top panel beaters",
        });
      }
    }),

  /**
   * 4️⃣ GET TRENDS
   * 
   * Returns performance trends over time for all panel beaters or a specific one
   * 
   * Query Strategy:
   * - Group by time period (week/month)
   * - Calculate metrics per period
   * - Return time series data
   */
  getTrends: panelBeaterAnalyticsProcedure
    .input(
      z.object({
        panelBeaterId: z.number().optional(),
        timeRange: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
        groupBy: z.enum(["day", "week", "month"]).default("week"),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { panelBeaterId, timeRange, groupBy } = input;

      try {
        // Calculate date range
        const daysMap = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
        const days = daysMap[timeRange];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Determine date grouping format
        let dateFormat: string;
        switch (groupBy) {
          case "day":
            dateFormat = "%Y-%m-%d";
            break;
          case "week":
            dateFormat = "%Y-%u"; // Year-Week
            break;
          case "month":
            dateFormat = "%Y-%m";
            break;
        }

        // Build query with optional panel beater filter
        const whereConditions = [
          eq(panelBeaters.tenantId, ctx.user.tenantId!),
          gte(claims.createdAt, startDate),
        ];

        if (panelBeaterId) {
          whereConditions.push(eq(panelBeaters.id, panelBeaterId));
        }

        const trendData = await db
          .select({
            period: sql<string>`DATE_FORMAT(${claims.createdAt}, ${dateFormat})`,
            avgRepairTime: sql<number>`AVG(CASE WHEN ${claims.status} = 'completed' AND ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) END)`,
            avgCost: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
            claimsCompleted: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.status} = 'completed' THEN ${claims.id} END)`,
            totalClaimsAssigned: sql<number>`COUNT(DISTINCT ${claims.id})`,
          })
          .from(panelBeaters)
          .leftJoin(claims, eq(claims.assignedPanelBeaterId, panelBeaters.id))
          .leftJoin(panelBeaterQuotes, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(and(...whereConditions))
          .groupBy(sql`DATE_FORMAT(${claims.createdAt}, ${dateFormat})`)
          .orderBy(sql`DATE_FORMAT(${claims.createdAt}, ${dateFormat})`);

        // Format results
        const results: TrendDataPoint[] = trendData.map((row) => {
          const totalAssigned = safeNumber(row.totalClaimsAssigned, 0);
          const claimsCompleted = safeNumber(row.claimsCompleted, 0);

          return {
            period: row.period || "Unknown",
            avgRepairTime: Math.round(safeNumber(row.avgRepairTime, 0) * 10) / 10,
            avgCost: Math.round(safeNumber(row.avgCost, 0) / 100),
            completionRate: safePercentage(claimsCompleted, totalAssigned),
            claimsCompleted,
          };
        });

        return {
          success: true,
          data: results,
          timeRange,
          groupBy,
          panelBeaterId: panelBeaterId || null,
        };
      } catch (error) {
        console.error("[PanelBeaterAnalytics] getTrends error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch performance trends",
        });
      }
    }),

  /**
   * 5️⃣ COMPARE PANEL BEATERS
   * 
   * Returns side-by-side comparison of specified panel beaters
   * 
   * Query Strategy:
   * - Single query with WHERE IN clause
   * - Group by panel beater ID
   * - Return comparative metrics
   */
  comparePanelBeaters: panelBeaterAnalyticsProcedure
    .input(
      z.object({
        panelBeaterIds: z.array(z.number()).min(2).max(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { panelBeaterIds } = input;

      try {
        // Get performance metrics for specified panel beaters
        const performanceData = await db
          .select({
            panelBeaterId: panelBeaters.id,
            panelBeaterName: panelBeaters.name,
            totalClaimsAssigned: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} THEN ${claims.id} END)`,
            totalClaimsCompleted: sql<number>`COUNT(DISTINCT CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' THEN ${claims.id} END)`,
            avgRepairTimeDays: sql<number>`AVG(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} AND ${claims.status} = 'completed' AND ${claims.closedAt} IS NOT NULL THEN DATEDIFF(${claims.closedAt}, ${claims.createdAt}) END)`,
            avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
          })
          .from(panelBeaters)
          .leftJoin(claims, eq(claims.assignedPanelBeaterId, panelBeaters.id))
          .leftJoin(panelBeaterQuotes, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
          .where(
            and(
              inArray(panelBeaters.id, panelBeaterIds),
              eq(panelBeaters.tenantId, ctx.user.tenantId!)
            )
          )
          .groupBy(panelBeaters.id, panelBeaters.name);

        if (performanceData.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No panel beaters found with the specified IDs",
          });
        }

        // Calculate metrics
        const results: ComparisonResult[] = performanceData.map((row) => {
          const totalAssigned = safeNumber(row.totalClaimsAssigned, 0);
          const totalCompleted = safeNumber(row.totalClaimsCompleted, 0);
          const avgRepairTime = safeNumber(row.avgRepairTimeDays, 0);
          const avgQuote = safeNumber(row.avgQuoteAmount, 0);

          return {
            panelBeaterId: row.panelBeaterId,
            panelBeaterName: row.panelBeaterName,
            avgRepairTimeDays: Math.round(avgRepairTime * 10) / 10,
            avgCostPerClaim: Math.round(avgQuote / 100),
            completionRate: safePercentage(totalCompleted, totalAssigned),
            reworkFrequency: 0,
            rank: 0, // Will be assigned based on overall performance
          };
        });

        // Calculate overall performance score and rank
        const rankedResults = results
          .map((row) => {
            // Simple scoring: higher completion rate + lower repair time + lower cost = better
            const score = row.completionRate - (row.avgRepairTimeDays * 0.5) - (row.avgCostPerClaim * 0.001);
            return { ...row, score };
          })
          .sort((a, b) => b.score - a.score)
          .map((row, index) => ({
            panelBeaterId: row.panelBeaterId,
            panelBeaterName: row.panelBeaterName,
            avgRepairTimeDays: row.avgRepairTimeDays,
            avgCostPerClaim: row.avgCostPerClaim,
            completionRate: row.completionRate,
            reworkFrequency: row.reworkFrequency,
            rank: index + 1,
          }));

        return {
          success: true,
          data: rankedResults,
          comparisonCount: rankedResults.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("[PanelBeaterAnalytics] comparePanelBeaters error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to compare panel beaters",
        });
      }
    }),
});
