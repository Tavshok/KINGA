import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

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
 * 3. User's insurerRole is in the allowedRoles list
 */
export function RoleGuard({ children, allowedRoles, requireTenant = true }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const [_location] = useLocation();

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

  // Admin users bypass all role checks
  if (user.role === "admin") {
    return <>{children}</>;
  }

  if (requireTenant && !user.tenantId) {
    return <Redirect to="/unauthorized?reason=no_tenant" />;
  }

  if (!user.insurerRole) {
    return <Redirect to="/unauthorized?reason=no_role" />;
  }

  if (!allowedRoles.includes(user.insurerRole)) {
    return <Redirect to="/unauthorized?reason=insufficient_permissions" />;
  }

  return <>{children}</>;
}
