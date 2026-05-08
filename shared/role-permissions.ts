/**
 * KINGA Role Permissions — Single Source of Truth
 * ================================================
 * All role-based access decisions flow from this file.
 * Backend procedures import ROLE_PERMISSIONS to guard access.
 * The auth.me endpoint exposes a derived RoleProfile to the frontend.
 * The frontend MUST NOT hardcode role strings — it reads from auth.me.
 *
 * Canonical insurerRole values (stored in users.insurer_role DB column):
 *   claims_processor   — front-line claim handler
 *   assessor_internal  — in-house damage assessor
 *   assessor_external  — third-party assessor
 *   risk_manager       — fraud & risk oversight
 *   claims_manager     — head of claims dept
 *   executive          — C-suite / board
 *   insurer_admin      — insurer-level administrator
 *   recovery_officer   — subrogation & third-party recovery (optional role)
 *
 * Top-level role values (users.role):
 *   admin        — platform super-admin (cross-insurer)
 *   insurer      — insurer account (uses insurerRole for sub-role)
 *   assessor     — external assessor account
 *   panel_beater — repair shop account
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsurerRole =
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "insurer_admin"
  | "recovery_officer";

export type TopLevelRole = "admin" | "insurer" | "assessor" | "panel_beater";

export interface RolePermissions {
  // ── Claim Operations ──────────────────────────────────────────────────────
  canUploadClaim: boolean;
  canViewClaim: boolean;
  canEditClaim: boolean;
  canDeleteClaim: boolean;

  // ── Intake Gate ───────────────────────────────────────────────────────────
  canViewIntakeQueue: boolean;
  canAssignProcessor: boolean;

  // ── Assessment ────────────────────────────────────────────────────────────
  canTriggerAIAssessment: boolean;
  canViewAIAssessment: boolean;
  canOverrideAIAssessment: boolean;
  canPerformManualAssessment: boolean;

  // ── Assignment ────────────────────────────────────────────────────────────
  canAssignAssessor: boolean;
  canAssignToSelf: boolean;
  canReassignClaim: boolean;

  // ── Financial ─────────────────────────────────────────────────────────────
  canApprovePayment: boolean;
  canApproveLowValue: boolean;      // < R5,000
  canApproveModerateValue: boolean; // R5,000 – R50,000
  canApproveHighValue: boolean;     // > R50,000
  canOverrideAutomation: boolean;

  // ── Workflow ──────────────────────────────────────────────────────────────
  canChangeWorkflowState: boolean;
  canEscalateClaim: boolean;
  canCloseClaim: boolean;
  canReopenClaim: boolean;

  // ── Risk & Fraud ──────────────────────────────────────────────────────────
  canFlagFraud: boolean;
  canInvestigateFraud: boolean;
  canApproveFraudCase: boolean;

  // ── Analytics & Reporting ─────────────────────────────────────────────────
  canViewAnalytics: boolean;
  canViewExecutiveDashboard: boolean;
  canViewGovernanceDashboard: boolean;
  canExportReports: boolean;

  // ── Configuration ─────────────────────────────────────────────────────────
  canManageUsers: boolean;
  canManageWorkflowSettings: boolean;
  canManageAutomationPolicies: boolean;

  // ── Queue Access ──────────────────────────────────────────────────────────
  accessibleQueues: string[];

  // ── Routing (consumed by auth.me → frontend) ──────────────────────────────
  /** The primary dashboard route for this role */
  dashboardRoute: string;
  /** Human-readable label shown in the sidebar header */
  roleLabel: string;
}

