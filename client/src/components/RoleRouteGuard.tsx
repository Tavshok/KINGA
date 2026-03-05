import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle } from "lucide-react";
import { INSURER_ROLE_PORTAL_MAP, getRoleDashboardPath } from "@/lib/roleRouting";

/**
 * Role Route Guard Component
 *
 * Enforces role-based access control for insurer portal dashboards.
 * Automatically redirects users to their correct dashboard based on insurerRole.
 * Route mapping is sourced from the shared @/lib/roleRouting helper so there
 * is a single source of truth across the whole application.
 */

interface RoleRouteGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function RoleRouteGuard({ allowedRoles, children }: RoleRouteGuardProps) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !user) return;

    const userRole = user.insurerRole;

    // If user has no insurer role, redirect to portal hub
    if (!userRole) {
      setLocation("/portal-hub");
      return;
    }

    // If user's role is not in allowed roles, redirect to their correct dashboard
    if (!allowedRoles.includes(userRole)) {
      const correctRoute = INSURER_ROLE_PORTAL_MAP[userRole];
      if (correctRoute && correctRoute !== location) {
        setLocation(correctRoute);
      }
    }
  }, [user, loading, allowedRoles, location, setLocation]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>Verifying access permissions</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Authentication Required
            </CardTitle>
            <CardDescription>
              You must be logged in to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/portal-hub"} className="w-full">
              Go to Portal Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No insurer role assigned
  if (!user.insurerRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              No Role Assigned
            </CardTitle>
            <CardDescription>
              You do not have an insurer role assigned. Please contact your administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = "/portal-hub"} className="w-full">
              Return to Portal Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Role not in allowed roles - will redirect via useEffect
  if (!allowedRoles.includes(user.insurerRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              Your role ({user.insurerRole}) does not have access to this dashboard. Redirecting to your dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Access granted
  return <>{children}</>;
}

/**
 * Hook to get the correct dashboard route for the current user.
 * Uses the shared getRoleDashboardPath helper so the mapping is maintained
 * in a single place (client/src/lib/roleRouting.ts).
 */
export function useRoleDashboardRoute() {
  const { user } = useAuth();
  return getRoleDashboardPath(user?.role, user?.insurerRole);
}
