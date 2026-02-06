import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import PortalSelection from "./PortalSelection";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      // Redirect authenticated users to role-specific dashboard
      switch (user.role) {
        case "insurer":
        case "admin":
          setLocation("/insurer/dashboard");
          break;
        case "assessor":
          setLocation("/assessor/dashboard");
          break;
        case "panel_beater":
          setLocation("/panel-beater/dashboard");
          break;
        case "claimant":
          setLocation("/claimant/dashboard");
          break;
        default:
          setLocation("/login");
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show portal selection for unauthenticated users
  if (!isAuthenticated) {
    return <PortalSelection />;
  }

  // Show loading while redirecting authenticated users
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
