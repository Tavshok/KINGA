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
import {
  buildP0B1FraudDecisionHold,
  throwP0B1FraudDecisionHold,
} from "../evidence-governance/p0FraudDecisionHold";

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

function requireP0FraudAnalyticsTenant(ctx: {
  user: { id?: number; tenantId?: string | null; role: string } | null;
  req?: any;
}): string {
  const tenantId = resolveAnalyticsTenant(ctx as any);
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "An explicitly selected tenant-scoped session is required for fraud analytics",
    });
  }
  return tenantId;
}

function requireRiskManagerAnalyticsRole(ctx: {
  user: { role: string; insurerRole?: string | null } | null;
}): void {
  if (
    !ctx.user ||
    (ctx.user.insurerRole !== "risk_manager" && !isAdminRole(ctx.user.role))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Risk Manager role required",
    });
  }
}

function requireRiskManagerReportRole(ctx: {
  user: { role: string; insurerRole?: string | null } | null;
}): void {
  if (
    !ctx.user ||
    (ctx.user.insurerRole !== "risk_manager" && ctx.user.role !== "admin")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Risk Manager role required",
    });
  }
}

/**
 * Global Search is an operational discovery surface, not a fraud-decision
 * surface. This allowlist prevents stored fraud fields from becoming
 * publishable when new columns are later added to `claims`.
 */
export function projectP0B1GlobalSearchClaim(
  claim: Record<string, unknown>,
  claimant: Record<string, unknown> | null | undefined
) {
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    kingaRef: claim.kingaRef,
    vehicleMake: claim.vehicleMake,
    vehicleModel: claim.vehicleModel,
    vehicleYear: claim.vehicleYear,
    vehicleRegistration: claim.vehicleRegistration,
    policyNumber: claim.policyNumber,
    incidentDate: claim.incidentDate,
    incidentType: claim.incidentType,
    status: claim.status,
    workflowState: claim.workflowState,
    estimatedClaimValue: claim.estimatedClaimValue,
    approvedAmount: claim.approvedAmount,
    currencyCode: claim.currencyCode,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    claimantName: safeString(claimant?.name, ""),
    claimantEmail: safeString(claimant?.email, ""),
  };
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
            claim: {
              id: claims.id,
              claimNumber: claims.claimNumber,
              kingaRef: claims.kingaRef,
              vehicleMake: claims.vehicleMake,
              vehicleModel: claims.vehicleModel,
              vehicleYear: claims.vehicleYear,
              vehicleRegistration: claims.vehicleRegistration,
              policyNumber: claims.policyNumber,
              incidentDate: claims.incidentDate,
              incidentType: claims.incidentType,
              status: claims.status,
              workflowState: claims.workflowState,
              estimatedClaimValue: claims.estimatedClaimValue,
              approvedAmount: claims.approvedAmount,
              currencyCode: claims.currencyCode,
              createdAt: claims.createdAt,
              updatedAt: claims.updatedAt,
            },
            claimant: {
              name: users.name,
              email: users.email,
            },
          })
          .from(claims)
          .leftJoin(users, eq(claims.claimantId, users.id))
          .where(whereClause)
          .limit(50);

        const mappedResults = results.map(({ claim, claimant }) =>
          projectP0B1GlobalSearchClaim(claim, claimant)
        );

        return createAnalyticsResponse(
          buildP0B1FraudDecisionHold({
            results: mappedResults,
            // Preserve the existing dashboard shape while attaching the same
            // actionable, score-free hold used by governed report surfaces.
            claims: mappedResults,
          }),
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
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      void input;
      throwP0B1FraudDecisionHold();
    }),

  getCriticalAlerts: analyticsRoleProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

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
  getFinancialOverview: analyticsRoleProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

  getRiskManagerKPIs: analyticsRoleProcedure
    .input(
      z.object({
        months: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(6),
      })
    )
    .query(async ({ input, ctx }): Promise<any> => {
      requireRiskManagerAnalyticsRole(ctx);
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void input;
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      const tenantRows = await db
        .select({ tier: tenants.tier })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (tenantRows[0]?.tier !== "tier-enterprise") {
        throw new TRPCError({ code: "FORBIDDEN", message: "TIER_UPGRADE_REQUIRED" });
      }
      throwP0B1FraudDecisionHold();
    }),

  sendRiskAnalyticsReport: analyticsRoleProcedure
    .input(
      z.object({
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
      })
    )
    .mutation(async ({ input, ctx }): Promise<any> => {
      requireRiskManagerReportRole(ctx);
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      void input;
      throwP0B1FraudDecisionHold();
    }),

  getMonthComparison: analyticsRoleProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

  getExecutiveAlerts: analyticsRoleProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

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
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      void input;
      throwP0B1FraudDecisionHold();
    }),

  getSettlementTrend: analyticsRoleProcedure
    .input(
      z.object({
        months: z.number().min(3).max(24).default(12),
      })
    )
    .query(async ({ ctx, input }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      void input;
      throwP0B1FraudDecisionHold();
    }),

  getFraudInvestigationFunnel: analyticsRoleProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudAnalyticsTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

});
