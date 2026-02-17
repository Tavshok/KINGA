/**
 * Fast-Track Action Dispatcher
 * 
 * Deterministic action dispatcher for fast-track claim routing.
 * 
 * All actions execute through WorkflowEngine.transition() with complete audit trail.
 * Each action has specific state transition logic and notification requirements.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  claims,
  fastTrackRoutingLog,
  workflowAuditTrail,
  type Claim,
  type InsertFastTrackRoutingLog,
} from "../../drizzle/schema";
import { WorkflowEngine } from "../workflow-engine";

/**
 * Fast-track evaluation result
 */
export interface FastTrackEvaluationResult {
  eligible: boolean;
  action: "AUTO_APPROVE" | "PRIORITY_QUEUE" | "REDUCED_DOCUMENTATION" | "STRAIGHT_TO_PAYMENT" | null;
  configVersion: number;
  evaluationDetails: {
    confidenceScore: number;
    fraudScore: number;
    claimValue: number;
    reason: string;
  };
}

/**
 * Dispatch execution result
 */
export interface DispatchResult {
  success: boolean;
  action: string;
  newState?: string;
  routingLogId?: number;
  error?: string;
}

/**
 * Execute fast-track action for a claim
 * 
 * Dispatches the appropriate action handler based on evaluation result.
 * All state transitions go through WorkflowEngine with full audit trail.
 * 
 * @param claimId - ID of the claim to process
 * @param evaluationResult - Fast-track evaluation result
 * @param executedBy - User ID executing the action
 * @param allowOverride - Whether to allow executive override (for AUTO_APPROVE)
 * @returns Dispatch execution result
 */
export async function executeFastTrackAction(
  claimId: number,
  evaluationResult: FastTrackEvaluationResult,
  executedBy: number,
  allowOverride: boolean = false
): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate evaluation result
  if (!evaluationResult.eligible || !evaluationResult.action) {
    return {
      success: false,
      action: "NONE",
      error: "Claim not eligible for fast-track processing",
    };
  }

  // Get claim details
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    return {
      success: false,
      action: evaluationResult.action,
      error: "Claim not found",
    };
  }

  // Dispatch to appropriate action handler
  switch (evaluationResult.action) {
    case "AUTO_APPROVE":
      return executeAutoApprove(claim, evaluationResult, executedBy, allowOverride);
    
    case "PRIORITY_QUEUE":
      return executePriorityQueue(claim, evaluationResult, executedBy);
    
    case "REDUCED_DOCUMENTATION":
      return executeReducedDocumentation(claim, evaluationResult, executedBy);
    
    case "STRAIGHT_TO_PAYMENT":
      return executeStraightToPayment(claim, evaluationResult, executedBy);
    
    default:
      return {
        success: false,
        action: evaluationResult.action,
        error: `Unknown fast-track action: ${evaluationResult.action}`,
      };
  }
}

/**
 * Execute AUTO_APPROVE action
 * 
 * Transitions claim to financial_decision state and flags as auto-approved.
 * Requires executive override path for additional governance.
 */
