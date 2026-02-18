/**
 * CONSOLIDATED ANALYTICS ROUTER - SINGLE SOURCE OF TRUTH
 * 
 * This router serves as the unified analytics intelligence layer for:
 * - Executive Dashboard
 * - Risk Manager Dashboard  
 * - Claims Manager Dashboard
 * - Future AI Risk Intelligence modules
 * 
 * Architecture principles:
 * 1. Single source of truth - no duplicate analytics logic
 * 2. Role-based data filtering (executive, risk_manager, claims_manager, admin)
 * 3. Standardized response format (success, data, meta)
 * 4. Comprehensive error handling with structured errors
 * 5. Tenant isolation where applicable
 * 
 * @module routers/analytics-consolidated
 */

import { router, protectedProcedure, executiveOnlyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { 
  claims, users, aiAssessments, assessorEvaluations, 
  panelBeaterQuotes, panelBeaters, workflowAuditTrail,
  claimInvolvementTracking, roleAssignmentAudit 
} from "../../drizzle/schema";
import { eq, and, or, desc, sql, count, avg, sum, gte, lte, gt, lt } from "drizzle-orm";
import { 
  createAnalyticsResponse, 
  safeNumber, 
  analyticsSafeResponse,
  safeString,
  safeArray
} from "../utils/analytics-utils";

const db = getDb();

/**
 * Role-based analytics procedure
 * Validates user has appropriate insurerRole for analytics access
 */
const analyticsRoleProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ 
      code: "UNAUTHORIZED", 
      message: "Authentication required" 
    });
  }

  // Allow admin, executive, risk_manager, claims_manager
  const allowedRoles = ['admin', 'executive', 'risk_manager', 'claims_manager'];
  const userRole = ctx.user.insurerRole || ctx.user.role;
  
  if (!allowedRoles.includes(userRole)) {
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: `Analytics access requires one of: ${allowedRoles.join(', ')}` 
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Consolidated Analytics Router
 */
export const analyticsRouter = router({
  
  /**
   * Global Search
   * Search across all claims by vehicle registration, claim number, policy number, or claimant name
   * 
   * @access Executive, Admin
   */
  globalSearch: analyticsRoleProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          return createAnalyticsResponse(
            { results: [] },
            { error: { code: 'DB_UNAVAILABLE', message: 'Database not available' } }
          );
        }

        const searchTerm = `%${input.query}%`;
        const tenantId = ctx.user.tenantId;

        // Build where clause with tenant filtering if applicable
        const whereClause = tenantId 
          ? and(
              eq(claims.tenantId, tenantId),
              or(
                sql`${claims.vehicleRegistration} LIKE ${searchTerm}`,
                sql`${claims.claimNumber} LIKE ${searchTerm}`,
                sql`${claims.policyNumber} LIKE ${searchTerm}`,
                sql`${users.name} LIKE ${searchTerm}`
              )
            )
          : or(
              sql`${claims.vehicleRegistration} LIKE ${searchTerm}`,
              sql`${claims.claimNumber} LIKE ${searchTerm}`,
              sql`${claims.policyNumber} LIKE ${searchTerm}`,
              sql`${users.name} LIKE ${searchTerm}`
            );

        const results = await db
          .select({
            claim: claims,
            claimant: users,
          })
          .from(claims)
          .leftJoin(users, eq(claims.claimantId, users.id))
          .where(whereClause)
          .limit(50);

        const mappedResults = results.map(({ claim, claimant }) => ({
          ...claim,
          claimantName: safeString(claimant?.name, ''),
          claimantEmail: safeString(claimant?.email, ''),
        }));

        return createAnalyticsResponse(
          { results: mappedResults },
          { 
            tenantId,
            role: ctx.user.insurerRole || ctx.user.role,
            dataScope: 'global_search'
          }
        );
      } catch (error) {
        console.error('[Analytics] globalSearch error:', error);
        return createAnalyticsResponse(
          { results: [] },
          { error: { code: 'SEARCH_ERROR', message: error instanceof Error ? error.message : 'Search failed' } }
        );
      }
    }),

  /**
   * Get Executive KPIs
   * Returns comprehensive key performance indicators
   * 
   * @access Executive, Risk Manager, Claims Manager, Admin
   */
  getKPIs: analyticsRoleProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional()
    }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        // Total claims
        const [totalClaimsResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(claims)
          .where(tenantFilter);
        const totalClaims = safeNumber(totalClaimsResult?.count, 0);

        // Completed claims
        const [completedClaimsResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(claims)
          .where(tenantFilter ? and(tenantFilter, eq(claims.status, "completed")) : eq(claims.status, "completed"));
        const completedClaims = safeNumber(completedClaimsResult?.count, 0);

        // Total fraud detected (high risk)
        const fraudFilter = tenantFilter 
          ? and(tenantFilter, eq(aiAssessments.fraudRiskLevel, "high"))
          : eq(aiAssessments.fraudRiskLevel, "high");
        
        const [fraudDetectedResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(aiAssessments)
          .where(fraudFilter);
        const fraudDetected = safeNumber(fraudDetectedResult?.count, 0);

        // Average processing time
        const processingFilter = tenantFilter
          ? and(tenantFilter, eq(claims.status, "completed"), sql`${claims.closedAt} IS NOT NULL`)
          : and(eq(claims.status, "completed"), sql`${claims.closedAt} IS NOT NULL`);

        const [avgProcessingResult] = await db
          .select({
            avgDays: sql<number>`AVG(TIMESTAMPDIFF(DAY, ${claims.createdAt}, ${claims.closedAt}))`,
          })
          .from(claims)
          .where(processingFilter);
        const avgProcessingTime = safeNumber(avgProcessingResult?.avgDays, 0);

        // Total savings (AI estimated vs approved amount)
        const savingsFilter = tenantFilter
          ? and(
              tenantFilter,
              sql`${claims.approvedAmount} IS NOT NULL`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`
            )
          : and(
              sql`${claims.approvedAmount} IS NOT NULL`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`
            );

        const savingsData = await db
          .select({
            aiEstimate: aiAssessments.estimatedCost,
            approvedAmount: claims.approvedAmount,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(savingsFilter);

        const totalSavings = savingsData.reduce((sum, row) => {
          const aiEstimate = safeNumber(row.aiEstimate, 0);
          const approved = safeNumber(row.approvedAmount, 0);
          return sum + Math.max(0, aiEstimate - approved);
        }, 0);

        // High-value claims count (>$10k)
        const highValueFilter = tenantFilter
          ? and(tenantFilter, gt(aiAssessments.estimatedCost, 1000000))
          : gt(aiAssessments.estimatedCost, 1000000);

        const [highValueResult] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(aiAssessments)
          .where(highValueFilter);
        const highValueClaims = safeNumber(highValueResult?.count, 0);

        // Governance metrics (30-day window)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Executive overrides (last 30 days)
        const overridesFilter = tenantId
          ? sql`tenant_id = ${tenantId} AND executive_override = 1 AND created_at >= ${thirtyDaysAgo.toISOString()}`
          : sql`executive_override = 1 AND created_at >= ${thirtyDaysAgo.toISOString()}`;
        
        const [overridesResult] = await db.execute(sql`
          SELECT COUNT(*) as total_overrides
          FROM workflow_audit_trail
          WHERE ${overridesFilter}
        `);
        const totalExecutiveOverrides = safeNumber((overridesResult.rows[0] as any)?.total_overrides, 0);

        // Segregation violations (last 30 days)
        const violationsFilter = tenantId
          ? sql`c.tenant_id = ${tenantId} AND cit.created_at >= ${thirtyDaysAgo.toISOString()}`
          : sql`cit.created_at >= ${thirtyDaysAgo.toISOString()}`;
        
        const [violationsResult] = await db.execute(sql`
          SELECT COUNT(DISTINCT cit.user_id) as violation_attempts
          FROM claim_involvement_tracking cit
          INNER JOIN claims c ON cit.claim_id = c.id
          WHERE ${violationsFilter}
          GROUP BY cit.user_id, cit.claim_id
          HAVING COUNT(DISTINCT cit.stage) > 1
        `);
        const segregationViolationAttempts = violationsResult.rows.length;

        // Role changes (last 30 days)
        const roleChangesFilter = tenantId
          ? sql`tenant_id = ${tenantId} AND timestamp >= ${thirtyDaysAgo.toISOString()}`
          : sql`timestamp >= ${thirtyDaysAgo.toISOString()}`;
        
        const [roleChangesResult] = await db.execute(sql`
          SELECT COUNT(*) as role_changes
          FROM role_assignment_audit
          WHERE ${roleChangesFilter}
        `);
        const roleChangesLast30Days = safeNumber((roleChangesResult.rows[0] as any)?.role_changes, 0);

        // Calculate override rate percentage
        const overrideRatePercentage = totalClaims > 0 
          ? safeNumber(Math.round((totalExecutiveOverrides / totalClaims) * 100 * 10) / 10, 0)
          : 0;

        return createAnalyticsResponse({
          summaryMetrics: {
            totalClaims: safeNumber(totalClaims, 0),
            completedClaims: safeNumber(completedClaims, 0),
            activeClaims: safeNumber(totalClaims - completedClaims, 0),
            fraudDetected: safeNumber(fraudDetected, 0),
            avgProcessingTime: safeNumber(Math.round(avgProcessingTime * 10) / 10, 0),
            totalSavings: safeNumber(Math.round(totalSavings / 100), 0),
            highValueClaims: safeNumber(highValueClaims, 0),
            completionRate: totalClaims > 0 ? safeNumber(Math.round((completedClaims / totalClaims) * 100), 0) : 0,
            // Governance metrics (30-day window)
            totalExecutiveOverrides: safeNumber(totalExecutiveOverrides, 0),
            segregationViolationAttempts: safeNumber(segregationViolationAttempts, 0),
            roleChangesLast30Days: safeNumber(roleChangesLast30Days, 0),
            overrideRatePercentage: safeNumber(overrideRatePercentage, 0),
          },
          trends: {},
          riskIndicators: {
            fraudDetectionRate: totalClaims > 0 ? safeNumber((fraudDetected / totalClaims) * 100, 0) : 0,
            highValueClaimRate: totalClaims > 0 ? safeNumber((highValueClaims / totalClaims) * 100, 0) : 0,
          },
          fraudSignals: {
            highRiskCount: safeNumber(fraudDetected, 0),
          }
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getKPIs error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch KPIs'
        });
      }
    }),

  /**
   * Get Critical Alerts
   * Returns items requiring immediate executive attention
   * 
   * @access Executive, Risk Manager, Admin
   */
  getCriticalAlerts: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        // High-value claims pending approval
        const highValueFilter = tenantFilter
          ? and(
              tenantFilter,
              or(
                eq(claims.workflowState, "technical_approval"),
                eq(claims.workflowState, "financial_decision")
              ),
              gt(aiAssessments.estimatedCost, 1000000)
            )
          : and(
              or(
                eq(claims.workflowState, "technical_approval"),
                eq(claims.workflowState, "financial_decision")
              ),
              gt(aiAssessments.estimatedCost, 1000000)
            );

        const highValuePending = await db
          .select({
            claim: claims,
            aiAssessment: aiAssessments,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(highValueFilter)
          .limit(10);

        // High fraud risk claims
        const fraudFilter = tenantFilter
          ? and(
              tenantFilter,
              eq(aiAssessments.fraudRiskLevel, "high"),
              sql`${claims.status} NOT IN ('completed', 'rejected')`
            )
          : and(
              eq(aiAssessments.fraudRiskLevel, "high"),
              sql`${claims.status} NOT IN ('completed', 'rejected')`
            );

        const highFraudRisk = await db
          .select({
            claim: claims,
            aiAssessment: aiAssessments,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(fraudFilter)
          .limit(10);

        // Disputed claims
        const disputedFilter = tenantFilter
          ? and(tenantFilter, eq(claims.workflowState, "disputed"))
          : eq(claims.workflowState, "disputed");

        const disputedClaims = await db
          .select()
          .from(claims)
          .where(disputedFilter)
          .limit(10);

        // Claims stuck in workflow (>7 days in same state)
        const stuckFilter = tenantFilter
          ? and(
              tenantFilter,
              sql`${claims.status} NOT IN ('completed', 'rejected')`,
              sql`TIMESTAMPDIFF(DAY, ${claims.updatedAt}, NOW()) > 7`
            )
          : and(
              sql`${claims.status} NOT IN ('completed', 'rejected')`,
              sql`TIMESTAMPDIFF(DAY, ${claims.updatedAt}, NOW()) > 7`
            );

        const stuckClaims = await db
          .select()
          .from(claims)
          .where(stuckFilter)
          .limit(10);

        return createAnalyticsResponse({
          summaryMetrics: {
            totalAlerts: safeNumber(
              highValuePending.length + highFraudRisk.length + disputedClaims.length + stuckClaims.length,
              0
            ),
          },
          trends: {},
          riskIndicators: {
            highValuePending: safeArray(highValuePending.map(r => ({ 
              ...r.claim, 
              estimatedCost: safeNumber(r.aiAssessment?.estimatedCost, 0) 
            }))),
            highFraudRisk: safeArray(highFraudRisk.map(r => ({ 
              ...r.claim, 
              fraudRiskLevel: safeString(r.aiAssessment?.fraudRiskLevel, 'unknown') 
            }))),
            disputedClaims: safeArray(disputedClaims),
            stuckClaims: safeArray(stuckClaims),
          },
          fraudSignals: {
            highRiskCount: safeNumber(highFraudRisk.length, 0),
          }
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getCriticalAlerts error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch critical alerts'
        });
      }
    }),

  /**
   * Get Assessor Performance
   * Returns performance analytics for all assessors
   * 
   * @access Executive, Risk Manager, Admin
   */
  getAssessorPerformance: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(users.tenantId, tenantId) : undefined;

        const whereClause = tenantFilter 
          ? and(tenantFilter, eq(users.role, "assessor"))
          : eq(users.role, "assessor");

        const assessors = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            performanceScore: users.performanceScore,
            totalAssessments: users.totalAssessmentsCompleted,
            accuracyScore: users.accuracyScore,
            avgCompletionTime: users.avgCompletionTime,
            tier: users.assessorTier,
          })
          .from(users)
          .where(whereClause)
          .orderBy(desc(users.performanceScore));

        return createAnalyticsResponse({
          summaryMetrics: {
            totalAssessors: safeNumber(assessors.length, 0),
          },
          trends: {},
          riskIndicators: {},
          fraudSignals: {},
          assessors: safeArray(assessors.map(a => ({
            id: safeString(a.id, ''),
            name: safeString(a.name, ''),
            email: safeString(a.email, ''),
            performanceScore: safeNumber(a.performanceScore, 0),
            totalAssessments: safeNumber(a.totalAssessments, 0),
            accuracyScore: safeNumber(a.accuracyScore, 0),
            avgCompletionTime: safeNumber(a.avgCompletionTime, 0),
            tier: safeString(a.tier, 'standard'),
          })))
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getAssessorPerformance error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch assessor performance'
        });
      }
    }),

  /**
   * Get Panel Beater Analytics
   * Returns performance and cost analytics for panel beaters
   * 
   * @access Executive, Claims Manager, Admin
   */
  getPanelBeaterAnalytics: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        // Panel beaters might not have tenant filtering depending on business model

        const beaterStats = await db
          .select({
            id: panelBeaters.id,
            name: panelBeaters.businessName,
            totalQuotes: sql<number>`COUNT(${panelBeaterQuotes.id})`,
            avgQuoteAmount: sql<number>`AVG(${panelBeaterQuotes.quotedAmount})`,
            acceptedQuotes: sql<number>`SUM(CASE WHEN ${claims.assignedPanelBeaterId} = ${panelBeaters.id} THEN 1 ELSE 0 END)`,
          })
          .from(panelBeaters)
          .leftJoin(panelBeaterQuotes, eq(panelBeaters.id, panelBeaterQuotes.panelBeaterId))
          .leftJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
          .groupBy(sql`${panelBeaters.id}`, sql`${panelBeaters.businessName}`)
          .orderBy(desc(sql`COUNT(${panelBeaterQuotes.id})`));

        const mappedStats = beaterStats.map(stat => {
          const totalQuotes = safeNumber(stat.totalQuotes, 0);
          const acceptedQuotes = safeNumber(stat.acceptedQuotes, 0);
          
          return {
            id: safeString(stat.id, ''),
            name: safeString(stat.name, ''),
            totalQuotes,
            avgQuoteAmount: safeNumber(Math.round(safeNumber(stat.avgQuoteAmount, 0) / 100), 0),
            acceptedQuotes,
            acceptanceRate: totalQuotes > 0 ? safeNumber(Math.round((acceptedQuotes / totalQuotes) * 100), 0) : 0,
          };
        });

        return createAnalyticsResponse({
          summaryMetrics: {
            totalPanelBeaters: safeNumber(beaterStats.length, 0),
          },
          trends: {},
          riskIndicators: {},
          fraudSignals: {},
          panelBeaters: safeArray(mappedStats)
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: 'global',
        });
      } catch (error) {
        console.error('[Analytics] getPanelBeaterAnalytics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch panel beater analytics'
        });
      }
    }),

  /**
   * Get Cost Savings Trends
   * Returns monthly cost savings trends (last 6 months)
   * 
   * @access Executive, Claims Manager, Admin
   */
  getCostSavingsTrends: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        const whereClause = tenantFilter
          ? and(
              tenantFilter,
              sql`${claims.approvedAmount} IS NOT NULL`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`,
              sql`${claims.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`
            )
          : and(
              sql`${claims.approvedAmount} IS NOT NULL`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`,
              sql`${claims.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`
            );

        const trends = await db
          .select({
            month: sql<string>`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`,
            totalAiEstimate: sql<number>`SUM(${aiAssessments.estimatedCost})`,
            totalApproved: sql<number>`SUM(${claims.approvedAmount})`,
            claimCount: sql<number>`COUNT(${claims.id})`,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(whereClause)
          .groupBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`)
          .orderBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`);

        const mappedTrends = trends.map(trend => {
          const totalAiEstimate = safeNumber(trend.totalAiEstimate, 0);
          const totalApproved = safeNumber(trend.totalApproved, 0);
          const claimCount = safeNumber(trend.claimCount, 0);
          const savings = totalAiEstimate - totalApproved;

          return {
            month: safeString(trend.month, 'Unknown'),
            savings: safeNumber(Math.round(savings / 100), 0),
            claimCount,
            avgSavingsPerClaim: claimCount > 0 ? safeNumber(Math.round(savings / claimCount / 100), 0) : 0,
          };
        });

        return createAnalyticsResponse({
          summaryMetrics: {},
          trends: {
            monthlySavings: safeArray(mappedTrends),
          },
          riskIndicators: {},
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getCostSavingsTrends error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch cost savings trends'
        });
      }
    }),

  /**
   * Get Workflow Bottlenecks
   * Identifies workflow states where claims spend excessive time
   * 
   * @access Executive, Claims Manager, Admin
   */
  getWorkflowBottlenecks: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        
        // Build SQL with optional tenant filtering
        const bottlenecksQuery = tenantId
          ? sql`
            WITH latest_states AS (
              SELECT 
                w.claim_id,
                w.new_state,
                w.created_at as entered_at,
                TIMESTAMPDIFF(HOUR, w.created_at, NOW()) as hours_in_state
              FROM workflow_audit_trail w
              INNER JOIN claims c ON w.claim_id = c.id
              INNER JOIN (
                SELECT claim_id, MAX(created_at) as max_time
                FROM workflow_audit_trail
                GROUP BY claim_id
              ) latest ON w.claim_id = latest.claim_id AND w.created_at = latest.max_time
              WHERE w.new_state NOT IN ('closed', 'rejected')
                AND c.tenant_id = ${tenantId}
            )
            SELECT 
              new_state as state,
              COUNT(*) as count,
              AVG(hours_in_state) as avg_hours,
              MAX(hours_in_state) as max_hours
            FROM latest_states
            GROUP BY new_state
            ORDER BY AVG(hours_in_state) DESC
          `
          : sql`
            WITH latest_states AS (
              SELECT 
                w.claim_id,
                w.new_state,
                w.created_at as entered_at,
                TIMESTAMPDIFF(HOUR, w.created_at, NOW()) as hours_in_state
              FROM workflow_audit_trail w
              INNER JOIN (
                SELECT claim_id, MAX(created_at) as max_time
                FROM workflow_audit_trail
                GROUP BY claim_id
              ) latest ON w.claim_id = latest.claim_id AND w.created_at = latest.max_time
              WHERE w.new_state NOT IN ('closed', 'rejected')
            )
            SELECT 
              new_state as state,
              COUNT(*) as count,
              AVG(hours_in_state) as avg_hours,
              MAX(hours_in_state) as max_hours
            FROM latest_states
            GROUP BY new_state
            ORDER BY AVG(hours_in_state) DESC
          `;

        const bottlenecks = await db.execute(bottlenecksQuery);

        const mappedBottlenecks = (bottlenecks.rows as any[]).map(b => ({
          state: safeString(b.state, 'unknown'),
          count: safeNumber(b.count, 0),
          avgDaysInState: safeNumber(Math.round((safeNumber(b.avg_hours, 0) / 24) * 10) / 10, 0),
          maxDaysInState: safeNumber(Math.round((safeNumber(b.max_hours, 0) / 24) * 10) / 10, 0),
        }));

        return createAnalyticsResponse({
          summaryMetrics: {},
          trends: {},
          riskIndicators: {
            bottlenecks: safeArray(mappedBottlenecks),
          },
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getWorkflowBottlenecks error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch workflow bottlenecks'
        });
      }
    }),

  /**
   * Get Financial Overview
   * Returns comprehensive financial metrics
   * 
   * @access Executive, Admin
   */
  getFinancialOverview: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        // Total payouts
        const payoutsFilter = tenantFilter
          ? and(tenantFilter, sql`${claims.approvedAmount} IS NOT NULL`)
          : sql`${claims.approvedAmount} IS NOT NULL`;

        const [payoutsResult] = await db
          .select({
            total: sql<number>`SUM(${claims.approvedAmount})`,
          })
          .from(claims)
          .where(payoutsFilter);
        const totalPayouts = safeNumber(Math.round(safeNumber(payoutsResult?.total, 0) / 100), 0);

        // Total reserves (pending claims estimated cost)
        const reservesFilter = tenantFilter
          ? and(
              tenantFilter,
              sql`${claims.status} NOT IN ('completed', 'rejected')`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`
            )
          : and(
              sql`${claims.status} NOT IN ('completed', 'rejected')`,
              sql`${aiAssessments.estimatedCost} IS NOT NULL`
            );

        const [reservesResult] = await db
          .select({
            total: sql<number>`SUM(${aiAssessments.estimatedCost})`,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(reservesFilter);
        const totalReserves = safeNumber(Math.round(safeNumber(reservesResult?.total, 0) / 100), 0);

        // Fraud prevented (high fraud risk claims rejected)
        const fraudPreventedFilter = tenantFilter
          ? and(
              tenantFilter,
              eq(claims.status, "rejected"),
              eq(aiAssessments.fraudRiskLevel, "high")
            )
          : and(
              eq(claims.status, "rejected"),
              eq(aiAssessments.fraudRiskLevel, "high")
            );

        const [fraudPreventedResult] = await db
          .select({
            total: sql<number>`SUM(${aiAssessments.estimatedCost})`,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(fraudPreventedFilter);
        const fraudPrevented = safeNumber(Math.round(safeNumber(fraudPreventedResult?.total, 0) / 100), 0);

        return createAnalyticsResponse({
          summaryMetrics: {
            totalPayouts: safeNumber(totalPayouts, 0),
            totalReserves: safeNumber(totalReserves, 0),
            fraudPrevented: safeNumber(fraudPrevented, 0),
            netExposure: safeNumber(totalPayouts + totalReserves, 0),
          },
          trends: {},
          riskIndicators: {},
          fraudSignals: {
            preventedAmount: safeNumber(fraudPrevented, 0),
          }
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getFinancialOverview error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch financial overview'
        });
      }
    }),

  /**
   * Get Claims Volume Over Time
   * Returns daily claim counts for specified period
   * 
   * @access Executive, Risk Manager, Claims Manager, Admin
   */
  getClaimsVolumeOverTime: analyticsRoleProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        const whereClause = tenantId
          ? and(eq(claims.tenantId, tenantId), gt(claims.createdAt, startDate))
          : gt(claims.createdAt, startDate);

        const results = await db
          .select({
            date: sql<string>`DATE(${claims.createdAt})`,
            total: sql<number>`COUNT(*)`,
            fraudDetected: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) > 70 THEN 1 ELSE 0 END)`,
            avgFraudScore: sql<number>`AVG(COALESCE(${claims.fraudRiskScore}, 0))`,
          })
          .from(claims)
          .where(whereClause)
          .groupBy(sql`DATE(${claims.createdAt})`)
          .orderBy(sql`DATE(${claims.createdAt})`);

        const mappedResults = results.map(r => ({
          date: safeString(r.date, ''),
          total: safeNumber(r.total, 0),
          fraudDetected: safeNumber(r.fraudDetected, 0),
          avgFraudScore: safeNumber(r.avgFraudScore, 0),
        }));

        return createAnalyticsResponse({
          summaryMetrics: {},
          trends: {
            dailyVolume: safeArray(mappedResults),
          },
          riskIndicators: {},
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getClaimsVolumeOverTime error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch claims volume'
        });
      }
    }),

  /**
   * Get Fraud Detection Trends
   * Returns fraud detection metrics over time
   * 
   * @access Executive, Risk Manager, Admin
   */
  getFraudDetectionTrends: analyticsRoleProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        const whereClause = tenantId
          ? and(eq(claims.tenantId, tenantId), gt(claims.createdAt, startDate))
          : gt(claims.createdAt, startDate);

        const results = await db
          .select({
            date: sql<string>`DATE(${claims.createdAt})`,
            totalClaims: sql<number>`COUNT(*)`,
            lowRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) < 30 THEN 1 ELSE 0 END)`,
            mediumRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 30 AND COALESCE(${claims.fraudRiskScore}, 0) < 70 THEN 1 ELSE 0 END)`,
            highRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 70 THEN 1 ELSE 0 END)`,
            avgScore: sql<number>`AVG(COALESCE(${claims.fraudRiskScore}, 0))`,
          })
          .from(claims)
          .where(whereClause)
          .groupBy(sql`DATE(${claims.createdAt})`)
          .orderBy(sql`DATE(${claims.createdAt})`);

        const mappedResults = results.map(r => {
          const totalClaims = safeNumber(r.totalClaims, 0);
          const highRisk = safeNumber(r.highRisk, 0);

          return {
            date: safeString(r.date, ''),
            totalClaims,
            lowRisk: safeNumber(r.lowRisk, 0),
            mediumRisk: safeNumber(r.mediumRisk, 0),
            highRisk,
            avgScore: safeNumber(r.avgScore, 0),
            fraudRate: totalClaims > 0 ? safeNumber((highRisk / totalClaims) * 100, 0) : 0,
          };
        });

        return createAnalyticsResponse({
          summaryMetrics: {},
          trends: {
            dailyFraudDetection: safeArray(mappedResults),
          },
          riskIndicators: {},
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getFraudDetectionTrends error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch fraud detection trends'
        });
      }
    }),

  /**
   * Get Cost Breakdown By Status
   * Returns cost analysis grouped by claim status
   * 
   * @access Executive, Claims Manager, Admin
   */
  getCostBreakdownByStatus: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        const results = await db
          .select({
            status: sql<string>`${claims.status}`,
            count: sql<number>`COUNT(DISTINCT ${claims.id})`,
            totalEstimatedCost: sql<number>`SUM(COALESCE(${aiAssessments.estimatedCost}, 0))`,
            avgEstimatedCost: sql<number>`AVG(COALESCE(${aiAssessments.estimatedCost}, 0))`,
            totalApprovedAmount: sql<number>`SUM(COALESCE(${claims.approvedAmount}, 0))`,
          })
          .from(claims)
          .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
          .where(tenantFilter)
          .groupBy(sql`${claims.status}`);

        const mappedResults = results.map(r => ({
          status: safeString(r.status, 'unknown'),
          count: safeNumber(r.count, 0),
          totalEstimatedCost: safeNumber(r.totalEstimatedCost, 0),
          avgEstimatedCost: safeNumber(r.avgEstimatedCost, 0),
          totalApprovedAmount: safeNumber(r.totalApprovedAmount, 0),
        }));

        return createAnalyticsResponse({
          summaryMetrics: {},
          trends: {},
          riskIndicators: {
            costByStatus: safeArray(mappedResults),
          },
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getCostBreakdownByStatus error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch cost breakdown'
        });
      }
    }),

  /**
   * Get Average Processing Time By Workflow State
   * Uses audit trail for accurate state transition timing
   * 
   * @access Executive, Claims Manager, Admin
   */
  getAverageProcessingTime: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;

        // Build SQL with optional tenant filtering
        const stateTimingsQuery = tenantId
          ? sql`
            WITH state_durations AS (
              SELECT 
                w.claim_id,
                w.new_state,
                w.created_at as enter_time,
                LEAD(w.created_at) OVER (PARTITION BY w.claim_id ORDER BY w.created_at) as exit_time,
                TIMESTAMPDIFF(HOUR, w.created_at, 
                  LEAD(w.created_at) OVER (PARTITION BY w.claim_id ORDER BY w.created_at)
                ) as hours_in_state
              FROM workflow_audit_trail w
              INNER JOIN claims c ON w.claim_id = c.id
              WHERE w.new_state IS NOT NULL
                AND c.tenant_id = ${tenantId}
            )
            SELECT 
              new_state as state,
              AVG(hours_in_state) as avg_hours,
              COUNT(DISTINCT claim_id) as claim_count
            FROM state_durations
            WHERE hours_in_state IS NOT NULL
            GROUP BY new_state
          `
          : sql`
            WITH state_durations AS (
              SELECT 
                claim_id,
                new_state,
                created_at as enter_time,
                LEAD(created_at) OVER (PARTITION BY claim_id ORDER BY created_at) as exit_time,
                TIMESTAMPDIFF(HOUR, created_at, 
                  LEAD(created_at) OVER (PARTITION BY claim_id ORDER BY created_at)
                ) as hours_in_state
              FROM workflow_audit_trail
              WHERE new_state IS NOT NULL
            )
            SELECT 
              new_state as state,
              AVG(hours_in_state) as avg_hours,
              COUNT(DISTINCT claim_id) as claim_count
            FROM state_durations
            WHERE hours_in_state IS NOT NULL
            GROUP BY new_state
          `;

        const stateTimings = await db.execute(stateTimingsQuery);

        // Convert to object format with days (rounded to 1 decimal)
        const timingMap: Record<string, number> = {};
        for (const row of stateTimings.rows as any[]) {
          const avgDays = safeNumber(row.avg_hours, 0) / 24;
          timingMap[row.state] = safeNumber(Math.round(avgDays * 10) / 10, 0);
        }

        // Full lifecycle duration (created to closed)
        const lifecycleQuery = tenantId
          ? sql`
            SELECT 
              AVG(TIMESTAMPDIFF(HOUR, 
                (SELECT MIN(created_at) FROM workflow_audit_trail WHERE claim_id = w.claim_id),
                w.created_at
              )) as avg_hours
            FROM workflow_audit_trail w
            INNER JOIN claims c ON w.claim_id = c.id
            WHERE w.new_state = 'closed'
              AND c.tenant_id = ${tenantId}
          `
          : sql`
            SELECT 
              AVG(TIMESTAMPDIFF(HOUR, 
                (SELECT MIN(created_at) FROM workflow_audit_trail WHERE claim_id = w.claim_id),
                w.created_at
              )) as avg_hours
            FROM workflow_audit_trail w
            WHERE w.new_state = 'closed'
          `;

        const [lifecycleResult] = await db.execute(lifecycleQuery);
        const fullLifecycleDays = safeNumber((lifecycleResult as any)?.avg_hours, 0) / 24;

        return createAnalyticsResponse({
          summaryMetrics: {
            fullLifecycle: safeNumber(Math.round(fullLifecycleDays * 10) / 10, 0),
          },
          trends: {},
          riskIndicators: {
            stateTimings: {
              created: safeNumber(timingMap['created'], 0),
              intakeVerified: safeNumber(timingMap['intake_verified'], 0),
              assigned: safeNumber(timingMap['assigned'], 0),
              underAssessment: safeNumber(timingMap['under_assessment'], 0),
              internalReview: safeNumber(timingMap['internal_review'], 0),
              technicalApproval: safeNumber(timingMap['technical_approval'], 0),
              financialDecision: safeNumber(timingMap['financial_decision'], 0),
              paymentAuthorized: safeNumber(timingMap['payment_authorized'], 0),
              completed: safeNumber(fullLifecycleDays, 0),
              pendingTriage: safeNumber(timingMap['created'], 0),
              awaitingApproval: safeNumber(timingMap['technical_approval'], 0),
            },
          },
          fraudSignals: {}
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getAverageProcessingTime error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch processing time'
        });
      }
    }),

  /**
   * Get Fraud Risk Distribution
   * Returns distribution of claims by fraud risk level
   * 
   * @access Executive, Risk Manager, Admin
   */
  getFraudRiskDistribution: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? eq(claims.tenantId, tenantId) : undefined;

        const [results] = await db
          .select({
            lowRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) < 30 THEN 1 ELSE 0 END)`,
            mediumRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 30 AND COALESCE(${claims.fraudRiskScore}, 0) < 70 THEN 1 ELSE 0 END)`,
            highRisk: sql<number>`SUM(CASE WHEN COALESCE(${claims.fraudRiskScore}, 0) >= 70 THEN 1 ELSE 0 END)`,
            total: sql<number>`COUNT(*)`,
          })
          .from(claims)
          .where(tenantFilter);

        return createAnalyticsResponse({
          summaryMetrics: {
            total: safeNumber(results?.total, 0),
          },
          trends: {},
          riskIndicators: {},
          fraudSignals: {
            lowRisk: safeNumber(results?.lowRisk, 0),
            mediumRisk: safeNumber(results?.mediumRisk, 0),
            highRisk: safeNumber(results?.highRisk, 0),
          }
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId
        });
      } catch (error) {
        console.error('[Analytics] getFraudRiskDistribution error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch fraud risk distribution'
        });
      }
    }),

  /**
   * Governance Analytics Sub-Router
   * 
   * Provides governance-focused metrics including:
   * - Executive override tracking
   * - Segregation-of-duties compliance
   * - Role assignment impact analysis
   * 
   * All procedures enforce tenant isolation and role-based access.
   */
  governance: router({
    
    /**
     * Get Executive Override Metrics
     * Tracks frequency, patterns, and impact of executive overrides
     * 
     * @access Executive, Risk Manager, Claims Manager, Admin
     * @uses workflowAuditTrail.executiveOverride field
     * @indexes workflowAuditTrail(claim_id, created_at, tenant_id)
     */
    getOverrideMetrics: analyticsRoleProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        try {
          const { getExecutiveOverrideMetrics } = await import("../executive-analytics-governance");
          const tenantId = ctx.user.tenantId;
          
          if (!tenantId) {
            throw new TRPCError({ 
              code: "FORBIDDEN", 
              message: "Tenant context required for governance metrics" 
            });
          }

          const metrics = await getExecutiveOverrideMetrics(tenantId);
          
          return createAnalyticsResponse(
            { 
              summaryMetrics: {
                totalOverrides: metrics.monthlyTrend.reduce((sum, m) => sum + m.totalOverrides, 0),
                claimsAffected: metrics.monthlyTrend.reduce((sum, m) => sum + m.claimsAffected, 0),
                executivesInvolved: Math.max(...metrics.monthlyTrend.map(m => m.executivesInvolved), 0),
              },
              trends: metrics.monthlyTrend,
              riskIndicators: {
                overrideReasons: metrics.reasonsDistribution,
                mostOverriddenTransitions: metrics.mostOverriddenTransitions,
              }
            },
            {
              tenantId,
              role: ctx.user.insurerRole || ctx.user.role,
              dataScope: 'executive_overrides'
            }
          );
        } catch (error) {
          console.error('[Governance] getOverrideMetrics error:', error);
          return createAnalyticsResponse(
            { summaryMetrics: {}, trends: [], riskIndicators: {} },
            { error: { code: 'GOVERNANCE_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch override metrics' } }
          );
        }
      }),

    /**
     * Get Segregation of Duties Violation Attempts
     * Tracks attempts to violate segregation rules and compliance rate
     * 
     * @access Executive, Risk Manager, Admin
     * @uses claimInvolvementTracking to identify multi-stage involvement
     * @indexes claimInvolvementTracking(claim_id, user_id)
     */
    getSegregationViolations: analyticsRoleProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        try {
          const { getSegregationViolationAttempts } = await import("../executive-analytics-governance");
          const tenantId = ctx.user.tenantId;
          
          if (!tenantId) {
            throw new TRPCError({ 
              code: "FORBIDDEN", 
              message: "Tenant context required for governance metrics" 
            });
          }

          const violations = await getSegregationViolationAttempts(tenantId);
          
          return createAnalyticsResponse(
            { 
              summaryMetrics: {
                totalViolationAttempts: violations.violationAttempts.length,
                complianceRate: violations.complianceRate,
                usersWithViolations: violations.violationAttempts.length,
              },
              riskIndicators: {
                violationAttempts: violations.violationAttempts,
                criticalStageInvolvement: violations.criticalStageInvolvement,
              }
            },
            {
              tenantId,
              role: ctx.user.insurerRole || ctx.user.role,
              dataScope: 'segregation_violations'
            }
          );
        } catch (error) {
          console.error('[Governance] getSegregationViolations error:', error);
          return createAnalyticsResponse(
            { summaryMetrics: {}, riskIndicators: {} },
            { error: { code: 'GOVERNANCE_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch segregation violations' } }
          );
        }
      }),

    /**
     * Get Role Assignment Impact Analysis
     * Analyzes role change impact on processing times and productivity
     * 
     * @access Executive, Admin
     * @uses roleAssignmentAudit to track role changes over time
     * @indexes roleAssignmentAudit(tenant_id, user_id, timestamp)
     */
    getRoleAssignmentTrends: analyticsRoleProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        try {
          const { getRoleAssignmentImpact } = await import("../executive-analytics-governance");
          const tenantId = ctx.user.tenantId;
          
          if (!tenantId) {
            throw new TRPCError({ 
              code: "FORBIDDEN", 
              message: "Tenant context required for governance metrics" 
            });
          }

          const impact = await getRoleAssignmentImpact(tenantId);
          
          return createAnalyticsResponse(
            { 
              summaryMetrics: {
                totalRoleChanges: impact.roleChangeTrend.reduce((sum, m) => sum + m.changes, 0),
                avgProcessingTimeChange: impact.processingTimeImpact.reduce((sum, i) => sum + i.processingHours, 0) / Math.max(impact.processingTimeImpact.length, 1),
              },
              trends: impact.roleChangeTrend,
              riskIndicators: {
                processingTimeImpact: impact.processingTimeImpact,
                frequentSwitchers: impact.frequentRoleSwitchers,
              }
            },
            {
              tenantId,
              role: ctx.user.insurerRole || ctx.user.role,
              dataScope: 'role_assignment_impact'
            }
          );
        } catch (error) {
          console.error('[Governance] getRoleAssignmentTrends error:', error);
          return createAnalyticsResponse(
            { summaryMetrics: {}, trends: [], riskIndicators: {} },
            { error: { code: 'GOVERNANCE_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch role assignment trends' } }
          );
        }
      }),

    /**
     * Get Claim Involvement Conflicts
     * Identifies users with suspicious involvement patterns across multiple claims
     * 
     * @access Executive, Risk Manager, Admin
     * @uses claimInvolvementTracking to detect conflict patterns
     * @indexes claimInvolvementTracking(user_id, claim_id, stage)
     */
    getInvolvementConflicts: analyticsRoleProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        try {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          }

          const tenantId = ctx.user.tenantId;
          if (!tenantId) {
            throw new TRPCError({ 
              code: "FORBIDDEN", 
              message: "Tenant context required for governance metrics" 
            });
          }

          // Query for users with involvement in multiple critical stages across different claims
          // This indicates potential conflicts of interest or segregation violations
          const conflictQuery = sql`
            SELECT 
              cit.user_id,
              u.name as user_name,
              COUNT(DISTINCT cit.claim_id) as claims_involved,
              COUNT(DISTINCT cit.stage) as stages_involved,
              GROUP_CONCAT(DISTINCT cit.stage) as stages
            FROM claim_involvement_tracking cit
            INNER JOIN claims c ON cit.claim_id = c.id
            INNER JOIN users u ON cit.user_id = u.id
            WHERE c.tenant_id = ${tenantId}
              ${input.startDate ? sql`AND cit.created_at >= ${input.startDate}` : sql``}
              ${input.endDate ? sql`AND cit.created_at <= ${input.endDate}` : sql``}
            GROUP BY cit.user_id, u.name
            HAVING COUNT(DISTINCT cit.stage) > 1
            ORDER BY stages_involved DESC, claims_involved DESC
            LIMIT 50
          `;

          const results = await db.execute(conflictQuery);
          
          const conflicts = (results.rows as any[]).map(row => ({
            userId: row.user_id,
            userName: safeString(row.user_name, 'Unknown'),
            claimsInvolved: safeNumber(row.claims_involved, 0),
            stagesInvolved: safeNumber(row.stages_involved, 0),
            stages: safeString(row.stages, '').split(','),
          }));

          return createAnalyticsResponse(
            { 
              summaryMetrics: {
                usersWithConflicts: conflicts.length,
                avgStagesPerUser: conflicts.reduce((sum, c) => sum + c.stagesInvolved, 0) / Math.max(conflicts.length, 1),
              },
              riskIndicators: {
                conflicts: conflicts,
              }
            },
            {
              tenantId,
              role: ctx.user.insurerRole || ctx.user.role,
              dataScope: 'involvement_conflicts'
            }
          );
        } catch (error) {
          console.error('[Governance] getInvolvementConflicts error:', error);
          return createAnalyticsResponse(
            { summaryMetrics: {}, riskIndicators: {} },
            { error: { code: 'GOVERNANCE_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch involvement conflicts' } }
          );
        }
      }),

  }),

});
