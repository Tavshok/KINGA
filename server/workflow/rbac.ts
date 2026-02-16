/**
 * Role-Based Access Control (RBAC) Engine
 * 
 * Enforces role permissions at the workflow level
 */

import {
  InsurerRole,
  Permission,
  WorkflowState,
  PermissionContext,
  PermissionDeniedError,
} from "./types";

/**
 * Permission matrix defining what each role can do
 */
const ROLE_PERMISSIONS: Record<InsurerRole, Set<Permission>> = {
  claims_processor: new Set([
    "create_claim",
    "assign_assessor",
    "view_all_claims",
    "add_comment",
  ]),
  assessor_internal: new Set([
    "conduct_assessment",
    "add_comment",
    "view_fraud_analytics",
  ]),
  assessor_external: new Set([
    "conduct_assessment",
    "add_comment",
  ]),
  risk_manager: new Set([
    "approve_technical",
    "view_all_claims",
    "view_fraud_analytics",
    "add_comment",
  ]),
  claims_manager: new Set([
    "authorize_payment",
    "close_claim",
    "view_all_claims",
    "view_fraud_analytics",
    "add_comment",
    "create_claim",
    "assign_assessor",
  ]),
  executive: new Set([
    "view_all_claims",
    "redirect_claim",
    "view_fraud_analytics",
    "add_comment",
  ]),
  insurer_admin: new Set([
    "configure_workflow",
    "view_all_claims",
  ]),
};

/**
 * States that each role can view/access
 */
const ROLE_STATE_ACCESS: Record<InsurerRole, Set<WorkflowState>> = {
  claims_processor: new Set<WorkflowState>([
    "created",
    "intake_verified",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed",
  ]),
  assessor_internal: new Set<WorkflowState>([
    "assigned",
    "under_assessment",
    "internal_review",
  ]),
  assessor_external: new Set<WorkflowState>([
    "assigned",
    "under_assessment",
  ]),
  risk_manager: new Set<WorkflowState>([
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed",
  ]),
  claims_manager: new Set<WorkflowState>([
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed",
  ]),
  executive: new Set<WorkflowState>([
    "created",
    "intake_verified",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed",
  ]),
  insurer_admin: new Set<WorkflowState>([
    "created",
    "intake_verified",
    "assigned",
    "under_assessment",
    "internal_review",
    "technical_approval",
    "financial_decision",
    "payment_authorized",
    "closed",
    "disputed",
  ]),
};

/**
 * RBAC Engine
 * 
 * Provides role-based permission checking
 */
export class RBACEngine {
  /**
   * Check if role has permission for action
   */
  hasPermission(
    role: InsurerRole,
    permission: Permission,
    context?: PermissionContext
  ): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.has(permission);
  }

  /**
   * Assert that role has permission (throws if not)
   */
  assertPermission(
    role: InsurerRole,
    permission: Permission,
    context?: PermissionContext
  ): void {
    if (!this.hasPermission(role, permission, context)) {
      throw new PermissionDeniedError(
        `Role '${role}' does not have permission '${permission}'`,
        role,
        permission,
        context
      );
    }
  }

  /**
   * Check if role can access a specific workflow state
   */
  canAccessState(role: InsurerRole, state: WorkflowState): boolean {
    const accessibleStates = ROLE_STATE_ACCESS[role];
    return accessibleStates.has(state);
  }

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: InsurerRole): Permission[] {
    return Array.from(ROLE_PERMISSIONS[role]);
  }

  /**
   * Get all accessible states for a role
   */
  getRoleAccessibleStates(role: InsurerRole): WorkflowState[] {
    return Array.from(ROLE_STATE_ACCESS[role]);
  }

  /**
   * Get all allowed state transitions for a role
   * (Delegates to state machine for actual transition rules)
   */
  getAllowedTransitions(
    role: InsurerRole,
    currentState: WorkflowState
  ): WorkflowState[] {
    // This is implemented in state-machine.ts
    // This method is here for interface completeness
    return [];
  }

  /**
   * Check if role can perform a specific action on a claim
   */
  canPerformAction(
    role: InsurerRole,
    action: string,
    claimState: WorkflowState
  ): boolean {
    // Check state access first
    if (!this.canAccessState(role, claimState)) {
      return false;
    }

    // Map action to permission
    const permissionMap: Record<string, Permission> = {
      create: "create_claim",
      assign: "assign_assessor",
      assess: "conduct_assessment",
      approve_technical: "approve_technical",
      authorize_payment: "authorize_payment",
      close: "close_claim",
      redirect: "redirect_claim",
      configure: "configure_workflow",
    };

    const permission = permissionMap[action];
    if (!permission) {
      return false;
    }

    return this.hasPermission(role, permission);
  }
}