// ─── Permissions Matrix ───────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<InsurerRole, RolePermissions> = {

  claims_processor: {
    canUploadClaim: true,
    canViewClaim: true,
    canEditClaim: true,
    canDeleteClaim: false,
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    canTriggerAIAssessment: true,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: false,
    canAssignAssessor: true,
    canAssignToSelf: false,
    canReassignClaim: false,
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: false,
    canFlagFraud: true,
    canInvestigateFraud: false,
    canApproveFraudCase: false,
    canViewAnalytics: false,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: true,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["assigned", "disputed", "closed"],
    dashboardRoute: "/insurer-portal/claims-processor",
    roleLabel: "Claims Processor",
  },

  assessor_internal: {
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: true,
    canAssignAssessor: false,
    canAssignToSelf: true,
    canReassignClaim: false,
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: false,
    canFlagFraud: true,
    canInvestigateFraud: false,
    canApproveFraudCase: false,
    canViewAnalytics: false,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: false,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["assigned"],
    dashboardRoute: "/insurer-portal/internal-assessor",
    roleLabel: "Internal Assessor",
  },

  assessor_external: {
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: true,
    canAssignAssessor: false,
    canAssignToSelf: true,
    canReassignClaim: false,
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: false,
    canFlagFraud: true,
    canInvestigateFraud: false,
    canApproveFraudCase: false,
    canViewAnalytics: false,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: false,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["assigned"],
    dashboardRoute: "/insurer-portal/external-assessor",
    roleLabel: "External Assessor",
  },

  risk_manager: {
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: false,
    canPerformManualAssessment: false,
    canAssignAssessor: true,
    canAssignToSelf: false,
    canReassignClaim: true,
    canApprovePayment: false,
    canApproveLowValue: false,
    canApproveModerateValue: false,
    canApproveHighValue: false,
    canOverrideAutomation: false,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: false,
    canReopenClaim: true,
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: false,
    canViewAnalytics: true,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: true,
    canExportReports: true,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["disputed", "fraud_flagged"],
    dashboardRoute: "/insurer-portal/risk-manager",
    roleLabel: "Risk Manager",
  },

  claims_manager: {
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
    canAssignToSelf: false,
    canReassignClaim: true,
    canApprovePayment: true,
    canApproveLowValue: true,
    canApproveModerateValue: true,
    canApproveHighValue: false,
    canOverrideAutomation: true,
    canChangeWorkflowState: true,
    canEscalateClaim: true,
    canCloseClaim: true,
    canReopenClaim: true,
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: true,
    canViewAnalytics: true,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: true,
    canExportReports: true,
    canManageUsers: false,
    canManageWorkflowSettings: true,
    canManageAutomationPolicies: true,
    accessibleQueues: ["intake_queue", "created", "assigned", "disputed", "closed", "fraud_flagged"],
    dashboardRoute: "/insurer-portal/claims-manager",
    roleLabel: "Claims Manager",
  },

  executive: {
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    canViewIntakeQueue: true,
    canAssignProcessor: false,
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
    canOverrideAIAssessment: true,
    canPerformManualAssessment: false,
    canAssignAssessor: false,
    canAssignToSelf: false,
    canReassignClaim: false,
    canApprovePayment: true,
    canApproveLowValue: true,
    canApproveModerateValue: true,
    canApproveHighValue: true,
    canOverrideAutomation: true,
    canChangeWorkflowState: false,
    canEscalateClaim: false,
    canCloseClaim: false,
    canReopenClaim: false,
    canFlagFraud: false,
    canInvestigateFraud: false,
    canApproveFraudCase: true,
    canViewAnalytics: true,
    canViewExecutiveDashboard: true,
    canViewGovernanceDashboard: true,
    canExportReports: true,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["intake_queue", "created", "assigned", "disputed", "closed", "fraud_flagged"],
    dashboardRoute: "/insurer-portal/executive",
    roleLabel: "Executive",
  },

  insurer_admin: {
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
    dashboardRoute: "/insurer-portal/insurer-admin",
    roleLabel: "Insurer Admin",
  },

  recovery_officer: {
    // Recovery officers work on settled claims — they need read access to claims
    // and AI assessments but do not participate in the live claims workflow.
    canUploadClaim: false,
    canViewClaim: true,
    canEditClaim: false,
    canDeleteClaim: false,
    canViewIntakeQueue: false,
    canAssignProcessor: false,
    canTriggerAIAssessment: false,
    canViewAIAssessment: true,
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
    canFlagFraud: true,
    canInvestigateFraud: true,
    canApproveFraudCase: false,
    canViewAnalytics: true,
    canViewExecutiveDashboard: false,
    canViewGovernanceDashboard: false,
    canExportReports: true,
    canManageUsers: false,
    canManageWorkflowSettings: false,
    canManageAutomationPolicies: false,
    accessibleQueues: ["settled"],
    dashboardRoute: "/insurer-portal/recovery",
    roleLabel: "Recovery Officer",
  },
};

