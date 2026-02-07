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
      // Redirect authenticated users to portal hub for role selection
      setLocation("/portal-hub");
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
