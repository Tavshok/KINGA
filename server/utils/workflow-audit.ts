/**
 * Workflow Audit Trail Utilities
 * 
 * Provides atomic workflow transition logging to ensure
 * every claim state change is recorded in the audit trail.
 */

import { getDb } from "../db";
import { workflowAuditTrail, claims } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type WorkflowState =
  | "created"
  | "intake_verified"
  | "assigned"
  | "under_assessment"
  | "internal_review"
  | "technical_approval"
  | "financial_decision"
  | "payment_authorized"
  | "closed"
  | "disputed";

export type UserRole =
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "insurer_admin";

export interface WorkflowTransitionInput {
  claimId: number;
  userId: number;
  userRole: UserRole;
  previousState: WorkflowState | null;
  newState: WorkflowState;
  comments?: string;
  decisionValue?: number;
  aiScore?: number;
  confidenceScore?: number;
  executiveOverride?: boolean;
  overrideReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Log a workflow transition to the audit trail
 * 
 * This function should be called atomically with state updates
 * to ensure audit trail consistency.
 * 
 * @param input - Workflow transition details
 * @returns The created audit trail record
 */
export async function logWorkflowTransition(input: WorkflowTransitionInput) {
  const db = await getDb();

  const auditRecord = await db.insert(workflowAuditTrail).values({
    claimId: input.claimId,
    userId: input.userId,
    userRole: input.userRole,
    previousState: input.previousState,
    newState: input.newState,
    comments: input.comments,
    decisionValue: input.decisionValue,
    aiScore: input.aiScore,
    confidenceScore: input.confidenceScore,
    executiveOverride: input.executiveOverride ? 1 : 0,
    overrideReason: input.overrideReason,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: new Date(),
  }).returning();

  return auditRecord[0];
}

/**
 * Update claim workflow state and log the transition atomically
 * 
 * This function ensures that state updates and audit logging
 * happen in a single transaction.
 * 
 * @param input - Workflow transition details
 * @returns Object containing updated claim and audit record
 */
export async function updateClaimStateWithAudit(input: WorkflowTransitionInput) {
  const db = await getDb();

  // Start transaction
  return await db.transaction(async (tx) => {
    // Get current state
    const [currentClaim] = await tx
      .select()
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1);

    if (!currentClaim) {
      throw new Error(`Claim ${input.claimId} not found`);
    }

    // Update claim state
    const [updatedClaim] = await tx
      .update(claims)
      .set({
        workflowState: input.newState,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, input.claimId))
      .returning();

    // Log transition
    const [auditRecord] = await tx.insert(workflowAuditTrail).values({
      claimId: input.claimId,
      userId: input.userId,
      userRole: input.userRole,
      previousState: input.previousState || (currentClaim.workflowState as WorkflowState),
      newState: input.newState,
      comments: input.comments,
      decisionValue: input.decisionValue,
      aiScore: input.aiScore,
      confidenceScore: input.confidenceScore,
      executiveOverride: input.executiveOverride ? 1 : 0,
      overrideReason: input.overrideReason,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date(),
    }).returning();

    return {
      claim: updatedClaim,
      auditRecord,
    };
  });
}

/**
 * Get workflow transition history for a claim
 * 
 * @param claimId - The claim ID
 * @returns Array of audit trail records
 */
export async function getClaimWorkflowHistory(claimId: number) {
  const db = await getDb();

  return await db
    .select()
    .from(workflowAuditTrail)
    .where(eq(workflowAuditTrail.claimId, claimId))
    .orderBy(workflowAuditTrail.createdAt);
}
