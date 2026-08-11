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
 *                 risk_manager | claims_manager | executive | insurer_admin |
 *                 recovery_officer
 */

/** Map from top-level role → canonical portal landing page */
export const ROLE_PORTAL_MAP: Record<string, string> = {
  platform_super_admin: "/platform/overview",
  admin: "/admin/dashboard",
  insurer: "/insurer-portal",          // insurerRole resolves to a dedicated workspace below
  assessor: "/assessor/dashboard",
  panel_beater: "/panel-beater/dashboard",
  claimant: "/client",
  fleet_admin: "/fleet",
  fleet_manager: "/fleet",
  fleet_driver: "/fleet/driver",
  engineer: "/engineer/dashboard",             // Epic 4.5: Engineering Workspace (Epic 3)
  user: "/client",                  // No portal assigned yet
};

/** Map from insurerRole → canonical insurer sub-portal landing page */
export const INSURER_ROLE_PORTAL_MAP: Record<string, string> = {
  claims_processor:  "/insurer-portal/claims-processor",
  assessor_internal: "/insurer-portal/internal-assessor",
  risk_manager:      "/insurer-portal/risk-manager",
  claims_manager:    "/insurer-portal/claims-manager",
  executive:         "/insurer-portal/executive",
  insurer_admin:     "/insurer-portal/insurer-admin",
  recovery_officer:  "/insurer-portal/recovery",
};

/**
 * PORTAL_ROUTE_ROLES — centralized guard table.
 *
 * Maps every insurer-portal URL prefix to the set of insurerRoles that are
 * permitted to access it.  This is the SINGLE SOURCE OF TRUTH used by:
 *   - RoleGuard (route-level enforcement)
 *   - InsurerPortalLayout (sidebar active-state derivation)
 *   - usePortalGuard (navigation-event enforcement)
 *
 * Rules:
 *   - Entries are matched longest-prefix-first.
 *   - An empty allowedRoles array means the route is accessible to ALL
 *     authenticated insurer users (shared routes like reports-centre).
 *   - admin users (user.role === "admin") bypass this table entirely and
 *     receive an explicit "Admin Override" indicator in the sidebar.
 */
export const PORTAL_ROUTE_ROLES: Array<{
  prefix: string;
  allowedRoles: string[];
}> = [
  // ── Exclusive single-role portals ──────────────────────────────────────
  { prefix: "/insurer-portal/executive",          allowedRoles: ["executive"] },
  { prefix: "/insurer-portal/claims-manager",     allowedRoles: ["claims_manager"] },
  { prefix: "/insurer-portal/claims-processor",   allowedRoles: ["claims_processor"] },
  { prefix: "/insurer-portal/internal-assessor",  allowedRoles: ["assessor_internal"] },
  { prefix: "/insurer-portal/risk-manager",       allowedRoles: ["risk_manager"] },
  { prefix: "/insurer-portal/insurer-admin",      allowedRoles: ["insurer_admin"] },
  // ── Multi-role shared portals ──────────────────────────────────────────
  { prefix: "/insurer-portal/recovery",           allowedRoles: ["recovery_officer", "claims_manager", "insurer_admin"] },
  { prefix: "/insurer-portal/risk-analytics",     allowedRoles: ["risk_manager"] },
  { prefix: "/insurer-portal/policy-management",  allowedRoles: ["insurer_admin", "executive"] },
  // ── Shared analytics/reporting routes (all insurer roles) ─────────────
  { prefix: "/insurer-portal/workflow-analytics",          allowedRoles: [] },
  { prefix: "/insurer-portal/exception-intelligence",      allowedRoles: [] },
  { prefix: "/insurer-portal/relationship-intelligence",   allowedRoles: [] },
  { prefix: "/insurer-portal/reports-centre",              allowedRoles: [] },
  { prefix: "/insurer-portal/team-members",                allowedRoles: [] },
  // ── Root insurer-portal (role selection page) ──────────────────────────
  { prefix: "/insurer-portal",                    allowedRoles: [] },

  // ── /insurer/* shared feature pages ─────────────────────────────────────
  // These are shared cross-portal pages reached from sidebar nav items.
  // Registering them here ensures getRoleFromPath() resolves portal identity
  // correctly (falling back to user.insurerRole) rather than returning empty.
  // allowedRoles mirrors the RoleGuard constraints in App.tsx.
  { prefix: "/insurer/fraud-analytics",           allowedRoles: ["risk_manager", "claims_manager", "executive", "insurer_admin"] },
  { prefix: "/insurer/batch-export",              allowedRoles: ["insurer_admin", "claims_manager", "executive"] },
  { prefix: "/insurer/external-assessment",       allowedRoles: ["insurer_admin", "risk_manager", "claims_manager", "executive"] },
  { prefix: "/insurer/automation-policies",       allowedRoles: ["insurer_admin", "executive"] },
  { prefix: "/insurer/replay-dashboard",          allowedRoles: ["insurer_admin", "executive", "claims_manager"] },
  { prefix: "/insurer/vehicle-registry",          allowedRoles: ["insurer_admin", "risk_manager", "claims_manager", "executive", "claims_processor"] },
  { prefix: "/insurer/panel-beater-performance",  allowedRoles: ["insurer_admin", "risk_manager", "claims_manager", "executive"] },
  // Claim detail & comparison pages — open to all insurer roles
  { prefix: "/insurer/claims",                    allowedRoles: [] },
  { prefix: "/insurer/comparison",                allowedRoles: [] },
  { prefix: "/insurer/quote-optimization",        allowedRoles: [] },
  // Root /insurer — legacy landing, redirects to /insurer-portal
  { prefix: "/insurer",                           allowedRoles: [] },
];

