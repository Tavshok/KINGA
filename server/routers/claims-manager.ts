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
import { claims, workflowAuditTrail } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, inArray, sql, count, avg } from "drizzle-orm";
import { z } from "zod";

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
  getAttentionRequired: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const now = Date.now();
    const oneDayMs = 86400000;

    // Fetch all active claims for the tenant
    const activeClaims = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        workflowState: claims.workflowState,
        status: claims.status,
        fraudRiskLevel: claims.fraudRiskLevel,
        fraudRiskScore: claims.fraudRiskScore,
        totalClaimAmount: (claims as any).totalClaimAmount,
        estimatedClaimValue: claims.estimatedClaimValue,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        technicallyApprovedAt: claims.technicallyApprovedAt,
        financiallyApprovedAt: claims.financiallyApprovedAt,
        priority: claims.priority,
        vehicleRegistration: claims.vehicleRegistration,
        claimantName: (claims as any).claimantName,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          // Exclude terminal states
          sql`${claims.workflowState} NOT IN ('closed', 'rejected', 'archived')`
        )
      )
      .orderBy(desc(claims.createdAt))
      .limit(1000);

    // Rule 1: High Value Pending (> $25,000 = 2,500,000 cents)
    const highValueThreshold = 2500000;
    const highValuePending = activeClaims.filter(c =>
      (c.totalClaimAmount ?? 0) > highValueThreshold &&
      !["closed", "rejected"].includes(c.status ?? "")
    );

    // Rule 2: High Fraud Risk Active
    const highFraudActive = activeClaims.filter(c =>
      c.fraudRiskLevel === "high" || (c.fraudRiskLevel as string) === "critical"
    );

    // Rule 3: Stuck > 7 days in same state
    // Threshold: 7 calendar days since last updatedAt (or createdAt if never updated).
    // This is intentionally separate from the SLA chip (72h from createdAt) — the chip
    // measures total claim age; "stuck" measures inactivity within the current state.
    // Rationale: a claim can be within SLA but still stuck if it was submitted late and
    // never progressed. The 7-day inactivity threshold is the agreed operations standard.
    const stuckClaims = activeClaims.filter(c => {
      const age = daysSince(c.updatedAt ?? c.createdAt);
      return age > 7;
    });

    // Rule 4: SLA Breach (in stage longer than threshold)
    const slaBreachClaims = activeClaims.filter(c => {
      const stage = c.workflowState ?? "";
      const threshold = SLA_THRESHOLDS_DAYS[stage] ?? 5;
      const age = daysSince(c.createdAt);
      return age > threshold;
    });

    // Rule 5: Awaiting Technical Approval > 2 days
    const awaitingTechApproval = activeClaims.filter(c =>
      c.workflowState === "technical_approval" &&
      daysSince(c.createdAt) > 2
    );

    // Rule 6: Awaiting Financial Decision > 2 days
    const awaitingFinancialDecision = activeClaims.filter(c =>
      c.workflowState === "financial_decision" &&
      daysSince(c.createdAt) > 2
    );

    // Rule 7: Escalated (disputed or manual_review)
    const escalatedClaims = activeClaims.filter(c =>
      c.workflowState === "disputed" || c.workflowState === "manual_review"
    );

    const summarise = (arr: typeof activeClaims) => ({
      count: arr.length,
      topClaims: arr.slice(0, 5).map(c => ({
        id: c.id,
        claimNumber: c.claimNumber,
        workflowState: c.workflowState,
        ageDays: daysSince(c.createdAt),
        amount: c.totalClaimAmount,
        fraudRiskLevel: c.fraudRiskLevel,
        claimantName: c.claimantName,
        vehicleRegistration: c.vehicleRegistration,
      })),
    });

    return {
      highValuePending: summarise(highValuePending),
      highFraudActive: summarise(highFraudActive),
      stuckClaims: summarise(stuckClaims),
      slaBreaches: summarise(slaBreachClaims),
      awaitingTechApproval: summarise(awaitingTechApproval),
      awaitingFinancialDecision: summarise(awaitingFinancialDecision),
      escalatedClaims: summarise(escalatedClaims),
      totalAttentionRequired: new Set([
        ...highValuePending.map(c => c.id),
        ...highFraudActive.map(c => c.id),
        ...stuckClaims.map(c => c.id),
        ...slaBreachClaims.map(c => c.id),
        ...awaitingTechApproval.map(c => c.id),
        ...awaitingFinancialDecision.map(c => c.id),
        ...escalatedClaims.map(c => c.id),
      ]).size,
    };
  }),

  /**
   * Approval Workbench Metrics
   *
   * Returns counts and average ages for claims at approval stages.
   * Source: claims table, workflowState + technicallyApprovedAt fields.
   */
  getApprovalWorkbenchMetrics: insurerDomainProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const approvalClaims = await db
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        workflowState: claims.workflowState,
        totalClaimAmount: (claims as any).totalClaimAmount,
        estimatedClaimValue: claims.estimatedClaimValue,
        fraudRiskLevel: claims.fraudRiskLevel,
        fraudRiskScore: claims.fraudRiskScore,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        technicallyApprovedAt: claims.technicallyApprovedAt,
        financiallyApprovedAt: claims.financiallyApprovedAt,
        claimantName: (claims as any).claimantName,
        vehicleRegistration: claims.vehicleRegistration,
        priority: claims.priority,
      })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, ctx.insurerTenantId),
          inArray(claims.workflowState, ["technical_approval", "financial_decision"] as any[])
        )
      )
      .orderBy(desc((claims as any).totalClaimAmount));

    const techApproval = approvalClaims.filter(c => c.workflowState === "technical_approval");
    const financialDecision = approvalClaims.filter(c => c.workflowState === "financial_decision");

    const avgAge = (arr: typeof approvalClaims) => arr.length > 0
      ? Math.round(arr.reduce((sum, c) => sum + daysSince(c.createdAt), 0) / arr.length)
      : 0;

    const highValueThreshold = 2500000;
    const highValuePending = approvalClaims.filter(c => (c.totalClaimAmount ?? 0) > highValueThreshold);

    const oldestApproval = approvalClaims.reduce((oldest, c) => {
      const age = daysSince(c.createdAt);
      return age > oldest.age ? { age, claimNumber: c.claimNumber } : oldest;
    }, { age: 0, claimNumber: null as string | null });

    return {
      techApproval: {
        count: techApproval.length,
        avgAgeDays: avgAge(techApproval),
        topClaims: techApproval.slice(0, 5).map(c => ({
          id: c.id,
          claimNumber: c.claimNumber,
          ageDays: daysSince(c.createdAt),
          amount: c.totalClaimAmount,
          fraudRiskLevel: c.fraudRiskLevel,
          priority: c.priority,
        })),
      },
      financialDecision: {
        count: financialDecision.length,
        avgAgeDays: avgAge(financialDecision),
        topClaims: financialDecision.slice(0, 5).map(c => ({
          id: c.id,
          claimNumber: c.claimNumber,
          ageDays: daysSince(c.createdAt),
          amount: c.totalClaimAmount,
          fraudRiskLevel: c.fraudRiskLevel,
          priority: c.priority,
        })),
      },
      highValuePending: {
        count: highValuePending.length,
        totalAmount: highValuePending.reduce((sum, c) => sum + (c.totalClaimAmount ?? 0), 0),
      },
      oldestApproval: oldestApproval.age > 0 ? oldestApproval : null,
      totalPendingApproval: approvalClaims.length,
      avgApprovalAgeDays: avgAge(approvalClaims),
    };
  }),

  /**
   * Capacity Forecast
   *
   * Returns 7-day intake vs completion trend and a backlog trajectory indicator.
   * Source: claims table, createdAt and updatedAt fields.
   * Zero schema changes required.
   */
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
