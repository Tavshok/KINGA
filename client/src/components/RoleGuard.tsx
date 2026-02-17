import { useEffect } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

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
 * 
 * On access denial:
 * - Logs the denial to access_denial_log table
 * - Redirects to /unauthorized page
 * 
 * @param children - The protected content to render if access is granted
 * @param allowedRoles - Array of insurerRole values that are allowed to access this route
 * @param requireTenant - Whether to require a tenantId (default: true for insurer routes)
 */
export function RoleGuard({ children, allowedRoles, requireTenant = true }: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  
  // Mutation for logging access denials
  const logAccessDenial = trpc.audit.logAccessDenial.useMutation();

  useEffect(() => {
    // If user is loaded and access should be denied, log it
    if (!isLoading && user) {
      const shouldDeny = 
        (requireTenant && !user.tenantId) ||
        !user.insurerRole ||
        !allowedRoles.includes(user.insurerRole);

      if (shouldDeny) {
        logAccessDenial.mutate({
          attemptedRoute: location,
          userRole: user.role || "unknown",
          insurerRole: user.insurerRole || null,
          tenantId: user.tenantId || null,
          denialReason: getDenialReason(user, allowedRoles, requireTenant),
        });
      }
    }
  }, [user, isLoading, location, allowedRoles, requireTenant, logAccessDenial]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Redirect to="/" />;
  }

  // Check tenant requirement
  if (requireTenant && !user.tenantId) {
    return <Redirect to="/unauthorized?reason=no_tenant" />;
  }

  // Check if insurerRole is set
  if (!user.insurerRole) {
    return <Redirect to="/unauthorized?reason=no_role" />;
  }

  // Check if user's role is in allowed roles
  if (!allowedRoles.includes(user.insurerRole)) {
    return <Redirect to="/unauthorized?reason=insufficient_permissions" />;
  }

  // Access granted - render protected content
  return <>{children}</>;
}

/**
 * Helper function to determine the reason for access denial
 */
function getDenialReason(
  user: { tenantId?: string | null; insurerRole?: string | null; role?: string | null },
  allowedRoles: string[],
  requireTenant: boolean
): string {
  if (requireTenant && !user.tenantId) {
    return "Missing tenant ID";
  }
  if (!user.insurerRole) {
    return "Insurer role not set";
  }
  if (!allowedRoles.includes(user.insurerRole)) {
    return `Role '${user.insurerRole}' not in allowed roles: ${allowedRoles.join(", ")}`;
  }
  return "Unknown reason";
}
