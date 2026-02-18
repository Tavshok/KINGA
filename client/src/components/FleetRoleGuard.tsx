/**
 * FleetRoleGuard Component
 * 
 * Role-based access control for Fleet Portal routes.
 * Validates authentication, tenantId, and fleet role (fleet_admin, fleet_manager, fleet_driver).
 * 
 * Similar to RoleGuard but specific to fleet roles.
 */

import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

interface FleetRoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Array<"fleet_admin" | "fleet_manager" | "fleet_driver">;
  requireFleetId?: boolean; // Some routes may require fleet association
}

export function FleetRoleGuard({ children, allowedRoles, requireFleetId = false }: FleetRoleGuardProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Log access denial for security audit
  const logAccessDenial = trpc.system.logAccessDenial.useMutation();

  useEffect(() => {
    if (isLoading) return;

    // Check 1: User must be authenticated
    if (!user) {
      setLocation("/unauthorized");
      return;
    }

    // Check 2: User must have a tenantId (fleet association)
    if (!user.tenantId) {
      logAccessDenial.mutate({
        attemptedRoute: window.location.pathname,
        userId: user.id,
        userRole: user.role,
        fleetRole: user.role as any,
        denialReason: "no_tenant",
      });
      setLocation("/unauthorized?reason=no_tenant");
      return;
    }

    // Check 3: User must have a fleet role
    if (!["fleet_admin", "fleet_manager", "fleet_driver"].includes(user.role)) {
      logAccessDenial.mutate({
        attemptedRoute: window.location.pathname,
        userId: user.id,
        userRole: user.role,
        fleetRole: user.role as any,
        tenantId: user.tenantId,
        denialReason: "no_role",
      });
      setLocation("/unauthorized?reason=no_fleet_role");
      return;
    }

    // Check 4: User's fleet role must be in allowedRoles
    if (!allowedRoles.includes(user.role as any)) {
      logAccessDenial.mutate({
        attemptedRoute: window.location.pathname,
        userId: user.id,
        userRole: user.role,
        fleetRole: user.role as any,
        tenantId: user.tenantId,
        denialReason: "insufficient_permissions",
      });
      setLocation("/unauthorized?reason=insufficient_permissions");
      return;
    }

    // All checks passed - user can access this route
  }, [user, isLoading, allowedRoles, setLocation, logAccessDenial]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-sm text-gray-600">Verifying fleet access...</p>
        </div>
      </div>
    );
  }

  // If user doesn't meet requirements, they'll be redirected
  // Only render children if all checks passed
  if (
    user &&
    user.tenantId &&
    ["fleet_admin", "fleet_manager", "fleet_driver"].includes(user.role) &&
    allowedRoles.includes(user.role as any)
  ) {
    return <>{children}</>;
  }

  // Fallback loading state (should not be reached due to redirects)
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  );
}
