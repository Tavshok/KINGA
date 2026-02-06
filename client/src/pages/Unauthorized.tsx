import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Unauthorized() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();

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
            You don't have permission to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-center text-muted-foreground space-y-2">
            <p>This page is restricted to specific user roles.</p>
            {user && (
              <p className="font-medium">
                Your current role: <span className="text-foreground capitalize">{user.role.replace('_', ' ')}</span>
              </p>
            )}
          </div>
          
          <div className="flex flex-col gap-2">
            <Button 
              className="w-full" 
              onClick={handleGoToDashboard}
            >
              Go to My Dashboard
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
