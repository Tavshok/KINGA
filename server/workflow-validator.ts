// @ts-nocheck
/**
 * Workflow State Transition Validator
 * 
 * Enforces valid state transitions in the claims workflow to prevent
 * invalid state jumps and maintain workflow integrity.
 * 
 * @module workflow-validator
 */

import { TRPCError } from "@trpc/server";

/**
 * Claim status types from the database schema
 */
export type ClaimStatus = 
  | "submitted"
  | "triage"
  | "intake_pending"
  | "assessment_pending"
  | "assessment_in_progress"
  | "assessment_complete"
  | "quotes_pending"
  | "comparison"
  | "repair_assigned"
  | "repair_in_progress"
  | "completed"
  | "rejected"  
  | "closed"
  // Document Reliability Architecture (DRA) states — 2026-07-14
  // Success path: document_validating → document_ready → analysis_running → analysis_complete
  // Failure path: document_failed → recovery_attempted → human_review_required
  | "document_validating"
  | "document_ready"
  | "analysis_running"
  | "analysis_complete"
  | "document_failed"
  | "recovery_attempted"
  | "human_review_required";

/**
 * Map of allowed state transitions
 * 
 * Each key is a source status, and the value is an array of valid target statuses.
 * This enforces the linear workflow progression and prevents invalid state jumps.
 */
export const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  // Initial submission can go to triage or assessment
  submitted: ["triage", "assessment_pending", "document_validating", "rejected"],
  
  // Triage can route to assessment or rejection
  triage: ["assessment_pending", "document_validating", "rejected"],
  
  // Intake pending (from document ingestion) — can go to assessment_pending (assign assessor),
  // assessment_in_progress (AI triggered), document_validating (DRA path), or rejected
  intake_pending: ["assessment_pending", "assessment_in_progress", "document_validating", "rejected"],
  
  // Assessment pending can start assessment or be rejected
  assessment_pending: ["assessment_in_progress", "document_validating", "rejected"],
  
  // Assessment in progress can complete to assessment_complete, quotes_pending, or be rejected
  assessment_in_progress: ["assessment_complete", "quotes_pending", "rejected"],
  
  // Assessment complete can move to quotes_pending, comparison, or be rejected
  assessment_complete: ["quotes_pending", "comparison", "rejected"],
  
  // Quotes pending can move to comparison or be rejected
  quotes_pending: ["comparison", "rejected"],
  
  // Comparison can approve (repair assigned) or reject
  comparison: ["repair_assigned", "rejected"],
  
  // Repair assigned can start repair or be rejected
  repair_assigned: ["repair_in_progress", "rejected"],
  
  // Repair in progress can complete or be rejected
  repair_in_progress: ["completed", "rejected"],
  
  // Terminal states - no transitions allowed
  completed: [],
  rejected: [],
  closed: [],

  // ── Document Reliability Architecture (DRA) states ──────────────────────────
  // Success path: document_validating → document_ready → analysis_running → analysis_complete
  // Failure path: document_failed → recovery_attempted → human_review_required
  // INVARIANT: document_failed MUST NEVER transition to analysis_complete

  // Validating: can proceed to ready, fail, or be rejected
  document_validating: ["document_ready", "document_failed", "rejected"],

  // Ready: evidence validated — start analysis or fail
  document_ready: ["analysis_running", "document_failed", "rejected"],

  // Analysis running: pipeline executing — complete or fail
  analysis_running: ["analysis_complete", "document_failed", "rejected"],

  // Analysis complete: success terminal — can proceed to quotes or comparison
  analysis_complete: ["quotes_pending", "comparison", "assessment_complete", "rejected"],

  // Document failed: primary path failed — attempt recovery or escalate
  document_failed: ["recovery_attempted", "human_review_required", "rejected"],

  // Recovery attempted: recovery ran — can succeed (back to validating) or escalate
  recovery_attempted: ["document_validating", "human_review_required", "rejected"],

  // Human review required: terminal failure state — awaiting manual intervention
  human_review_required: ["document_validating", "rejected"],
};

/**
 * Validates whether a state transition is allowed
 * 
 * @param fromStatus - Current claim status
 * @param toStatus - Target claim status
 * @returns true if transition is valid
 * @throws TRPCError with code 'BAD_REQUEST' if transition is invalid
 * 
 * @example
 * ```typescript
 * // Valid transition
 * validateStateTransition("submitted", "assessment_pending"); // returns true
 * 
 * // Invalid transition
 * validateStateTransition("submitted", "completed"); // throws TRPCError
 * ```
 */
export function validateStateTransition(
  fromStatus: ClaimStatus,
  toStatus: ClaimStatus
): boolean {
  // Allow staying in the same state (no-op updates)
  if (fromStatus === toStatus) {
    return true;
  }
  
  // Check if transition is allowed
  const allowedTargets = ALLOWED_TRANSITIONS[fromStatus];
  
  if (!allowedTargets || !allowedTargets.includes(toStatus)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid state transition: Cannot transition from '${fromStatus}' to '${toStatus}'. ` +
               `Allowed transitions from '${fromStatus}': ${allowedTargets?.join(", ") || "none (terminal state)"}`,
    });
  }
  
  return true;
}

/**
 * Gets all valid next states for a given status
 * 
 * @param fromStatus - Current claim status
 * @returns Array of valid target statuses
 * 
 * @example
 * ```typescript
 * getValidNextStates("submitted"); // ["triage", "assessment_pending", "rejected"]
 * getValidNextStates("completed"); // []
 * ```
 */
export function getValidNextStates(fromStatus: ClaimStatus): ClaimStatus[] {
  return ALLOWED_TRANSITIONS[fromStatus] || [];
}

/**
 * Checks if a state is a terminal state (no outgoing transitions)
 * 
 * @param status - Claim status to check
 * @returns true if status is terminal
 * 
 * @example
 * ```typescript
 * isTerminalState("completed"); // true
 * isTerminalState("rejected"); // true
 * isTerminalState("submitted"); // false
 * ```
 */
export function isTerminalState(status: ClaimStatus): boolean {
  const allowedTargets = ALLOWED_TRANSITIONS[status];
  return !allowedTargets || allowedTargets.length === 0;
}

/**
 * Validates a complete workflow path
 * 
 * @param statusPath - Array of statuses representing a workflow path
 * @returns true if all transitions in the path are valid
 * @throws TRPCError if any transition is invalid
 * 
 * @example
 * ```typescript
 * // Valid path
 * validateWorkflowPath([
 *   "submitted",
 *   "assessment_pending",
 *   "assessment_in_progress",
 *   "quotes_pending",
 *   "comparison",
 *   "repair_assigned",
 *   "repair_in_progress",
 *   "completed"
 * ]); // returns true
 * 
 * // Invalid path
 * validateWorkflowPath(["submitted", "completed"]); // throws TRPCError
 * ```
 */
export function validateWorkflowPath(statusPath: ClaimStatus[]): boolean {
  if (statusPath.length < 2) {
    return true; // Single status or empty path is valid
  }
  
  for (let i = 0; i < statusPath.length - 1; i++) {
    const fromStatus = statusPath[i];
    const toStatus = statusPath[i + 1];
    validateStateTransition(fromStatus, toStatus);
  }
  
  return true;
}
