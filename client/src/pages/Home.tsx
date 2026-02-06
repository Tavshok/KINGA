import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated && user) {
        // Redirect to role-specific dashboard
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
      } else {
        // Not authenticated, redirect to login
        setLocation("/login");
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
