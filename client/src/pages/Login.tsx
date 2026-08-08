import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, ArrowRight } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  
  // Get role from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const roleParam = urlParams.get('role');
  
  const roleLabels: Record<string, string> = {
    insurer: 'Insurer Portal',
    assessor: 'Assessor Portal',
    panel_beater: 'Panel Beater Portal',
    claimant: 'Claimant Portal',
    agency: 'Agency Portal',
    platform_super_admin: 'Platform Administration',
  };
  
  const roleLabel = roleParam ? roleLabels[roleParam] || 'KINGA Portal' : 'KINGA Portal';

  // IMPORTANT: Every role in the DB enum must be listed here.
  // Missing roles fall through to /portal-hub which requires auth → redirect loop.
  const getDashboardPath = (userRole: string) => {
    switch (userRole) {
      case "insurer":
      case "admin":
        return "/insurer-portal";
      case "assessor":
        return "/assessor/dashboard";
      case "panel_beater":
        return "/panel-beater/dashboard";
      case "fleet_manager":
      case "fleet_admin":
      case "fleet_driver":
        return "/fleet";
      case "agency":
        return "/agency";
      case "engineer":
        return "/engineer/dashboard";
      case "claimant":
      case "user":
        return "/client";
      case "platform_super_admin":
        return "/platform/overview";
      default:
        return "/portal-hub";
    }
  };

  const handleLogout = async () => {
    await logout();
    // After logout, the page will refresh and show the login form
  };

  const handleContinueToDashboard = () => {
    if (user) {
      setLocation(getDashboardPath(user.role));
    }
  };

  // Auto-redirect authenticated users to their dashboard immediately
  useEffect(() => {
    if (isAuthenticated && user && !loading) {
      setLocation(getDashboardPath(user.role));
    }
  }, [isAuthenticated, user, loading, setLocation]);
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  // If user is already authenticated, show a brief loading state while redirecting
  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // DEAD CODE - kept for reference, auto-redirect handles this case above
  if (false && isAuthenticated && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex justify-center">
              <KingaLogo />
            </div>
            <CardTitle>Already Logged In</CardTitle>
            <CardDescription className="text-lg">
              {roleLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <AlertDescription className="text-center">
                You are currently logged in as <strong>{user.name || user.email}</strong>
                <br />
                <span className="text-sm text-muted-foreground">
                  Role: {user.role === "admin" ? "Administrator" : user.role.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleContinueToDashboard}
              >
                Continue to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <Button 
                variant="outline"
                className="w-full" 
                size="lg"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>

            <div className="text-xs text-center text-muted-foreground">
              <p>To switch accounts, please logout first</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show login form for unauthenticated users
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <KingaLogo />
          </div>
          <CardDescription className="text-lg">
            {roleLabel}
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            Insurance Claims Management
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>Streamline your insurance claims with KINGA-powered damage assessment and fraud detection.</p>
          </div>
          
          <Button 
            className="w-full" 
            size="lg"
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
          >
            Sign In with Manus
          </Button>

          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>Secure authentication powered by Manus OAuth</p>
            <p className="text-xs">For Insurers, Assessors, Panel Beaters, and Claimants</p>
          </div>

          {/* SR-H06: Account recovery link — surfaces the Manus OAuth portal for password reset / account recovery */}
          <div className="text-center pt-2">
            <a
              href={(() => {
                const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
                const appId = import.meta.env.VITE_APP_ID;
                const redirectUri = `${window.location.origin}/api/oauth/callback`;
                const url = new URL(`${oauthPortalUrl}/app-auth`);
                url.searchParams.set('appId', appId);
                url.searchParams.set('redirectUri', redirectUri);
                url.searchParams.set('type', 'forgotPassword');
                return url.toString();
              })()}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Forgot password or need account recovery?
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
