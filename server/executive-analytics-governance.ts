// @ts-nocheck
/**
 * Executive Analytics - Governance Metrics
 * 
 * Provides governance-focused analytics using audit trail data:
 * - Executive override tracking
 * - Segregation of duties compliance
 * - Role assignment impact analysis
 */

import { getDb } from "./db";
import { workflowAuditTrail, claimInvolvementTracking, roleAssignmentAudit } from "../drizzle/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";

/**
 * Get Executive Override Metrics
 * Tracks frequency, patterns, and impact of executive overrides
 * 
 * Uses workflowAuditTrail.executiveOverride field to identify
 * when executives bypassed normal workflow rules
 */
export async function getExecutiveOverrideMetrics(tenantId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total overrides and trend over time
  const overrideStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total_overrides,
      COUNT(DISTINCT claim_id) as claims_affected,
      COUNT(DISTINCT user_id) as executives_involved,
      AVG(decision_value) as avg_override_amount,
      DATE_FORMAT(created_at, '%Y-%m') as month
    FROM workflow_audit_trail
    WHERE executive_override = 1
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month DESC
    LIMIT 12
  `);

  // Override reasons distribution
  const overrideReasons = await db.execute(sql`
    SELECT 
      override_reason,
      COUNT(*) as count,
      AVG(decision_value) as avg_amount
    FROM workflow_audit_trail
    WHERE executive_override = 1
      AND override_reason IS NOT NULL
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
    GROUP BY override_reason
    ORDER BY count DESC
    LIMIT 10
  `);

  // States most frequently overridden
  const overriddenStates = await db.execute(sql`
    SELECT 
      previous_state,
      new_state,
      COUNT(*) as override_count
    FROM workflow_audit_trail
    WHERE executive_override = 1
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
    GROUP BY previous_state, new_state
    ORDER BY override_count DESC
    LIMIT 10
  `);

  return {
    monthlyTrend: (overrideStats.rows as any[]).map(r => ({
      month: r.month,
      totalOverrides: Number(r.total_overrides || 0),
      claimsAffected: Number(r.claims_affected || 0),
      executivesInvolved: Number(r.executives_involved || 0),
      avgOverrideAmount: Number(r.avg_override_amount || 0) / 100, // Convert cents to dollars
    })),
    reasonsDistribution: (overrideReasons.rows as any[]).map(r => ({
      reason: r.override_reason,
      count: Number(r.count || 0),
      avgAmount: Number(r.avg_amount || 0) / 100,
    })),
    mostOverriddenTransitions: (overriddenStates.rows as any[]).map(r => ({
      from: r.previous_state,
      to: r.new_state,
      count: Number(r.override_count || 0),
    })),
  };
}

/**
 * Get Segregation of Duties Violation Attempts
 * Tracks attempts to violate segregation rules and compliance rate
 * 
 * Uses claimInvolvementTracking to identify users who attempted
 * to perform more than the allowed number of critical stages
 */
export async function getSegregationViolationAttempts(tenantId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Users with multiple stage involvements (potential violations)
  const multiStageUsers = await db.execute(sql`
    SELECT 
      user_id,
      claim_id,
      COUNT(DISTINCT workflow_stage) as stage_count,
      GROUP_CONCAT(DISTINCT workflow_stage ORDER BY created_at) as stages_involved
    FROM claim_involvement_tracking
    ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    GROUP BY user_id, claim_id
    HAVING stage_count >= 2
    ORDER BY stage_count DESC
  `);

  // Violation attempts over time
  const violationTrend = await db.execute(sql`
    WITH user_stage_counts AS (
      SELECT 
        user_id,
        claim_id,
        COUNT(DISTINCT workflow_stage) as stage_count,
        DATE_FORMAT(MAX(created_at), '%Y-%m') as month
      FROM claim_involvement_tracking
      ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
      GROUP BY user_id, claim_id, DATE_FORMAT(created_at, '%Y-%m')
    )
    SELECT 
      month,
      SUM(CASE WHEN stage_count >= 3 THEN 1 ELSE 0 END) as violations,
      SUM(CASE WHEN stage_count = 2 THEN 1 ELSE 0 END) as warnings,
      COUNT(*) as total_claims
    FROM user_stage_counts
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `);

  // Most common violation patterns
  const violationPatterns = await db.execute(sql`
    SELECT 
      GROUP_CONCAT(DISTINCT workflow_stage ORDER BY workflow_stage) as pattern,
      COUNT(DISTINCT CONCAT(user_id, '-', claim_id)) as occurrence_count
    FROM claim_involvement_tracking
    ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    GROUP BY user_id, claim_id
    HAVING COUNT(DISTINCT workflow_stage) >= 2
    ORDER BY occurrence_count DESC
    LIMIT 10
  `);

  // Calculate compliance rate
  const [complianceStats] = await db.execute(sql`
    WITH user_claim_stages AS (
      SELECT 
        user_id,
        claim_id,
        COUNT(DISTINCT workflow_stage) as stage_count
      FROM claim_involvement_tracking
      ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
      GROUP BY user_id, claim_id
    )
    SELECT 
      COUNT(*) as total_user_claim_pairs,
      SUM(CASE WHEN stage_count <= 2 THEN 1 ELSE 0 END) as compliant_pairs,
      SUM(CASE WHEN stage_count > 2 THEN 1 ELSE 0 END) as violation_pairs
    FROM user_claim_stages
  `);

  const stats = (complianceStats as any).rows[0] || {};
  const totalPairs = Number(stats.total_user_claim_pairs || 0);
  const compliantPairs = Number(stats.compliant_pairs || 0);
  const complianceRate = totalPairs > 0 ? (compliantPairs / totalPairs) * 100 : 100;

  return {
    complianceRate: Math.round(complianceRate * 10) / 10,
    totalViolations: Number(stats.violation_pairs || 0),
    multiStageInvolvements: (multiStageUsers.rows as any[]).map(r => ({
      userId: Number(r.user_id),
      claimId: Number(r.claim_id),
      stageCount: Number(r.stage_count),
      stagesInvolved: r.stages_involved,
    })),
    monthlyTrend: (violationTrend.rows as any[]).map(r => ({
      month: r.month,
      violations: Number(r.violations || 0),
      warnings: Number(r.warnings || 0),
      totalClaims: Number(r.total_claims || 0),
    })),
    commonPatterns: (violationPatterns.rows as any[]).map(r => ({
      pattern: r.pattern,
      occurrences: Number(r.occurrence_count || 0),
    })),
  };
}

/**
 * Get Combined Governance Dashboard Metrics
 * Single endpoint for executive dashboard to fetch all governance metrics
 */
export async function getGovernanceDashboardMetrics(tenantId?: string) {
  const [overrideMetrics, segregationMetrics] = await Promise.all([
    getExecutiveOverrideMetrics(tenantId),
    getSegregationViolationAttempts(tenantId),
  ]);

  return {
    executiveOverrides: overrideMetrics,
    segregationCompliance: segregationMetrics,
  };
}


/**
 * Get Role Change Frequency Analytics
 * Tracks role assignment patterns and their impact on operations
 * 
 * Uses roleAssignmentAudit to analyze role changes over time,
 * identify frequent role switchers, and measure impact on claim processing
 */
export async function getRoleChangeFrequency(tenantId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Role changes over time
  const roleChangeTrend = await db.execute(sql`
    SELECT 
      DATE_FORMAT(timestamp, '%Y-%m') as month,
      COUNT(*) as total_changes,
      COUNT(DISTINCT user_id) as users_affected,
      COUNT(DISTINCT changed_by_user_id) as admins_involved
    FROM role_assignment_audit
    ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    GROUP BY DATE_FORMAT(timestamp, '%Y-%m')
    ORDER BY month DESC
    LIMIT 12
  `);

  // Most common role transitions
  const roleTransitions = await db.execute(sql`
    SELECT 
      previous_role,
      new_role,
      COUNT(*) as transition_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM role_assignment_audit
    ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    GROUP BY previous_role, new_role
    ORDER BY transition_count DESC
    LIMIT 10
  `);

  // Users with frequent role changes (potential red flag)
  const frequentSwitchers = await db.execute(sql`
    SELECT 
      user_id,
      COUNT(*) as change_count,
      MIN(timestamp) as first_change,
      MAX(timestamp) as last_change,
      GROUP_CONCAT(DISTINCT new_role ORDER BY timestamp) as role_history
    FROM role_assignment_audit
    ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    GROUP BY user_id
    HAVING change_count >= 3
    ORDER BY change_count DESC
    LIMIT 20
  `);

  // Role change justifications analysis
  const justificationPatterns = await db.execute(sql`
    SELECT 
      CASE 
        WHEN justification LIKE '%promotion%' THEN 'Promotion'
        WHEN justification LIKE '%demotion%' THEN 'Demotion'
        WHEN justification LIKE '%transfer%' THEN 'Department Transfer'
        WHEN justification LIKE '%temporary%' THEN 'Temporary Assignment'
        WHEN justification LIKE '%performance%' THEN 'Performance Related'
        ELSE 'Other'
      END as justification_category,
      COUNT(*) as count
    FROM role_assignment_audit
    WHERE justification IS NOT NULL
      ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
    GROUP BY justification_category
    ORDER BY count DESC
  `);

  return {
    monthlyTrend: (roleChangeTrend.rows as any[]).map(r => ({
      month: r.month,
      totalChanges: Number(r.total_changes || 0),
      usersAffected: Number(r.users_affected || 0),
      adminsInvolved: Number(r.admins_involved || 0),
    })),
    commonTransitions: (roleTransitions.rows as any[]).map(r => ({
      from: r.previous_role,
      to: r.new_role,
      count: Number(r.transition_count || 0),
      uniqueUsers: Number(r.unique_users || 0),
    })),
    frequentSwitchers: (frequentSwitchers.rows as any[]).map(r => ({
      userId: Number(r.user_id),
      changeCount: Number(r.change_count),
      firstChange: r.first_change,
      lastChange: r.last_change,
      roleHistory: r.role_history,
    })),
    justificationCategories: (justificationPatterns.rows as any[]).map(r => ({
      category: r.justification_category,
      count: Number(r.count || 0),
    })),
  };
}

/**
 * Get Role Assignment Impact on Claim Processing
 * Analyzes how role changes affect claim processing efficiency
 * 
 * Correlates role changes with claim processing metrics to identify
 * whether role transitions cause delays or improve performance
 */
export async function getRoleAssignmentImpact(tenantId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Claims processed before vs after role change
  const impactAnalysis = await db.execute(sql`
    WITH role_change_dates AS (
      SELECT 
        user_id,
        timestamp as change_date,
        previous_role,
        new_role
      FROM role_assignment_audit
      ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    ),
    user_claims AS (
      SELECT 
        w.user_id,
        w.claim_id,
        w.created_at,
        rc.change_date,
        rc.previous_role,
        rc.new_role,
        CASE 
          WHEN w.created_at < rc.change_date THEN 'before'
          WHEN w.created_at >= rc.change_date THEN 'after'
        END as period
      FROM workflow_audit_trail w
      INNER JOIN role_change_dates rc ON w.user_id = rc.user_id
      WHERE w.created_at BETWEEN DATE_SUB(rc.change_date, INTERVAL 30 DAY) 
        AND DATE_ADD(rc.change_date, INTERVAL 30 DAY)
    )
    SELECT 
      new_role,
      period,
      COUNT(DISTINCT claim_id) as claims_processed,
      COUNT(DISTINCT user_id) as users_involved
    FROM user_claims
    WHERE period IS NOT NULL
    GROUP BY new_role, period
    ORDER BY new_role, period
  `);

  // Average processing time impact
  const processingTimeImpact = await db.execute(sql`
    WITH role_changes AS (
      SELECT 
        user_id,
        timestamp as change_date,
        new_role
      FROM role_assignment_audit
      ${tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``}
    ),
    claim_times AS (
      SELECT 
        w.user_id,
        w.claim_id,
        rc.new_role,
        CASE 
          WHEN w.created_at < rc.change_date THEN 'before'
          ELSE 'after'
        END as period,
        TIMESTAMPDIFF(HOUR, 
          MIN(w.created_at), 
          MAX(w.created_at)
        ) as processing_hours
      FROM workflow_audit_trail w
      INNER JOIN role_changes rc ON w.user_id = rc.user_id
      WHERE w.created_at BETWEEN DATE_SUB(rc.change_date, INTERVAL 30 DAY) 
        AND DATE_ADD(rc.change_date, INTERVAL 30 DAY)
      GROUP BY w.user_id, w.claim_id, rc.new_role, period
    )
    SELECT 
      new_role,
      period,
      AVG(processing_hours) as avg_hours
    FROM claim_times
    GROUP BY new_role, period
    ORDER BY new_role, period
  `);

  return {
    claimsProcessedImpact: (impactAnalysis.rows as any[]).map(r => ({
      role: r.new_role,
      period: r.period,
      claimsProcessed: Number(r.claims_processed || 0),
      usersInvolved: Number(r.users_involved || 0),
    })),
    processingTimeImpact: (processingTimeImpact.rows as any[]).map(r => ({
      role: r.new_role,
      period: r.period,
      avgHours: Math.round(Number(r.avg_hours || 0) * 10) / 10,
    })),
  };
}
