import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import PortalSelection from "./PortalSelection";

export default function Home() {
  const { user } = useAuth();
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

  // Always show the landing page — Option A
  // If logged in, PortalSelection receives the user and shows a "Go to My Portal" button
  return <PortalSelection loggedInUser={user ?? null} onGoToPortal={() => user && setLocation(getDashboardPath(user.role))} />;
}
