/**
 * Role Permissions Matrix
 * 
 * Defines what actions each insurer role can perform.
 * Used for both frontend UI rendering and backend validation.
 */

export type InsurerRole = 
  | "claims_processor" 
  | "assessor_internal" 
  | "risk_manager" 
  | "claims_manager" 
  | "executive"
  | "insurer_admin";

export interface RolePermissions {
  // Claim Operations
  canUploadClaim: boolean;
  canViewClaim: boolean;
  canEditClaim: boolean;
  canDeleteClaim: boolean;
  
  // Intake Gate Operations
  canViewIntakeQueue: boolean;
  canAssignProcessor: boolean;
  
  // Assessment Operations
  canTriggerAIAssessment: boolean;
  canViewAIAssessment: boolean;
  canOverrideAIAssessment: boolean;
  canPerformManualAssessment: boolean;
  
  // Assignment Operations
  canAssignAssessor: boolean;
  canAssignToSelf: boolean;
  canReassignClaim: boolean;
  
  // Financial Operations
  canApprovePayment: boolean;
  canApproveLowValue: boolean;   // < $5,000
  canApproveModerateValue: boolean; // $5,000 - $50,000
  canApproveHighValue: boolean;  // > $50,000
  canOverrideAutomation: boolean;
  
  // Workflow Operations
  canChangeWorkflowState: boolean;
  canEscalateClaim: boolean;
  canCloseClaim: boolean;
  canReopenClaim: boolean;
  
  // Risk & Fraud Operations
  canFlagFraud: boolean;
  canInvestigateFraud: boolean;
  canApproveFraudCase: boolean;
  
  // Analytics & Reporting
  canViewAnalytics: boolean;
  canViewExecutiveDashboard: boolean;
  canViewGovernanceDashboard: boolean;
  canExportReports: boolean;
  
  // Configuration
  canManageUsers: boolean;
  canManageWorkflowSettings: boolean;
  canManageAutomationPolicies: boolean;
  
  // Queue Access
  accessibleQueues: string[];
}

/**
 * Role Permissions Matrix
 */
export const ROLE_PERMISSIONS: Record<InsurerRole, RolePermissions> = {
  claims_processor: {
    // Claim Operations
    canUploadClaim: true,
    canViewClaim: true,
    canEditClaim: true,
    canDeleteClaim: false,
    
    // Intake Gate Operations - RESTRICTED
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    
    // Assessment Operations
    canTriggerAIAssessment: true,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: false,
    
    // Assignment Operations
    canAssignAssessor: true,
    canAssignToSelf: false,
    canReassignClaim: false,
    
    // Financial Operations - RESTRICTED
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    
    // Workflow Operations
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: false,
    
    // Risk & Fraud Operations
    canFlagFraud: true,
    canInvestigateFraud: false,
    canApproveFraudCase: false,
    
    // Analytics & Reporting
    canViewAnalytics: false,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: false,
    
    // Configuration
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    
    // Queue Access - CANNOT VIEW INTAKE_QUEUE
    accessibleQueues: ["assigned", "disputed", "closed"], // Only assigned claims (assigned by claims_manager)
  },
  
  assessor_internal: {
    // Claim Operations
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    
    // Intake Gate Operations - RESTRICTED
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    
    // Assessment Operations - RESTRICTED AI TRIGGER
    canTriggerAIAssessment: false, // Cannot trigger AI unless re-analysis explicitly allowed
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: true,
    
    // Assignment Operations
    canAssignAssessor: false,
    canAssignToSelf: true,
    canReassignClaim: false,
    
    // Financial Operations
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    
    // Workflow Operations
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: false,
    
    // Risk & Fraud Operations
    canFlagFraud: true,
    canInvestigateFraud: false,
    canApproveFraudCase: false,
    
    // Analytics & Reporting
    canViewAnalytics: false,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: false,
    
    // Configuration
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    
    // Queue Access
    accessibleQueues: ["assigned"], // Only assigned claims
  },
  
  risk_manager: {
    // Claim Operations
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    
    // Intake Gate Operations - RESTRICTED
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    
    // Assessment Operations
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: false,
    
    // Assignment Operations
    canAssignAssessor: true,
    canAssignToSelf: false,
    canReassignClaim: true,
    
    // Financial Operations
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    
    // Workflow Operations
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: true,
    
    // Risk & Fraud Operations
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: false,
    
    // Analytics & Reporting
    canViewAnalytics: true,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: true,
    
    // Configuration
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    
    // Queue Access - RESTRICTED TO HIGH-RISK ONLY
    accessibleQueues: ["disputed", "fraud_flagged"], // Only high-risk queue
  },
  
  claims_manager: {
    // Claim Operations
    canUploadClaim: true,
    canViewClaim: true,
    canEditClaim: true,
    canDeleteClaim: true,
    
    // Intake Gate Operations - FULL ACCESS
    canViewIntakeQueue: true,
    canAssignProcessor: true,
    
    // Assessment Operations
    canTriggerAIAssessment: true,
    canViewAIAssessment: true,
    canOverrideAIAssessment: true,
    canPerformManualAssessment: true,
    
    // Assignment Operations
    canAssignAssessor: true,
    canAssignToSelf: false,
    canReassignClaim: true,
    
    // Financial Operations - MODERATE VALUE ONLY
    canApprovePayment: true,
    canApproveLowValue: true,
    canApproveModerateValue: true,
    canApproveHighValue: false, // Cannot approve high-value (requires executive)
    canOverrideAutomation: true,
    
    // Workflow Operations - FULL OVERSIGHT
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: true,
    canReopenClaim: true,
    
    // Risk & Fraud Operations
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: true,
    
    // Analytics & Reporting
    canViewAnalytics: true,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: true,
    
    // Configuration
    canManageUsers: false,
    canManageWorkflowSettings: true,
    canManageAutomationPolicies: true,
    
    // Queue Access - FULL OVERSIGHT INCLUDING INTAKE
    accessibleQueues: ["intake_queue", "created", "assigned", "disputed", "closed", "fraud_flagged"],
  },
  
  executive: {
    // Claim Operations
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    
    // Intake Gate Operations - VIEW ONLY
    canViewIntakeQueue: true,
    canAssignProcessor: false,
    
    // Assessment Operations
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: true,
    canPerformManualAssessment: false,
    
    // Assignment Operations
    canAssignAssessor: false,
    canAssignToSelf: false,
    canReassignClaim: false,
    
    // Financial Operations - HIGH VALUE ONLY
    canApprovePayment: true,
    canApproveLowValue: true,
    canApproveModerateValue: true,
    canApproveHighValue: true,
    canOverrideAutomation: true,
    
    // Workflow Operations - NO OPERATIONAL MUTATIONS
    canChangeWorkflowState: false,
    canEscalateClaim: false,
    canCloseClaim: false,
    canReopenClaim: false,
    
    // Risk & Fraud Operations
    canFlagFraud: false,
    canInvestigateFraud: false,
    canApproveFraudCase: true,
    
    // Analytics & Reporting - ANALYTICS ONLY
    canViewAnalytics: true,
    canViewExecutiveDashboard: true,
    canViewGovernanceDashboard: true,
    canExportReports: true,
    
    // Configuration
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    
    // Queue Access - READ-ONLY ALL INCLUDING INTAKE
    accessibleQueues: ["intake_queue", "created", "assigned", "disputed", "closed", "fraud_flagged"],
  },
  
  insurer_admin: {
    // Full permissions
    canUploadClaim: true,
    canViewClaim: true,
    canEditClaim: true,
    canDeleteClaim: true,
    canViewIntakeQueue: true,
    canAssignProcessor: true,
    canTriggerAIAssessment: true,
    canViewAIAssessment: true,
    canOverrideAIAssessment: true,
    canPerformManualAssessment: true,
    canAssignAssessor: true,
    canAssignToSelf: true,
    canReassignClaim: true,
    canApprovePayment: true,
    canApproveLowValue: true,
    canApproveModerateValue: true,
    canApproveHighValue: true,
    canOverrideAutomation: true,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: true,
    canReopenClaim: true,
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: true,
    canViewAnalytics: true,
    canViewExecutiveDashboard: true,
    canViewGovernanceDashboard: true,
    canExportReports: true,
    canManageUsers: true,
    canManageWorkflowSettings: true,
    canManageAutomationPolicies: true,
    accessibleQueues: ["intake_queue", "created", "assigned", "disputed", "closed", "fraud_flagged"],
  },
};

