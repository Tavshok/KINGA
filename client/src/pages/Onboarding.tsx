import { useAuth } from "@/_core/hooks/useAuth";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useLocation } from "wouter";

export default function Onboarding() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    navigate("/login");
    return null;
  }

  const handleComplete = () => {
    // Mark onboarding as complete in localStorage
    localStorage.setItem(`onboarding_complete_${user.id}`, "true");
  };

  return (
    <OnboardingWizard 
      userRole={user.role as any} 
      onComplete={handleComplete}
    />
  );
}
