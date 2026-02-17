/**
 * Test Helpers for Workflow Engine
 * 
 * Provides utilities for setting up claim states in test environments
 */

import { transition, WorkflowEngine } from "../workflow-engine";
import { WorkflowState } from "../rbac";
import { InsurerRole } from "../workflow/types";

/**
 * Test user context for workflow operations
 */
export const TEST_USER = {
  id: 999,
  role: "claims_processor" as InsurerRole,
  tenantId: "test-tenant-001",
};

/**
 * Setup claim state for testing
 * Uses WorkflowEngine to ensure governance rules are followed even in tests
 */
export async function setupTestClaimState(
  claimId: number,
  targetState: WorkflowState,
  options?: {
    userId?: number;
    userRole?: InsurerRole;
    tenantId?: string;
  }
): Promise<void> {
  const workflowEngine = new WorkflowEngine(options?.tenantId ?? TEST_USER.tenantId);
  
  const userId = options?.userId ?? TEST_USER.id;
  const userRole = options?.userRole ?? TEST_USER.role;
  const tenantId = options?.tenantId ?? TEST_USER.tenantId;

  // Define state progression path
  const statePath: WorkflowState[] = [
    "created",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
  ];

  // Find target state index
  const targetIndex = statePath.indexOf(targetState);
  if (targetIndex === -1) {
    throw new Error(`Invalid target state: ${targetState}`);
  }

  // Transition through each state up to target
  let currentState: WorkflowState = "created";
  
  for (let i = 1; i <= targetIndex; i++) {
    const nextState = statePath[i];
    
    await workflowEngine.transition(
      claimId,
      nextState,
      userId,
      {}
    );
    
    currentState = nextState;
  }
}

/**
 * Map legacy status enum to new workflowState enum
 * Used during migration period
 */
export function mapStatusToWorkflowState(status: string): WorkflowState {
  const mapping: Record<string, WorkflowState> = {
    // Legacy status → New workflowState
    submitted: "created",
    triage: "created",
    intake_verified: "assigned",
    assessment_pending: "assigned",
    assessment_in_progress: "under_assessment",
    quotes_pending: "internal_review",
    comparison: "technical_approval",
    approved: "financial_decision",
    repair_assigned: "payment_authorized",
    repair_in_progress: "payment_authorized",
    repair_completed: "closed",
    completed: "closed",
    closed: "closed",
    disputed: "disputed",
  };

  const workflowState = mapping[status];
  if (!workflowState) {
    throw new Error(`Unknown status: ${status}. Cannot map to workflowState.`);
  }

  return workflowState;
}

/**
 * Reset claim to initial state for testing
 */
export async function resetTestClaimState(
  claimId: number,
  options?: {
    userId?: number;
    userRole?: InsurerRole;
    tenantId?: string;
  }
): Promise<void> {
  // This would typically use database direct update for test cleanup
  // But for governance testing, we should use WorkflowEngine even for resets
  const workflowEngine = new WorkflowEngine(options?.tenantId ?? TEST_USER.tenantId);
  
  const userId = options?.userId ?? TEST_USER.id;
  const userRole = options?.userRole ?? TEST_USER.role;
  const tenantId = options?.tenantId ?? TEST_USER.tenantId;

  // Get current state and transition back to created
  // Note: This may require executive override in production
  await workflowEngine.transition(
    claimId,
    "created",
    userId,
    {}
  );
}
