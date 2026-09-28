/**
 * Claims Manager Router
 *
 * Provides the operational command centre procedures for the Claims Manager portal.
 * All procedures are scoped to the claims_manager, insurer_admin, and executive roles.
 *
 * Procedures:
 * - getQueueHealthMatrix: Per-stage queue counts, avg age, oldest claim, SLA breaches
 * - getAttentionRequired: Seven exception rules → structured counts + claim lists
 * - getApprovalWorkbenchMetrics: Approval queue counts + avg age at approval stages
 * - getCapacityForecast: 7-day intake vs completion trend + backlog trajectory
 */

import { router } from "../_core/trpc";
import { insurerDomainProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { claims, workflowAuditTrail, users } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, inArray, sql, count, avg } from "drizzle-orm";
import { z } from "zod";
import { FINANCIAL_APPROVAL_THRESHOLD_CENTS } from "../../shared/const";
import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";

const WORKFLOW_STAGES = [
  "intake_queue",
  "intake_verified",
  "internal_review",
  "technical_approval",
  "financial_decision",
  "payment_authorized",
] as const;

const SLA_THRESHOLDS_DAYS: Record<string, number> = {
  intake_queue: 1,
  intake_verified: 2,
  internal_review: 5,
  technical_approval: 3,
  financial_decision: 2,
  payment_authorized: 3,
};

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
}

function requireP0FraudClaimsManagerTenant(ctx: {
  insurerTenantId?: string | null;
  user?: { tenantId?: string | null } | null;
}): string {
  const tenantId = ctx.insurerTenantId ?? ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A tenant-scoped session is required for fraud-related claims management",
    });
  }
  return tenantId;
}