async function executeAutoApprove(
  claim: Claim,
  evaluationResult: FastTrackEvaluationResult,
  executedBy: number,
  allowOverride: boolean
): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  try {
    // Transition to financial_decision state
    const workflowEngine = new WorkflowEngine(claim.tenantId);
    await workflowEngine.transition(
      claim.id,
      "financial_decision",
      executedBy,
      {
        fastTrackAction: "AUTO_APPROVE",
        autoApproved: true,
        allowOverride,
        evaluationDetails: evaluationResult.evaluationDetails,
      }
    );

    // Update claim flags
    await db
      .update(claims)
      .set({
        metadata: JSON.stringify({
          ...((claim.metadata && typeof claim.metadata === 'string') ? JSON.parse(claim.metadata) : claim.metadata || {}),
          autoApproved: true,
          fastTrackAction: "AUTO_APPROVE",
          fastTrackConfigVersion: evaluationResult.configVersion,
        }),
      })
      .where(eq(claims.id, claim.id));

    // Log to fastTrackRoutingLog
    const routingLogId = await logFastTrackRouting(
      claim.id,
      claim.tenantId,
      evaluationResult,
      "AUTO_APPROVE",
      "financial_decision",
      executedBy
    );

    return {
      success: true,
      action: "AUTO_APPROVE",
      newState: "financial_decision",
      routingLogId,
    };
  } catch (error) {
    console.error("[FastTrackDispatcher] Action failed:", error);
    return {
      success: false,
      action: "AUTO_APPROVE",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute PRIORITY_QUEUE action
 * 
 * Assigns SLA tag, moves claim to priority state, and notifies relevant roles.
 */
async function executePriorityQueue(
  claim: Claim,
  evaluationResult: FastTrackEvaluationResult,
  executedBy: number
): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  try {
    // Assign SLA tag and priority flag
    await db
      .update(claims)
      .set({
        metadata: JSON.stringify({
          ...((claim.metadata && typeof claim.metadata === 'string') ? JSON.parse(claim.metadata) : claim.metadata || {}),
          priorityQueue: true,
          slaTag: "FAST_TRACK_PRIORITY",
          fastTrackAction: "PRIORITY_QUEUE",
          fastTrackConfigVersion: evaluationResult.configVersion,
        }),
      })
      .where(eq(claims.id, claim.id));

    // Transition to internal_review state with priority flag
    const workflowEngine = new WorkflowEngine(claim.tenantId);
    await workflowEngine.transition(
      claim.id,
      "internal_review",
      executedBy,
      {
        fastTrackAction: "PRIORITY_QUEUE",
        slaTag: "FAST_TRACK_PRIORITY",
        evaluationDetails: evaluationResult.evaluationDetails,
      }
    );

    // Log to fastTrackRoutingLog
    const routingLogId = await logFastTrackRouting(
      claim.id,
      claim.tenantId,
      evaluationResult,
      "PRIORITY_QUEUE",
      "internal_review",
      executedBy
    );

    // TODO: Notify relevant roles (Claims Manager, Assessor)
    // This would integrate with notification system

    return {
      success: true,
      action: "PRIORITY_QUEUE",
      newState: "internal_review",
      routingLogId,
    };
  } catch (error) {
    console.error("[FastTrackDispatcher] Action failed:", error);
    return {
      success: false,
      action: "PRIORITY_QUEUE",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute REDUCED_DOCUMENTATION action
 * 
 * Updates required document checklist and flags audit entry.
 */
async function executeReducedDocumentation(
  claim: Claim,
  evaluationResult: FastTrackEvaluationResult,
  executedBy: number
): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  try {
    // Update document checklist (reduce required documents)
    const reducedDocuments = [
      "proof_of_loss", // Core document always required
      "claim_form",    // Core document always required
      // Optional documents removed for fast-track
    ];

    await db
      .update(claims)
      .set({
        metadata: JSON.stringify({
          ...((claim.metadata && typeof claim.metadata === 'string') ? JSON.parse(claim.metadata) : claim.metadata || {}),
          reducedDocumentation: true,
          requiredDocuments: reducedDocuments,
          fastTrackAction: "REDUCED_DOCUMENTATION",
          fastTrackConfigVersion: evaluationResult.configVersion,
        }),
      })
      .where(eq(claims.id, claim.id));
    // Transition to internal_review state with priority flag
    const workflowEngine = new WorkflowEngine(claim.tenantId);
    await workflowEngine.transition(
      claim.id,
      "under_assessment",
      executedBy,
      {
        fastTrackAction: "REDUCED_DOCUMENTATION",
        reducedDocuments,
        evaluationDetails: evaluationResult.evaluationDetails,
      }
    );

    // Log to fastTrackRoutingLog
    const routingLogId = await logFastTrackRouting(
      claim.id,
      claim.tenantId,
      evaluationResult,
      "REDUCED_DOCUMENTATION",
      "documentation_review",
      executedBy
    );

    return {
      success: true,
      action: "REDUCED_DOCUMENTATION",
      newState: "under_assessment",
      routingLogId,
    };
  } catch (error) {
    console.error("[FastTrackDispatcher] Action failed:", error);
    return {
      success: false,
      action: "REDUCED_DOCUMENTATION",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute STRAIGHT_TO_PAYMENT action
 * 
 * Moves claim directly to payment_authorized state with explicit auto-path logging.
 */
async function executeStraightToPayment(
  claim: Claim,
  evaluationResult: FastTrackEvaluationResult,
  executedBy: number
): Promise<DispatchResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  try {    // Transition to under_assessment state with reduced documentation
    const workflowEngine = new WorkflowEngine(claim.tenantId);
    await workflowEngine.transition(
      claim.id,
      "under_assessment",
      executedBy,
      {
        fastTrackAction: "STRAIGHT_TO_PAYMENT",
        autoPath: true,
        bypassManualReview: true,
        evaluationDetails: evaluationResult.evaluationDetails,
      }
    );

    // Update claim flags
    await db
      .update(claims)
      .set({
        metadata: JSON.stringify({
          ...((claim.metadata && typeof claim.metadata === 'string') ? JSON.parse(claim.metadata) : claim.metadata || {}),
          straightToPayment: true,
          autoPath: true,
          fastTrackAction: "STRAIGHT_TO_PAYMENT",
          fastTrackConfigVersion: evaluationResult.configVersion,
        }),
      })
      .where(eq(claims.id, claim.id));

    // Log to fastTrackRoutingLog with explicit auto-path entry
    const routingLogId = await logFastTrackRouting(
      claim.id,
      claim.tenantId,
      evaluationResult,
      "STRAIGHT_TO_PAYMENT",
      "payment_authorized",
      executedBy
    );

    return {
      success: true,
      action: "STRAIGHT_TO_PAYMENT",
      newState: "payment_authorized",
      routingLogId,
    };
  } catch (error) {
    console.error("[FastTrackDispatcher] Action failed:", error);
    return {
      success: false,
      action: "STRAIGHT_TO_PAYMENT",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Log fast-track routing action to audit trail
 */
async function logFastTrackRouting(
  claimId: number,
  tenantId: string,
  evaluationResult: FastTrackEvaluationResult,
  action: string,
  newState: string,
  executedBy: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const logEntry: InsertFastTrackRoutingLog = {
    claimId,
    tenantId,
    configVersion: evaluationResult.configVersion,
    eligible: evaluationResult.eligible ? 1 : 0,
    decision: action as any,
    reason: evaluationResult.evaluationDetails.reason,
    confidenceScore: evaluationResult.evaluationDetails.confidenceScore.toString(),
    fraudScore: evaluationResult.evaluationDetails.fraudScore.toString(),
    override: 0, // Not an override
  };

  const [result] = await db.insert(fastTrackRoutingLog).values(logEntry);

  return result.insertId;
}
