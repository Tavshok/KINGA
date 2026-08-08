import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/**
 * Domain → Allowed Roles mapping (mirrors server/_core/domain-middleware.ts)
 *
 * /platform  → platform_super_admin
 * /agency    → agency, admin, platform_super_admin (system testing access — confirmed 2026-07-30)
 * /insurer   → insurer, admin
 * /fleet     → fleet_admin, fleet_manager, fleet_driver, admin
 * /engineer  → engineer, admin (Epic 3 — Engineering Workspace)
 * /marketplace → all authenticated roles
 * /portal    → claimant, admin
 */
export const DOMAIN_ROLE_MAP: Record<string, string[]> = {
  platform: ["platform_super_admin"],
  agency: ["agency", "admin", "platform_super_admin"], // platform_super_admin: system testing access (confirmed 2026-07-30)
  insurer: ["insurer", "admin", "platform_super_admin"],
  fleet: ["fleet_admin", "fleet_manager", "fleet_driver", "admin", "platform_super_admin"],
  engineer: ["engineer", "admin", "platform_super_admin"], // Epic 3 — Engineering Workspace (wired Epic 4.5)
  marketplace: [
    "admin", "insurer", "assessor", "panel_beater", "agency",
    "fleet_admin", "fleet_manager", "claimant", "user", "platform_super_admin",
  ],
  portal: ["claimant", "admin"],
  // Phase 8: customer domain — any authenticated user can access customer-facing pages
  customer: [
    "claimant", "fleet_manager", "fleet_driver", "fleet_admin",
    "agency", "insurer", "assessor", "panel_beater", "engineer",
    "admin", "platform_super_admin", "user",
  ],
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Explicit list of allowed roles. Takes precedence over `domain`. */
  allowedRoles?: string[];
  /** Insurer sub-role check (insurerRole field). Only applies to insurer users. */
  allowedInsurerRoles?: string[];
  /**
   * Domain key — automatically resolves allowedRoles from DOMAIN_ROLE_MAP.
   * Allowed values: 'platform' | 'agency' | 'insurer' | 'fleet' | 'marketplace' | 'portal'
   */
  domain?: keyof typeof DOMAIN_ROLE_MAP;
}

/**
 * ProtectedRoute component that enforces role-based access control
 *
 * Shows loading state while authentication is being verified (including retries
 * on server cold starts / restarts — prevents spurious /login redirects).
 * Redirects to login only after auth.me has fully settled with no user.
 * Redirects to unauthorized page if user's role is not in allowedRoles.
 */
export default function ProtectedRoute({ children, allowedRoles, allowedInsurerRoles, domain }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  // Show loading spinner while auth is being verified (including retry backoff)
  // NOTE: useAuth() already handles retry logic internally — do NOT create a
  // second trpc.auth.me.useQuery with enabled:false here. In React Query v5,
  // disabled queries have isLoading=true permanently (they are in "pending" state
  // and never settle), which would cause this spinner to never resolve.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Redirect to login only once auth has fully settled with no authenticated user
  if (!isAuthenticated || !user) {
    // Pass the current path as returnPath so the Login page can encode it into the
    // OAuth state. After OAuth completes, the callback redirects the user back here
    // instead of landing on /portal-hub and requiring a second navigation.
    const returnPath = encodeURIComponent(location);
    return <Redirect to={`/login?returnPath=${returnPath}`} />;
  }

  // Resolve effective role list: explicit allowedRoles > domain > none
  const effectiveRoles: string[] | undefined =
    allowedRoles ?? (domain ? DOMAIN_ROLE_MAP[domain] : undefined);

  // Check role against effective list
  // Phase 8: also check secondaryRoles for role coexistence
  const userSecondaryRoles: string[] = (user as any).secondaryRoles ?? [];
  const userAllRoles = [user.role, ...userSecondaryRoles];

  if (effectiveRoles && !userAllRoles.some(r => effectiveRoles.includes(r))) {
    console.warn(
      `[ProtectedRoute] 403 — user role "${user.role}" not in [${effectiveRoles.join(", ")}]` +
        (domain ? ` for domain "${domain}"` : "")
    );
    return <Redirect to="/unauthorized" />;
  }

  // Check insurer sub-role if specified (only for insurer role, admin bypasses)
  if (
    user.role === "insurer" &&
    allowedInsurerRoles &&
    allowedInsurerRoles.length > 0 &&
    (!user.insurerRole || !allowedInsurerRoles.includes(user.insurerRole))
  ) {
    return <Redirect to="/unauthorized" />;
  }

  // User is authenticated and has the correct role
  return <>{children}</>;
}