export const claimsManagerRouter = router({
  /**
   * Queue Health Matrix
   *
   * Returns per-stage queue health data for all active workflow stages.
   * For each stage: count, avgAgeDays, oldestAgeDays, slaBreachCount.
   * Source: claims table, workflowState field. Zero schema changes required.
   */
  getQueueHealthMatrix: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const rows = await db
      .select({
        id: claims.id,
        workflowState: claims.workflowState,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        claimNumber: claims.claimNumber,
        fraudRiskLevel: claims.fraudRiskLevel,
        totalClaimAmount: (claims as any).totalClaimAmount,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          inArray(claims.workflowState, [...WORKFLOW_STAGES] as any[])
        )
      )
      .orderBy(claims.createdAt);

    const stageMap: Record<string, {
      count: number;
      ages: number[];
      oldestClaimNumber: string | null;
      oldestAgeDays: number;
    }> = {};

    for (const stage of WORKFLOW_STAGES) {
      stageMap[stage] = { count: 0, ages: [], oldestClaimNumber: null, oldestAgeDays: 0 };
    }

    for (const row of rows) {
      const stage = row.workflowState;
      if (!stage || !stageMap[stage]) continue;
      const age = daysSince(row.createdAt);
      stageMap[stage].count++;
      stageMap[stage].ages.push(age);
      if (age > stageMap[stage].oldestAgeDays) {
        stageMap[stage].oldestAgeDays = age;
        stageMap[stage].oldestClaimNumber = row.claimNumber ?? null;
      }
    }

    const matrix = WORKFLOW_STAGES.map((stage) => {
      const data = stageMap[stage];
      const avgAge = data.ages.length > 0
        ? Math.round(data.ages.reduce((a, b) => a + b, 0) / data.ages.length)
        : 0;
      const slaThreshold = SLA_THRESHOLDS_DAYS[stage] ?? 5;
      const slaBreachCount = data.ages.filter(a => a > slaThreshold).length;
      const slaBreachPct = data.count > 0 ? Math.round((slaBreachCount / data.count) * 100) : 0;
      return {
        stage,
        count: data.count,
        avgAgeDays: avgAge,
        oldestAgeDays: data.oldestAgeDays,
        oldestClaimNumber: data.oldestClaimNumber,
        slaBreachCount,
        slaBreachPct,
        slaThresholdDays: slaThreshold,
        health: slaBreachPct >= 50 ? "critical" : slaBreachPct >= 25 ? "warning" : "healthy",
      };
    });

    const totalActive = rows.length;
    const totalSlaBreaches = matrix.reduce((sum, s) => sum + s.slaBreachCount, 0);

    return { matrix, totalActive, totalSlaBreaches };
  }),

  /**
   * Attention Required
   *
   * Returns structured counts for seven exception categories that require
   * immediate Claims Manager attention. Each category includes a count and
   * the top 5 claim IDs/numbers for drill-down.
   */
  getAttentionRequired: insurerDomainProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudClaimsManagerTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

  getApprovalWorkbenchMetrics: insurerDomainProcedure.query(
    async ({ ctx }): Promise<any> => {
      const tenantId = requireP0FraudClaimsManagerTenant(ctx);
      void tenantId;
      throwP0B1FraudDecisionHold();
    }
  ),

  getCapacityForecast: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const recentClaims = await db
      .select({
        id: claims.id,
        status: claims.status,
        workflowState: claims.workflowState,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        closedAt: claims.closedAt,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          gte(claims.createdAt, sevenDaysAgo)
        )
      );

    // Build daily intake and completion counts for last 7 days
    const days: { date: string; intake: number; completions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      days.push({ date: dateStr, intake: 0, completions: 0 });
    }

    for (const c of recentClaims) {
      const createdDate = c.createdAt?.split("T")[0] ?? c.createdAt?.split(" ")[0];
      const dayEntry = days.find(d => d.date === createdDate);
      if (dayEntry) dayEntry.intake++;

      if (c.status === "completed" || c.status === "closed") {
        const closedDate = (c.closedAt ?? c.updatedAt)?.split("T")[0] ?? (c.closedAt ?? c.updatedAt)?.split(" ")[0];
        const closedDayEntry = days.find(d => d.date === closedDate);
        if (closedDayEntry) closedDayEntry.completions++;
      }
    }

    const totalIntake7d = days.reduce((sum, d) => sum + d.intake, 0);
    const totalCompletions7d = days.reduce((sum, d) => sum + d.completions, 0);
    const netBacklogChange = totalIntake7d - totalCompletions7d;

    // Current active backlog
    const activeBacklogResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          sql`${claims.status} NOT IN ('completed', 'closed', 'rejected')`
        )
      );
    const activeBacklog = Number(activeBacklogResult[0]?.count ?? 0);

    const trajectory: "growing" | "stable" | "shrinking" =
      netBacklogChange > 2 ? "growing" :
      netBacklogChange < -2 ? "shrinking" : "stable";

    const avgDailyIntake = Math.round(totalIntake7d / 7);
    const avgDailyCompletions = Math.round(totalCompletions7d / 7);

    return {
      days,
      totalIntake7d,
      totalCompletions7d,
      netBacklogChange,
      activeBacklog,
      trajectory,
      avgDailyIntake,
      avgDailyCompletions,
      projectedBacklogIn7d: Math.max(0, activeBacklog + netBacklogChange),
    };
  }),

  /**
   * Workload Distribution
   *
   * Returns per-assignee active claim count and oldest claim age for processors
   * and assessors. Answers: "Which processor or assessor has the highest backlog?"
   * Source: claims table joined to users table.
   * Stalled threshold: 7 days without state change (same as getAttentionRequired).
   */
  getWorkloadDistribution: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Fetch all active (non-terminal) claims with assignment fields
    const activeClaims = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        assignedProcessorId: claims.assignedProcessorId,
        assignedAssessorId: claims.assignedAssessorId,
        workflowState: claims.workflowState,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          sql`${claims.status} NOT IN ('completed', 'closed', 'rejected')`
        )
      );

    // Fetch all insurer-domain users for name resolution
    const allUsers = await db
      .select({ id: users.id, name: users.name, insurerRole: users.insurerRole })
      .from(users)
      .where(eq(users.tenantId, ctx.insurerTenantId));

    const userMap = new Map<number, string>();
    for (const u of allUsers) {
      userMap.set(u.id, u.name ?? `User #${u.id}`);
    }

    // Aggregate by processor
    const processorMap = new Map<string, { name: string; count: number; oldestCreatedAt: string | null }>();
    // Aggregate by assessor
    const assessorMap = new Map<number, { name: string; count: number; oldestCreatedAt: string | null }>();

    for (const c of activeClaims) {
      if (c.assignedProcessorId) {
        const pid = c.assignedProcessorId;
        const userId = parseInt(pid, 10);
        const name = userMap.get(userId) ?? `Processor #${pid}`;
        const existing = processorMap.get(pid);
        if (!existing) {
          processorMap.set(pid, { name, count: 1, oldestCreatedAt: c.createdAt ?? null });
        } else {
          existing.count++;
          if (c.createdAt && (!existing.oldestCreatedAt || c.createdAt < existing.oldestCreatedAt)) {
            existing.oldestCreatedAt = c.createdAt;
          }
        }
      }
      if (c.assignedAssessorId) {
        const aid = c.assignedAssessorId;
        const name = userMap.get(aid) ?? `Assessor #${aid}`;
        const existing = assessorMap.get(aid);
        if (!existing) {
          assessorMap.set(aid, { name, count: 1, oldestCreatedAt: c.createdAt ?? null });
        } else {
          existing.count++;
          if (c.createdAt && (!existing.oldestCreatedAt || c.createdAt < existing.oldestCreatedAt)) {
            existing.oldestCreatedAt = c.createdAt;
          }
        }
      }
    }

    const processors = Array.from(processorMap.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        activeCount: v.count,
        oldestDaysAgo: v.oldestCreatedAt ? daysSince(v.oldestCreatedAt) : 0,
      }))
      .sort((a, b) => b.activeCount - a.activeCount);

    const assessors = Array.from(assessorMap.entries())
      .map(([id, v]) => ({
        id: String(id),
        name: v.name,
        activeCount: v.count,
        oldestDaysAgo: v.oldestCreatedAt ? daysSince(v.oldestCreatedAt) : 0,
      }))
      .sort((a, b) => b.activeCount - a.activeCount);

    return { processors, assessors, totalActive: activeClaims.length };
  }),

  /**
   * Send-Back Analytics
   *
   * Returns send-back frequency, top rework reasons, and top rework-generating users.
   * Source: workflow_audit_trail table. Identifies backward workflow transitions.
   */
  getSendBackAnalytics: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Send-backs are backward transitions
    const sendBackRows = await db
      .select({
        id: workflowAuditTrail.id,
        claimId: workflowAuditTrail.claimId,
        userId: workflowAuditTrail.userId,
        userRole: workflowAuditTrail.userRole,
        previousState: workflowAuditTrail.previousState,
        newState: workflowAuditTrail.newState,
        comments: workflowAuditTrail.comments,
        createdAt: workflowAuditTrail.createdAt,
      })
      .from(workflowAuditTrail)
      .innerJoin(claims, eq(workflowAuditTrail.claimId, claims.id))
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          sql`(
            (${workflowAuditTrail.previousState} = 'financial_decision' AND ${workflowAuditTrail.newState} = 'technical_approval') OR
            (${workflowAuditTrail.previousState} = 'technical_approval' AND ${workflowAuditTrail.newState} = 'internal_review') OR
            (${workflowAuditTrail.previousState} = 'internal_review' AND ${workflowAuditTrail.newState} = 'assigned') OR
            (${workflowAuditTrail.previousState} = 'internal_review' AND ${workflowAuditTrail.newState} = 'intake_verified')
          )`
        )
      )
      .orderBy(desc(workflowAuditTrail.createdAt))
      .limit(500);

    const reasonMap: Record<string, number> = {};
    const userReworkMap: Record<string, { userId: number; role: string; count: number }> = {};
    const transitionMap: Record<string, number> = {};

    for (const row of sendBackRows) {
      const transKey = `${row.previousState} → ${row.newState}`;
      transitionMap[transKey] = (transitionMap[transKey] ?? 0) + 1;
      if (row.comments) {
        const reason = row.comments.slice(0, 60).trim();
        reasonMap[reason] = (reasonMap[reason] ?? 0) + 1;
      }
      const userKey = `${row.userId}_${row.userRole}`;
      if (!userReworkMap[userKey]) {
        userReworkMap[userKey] = { userId: row.userId, role: row.userRole, count: 0 };
      }
      userReworkMap[userKey].count++;
    }

    const topTransitions = Object.entries(transitionMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([transition, cnt]) => ({ transition, count: cnt }));
    const topReasons = Object.entries(reasonMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([reason, cnt]) => ({ reason, count: cnt }));
    const topReworkUsers = Object.values(userReworkMap)
      .sort((a, b) => b.count - a.count).slice(0, 5);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const recentSendBacks = sendBackRows.filter(r => (r.createdAt ?? "") >= thirtyDaysAgo);

    return {
      totalSendBacks: sendBackRows.length,
      last30DaysSendBacks: recentSendBacks.length,
      topTransitions,
      topReasons,
      topReworkUsers,
    };
  }),
});
