// @ts-nocheck
import { getDb } from "./db";
import { workflowAuditTrail, claims, users } from "../drizzle/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";

/**
 * Compliance Report Generator
 * 
 * Generates comprehensive audit trail reports for regulatory compliance.
 * Reports include all workflow transitions, user actions, and executive overrides.
 */

export interface ComplianceReportOptions {
  tenantId: string;
  startDate: string;
  endDate: string;
  includeExecutiveOverrides?: boolean;
  includeFraudFlags?: boolean;
}

export interface ComplianceReportData {
  reportMetadata: {
    generatedAt: string;
    tenantId: string;
    reportPeriod: {
      start: string;
      end: string;
    };
    totalTransitions: number;
    uniqueClaims: number;
    uniqueUsers: number;
  };
  workflowTransitions: Array<{
    transitionId: number;
    claimId: number;
    claimNumber: string;
    userId: number;
    userName: string;
    userRole: string;
    previousState: string;
    newState: string;
    timestamp: string;
    decisionValue?: number;
    aiScore?: number;
    confidenceScore?: number;
    comments?: string;
    executiveOverride: boolean;
  }>;
  executiveOverrides: Array<{
    transitionId: number;
    claimId: number;
    claimNumber: string;
    executiveName: string;
    overrideReason: string;
    timestamp: string;
    previousState: string;
    newState: string;
  }>;
  fraudFlags: Array<{
    claimId: number;
    claimNumber: string;
    fraudScore: number;
    confidenceScore: number;
    flaggedBy: string;
    timestamp: string;
    currentState: string;
  }>;
  summary: {
    transitionsByState: Record<string, number>;
    transitionsByRole: Record<string, number>;
    averageProcessingTime: number;
    executiveOverrideCount: number;
    highFraudFlagCount: number;
  };
}

/**
 * Generate a comprehensive compliance report
 */
