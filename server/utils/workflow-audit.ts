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
  metadata?: Record<string, unknown>;
}

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Log a workflow transition to the audit trail.
 * MySQL/Drizzle does not support .returning() — use $returningId() or re-select.
 */
export async function logWorkflowTransition(input: WorkflowTransitionInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db.insert(workflowAuditTrail).values({
    claimId: input.claimId,
    userId: input.userId,
    userRole: input.userRole,
    previousState: input.previousState ?? undefined,
    newState: input.newState,
    comments: input.comments,
    decisionValue: input.decisionValue,
    aiScore: input.aiScore,
    confidenceScore: input.confidenceScore,
    executiveOverride: input.executiveOverride ? 1 : 0,
    overrideReason: input.overrideReason,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: nowStr(),
  }).$returningId();

  return result[0] ?? null;
}

/**
 * Update claim workflow state and log the transition atomically.
 */
export async function updateClaimStateWithAudit(input: WorkflowTransitionInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

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

    // Update claim state (no .returning() in MySQL Drizzle)
    await tx
      .update(claims)
      .set({
        workflowState: input.newState,
        updatedAt: nowStr(),
      })
      .where(eq(claims.id, input.claimId));

    // Re-fetch updated claim
    const [updatedClaim] = await tx
      .select()
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1);

    // Log transition
    const auditResult = await tx.insert(workflowAuditTrail).values({
      claimId: input.claimId,
      userId: input.userId,
      userRole: input.userRole,
      previousState: input.previousState ?? (currentClaim.workflowState as WorkflowState) ?? undefined,
      newState: input.newState,
      comments: input.comments,
      decisionValue: input.decisionValue,
      aiScore: input.aiScore,
      confidenceScore: input.confidenceScore,
      executiveOverride: input.executiveOverride ? 1 : 0,
      overrideReason: input.overrideReason,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: nowStr(),
    }).$returningId();

    return {
      claim: updatedClaim,
      auditRecordId: auditResult[0] ?? null,
    };
  });
}

/**
 * Get workflow transition history for a claim.
 */
export async function getClaimWorkflowHistory(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(workflowAuditTrail)
    .where(eq(workflowAuditTrail.claimId, claimId))
    .orderBy(workflowAuditTrail.createdAt);
}
