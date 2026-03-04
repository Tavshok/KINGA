// @ts-nocheck
/**
 * Fast-Track Analytics Service
 * Executive dashboard analytics for fast-track performance metrics
 * 
 * Uses auditTrail + routingLog tables to avoid status field reliance
 * All queries optimized to prevent N+1 issues
 */

import { eq, and, gte, lte, count, avg, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  fastTrackRoutingLog,
  workflowAuditTrail,
  routingHistory,
} from "../../drizzle/schema";

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FastTrackRateMetrics {
  totalClaims: number;
  eligibleClaims: number;
  fastTrackedClaims: number;
  fastTrackRate: number; // Percentage
}

export interface AutoApprovalMetrics {
  totalFastTracked: number;
  autoApproved: number;
  autoApprovalRate: number; // Percentage
}

export interface ProcessingTimeMetrics {
  fastTrackAvgHours: number;
  normalAvgHours: number;
  timeSavings: number; // Percentage
  timeSavingsHours: number;
}

export interface ExecutiveOverrideMetrics {
  totalAutoApprovals: number;
  overrideCount: number;
  overrideRate: number; // Percentage
}

export interface RiskDistribution {
  lowRisk: number; // 0-30
  mediumRisk: number; // 31-70
  highRisk: number; // 71-100
}

/**
 * Calculate fast-track rate (% of eligible claims)
 * Uses routing_history table to count eligible vs fast-tracked claims
 */
export async function calculateFastTrackRate(
  tenantId: string,
  dateRange: DateRange
): Promise<FastTrackRateMetrics> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Count total routing decisions (all claims evaluated)
  const [totalResult] = await db
    .select({ count: count() })
    .from(routingHistory)
    .where(
      and(
        eq(routingHistory.tenantId, tenantId),
        gte(routingHistory.timestamp, dateRange.startDate),
        lte(routingHistory.timestamp, dateRange.endDate)
      )
    );

  const totalClaims = Number(totalResult?.count || 0);

  // Count eligible claims (HIGH routing category)
  const [eligibleResult] = await db
    .select({ count: count() })
    .from(routingHistory)
    .where(
      and(
        eq(routingHistory.tenantId, tenantId),
        eq(routingHistory.routingCategory, "HIGH"),
        gte(routingHistory.timestamp, dateRange.startDate),
        lte(routingHistory.timestamp, dateRange.endDate)
      )
    );

  const eligibleClaims = Number(eligibleResult?.count || 0);

  // Count fast-tracked claims (from fast_track_routing_log)
  const [fastTrackedResult] = await db
    .select({ count: count() })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.eligible, true),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );

  const fastTrackedClaims = Number(fastTrackedResult?.count || 0);

  return {
    totalClaims,
    eligibleClaims,
    fastTrackedClaims,
    fastTrackRate: eligibleClaims > 0 ? (fastTrackedClaims / eligibleClaims) * 100 : 0,
  };
}

/**
 * Calculate auto-approval rate
 * Uses fast_track_routing_log to count AUTO_APPROVE decisions
 */
export async function calculateAutoApprovalRate(
  tenantId: string,
  dateRange: DateRange
): Promise<AutoApprovalMetrics> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Count total fast-tracked claims
  const [totalResult] = await db
    .select({ count: count() })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.eligible, true),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );

  const totalFastTracked = Number(totalResult?.count || 0);

  // Count auto-approved claims
  const [autoApprovedResult] = await db
    .select({ count: count() })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.decision, "AUTO_APPROVE"),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );

  const autoApproved = Number(autoApprovedResult?.count || 0);

  return {
    totalFastTracked,
    autoApproved,
    autoApprovalRate: totalFastTracked > 0 ? (autoApproved / totalFastTracked) * 100 : 0,
  };
}

/**
 * Calculate average processing time (fast-track vs normal)
 * Uses workflow_audit_trail to calculate time between state transitions
 */
