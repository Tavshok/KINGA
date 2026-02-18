import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { 
  workflowAuditTrail, 
  claimInvolvementTracking, 
  roleAssignmentAudit,
  claims 
} from "../../drizzle/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

/**
 * Governance Router
 * 
 * Provides governance metrics for executive dashboard:
 * - Executive overrides tracking
 * - Segregation of duties violations
 * - Role assignment changes
 * - Involvement conflicts
 */
export const governanceRouter = router({
  /**
   * Get Governance Summary
   * 
   * Returns real-time governance metrics with trend analysis:
   * - Total executive overrides (last 30 days vs previous 30 days)
   * - Override rate (% of claims overridden)
   * - Segregation violations (users involved in multiple critical stages)
   * - Role changes (role assignment audit trail)
   * - Involvement conflicts (claims with segregation violations)
   * 
   * All queries enforce tenant isolation and use indexed date filtering.
   */
  getGovernanceSummary: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required for governance metrics",
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    try {
      const db = await getDb();
      
      // Execute all queries in parallel for optimal performance
      const [
        overridesLast30Days,
        overridesPrevious30Days,
        totalClaimsLast30Days,
        totalClaimsPrevious30Days,
        segregationViolationsLast30Days,
        segregationViolationsPrevious30Days,
        roleChangesLast30Days,
        roleChangesPrevious30Days,
      ] = await Promise.all([
        // 1. Total Overrides (Last 30 Days)
        db
          .select({ count: sql<number>`count(*)` })
          .from(workflowAuditTrail)
          .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              eq(workflowAuditTrail.executiveOverride, 1),
              gte(workflowAuditTrail.createdAt, thirtyDaysAgo)
            )
          ),

        // 2. Total Overrides (Previous 30 Days, 30-60 days ago)
        db
          .select({ count: sql<number>`count(*)` })
          .from(workflowAuditTrail)
          .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              eq(workflowAuditTrail.executiveOverride, 1),
              gte(workflowAuditTrail.createdAt, sixtyDaysAgo),
              lt(workflowAuditTrail.createdAt, thirtyDaysAgo)
            )
          ),

        // 3. Total Claims (Last 30 Days) - for override rate calculation
        db
          .select({ count: sql<number>`count(*)` })
          .from(claims)
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              gte(claims.createdAt, thirtyDaysAgo)
            )
          ),

        // 4. Total Claims (Previous 30 Days) - for override rate calculation
        db
          .select({ count: sql<number>`count(*)` })
          .from(claims)
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              gte(claims.createdAt, sixtyDaysAgo),
              lt(claims.createdAt, thirtyDaysAgo)
            )
          ),

        // 5. Segregation Violations (Last 30 Days)
        // Count claim-user pairs where same user involved in 2+ critical stages
        db
          .select({
            claimId: claimInvolvementTracking.claimId,
            userId: claimInvolvementTracking.userId,
            stageCount: sql<number>`count(distinct ${claimInvolvementTracking.workflowStage})`,
          })
          .from(claimInvolvementTracking)
          .innerJoin(claims, eq(claimInvolvementTracking.claimId, claims.id))
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              gte(claimInvolvementTracking.createdAt, thirtyDaysAgo)
            )
          )
          .groupBy(sql`${claimInvolvementTracking.claimId}, ${claimInvolvementTracking.userId}`)
          .having(sql`count(distinct ${claimInvolvementTracking.workflowStage}) > 1`),

        // 6. Segregation Violations (Previous 30 Days)
        db
          .select({
            claimId: claimInvolvementTracking.claimId,
            userId: claimInvolvementTracking.userId,
            stageCount: sql<number>`count(distinct ${claimInvolvementTracking.workflowStage})`,
          })
          .from(claimInvolvementTracking)
          .innerJoin(claims, eq(claimInvolvementTracking.claimId, claims.id))
          .where(
            and(
              eq(claims.tenantId, ctx.user.tenantId),
              gte(claimInvolvementTracking.createdAt, sixtyDaysAgo),
              lt(claimInvolvementTracking.createdAt, thirtyDaysAgo)
            )
          )
          .groupBy(sql`${claimInvolvementTracking.claimId}, ${claimInvolvementTracking.userId}`)
          .having(sql`count(distinct ${claimInvolvementTracking.workflowStage}) > 1`),

        // 7. Role Changes (Last 30 Days)
        db
          .select({ count: sql<number>`count(*)` })
          .from(roleAssignmentAudit)
          .where(
            and(
              eq(roleAssignmentAudit.tenantId, ctx.user.tenantId),
              gte(roleAssignmentAudit.timestamp, thirtyDaysAgo)
            )
          ),

        // 8. Role Changes (Previous 30 Days)
        db
          .select({ count: sql<number>`count(*)` })
          .from(roleAssignmentAudit)
          .where(
            and(
              eq(roleAssignmentAudit.tenantId, ctx.user.tenantId),
              gte(roleAssignmentAudit.timestamp, sixtyDaysAgo),
              lt(roleAssignmentAudit.timestamp, thirtyDaysAgo)
            )
          ),
      ]);

      // Extract counts with null safety
      const totalOverridesValue = overridesLast30Days[0]?.count ?? 0;
      const totalOverridesPrevious = overridesPrevious30Days[0]?.count ?? 0;
      
      const totalClaimsValue = totalClaimsLast30Days[0]?.count ?? 0;
      const totalClaimsPrevious = totalClaimsPrevious30Days[0]?.count ?? 0;
      
      const segregationViolationsValue = segregationViolationsLast30Days.length;
      const segregationViolationsPrevious = segregationViolationsPrevious30Days.length;
      
      const roleChangesValue = roleChangesLast30Days[0]?.count ?? 0;
      const roleChangesPrevious = roleChangesPrevious30Days[0]?.count ?? 0;

      // Calculate override rate (% of claims overridden)
      const overrideRateValue = totalClaimsValue > 0
        ? Number(((totalOverridesValue / totalClaimsValue) * 100).toFixed(1))
        : 0;
      
      const overrideRatePrevious = totalClaimsPrevious > 0
        ? Number(((totalOverridesPrevious / totalClaimsPrevious) * 100).toFixed(1))
        : 0;

      // Calculate trends
      const calculateTrend = (current: number, previous: number): "up" | "down" | "stable" => {
        if (current > previous) return "up";
        if (current < previous) return "down";
        return "stable";
      };

      return {
        success: true,
        data: {
          totalOverrides: {
            value: totalOverridesValue,
            trend: calculateTrend(totalOverridesValue, totalOverridesPrevious),
            previousValue: totalOverridesPrevious,
          },
          overrideRate: {
            value: overrideRateValue,
            trend: calculateTrend(overrideRateValue, overrideRatePrevious),
            previousValue: overrideRatePrevious,
          },
          segregationViolations: {
            value: segregationViolationsValue,
            trend: calculateTrend(segregationViolationsValue, segregationViolationsPrevious),
            previousValue: segregationViolationsPrevious,
          },
          roleChanges: {
            value: roleChangesValue,
            trend: calculateTrend(roleChangesValue, roleChangesPrevious),
            previousValue: roleChangesPrevious,
          },
          involvementConflicts: {
            value: segregationViolationsValue, // Same as segregation violations
            trend: calculateTrend(segregationViolationsValue, segregationViolationsPrevious),
            previousValue: segregationViolationsPrevious,
          },
        },
      };
    } catch (error) {
      console.error("Error fetching governance summary:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch governance metrics",
      });
    }
  }),
});