export async function generateComplianceReport(
  options: ComplianceReportOptions
): Promise<ComplianceReportData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { tenantId, startDate, endDate, includeExecutiveOverrides = true, includeFraudFlags = true } = options;

  // Fetch all workflow transitions for the period
  const transitionsQuery = sql`
    SELECT 
      wat.id as transition_id,
      wat.claim_id,
      c.claim_number,
      wat.user_id,
      wat.user_role,
      wat.previous_state,
      wat.new_state,
      wat.created_at as timestamp,
      wat.decision_value,
      wat.ai_score,
      wat.confidence_score,
      wat.comments,
      wat.executive_override
    FROM workflow_audit_trail wat
    INNER JOIN claims c ON wat.claim_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND wat.created_at >= ${startDate}
      AND wat.created_at <= ${endDate}
    ORDER BY wat.created_at DESC
  `;

  const transitionsResult = await db.execute(transitionsQuery);
  const transitions = transitionsResult.rows as any[];

  // Fetch executive overrides
  const executiveOverridesQuery = sql`
    SELECT 
      wat.id as transition_id,
      wat.claim_id,
      c.claim_number,
      wat.user_id,
      wat.comments as override_reason,
      wat.created_at as timestamp,
      wat.previous_state,
      wat.new_state
    FROM workflow_audit_trail wat
    INNER JOIN claims c ON wat.claim_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND wat.created_at >= ${startDate}
      AND wat.created_at <= ${endDate}
      AND wat.executive_override = 1
    ORDER BY wat.created_at DESC
  `;

  const executiveOverridesResult = includeExecutiveOverrides ? await db.execute(executiveOverridesQuery) : { rows: [] };
  const executiveOverrides = executiveOverridesResult.rows as any[];

  // Fetch fraud flags (high AI fraud scores)
  const fraudFlagsQuery = sql`
    SELECT 
      wat.claim_id,
      c.claim_number,
      wat.ai_score as fraud_score,
      wat.confidence_score,
      wat.user_id,
      wat.created_at as timestamp,
      wat.new_state as current_state
    FROM workflow_audit_trail wat
    INNER JOIN claims c ON wat.claim_id = c.id
    WHERE c.tenant_id = ${tenantId}
      AND wat.created_at >= ${startDate}
      AND wat.created_at <= ${endDate}
      AND wat.ai_score >= 0.7
    ORDER BY wat.ai_score DESC
  `;

  const fraudFlagsResult = includeFraudFlags ? await db.execute(fraudFlagsQuery) : { rows: [] };
  const fraudFlags = fraudFlagsResult.rows as any[];

  // Calculate summary statistics
  const transitionsByState: Record<string, number> = {};
  const transitionsByRole: Record<string, number> = {};
  const uniqueClaims = new Set<number>();
  const uniqueUsers = new Set<number>();

  transitions.forEach((t: any) => {
    const state = t.new_state || "unknown";
    const role = t.user_role || "unknown";

    transitionsByState[state] = (transitionsByState[state] || 0) + 1;
    transitionsByRole[role] = (transitionsByRole[role] || 0) + 1;

    uniqueClaims.add(t.claim_id);
    uniqueUsers.add(t.user_id);
  });

  // Calculate average processing time
  const processingTimeQuery = sql`
    SELECT AVG(TIMESTAMPDIFF(HOUR, wat1.created_at, wat2.created_at)) as avg_hours
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
      AND wat1.created_at >= ${startDate}
      AND wat1.created_at <= ${endDate}
  `;

  const processingTimeResult = await db.execute(processingTimeQuery);
  const avgProcessingTime = parseFloat((processingTimeResult.rows[0] as any)?.avg_hours) || 0;

  return {
    reportMetadata: {
      generatedAt: new Date().toISOString(),
      tenantId,
      reportPeriod: {
        start: startDate,
        end: endDate,
      },
      totalTransitions: transitions.length,
      uniqueClaims: uniqueClaims.size,
      uniqueUsers: uniqueUsers.size,
    },
    workflowTransitions: transitions.map((t: any) => ({
      transitionId: t.transition_id,
      claimId: t.claim_id,
      claimNumber: t.claim_number,
      userId: t.user_id,
      userName: `User #${t.user_id}`, // TODO: Join with users table
      userRole: t.user_role,
      previousState: t.previous_state,
      newState: t.new_state,
      timestamp: t.timestamp,
      decisionValue: t.decision_value,
      aiScore: t.ai_score,
      confidenceScore: t.confidence_score,
      comments: t.comments,
      executiveOverride: t.executive_override === 1,
    })),
    executiveOverrides: executiveOverrides.map((o: any) => ({
      transitionId: o.transition_id,
      claimId: o.claim_id,
      claimNumber: o.claim_number,
      executiveName: `User #${o.user_id}`, // TODO: Join with users table
      overrideReason: o.override_reason || "No reason provided",
      timestamp: o.timestamp,
      previousState: o.previous_state,
      newState: o.new_state,
    })),
    fraudFlags: fraudFlags.map((f: any) => ({
      claimId: f.claim_id,
      claimNumber: f.claim_number,
      fraudScore: f.fraud_score,
      confidenceScore: f.confidence_score,
      flaggedBy: `User #${f.user_id}`,
      timestamp: f.timestamp,
      currentState: f.current_state,
    })),
    summary: {
      transitionsByState,
      transitionsByRole,
      averageProcessingTime: avgProcessingTime,
      executiveOverrideCount: executiveOverrides.length,
      highFraudFlagCount: fraudFlags.length,
    },
  };
}

/**
 * Format compliance report as Markdown
 */
