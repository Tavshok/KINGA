import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { isPortalNavigationAllowed, INSURER_ROLE_PORTAL_MAP } from "@/lib/roleRouting";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  requireTenant?: boolean;
}

/**
 * RoleGuard Component
 *
 * Protects routes by validating:
 * 1. User is authenticated
 * 2. User has a valid tenantId (if requireTenant is true)
 * 3. User's insurerRole is permitted to access the current path
 *
 * The guard uses the centralized PORTAL_ROUTE_ROLES table from roleRouting.ts
 * as the single source of truth.  The `allowedRoles` prop is still accepted for
 * backward compatibility but the path-based check takes precedence for
 * insurer-portal routes.
 *
 * Admin users (user.role === "admin") bypass role checks but receive a visible
 * "Admin Override" indicator so cross-portal access is always auditable.
 */
export function RoleGuard({ children, allowedRoles, requireTenant = true }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  // ── Admin override: bypass role checks but show a visible indicator ──────
  if (user.role === "admin") {
    return (
      <>
        {/* Admin override banner — always visible so cross-portal access is auditable */}
        <div
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            zIndex: 9999,
            background: "rgba(220,38,38,0.92)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "6px",
            letterSpacing: "0.04em",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          ADMIN OVERRIDE — {location}
        </div>
        {children}
      </>
    );
  }

  if (requireTenant && !user.tenantId) {
    return <Redirect to="/unauthorized?reason=no_tenant" />;
  }

  if (!user.insurerRole && user.role === "insurer") {
    return <Redirect to="/unauthorized?reason=no_role" />;
  }

  // ── Centralized portal navigation guard ───────────────────────────────────
  // For insurer-portal routes: use the path-based guard as the single source of truth.
  // For non-insurer-portal routes: fall back to the allowedRoles prop.
  if (user.role === "insurer") {
    const allowed = isPortalNavigationAllowed(location, user.role, user.insurerRole);
    if (!allowed) {
      // Redirect to the user's own portal instead of a generic unauthorized page
      const ownPortal = INSURER_ROLE_PORTAL_MAP[user.insurerRole ?? ""] ?? "/insurer-portal";
      return <Redirect to={`/unauthorized?reason=wrong_portal&redirectTo=${encodeURIComponent(ownPortal)}`} />;
    }
    return <>{children}</>;
  }

  // ── Non-insurer roles: use the allowedRoles prop ───────────────────────────
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role ?? "")) {
    return <Redirect to="/unauthorized?reason=insufficient_permissions" />;
  }

  return <>{children}</>;
}
