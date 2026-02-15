import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import KingaLogo from "@/components/KingaLogo";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  // Get role from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const roleParam = urlParams.get('role');
  
  const roleLabels: Record<string, string> = {
    insurer: 'Insurer Portal',
    assessor: 'Assessor Portal',
    panel_beater: 'Panel Beater Portal',
    claimant: 'Claimant Portal',
  };
  
  const roleLabel = roleParam ? roleLabels[roleParam] || 'KINGA Portal' : 'KINGA Portal';

  // Redirect authenticated users to their role-specific dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
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
    }
  }, [isAuthenticated, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <p>Streamline your insurance claims with AI-powered damage assessment and fraud detection.</p>
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
        </CardContent>
      </Card>
    </div>
  );
}