/**
 * getPortalAllowedRoles — returns the allowed insurerRoles for a given path.
 * Returns null if the path is not an insurer-portal route.
 * Returns [] if the route is open to all insurer roles.
 */
export function getPortalAllowedRoles(path: string): string[] | null {
  // Sort by prefix length descending so longest match wins
  const sorted = [...PORTAL_ROUTE_ROLES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const entry of sorted) {
    if (path === entry.prefix || path.startsWith(entry.prefix + "/") || path.startsWith(entry.prefix + "?") || path.startsWith(entry.prefix + "#")) {
      return entry.allowedRoles;
    }
  }
  return null; // Not an insurer-portal route
}

/**
 * isPortalNavigationAllowed — single guard function called on every navigation event.
 *
 * Returns true if navigation is permitted.
 * Returns false if the target route is an insurer-portal route that the user's
 * insurerRole is not permitted to access.
 *
 * Admin users (user.role === "admin") are always allowed — they bypass role checks
 * but receive a visible "Admin Override" indicator in the sidebar.
 */
export function isPortalNavigationAllowed(
  targetPath: string,
  userRole: string | undefined,
  userInsurerRole: string | null | undefined
): boolean {
  // Non-insurer users: not our concern here
  if (userRole !== "insurer" && userRole !== "admin") return true;
  // Admin users bypass all role checks
  if (userRole === "admin") return true;

  const allowedRoles = getPortalAllowedRoles(targetPath);
  // Not an insurer-portal route — allow
  if (allowedRoles === null) return true;
  // Shared route (empty allowedRoles) — allow all insurer roles
  if (allowedRoles.length === 0) return true;
  // Role-restricted route — check
  return allowedRoles.includes(userInsurerRole ?? "");
}

/**
 * Returns the canonical landing page for a user given their role and optional
 * insurerRole.  Falls back to "/insurer-portal" for any unrecognised combination.
 */
export function getRoleDashboardPath(
  role: string | undefined,
  insurerRole?: string | null
): string {
  if (!role) return "/insurer-portal";

  // Insurer users are further routed by their sub-role
  if (role === "insurer" && insurerRole) {
    return INSURER_ROLE_PORTAL_MAP[insurerRole] ?? "/insurer-portal";
  }

  return ROLE_PORTAL_MAP[role] ?? "/insurer-portal";
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

/**
 * TAB_PARAM_MAP — maps sidebar href query/hash params to the correct tab IDs
 * used by each dashboard's internal state.
 *
 * This is the single source of truth for sidebar-to-tab navigation.
 * Each entry maps: { portalPrefix, hrefParam } → tabId
 */
export const SIDEBAR_TAB_MAP: Record<string, Record<string, string>> = {
  "/insurer-portal/claims-processor": {
    // Hash-based (sidebar uses #fragment)
    "#intake-queue": "pending",
    "#in-progress":  "review",
    "#ai-flagged":   "ai_complete",
    "#completed":    "completed",
  },
  "/insurer-portal/internal-assessor": {
    // Query-param based (sidebar uses ?tab=)
    "queue":       "queue",
    "in-progress": "claims",  // "In Progress" maps to "My Claims" tab
    "completed":   "completed",
  },
};
