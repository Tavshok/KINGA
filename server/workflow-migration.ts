// @ts-nocheck
/**
 * Workflow Migration Helper
 * 
 * Maps old `status` field values to new `workflowState` governance enum
 * Provides backward compatibility during migration period
 */

import type { WorkflowState } from "./rbac";

/**
 * Old status enum values (legacy)
 */
export type LegacyStatus =
  | "submitted"
  | "triage"
  | "assessment_pending"
  | "assessment_in_progress"
  | "intake_pending"
  | "assessment_complete"
  | "quotes_pending"
  | "comparison"
  | "repair_assigned"
  | "repair_in_progress"
  | "completed"
  | "rejected"  
  | "closed";

/**
 * Mapping from legacy status to governance workflowState
 */
export const STATUS_TO_WORKFLOW_STATE: Record<LegacyStatus, WorkflowState> = {
  submitted: "created",
  triage: "created",
  intake_pending: "created",
  assessment_pending: "assigned",
  assessment_in_progress: "under_assessment",
  assessment_complete: "internal_review",
  quotes_pending: "internal_review",
  comparison: "technical_approval",
  repair_assigned: "financial_decision",
  repair_in_progress: "payment_authorized",
  completed: "closed",
  rejected: "closed",
  closed: "closed",
};

/**
 * Reverse mapping from workflowState to legacy status (for backward compatibility)
 */
export const WORKFLOW_STATE_TO_STATUS: Record<WorkflowState, LegacyStatus> = {
  created: "submitted",
  assigned: "assessment_pending",
  under_assessment: "assessment_in_progress",
  internal_review: "quotes_pending",
  technical_approval: "comparison",
  financial_decision: "repair_assigned",
  payment_authorized: "repair_in_progress",
  closed: "completed",
  disputed: "comparison", // Map disputed back to comparison for legacy UI
};

/**
 * Convert legacy status to workflowState
 */
export function statusToWorkflowState(status: LegacyStatus): WorkflowState {
  return STATUS_TO_WORKFLOW_STATE[status];
}

/**
 * Convert workflowState to legacy status (for backward compatibility)
 */
export function workflowStateToStatus(state: WorkflowState): LegacyStatus {
  return WORKFLOW_STATE_TO_STATUS[state];
}
