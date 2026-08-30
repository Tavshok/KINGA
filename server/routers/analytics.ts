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

import { router, protectedProcedure, executiveOnlyProcedure, requireTenantScope } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { ANALYTICS_ALLOWED_ROLES, isAdminRole } from "../../shared/role-permissions";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { 
  claims, users, aiAssessments, assessorEvaluations, 
  panelBeaterQuotes, panelBeaters, workflowAuditTrail,
  claimInvolvementTracking, roleAssignmentAudit,
  recoveryCases, tenants,
  assessors,} from "../../drizzle/schema";
import { eq, and, or, desc, sql, count, avg, sum, gte, lte, gt, lt } from "drizzle-orm";
import { 
  createAnalyticsResponse, 
  safeNumber, 
  analyticsSafeResponse,
  safeString,
  safeArray
} from "../utils/analytics-utils";

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

  // Allow platform admin + all roles listed in ANALYTICS_ALLOWED_ROLES (shared/role-permissions.ts)
  const isAdmin = isAdminRole(ctx.user.role);
  const hasInsurerRole = ctx.user.insurerRole != null && ANALYTICS_ALLOWED_ROLES.includes(ctx.user.insurerRole as any);

  if (!isAdmin && !hasInsurerRole) {
    const msg = ctx.user.insurerRole == null
      ? "Your account role has not been configured yet. Please contact your administrator."
      : `Analytics access requires one of: ${ANALYTICS_ALLOWED_ROLES.join(', ')}`;
    throw new TRPCError({ code: "FORBIDDEN", message: msg });
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

// Analytics evidence is always tenant-bound. Platform testing must use an
// explicitly selected tenant session rather than an implicit global fallback.
function resolveAnalyticsTenant(ctx: { user: { id?: number; tenantId?: string | null; role: string }; req?: any }): string {
  return requireTenantScope(ctx as any, undefined, 'analytics');
}

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

        const searchTerm = `%${input.query}%`;  // Substring search — supports mid-string matches (e.g. last digits of VIN/plate)
        // NOTE (M-05): TiDB FULLTEXT not supported; substring LIKE cannot use B-tree index at scale.
        // Carried forward: KINGA-SEARCH-01.
        const tenantId = resolveAnalyticsTenant(ctx);

        // Build where clause with tenant filtering if applicable
        const whereClause = tenantId 
          ? and(
              eq(claims.tenantId, tenantId),
              or(
                sql`${claims.vehicleRegistration} LIKE ${searchTerm}` /* M-05 */,
                sql`${claims.claimNumber} LIKE ${searchTerm}` /* M-05 */,
                sql`${claims.policyNumber} LIKE ${searchTerm}` /* M-05 */,
                sql`${users.name} LIKE ${searchTerm}`
              )
            )
          : or(
              sql`${claims.vehicleRegistration} LIKE ${searchTerm}` /* M-05 */,
              sql`${claims.claimNumber} LIKE ${searchTerm}` /* M-05 */,
              sql`${claims.policyNumber} LIKE ${searchTerm}` /* M-05 */,
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
            tenantId: tenantId ?? undefined,
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

        const tenantId = resolveAnalyticsTenant(ctx);
        const tenantFilter = sql`c.tenant_id = ${tenantId}`;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // QUERY 1: Consolidated claims metrics using single CTE query (with physics anomaly metrics)
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
              WHEN c.final_approved_amount IS NOT NULL AND ai.estimated_cost IS NOT NULL 
              THEN GREATEST(0, ai.estimated_cost - c.final_approved_amount)
            ELSE 0 END) as total_savings_cents,
            AVG(ai.physics_deviation_score) as avg_deviation_score,
            SUM(CASE WHEN ai.physics_deviation_score > 70 THEN 1 ELSE 0 END) as high_risk_physics_claims,
            SUM(CASE WHEN ai.physics_deviation_score IS NOT NULL THEN 1 ELSE 0 END) as total_physics_assessments,
            SUM(CASE WHEN ai.estimated_cost > 1000000 THEN 1 ELSE 0 END) as high_value_claims
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${tenantFilter}
        `);

        const _claimsRows = (claimsMetricsResult as any)[0];
        const claimsMetrics = (Array.isArray(_claimsRows) ? _claimsRows[0] : _claimsRows) as any;
        const totalClaims = safeNumber(claimsMetrics?.total_claims, 0);
        const completedClaims = safeNumber(claimsMetrics?.completed_claims, 0);
        const fraudDetected = safeNumber(claimsMetrics?.fraud_detected, 0);
        const avgProcessingTime = safeNumber(claimsMetrics?.avg_processing_days, 0);
        const totalSavings = safeNumber(claimsMetrics?.total_savings_cents, 0) / 100; // Convert cents to dollars
        const highValueClaims = safeNumber(claimsMetrics?.high_value_claims, 0);
        
        // Physics anomaly metrics
        const avgDeviationScore = safeNumber(claimsMetrics?.avg_deviation_score, 0);
        const highRiskPhysicsClaims = safeNumber(claimsMetrics?.high_risk_physics_claims, 0);
        const totalPhysicsAssessments = safeNumber(claimsMetrics?.total_physics_assessments, 0);
        const physicsAnomalyRate = totalPhysicsAssessments > 0 
          ? safeNumber(Math.round((highRiskPhysicsClaims / totalPhysicsAssessments) * 100 * 10) / 10, 0)
          : 0;

        // QUERY 2: Consolidated governance metrics (30-day window)
        // Note: workflow_audit_trail has no tenant_id column — tenant scope via claims subquery.
        // role_assignment_audit has tenant_id directly.
        // claim_involvement_tracking scopes via claims.tenant_id join.
        const watTenantFilter = sql`claim_id IN (SELECT id FROM claims WHERE tenant_id = ${tenantId})`;
        const directTenantFilter = sql`tenant_id = ${tenantId}`;
        const citTenantFilter = sql`c.tenant_id = ${tenantId}`;
        
        const governanceMetricsResult = await db.execute(sql`
          SELECT 
            (SELECT COUNT(*) 
             FROM workflow_audit_trail 
             WHERE ${watTenantFilter} AND executive_override = 1 
               AND created_at >= ${thirtyDaysAgo.toISOString()}
            ) as total_overrides,
            (SELECT COUNT(DISTINCT subq.user_id)
             FROM (
               SELECT cit.user_id, cit.claim_id
               FROM claim_involvement_tracking cit
               INNER JOIN claims c ON cit.claim_id = c.id
               WHERE ${citTenantFilter} AND
                 cit.created_at >= ${thirtyDaysAgo.toISOString()}
             GROUP BY cit.user_id, cit.claim_id
             HAVING COUNT(DISTINCT cit.workflow_stage) > 1
             ) subq
            ) as segregation_violations,
            (SELECT COUNT(*) 
             FROM role_assignment_audit 
             WHERE ${directTenantFilter} AND timestamp >= ${thirtyDaysAgo.toISOString()}
            ) as role_changes
        `);

        const _govRows = (governanceMetricsResult as any)[0];
        const governanceMetrics = (Array.isArray(_govRows) ? _govRows[0] : _govRows) as any;
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
          },
          physicsAnomalyMetrics: {
            avgDeviationScore: avgDeviationScore !== null ? safeNumber(Math.round(avgDeviationScore * 10) / 10, 0) : null,
            highRiskPhysicsClaims: safeNumber(highRiskPhysicsClaims, 0),
            physicsAnomalyRate: safeNumber(physicsAnomalyRate, 0),
            totalPhysicsAssessments: safeNumber(totalPhysicsAssessments, 0),
          }
        }, {
          generatedAt: new Date(),
          role: ctx.user.insurerRole || ctx.user.role,
          dataScope: tenantId ? 'tenant' : 'global',
          tenantId: tenantId ?? undefined,
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

        const tenantId = resolveAnalyticsTenant(ctx);
        const tenantFilter = `c.tenant_id = '${tenantId.replace(/'/g, "''")}'`;

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

        const _alertRows = (alertsResult as any)[0];
        const _alertsArr = Array.isArray(_alertRows) ? _alertRows : [];
        for (const row of _alertsArr as any[]) {
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
          tenantId: tenantId ?? undefined,
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

        const tenantId = resolveAnalyticsTenant(ctx);
        const whereClause = and(eq(users.tenantId, tenantId), eq(users.role, "assessor"));

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
          .orderBy(desc(users.performanceScore))
          .limit(100); // M-01: cap assessor list

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
          tenantId: tenantId ?? undefined,
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

        const tenantId = resolveAnalyticsTenant(ctx);
        const panelBeaterTenantFilter = eq(panelBeaters.tenantId, tenantId);

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
          .where(panelBeaterTenantFilter)
          .groupBy(sql`${panelBeaters.id}`, sql`${panelBeaters.businessName}`)
          .orderBy(desc(sql`COUNT(${panelBeaterQuotes.id})`))
          .limit(50); // M-01: cap panel beater list

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
          tenantId: tenantId ?? undefined,
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

  exportFastTrackPDF: analyticsRoleProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async () => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Fast Track export is unavailable until a verified tenant-scoped reporting dataset is implemented.' });
    }),

  exportFastTrackCSV: analyticsRoleProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async () => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Fast Track export is unavailable until a verified tenant-scoped reporting dataset is implemented.' });
    }),

  /** Cost savings trends — monthly AI estimate vs approved amount over 6 months */
  getCostSavingsTrends: analyticsRoleProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const tenantId = resolveAnalyticsTenant(ctx);
      const whereClause = and(eq(claims.tenantId, tenantId), sql`${claims.approvedAmount} IS NOT NULL`, sql`${aiAssessments.estimatedCost} IS NOT NULL`, sql`${claims.createdAt} >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`);
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
        .orderBy(sql`DATE_FORMAT(${claims.createdAt}, '%Y-%m')`)
        .limit(24); // M-01: cap trend months to 24
      const mappedTrends = trends.map(t => {
        const est = safeNumber(t.totalAiEstimate, 0);
        const appr = safeNumber(t.totalApproved, 0);
        const cnt = safeNumber(t.claimCount, 0);
        const savings = est - appr;
        return { month: safeString(t.month, 'Unknown'), savings: Math.round(savings / 100), claimCount: cnt, avgSavingsPerClaim: cnt > 0 ? Math.round(savings / cnt / 100) : 0 };
      });
      return createAnalyticsResponse(
        { summaryMetrics: {}, trends: { monthlySavings: safeArray(mappedTrends) }, riskIndicators: {}, fraudSignals: {} },
        { generatedAt: new Date(), role: ctx.user.insurerRole || ctx.user.role, dataScope: tenantId ? 'tenant' : 'global', tenantId: tenantId ?? undefined }
      );
    } catch (error) {
      console.error('[Analytics] getCostSavingsTrends error:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch cost savings trends' });
    }
  }),

  /** Workflow bottlenecks — workflow states where claims spend the most time */
  getWorkflowBottlenecks: analyticsRoleProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const tenantId = resolveAnalyticsTenant(ctx);
      const bottlenecksQuery = sql`WITH latest_states AS (SELECT w.claim_id, w.new_state, TIMESTAMPDIFF(HOUR, w.created_at, NOW()) as hours_in_state FROM workflow_audit_trail w INNER JOIN claims c ON w.claim_id = c.id INNER JOIN (SELECT claim_id, MAX(created_at) as max_time FROM workflow_audit_trail GROUP BY claim_id) latest ON w.claim_id = latest.claim_id AND w.created_at = latest.max_time WHERE w.new_state NOT IN ('closed','rejected') AND c.tenant_id = ${tenantId}) SELECT new_state as state, COUNT(*) as count, AVG(hours_in_state) as avg_hours, MAX(hours_in_state) as max_hours FROM latest_states GROUP BY new_state ORDER BY AVG(hours_in_state) DESC`;
      const bottlenecks = await db.execute(bottlenecksQuery);
      const mapped = (((bottlenecks as any)[0] ?? []) as any[]).map(b => ({
        state: safeString(b.state, 'unknown'),
        count: safeNumber(b.count, 0),
        avgDaysInState: safeNumber(Math.round(safeNumber(b.avg_hours, 0) / 24 * 10) / 10, 0),
        maxDaysInState: safeNumber(Math.round(safeNumber(b.max_hours, 0) / 24 * 10) / 10, 0),
      }));
      return createAnalyticsResponse(
        { summaryMetrics: {}, trends: {}, riskIndicators: { bottlenecks: safeArray(mapped) }, fraudSignals: {} },
        { generatedAt: new Date(), role: ctx.user.insurerRole || ctx.user.role, dataScope: tenantId ? 'tenant' : 'global', tenantId: tenantId ?? undefined }
      );
    } catch (error) {
      console.error('[Analytics] getWorkflowBottlenecks error:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch workflow bottlenecks' });
    }
  }),

  /** Financial overview — total payouts, reserves, fraud prevented */
  getFinancialOverview: analyticsRoleProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const tenantId = resolveAnalyticsTenant(ctx);
      const tenantFilter = eq(claims.tenantId, tenantId);
      const payoutsFilter = and(tenantFilter, sql`${claims.approvedAmount} IS NOT NULL`);
      const [payoutsResult] = await db.select({ total: sql<number>`SUM(${claims.approvedAmount})` }).from(claims).where(payoutsFilter);
      const totalPayouts = Math.round(safeNumber(payoutsResult?.total, 0) / 100);
      const reservesFilter = and(tenantFilter, sql`${claims.status} NOT IN ('completed','rejected')`, sql`${aiAssessments.estimatedCost} IS NOT NULL`);
      const [reservesResult] = await db
        .select({ total: sql<number>`SUM(${aiAssessments.estimatedCost})` })
        .from(claims)
        .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
        .where(reservesFilter);
      const totalReserves = Math.round(safeNumber(reservesResult?.total, 0) / 100);
      const fraudFilter = and(tenantFilter, eq(claims.status, 'rejected'), eq(aiAssessments.fraudRiskLevel, 'high'));
      const [fraudResult] = await db
        .select({ total: sql<number>`SUM(${aiAssessments.estimatedCost})` })
        .from(claims)
        .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
        .where(fraudFilter);
      const fraudPrevented = Math.round(safeNumber(fraudResult?.total, 0) / 100);
      // Net Exposure = outstanding reserves minus what has already been recovered (not payouts + reserves)
      const recoveryFilter = and(tenantFilter, sql`${recoveryCases.recoveredAmount} IS NOT NULL`);
      const [recoveryResult] = await db
        .select({ total: sql<number>`SUM(${recoveryCases.recoveredAmount})` })
        .from(recoveryCases)
        .where(recoveryFilter);
      const totalRecovered = Math.round(safeNumber(recoveryResult?.total, 0) / 100);
      const netExposure = Math.max(0, totalReserves - totalRecovered);
      // Leakage = sum of (approved - estimated) where approved > estimated
      const leakageFilter = and(tenantFilter, sql`${claims.approvedAmount} IS NOT NULL`, sql`${aiAssessments.estimatedCost} IS NOT NULL`, sql`${claims.approvedAmount} > ${aiAssessments.estimatedCost}`);
      const [leakageResult] = await db
        .select({ total: sql<number>`SUM(${claims.approvedAmount} - ${aiAssessments.estimatedCost})` })
        .from(claims)
        .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
        .where(leakageFilter);
      const leakage = Math.round(safeNumber(leakageResult?.total, 0) / 100);
      return createAnalyticsResponse(
        { summaryMetrics: { totalPayouts, totalReserves, fraudPrevented, netExposure, totalRecovered, leakage }, trends: {}, riskIndicators: {}, fraudSignals: { preventedAmount: fraudPrevented } },
        { generatedAt: new Date(), role: ctx.user.insurerRole || ctx.user.role, dataScope: tenantId ? 'tenant' : 'global', tenantId: tenantId ?? undefined }
      );
    } catch (error) {
      console.error('[Analytics] getFinancialOverview error:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch financial overview' });
    }
  }),

  // ─── Risk Manager Analytics (Top-Tier Gated) ─────────────────────────────────
  getRiskManagerKPIs: analyticsRoleProcedure
    .input(z.object({ months: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(6) }))
    .query(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

        // Role gate
        if (ctx.user.insurerRole !== 'risk_manager' && !isAdminRole(ctx.user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Risk Manager role required' });
        }

        const tenantId = resolveAnalyticsTenant(ctx);

        // Tier gate — query tenants table
        const tenantRows = await db.select({ tier: tenants.tier }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const tier = tenantRows[0]?.tier;
        if (tier !== 'tier-enterprise') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'TIER_UPGRADE_REQUIRED' });
        }

        const tenantFilter = sql`tenant_id = ${tenantId}`;
        const tenantFilterRC = sql`rc.tenant_id = ${tenantId}`;
        const months = input.months;

        // KPI 1: Claims frequency by incident type
        const freqResult = await db.execute(sql`
          SELECT incident_type,
            DATE_FORMAT(created_at, '%Y-%m') as month,
            COUNT(*) as claim_count
          FROM claims
          WHERE ${tenantFilter}
            AND created_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
            AND incident_type IS NOT NULL
          GROUP BY incident_type, month
          ORDER BY month ASC, claim_count DESC
        `);
        const freqRows = Array.isArray((freqResult as any)[0]) ? (freqResult as any)[0] : [];

        // KPI 2: Avg repair cost by vehicle age bucket
        const repairCostResult = await db.execute(sql`
          SELECT
            CASE
              WHEN (YEAR(NOW()) - vehicle_year) < 3 THEN 'Under 3 years'
              WHEN (YEAR(NOW()) - vehicle_year) BETWEEN 3 AND 7 THEN '3-7 years'
              ELSE 'Over 7 years'
            END as age_bucket,
            AVG(COALESCE(final_approved_amount, approved_amount)) as avg_cost,
            COUNT(*) as claim_count
          FROM claims
          WHERE ${tenantFilter}
            AND vehicle_year IS NOT NULL
            AND COALESCE(final_approved_amount, approved_amount) IS NOT NULL
            AND created_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
          GROUP BY age_bucket
        `);
        const repairCostRows = Array.isArray((repairCostResult as any)[0]) ? (repairCostResult as any)[0] : [];

        // KPI 3: Fraud flag rate by incident type
        const fraudRateResult = await db.execute(sql`
          SELECT incident_type, fraud_risk_level, COUNT(*) as cnt
          FROM claims
          WHERE ${tenantFilter}
            AND incident_type IS NOT NULL
            AND fraud_risk_level IS NOT NULL
            AND created_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
          GROUP BY incident_type, fraud_risk_level
          ORDER BY incident_type, fraud_risk_level
        `);
        const fraudRateRows = Array.isArray((fraudRateResult as any)[0]) ? (fraudRateResult as any)[0] : [];

        // KPI 4: TP recovery exposure by month
        const recoveryExposureResult = await db.execute(sql`
          SELECT
            DATE_FORMAT(rc.created_at, '%Y-%m') as month,
            SUM(rc.quantum_claimed) as total_quantum,
            SUM(rc.recovered_amount) as total_recovered,
            COUNT(*) as case_count
          FROM recovery_cases rc
          WHERE ${tenantFilterRC}
            AND rc.created_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
          GROUP BY month
          ORDER BY month ASC
        `);
        const recoveryExposureRows = Array.isArray((recoveryExposureResult as any)[0]) ? (recoveryExposureResult as any)[0] : [];

        // KPI 5: Repeat offender rate (within selected window)
        const repeatOffenderResult = await db.execute(sql`
          SELECT
            SUM(CASE WHEN is_repeat_offender = 1 THEN 1 ELSE 0 END) as repeat_count,
            COUNT(*) as total_count
          FROM recovery_cases rc
          WHERE ${tenantFilterRC}
            AND rc.created_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
        `);
        const repeatRows = Array.isArray((repeatOffenderResult as any)[0]) ? (repeatOffenderResult as any)[0] : [];
        const repeatData = repeatRows[0] || {};

        // KPI 6: Settlement cycle time by month
        const cycleTimeResult = await db.execute(sql`
          SELECT
            DATE_FORMAT(closed_at, '%Y-%m') as month,
            AVG(TIMESTAMPDIFF(DAY, created_at, closed_at)) as avg_days,
            COUNT(*) as closed_count
          FROM claims
          WHERE ${tenantFilter}
            AND closed_at IS NOT NULL
            AND closed_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(months))} MONTH)
          GROUP BY month
          ORDER BY month ASC
        `);
        const cycleTimeRows = Array.isArray((cycleTimeResult as any)[0]) ? (cycleTimeResult as any)[0] : [];

        return {
          claimsFrequency: freqRows.map((r: any) => ({
            incidentType: r.incident_type,
            month: r.month,
            claimCount: safeNumber(r.claim_count, 0),
          })),
          repairCostByAge: repairCostRows.map((r: any) => ({
            ageBucket: r.age_bucket,
            avgCost: safeNumber(r.avg_cost, 0),
            claimCount: safeNumber(r.claim_count, 0),
          })),
          fraudRateByType: fraudRateRows.map((r: any) => ({
            incidentType: r.incident_type,
            fraudRiskLevel: r.fraud_risk_level,
            count: safeNumber(r.cnt, 0),
          })),
          recoveryExposure: recoveryExposureRows.map((r: any) => ({
            month: r.month,
            totalQuantum: safeNumber(r.total_quantum, 0),
            totalRecovered: safeNumber(r.total_recovered, 0),
            caseCount: safeNumber(r.case_count, 0),
          })),
          repeatOffender: {
            repeatCount: safeNumber(repeatData.repeat_count, 0),
            totalCount: safeNumber(repeatData.total_count, 0),
            rate: safeNumber(repeatData.total_count, 0) > 0
              ? Math.round((safeNumber(repeatData.repeat_count, 0) / safeNumber(repeatData.total_count, 0)) * 1000) / 10
              : 0,
          },
          settlementCycleTime: cycleTimeRows.map((r: any) => ({
            month: r.month,
            avgDays: safeNumber(r.avg_days, 0),
            closedCount: safeNumber(r.closed_count, 0),
          })),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[Analytics] getRiskManagerKPIs error:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch risk manager KPIs' });
      }
    }),

  // ─── Send Risk Analytics Report by Email ─────────────────────────────────────
  sendRiskAnalyticsReport: analyticsRoleProcedure
    .input(z.object({
      months: z.union([z.literal(3), z.literal(6), z.literal(12)]),
      recipientEmail: z.string().email(),
      recipientName: z.string().optional(),
      summaryKpis: z.object({
        totalClaims: z.number(),
        avgRepairCost: z.number(),
        fraudRate: z.number(),
        totalQuantum: z.number(),
        avgCycleDays: z.number(),
        repeatOffenderRate: z.number(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // Role gate
      if (ctx.user.insurerRole !== 'risk_manager' && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Risk Manager role required' });
      }

      const { months, recipientEmail, recipientName, summaryKpis } = input;
      const tenantId = resolveAnalyticsTenant(ctx);
      const rangeLabel = `Last ${months} months`;
      const generatedAt = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });

      const fmtUSD = (v: number) => {
        if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
        if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
        return `$${v.toFixed(0)}`;
      };

      const content = [
        `Dear ${recipientName ?? 'Risk Manager'},`,
        '',
        `Please find below your KINGA Risk Manager Analytics report for the period: ${rangeLabel}.`,
        `This report was generated on ${generatedAt} for tenant: ${tenantId}.`,
        '',
        '── KEY PERFORMANCE INDICATORS ──────────────────────────────',
        `• Total Claims (${rangeLabel}):       ${summaryKpis.totalClaims.toLocaleString()}`,
        `• Average Repair Cost:               ${fmtUSD(summaryKpis.avgRepairCost)}`,
        `• High Fraud Rate:                   ${summaryKpis.fraudRate.toFixed(1)}% of assessed claims`,
        `• Third-Party Exposure (${rangeLabel}): ${fmtUSD(summaryKpis.totalQuantum)}`,
        `• Repeat Offender Rate:              ${summaryKpis.repeatOffenderRate.toFixed(1)}%`,
        `• Average Settlement Cycle Time:     ${summaryKpis.avgCycleDays} days`,
        '',
        '── REPORT SECTIONS ─────────────────────────────────────────',
        '1. Claims Frequency by Incident Type',
        '2. Average Repair Cost by Vehicle Age',
        '3. Fraud Flag Rate by Claim Type',
        '4. Third-Party Recovery Exposure',
        '5. Repeat Offender Intelligence',
        '6. Settlement Cycle Time',
        '',
        'To view the full interactive dashboard with charts, log in to KINGA and navigate to:',
        'Risk Manager Portal → Intelligence → Risk Analytics',
        '',
        '────────────────────────────────────────────────────────────',
        'This report is confidential and intended solely for the named recipient.',
        'Data is tenant-isolated and reflects own-book motor claims only.',
        '© KINGA Intelligence',
      ].join('\n');

      const sent = await notifyOwner({
        title: `Risk Analytics Report — ${rangeLabel} — ${generatedAt}`,
        content,
      });

      if (!sent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Notification service unavailable. Please try again.' });
      }

      return { success: true, sentTo: recipientEmail };
    }),

  /**
   * Get Month-on-Month Comparison
   * Returns real current vs prior month metrics for the comparison strip.
   * Replaces the hardcoded DEMO_MONTH_COMPARISON fixture.
   */
  getMonthComparison: analyticsRoleProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const tenantId = resolveAnalyticsTenant(ctx);
      const tenantFilter = sql`c.tenant_id = ${tenantId}`;

      const now = new Date();
      // Current month: 1st of this month → now
      const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      // Prior month: 1st → last day of prior month
      const priorStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const priorEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      const curStartStr = curStart.toISOString();
      const priorStartStr = priorStart.toISOString();
      const priorEndStr = priorEnd.toISOString();

      const result = await db.execute(sql`
        SELECT
          -- Total Claims
          SUM(CASE WHEN c.created_at >= ${curStartStr} THEN 1 ELSE 0 END) AS cur_claims,
          SUM(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} THEN 1 ELSE 0 END) AS prior_claims,
          -- KINGA Savings (cents → rands)
          SUM(CASE WHEN c.created_at >= ${curStartStr} AND c.final_approved_amount IS NOT NULL AND ai.estimated_cost IS NOT NULL
            THEN GREATEST(0, ai.estimated_cost - c.final_approved_amount) ELSE 0 END) / 100 AS cur_savings,
          SUM(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} AND c.final_approved_amount IS NOT NULL AND ai.estimated_cost IS NOT NULL
            THEN GREATEST(0, ai.estimated_cost - c.final_approved_amount) ELSE 0 END) / 100 AS prior_savings,
          -- Resolution Rate (completed / total)
          SUM(CASE WHEN c.created_at >= ${curStartStr} AND c.status = 'completed' THEN 1 ELSE 0 END) AS cur_completed,
          SUM(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} AND c.status = 'completed' THEN 1 ELSE 0 END) AS prior_completed,
          -- Avg Cycle Time (days)
          AVG(CASE WHEN c.created_at >= ${curStartStr} AND c.status = 'completed' AND c.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(DAY, c.created_at, c.closed_at) ELSE NULL END) AS cur_cycle,
          AVG(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} AND c.status = 'completed' AND c.closed_at IS NOT NULL
            THEN TIMESTAMPDIFF(DAY, c.created_at, c.closed_at) ELSE NULL END) AS prior_cycle,
          -- Fraud Flags
          SUM(CASE WHEN c.created_at >= ${curStartStr} AND ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) AS cur_fraud,
          SUM(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} AND ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) AS prior_fraud,
          -- Fast-Track Rate (auto_approved / total)
          SUM(CASE WHEN c.created_at >= ${curStartStr} AND c.workflow_state = 'auto_approved' THEN 1 ELSE 0 END) AS cur_fasttrack,
          SUM(CASE WHEN c.created_at >= ${priorStartStr} AND c.created_at <= ${priorEndStr} AND c.workflow_state = 'auto_approved' THEN 1 ELSE 0 END) AS prior_fasttrack
        FROM claims c
        LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
        WHERE ${tenantFilter}
          AND c.created_at >= ${priorStartStr}
      `);

      const _rows = (result as any)[0];
      const row = (Array.isArray(_rows) ? _rows[0] : _rows) as any;

      const curClaims = safeNumber(row?.cur_claims, 0);
      const priorClaims = safeNumber(row?.prior_claims, 0);
      const curSavings = Math.round(safeNumber(row?.cur_savings, 0));
      const priorSavings = Math.round(safeNumber(row?.prior_savings, 0));
      const curCompleted = safeNumber(row?.cur_completed, 0);
      const priorCompleted = safeNumber(row?.prior_completed, 0);
      const curCycle = Math.round(safeNumber(row?.cur_cycle, 0) * 10) / 10;
      const priorCycle = Math.round(safeNumber(row?.prior_cycle, 0) * 10) / 10;
      const curFraud = safeNumber(row?.cur_fraud, 0);
      const priorFraud = safeNumber(row?.prior_fraud, 0);
      const curFasttrack = safeNumber(row?.cur_fasttrack, 0);
      const priorFasttrack = safeNumber(row?.prior_fasttrack, 0);

      const curResolution = curClaims > 0 ? Math.round((curCompleted / curClaims) * 100) : 0;
      const priorResolution = priorClaims > 0 ? Math.round((priorCompleted / priorClaims) * 100) : 0;
      const curFasttrackRate = curClaims > 0 ? Math.round((curFasttrack / curClaims) * 100) : 0;
      const priorFasttackRate = priorClaims > 0 ? Math.round((priorFasttrack / priorClaims) * 100) : 0;

      const curMonthLabel = curStart.toLocaleString('en-ZA', { month: 'long', year: 'numeric' }).toUpperCase();
      const priorMonthLabel = priorStart.toLocaleString('en-ZA', { month: 'long', year: 'numeric' }).toUpperCase();

      return {
        label: `${curMonthLabel} vs ${priorMonthLabel}`,
        items: [
          { label: 'Total Claims', current: curClaims, prior: priorClaims, unit: '', higherIsBetter: true, isCurrency: false },
          { label: 'KINGA Savings', current: curSavings, prior: priorSavings, unit: 'ZAR', higherIsBetter: true, isCurrency: true },
          { label: 'Resolution Rate', current: curResolution, prior: priorResolution, unit: '%', higherIsBetter: true, isCurrency: false },
          { label: 'Avg Cycle Time', current: curCycle, prior: priorCycle, unit: 'd', higherIsBetter: false, isCurrency: false },
          { label: 'Fraud Flags', current: curFraud, prior: priorFraud, unit: '', higherIsBetter: false, isCurrency: false },
          { label: 'Fast-Track Rate', current: curFasttrackRate, prior: priorFasttackRate, unit: '%', higherIsBetter: true, isCurrency: false },
        ],
      };
    } catch (error) {
      console.error('[Analytics] getMonthComparison error:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Failed to fetch month comparison' });
    }
  }),

  /**
   * Get Executive Alerts
   * Returns prioritised, actionable alerts for the executive — not raw data, but decisions.
   */
  getExecutiveAlerts: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const tenantId = resolveAnalyticsTenant(ctx);
        const tf = sql`c.tenant_id = ${tenantId}`;
        const workflowTf = sql`wat.tenant_id = ${tenantId}`;
        const recoveryTf = sql`rc.tenant_id = ${tenantId}`;
        const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM claims c LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
             WHERE ${tf} AND ai.fraud_risk_level = 'high' AND c.status NOT IN ('completed','rejected')
            ) as open_fraud_count,
            (SELECT COALESCE(SUM(ai.estimated_cost),0) FROM claims c LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
             WHERE ${tf} AND ai.fraud_risk_level = 'high' AND c.status NOT IN ('completed','rejected')
            ) as fraud_exposure_cents,
            (SELECT COUNT(*) FROM claims c
             WHERE ${tf} AND c.status NOT IN ('completed','rejected','cancelled')
               AND c.created_at < ${sevenDaysAgo.toISOString()}
            ) as stale_claims_count,
            (SELECT COUNT(*) FROM claims c
             WHERE ${tf} AND c.workflow_state = 'disputed'
            ) as disputed_count,
            (SELECT COUNT(*) FROM workflow_audit_trail wat
             WHERE ${workflowTf}
               AND wat.executive_override = 1
               AND wat.created_at >= ${thirtyDaysAgo.toISOString()}
            ) as override_count,
            (SELECT COUNT(*) FROM recovery_cases rc
             WHERE ${recoveryTf}
               AND rc.status = 'open'
            ) as open_recovery_count,
            (SELECT COALESCE(SUM(rc.recovery_amount),0) FROM recovery_cases rc
             WHERE ${recoveryTf}
               AND rc.status = 'open'
            ) as recovery_opportunity_cents
        `);

        const _rows = (result as any)[0];
        const row = (Array.isArray(_rows) ? _rows[0] : _rows) as any;

        const alerts: Array<{
          id: string; severity: 'critical' | 'warning' | 'info';
          title: string; description: string; value?: string; action?: string;
        }> = [];

        const fraudCount = safeNumber(row?.open_fraud_count, 0);
        const fraudExposure = safeNumber(row?.fraud_exposure_cents, 0) / 100;
        if (fraudCount > 0) {
          alerts.push({
            id: 'fraud_exposure',
            severity: fraudCount >= 5 ? 'critical' : 'warning',
            title: `${fraudCount} high-risk claim${fraudCount > 1 ? 's' : ''} require review`,
            description: `Estimated fraud exposure: R ${fraudExposure.toLocaleString()}`,
            value: `R ${fraudExposure.toLocaleString()}`,
            action: 'Review in Risk Manager',
          });
        }

        const staleCount = safeNumber(row?.stale_claims_count, 0);
        if (staleCount > 0) {
          alerts.push({
            id: 'stale_claims',
            severity: staleCount >= 10 ? 'critical' : 'warning',
            title: `${staleCount} claim${staleCount > 1 ? 's' : ''} stalled beyond 7 days`,
            description: 'Claims pending without workflow progression — SLA risk.',
            value: String(staleCount),
            action: 'View in Claims Manager',
          });
        }

        const disputedCount = safeNumber(row?.disputed_count, 0);
        if (disputedCount > 0) {
          alerts.push({
            id: 'disputed',
            severity: 'warning',
            title: `${disputedCount} disputed claim${disputedCount > 1 ? 's' : ''} open`,
            description: 'Disputed claims require executive or legal resolution.',
            value: String(disputedCount),
            action: 'View disputes',
          });
        }

        const overrideCount = safeNumber(row?.override_count, 0);
        if (overrideCount > 5) {
          alerts.push({
            id: 'overrides',
            severity: 'info',
            title: `${overrideCount} executive overrides in last 30 days`,
            description: 'Elevated override rate may indicate workflow friction or policy gaps.',
            value: String(overrideCount),
            action: 'Review governance log',
          });
        }

        const recoveryCount = safeNumber(row?.open_recovery_count, 0);
        const recoveryOpportunity = safeNumber(row?.recovery_opportunity_cents, 0) / 100;
        if (recoveryCount > 0 && recoveryOpportunity > 0) {
          alerts.push({
            id: 'recovery_opportunity',
            severity: 'info',
            title: `R ${recoveryOpportunity.toLocaleString()} recovery opportunity`,
            description: `${recoveryCount} open recovery case${recoveryCount > 1 ? 's' : ''} with actionable potential.`,
            value: `R ${recoveryOpportunity.toLocaleString()}`,
            action: 'View in Recoveries',
          });
        }

        return { alerts, generatedAt: new Date().toISOString() };
      } catch (error) {
        console.error('[Analytics] getExecutiveAlerts error:', error);
        return { alerts: [], generatedAt: new Date().toISOString() };
      }
    }),

  /**
   * Get Claims Ageing
   * Returns open claims bucketed by age — tells the executive what is about to become a problem.
   */
  getClaimsAgeing: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const tenantId = resolveAnalyticsTenant(ctx);
        const tf = sql`c.tenant_id = ${tenantId}`;

        const result = await db.execute(sql`
          SELECT
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) <= 7 THEN 1 ELSE 0 END) as bucket_0_7,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) BETWEEN 8 AND 14 THEN 1 ELSE 0 END) as bucket_8_14,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) BETWEEN 15 AND 30 THEN 1 ELSE 0 END) as bucket_15_30,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) > 30 THEN 1 ELSE 0 END) as bucket_over_30,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) <= 7 THEN COALESCE(ai.estimated_cost,0) ELSE 0 END) as value_0_7,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) BETWEEN 8 AND 14 THEN COALESCE(ai.estimated_cost,0) ELSE 0 END) as value_8_14,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) BETWEEN 15 AND 30 THEN COALESCE(ai.estimated_cost,0) ELSE 0 END) as value_15_30,
            SUM(CASE WHEN DATEDIFF(NOW(), c.created_at) > 30 THEN COALESCE(ai.estimated_cost,0) ELSE 0 END) as value_over_30
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${tf} AND c.status NOT IN ('completed','rejected','cancelled')
        `);

        const _rows = (result as any)[0];
        const row = (Array.isArray(_rows) ? _rows[0] : _rows) as any;

        return {
          buckets: [
            { label: '0–7 days', count: safeNumber(row?.bucket_0_7, 0), value: Math.round(safeNumber(row?.value_0_7, 0) / 100), color: '#10B981' },
            { label: '8–14 days', count: safeNumber(row?.bucket_8_14, 0), value: Math.round(safeNumber(row?.value_8_14, 0) / 100), color: '#F59E0B' },
            { label: '15–30 days', count: safeNumber(row?.bucket_15_30, 0), value: Math.round(safeNumber(row?.value_15_30, 0) / 100), color: '#EF4444' },
            { label: '30+ days', count: safeNumber(row?.bucket_over_30, 0), value: Math.round(safeNumber(row?.value_over_30, 0) / 100), color: '#7C3AED' },
          ],
        };
      } catch (error) {
        console.error('[Analytics] getClaimsAgeing error:', error);
        return { buckets: [] };
      }
    }),

  /**
   * Get Escalation Counts
   * Returns escalation counts by type and severity for the Escalations Dashboard.
   */
  getEscalationCounts: analyticsRoleProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const tenantId = resolveAnalyticsTenant(ctx);
        const tf = sql`c.tenant_id = ${tenantId}`;

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const startDate = input.startDate ?? thirtyDaysAgo;
        const endDate = input.endDate ?? now;

        const result = await db.execute(sql`
          SELECT
            SUM(CASE WHEN c.workflow_state = 'disputed' THEN 1 ELSE 0 END) as disputed_count,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' AND c.status NOT IN ('completed','rejected','cancelled') THEN 1 ELSE 0 END) as fraud_escalations,
            SUM(CASE WHEN ai.estimated_cost > 1000000 AND c.workflow_state IN ('technical_approval','financial_decision') THEN 1 ELSE 0 END) as high_value_pending,
            SUM(CASE WHEN TIMESTAMPDIFF(DAY, c.created_at, NOW()) > 30 AND c.status NOT IN ('completed','rejected','cancelled') THEN 1 ELSE 0 END) as aged_claims,
            SUM(CASE WHEN c.created_at >= ${startDate.toISOString()} AND c.created_at <= ${endDate.toISOString()} AND c.workflow_state = 'disputed' THEN 1 ELSE 0 END) as disputed_period,
            SUM(CASE WHEN c.created_at >= ${startDate.toISOString()} AND c.created_at <= ${endDate.toISOString()} AND ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as fraud_period,
            COUNT(DISTINCT c.id) as total_active
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${tf}
        `);

        const _rows = (result as any)[0];
        const row = (Array.isArray(_rows) ? _rows[0] : _rows) as any;

        return {
          summary: {
            disputed: safeNumber(row?.disputed_count, 0),
            fraudEscalations: safeNumber(row?.fraud_escalations, 0),
            highValuePending: safeNumber(row?.high_value_pending, 0),
            agedClaims: safeNumber(row?.aged_claims, 0),
            totalActive: safeNumber(row?.total_active, 0),
          },
          period: {
            disputed: safeNumber(row?.disputed_period, 0),
            fraud: safeNumber(row?.fraud_period, 0),
          },
          categories: [
            { label: 'Disputed Claims', count: safeNumber(row?.disputed_count, 0), severity: 'high' as const, color: '#EF4444' },
            { label: 'Fraud Escalations', count: safeNumber(row?.fraud_escalations, 0), severity: 'critical' as const, color: '#7C3AED' },
            { label: 'High-Value Pending', count: safeNumber(row?.high_value_pending, 0), severity: 'medium' as const, color: '#F59E0B' },
            { label: 'Aged Claims (30d+)', count: safeNumber(row?.aged_claims, 0), severity: 'medium' as const, color: '#6B7280' },
          ],
        };
      } catch (error) {
        console.error('[Analytics] getEscalationCounts error:', error);
        return { summary: { disputed: 0, fraudEscalations: 0, highValuePending: 0, agedClaims: 0, totalActive: 0 }, period: { disputed: 0, fraud: 0 }, categories: [] };
      }
    }),

  /**
   * Get Settlement Trend
   * Returns monthly settlement amounts and counts for the Settlement Trend chart.
   */
  getSettlementTrend: analyticsRoleProcedure
    .input(z.object({
      months: z.number().min(3).max(24).default(12),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const tenantId = resolveAnalyticsTenant(ctx);
        const tf = sql`c.tenant_id = ${tenantId}`;
        const monthsBack = input.months;

        const result = await db.execute(sql`
          SELECT
            DATE_FORMAT(c.closed_at, '%Y-%m') as month,
            COUNT(DISTINCT c.id) as settled_count,
            SUM(COALESCE(c.final_approved_amount, 0)) as settled_amount_cents,
            AVG(COALESCE(c.final_approved_amount, 0)) as avg_settlement_cents,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as fraud_count,
            AVG(CASE
              WHEN c.final_approved_amount IS NOT NULL AND ai.estimated_cost IS NOT NULL AND ai.estimated_cost > 0
              THEN (c.final_approved_amount / ai.estimated_cost) * 100
              ELSE NULL
            END) as avg_settlement_ratio
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${tf}
            AND c.status = 'completed'
            AND c.closed_at IS NOT NULL
            AND c.closed_at >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(monthsBack))} MONTH)
          GROUP BY DATE_FORMAT(c.closed_at, '%Y-%m')
          ORDER BY month ASC
        `);

        const _rows = (result as any)[0];
        const rows = (Array.isArray(_rows) ? _rows : [_rows]) as any[];

        const trend = rows.filter(r => r?.month).map(r => ({
          month: String(r.month),
          settledCount: safeNumber(r.settled_count, 0),
          settledAmount: Math.round(safeNumber(r.settled_amount_cents, 0) / 100),
          avgSettlement: Math.round(safeNumber(r.avg_settlement_cents, 0) / 100),
          fraudCount: safeNumber(r.fraud_count, 0),
          avgSettlementRatio: r.avg_settlement_ratio != null ? Math.round(safeNumber(r.avg_settlement_ratio, 0) * 10) / 10 : null,
        }));

        return { trend };
      } catch (error) {
        console.error('[Analytics] getSettlementTrend error:', error);
        return { trend: [] };
      }
    }),

  /**
   * Get Fraud Investigation Funnel
   * Returns the funnel from flagged → investigated → confirmed → prevented.
   */
  getFraudInvestigationFunnel: analyticsRoleProcedure
    .query(async ({ ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const tenantId = resolveAnalyticsTenant(ctx);
        const tf = sql`c.tenant_id = ${tenantId}`;

        const result = await db.execute(sql`
          SELECT
            COUNT(DISTINCT c.id) as total_claims,
            SUM(CASE WHEN ai.fraud_risk_level IN ('high','medium') THEN 1 ELSE 0 END) as flagged,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' AND c.workflow_state IN ('manual_review','technical_approval','financial_decision','disputed') THEN 1 ELSE 0 END) as under_investigation,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' AND c.status = 'rejected' THEN 1 ELSE 0 END) as repudiated,
            SUM(CASE WHEN ai.fraud_risk_level = 'high' AND c.status = 'rejected' AND ai.estimated_cost IS NOT NULL THEN COALESCE(ai.estimated_cost,0) ELSE 0 END) as prevented_loss_cents
          FROM claims c
          LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
          WHERE ${tf}
        `);

        const _rows = (result as any)[0];
        const row = (Array.isArray(_rows) ? _rows[0] : _rows) as any;

        const totalClaims = safeNumber(row?.total_claims, 0);
        const flagged = safeNumber(row?.flagged, 0);
        const highRisk = safeNumber(row?.high_risk, 0);
        const underInvestigation = safeNumber(row?.under_investigation, 0);
        const repudiated = safeNumber(row?.repudiated, 0);
        const preventedLoss = Math.round(safeNumber(row?.prevented_loss_cents, 0) / 100);

        return {
          stages: [
            { label: 'All Claims', count: totalClaims, pct: 100 },
            { label: 'Flagged (Med/High)', count: flagged, pct: totalClaims > 0 ? Math.round((flagged / totalClaims) * 100) : 0 },
            { label: 'High Risk', count: highRisk, pct: totalClaims > 0 ? Math.round((highRisk / totalClaims) * 100) : 0 },
            { label: 'Under Investigation', count: underInvestigation, pct: highRisk > 0 ? Math.round((underInvestigation / highRisk) * 100) : 0 },
            { label: 'Repudiated', count: repudiated, pct: highRisk > 0 ? Math.round((repudiated / highRisk) * 100) : 0 },
          ],
          preventedLoss,
          conversionRate: flagged > 0 ? Math.round((repudiated / flagged) * 100) : 0,
        };
      } catch (error) {
        console.error('[Analytics] getFraudInvestigationFunnel error:', error);
        return { stages: [], preventedLoss: 0, conversionRate: 0 };
      }
    }),
});
