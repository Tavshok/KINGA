import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Home, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Unauthorized() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  // Extract denial reason from URL params
  const params = new URLSearchParams(location.split('?')[1] || '');
  const reason = params.get('reason') || 'insufficient_permissions';

  const reasonMessages: Record<string, { title: string; description: string }> = {
    no_tenant: {
      title: "No Tenant Assigned",
      description: "Your account is not associated with any insurer tenant. Please contact your administrator.",
    },
    no_role: {
      title: "Role Not Configured",
      description: "Your insurer role has not been set. Please configure your role to continue.",
    },
    insufficient_permissions: {
      title: "Insufficient Permissions",
      description: "Your current role does not have permission to access this resource.",
    },
  };

  const message = reasonMessages[reason] || reasonMessages.insufficient_permissions;

  const handleGoToDashboard = () => {
    if (!user) {
      setLocation("/login");
      return;
    }

    // Redirect to appropriate dashboard based on role
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
        setLocation("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
          <CardDescription>
            {message.title}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-center text-muted-foreground space-y-2">
            <p>{message.description}</p>
            <p className="text-amber-700 font-medium">
              You attempted to access a portal that your account role does not permit.
            </p>
            {user && (
              <p className="font-medium">
                Current Role:{" "}
                <span className="text-foreground capitalize font-semibold">
                  {user.role?.replace(/_/g, ' ') || 'unknown'}
                </span>
                {user.insurerRole && (
                  <> &mdash; {user.insurerRole.replace(/_/g, ' ')}</>
                )}
              </p>
            )}
          </div>
          
          <div className="flex flex-col gap-2">
            {reason === 'no_role' && (
              <Button 
                className="w-full" 
                onClick={() => setLocation('/role-setup')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configure Role
              </Button>
            )}
            
            <Button 
              className="w-full" 
              variant={reason === 'no_role' ? 'outline' : 'default'}
              onClick={() => setLocation('/portal-hub')}
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Portal Hub
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </div>
          
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 text-center">
              This access attempt has been logged for security purposes.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
