/**
 * DEVELOPMENT-ONLY Role Override System
 * 
 * Allows developers to bypass OAuth and test different roles quickly using ?devRole query parameter.
 * Automatically disabled in production for security.
 * 
 * Usage: http://localhost:3000/?devRole=risk_manager
 */

export type DevRole =
  | "insurer_admin"
  | "risk_manager"
  | "claims_manager"
  | "executive"
  | "internal_assessor"
  | "external_assessor"
  | "panel_beater";

export type InsurerRole = "insurer_admin" | "risk_manager" | "claims_manager" | "executive";

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: "insurer" | "assessor" | "panel_beater" | "admin";
  insurerRole?: InsurerRole;
  tenantId: string;
  createdAt: string;
}

/**
 * Check if dev role override is enabled
 */
export function isDevRoleOverrideEnabled(): boolean {
  // Only enable in development environment
  if (import.meta.env.MODE !== "development") {
    return false;
  }

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has("devRole");
}

/**
 * Get the dev role from URL query parameter
 */
export function getDevRoleFromURL(): DevRole | null {
  if (!isDevRoleOverrideEnabled()) {
    return null;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const devRole = urlParams.get("devRole") as DevRole;

  const validRoles: DevRole[] = [
    "insurer_admin",
    "risk_manager",
    "claims_manager",
    "executive",
    "internal_assessor",
    "external_assessor",
    "panel_beater",
  ];

  if (validRoles.includes(devRole)) {
    return devRole;
  }

  console.warn(`[DEV ROLE OVERRIDE] Invalid role: ${devRole}. Valid roles:`, validRoles);
  return null;
}

/**
 * Generate mock authenticated user based on dev role
 */
export function generateMockUser(devRole: DevRole): MockUser {
  const timestamp = new Date().toISOString();
  const baseUser = {
    id: `dev-user-${devRole}`,
    tenantId: "dev-tenant-001",
    createdAt: timestamp,
  };

  // Map dev roles to user roles and insurer roles
  switch (devRole) {
    case "insurer_admin":
      return {
        ...baseUser,
        email: "dev.admin@kinga-dev.local",
        name: "Dev Insurer Admin",
        role: "insurer",
        insurerRole: "insurer_admin",
      };

    case "risk_manager":
      return {
        ...baseUser,
        email: "dev.risk@kinga-dev.local",
        name: "Dev Risk Manager",
        role: "insurer",
        insurerRole: "risk_manager",
      };

    case "claims_manager":
      return {
        ...baseUser,
        email: "dev.claims@kinga-dev.local",
        name: "Dev Claims Manager",
        role: "insurer",
        insurerRole: "claims_manager",
      };

    case "executive":
      return {
        ...baseUser,
        email: "dev.executive@kinga-dev.local",
        name: "Dev Executive",
        role: "insurer",
        insurerRole: "executive",
      };

    case "internal_assessor":
      return {
        ...baseUser,
        email: "dev.internal.assessor@kinga-dev.local",
        name: "Dev Internal Assessor",
        role: "assessor",
      };

    case "external_assessor":
      return {
        ...baseUser,
        email: "dev.external.assessor@kinga-dev.local",
        name: "Dev External Assessor",
        role: "assessor",
      };

    case "panel_beater":
      return {
        ...baseUser,
        email: "dev.panelbeater@kinga-dev.local",
        name: "Dev Panel Beater",
        role: "panel_beater",
      };

    default:
      throw new Error(`[DEV ROLE OVERRIDE] Unsupported dev role: ${devRole}`);
  }
}

/**
 * Log console warning when dev role override is active
 */
export function logDevRoleOverrideWarning(devRole: DevRole): void {
  console.warn(
    `%c⚠️ DEV ROLE OVERRIDE ACTIVE: ${devRole}`,
    "background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;"
  );
  console.warn(
    "[DEV ROLE OVERRIDE] This feature is DEVELOPMENT-ONLY and automatically disabled in production."
  );
  console.warn(
    "[DEV ROLE OVERRIDE] Mock user is NOT persisted to database and exists only in client state."
  );
}
