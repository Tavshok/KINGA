// @ts-nocheck
/**
 * Workflow Governance Types
 * 
 * Core type definitions for the KINGA workflow engine.
 * These types enforce governance rules at compile time.
 */

/**
 * Immutable core workflow states
 * These states form the backbone of claim processing and cannot be modified
 */
export type WorkflowState =
  | "created"              // Initial claim submission
  | "intake_verified"      // Claims Processor verified documentation
  | "assigned"             // Assigned to assessor
  | "under_assessment"     // Assessor conducting evaluation
  | "internal_review"      // Risk Manager technical review
  | "technical_approval"   // Risk Manager approved technical basis
  | "financial_decision"   // Claims Manager reviewing for payment
  | "payment_authorized"   // Payment approved and authorized
  | "closed"               // Claim fully resolved
  | "disputed";            // Claim in dispute resolution

/**
 * Standard insurer roles with defined responsibilities
 */
export type InsurerRole =
  | "claims_processor"      // Intake, verification, assignment
  | "assessor_internal"     // In-house damage assessment
  | "assessor_external"     // Third-party assessment
  | "risk_manager"          // Technical approval (not payment)
  | "claims_manager"        // Financial decision and payment authorization
  | "executive"             // Oversight, redirection, strategic view
  | "insurer_admin";        // Configuration management

/**
 * Permissions that can be granted to roles
 */
export type Permission =
  | "create_claim"
  | "assign_assessor"
  | "conduct_assessment"
  | "approve_technical"
  | "authorize_payment"
  | "close_claim"
  | "view_all_claims"
  | "redirect_claim"
  | "configure_workflow"
  | "view_fraud_analytics"
  | "add_comment";

/**
 * Critical stages requiring segregation tracking
 */
export type CriticalStage =
  | "assessment"
  | "technical_approval"
  | "financial_decision"
  | "payment_authorization";

/**
 * Workflow action types
 */
export type WorkflowAction =
  | "transition_state"
  | "approve_technical"
  | "authorize_payment"
  | "close_claim"
  | "redirect_claim"
  | "add_assessment";

/**
 * State transition definition
 */
export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  allowedRoles: InsurerRole[];
  requiresSegregationCheck: boolean;
  requiresEscalation?: (claim: ClaimContext) => boolean;
}

/**
 * Claim context for workflow decisions
 */
export interface ClaimContext {
  id: number;
  claimNumber: string;
  workflowState: WorkflowState;
  estimatedCost: number; // in cents
  aiAssessment?: {
    fraudRiskLevel: "low" | "medium" | "high";
    confidenceScore: number;
    estimatedCost: number;
  };
  assessorEvaluation?: {
    estimatedCost: number;
    completedBy: number;
    completedAt: Date;
  };
  tenantId: string;
}

/**
 * Transition context for validation
 */
export interface TransitionContext {
  claimId: number;
  userId: number;
  userRole: InsurerRole;
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Transition metadata for audit trail
 */
export interface TransitionMetadata {
  reason?: string;
  decisionValue?: number; // Amount in cents
  aiScore?: number;
  confidenceScore?: number;
  comments?: string;
  additionalData?: Record<string, any>;
}

/**
 * Validation result from state machine
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
}

/**
 * Transition result
 */
export interface TransitionResult {
  success: boolean;
  newState: WorkflowState;
  auditRecordId: number;
  errors?: ValidationError[];
}

/**
 * Segregation validation result
 */
export interface SegregationResult {
  allowed: boolean;
  reason?: string;
  userInvolvement: InvolvementHistory;
  criticalStagesPerformed: number;
}

/**
 * User involvement history in a claim
 */
export interface InvolvementHistory {
  userId: number;
  claimId: number;
  stages: StageInvolvement[];
  criticalStageCount: number;
}

/**
 * Stage involvement record
 */
export interface StageInvolvement {
  stage: CriticalStage;
  action: WorkflowAction;
  timestamp: Date;
  workflowState: WorkflowState;
}

/**
 * Workflow configuration for an insurer/tenant
 */
export interface WorkflowConfiguration {
  tenantId: string;
  riskManagerEnabled: boolean;
  highValueThreshold: number; // in cents
  aiFastTrackEnabled: boolean;
  executiveReviewThreshold: number; // in cents
  externalAssessorEnabled: boolean;
  maxSequentialStagesByUser: number; // Default: 2
}

/**
 * Escalation requirement
 */
export interface EscalationRequirement {
  required: boolean;
  reason: string;
  targetRole?: InsurerRole;
}

/**
 * Redirect result
 */
export interface RedirectResult {
  success: boolean;
  previousState: WorkflowState;
  newState: WorkflowState;
  auditRecordId: number;
}

/**
 * Decision comparison (AI vs Human)
 */
export interface DecisionComparison {
  claimId: number;
  aiAssessment: {
    estimatedCost: number;
    fraudRiskLevel: string;
    confidenceScore: number;
  };
  humanAssessment: {
    estimatedCost: number;
    assessorId: number;
    completedAt: Date;
  };
  variance: {
    costDifference: number; // in cents
    percentageDifference: number;
  };
  finalDecision: {
    approvedAmount: number;
    approvedBy: number;
    approvedAt: Date;
  };
}

/**
 * Audit record
 */
export interface AuditRecord {
  id: number;
  claimId: number;
  userId: number;
  userRole: InsurerRole;
  previousState: WorkflowState | null;
  newState: WorkflowState;
  decisionValue: number | null;
  aiScore: number | null;
  confidenceScore: number | null;
  comments: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

/**
 * Audit metadata for logging
 */
export interface AuditMetadata {
  userId: number;
  userRole: InsurerRole;
  decisionValue?: number;
  aiScore?: number;
  confidenceScore?: number;
  comments?: string;
  metadata?: Record<string, any>;
}

/**
 * Permission context for RBAC checks
 */
export interface PermissionContext {
  claimId?: number;
  tenantId?: string;
  claimState?: WorkflowState;
}

/**
 * Workflow violation error
 */
export class WorkflowViolationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "WorkflowViolationError";
  }
}

/**
 * Segregation violation error
 */
export class SegregationViolationError extends Error {
  constructor(
    message: string,
    public userId: number,
    public claimId: number,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "SegregationViolationError";
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends Error {
  constructor(
    message: string,
    public role: InsurerRole,
    public permission: Permission,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}
