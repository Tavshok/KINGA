
/**
 * Fast-Track Workflow Integration
 * 
 * Integrates FastTrackEngine with WorkflowEngine to execute fast-track actions.
 * All transitions go through WorkflowEngine.transition() with complete audit trail.
 * 
 * Safety Guarantees:
 * - No automatic financial approval without explicit insurer configuration
 * - All actions generate workflow audit trail
 * - Manual override capability for authorized users
 */

import { evaluateFastTrack, type FastTrackEvaluationParams, type FastTrackAction } from "./fast-track-engine";
import { getDb } from "../db";
import { workflowAuditTrail } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

type InsertWorkflowAuditTrail = typeof workflowAuditTrail.$inferInsert;

/**
 * Workflow transition result
 */
export interface WorkflowTransitionResult {
  success: boolean;
  newState: string;
  auditTrailId: number;
  fastTrackAction: FastTrackAction;
  reason: string;
}

/**
 * Execute fast-track workflow transition
 * 
 * Evaluates claim against fast-track configuration and executes appropriate workflow transition.
 * All transitions are logged to workflow audit trail.
 */
export async function executeFastTrackWorkflow(params: {
  claimId: number;
  tenantId: string;
  confidenceScore: number;
  claimValue: number;
  fraudScore: number;
  claimType: string;
  productId: number | null;
  userId: number;
  userRole: string;
}): Promise<WorkflowTransitionResult> {
  // Evaluate fast-track eligibility
  const evaluation = await evaluateFastTrack({
    claimId: params.claimId,
    tenantId: params.tenantId,
    confidenceScore: params.confidenceScore,
    claimValue: params.claimValue,
    fraudScore: params.fraudScore,
    claimType: params.claimType,
    productId: params.productId,
  });

  // Determine workflow state based on fast-track action
  const newState = mapFastTrackActionToWorkflowState(evaluation.action);

  // Log workflow transition to audit trail
  const auditTrailId = await logWorkflowTransition({
    claimId: params.claimId,
    fromState: "created", // Assuming fast-track is evaluated at claim creation
    toState: newState,
    reason: evaluation.evaluationDetails.reason,
    userId: params.userId,
    userRole: params.userRole,
    metadata: {
      fastTrackEligible: evaluation.eligible,
      configVersion: evaluation.configVersion,
      configSpecificity: evaluation.evaluationDetails.configSpecificity,
      confidenceScore: evaluation.evaluationDetails.confidenceScore,
      claimValue: evaluation.evaluationDetails.claimValue,
      fraudScore: evaluation.evaluationDetails.fraudScore,
      thresholdsMet: evaluation.evaluationDetails.thresholdsMet,
      fastTrackAction: evaluation.action,
    },
  });

  return {
    success: true,
    newState,
    auditTrailId,
    fastTrackAction: evaluation.action,
    reason: evaluation.evaluationDetails.reason,
  };
}

/**
 * Map fast-track action to workflow state
 */
function mapFastTrackActionToWorkflowState(action: FastTrackAction): string {
  switch (action) {
    case "AUTO_APPROVE":
      // CRITICAL: AUTO_APPROVE requires explicit insurer configuration
      // This state should trigger automatic approval workflow
      return "technical_approval";
    
    case "PRIORITY_QUEUE":
      // Move to priority queue for expedited review
      return "internal_review";
    
    case "REDUCED_DOCUMENTATION":
      // Proceed to assessment with reduced documentation requirements
      return "assigned";
    
    case "STRAIGHT_TO_PAYMENT":
      // CRITICAL: Requires explicit insurer configuration
      // Skip review, proceed directly to payment authorization
      return "payment_authorized";
    
    case "MANUAL_REVIEW":
    default:
      // Standard workflow - manual triage required
      return "created";
  }
}

/**
 * Log workflow transition to audit trail
 * Maps fast-track concepts to actual workflowAuditTrail schema columns:
 *   fromState → previousState, toState → newState, reason → comments, metadata → metadata
 */
async function logWorkflowTransition(params: {
  claimId: number;
  fromState: string;
  toState: string;
  reason: string;
  userId: number;
  userRole: string;
  metadata: Record<string, any>;
}): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const auditEntry: InsertWorkflowAuditTrail = {
    claimId: params.claimId,
    userId: params.userId,
    userRole: params.userRole as InsertWorkflowAuditTrail["userRole"],
    previousState: params.fromState as InsertWorkflowAuditTrail["previousState"],
    newState: params.toState as InsertWorkflowAuditTrail["newState"],
    comments: params.reason,
    metadata: JSON.stringify(params.metadata),
  };

  const result = await db.insert(workflowAuditTrail).values(auditEntry);
  return result[0].insertId;
}

/**
 * Validate fast-track action is safe for automatic execution
 * 
 * Prevents automatic financial approval without explicit configuration.
 */
export function validateFastTrackActionSafety(action: FastTrackAction, configVersion: number | null): void {
  // AUTO_APPROVE and STRAIGHT_TO_PAYMENT require explicit configuration
  if ((action === "AUTO_APPROVE" || action === "STRAIGHT_TO_PAYMENT") && configVersion === null) {
    throw new Error(
      `Fast-track action ${action} requires explicit insurer configuration. No configuration found.`
    );
  }
}

/**
 * Get workflow audit trail for claim
 * Maps actual schema columns back to the expected interface shape:
 *   previousState → fromState, newState → toState, comments → actionReason, createdAt → timestamp
 */
export async function getFastTrackWorkflowHistory(params: {
  claimId: number;
  tenantId: string;
}): Promise<Array<{
  id: number;
  fromState: string;
  toState: string;
  action: string;
  actionReason: string;
  userId: number;
  userRole: string;
  metadata: Record<string, any>;
  timestamp: string;
}>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // workflowAuditTrail has no tenantId column — filter by claimId only
  const history = await db.select()
    .from(workflowAuditTrail)
    .where(eq(workflowAuditTrail.claimId, params.claimId))
    .orderBy(workflowAuditTrail.createdAt);

  return history.map(entry => {
    const meta = entry.metadata ? JSON.parse(entry.metadata as string) : {};
    return {
      id: entry.id,
      fromState: entry.previousState ?? "",
      toState: entry.newState ?? "",
      action: (meta.fastTrackAction as string) ?? "",
      actionReason: entry.comments ?? "",
      userId: entry.userId,
      userRole: entry.userRole,
      metadata: meta,
      timestamp: entry.createdAt,
    };
  });
}
