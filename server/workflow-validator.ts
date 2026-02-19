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
  | "assessment_pending"
  | "assessment_in_progress"
  | "quotes_pending"
  | "comparison"
  | "repair_assigned"
  | "repair_in_progress"
  | "completed"
  | "rejected";

/**
 * Map of allowed state transitions
 * 
 * Each key is a source status, and the value is an array of valid target statuses.
 * This enforces the linear workflow progression and prevents invalid state jumps.
 */
export const ALLOWED_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  // Initial submission can go to triage or assessment
  submitted: ["triage", "assessment_pending", "rejected"],
  
  // Triage can route to assessment or rejection
  triage: ["assessment_pending", "rejected"],
  
  // Assessment pending can start assessment or be rejected
  assessment_pending: ["assessment_in_progress", "rejected"],
  
  // Assessment in progress can complete to quotes or be rejected
  assessment_in_progress: ["quotes_pending", "rejected"],
  
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
