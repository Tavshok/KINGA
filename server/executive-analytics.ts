/**
 * Executive Analytics
 * 
 * Analytics functions for executive dashboard including:
 * - Per-state dwell time calculations
 * - Workflow bottleneck analysis
 * 
 * TiDB-compatible: no subqueries in JOIN ON conditions, no NOT EXISTS in ON
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

export interface AverageProcessingTime {
  created: number;
  intakeVerified: number;
  assigned: number;
  underAssessment: number;
  internalReview: number;
  technicalApproval: number;
  financialDecision: number;
  paymentAuthorized: number;
  closed: number;
  disputed: number;
  fullLifecycle: number;
}

export interface WorkflowBottleneck {
  state: string;
  count: number;
  avgDaysInState: number;
  maxDaysInState: number;
}

/**
 * Calculate average processing time per workflow state
 * Uses workflow_audit_trail to compute dwell times between state transitions
 * TiDB-compatible approach: use MIN(next_id) per claim to find next transition
 */
export async function getAverageProcessingTime(): Promise<AverageProcessingTime> {
  const db = await getDb();
  if (!db) {
    return {
      created: 0, intakeVerified: 0, assigned: 0, underAssessment: 0,
      internalReview: 0, technicalApproval: 0, financialDecision: 0,
      paymentAuthorized: 0, closed: 0, disputed: 0, fullLifecycle: 0,
    };
  }

  try {
    // TiDB-compatible: compute average dwell time per state
    // Use a simple approach: group by claim and state, compute time between consecutive entries
    const result = await db.execute(sql`
      SELECT 
        a.previous_state as state,
        AVG(TIMESTAMPDIFF(HOUR, a.created_at, b.min_created)) / 24.0 as avg_days
      FROM workflow_audit_trail a
      JOIN (
        SELECT claim_id, MIN(id) as min_id, MIN(created_at) as min_created
        FROM workflow_audit_trail
        GROUP BY claim_id
        HAVING COUNT(*) > 1
      ) b ON b.claim_id = a.claim_id AND b.min_id > a.id
      WHERE a.previous_state IS NOT NULL
      GROUP BY a.previous_state
    `);

    const rows = (result as any)[0] as Array<{ state: string; avg_days: number }>;
    const stateMap: Record<string, number> = {};
    if (Array.isArray(rows)) {
      rows.forEach(row => {
        stateMap[row.state] = parseFloat(String(row.avg_days)) || 0;
      });
    }

    // Full lifecycle: average total processing time
    const lifecycleResult = await db.execute(sql`
      SELECT AVG(TIMESTAMPDIFF(HOUR, MIN(a.created_at), MAX(a.created_at))) / 24.0 as avg_days
      FROM workflow_audit_trail a
      GROUP BY a.claim_id
      HAVING COUNT(*) > 1
    `);
    const lifecycleRows = (lifecycleResult as any)[0] as Array<{ avg_days: number }>;
    const fullLifecycle = Array.isArray(lifecycleRows) && lifecycleRows.length > 0 
      ? parseFloat(String(lifecycleRows[0].avg_days)) || 0 
      : 0;

    return {
      created: stateMap['created'] || 0,
      intakeVerified: stateMap['intake_verified'] || 0,
      assigned: stateMap['assigned'] || 0,
      underAssessment: stateMap['under_assessment'] || 0,
      internalReview: stateMap['internal_review'] || 0,
      technicalApproval: stateMap['technical_approval'] || 0,
      financialDecision: stateMap['financial_decision'] || 0,
      paymentAuthorized: stateMap['payment_authorized'] || 0,
      closed: stateMap['closed'] || 0,
      disputed: stateMap['disputed'] || 0,
      fullLifecycle,
    };
  } catch (e) {
    // Return zeros if query fails
    return {
      created: 0, intakeVerified: 0, assigned: 0, underAssessment: 0,
      internalReview: 0, technicalApproval: 0, financialDecision: 0,
      paymentAuthorized: 0, closed: 0, disputed: 0, fullLifecycle: 0,
    };
  }
}

/**
 * Identify workflow bottlenecks - states with longest dwell times
 * Excludes closed and disputed states
 */
export async function getWorkflowBottlenecks(): Promise<WorkflowBottleneck[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // TiDB-compatible: use derived table to find next transition
    const result = await db.execute(sql`
      SELECT 
        a.previous_state as state,
        COUNT(*) as count,
        AVG(TIMESTAMPDIFF(HOUR, a.created_at, IFNULL(next_a.created_at, NOW()))) / 24.0 as avg_days_in_state,
        MAX(TIMESTAMPDIFF(HOUR, a.created_at, IFNULL(next_a.created_at, NOW()))) / 24.0 as max_days_in_state
      FROM workflow_audit_trail a
      LEFT JOIN (
        SELECT a1.id, MIN(a2.id) as next_id
        FROM workflow_audit_trail a1
        LEFT JOIN workflow_audit_trail a2 ON a2.claim_id = a1.claim_id AND a2.id > a1.id
        GROUP BY a1.id
      ) next_map ON next_map.id = a.id
      LEFT JOIN workflow_audit_trail next_a ON next_a.id = next_map.next_id
      WHERE a.previous_state IS NOT NULL
        AND a.previous_state NOT IN ('closed', 'disputed')
      GROUP BY a.previous_state
      ORDER BY avg_days_in_state DESC
    `);

    const rows = (result as any)[0] as Array<{
      state: string;
      count: number;
      avg_days_in_state: number;
      max_days_in_state: number;
    }>;

    if (!Array.isArray(rows)) return [];

    return rows.map(row => ({
      state: row.state,
      count: parseInt(String(row.count)) || 0,
      avgDaysInState: parseFloat(String(row.avg_days_in_state)) || 0,
      maxDaysInState: parseFloat(String(row.max_days_in_state)) || 0,
    }));
  } catch (e) {
    return [];
  }
}
