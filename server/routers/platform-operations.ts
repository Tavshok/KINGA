/**
 * Platform Operations Centre Router — Epic 5-C
 *
 * Aggregates operational monitoring data from existing tables for Platform Admins.
 * No new tables — reads from:
 *   pipeline_jobs, generated_reports, governance_violation_log,
 *   insurance_audit_logs, ingestion_batches, claims, fraud_alerts, users
 *
 * Access: platform_super_admin role only (read-only).
 */

import { router } from "../_core/trpc";
import { platformSuperAdminProcedure } from "../_core/platform-super-admin-guard";
import { getDb } from "../db";
import {
  pipelineJobs,
  generatedReports,
  governanceViolationLog,
  insuranceAuditLogs,
  ingestionBatches,
  claims,
  fraudAlerts,
  users,
} from "../../drizzle/schema";
import { sql, eq, gte, desc, and, count, isNotNull } from "drizzle-orm";
import { z } from "zod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ISO timestamp for N hours ago */
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

/** ISO timestamp for N days ago */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const platformOperationsRouter = router({

  /**
   * Background Jobs & Queue Health
   * Reads pipeline_jobs and ingestion_batches.
   */
  getJobsOverview: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [jobStats] = await db
      .select({
        total: count(),
        pending: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'pending' THEN 1 ELSE 0 END)`,
        running: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'running' THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
        skipped: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'skipped' THEN 1 ELSE 0 END)`,
        last24h: sql<number>`SUM(CASE WHEN ${pipelineJobs.startedAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
      })
      .from(pipelineJobs);

    const recentFailed = await db
      .select({
        id: pipelineJobs.id,
        claimId: pipelineJobs.claimId,
        stageId: pipelineJobs.stageId,
        startedAt: pipelineJobs.startedAt,
        completedAt: pipelineJobs.completedAt,
      })
      .from(pipelineJobs)
      .where(
        and(
          eq(pipelineJobs.status, "failed"),
          gte(pipelineJobs.startedAt, hoursAgo(48))
        )
      )
      .orderBy(desc(pipelineJobs.startedAt))
      .limit(20);

    const [queueStats] = await db
      .select({
        total: count(),
        pending: sql<number>`SUM(CASE WHEN ${ingestionBatches.status} = 'pending' THEN 1 ELSE 0 END)`,
        processing: sql<number>`SUM(CASE WHEN ${ingestionBatches.status} = 'processing' THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${ingestionBatches.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${ingestionBatches.status} = 'failed' THEN 1 ELSE 0 END)`,
        totalDocs: sql<number>`SUM(${ingestionBatches.totalDocuments})`,
        processedDocs: sql<number>`SUM(${ingestionBatches.processedDocuments})`,
        failedDocs: sql<number>`SUM(${ingestionBatches.failedDocuments})`,
      })
      .from(ingestionBatches);

    return { jobStats, recentFailed, queueStats };
  }),

  /**
   * AI Processing Stats
   * Reads pipeline_jobs by stage to show AI stage throughput.
   */
  getAiProcessingStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const stageStats = await db
      .select({
        stageId: pipelineJobs.stageId,
        total: count(),
        completed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
        running: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'running' THEN 1 ELSE 0 END)`,
      })
      .from(pipelineJobs)
      .where(gte(pipelineJobs.startedAt, daysAgo(7)))
      .groupBy(pipelineJobs.stageId)
      .orderBy(pipelineJobs.stageId);

    const [last24h] = await db
      .select({
        processed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(pipelineJobs)
      .where(gte(pipelineJobs.startedAt, hoursAgo(24)));

    return { stageStats, last24h };
  }),

  /**
   * Report Generation Stats
   * Reads generated_reports.
   */
  getReportStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [summary] = await db
      .select({
        total: count(),
        ready: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'ready' THEN 1 ELSE 0 END)`,
        generating: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'generating' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'failed' THEN 1 ELSE 0 END)`,
        last24h: sql<number>`SUM(CASE WHEN ${generatedReports.createdAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
        totalSizeBytes: sql<number>`SUM(${generatedReports.fileSizeBytes})`,
      })
      .from(generatedReports);

    const byType = await db
      .select({
        reportType: generatedReports.reportType,
        total: count(),
        failed: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(generatedReports)
      .where(gte(generatedReports.createdAt, daysAgo(30)))
      .groupBy(generatedReports.reportType)
      .orderBy(desc(count()));

    const recentFailed = await db
      .select({
        id: generatedReports.id,
        reportType: generatedReports.reportType,
        errorMessage: generatedReports.errorMessage,
        createdAt: generatedReports.createdAt,
      })
      .from(generatedReports)
      .where(
        and(
          eq(generatedReports.status, "failed"),
          gte(generatedReports.createdAt, daysAgo(7))
        )
      )
      .orderBy(desc(generatedReports.createdAt))
      .limit(10);

    return { summary, byType, recentFailed };
  }),

  /**
   * Workflow Execution Stats
   * Reads claims by workflow_state.
   */
  getWorkflowStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const byState = await db
      .select({
        workflowState: claims.workflowState,
        total: count(),
      })
      .from(claims)
      .groupBy(claims.workflowState)
      .orderBy(desc(count()));

    const [totals] = await db
      .select({
        total: count(),
        last24h: sql<number>`SUM(CASE WHEN ${claims.createdAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
        last7d: sql<number>`SUM(CASE WHEN ${claims.createdAt} >= ${daysAgo(7)} THEN 1 ELSE 0 END)`,
      })
      .from(claims);

    return { byState, totals };
  }),

  /**
   * Active Users
   * Reads users table — counts by role and recent activity.
   */
  getActiveUsers: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const byRole = await db
      .select({
        role: users.role,
        total: count(),
      })
      .from(users)
      .groupBy(users.role)
      .orderBy(desc(count()));

    const [totals] = await db
      .select({
        total: count(),
        withEmail: sql<number>`SUM(CASE WHEN ${users.email} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(users);

    // Recent audit activity as proxy for active users (last 24h)
    const [recentActivity] = await db
      .select({
        activeUsers: sql<number>`COUNT(DISTINCT ${insuranceAuditLogs.userId})`,
        totalActions: count(),
      })
      .from(insuranceAuditLogs)
      .where(gte(insuranceAuditLogs.timestamp, hoursAgo(24)));

    return { byRole, totals, recentActivity };
  }),

  /**
   * Governance Violations
   * Reads governance_violation_log.
   */
  getGovernanceStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [summary] = await db
      .select({
        total: count(),
        last24h: sql<number>`SUM(CASE WHEN ${governanceViolationLog.violatedAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
        last7d: sql<number>`SUM(CASE WHEN ${governanceViolationLog.violatedAt} >= ${daysAgo(7)} THEN 1 ELSE 0 END)`,
      })
      .from(governanceViolationLog);

    const byType = await db
      .select({
        violationType: governanceViolationLog.violationType,
        total: count(),
      })
      .from(governanceViolationLog)
      .where(gte(governanceViolationLog.violatedAt, daysAgo(30)))
      .groupBy(governanceViolationLog.violationType)
      .orderBy(desc(count()));

    const recent = await db
      .select({
        id: governanceViolationLog.id,
        tenantId: governanceViolationLog.tenantId,
        userRole: governanceViolationLog.userRole,
        violationType: governanceViolationLog.violationType,
        reason: governanceViolationLog.reason,
        violatedAt: governanceViolationLog.violatedAt,
      })
      .from(governanceViolationLog)
      .orderBy(desc(governanceViolationLog.violatedAt))
      .limit(20);

    return { summary, byType, recent };
  }),

  /**
   * Audit Statistics
   * Reads insurance_audit_logs.
   */
  getAuditStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [summary] = await db
      .select({
        total: count(),
        last24h: sql<number>`SUM(CASE WHEN ${insuranceAuditLogs.timestamp} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
        last7d: sql<number>`SUM(CASE WHEN ${insuranceAuditLogs.timestamp} >= ${daysAgo(7)} THEN 1 ELSE 0 END)`,
        uniqueUsers: sql<number>`COUNT(DISTINCT ${insuranceAuditLogs.userId})`,
      })
      .from(insuranceAuditLogs);

    const byAction = await db
      .select({
        action: insuranceAuditLogs.action,
        total: count(),
      })
      .from(insuranceAuditLogs)
      .where(gte(insuranceAuditLogs.timestamp, daysAgo(7)))
      .groupBy(insuranceAuditLogs.action)
      .orderBy(desc(count()))
      .limit(15);

    const recent = await db
      .select({
        id: insuranceAuditLogs.id,
        userId: insuranceAuditLogs.userId,
        userRole: insuranceAuditLogs.userRole,
        action: insuranceAuditLogs.action,
        entityType: insuranceAuditLogs.entityType,
        entityId: insuranceAuditLogs.entityId,
        tenantId: insuranceAuditLogs.tenantId,
        timestamp: insuranceAuditLogs.timestamp,
      })
      .from(insuranceAuditLogs)
      .orderBy(desc(insuranceAuditLogs.timestamp))
      .limit(30);

    return { summary, byAction, recent };
  }),

  /**
   * Storage Stats
   * Reads generated_reports for storage usage proxy.
   */
  getStorageStats: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [reportStorage] = await db
      .select({
        totalReports: count(),
        totalBytes: sql<number>`SUM(${generatedReports.fileSizeBytes})`,
        avgBytes: sql<number>`AVG(${generatedReports.fileSizeBytes})`,
        maxBytes: sql<number>`MAX(${generatedReports.fileSizeBytes})`,
        reportsWithSize: sql<number>`SUM(CASE WHEN ${generatedReports.fileSizeBytes} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(generatedReports);

    const byReportType = await db
      .select({
        reportType: generatedReports.reportType,
        count: count(),
        totalBytes: sql<number>`SUM(${generatedReports.fileSizeBytes})`,
      })
      .from(generatedReports)
      .where(isNotNull(generatedReports.fileSizeBytes))
      .groupBy(generatedReports.reportType)
      .orderBy(desc(sql`SUM(${generatedReports.fileSizeBytes})`));

    return { reportStorage, byReportType };
  }),

  /**
   * Full Operations Summary
   * Combines all panels into a single query for the overview strip.
   */
  getOperationsSummary: platformSuperAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [jobs] = await db
      .select({
        running: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'running' THEN 1 ELSE 0 END)`,
        failed24h: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'failed' AND ${pipelineJobs.startedAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN ${pipelineJobs.status} = 'pending' THEN 1 ELSE 0 END)`,
      })
      .from(pipelineJobs);

    const [reports] = await db
      .select({
        generating: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'generating' THEN 1 ELSE 0 END)`,
        failed24h: sql<number>`SUM(CASE WHEN ${generatedReports.status} = 'failed' AND ${generatedReports.createdAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
      })
      .from(generatedReports);

    const [governance] = await db
      .select({
        violations24h: sql<number>`SUM(CASE WHEN ${governanceViolationLog.violatedAt} >= ${hoursAgo(24)} THEN 1 ELSE 0 END)`,
      })
      .from(governanceViolationLog);

    const [auditActivity] = await db
      .select({
        actions24h: count(),
        activeUsers: sql<number>`COUNT(DISTINCT ${insuranceAuditLogs.userId})`,
      })
      .from(insuranceAuditLogs)
      .where(gte(insuranceAuditLogs.timestamp, hoursAgo(24)));

    const [claimTotals] = await db
      .select({
        total: count(),
        inProgress: sql<number>`SUM(CASE WHEN ${claims.workflowState} NOT IN ('closed','completed','rejected') THEN 1 ELSE 0 END)`,
      })
      .from(claims);

    const [userTotals] = await db
      .select({ total: count() })
      .from(users);

    return {
      jobs: {
        running: Number(jobs?.running ?? 0),
        failed24h: Number(jobs?.failed24h ?? 0),
        pending: Number(jobs?.pending ?? 0),
      },
      reports: {
        generating: Number(reports?.generating ?? 0),
        failed24h: Number(reports?.failed24h ?? 0),
      },
      governance: {
        violations24h: Number(governance?.violations24h ?? 0),
      },
      audit: {
        actions24h: Number(auditActivity?.actions24h ?? 0),
        activeUsers: Number(auditActivity?.activeUsers ?? 0),
      },
      claims: {
        total: Number(claimTotals?.total ?? 0),
        inProgress: Number(claimTotals?.inProgress ?? 0),
      },
      users: {
        total: Number(userTotals?.total ?? 0),
      },
    };
  }),
});
