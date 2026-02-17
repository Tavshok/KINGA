/**
 * Analytics Router
 * 
 * Provides tRPC procedures for executive dashboard analytics and KPIs:
 * - Claims processing metrics
 * - Complexity-adjusted SLA tracking
 * - Fraud detection statistics
 * - Cost savings analysis
 * 
 * @module routers/analytics
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { claims, aiAssessments, panelBeaterQuotes, assessorEvaluations } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, count, avg, sum } from "drizzle-orm";

/**
 * Analytics router for executive dashboard
 */
export const analyticsRouter = router({
  /**
   * Get all KPI metrics for executive dashboard
   */
  getKPIs: protectedProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ input, ctx }) => {
      // Enforce tenant isolation - always use authenticated user's tenantId
      if (!ctx.user.tenantId) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'User must be associated with a tenant to access analytics' 
        });
      }
      const tenantId = ctx.user.tenantId;
      const db = await getDb();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get claims processed this month (tenant-filtered)
      const thisMonthClaims = await db
        .select({ count: count() })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          gte(claims.createdAt, startOfMonth)
        ));

      const lastMonthClaims = await db
        .select({ count: count() })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          gte(claims.createdAt, startOfLastMonth),
          lte(claims.createdAt, endOfLastMonth)
        ));

      const claimsThisMonth = thisMonthClaims[0]?.count || 0;
      const claimsLastMonth = lastMonthClaims[0]?.count || 0;
      const claimsChange = claimsLastMonth > 0 
        ? ((claimsThisMonth - claimsLastMonth) / claimsLastMonth) * 100 
        : 0;

      // Get average processing time (tenant-filtered)
      const completedClaims = await db
        .select({
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          eq(claims.status, 'completed'),
          gte(claims.createdAt, startOfMonth)
        ));

      const avgProcessingDays = completedClaims.length > 0
        ? completedClaims.reduce((sum, claim) => {
            const days = (claim.updatedAt.getTime() - claim.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            return sum + days;
          }, 0) / completedClaims.length
        : 0;

      // Get last month's avg processing time for comparison (tenant-filtered)
      const lastMonthCompletedClaims = await db
        .select({
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          eq(claims.status, 'completed'),
          gte(claims.createdAt, startOfLastMonth),
          lte(claims.createdAt, endOfLastMonth)
        ));

      const lastMonthAvgDays = lastMonthCompletedClaims.length > 0
        ? lastMonthCompletedClaims.reduce((sum, claim) => {
            const days = (claim.updatedAt.getTime() - claim.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            return sum + days;
          }, 0) / lastMonthCompletedClaims.length
        : 0;

      const processingTimeChange = lastMonthAvgDays > 0
        ? ((avgProcessingDays - lastMonthAvgDays) / lastMonthAvgDays) * 100
        : 0;

      // Get fraud detection metrics
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const fraudFlagged = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfMonth),
          sql`${aiAssessments.fraudRiskLevel} = 'high'`
        ));

      const totalAssessments = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfMonth)
        ));

      const fraudCount = fraudFlagged[0]?.count || 0;
      const totalCount = totalAssessments[0]?.count || 0;
      const fraudRate = totalCount > 0 ? (fraudCount / totalCount) * 100 : 0;

      // Get last month fraud rate for comparison
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const lastMonthFraudFlagged = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfLastMonth),
          lte(aiAssessments.createdAt, endOfLastMonth),
          sql`${aiAssessments.fraudRiskLevel} = 'high'`
        ));

      const lastMonthTotalAssessments = await db
        .select({ count: count() })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfLastMonth),
          lte(aiAssessments.createdAt, endOfLastMonth)
        ));

      const lastMonthFraudCount = lastMonthFraudFlagged[0]?.count || 0;
      const lastMonthTotalCount = lastMonthTotalAssessments[0]?.count || 0;
      const lastMonthFraudRate = lastMonthTotalCount > 0 ? (lastMonthFraudCount / lastMonthTotalCount) * 100 : 0;
      
      const fraudRateChange = lastMonthFraudRate > 0
        ? ((fraudRate - lastMonthFraudRate) / lastMonthFraudRate) * 100
        : 0;

      // Calculate cost savings (simplified - in production, use actual cost data)
      // Savings = (AI assessment cost reduction) + (fraud prevention) + (process optimization)
      const aiSavings = claimsThisMonth * 500; // $500 saved per claim via AI assessment
      const fraudSavings = fraudCount * 25000; // $25,000 average fraud claim value
      const processSavings = claimsThisMonth * 100; // $100 saved per claim via process optimization
      const totalSavings = aiSavings + fraudSavings + processSavings;

      const lastMonthSavings = claimsLastMonth * 500 + lastMonthFraudCount * 25000 + claimsLastMonth * 100;
      const savingsChange = lastMonthSavings > 0
        ? ((totalSavings - lastMonthSavings) / lastMonthSavings) * 100
        : 0;

      return {
        claimsProcessed: {
          value: claimsThisMonth,
          change: claimsChange,
          lastMonth: claimsLastMonth
        },
        avgProcessingTime: {
          value: avgProcessingDays.toFixed(1),
          change: -processingTimeChange, // Negative because lower is better
          unit: 'days'
        },
        fraudDetectionRate: {
          value: fraudRate.toFixed(1),
          change: fraudRateChange,
          flagged: fraudCount,
          total: totalCount,
          unit: '%'
        },
        costSavings: {
          value: totalSavings,
          change: savingsChange,
          breakdown: {
            aiAssessment: aiSavings,
            fraudPrevention: fraudSavings,
            processOptimization: processSavings
          },
          unit: 'USD'
        }
      };
    }),

  /**
   * Get claims breakdown by complexity level
   */
  getClaimsByComplexity: protectedProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ input, ctx }) => {
      // Enforce tenant isolation
      if (!ctx.user.tenantId) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'User must be associated with a tenant to access analytics' 
        });
      }
      const tenantId = ctx.user.tenantId;
      const db = await getDb();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const complexityCounts = await db
        .select({
          complexity: claims.complexity_score,
          count: count()
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          gte(claims.createdAt, startOfMonth)
        ))
        .groupBy(claims.complexity_score);

      const result = {
        simple: 0,
        moderate: 0,
        complex: 0,
        exceptional: 0
      };

      complexityCounts.forEach(row => {
        if (row.complexity) {
          result[row.complexity as keyof typeof result] = row.count;
        }
      });

      return result;
    }),

  /**
   * Get SLA compliance metrics by complexity level
   */
  getSLACompliance: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      // Enforce tenant isolation
      if (!ctx.user.tenantId) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'User must be associated with a tenant to access analytics' 
        });
      }
      const tenantId = ctx.user.tenantId;
      const db = await getDb();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // SLA targets by complexity (in days)
      const slaTargets = {
        simple: 2,
        moderate: 5,
        complex: 10,
        exceptional: 20
      };

      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const completedClaims = await db
        .select({
          complexity_score: claims.complexity_score,
          createdAt: claims.createdAt,
          updatedAt: claims.updatedAt
        })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          eq(claims.status, 'completed'),
          gte(claims.createdAt, startOfMonth)
        ));

      const compliance = {
        simple: { met: 0, total: 0, avgDays: 0 },
        moderate: { met: 0, total: 0, avgDays: 0 },
        complex: { met: 0, total: 0, avgDays: 0 },
        exceptional: { met: 0, total: 0, avgDays: 0 }
      };

      completedClaims.forEach(claim => {
        const complexity = claim.complexity_score || 'moderate';
        const days = (claim.updatedAt.getTime() - claim.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const target = slaTargets[complexity as keyof typeof slaTargets];

        compliance[complexity as keyof typeof compliance].total++;
        compliance[complexity as keyof typeof compliance].avgDays += days;
        
        if (days <= target) {
          compliance[complexity as keyof typeof compliance].met++;
        }
      });

      // Calculate percentages and averages
      Object.keys(compliance).forEach(key => {
        const level = compliance[key as keyof typeof compliance];
        if (level.total > 0) {
          level.avgDays = level.avgDays / level.total;
        }
      });

      return {
        simple: {
          compliance: compliance.simple.total > 0 
            ? (compliance.simple.met / compliance.simple.total) * 100 
            : 0,
          avgDays: compliance.simple.avgDays.toFixed(1),
          target: slaTargets.simple
        },
        moderate: {
          compliance: compliance.moderate.total > 0 
            ? (compliance.moderate.met / compliance.moderate.total) * 100 
            : 0,
          avgDays: compliance.moderate.avgDays.toFixed(1),
          target: slaTargets.moderate
        },
        complex: {
          compliance: compliance.complex.total > 0 
            ? (compliance.complex.met / compliance.complex.total) * 100 
            : 0,
          avgDays: compliance.complex.avgDays.toFixed(1),
          target: slaTargets.complex
        },
        exceptional: {
          compliance: compliance.exceptional.total > 0 
            ? (compliance.exceptional.met / compliance.exceptional.total) * 100 
            : 0,
          avgDays: compliance.exceptional.avgDays.toFixed(1),
          target: slaTargets.exceptional
        }
      };
    }),

  /**
   * Get detailed fraud detection metrics
   */
  getFraudMetrics: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      // Enforce tenant isolation
      if (!ctx.user.tenantId) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'User must be associated with a tenant to access analytics' 
        });
      }
      const tenantId = ctx.user.tenantId;
      const db = await getDb();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get all fraud assessments this month
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const fraudAssessments = await db
        .select({
          fraudRiskLevel: aiAssessments.fraudRiskLevel,
          fraudIndicators: aiAssessments.fraudIndicators,
          estimatedCost: aiAssessments.estimatedCost
        })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfMonth)
        ));

      const flagged = fraudAssessments.filter(a => a.fraudRiskLevel === 'medium' || a.fraudRiskLevel === 'high').length;
      const confirmed = fraudAssessments.filter(a => a.fraudRiskLevel === 'high').length;
      const falsePositives = flagged - confirmed;

      // Calculate saved amount (average fraud claim value * confirmed fraud cases)
      const avgFraudValue = 25000; // $25,000 average
      const savedAmount = confirmed * avgFraudValue;

      // Extract top fraud indicators
      const indicatorCounts: Record<string, number> = {};
      fraudAssessments.forEach(assessment => {
        if (assessment.fraudIndicators) {
          try {
            const indicators = JSON.parse(assessment.fraudIndicators as string);
            if (Array.isArray(indicators)) {
              indicators.forEach((indicator: string) => {
                indicatorCounts[indicator] = (indicatorCounts[indicator] || 0) + 1;
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });

      const topIndicators = Object.entries(indicatorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([indicator]) => indicator);

      return {
        flagged,
        confirmed,
        falsePositives,
        savedAmount,
        topIndicators: topIndicators.length > 0 ? topIndicators : [
          'Duplicate claims',
          'Inflated repair costs',
          'Staged accidents'
        ],
        accuracy: flagged > 0 ? (confirmed / flagged) * 100 : 0
      };
    }),

  /**
   * Get detailed cost savings breakdown
   */
  getCostSavings: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      // Enforce tenant isolation
      if (!ctx.user.tenantId) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'User must be associated with a tenant to access analytics' 
        });
      }
      const tenantId = ctx.user.tenantId;
      const db = await getDb();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get claims count for this month
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const claimsCount = await db
        .select({ count: count() })
        .from(claims)
        .where(and(
          eq(claims.tenantId, tenantId),
          gte(claims.createdAt, startOfMonth)
        ));

      const totalClaims = claimsCount[0]?.count || 0;

      // Get fraud prevention savings (tenant-filtered)
      const fraudAssessments = await db
        .select({ fraudRiskLevel: aiAssessments.fraudRiskLevel })
        .from(aiAssessments)
        .where(and(
          eq(aiAssessments.tenantId, tenantId),
          gte(aiAssessments.createdAt, startOfMonth)
        ));

      const confirmedFraud = fraudAssessments.filter(a => a.fraudRiskLevel === 'high').length;
      const fraudSavings = confirmedFraud * 25000; // $25,000 per fraud case

      // AI assessment savings ($500 per claim vs traditional assessment)
      const aiSavings = totalClaims * 500;

      // Process optimization savings ($100 per claim via automation)
      const processSavings = totalClaims * 100;

      const totalSavings = aiSavings + fraudSavings + processSavings;
      const avgSavingPerClaim = totalClaims > 0 ? totalSavings / totalClaims : 0;

      return {
        total: totalSavings,
        aiAssessment: aiSavings,
        fraudPrevention: fraudSavings,
        processOptimization: processSavings,
        avgPerClaim: avgSavingPerClaim,
        claimsProcessed: totalClaims
      };
    }),

  /**
   * Export fast-track analytics as PDF report
   * Role-based access: Executive and ClaimsManager only
   */
  exportFastTrackPDF: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      startDate: z.date(),
      endDate: z.date(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Role-based access control
      const userRole = ctx.user.role;
      if (userRole !== 'executive' && userRole !== 'claims_manager') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only executives and claims managers can export analytics reports',
        });
      }

      const { gatherAnalyticsData, generatePDFReport } = await import("../services/analytics/analytics-export");

      // Gather all analytics data
      const analyticsData = await gatherAnalyticsData(
        input.tenantId,
        { startDate: input.startDate, endDate: input.endDate },
        {
          tenantId: input.tenantId,
          tenantName: ctx.user.name || undefined,
          generatedAt: new Date(),
          generatedBy: ctx.user.name || ctx.user.email || 'Unknown',
        }
      );

      // Generate PDF
      const pdfBuffer = await generatePDFReport(analyticsData);

      // Return base64-encoded PDF
      return {
        filename: `fast-track-analytics-${input.tenantId}-${new Date().toISOString().split('T')[0]}.pdf`,
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
      };
    }),

  /**
   * Export fast-track analytics as CSV report
   * Role-based access: Executive and ClaimsManager only
   */
  exportFastTrackCSV: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      startDate: z.date(),
      endDate: z.date(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Role-based access control
      const userRole = ctx.user.role;
      if (userRole !== 'executive' && userRole !== 'claims_manager') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only executives and claims managers can export analytics reports',
        });
      }

      const { gatherAnalyticsData, generateCSVReport } = await import("../services/analytics/analytics-export");

      // Gather all analytics data
      const analyticsData = await gatherAnalyticsData(
        input.tenantId,
        { startDate: input.startDate, endDate: input.endDate },
        {
          tenantId: input.tenantId,
          tenantName: ctx.user.name || undefined,
          generatedAt: new Date(),
          generatedBy: ctx.user.name || ctx.user.email || 'Unknown',
        }
      );

      // Generate CSV
      const csvContent = await generateCSVReport(analyticsData);

      // Return CSV content
      return {
        filename: `fast-track-analytics-${input.tenantId}-${new Date().toISOString().split('T')[0]}.csv`,
        data: csvContent,
        mimeType: 'text/csv',
      };
    }),
});
