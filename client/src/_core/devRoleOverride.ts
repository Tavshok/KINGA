/**
 * DEVELOPMENT-ONLY Role Override System
 *
 * Allows developers to bypass OAuth and test different roles quickly using ?devRole query parameter.
 * Automatically disabled in production for security.
 *
 * Usage: http://localhost:3000/?devRole=risk_manager
 *
 * MockUser is kept in sync with the auth.me server response shape so that
 * components that read user.dashboardRoute / user.permissions / user.allowedReportCount
 * work identically in dev-override mode and in production.
 */

import {
  ROLE_PERMISSIONS,
  getRolePermissions,
  resolveDashboardRoute,
  ANALYTICS_ALLOWED_ROLES,
  GOVERNANCE_ALLOWED_ROLES,
  REPORT_SCHEDULE_ALLOWED_ROLES,
  type InsurerRole,
} from "@shared/role-permissions";

export type { InsurerRole };

export type DevRole =
  | "insurer_admin"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "claims_processor"
  | "assessor_internal"
  | "assessor_external"
  | "panel_beater"
  | "admin";

/** Mirrors the shape returned by auth.me on the server */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: "insurer" | "assessor" | "panel_beater" | "admin";
  insurerRole?: InsurerRole;
  tenantId: string;
  createdAt: string;
  // ── Server-derived profile (single source of truth) ──────────────────────
  dashboardRoute: string;
  roleLabel: string;
  allowedReportCount: number;
  permissions: ReturnType<typeof buildPermissions>;
}

function buildPermissions(
  topLevelRole: string,
  insurerRole: InsurerRole | undefined,
) {
  const p = getRolePermissions(insurerRole ?? null);
  const canAccessAnalytics =
    topLevelRole === "admin" ||
    (insurerRole != null && ANALYTICS_ALLOWED_ROLES.includes(insurerRole));
  const canAccessGovernance =
    topLevelRole === "admin" ||
    (insurerRole != null && GOVERNANCE_ALLOWED_ROLES.includes(insurerRole));
  const canScheduleReports =
    topLevelRole === "admin" ||
    (insurerRole != null && REPORT_SCHEDULE_ALLOWED_ROLES.includes(insurerRole));

  return {
    canUploadClaim: p.canUploadClaim,
    canViewClaim: p.canViewClaim,
    canEditClaim: p.canEditClaim,
    canDeleteClaim: p.canDeleteClaim,
    canViewIntakeQueue: p.canViewIntakeQueue,
    canAssignProcessor: p.canAssignProcessor,
    canTriggerAIAssessment: p.canTriggerAIAssessment,
    canViewAIAssessment: p.canViewAIAssessment,
    canOverrideAIAssessment: p.canOverrideAIAssessment,
    canPerformManualAssessment: p.canPerformManualAssessment,
    canAssignAssessor: p.canAssignAssessor,
    canAssignToSelf: p.canAssignToSelf,
    canReassignClaim: p.canReassignClaim,
    canApprovePayment: p.canApprovePayment,
    canApproveLowValue: p.canApproveLowValue,
    canApproveModerateValue: p.canApproveModerateValue,
    canApproveHighValue: p.canApproveHighValue,
    canOverrideAutomation: p.canOverrideAutomation,
    canChangeWorkflowState: p.canChangeWorkflowState,
    canEscalateClaim: p.canEscalateClaim,
    canCloseClaim: p.canCloseClaim,
    canReopenClaim: p.canReopenClaim,
    canFlagFraud: p.canFlagFraud,
    canInvestigateFraud: p.canInvestigateFraud,
    canApproveFraudCase: p.canApproveFraudCase,
    canViewAnalytics: p.canViewAnalytics,
    canViewExecutiveDashboard: p.canViewExecutiveDashboard,
    canViewGovernanceDashboard: p.canViewGovernanceDashboard,
    canExportReports: p.canExportReports,
    canManageUsers: p.canManageUsers,
    canManageWorkflowSettings: p.canManageWorkflowSettings,
    canManageAutomationPolicies: p.canManageAutomationPolicies,
    accessibleQueues: p.accessibleQueues,
    canAccessAnalytics,
    canAccessGovernance,
    canScheduleReports,
  };
}

