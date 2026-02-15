/**
 * Automation Audit Logging
 * 
 * Comprehensive audit trail for confidence-governed automation framework.
 * Tracks confidence scores, routing decisions, policy application, cost variances,
 * and overrides for regulatory compliance and performance analysis.
 * 
 * Uses schema-derived types for field name accuracy.
 */

import { getDb } from "./db";
import {
  automationAuditLog,
  type AutomationAuditLog,
  type InsertAutomationAuditLog,
} from "../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface AuditLogContext {
  claimId: number;
  tenantId: string;
  confidenceScoreId: number;
  compositeConfidenceScore: number;
  routingDecisionId: number;
  routedWorkflow: "ai_only" | "hybrid" | "manual";
  routingReason: string;
  automationPolicyId: number;
  policySnapshot: Record<string, unknown>;
  aiEstimatedCost: number;
}

/**
 * Create audit log entry for automation decision
 */
export async function logAutomationDecision(context: AuditLogContext): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const insertData: InsertAutomationAuditLog = {
    claimId: context.claimId,
    tenantId: context.tenantId,
    confidenceScoreId: context.confidenceScoreId,
    compositeConfidenceScore: context.compositeConfidenceScore.toString(),
    routingDecisionId: context.routingDecisionId,
    routedWorkflow: context.routedWorkflow,
    routingReason: context.routingReason,
    automationPolicyId: context.automationPolicyId,
    policySnapshot: context.policySnapshot,
    aiEstimatedCost: context.aiEstimatedCost,
    decisionMadeAt: new Date(),
    wasOverridden: false,
  };
  
  const result = await db.insert(automationAuditLog).values(insertData);
  
  const auditId = Number((result as unknown as { insertId: string | number }).insertId);
  console.log(`[Automation Audit] Logged decision for claim ${context.claimId} (audit ${auditId})`);
  
  return auditId;
}

/**
 * Update audit log with assessor-adjusted cost
 */
export async function logAssessorAdjustment(
  claimId: number,
  assessorAdjustedCost: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(automationAuditLog)
    .set({
      assessorAdjustedCost,
    })
    .where(eq(automationAuditLog.claimId, claimId));
  
  console.log(`[Automation Audit] Logged assessor adjustment for claim ${claimId}: $${assessorAdjustedCost}`);
}

/**
 * Update audit log with final approved cost and variance
 */
export async function logFinalApproval(
  claimId: number,
  finalApprovedCost: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // Get the audit log entry to calculate variance
  const logs = await db
    .select()
    .from(automationAuditLog)
    .where(eq(automationAuditLog.claimId, claimId))
    .limit(1);
  
  if (logs.length === 0) {
    console.warn(`[Automation Audit] No audit log found for claim ${claimId}`);
    return;
  }
  
  const log = logs[0];
  const aiCost = Number(log.aiEstimatedCost);
  const variance = ((finalApprovedCost - aiCost) / aiCost) * 100;
  
  await db
    .update(automationAuditLog)
    .set({
      finalApprovedCost,
      costVarianceAiVsFinal: variance.toFixed(2),
      claimApprovedAt: new Date(),
    })
    .where(eq(automationAuditLog.claimId, claimId));
  
  console.log(`[Automation Audit] Logged final approval for claim ${claimId}: $${finalApprovedCost} (variance: ${variance.toFixed(1)}%)`);
}

/**
 * Update audit log when claim is rejected
 */
export async function logClaimRejection(claimId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(automationAuditLog)
    .set({
      claimRejectedAt: new Date(),
    })
    .where(eq(automationAuditLog.claimId, claimId));
  
  console.log(`[Automation Audit] Logged claim rejection for claim ${claimId}`);
}

/**
 * Update audit log when routing decision is overridden
 */
export async function logRoutingOverride(
  claimId: number,
  overrideReason: string,
  overriddenByUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(automationAuditLog)
    .set({
      wasOverridden: true,
      overrideReason,
      overriddenByUserId,
    })
    .where(eq(automationAuditLog.claimId, claimId));
  
  console.log(`[Automation Audit] Logged routing override for claim ${claimId} by user ${overriddenByUserId}`);
}

/**
 * Get audit log for a specific claim
 */
export async function getClaimAuditLog(claimId: number): Promise<AutomationAuditLog | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const logs = await db
    .select()
    .from(automationAuditLog)
    .where(eq(automationAuditLog.claimId, claimId))
    .limit(1);
  
  return logs.length > 0 ? logs[0] : null;
}

/**
 * Get audit logs for a tenant within a date range
 */
export async function getTenantAuditLogs(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<AutomationAuditLog[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const logs = await db
    .select()
    .from(automationAuditLog)
    .where(and(
      eq(automationAuditLog.tenantId, tenantId),
      gte(automationAuditLog.decisionMadeAt, startDate),
      lte(automationAuditLog.decisionMadeAt, endDate)
    ))
    .orderBy(desc(automationAuditLog.decisionMadeAt));
  
  return logs;
}

/**
 * Get automation performance metrics for a tenant
 */
export async function getAutomationPerformanceMetrics(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalDecisions: number;
  aiOnlyCount: number;
  hybridCount: number;
  manualCount: number;
  overrideCount: number;
  averageConfidenceScore: number;
  averageCostVariance: number;
  aiOnlyAccuracy: number; // % of AI-only decisions within ±10% variance
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const logs = await getTenantAuditLogs(tenantId, startDate, endDate);
  
  if (logs.length === 0) {
    return {
      totalDecisions: 0,
      aiOnlyCount: 0,
      hybridCount: 0,
      manualCount: 0,
      overrideCount: 0,
      averageConfidenceScore: 0,
      averageCostVariance: 0,
      aiOnlyAccuracy: 0,
    };
  }
  
  const aiOnlyLogs = logs.filter(log => log.routedWorkflow === "ai_only");
  const hybridLogs = logs.filter(log => log.routedWorkflow === "hybrid");
  const manualLogs = logs.filter(log => log.routedWorkflow === "manual");
  const overrideLogs = logs.filter(log => log.wasOverridden);
  
  const totalConfidence = logs.reduce((sum, log) => sum + Number(log.compositeConfidenceScore), 0);
  const averageConfidenceScore = totalConfidence / logs.length;
  
  const logsWithVariance = logs.filter(log => log.costVarianceAiVsFinal !== null);
  const totalVariance = logsWithVariance.reduce((sum, log) => sum + Math.abs(Number(log.costVarianceAiVsFinal)), 0);
  const averageCostVariance = logsWithVariance.length > 0 ? totalVariance / logsWithVariance.length : 0;
  
  const aiOnlyWithVariance = aiOnlyLogs.filter(log => log.costVarianceAiVsFinal !== null);
  const aiOnlyAccurate = aiOnlyWithVariance.filter(log => Math.abs(Number(log.costVarianceAiVsFinal)) <= 10);
  const aiOnlyAccuracy = aiOnlyWithVariance.length > 0 ? (aiOnlyAccurate.length / aiOnlyWithVariance.length) * 100 : 0;
  
  return {
    totalDecisions: logs.length,
    aiOnlyCount: aiOnlyLogs.length,
    hybridCount: hybridLogs.length,
    manualCount: manualLogs.length,
    overrideCount: overrideLogs.length,
    averageConfidenceScore,
    averageCostVariance,
    aiOnlyAccuracy,
  };
}
