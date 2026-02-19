import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

/**
 * DevRoleBadge Component
 * 
 * Displays a visual warning badge when dev role override is active.
 * Only renders in development mode.
 * Automatically hidden in production for security.
 */
export default function DevRoleBadge() {
  const { isDevOverride, user } = useAuth();

  // Only show in development when dev override is active
  if (!isDevOverride || import.meta.env.MODE !== "development") {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <Badge variant="destructive" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold shadow-lg">
        <AlertTriangle className="h-4 w-4" />
        DEV OVERRIDE: {user?.role}
        {user?.insurerRole && ` (${user.insurerRole})`}
      </Badge>
    </div>
  );
}
