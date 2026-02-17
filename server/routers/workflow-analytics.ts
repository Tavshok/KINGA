import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { workflowAuditTrail, claims } from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Workflow Analytics Router
 * 
 * Provides analytics and insights from workflow audit trail data
 * including processing times, bottlenecks, and SLA compliance.
 */
export const workflowAnalyticsRouter = router({
  /**
   * Get average processing time per workflow stage
   * 
   * Calculates the average time claims spend in each workflow state
   * based on audit trail transitions.
   */
  getProcessingTimesByStage: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      try {
        // Query to calculate average time in each state
        const query = sql`
          SELECT 
            wat1.new_state as state,
            AVG(TIMESTAMPDIFF(HOUR, wat1.created_at, wat2.created_at)) as avg_hours,
            COUNT(DISTINCT wat1.claim_id) as claim_count
          FROM workflow_audit_trail wat1
          LEFT JOIN workflow_audit_trail wat2 
            ON wat1.claim_id = wat2.claim_id 
            AND wat2.id = (
              SELECT MIN(id) 
              FROM workflow_audit_trail 
              WHERE claim_id = wat1.claim_id 
              AND id > wat1.id
            )
          INNER JOIN claims c ON wat1.claim_id = c.id
          WHERE c.tenant_id = ${tenantId}
            ${input.startDate ? sql`AND wat1.created_at >= ${input.startDate}` : sql``}
            ${input.endDate ? sql`AND wat1.created_at <= ${input.endDate}` : sql``}
          GROUP BY wat1.new_state
          ORDER BY avg_hours DESC
        `;

        const results = await db.execute(query);

        return {
          success: true,
          data: results.rows.map((row: any) => ({
            state: row.state,
            avgHours: parseFloat(row.avg_hours) || 0,
            claimCount: parseInt(row.claim_count) || 0,
          })),
          meta: {
            generatedAt: new Date().toISOString(),
            tenantId,
            dateRange: {
              start: input.startDate || null,
              end: input.endDate || null,
            },
          },
        };
      } catch (error: any) {
        console.error("Error calculating processing times:", error);
        return {
          success: false,
          data: [],
          error: {
            code: "CALCULATION_ERROR",
            message: "Failed to calculate processing times",
          },
        };
      }
    }),

  /**
   * Identify workflow bottlenecks
   * 
   * Finds workflow states where claims spend the most time
   * and identifies potential process bottlenecks.
   */
  getBottlenecks: protectedProcedure
    .input(
      z.object({
        threshold: z.number().default(48), // Hours threshold for bottleneck
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      try {
        // Query to find bottlenecks (states exceeding threshold)
        const query = sql`
          SELECT 
            wat1.new_state as state,
            AVG(TIMESTAMPDIFF(HOUR, wat1.created_at, wat2.created_at)) as avg_hours,
            MAX(TIMESTAMPDIFF(HOUR, wat1.created_at, wat2.created_at)) as max_hours,
            COUNT(DISTINCT wat1.claim_id) as affected_claims
          FROM workflow_audit_trail wat1
          LEFT JOIN workflow_audit_trail wat2 
            ON wat1.claim_id = wat2.claim_id 
            AND wat2.id = (
              SELECT MIN(id) 
              FROM workflow_audit_trail 
              WHERE claim_id = wat1.claim_id 
              AND id > wat1.id
            )
          INNER JOIN claims c ON wat1.claim_id = c.id
          WHERE c.tenant_id = ${tenantId}
            ${input.startDate ? sql`AND wat1.created_at >= ${input.startDate}` : sql``}
            ${input.endDate ? sql`AND wat1.created_at <= ${input.endDate}` : sql``}
          GROUP BY wat1.new_state
          HAVING avg_hours > ${input.threshold}
          ORDER BY avg_hours DESC
        `;

        const results = await db.execute(query);

        return {
          success: true,
          data: results.rows.map((row: any) => ({
            state: row.state,
            avgHours: parseFloat(row.avg_hours) || 0,
            maxHours: parseFloat(row.max_hours) || 0,
            affectedClaims: parseInt(row.affected_claims) || 0,
            severity: parseFloat(row.avg_hours) > input.threshold * 2 ? "critical" : "warning",
          })),
          meta: {
            generatedAt: new Date().toISOString(),
            tenantId,
            threshold: input.threshold,
          },
        };
      } catch (error: any) {
        console.error("Error identifying bottlenecks:", error);
        return {
          success: false,
          data: [],
          error: {
            code: "BOTTLENECK_ERROR",
            message: "Failed to identify bottlenecks",
          },
        };
      }
    }),

  /**
   * Calculate SLA compliance metrics
   * 
   * Measures how many claims meet SLA targets for each workflow stage.
   */
  getSLACompliance: protectedProcedure
    .input(
      z.object({
        slaTargets: z.record(z.number()).optional(), // State -> hours mapping
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      // Default SLA targets (in hours)
      const slaTargets = input.slaTargets || {
        created: 2,
        assigned: 4,
        under_assessment: 24,
        internal_review: 12,
        technical_approval: 8,
        financial_decision: 4,
        payment_authorized: 2,
        closed: 1,
      };

      try {
        const complianceResults = [];

        for (const [state, targetHours] of Object.entries(slaTargets)) {
          const query = sql`
            SELECT 
              COUNT(*) as total_transitions,
              SUM(CASE 
                WHEN TIMESTAMPDIFF(HOUR, wat1.created_at, wat2.created_at) <= ${targetHours}
                THEN 1 
                ELSE 0 
              END) as compliant_transitions
            FROM workflow_audit_trail wat1
            LEFT JOIN workflow_audit_trail wat2 
              ON wat1.claim_id = wat2.claim_id 
              AND wat2.id = (
                SELECT MIN(id) 
                FROM workflow_audit_trail 
                WHERE claim_id = wat1.claim_id 
                AND id > wat1.id
              )
            INNER JOIN claims c ON wat1.claim_id = c.id
            WHERE c.tenant_id = ${tenantId}
              AND wat1.new_state = ${state}
              ${input.startDate ? sql`AND wat1.created_at >= ${input.startDate}` : sql``}
              ${input.endDate ? sql`AND wat1.created_at <= ${input.endDate}` : sql``}
          `;

          const result = await db.execute(query);
          const row: any = result.rows[0];

          const totalTransitions = parseInt(row?.total_transitions) || 0;
          const compliantTransitions = parseInt(row?.compliant_transitions) || 0;
          const complianceRate = totalTransitions > 0 ? (compliantTransitions / totalTransitions) * 100 : 0;

          complianceResults.push({
            state,
            slaTarget: targetHours,
            totalTransitions,
            compliantTransitions,
            complianceRate: parseFloat(complianceRate.toFixed(2)),
            status: complianceRate >= 90 ? "excellent" : complianceRate >= 75 ? "good" : complianceRate >= 50 ? "warning" : "critical",
          });
        }

        return {
          success: true,
          data: complianceResults,
          meta: {
            generatedAt: new Date().toISOString(),
            tenantId,
            overallCompliance: parseFloat(
              (complianceResults.reduce((sum, r) => sum + r.complianceRate, 0) / complianceResults.length).toFixed(2)
            ),
          },
        };
      } catch (error: any) {
        console.error("Error calculating SLA compliance:", error);
        return {
          success: false,
          data: [],
          error: {
            code: "SLA_ERROR",
            message: "Failed to calculate SLA compliance",
          },
        };
      }
    }),

  /**
   * Get user productivity metrics
   * 
   * Tracks how many workflow transitions each user has performed.
   */
  getUserProductivity: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      try {
        const query = sql`
          SELECT 
            wat.user_id,
            wat.user_role,
            COUNT(*) as transition_count,
            COUNT(DISTINCT wat.claim_id) as claims_handled
          FROM workflow_audit_trail wat
          INNER JOIN claims c ON wat.claim_id = c.id
          WHERE c.tenant_id = ${tenantId}
            ${input.startDate ? sql`AND wat.created_at >= ${input.startDate}` : sql``}
            ${input.endDate ? sql`AND wat.created_at <= ${input.endDate}` : sql``}
          GROUP BY wat.user_id, wat.user_role
          ORDER BY transition_count DESC
        `;

        const results = await db.execute(query);

        return {
          success: true,
          data: results.rows.map((row: any) => ({
            userId: parseInt(row.user_id),
            userRole: row.user_role,
            transitionCount: parseInt(row.transition_count),
            claimsHandled: parseInt(row.claims_handled),
          })),
          meta: {
            generatedAt: new Date().toISOString(),
            tenantId,
          },
        };
      } catch (error: any) {
        console.error("Error calculating user productivity:", error);
        return {
          success: false,
          data: [],
          error: {
            code: "PRODUCTIVITY_ERROR",
            message: "Failed to calculate user productivity",
          },
        };
      }
    }),

  /**
   * Get workflow transition trends over time
   * 
   * Shows how many transitions occur per day/week/month.
   */
  getTransitionTrends: protectedProcedure
    .input(
      z.object({
        groupBy: z.enum(["day", "week", "month"]).default("day"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });

      try {
        const dateFormat = input.groupBy === "day" ? "%Y-%m-%d" : input.groupBy === "week" ? "%Y-%U" : "%Y-%m";

        const query = sql`
          SELECT 
            DATE_FORMAT(wat.created_at, ${dateFormat}) as period,
            COUNT(*) as transition_count,
            COUNT(DISTINCT wat.claim_id) as unique_claims
          FROM workflow_audit_trail wat
          INNER JOIN claims c ON wat.claim_id = c.id
          WHERE c.tenant_id = ${tenantId}
            ${input.startDate ? sql`AND wat.created_at >= ${input.startDate}` : sql``}
            ${input.endDate ? sql`AND wat.created_at <= ${input.endDate}` : sql``}
          GROUP BY period
          ORDER BY period ASC
        `;

        const results = await db.execute(query);

        return {
          success: true,
          data: results.rows.map((row: any) => ({
            period: row.period,
            transitionCount: parseInt(row.transition_count),
            uniqueClaims: parseInt(row.unique_claims),
          })),
          meta: {
            generatedAt: new Date().toISOString(),
            tenantId,
            groupBy: input.groupBy,
          },
        };
      } catch (error: any) {
        console.error("Error calculating transition trends:", error);
        return {
          success: false,
          data: [],
          error: {
            code: "TREND_ERROR",
            message: "Failed to calculate transition trends",
          },
        };
      }
    }),
});