export function formatComplianceReportAsMarkdown(data: ComplianceReportData): string {
  const { reportMetadata, workflowTransitions, executiveOverrides, fraudFlags, summary } = data;

  let markdown = `# Compliance Audit Trail Report\n\n`;
  markdown += `**Generated:** ${new Date(reportMetadata.generatedAt).toLocaleString()}\n\n`;
  markdown += `**Tenant ID:** ${reportMetadata.tenantId}\n\n`;
  markdown += `**Report Period:** ${new Date(reportMetadata.reportPeriod.start).toLocaleDateString()} - ${new Date(reportMetadata.reportPeriod.end).toLocaleDateString()}\n\n`;

  markdown += `---\n\n`;

  markdown += `## Executive Summary\n\n`;
  markdown += `This compliance report provides a comprehensive audit trail of all workflow transitions within the specified period. The report includes ${reportMetadata.totalTransitions} workflow transitions across ${reportMetadata.uniqueClaims} unique claims, performed by ${reportMetadata.uniqueUsers} users. The average processing time per workflow stage was ${summary.averageProcessingTime.toFixed(1)} hours. ${summary.executiveOverrideCount} executive overrides were recorded, and ${summary.highFraudFlagCount} high-risk fraud flags were identified.\n\n`;

  markdown += `---\n\n`;

  markdown += `## Summary Statistics\n\n`;
  markdown += `- **Total Workflow Transitions:** ${reportMetadata.totalTransitions}\n`;
  markdown += `- **Unique Claims Processed:** ${reportMetadata.uniqueClaims}\n`;
  markdown += `- **Active Users:** ${reportMetadata.uniqueUsers}\n`;
  markdown += `- **Average Processing Time:** ${summary.averageProcessingTime.toFixed(1)} hours\n`;
  markdown += `- **Executive Overrides:** ${summary.executiveOverrideCount}\n`;
  markdown += `- **High Fraud Flags:** ${summary.highFraudFlagCount}\n\n`;

  markdown += `### Transitions by Workflow State\n\n`;
  markdown += `| Workflow State | Transition Count |\n`;
  markdown += `|----------------|------------------|\n`;
  Object.entries(summary.transitionsByState)
    .sort(([, a], [, b]) => b - a)
    .forEach(([state, count]) => {
      markdown += `| ${state} | ${count} |\n`;
    });
  markdown += `\n`;

  markdown += `### Transitions by User Role\n\n`;
  markdown += `| User Role | Transition Count |\n`;
  markdown += `|-----------|------------------|\n`;
  Object.entries(summary.transitionsByRole)
    .sort(([, a], [, b]) => b - a)
    .forEach(([role, count]) => {
      markdown += `| ${role} | ${count} |\n`;
    });
  markdown += `\n`;

  if (executiveOverrides.length > 0) {
    markdown += `---\n\n`;
    markdown += `## Executive Overrides\n\n`;
    markdown += `${executiveOverrides.length} executive override(s) were recorded during this period:\n\n`;
    markdown += `| Claim # | Executive | Timestamp | Transition | Reason |\n`;
    markdown += `|---------|-----------|-----------|------------|--------|\n`;
    executiveOverrides.forEach((o) => {
      markdown += `| ${o.claimNumber} | ${o.executiveName} | ${new Date(o.timestamp).toLocaleString()} | ${o.previousState} → ${o.newState} | ${o.overrideReason} |\n`;
    });
    markdown += `\n`;
  }

  if (fraudFlags.length > 0) {
    markdown += `---\n\n`;
    markdown += `## High-Risk Fraud Flags\n\n`;
    markdown += `${fraudFlags.length} claim(s) were flagged with high fraud risk scores (≥0.7):\n\n`;
    markdown += `| Claim # | Fraud Score | Confidence | Flagged By | Timestamp | Current State |\n`;
    markdown += `|---------|-------------|------------|------------|-----------|---------------|\n`;
    fraudFlags.forEach((f) => {
      markdown += `| ${f.claimNumber} | ${(f.fraudScore * 100).toFixed(1)}% | ${(f.confidenceScore * 100).toFixed(1)}% | ${f.flaggedBy} | ${new Date(f.timestamp).toLocaleString()} | ${f.currentState} |\n`;
    });
    markdown += `\n`;
  }

  markdown += `---\n\n`;
  markdown += `## Detailed Workflow Transitions\n\n`;
  markdown += `Complete audit trail of all workflow state transitions:\n\n`;
  markdown += `| Transition ID | Claim # | User | Role | Previous State | New State | Timestamp | Override |\n`;
  markdown += `|---------------|---------|------|------|----------------|-----------|-----------|----------|\n`;
  workflowTransitions.slice(0, 100).forEach((t) => {
    markdown += `| ${t.transitionId} | ${t.claimNumber} | ${t.userName} | ${t.userRole} | ${t.previousState} | ${t.newState} | ${new Date(t.timestamp).toLocaleString()} | ${t.executiveOverride ? "Yes" : "No"} |\n`;
  });

  if (workflowTransitions.length > 100) {
    markdown += `\n*Note: Showing first 100 transitions. Full report contains ${workflowTransitions.length} transitions.*\n`;
  }

  markdown += `\n---\n\n`;
  markdown += `*This report was automatically generated by KINGA AI Compliance System.*\n`;

  return markdown;
}