/**
 * Get permissions for a specific role
 */
export function getRolePermissions(role: InsurerRole | null | undefined): RolePermissions {
  if (!role) {
    // Return empty permissions for no role
    return {
      canUploadClaim: false,
      canViewClaim: false,
      canEditClaim: false,
      canDeleteClaim: false,
      canViewIntakeQueue: false,
      canAssignProcessor: false,
      canTriggerAIAssessment: false,
      canViewAIAssessment: false,
      canOverrideAIAssessment: false,
      canPerformManualAssessment: false,
      canAssignAssessor: false,
      canAssignToSelf: false,
      canReassignClaim: false,
      canApprovePayment: false,
      canApproveLowValue: false,
      canApproveModerateValue: false,
      canApproveHighValue: false,
      canOverrideAutomation: false,
      canChangeWorkflowState: false,
      canEscalateClaim: false,
      canCloseClaim: false,
      canReopenClaim: false,
      canFlagFraud: false,
      canInvestigateFraud: false,
      canApproveFraudCase: false,
      canViewAnalytics: false,
      canViewExecutiveDashboard: false,
      canViewGovernanceDashboard: false,
      canExportReports: false,
      canManageUsers: false,
      canManageWorkflowSettings: false,
      canManageAutomationPolicies: false,
      accessibleQueues: [],
    };
  }
  
  return ROLE_PERMISSIONS[role];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: InsurerRole | null | undefined,
  permission: keyof RolePermissions
): boolean {
  const permissions = getRolePermissions(role);
  const value = permissions[permission];
  
  // Handle array permissions (accessibleQueues)
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  
  return Boolean(value);
}

/**
 * Check if a role can approve a payment based on claim value
 */
export function canApprovePaymentByValue(
  role: InsurerRole | null | undefined,
  claimValue: number
): boolean {
  const permissions = getRolePermissions(role);
  
  if (claimValue < 5000) {
    return permissions.canApproveLowValue;
  } else if (claimValue <= 50000) {
    return permissions.canApproveModerateValue;
  } else {
    return permissions.canApproveHighValue;
  }
}

/**
 * Get accessible workflow states for a role
 */
export function getAccessibleQueues(role: InsurerRole | null | undefined): string[] {
  const permissions = getRolePermissions(role);
  return permissions.accessibleQueues;
}
