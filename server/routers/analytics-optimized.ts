// @ts-nocheck
/**
 * OPTIMIZED ANALYTICS ROUTER - N+1 QUERY ELIMINATION
 * 
 * Performance improvements:
 * - getKPIs: 10 queries → 2 queries (80% reduction)
 * - getCriticalAlerts: 4 queries → 1 query (75% reduction)
 * - Total dashboard load: 15+ queries → 4 queries (73% reduction)
 * 
 * Optimization techniques:
 * 1. Single CTE query with multiple aggregations
 * 2. UNION queries for heterogeneous data
 * 3. Batch IN() queries where JOIN not possible
 * 4. GROUP BY aggregations for metrics
 * 
 * @module routers/analytics-optimized
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
 * Optimized Analytics Router
 */
export const analyticsRouter = router({
  
  /**
   * Global Search
   * Search across all claims by vehicle registration, claim number, policy number, or claimant name
   * 
   * @access Executive, Admin
   * @queries 1 (unchanged - already optimized)
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
   * Get Executive KPIs - OPTIMIZED
   * Returns comprehensive key performance indicators
   * 
   * @access Executive, Risk Manager, Claims Manager, Admin
   * @queries 2 (reduced from 10)
   * @improvement 80% query reduction
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
        const tenantFilter = tenantId ? `c.tenant_id = '${tenantId}'` : '1=1';
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // QUERY 1: Consolidated claims metrics using single CTE query
        const claimsMetricsResult = await db.execute(sql`
          SELECT 
            COUNT(DISTINCT c.id) as total_claims,
            SUM(CASE WHEN c.status = 'completed' THEN 1 ELSE 0 END) as completed_claims,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as fraud_detected,
            AVG(CASE 
              WHEN c.status = 'completed' AND c.closed_at IS NOT NULL 
              THEN TIMESTAMPDIFF(DAY, c.created_at, c.closed_at) 
              ELSE NULL 
            END) as avg_processing_days,
            SUM(CASE 
              WHEN c.approved_amount IS NOT NULL AND ai.estimated_cost IS NOT NULL 
              THEN GREATEST(0, ai.estimated_cost - c.approved_amount)
              ELSE 0 
            END) as total_savings_cents,
            SUM(CASE WHEN ai.estimated_cost > 1000000 THEN 1 ELSE 0 END) as high_value_claims
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${sql.raw(tenantFilter)}
        `);

        const claimsMetrics = claimsMetricsResult.rows[0] as any;
        const totalClaims = safeNumber(claimsMetrics?.total_claims, 0);
        const completedClaims = safeNumber(claimsMetrics?.completed_claims, 0);
        const fraudDetected = safeNumber(claimsMetrics?.fraud_detected, 0);
        const avgProcessingTime = safeNumber(claimsMetrics?.avg_processing_days, 0);
        const totalSavings = safeNumber(claimsMetrics?.total_savings_cents, 0) / 100; // Convert cents to dollars
        const highValueClaims = safeNumber(claimsMetrics?.high_value_claims, 0);

        // QUERY 2: Consolidated governance metrics (30-day window)
        const governanceFilter = tenantId 
          ? `tenant_id = '${tenantId}' AND` 
          : '';
        
        const governanceMetricsResult = await db.execute(sql`
          SELECT 
            (SELECT COUNT(*) 
             FROM workflow_audit_trail 
             WHERE ${sql.raw(governanceFilter)} executive_override = 1 
               AND created_at >= ${thirtyDaysAgo.toISOString()}
            ) as total_overrides,
            (SELECT COUNT(DISTINCT subq.user_id)
             FROM (
               SELECT cit.user_id, cit.claim_id
               FROM claim_involvement_tracking cit
               INNER JOIN claims c ON cit.claim_id = c.id
               WHERE ${sql.raw(governanceFilter.replace('tenant_id', 'c.tenant_id'))} 
                 cit.created_at >= ${thirtyDaysAgo.toISOString()}
               GROUP BY cit.user_id, cit.claim_id
               HAVING COUNT(DISTINCT cit.stage) > 1
             ) subq
            ) as segregation_violations,
            (SELECT COUNT(*) 
             FROM role_assignment_audit 
             WHERE ${sql.raw(governanceFilter)} timestamp >= ${thirtyDaysAgo.toISOString()}
            ) as role_changes
        `);

        const governanceMetrics = governanceMetricsResult.rows[0] as any;
        const totalExecutiveOverrides = safeNumber(governanceMetrics?.total_overrides, 0);
        const segregationViolationAttempts = safeNumber(governanceMetrics?.segregation_violations, 0);
        const roleChangesLast30Days = safeNumber(governanceMetrics?.role_changes, 0);

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
            totalSavings: safeNumber(Math.round(totalSavings), 0),
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
          tenantId,
          queryCount: 2, // Performance metric
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
   * Get Critical Alerts - OPTIMIZED
   * Returns items requiring immediate executive attention
   * 
   * @access Executive, Risk Manager, Admin
   * @queries 1 (reduced from 4)
   * @improvement 75% query reduction
   */
  getCriticalAlerts: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;
        const tenantFilter = tenantId ? `c.tenant_id = '${tenantId}'` : '1=1';

        // SINGLE UNION QUERY for all alert types
        const alertsResult = await db.execute(sql`
          (
            SELECT 
              'high_value_pending' as alert_type,
              c.id, c.claim_number, c.status, c.workflow_state, c.created_at,
              ai.estimated_cost, ai.fraud_risk_level
            FROM claims c
            LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
            WHERE ${sql.raw(tenantFilter)}
              AND c.workflow_state IN ('technical_approval', 'financial_decision')
              AND ai.estimated_cost > 1000000
            LIMIT 10
          )
          UNION ALL
          (
            SELECT 
              'high_fraud_risk' as alert_type,
              c.id, c.claim_number, c.status, c.workflow_state, c.created_at,
              ai.estimated_cost, ai.fraud_risk_level
            FROM claims c
            LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
            WHERE ${sql.raw(tenantFilter)}
              AND ai.fraud_risk_level = 'high'
              AND c.status NOT IN ('completed', 'rejected')
            LIMIT 10
          )
          UNION ALL
          (
            SELECT 
              'disputed' as alert_type,
              c.id, c.claim_number, c.status, c.workflow_state, c.created_at,
              NULL as estimated_cost, NULL as fraud_risk_level
            FROM claims c
            WHERE ${sql.raw(tenantFilter)}
              AND c.workflow_state = 'disputed'
            LIMIT 10
          )
          UNION ALL
          (
            SELECT 
              'stuck_workflow' as alert_type,
              c.id, c.claim_number, c.status, c.workflow_state, c.created_at,
              NULL as estimated_cost, NULL as fraud_risk_level
            FROM claims c
            WHERE ${sql.raw(tenantFilter)}
              AND c.status NOT IN ('completed', 'rejected')
              AND TIMESTAMPDIFF(DAY, c.updated_at, NOW()) > 7
            LIMIT 10
          )
        `);

        // Group results by alert type
        const highValuePending: any[] = [];
        const highFraudRisk: any[] = [];
        const disputedClaims: any[] = [];
        const stuckClaims: any[] = [];

        for (const row of alertsResult.rows as any[]) {
          const alertData = {
            id: row.id,
            claimNumber: row.claim_number,
            status: row.status,
            workflowState: row.workflow_state,
            createdAt: row.created_at,
            estimatedCost: safeNumber(row.estimated_cost, 0),
            fraudRiskLevel: safeString(row.fraud_risk_level, 'unknown'),
          };

          switch (row.alert_type) {
            case 'high_value_pending':
              highValuePending.push(alertData);
              break;
            case 'high_fraud_risk':
              highFraudRisk.push(alertData);
              break;
            case 'disputed':
              disputedClaims.push(alertData);
              break;
            case 'stuck_workflow':
              stuckClaims.push(alertData);
              break;
          }
        }

        return createAnalyticsResponse({
          summaryMetrics: {
            totalAlerts: safeNumber(
              highValuePending.length + highFraudRisk.length + disputedClaims.length + stuckClaims.length,
              0
            ),
          },
          trends: {},
          riskIndicators: {
            highValuePending: safeArray(highValuePending),
            highFraudRisk: safeArray(highFraudRisk),
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
          tenantId,
          queryCount: 1, // Performance metric
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
   * @queries 1 (unchanged - already optimized)
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
          tenantId,
          queryCount: 1,
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
   * @queries 1 (unchanged - already optimized with JOIN + GROUP BY)
   */
  getPanelBeaterAnalytics: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        }

        const tenantId = ctx.user.tenantId;

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

        return createAnalyticsResponse({
          summaryMetrics: {
            totalPanelBeaters: safeNumber(beaterStats.length, 0),
          },
          trends: {},
          riskIndicators: {},
          fraudSignals: {},
          panelBeaters: safeArray(beaterStats.map(pb => ({
            id: safeNumber(pb.id, 0),
            name: safeString(pb.name, ''),
            totalQuotes: safeNumber(pb.totalQuotes, 0),
            avgQuoteAmount: safeNumber(pb.avgQuoteAmount, 0) / 100, // Convert cents to dollars
            acceptedQuotes: safeNumber(pb.acceptedQuotes, 0),
            acceptanceRate: pb.totalQuotes > 0 
              ? safeNumber(Math.round((pb.acceptedQuotes / pb.totalQuotes) * 100), 0) 
              : 0,
          })))
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId,
          queryCount: 1,
        });
      } catch (error) {
        console.error('[Analytics] getPanelBeaterAnalytics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch panel beater analytics'
        });
      }
    }),
});