function makeMockUser(
  devRole: DevRole,
  topLevelRole: "insurer" | "assessor" | "panel_beater" | "admin",
  insurerRole?: InsurerRole,
  email?: string,
  name?: string,
): MockUser {
  const timestamp = new Date().toISOString();
  const permissions = buildPermissions(topLevelRole, insurerRole);
  const dashboardRoute = resolveDashboardRoute(topLevelRole, insurerRole ?? null);
  const roleLabel = insurerRole
    ? (ROLE_PERMISSIONS[insurerRole]?.roleLabel ?? "Insurer")
    : topLevelRole === "admin"
    ? "Platform Admin"
    : topLevelRole === "assessor"
    ? "Assessor"
    : "Panel Beater";

  return {
    id: `dev-user-${devRole}`,
    email: email ?? `dev.${devRole.replace(/_/g, ".")}@kinga-dev.local`,
    name: name ?? `Dev ${roleLabel}`,
    role: topLevelRole,
    insurerRole,
    tenantId: "dev-tenant-001",
    createdAt: timestamp,
    dashboardRoute,
    roleLabel,
    allowedReportCount: 0, // dev override — not worth importing the full REPORT_ACCESS here
    permissions,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isDevRoleOverrideEnabled(): boolean {
  if (import.meta.env.MODE !== "development") return false;
  return new URLSearchParams(window.location.search).has("devRole");
}

export function getDevRoleFromURL(): DevRole | null {
  if (!isDevRoleOverrideEnabled()) return null;
  const devRole = new URLSearchParams(window.location.search).get("devRole") as DevRole;
  const valid: DevRole[] = [
    "insurer_admin", "risk_manager", "claims_manager", "executive",
    "claims_processor", "assessor_internal", "assessor_external",
    "panel_beater", "admin",
  ];
  if (valid.includes(devRole)) return devRole;
  console.warn(`[DEV ROLE OVERRIDE] Invalid role: ${devRole}. Valid:`, valid);
  return null;
}

export function generateMockUser(devRole: DevRole): MockUser {
  switch (devRole) {
    case "insurer_admin":
      return makeMockUser(devRole, "insurer", "insurer_admin");
    case "risk_manager":
      return makeMockUser(devRole, "insurer", "risk_manager");
    case "claims_manager":
      return makeMockUser(devRole, "insurer", "claims_manager");
    case "executive":
      return makeMockUser(devRole, "insurer", "executive");
    case "claims_processor":
      return makeMockUser(devRole, "insurer", "claims_processor");
    case "assessor_internal":
      return makeMockUser(devRole, "insurer", "assessor_internal");
    case "assessor_external":
      return makeMockUser(devRole, "insurer", "assessor_external");
    case "panel_beater":
      return makeMockUser(devRole, "panel_beater", undefined, "dev.panelbeater@kinga-dev.local", "Dev Panel Beater");
    case "admin":
      return makeMockUser(devRole, "admin", undefined, "dev.admin@kinga-dev.local", "Dev Platform Admin");
    default:
      throw new Error(`[DEV ROLE OVERRIDE] Unsupported dev role: ${devRole}`);
  }
}

export function logDevRoleOverrideWarning(devRole: DevRole): void {
  console.warn(
    `%c⚠️ DEV ROLE OVERRIDE ACTIVE: ${devRole}`,
    "background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
  );
  console.warn("[DEV ROLE OVERRIDE] DEVELOPMENT-ONLY — disabled in production.");
  console.warn("[DEV ROLE OVERRIDE] Mock user is NOT persisted to the database.");
}
