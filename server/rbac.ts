/**
 * RBAC (Role-Based Access Control) System for KINGA
 * 
 * Hierarchical insurer roles with distinct permissions:
 * - Claims Processor: Entry level, creates claims, assigns assessors, read-only AI/cost views
 * - Internal Assessor: Technical expert, conducts assessments, fraud analytics access
 * - Risk Manager: Approves technical basis (not payment)
 * - Claims Manager: Financial decisions, payment authorization, closes claims
 * - GM/Executive: View-only strategic oversight
 */

import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import { isAdminRole } from "@shared/role-permissions";

export type InsurerRole = 
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "insurer_admin"
  | "recovery_officer";

export type WorkflowState =
  | "intake_queue"
  | "created"
  | "intake_verified"
  | "assigned"
  | "under_assessment"
  | "internal_review"
  | "technical_approval"
  | "financial_decision"
  | "payment_authorized"
  | "closed"
  | "disputed"
  | "ai_assessment_pending"
  | "ai_assessment_completed"
  | "manual_review";

/**
 * Permission matrix for each role
 */
export const PERMISSIONS = {
  claims_processor: {
    createClaim: true,
    assignAssessor: true,
    viewAIAssessment: true, // Read-only
    viewCostOptimization: true, // Read-only
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false,
    approveTechnical: false,
    approveFinancial: false,
    closeClaim: false,
    viewFraudAnalytics: false,
    viewAllClaims: true, // Claims processors need to see all incoming claims to triage and assign them
  },
  assessor_internal: {
    createClaim: false,
    assignAssessor: false,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: true,
    approveTechnical: false,
    approveFinancial: false,
    closeClaim: false,
    viewFraudAnalytics: true, // Full fraud analytics access
    viewAllClaims: false, // Only assigned claims
  },
  assessor_external: {
    createClaim: false,
    assignAssessor: false,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false, // External assessors use different process
    approveTechnical: false,
    approveFinancial: false,
    closeClaim: false,
    viewFraudAnalytics: false, // Limited access for external
    viewAllClaims: false, // Only assigned claims
  },
  risk_manager: {
    createClaim: false,
    assignAssessor: false,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false,
    approveTechnical: true, // Can approve technical basis
    approveFinancial: false, // Cannot approve payment
    closeClaim: false,
    viewFraudAnalytics: true,
    viewAllClaims: true, // Strategic oversight
  },
  claims_manager: {
    createClaim: true,
    assignAssessor: true,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false,
    approveTechnical: false,
    approveFinancial: true, // Can authorize payment
    closeClaim: true, // Can close claims
    viewFraudAnalytics: true,
    viewAllClaims: true, // Full visibility
  },
  executive: {
    createClaim: false,
    assignAssessor: false,
    viewAIAssessment: true, // View-only
    viewCostOptimization: true, // View-only
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false,
    approveTechnical: false,
    approveFinancial: false,
    closeClaim: false,
    viewFraudAnalytics: true, // Strategic oversight
    viewAllClaims: true, // Full visibility
  },
  insurer_admin: {
    createClaim: true,
    assignAssessor: true,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: true, // Admin can edit configurations
    editCostOptimization: true,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: true,
    approveTechnical: true,
    approveFinancial: true,
    closeClaim: true,
    viewFraudAnalytics: true,
    viewAllClaims: true, // Full administrative access
  },
  recovery_officer: {
    createClaim: false,
    assignAssessor: false,
    viewAIAssessment: true,
    viewCostOptimization: true,
    editAIAssessment: false,
    editCostOptimization: false,
    addComment: true,
    viewComments: true,
    conductInternalAssessment: false,
    approveTechnical: false,
    approveFinancial: false,
    closeClaim: false,
    viewFraudAnalytics: true,
    viewAllClaims: true,
  },
};

/**
 * Workflow state machine - defines valid transitions
 */
