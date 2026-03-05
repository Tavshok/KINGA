/**
 * roleRouting.ts — Single source of truth for role-to-route mapping.
 *
 * All navigation that depends on a user's role or insurerRole MUST use these
 * helpers instead of hardcoding paths.  This prevents the "back button leads
 * to deprecated triage page" class of bugs and ensures every role lands on
 * the correct portal after login.
 *
 * Role taxonomy (from drizzle/schema.ts users table):
 *   role:         user | admin | insurer | assessor | panel_beater | claimant |
 *                 platform_super_admin | fleet_admin | fleet_manager | fleet_driver
 *   insurerRole:  claims_processor | assessor_internal | assessor_external |
 *                 risk_manager | claims_manager | executive | insurer_admin
 */

/** Map from top-level role → canonical portal landing page */
export const ROLE_PORTAL_MAP: Record<string, string> = {
  platform_super_admin: "/platform/overview",
  admin: "/admin/dashboard",
  insurer: "/insurer-portal",          // PortalHub auto-redirects via insurerRole below
  assessor: "/assessor/dashboard",
  panel_beater: "/panel-beater/dashboard",
  claimant: "/claimant/dashboard",
  fleet_admin: "/fleet-management",
  fleet_manager: "/fleet-management",
  fleet_driver: "/fleet-management",
  user: "/portal-hub",                  // No portal assigned yet
};

/** Map from insurerRole → canonical insurer sub-portal landing page */
export const INSURER_ROLE_PORTAL_MAP: Record<string, string> = {
  claims_processor: "/insurer-portal/claims-processor",
  assessor_internal: "/insurer-portal/internal-assessor",
  assessor_external: "/insurer-portal/internal-assessor",
  risk_manager: "/insurer-portal/risk-manager",
  claims_manager: "/insurer-portal/claims-manager",
  executive: "/insurer-portal/executive",
  insurer_admin: "/insurer-portal/executive",
};

/**
 * Returns the canonical landing page for a user given their role and optional
 * insurerRole.  Falls back to "/portal-hub" for any unrecognised combination.
 */
export function getRoleDashboardPath(
  role: string | undefined,
  insurerRole?: string | null
): string {
  if (!role) return "/portal-hub";

  // Insurer users are further routed by their sub-role
  if (role === "insurer" && insurerRole) {
    return INSURER_ROLE_PORTAL_MAP[insurerRole] ?? "/insurer-portal";
  }

  return ROLE_PORTAL_MAP[role] ?? "/portal-hub";
}

/**
 * Returns the canonical "back to dashboard" path for the insurer portal.
 * Use this everywhere a back button needs to navigate to the claims processor
 * list (or equivalent) rather than hardcoding "/insurer/claims/triage".
 */
export const INSURER_CLAIMS_LIST_PATH = "/insurer-portal/claims-processor";

/** Legacy paths that have been superseded — kept here for redirect mapping */
export const DEPRECATED_ROUTES: Record<string, string> = {
  "/insurer/claims/triage": INSURER_CLAIMS_LIST_PATH,
  "/insurer/dashboard": "/insurer-portal",
};
