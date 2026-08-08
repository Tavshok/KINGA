import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import PortalSelection from "./PortalSelection";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const getDashboardPath = (role: string) => {
    switch (role) {
      case "insurer": case "admin": return "/insurer-portal";
      case "assessor": return "/assessor/dashboard";
      case "panel_beater": return "/panel-beater/dashboard";
      case "fleet_manager": case "fleet_admin": case "fleet_driver": return "/fleet";
      case "agency": return "/agency";
      case "engineer": return "/engineer/dashboard";
      case "claimant": case "user": return "/client";
      case "platform_super_admin": return "/platform/overview";
      default: return "/insurer-portal";
    }
  };

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      setLocation(getDashboardPath(user.role));
    }
  }, [loading, isAuthenticated, user, setLocation]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