export async function calculateProcessingTime(
  tenantId: string,
  dateRange: DateRange
): Promise<ProcessingTimeMetrics> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Calculate average processing time for fast-tracked claims
  // Use workflow audit trail to find time from submission to financial_decision
  const fastTrackTimes = await db
    .select({
      claimId: workflowAuditTrail.claimId,
      minTime: sql<Date>`MIN(${workflowAuditTrail.createdAt})`.as("minTime"),
      maxTime: sql<Date>`MAX(${workflowAuditTrail.createdAt})`.as("maxTime"),
    })
    .from(workflowAuditTrail)
    .innerJoin(
      fastTrackRoutingLog,
      eq(workflowAuditTrail.claimId, fastTrackRoutingLog.claimId)
    )
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.eligible, true),
        gte(workflowAuditTrail.createdAt, dateRange.startDate),
        lte(workflowAuditTrail.createdAt, dateRange.endDate)
      )
    )
    .groupBy(workflowAuditTrail.claimId);

  // Calculate average hours for fast-track
  const fastTrackAvgMs =
    fastTrackTimes.length > 0
      ? fastTrackTimes.reduce((sum, item) => {
          const minTime = new Date(item.minTime).getTime();
          const maxTime = new Date(item.maxTime).getTime();
          return sum + (maxTime - minTime);
        }, 0) / fastTrackTimes.length
      : 0;

  const fastTrackAvgHours = fastTrackAvgMs / (1000 * 60 * 60);

  // Calculate average processing time for normal claims (not fast-tracked)
  const normalTimes = await db
    .select({
      claimId: workflowAuditTrail.claimId,
      minTime: sql<Date>`MIN(${workflowAuditTrail.createdAt})`.as("minTime"),
      maxTime: sql<Date>`MAX(${workflowAuditTrail.createdAt})`.as("maxTime"),
    })
    .from(workflowAuditTrail)
    .leftJoin(
      fastTrackRoutingLog,
      eq(workflowAuditTrail.claimId, fastTrackRoutingLog.claimId)
    )
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        sql`${fastTrackRoutingLog.id} IS NULL`, // Not in fast-track log
        gte(workflowAuditTrail.createdAt, dateRange.startDate),
        lte(workflowAuditTrail.createdAt, dateRange.endDate)
      )
    )
    .groupBy(workflowAuditTrail.claimId);

  // Calculate average hours for normal claims
  const normalAvgMs =
    normalTimes.length > 0
      ? normalTimes.reduce((sum, item) => {
          const minTime = new Date(item.minTime).getTime();
          const maxTime = new Date(item.maxTime).getTime();
          return sum + (maxTime - minTime);
        }, 0) / normalTimes.length
      : 0;

  const normalAvgHours = normalAvgMs / (1000 * 60 * 60);

  return {
    fastTrackAvgHours,
    normalAvgHours,
    timeSavings: normalAvgHours > 0 ? ((normalAvgHours - fastTrackAvgHours) / normalAvgHours) * 100 : 0,
    timeSavingsHours: normalAvgHours - fastTrackAvgHours,
  };
}

/**
 * Calculate executive override frequency
 * Uses workflow_audit_trail to find manual overrides of auto-approvals
 */
export async function calculateExecutiveOverrides(
  tenantId: string,
  dateRange: DateRange
): Promise<ExecutiveOverrideMetrics> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Count total auto-approvals
  const [totalResult] = await db
    .select({ count: count() })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.decision, "AUTO_APPROVE"),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );

  const totalAutoApprovals = Number(totalResult?.count || 0);

  // Count overrides directly from fast_track_routing_log (override flag set on the log entry)
  const [overrideResult] = await db
    .select({ count: count() })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.decision, "AUTO_APPROVE"),
        eq(fastTrackRoutingLog.override, 1),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );
  const overrideCount = Number(overrideResult?.count || 0);;

  return {
    totalAutoApprovals,
    overrideCount,
    overrideRate: totalAutoApprovals > 0 ? (overrideCount / totalAutoApprovals) * 100 : 0,
  };
}

/**
 * Calculate risk distribution of fast-tracked claims
 * Uses routing_history to analyze fraud scores
 */
export async function calculateRiskDistribution(
  tenantId: string,
  dateRange: DateRange
): Promise<RiskDistribution> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Get all fast-tracked claims with their fraud scores
  const fastTrackedClaims = await db
    .select({
      fraudScore: fastTrackRoutingLog.fraudScore,
    })
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.tenantId, tenantId),
        eq(fastTrackRoutingLog.eligible, true),
        gte(fastTrackRoutingLog.evaluatedAt, dateRange.startDate),
        lte(fastTrackRoutingLog.evaluatedAt, dateRange.endDate)
      )
    );

  // Categorize by risk level
  const distribution: RiskDistribution = {
    lowRisk: 0,
    mediumRisk: 0,
    highRisk: 0,
  };

  for (const claim of fastTrackedClaims) {
    const fraudScore = Number(claim.fraudScore || 0);

    if (fraudScore <= 30) {
      distribution.lowRisk++;
    } else if (fraudScore <= 70) {
      distribution.mediumRisk++;
    } else {
      distribution.highRisk++;
    }
  }

  return distribution;
}

/**
 * Get comprehensive fast-track analytics dashboard
 */
export async function getFastTrackDashboard(
  tenantId: string,
  dateRange: DateRange
) {
  const [
    fastTrackRate,
    autoApprovalRate,
    processingTime,
    executiveOverrides,
    riskDistribution,
  ] = await Promise.all([
    calculateFastTrackRate(tenantId, dateRange),
    calculateAutoApprovalRate(tenantId, dateRange),
    calculateProcessingTime(tenantId, dateRange),
    calculateExecutiveOverrides(tenantId, dateRange),
    calculateRiskDistribution(tenantId, dateRange),
  ]);

  return {
    fastTrackRate,
    autoApprovalRate,
    processingTime,
    executiveOverrides,
    riskDistribution,
    dateRange,
  };
}
