/**
 * Workflow Integration Layer
 * 
 * Provides high-level functions for integrating the workflow governance engine
 * into tRPC procedures and other application code.
 */

import { getDb } from "../db";
import { WorkflowStateMachine } from "./state-machine";
import { RoutingEngine } from "./routing-engine";
import {
  WorkflowState,
  InsurerRole,
  WorkflowAction,
  TransitionResult,
  WorkflowConfiguration,
} from "./types";

// Singleton instances
const stateMachine = new WorkflowStateMachine();
const routingEngine = new RoutingEngine();

/**
 * Get workflow configuration for a tenant
 */
export async function getWorkflowConfig(tenantId: string): Promise<WorkflowConfiguration> {
  return await routingEngine.getConfiguration(tenantId);
}

/**
 * Update workflow configuration for a tenant
 */
export async function updateWorkflowConfig(config: Partial<WorkflowConfiguration> & { tenantId: string }): Promise<void> {
  const db = getDb();
  const { tenantId, ...settings } = config;
  
  await db.execute(
    `INSERT INTO workflow_configuration 
     (tenant_id, risk_manager_enabled, high_value_threshold, executive_review_threshold, 
      ai_fast_track_enabled, external_assessor_enabled, max_sequential_stages_by_user)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       risk_manager_enabled = VALUES(risk_manager_enabled),
       high_value_threshold = VALUES(high_value_threshold),
       executive_review_threshold = VALUES(executive_review_threshold),
       ai_fast_track_enabled = VALUES(ai_fast_track_enabled),
       external_assessor_enabled = VALUES(external_assessor_enabled),
       max_sequential_stages_by_user = VALUES(max_sequential_stages_by_user),
       updated_at = CURRENT_TIMESTAMP`,
    [
      tenantId,
      settings.riskManagerEnabled ?? true,
      settings.highValueThreshold ?? 1000000,
      settings.executiveReviewThreshold ?? 5000000,
      settings.aiFastTrackEnabled ?? false,
      settings.externalAssessorEnabled ?? false,
      settings.maxSequentialStagesByUser ?? 2,
    ]
  );
}

/**
 * Transition a claim to a new workflow state with full governance validation
 */
export async function transitionClaimState(params: {
  claimId: number;
  userId: number;
  userRole: InsurerRole;
  tenantId: string;
  to: WorkflowState;
  action: WorkflowAction;
  comments?: string;
}): Promise<TransitionResult> {
  const { claimId, userId, userRole, tenantId, to, action, comments } = params;
  
  // Get current claim state
  const db = getDb();
  const [claim] = await db.query.claims.findMany({
    where: (claims, { eq }) => eq(claims.id, claimId),
    limit: 1,
  });
  
  if (!claim) {
    return {
      success: false,
      newState: to,
      auditRecordId: 0,
      errors: [{ code: "CLAIM_NOT_FOUND", message: "Claim not found" }],
    };
  }
  
  const from = claim.workflowState as WorkflowState;
  
  // Validate transition
  const validation = stateMachine.validateTransition(from, to, userRole, {
    claimId,
    userId,
    userRole,
  });
  
  if (!validation.valid) {
    return {
      success: false,
      newState: from,
      auditRecordId: 0,
      errors: validation.errors,
    };
  }
  
  // Perform transition
  const result = await stateMachine.transition(from, to, userRole, {
    claimId,
    userId,
    userRole,
    action,
    comments,
  });
  
  return result;
}
