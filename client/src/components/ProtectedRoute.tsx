import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedInsurerRoles?: string[];
}

/**
 * ProtectedRoute component that enforces role-based access control
 * 
 * Shows loading state while authentication is being verified
 * Redirects to login if user is not authenticated
 * Redirects to unauthorized page if user's role is not in allowedRoles
 */
export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading spinner while auth is being verified
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

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Redirect to="/login" />;
  }

  // Check if user's role is allowed (if allowedRoles is specified)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
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
