import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { isAdminRole } from "@shared/role-permissions";
import { PORTAL_DOMAIN_ROLE_MAP, type PortalDomain } from "@/lib/roleRouting";

/**
 * Domain → Allowed Roles mapping (mirrors server/_core/domain-middleware.ts)
 *
 * /platform  → platform_super_admin
 * /agency    → agency, admin, platform_super_admin (system testing access — confirmed 2026-07-30)
 * /insurer   → insurer, admin
 * /fleet     → fleet_admin, fleet_manager, fleet_driver, admin
 * /engineer  → engineer, admin (Epic 3 — Engineering Workspace)
 * /marketplace → all authenticated roles
 * /portal    → claimant, admin, platform_super_admin (route testing only; object procedures remain authoritative)
 */
export const DOMAIN_ROLE_MAP = PORTAL_DOMAIN_ROLE_MAP;

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
  domain?: PortalDomain;
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

  // A restricted agency-assisted identity is a canonical claim-intake anchor,
  // not an independently authenticated My Portal user. Its later verified-link
  // process is server-audited; it must not acquire portal authority beforehand.
  if (Number((user as any).isUnregisteredClaimant ?? 0) === 1) {
    return <Redirect to="/unauthorized" />;
  }

  // Resolve effective role list: explicit allowedRoles > domain > none
  const effectiveRoles: string[] | undefined =
    allowedRoles ?? (domain ? [...DOMAIN_ROLE_MAP[domain]] : undefined);

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
    !isAdminRole(user.role) &&
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
