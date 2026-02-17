/**
 * Onboarding Manager Component
 * 
 * Manages the onboarding flow for new users:
 * - Checks if user has completed onboarding
 * - Shows onboarding walkthrough on first login
 * - Tracks onboarding completion in localStorage
 * - Enforces tenant isolation from first login
 */

import { useEffect, useState } from "react";
import { OnboardingWalkthrough, type UserRole } from "./OnboardingWalkthrough";
import { useAuth } from "@/_core/hooks/useAuth";

const ONBOARDING_STORAGE_KEY = "kinga_onboarding_completed";

interface OnboardingManagerProps {
  children: React.ReactNode;
}

/**
 * Map user role string to UserRole type
 */
function mapUserRole(role: string | undefined): UserRole | null {
  if (!role) return null;
  
  const roleMap: Record<string, UserRole> = {
    claimant: "claimant",
    claims_processor: "claims_processor",
    "claims processor": "claims_processor",
    assessor_internal: "assessor_internal",
    "assessor internal": "assessor_internal",
    "internal assessor": "assessor_internal",
    assessor_external: "assessor_external",
    "assessor external": "assessor_external",
    "external assessor": "assessor_external",
    risk_manager: "risk_manager",
    "risk manager": "risk_manager",
    claims_manager: "claims_manager",
    "claims manager": "claims_manager",
    executive: "executive",
    fleet_manager: "fleet_manager",
    "fleet manager": "fleet_manager",
  };
  
  return roleMap[role.toLowerCase()] || null;
}

/**
 * Check if user has completed onboarding
 */
function hasCompletedOnboarding(userId: number, tenantId: string): boolean {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!stored) return false;
    
    const completed = JSON.parse(stored) as Record<string, boolean>;
    const key = `${tenantId}_${userId}`;
    return completed[key] === true;
  } catch {
    return false;
  }
}

/**
 * Mark onboarding as completed
 */
function markOnboardingCompleted(userId: number, tenantId: string): void {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const completed = stored ? JSON.parse(stored) : {};
    const key = `${tenantId}_${userId}`;
    completed[key] = true;
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(completed));
  } catch (error) {
    console.error("Failed to save onboarding completion:", error);
  }
}

export function OnboardingManager({ children }: OnboardingManagerProps) {
  const { user, loading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    // Wait for auth to load
    if (loading || !user) {
      setShowOnboarding(false);
      return;
    }

    // Enforce tenant isolation - user must have tenantId
    if (!user.tenantId) {
      console.error("User missing tenantId - tenant isolation violated");
      return;
    }

    // Map user role
    const mappedRole = mapUserRole(user.role);
    if (!mappedRole) {
      console.warn(`Unknown user role: ${user.role}`);
      setShowOnboarding(false);
      return;
    }

    setUserRole(mappedRole);

    // Check if onboarding already completed
    const completed = hasCompletedOnboarding(user.id, user.tenantId);
    if (completed) {
      setShowOnboarding(false);
      return;
    }

    // Show onboarding for new users
    setShowOnboarding(true);
  }, [user, loading]);

  const handleOnboardingComplete = () => {
    if (user && user.tenantId) {
      markOnboardingCompleted(user.id, user.tenantId);
    }
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    if (user && user.tenantId) {
      markOnboardingCompleted(user.id, user.tenantId);
    }
    setShowOnboarding(false);
  };

  return (
    <>
      {children}
      {showOnboarding && userRole && (
        <OnboardingWalkthrough
          role={userRole}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </>
  );
}
