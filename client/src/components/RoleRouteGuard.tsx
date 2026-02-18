import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle } from "lucide-react";

/**
 * Role Route Guard Component
 * 
 * Enforces role-based access control for insurer portal dashboards.
 * Automatically redirects users to their correct dashboard based on insurerRole.
 */

interface RoleRouteGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

// Role to route mapping (matches existing App.tsx routes)
const ROLE_ROUTES: Record<string, string> = {
  claims_processor: "/insurer-portal/claims-processor",
  assessor_internal: "/insurer-portal/internal-assessor",
  risk_manager: "/insurer-portal/risk-manager",
  claims_manager: "/insurer-portal/claims-manager",
  executive: "/insurer-portal/executive",
  insurer_admin: "/insurer-portal/executive", // Admin sees executive dashboard
};

export function RoleRouteGuard({ allowedRoles, children }: RoleRouteGuardProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !user) return;

    const userRole = user.insurerRole;
    
    // If user has no insurer role, redirect to portal hub
    if (!userRole) {
      setLocation("/portal-hub");
      return;
    }

    // If user's role is not in allowed roles, redirect to their correct dashboard
    if (!allowedRoles.includes(userRole)) {
      const correctRoute = ROLE_ROUTES[userRole];
      if (correctRoute && correctRoute !== location) {
        setLocation(correctRoute);
      }
    }
  }, [user, isLoading, allowedRoles, location, setLocation]);

  // Loading state
  if (isLoading) {
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
 * Hook to get the correct dashboard route for the current user
 */
export function useRoleDashboardRoute() {
  const { user } = useAuth();
  
  if (!user?.insurerRole) {
    return "/portal-hub";
  }
  
  return ROLE_ROUTES[user.insurerRole] || "/portal-hub";
}
