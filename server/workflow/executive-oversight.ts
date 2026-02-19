// @ts-nocheck
/**
 * Executive Oversight Layer
 * 
 * Provides executive capabilities for claim redirection and oversight
 */

import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import * as schema from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { AuditLogger } from "./audit-logger";
import {
  WorkflowState,
  RedirectResult,
  DecisionComparison,
  WorkflowViolationError,
} from "./types";

/**
 * Executive Oversight
 * 
 * Handles executive-level operations like claim redirection
 */
export class ExecutiveOversight {
  private auditLogger: AuditLogger;

  constructor() {
    this.auditLogger = new AuditLogger();
  }

  /**
   * Redirect claim to previous state with audit logging
   * Preserves decision history and creates immutable audit trail
   */
  async redirectClaim(
    claimId: number,
    targetState: WorkflowState,
    reason: string,
    executiveId: number
  ): Promise<RedirectResult> {
    // Get current claim state
    const db = await getDb();
    if (!db) throw new WorkflowViolationError("Database not available", "DB_UNAVAILABLE");
    
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);

    if (!claim) {
      throw new WorkflowViolationError(
        `Claim ${claimId} not found`,
        "CLAIM_NOT_FOUND"
      );
    }

    const previousState = claim.workflowState as WorkflowState;

    // Validate that target state is "backward" (not forward progression)
    if (!this.isBackwardTransition(previousState, targetState)) {
      throw new WorkflowViolationError(
        `Cannot redirect from '${previousState}' to '${targetState}'. Target must be a previous state.`,
        "INVALID_REDIRECT"
      );
    }

    // Create audit record for redirect
    const auditRecord = await this.auditLogger.logTransition(
      claimId,
      {
        from: previousState,
        to: targetState,
        allowedRoles: ["executive"],
        requiresSegregationCheck: false,
      },
      {
        userId: executiveId,
        userRole: "executive",
        comments: `EXECUTIVE REDIRECT: ${reason}`,
        metadata: {
          redirectType: "executive_override",
          originalState: previousState,
        },
      }
    );

    // Update claim state
    await db.update(claims)
      .set({
        workflowState: targetState,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(claims.id, claimId));

    return {
      success: true,
      previousState,
      newState: targetState,
      auditRecordId: auditRecord.id,
    };
  }

  /**
   * Check if transition is backward (for redirect validation)
   */
  private isBackwardTransition(
    from: WorkflowState,
    to: WorkflowState
  ): boolean {
    // Define state progression order
    const stateOrder: WorkflowState[] = [
      "created",
      "intake_verified",
      "assigned",
      "under_assessment",
      "internal_review",
      "technical_approval",
      "financial_decision",
      "payment_authorized",
      "closed",
    ];

    const fromIndex = stateOrder.indexOf(from);
    const toIndex = stateOrder.indexOf(to);

    // Backward means target index is less than current index
    return toIndex < fromIndex;
  }

  /**
   * Get decision comparison (AI vs Human)
   */
  async getDecisionComparison(
    claimId: number
  ): Promise<DecisionComparison> {
    // Get AI assessment
    const db = await getDb();
    if (!db) throw new WorkflowViolationError("Database not available", "DB_UNAVAILABLE");
    
    const aiResult = await db.execute(sql`
      SELECT 
        estimated_cost,
        fraud_risk_level,
        confidence_score
      FROM ai_assessments
      WHERE claim_id = ${claimId}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // db.execute returns array directly
    const aiRows = aiResult as unknown as Array<Record<string, any>>;
    const aiRow = aiRows[0];

    // Get human assessment
    const humanResult = await db.execute(sql`
      SELECT 
        estimated_cost,
        assessor_id,
        completed_at
      FROM assessor_evaluations
      WHERE claim_id = ${claimId}
      ORDER BY completed_at DESC
      LIMIT 1
    `);

    // db.execute returns array directly
    const humanRows = humanResult as unknown as Array<Record<string, any>>;
    const humanRow = humanRows[0];

    // Get final decision
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);

    if (!claim || !aiRow || !humanRow) {
      throw new WorkflowViolationError(
        `Incomplete data for claim ${claimId}`,
        "INCOMPLETE_DATA"
      );
    }

    const aiCost = aiRow.estimated_cost;
    const humanCost = humanRow.estimated_cost;
    const costDifference = humanCost - aiCost;
    const percentageDifference = ((costDifference / aiCost) * 100).toFixed(2);

    return {
      claimId,
      aiAssessment: {
        estimatedCost: aiCost,
        fraudRiskLevel: aiRow.fraud_risk_level,
        confidenceScore: aiRow.confidence_score,
      },
      humanAssessment: {
        estimatedCost: humanCost,
        assessorId: humanRow.assessor_id,
        completedAt: new Date(humanRow.completed_at),
      },
      variance: {
        costDifference,
        percentageDifference: parseFloat(percentageDifference),
      },
      finalDecision: {
        approvedAmount: claim.approvedAmount || 0,
        approvedBy: claim.financiallyApprovedBy || 0,
        approvedAt: claim.financiallyApprovedAt || new Date(),
      },
    };
  }

  /**
   * Get claims requiring executive review
   */
  async getClaimsRequiringReview(
    tenantId: string,
    threshold: number
  ): Promise<number[]> {
    const db = await getDb();
    if (!db) return [];
    
    const result = await db.execute(sql`
      SELECT c.id
      FROM claims c
      LEFT JOIN ai_assessments ai ON c.id = ai.claim_id
      WHERE c.tenant_id = ${tenantId}
        AND (
          ai.estimated_cost >= ${threshold}
          OR ai.fraud_risk_level = 'high'
        )
        AND c.workflow_state IN ('technical_approval', 'financial_decision')
      ORDER BY ai.estimated_cost DESC
    `);

    // db.execute returns array directly
    const rows = result as unknown as Array<Record<string, any>>;
    return rows.map((row) => row.id);
  }

  /**
   * Add executive comment to claim
   */
  async addExecutiveComment(
    claimId: number,
    executiveId: number,
    comment: string
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    await db.execute(sql`
      INSERT INTO claim_comments (
        claim_id,
        user_id,
        user_role,
        comment_type,
        content,
        created_at
      ) VALUES (
        ${claimId},
        ${executiveId},
        'executive',
        'technical_note',
        ${comment},
        NOW()
      )
    `);
  }
}
