/**
 * Workflow Integration Layer
 * 
 * Provides helper functions to integrate the workflow governance engine
 * into existing tRPC procedures without breaking existing functionality.
 */

import { WorkflowStateMachine } from "./state-machine";
import { RoutingEngine } from "./routing-engine";
import { RBACEngine } from "./rbac";
import {
  WorkflowState,
  InsurerRole,
  WorkflowAction,
  Permission,
  TransitionResult,
} from "./types";

/**
 * Singleton instances of workflow engines
 */
const stateMachine = new WorkflowStateMachine();
const routingEngine = new RoutingEngine();
const rbacEngine = new RBACEngine();

/**
 * Transition a claim to a new state with full governance validation
 * 
 * @example
 * ```ts
 * const result = await transitionClaimState({
 *   claimId: 123,
 *   userId: 456,
 *   userRole: "claims_processor",
 *   tenantId: "tenant_123",
 *   to: "assigned",
 *   action: "transition_state",
 *   comments: "Assigned to assessor John",
 * });
 * 
 * if (!result.success) {
 *   throw new TRPCError({
 *     code: "BAD_REQUEST",
 *     message: result.errors[0].message,
 *   });
 * }
 * ```
 */
export async function transitionClaimState(params: {
  claimId: number;
  userId: number;
  userRole: InsurerRole;
  tenantId: string;
  to: WorkflowState;
  action: WorkflowAction;
  comments?: string;
  additionalData?: Record<string, unknown>;
}): Promise<TransitionResult> {
  const { claimId, userId, userRole, tenantId, to, action, comments, additionalData } = params;

  // Execute transition with full governance checks
  return await stateMachine.executeTransition(
    claimId,
    to,
    userId,
    userRole,
    {
      comments,
      additionalData: {
        ...additionalData,
        action,
        tenantId,
      },
    }
  );
}

/**
 * Check if a user has permission to perform an action
 * 
 * @example
 * ```ts
 * const canApprove = await checkPermission({
 *   userId: 123,
 *   userRole: "claims_manager",
 *   permission: "authorize_payment",
 *   claimId: 456,
 *   tenantId: "tenant_123",
 * });
 * 
 * if (!canApprove) {
 *   throw new TRPCError({
 *     code: "FORBIDDEN",
 *     message: "You don't have permission to authorize payments",
 *   });
 * }
 * ```
 */
export async function checkPermission(params: {
  userId: number;
  userRole: InsurerRole;
  permission: Permission;
  claimId?: number;
  tenantId: string;
}): Promise<boolean> {
  const { userId, userRole, permission, claimId, tenantId } = params;

  return rbacEngine.hasPermission(userRole, permission, {
    claimId,
    tenantId,
  });
}

/**
 * Check if a user can access a claim in a specific state
 * 
 * @example
 * ```ts
 * const canView = await canAccessClaimState({
 *   userRole: "assessor_internal",
 *   claimState: "under_assessment",
 * });
 * 
 * if (!canView) {
 *   throw new TRPCError({
 *     code: "FORBIDDEN",
 *     message: "You cannot access claims in this state",
 *   });
 * }
 * ```
 */
export function canAccessClaimState(params: {
  userRole: InsurerRole;
  claimState: WorkflowState;
}): boolean {
  const { userRole, claimState } = params;
  return rbacEngine.canAccessState(userRole, claimState);
}

/**
 * Get the next recommended state for a claim based on configuration
 * 
 * @example
 * ```ts
 * const nextState = await getNextState({
 *   claimId: 123,
 *   currentState: "internal_review",
 *   tenantId: "tenant_123",
 *   estimatedCost: 500000, // $5,000 in cents
 * });
 * 
 * console.log(`Next state: ${nextState}`); // "technical_approval"
 * ```
 */
export async function getNextState(params: {
  claimId: number;
  currentState: WorkflowState;
  tenantId: string;
  estimatedCost?: number;
  fraudRiskLevel?: string;
}): Promise<WorkflowState> {
  const { claimId, currentState, tenantId, estimatedCost, fraudRiskLevel } = params;

  const config = await routingEngine.getConfiguration(tenantId);

  return await routingEngine.determineNextState(
    {
      estimatedCost: estimatedCost || 0,
      tenantId,
    },
    currentState,
    config
  );
}

/**
 * Validate if a state transition is allowed
 * 
 * @example
 * ```ts
 * const isValid = await isTransitionValid({
 *   claimId: 123,
 *   from: "assigned",
 *   to: "under_assessment",
 *   userRole: "assessor_internal",
 * });
 * 
 * if (!isValid) {
 *   throw new TRPCError({
 *     code: "BAD_REQUEST",
 *     message: "Invalid state transition",
 *   });
 * }
 * ```
 */
export async function isTransitionValid(params: {
  claimId: number;
  from: WorkflowState;
  to: WorkflowState;
  userRole: InsurerRole;
}): Promise<boolean> {
  const { claimId, from, to, userRole } = params;

  // Check if transition is defined in state machine
  const validation = stateMachine.validateTransition(from, to, userRole, claimId);
  return validation.valid;
}

/**
 * Get workflow configuration for a tenant
 */
export async function getWorkflowConfig(tenantId: string) {
  return await routingEngine.getConfiguration(tenantId);
}

/**
 * Update workflow configuration for a tenant
 */
export async function updateWorkflowConfig(config: {
  tenantId: string;
  riskManagerEnabled?: boolean;
  highValueThreshold?: number;
  executiveReviewThreshold?: number;
  aiFastTrackEnabled?: boolean;
  externalAssessorEnabled?: boolean;
  maxSequentialStagesByUser?: number;
}) {
  await routingEngine.updateConfiguration(config as any);
}

/**
 * Export engine instances for direct access if needed
 */
export { stateMachine, routingEngine, rbacEngine };