export const WORKFLOW_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  intake_queue: ["created", "assigned", "under_assessment"],
  created: ["assigned", "under_assessment", "disputed"],
  assigned: ["under_assessment", "disputed"],
  under_assessment: ["internal_review", "disputed", "under_assessment"], // self-transition allowed for re-run/re-analysis
  internal_review: ["technical_approval", "under_assessment", "disputed"], // Can send back
  technical_approval: [
    "financial_decision",
    "internal_review",
    "payment_authorized", // Fast-track: STRAIGHT_TO_PAYMENT
    "disputed",
    "under_assessment", // Allows KINGA re-run from technical_approval state
  ],
  financial_decision: ["payment_authorized", "technical_approval", "under_assessment", "disputed"], // Can send back or re-run KINGA assessment
  payment_authorized: ["closed", "disputed"],
  closed: ["disputed"], // Can reopen if disputed
  disputed: ["internal_review"], // Restart from internal review
  // Additional states from DB schema
  intake_verified: ["assigned", "under_assessment"],
  ai_assessment_pending: ["ai_assessment_completed", "manual_review"],
  ai_assessment_completed: ["internal_review", "technical_approval", "under_assessment"], // under_assessment allows KINGA re-run from completed state
  manual_review: ["internal_review", "technical_approval"],
};

/**
 * High-value claim threshold requiring GM consultation
 */
export const HIGH_VALUE_THRESHOLD = 10000;

/**
 * Check if user has specific permission
 */
export function hasPermission(
  user: User | null | undefined,
  permission: keyof typeof PERMISSIONS.claims_processor
): boolean {
  if (!user) return false;
  
  // System admin role has all permissions (superuser)
  if (isAdminRole(user.role)) return true;
  
  const role = user.insurerRole as InsurerRole | null;
  if (!role) return false;
  
  return PERMISSIONS[role]?.[permission] ?? false;
}

/**
 * Require specific permission or throw error
 */
export function requirePermission(
  user: User | null | undefined,
  permission: keyof typeof PERMISSIONS.claims_processor,
  customMessage?: string
): void {
  if (!hasPermission(user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: customMessage || `Permission denied: ${permission} required`,
    });
  }
}

/**
 * Check if workflow state transition is valid
 */
export function canTransitionTo(
  currentState: WorkflowState,
  newState: WorkflowState
): boolean {
  const validTransitions = WORKFLOW_TRANSITIONS[currentState];
  if (!validTransitions) return false;
  return validTransitions.includes(newState);
}

/**
 * Require valid workflow transition or throw error
 */
export function requireValidTransition(
  currentState: WorkflowState,
  newState: WorkflowState
): void {
  if (!canTransitionTo(currentState, newState)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid workflow transition: ${currentState} → ${newState}`,
    });
  }
}

/**
 * Check if claim requires GM consultation (high-value)
 */
export function requiresGMConsultation(estimatedCost: number): boolean {
  return estimatedCost > HIGH_VALUE_THRESHOLD;
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: InsurerRole): string {
  const names: Record<InsurerRole, string> = {
    claims_processor: "Claims Processor",
    assessor_internal: "Internal Assessor",
    assessor_external: "External Assessor",
    risk_manager: "Risk Manager",
    claims_manager: "Claims Manager",
    executive: "GM/Executive",
    insurer_admin: "Administrator",
    recovery_officer: "Recovery Officer",
  };
  return names[role];
}

/**
 * Get workflow state display name
 */
export function getWorkflowStateDisplayName(state: WorkflowState): string {
  const names: Record<WorkflowState, string> = {
    intake_queue: "Intake Queue",
    created: "Created",
    assigned: "Assigned",
    under_assessment: "Under Assessment",
    internal_review: "Internal Review",
    technical_approval: "Technical Approval",
    financial_decision: "Financial Decision",
    payment_authorized: "Payment Authorized",
    closed: "Closed",
    disputed: "Disputed",
    intake_verified: "Intake Verified",
    ai_assessment_pending: "AI Assessment Pending",
    ai_assessment_completed: "AI Assessment Completed",
    manual_review: "Manual Review",
  };
  return names[state];
}

/**
 * Check if user can view specific claim
 */
export function canViewClaim(
  user: User | null | undefined,
  claim: { assignedAssessorId?: number | null; createdBy?: number | null }
): boolean {
  if (!user) return false;
  
  // System admin role can view all claims (superuser)
  if (isAdminRole(user.role)) return true;
  
  const role = user.insurerRole as InsurerRole | null;
  if (!role) return false;
  
  // Executives, Risk Managers, and Claims Managers can view all claims
  if (PERMISSIONS[role].viewAllClaims) {
    return true;
  }
  
  // Claims Processors and Internal Assessors can only view assigned/created claims
  return claim.assignedAssessorId === user.id || claim.createdBy === user.id;
}

/**
 * Require claim view access or throw error
 */
export function requireClaimAccess(
  user: User | null | undefined,
  claim: { assignedAssessorId?: number | null; createdBy?: number | null }
): void {
  if (!canViewClaim(user, claim)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this claim",
    });
  }
}
