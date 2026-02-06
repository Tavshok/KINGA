import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold">KINGA</CardTitle>
          <CardDescription className="text-lg">
            AutoVerify AI - Insurance Claims Management
          </CardDescription>
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
