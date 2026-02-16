/**
 * Audit Logger
 * 
 * Creates immutable audit records for all workflow transitions
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  StateTransition,
  AuditRecord,
  AuditMetadata,
} from "./types";

/**
 * Audit Logger
 * 
 * Logs all state transitions to an immutable audit trail
 */
export class AuditLogger {
  /**
   * Create immutable audit record for state transition
   * This is called automatically by WorkflowStateMachine before executing transition
   */
  async logTransition(
    claimId: number,
    transition: StateTransition,
    metadata: AuditMetadata
  ): Promise<AuditRecord> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const result = await db.execute(sql`
      INSERT INTO workflow_audit_trail (
        claim_id,
        user_id,
        user_role,
        previous_state,
        new_state,
        decision_value,
        ai_score,
        confidence_score,
        comments,
        metadata,
        created_at
      ) VALUES (
        ${claimId},
        ${metadata.userId},
        ${metadata.userRole},
        ${transition.from},
        ${transition.to},
        ${metadata.decisionValue ?? null},
        ${metadata.aiScore ?? null},
        ${metadata.confidenceScore ?? null},
        ${metadata.comments ?? null},
        ${metadata.metadata ? JSON.stringify(metadata.metadata) : null},
        NOW()
      )
    `);

    // Get the inserted ID from the result
    // db.execute returns [ResultSetHeader, null] for INSERT queries
    const insertId = (result as any)[0].insertId;

    return {
      id: insertId,
      claimId,
      userId: metadata.userId,
      userRole: metadata.userRole,
      previousState: transition.from,
      newState: transition.to,
      decisionValue: metadata.decisionValue ?? null,
      aiScore: metadata.aiScore ?? null,
      confidenceScore: metadata.confidenceScore ?? null,
      comments: metadata.comments ?? null,
      metadata: metadata.metadata ?? null,
      createdAt: new Date(),
    };
  }

  /**
   * Log a governance violation attempt (e.g., segregation of duties violation)
   * This creates an audit record for failed transition attempts
   */
  async logViolation(
    claimId: number,
    transition: StateTransition,
    metadata: AuditMetadata
  ): Promise<AuditRecord> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Log violation with special marker in comments
    const result = await db.execute(sql`
      INSERT INTO workflow_audit_trail (
        claim_id,
        user_id,
        user_role,
        previous_state,
        new_state,
        decision_value,
        ai_score,
        confidence_score,
        comments,
        metadata,
        created_at
      ) VALUES (
        ${claimId},
        ${metadata.userId},
        ${metadata.userRole},
        ${transition.from},
        ${transition.to},
        ${metadata.decisionValue ?? null},
        ${metadata.aiScore ?? null},
        ${metadata.confidenceScore ?? null},
        ${metadata.comments ?? "Governance violation attempt"},
        ${metadata.metadata ? JSON.stringify({ ...metadata.metadata, violationAttempt: true }) : JSON.stringify({ violationAttempt: true })},
        NOW()
      )
    `);

    const insertId = (result as any)[0].insertId;

    return {
      id: insertId,
      claimId,
      userId: metadata.userId,
      userRole: metadata.userRole,
      previousState: transition.from,
      newState: transition.to,
      decisionValue: metadata.decisionValue ?? null,
      aiScore: metadata.aiScore ?? null,
      confidenceScore: metadata.confidenceScore ?? null,
      comments: metadata.comments ?? "Governance violation attempt",
      metadata: { ...metadata.metadata, violationAttempt: true },
      createdAt: new Date(),
    };
  }

  /**
   * Retrieve complete audit trail for a claim
   */
  async getClaimAuditTrail(claimId: number): Promise<AuditRecord[]> {
    const db = await getDb();
    if (!db) return [];
    
    const result = await db.execute(sql`
      SELECT *
      FROM workflow_audit_trail
      WHERE claim_id = ${claimId}
      ORDER BY created_at ASC
    `);

    // db.execute returns array directly
    const rows = result as unknown as Array<Record<string, any>>;
    return rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      userId: row.user_id,
      userRole: row.user_role,
      previousState: row.previous_state,
      newState: row.new_state,
      decisionValue: row.decision_value,
      aiScore: row.ai_score,
      confidenceScore: row.confidence_score,
      comments: row.comments,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get audit trail for a specific user
   */
  async getUserAuditTrail(userId: number, limit: number = 100): Promise<AuditRecord[]> {
    const db = await getDb();
    if (!db) return [];
    
    const result = await db.execute(sql`
      SELECT *
      FROM workflow_audit_trail
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    // db.execute returns array directly
    const rows = result as unknown as Array<Record<string, any>>;
    return rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      userId: row.user_id,
      userRole: row.user_role,
      previousState: row.previous_state,
      newState: row.new_state,
      decisionValue: row.decision_value,
      aiScore: row.ai_score,
      confidenceScore: row.confidence_score,
      comments: row.comments,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get audit records for a specific state transition
   */
  async getTransitionAuditRecords(
    fromState: string,
    toState: string,
    limit: number = 100
  ): Promise<AuditRecord[]> {
    const db = await getDb();
    if (!db) return [];
    
    const result = await db.execute(sql`
      SELECT *
      FROM workflow_audit_trail
      WHERE previous_state = ${fromState}
        AND new_state = ${toState}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    // db.execute returns array directly
    const rows = result as unknown as Array<Record<string, any>>;
    return rows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      userId: row.user_id,
      userRole: row.user_role,
      previousState: row.previous_state,
      newState: row.new_state,
      decisionValue: row.decision_value,
      aiScore: row.ai_score,
      confidenceScore: row.confidence_score,
      comments: row.comments,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get audit statistics for a claim
   */
  async getClaimAuditStats(claimId: number): Promise<{
    totalTransitions: number;
    uniqueUsers: number;
    averageTimePerStage: number;
    currentState: string;
  }> {
    const db = await getDb();
    if (!db) return { totalTransitions: 0, uniqueUsers: 0, averageTimePerStage: 0, currentState: "unknown" };
    
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total_transitions,
        COUNT(DISTINCT user_id) as unique_users,
        new_state as current_state
      FROM workflow_audit_trail
      WHERE claim_id = ${claimId}
      GROUP BY claim_id
    `);

    // db.execute returns array directly
    const rows = result as unknown as Array<Record<string, any>>;
    const row = rows[0];

    return {
      totalTransitions: row?.total_transitions || 0,
      uniqueUsers: row?.unique_users || 0,
      averageTimePerStage: 0, // TODO: Calculate from timestamps
      currentState: row?.current_state || "unknown",
    };
  }
}