// ─── Roles that can access analytics procedures ───────────────────────────────
export const ANALYTICS_ALLOWED_ROLES: InsurerRole[] = [
  "insurer_admin", "executive", "risk_manager", "claims_manager",
];

// ─── Roles that can access governance dashboard procedures ────────────────────
export const GOVERNANCE_ALLOWED_ROLES: InsurerRole[] = [
  "insurer_admin", "executive", "risk_manager", "claims_manager",
];

// ─── Roles that can schedule reports ─────────────────────────────────────────
export const REPORT_SCHEDULE_ALLOWED_ROLES: InsurerRole[] = [
  "insurer_admin", "executive", "risk_manager", "claims_manager",
];

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get permissions for a specific insurerRole.
 * Returns a zero-permission object for null/undefined roles.
 */
export function getRolePermissions(role: InsurerRole | null | undefined): RolePermissions {
  if (!role || !(role in ROLE_PERMISSIONS)) {
    return {
      canUploadClaim: false, canViewClaim: false, canEditClaim: false, canDeleteClaim: false,
      canViewIntakeQueue: false, canAssignProcessor: false,
      canTriggerAIAssessment: false, canViewAIAssessment: false,
      canOverrideAIAssessment: false, canPerformManualAssessment: false,
      canAssignAssessor: false, canAssignToSelf: false, canReassignClaim: false,
      canApprovePayment: false, canApproveLowValue: false,
      canApproveModerateValue: false, canApproveHighValue: false,
      canOverrideAutomation: false, canChangeWorkflowState: false,
      canEscalateClaim: false, canCloseClaim: false, canReopenClaim: false,
      canFlagFraud: false, canInvestigateFraud: false, canApproveFraudCase: false,
      canViewAnalytics: false, canViewExecutiveDashboard: false,
      canViewGovernanceDashboard: false, canExportReports: false,
      canManageUsers: false, canManageWorkflowSettings: false,
      canManageAutomationPolicies: false, accessibleQueues: [],
      dashboardRoute: "/insurer-portal",
      roleLabel: "Insurer",
    };
  }
  return ROLE_PERMISSIONS[role];
}

/**
 * Check if an insurerRole has a specific boolean permission.
 */
export function hasPermission(
  role: InsurerRole | null | undefined,
  permission: keyof Omit<RolePermissions, "accessibleQueues" | "dashboardRoute" | "roleLabel">,
): boolean {
  return Boolean(getRolePermissions(role)[permission]);
}

/**
 * Check if an insurerRole can approve a payment of a given value (in ZAR).
 */
export function canApprovePaymentByValue(
  role: InsurerRole | null | undefined,
  claimValueZAR: number,
): boolean {
  const p = getRolePermissions(role);
  if (claimValueZAR < 5000)  return p.canApproveLowValue;
  if (claimValueZAR <= 50000) return p.canApproveModerateValue;
  return p.canApproveHighValue;
}

/**
 * Get the list of accessible workflow queues for a role.
 */
export function getAccessibleQueues(role: InsurerRole | null | undefined): string[] {
  return getRolePermissions(role).accessibleQueues;
}

/**
 * Resolve the primary dashboard route for a user.
 * Falls back gracefully for top-level roles (admin, assessor, panel_beater).
 */
export function resolveDashboardRoute(
  topLevelRole: TopLevelRole | string | null | undefined,
  insurerRole: InsurerRole | null | undefined,
): string {
  if (topLevelRole === "admin")        return "/admin/dashboard";
  if (topLevelRole === "assessor")     return "/assessor/dashboard";
  if (topLevelRole === "panel_beater") return "/panel-beater/dashboard";
  if (insurerRole && insurerRole in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[insurerRole].dashboardRoute;
  }
  return "/insurer-portal";
}
