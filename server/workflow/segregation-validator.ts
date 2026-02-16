/**
 * Segregation of Duties Validator
 * 
 * Enforces segregation of duties rules to prevent single-user end-to-end control
 */

import { getDb } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  WorkflowAction,
  WorkflowState,
  CriticalStage,
  SegregationResult,
  InvolvementHistory,
  StageInvolvement,
  SegregationViolationError,
} from "./types";

/**
 * Map workflow states to critical stages
 */
const STATE_TO_CRITICAL_STAGE: Partial<Record<WorkflowState, CriticalStage>> = {
  under_assessment: "assessment",
  internal_review: "assessment",
  technical_approval: "technical_approval",
  financial_decision: "financial_decision",
  payment_authorized: "payment_authorization",
};

/**
 * Segregation of Duties Validator
 * 
 * Validates that no single user performs too many sequential critical stages
 */
export class SegregationValidator {
  private maxSequentialStages: number = 1; // Default: user can perform max 1 critical stage (segregation of duties)

  /**
   * Validates segregation of duties for a proposed action
   * Checks claim history to ensure same user hasn't performed
   * too many sequential critical stages
   */
  async validateSegregation(
    claimId: number,
    userId: number,
    proposedAction: WorkflowAction,
    proposedState?: WorkflowState
  ): Promise<SegregationResult> {
    // Get user's involvement history
    const involvement = await this.getUserInvolvement(claimId, userId);

    // If user hasn't been involved yet, allow
    if (involvement.criticalStageCount === 0) {
      return {
        allowed: true,
        userInvolvement: involvement,
        criticalStagesPerformed: 0,
      };
    }

    // Check if the proposed state is a NEW critical stage
    let wouldAddNewStage = false;
    if (proposedState) {
      const proposedCriticalStage = STATE_TO_CRITICAL_STAGE[proposedState];
      if (proposedCriticalStage) {
        // Check if user has already performed this exact stage
        const hasPerformedThisStage = involvement.stages.some(
          (s) => s.stage === proposedCriticalStage
        );
        wouldAddNewStage = !hasPerformedThisStage;
      }
    }

    // Calculate what the count would be AFTER this action
    const futureCount = wouldAddNewStage 
      ? involvement.criticalStageCount + 1 
      : involvement.criticalStageCount;

    // Check if user would exceed max sequential stages
    if (futureCount > this.maxSequentialStages) {
      return {
        allowed: false,
        reason: `User has already performed ${involvement.criticalStageCount} critical stages on this claim. Performing this action would result in ${futureCount} stages, exceeding maximum allowed: ${this.maxSequentialStages}`,
        userInvolvement: involvement,
        criticalStagesPerformed: involvement.criticalStageCount,
      };
    }

    return {
      allowed: true,
      userInvolvement: involvement,
      criticalStagesPerformed: involvement.criticalStageCount,
    };
  }

  /**
   * Get user's involvement history in a claim
   */
  async getUserInvolvement(
    claimId: number,
    userId: number
  ): Promise<InvolvementHistory> {
    // Query claim_involvement_tracking table
    const db = await getDb();
    if (!db) return { userId, claimId, stages: [], criticalStageCount: 0 };
    
    const involvements = await db.execute(sql`
      SELECT 
        workflow_stage,
        action_type,
        created_at
      FROM claim_involvement_tracking
      WHERE claim_id = ${claimId}
        AND user_id = ${userId}
      ORDER BY created_at ASC
    `);

    // db.execute returns [rows, metadata] for SELECT queries
    const rows = (involvements as any)[0] as Array<Record<string, any>>;
    
    const stages: StageInvolvement[] = rows.map((row) => ({
      stage: row.workflow_stage as CriticalStage,
      action: row.action_type as WorkflowAction,
      timestamp: new Date(row.created_at),
      workflowState: row.workflow_stage as WorkflowState,
    }));

    // Count unique critical stages
    const uniqueCriticalStages = new Set(
      stages.map((s) => s.stage)
    ).size;

    return {
      userId,
      claimId,
      stages,
      criticalStageCount: uniqueCriticalStages,
    };
  }

  /**
   * Track user involvement in a claim stage
   * Called after successful state transition
   */
  async trackInvolvement(
    claimId: number,
    userId: number,
    workflowState: WorkflowState,
    action: WorkflowAction
  ): Promise<void> {
    const criticalStage = STATE_TO_CRITICAL_STAGE[workflowState];

    // Only track if this is a critical stage
    if (!criticalStage) {
      return;
    }

    const db = await getDb();
    if (!db) return;
    
    // Check if user already has involvement in this critical stage
    const existing = await db.execute(sql`
      SELECT id
      FROM claim_involvement_tracking
      WHERE claim_id = ${claimId}
        AND user_id = ${userId}
        AND workflow_stage = ${criticalStage}
      LIMIT 1
    `);

    // Only insert if no existing record for this user + stage combination
    if ((existing as any)[0].length === 0) {
      await db.execute(sql`
        INSERT INTO claim_involvement_tracking (
          claim_id,
          user_id,
          workflow_stage,
          action_type,
          created_at
        ) VALUES (
          ${claimId},
          ${userId},
          ${criticalStage},
          ${action},
          NOW()
        )
      `);
    }
  }

  /**
   * Set maximum sequential stages allowed (for configuration)
   */
  setMaxSequentialStages(max: number): void {
    if (max < 1) {
      throw new Error("Maximum sequential stages must be at least 1");
    }
    this.maxSequentialStages = max;
  }

  /**
   * Check if a specific user-claim combination violates segregation
   */
  async wouldViolateSegregation(
    claimId: number,
    userId: number,
    proposedStage: CriticalStage
  ): Promise<boolean> {
    const involvement = await this.getUserInvolvement(claimId, userId);
    
    // Check if user has already performed this stage
    const hasPerformedStage = involvement.stages.some(
      (s) => s.stage === proposedStage
    );

    if (hasPerformedStage) {
      return false; // Already performed, not a new violation
    }

    // Check if adding this stage would exceed limit
    return involvement.criticalStageCount >= this.maxSequentialStages;
  }
}
