/**
 * Auto-Assignment Badge Component
 * 
 * Displays warning badge when claims have been auto-assigned due to intake queue inactivity.
 * Shows count of auto-assigned claims in the last 24 hours.
 */

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export function AutoAssignmentBadge() {
  const [dismissed, setDismissed] = useState(false);
  
  // Query auto-assigned claims count (last 24 hours)
  const { data: autoAssignStats } = trpc.intakeGate.getAutoAssignStats.useQuery();
  
  const count = autoAssignStats?.count || 0;
  
  // Don't show if no auto-assignments or if dismissed
  if (count === 0 || dismissed) {
    return null;
  }
  
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>
            <Badge variant="destructive" className="mr-2">
              {count}
            </Badge>
            {count === 1 ? "claim was" : "claims were"} auto-assigned due to intake queue inactivity
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
