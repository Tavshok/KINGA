/**
 * FleetRoleGuard Component
 *
 * Role-based access control for Fleet Portal routes.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface FleetRoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Array<"fleet_admin" | "fleet_manager" | "fleet_driver">;
  requireFleetId?: boolean;
}

export function FleetRoleGuard({ children, allowedRoles, requireFleetId = false }: FleetRoleGuardProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setLocation("/unauthorized");
      return;
    }

    if (!user.tenantId) {
      setLocation("/unauthorized?reason=no_tenant");
      return;
    }

    if (!["fleet_admin", "fleet_manager", "fleet_driver"].includes(user.role)) {
      setLocation("/unauthorized?reason=no_fleet_role");
      return;
    }

    if (!allowedRoles.includes(user.role as any)) {
      setLocation("/unauthorized?reason=insufficient_permissions");
      return;
    }
  }, [user, loading, allowedRoles, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <p className="text-sm text-gray-600 dark:text-muted-foreground">Verifying fleet access...</p>
        </div>
      </div>
    );
  }

  if (
    user &&
    user.tenantId &&
    ["fleet_admin", "fleet_manager", "fleet_driver"].includes(user.role) &&
    allowedRoles.includes(user.role as any)
  ) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  );
}
