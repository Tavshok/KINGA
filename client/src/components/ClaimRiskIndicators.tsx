/**
 * Reusable Risk Badge and KINGA Assess Button components
 * Used across all insurer dashboards to show fraud risk indicators
 * and trigger KINGA assessments on claims.
 */
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  ShieldQuestion,
  Brain,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";

/**
 * Risk level thresholds:
 * - Critical: 70-100 (red)
 * - Medium: 40-69 (orange)
 * - Low: 1-39 (yellow)
 * - None/Unassessed: 0 or null (gray)
 */

interface RiskBadgeProps {
  fraudRiskScore: number | null | undefined;
  fraudFlags?: string | null;
  size?: "sm" | "md" | "lg";
  showScore?: boolean;
  showFlags?: boolean;
}

/**
 * Visual risk indicator badge that shows fraud risk level
 * with color-coded severity and optional score display
 */
export function RiskBadge({ 
  fraudRiskScore, 
  fraudFlags, 
  size = "sm", 
  showScore = true,
  showFlags = false 
}: RiskBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const score = fraudRiskScore ?? 0;
  
  // Parse fraud flags
  let flags: string[] = [];
  if (fraudFlags) {
    try {
      flags = JSON.parse(fraudFlags);
    } catch {
      flags = [];
    }
  }

  if (score === 0 && !fraudFlags) {
    return (
      <Badge 
        variant="outline" 
        className={`${size === "sm" ? "text-xs px-1.5 py-0.5" : size === "md" ? "text-sm px-2 py-1" : "text-base px-3 py-1.5"} bg-gray-50 dark:bg-muted/50 text-gray-700 dark:text-gray-400 dark:text-muted-foreground border-gray-200 dark:border-border`}
      >
        <ShieldQuestion className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
        Not Assessed
      </Badge>
    );
  }

  const getRiskConfig = () => {
    if (score >= 70) return {
      label: "High Risk",
      className: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 animate-pulse",
      icon: ShieldAlert,
      glowClass: "shadow-red-200 shadow-sm"
    };
    if (score >= 40) return {
      label: "Medium Risk",
      className: "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
      icon: AlertTriangle,
      glowClass: "shadow-orange-200 shadow-sm"
    };
    return {
      label: "Low Risk",
      className: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
      icon: ShieldCheck,
      glowClass: ""
    };
  };

  const config = getRiskConfig();
  const Icon = config.icon;

  return (
    <div className="inline-flex flex-col gap-1">
      <Badge 
        variant="outline"
        className={`${size === "sm" ? "text-xs px-1.5 py-0.5" : size === "md" ? "text-sm px-2 py-1" : "text-base px-3 py-1.5"} ${config.className} ${config.glowClass} cursor-pointer transition-all`}
        onClick={() => flags.length > 0 && setExpanded(!expanded)}
      >
        <Icon className={`${size === "sm" ? "h-3 w-3" : "h-4 w-4"} mr-1`} />
        {config.label}
        {showScore && <span className="ml-1 font-mono">({score})</span>}
        {flags.length > 0 && (
          expanded 
            ? <ChevronUp className="h-3 w-3 ml-1" /> 
            : <ChevronDown className="h-3 w-3 ml-1" />
        )}
      </Badge>
      
      {/* Expandable fraud flags */}
      {(showFlags || expanded) && flags.length > 0 && (
        <div className="bg-red-50/50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md p-2 text-xs text-red-700 dark:text-red-300 max-w-xs">
          <p className="font-semibold mb-1">Fraud Indicators ({flags.length}):</p>
          <ul className="list-disc list-inside space-y-0.5">
            {flags.slice(0, 5).map((flag, i) => (
              <li key={i} className="truncate">{flag}</li>
            ))}
            {flags.length > 5 && (
              <li className="text-red-500 italic">+{flags.length - 5} more indicators...</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline status constants ────────────────────────────────────────────────
const IN_PROGRESS_STATUSES = new Set([
  "assessment_in_progress",
  "analysing",
  "analysis_in_progress",
]);

const SUCCESS_STATUSES = new Set([
  "assessment_complete",
  "approved",
  "rejected",
  "settled",
  "closed",
]);

const FAILED_STATUSES = new Set([
  "assessment_failed",
  "failed",
]);

type PollState = "idle" | "triggered" | "polling" | "done" | "failed";

interface AiAssessButtonProps {
  claimId: number;
  claimNumber?: string;
  currentStatus?: string;
  onSuccess?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "ghost";
}

/**
 * KINGA Assessment trigger button with real-time polling.
 *
 * Flow:
 *   1. User clicks → mutation fires (returns immediately, pipeline runs async)
 *   2. Button shows "Analysing…" and polls claims.getById every 3 s
 *   3. When status leaves IN_PROGRESS_STATUSES the poll stops
 *   4. Shows "Complete" or "Failed" badge; calls onSuccess on completion
 *
 * This replaces the old false-positive "Assessment completed" toast that fired
 * as soon as the HTTP round-trip returned (before the pipeline had run).
 */
export function AiAssessButton({ 
  claimId, 
  claimNumber,
  currentStatus,
  onSuccess,
  size = "sm",
  variant = "outline"
}: AiAssessButtonProps) {
  const [pollState, setPollState] = useState<PollState>("idle");
  const [showDialog, setShowDialog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine if the claim is already in-progress when the component mounts
  useEffect(() => {
    if (currentStatus && IN_PROGRESS_STATUSES.has(currentStatus)) {
      setPollState("polling");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll claim status until it leaves the in-progress set
  const { data: pollData } = trpc.claims.getById.useQuery(
    { id: claimId },
    {
      enabled: pollState === "polling",
      refetchInterval: 3_000,
      refetchIntervalInBackground: true,
    }
  );

  useEffect(() => {
    if (pollState !== "polling" || !pollData) return;
    const status: string = (pollData as { status?: string }).status ?? "";
    if (SUCCESS_STATUSES.has(status)) {
      setPollState("done");
      toast.success(`KINGA analysis complete for ${claimNumber ?? `claim #${claimId}`}`);
      onSuccess?.();
    } else if (FAILED_STATUSES.has(status)) {
      setPollState("failed");
      toast.error(`KINGA analysis failed for ${claimNumber ?? `claim #${claimId}`}. Please retry.`);
    }
    // If still in-progress, keep polling
  }, [pollData, pollState, claimId, claimNumber, onSuccess]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const triggerMutation = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      // The pipeline is now running in the background — start polling
      setPollState("polling");
      toast.info(`KINGA analysis started for ${claimNumber ?? `claim #${claimId}`} — results will appear automatically`);
    },
    onError: (error) => {
      setPollState("idle");
      toast.error(`Failed to start KINGA analysis: ${error.message}`);
    },
  });

  const handleTrigger = () => {
    if (pollState === "polling" || triggerMutation.isPending) return;
    setPollState("triggered");
    triggerMutation.mutate({ claimId });
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-1 h-7",
    md: "text-sm px-3 py-1.5 h-8",
    lg: "text-base px-4 py-2 h-10"
  };

  const isRunning = pollState === "triggered" || pollState === "polling";

  return (
    <>
      <Button
        variant={pollState === "done" ? "default" : variant}
        className={[
          sizeClasses[size],
          "gap-1",
          pollState === "done"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
            : pollState === "failed"
              ? "border-red-400 text-red-600 dark:text-red-400"
              : "border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:bg-teal-950/30 hover:text-teal-800 dark:text-teal-200"
        ].join(" ")}
        onClick={pollState === "done" ? () => setShowDialog(true) : handleTrigger}
        disabled={isRunning || triggerMutation.isPending}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Analysing…
          </>
        ) : pollState === "done" ? (
          <>
            <CheckCircle2 className="h-3 w-3" />
            Complete
          </>
        ) : pollState === "failed" ? (
          <>
            <XCircle className="h-3 w-3" />
            Retry
          </>
        ) : (
          <>
            <Brain className="h-3 w-3" />
            KINGA Assess
          </>
        )}
      </Button>

      {/* Results Dialog — shown after analysis completes */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              KINGA Analysis Complete
            </DialogTitle>
            <DialogDescription>
              {claimNumber ? `Claim ${claimNumber}` : `Claim #${claimId}`} has been fully analysed by the pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              KINGA has analysed the claim documents, damage photographs, physics reconstruction,
              and fraud indicators. The full assessment is now available.
            </p>
            <div className="flex gap-2">
              <Button 
                className="flex-1 bg-gradient-to-r from-teal-600 to-teal-700 text-white"
                onClick={() => {
                  window.location.href = `/insurer/claims/${claimId}/comparison`;
                  setShowDialog(false);
                }}
              >
                View Full Assessment
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inline progress indicator shown while polling */}
      {isRunning && (
        <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 ml-1">
          <Clock className="h-3 w-3" />
          Pipeline running…
        </span>
      )}
    </>
  );
}

/**
 * Compact risk indicator for table rows and list items
 * Shows just the colored dot with tooltip-style hover
 */
export function RiskDot({ fraudRiskScore }: { fraudRiskScore: number | null | undefined }) {
  const score = fraudRiskScore ?? 0;
  
  if (score === 0) return null;
  
  const colorClass = score >= 70 
    ? "bg-red-500 animate-pulse" 
    : score >= 40 
      ? "bg-orange-600" 
      : "bg-emerald-600";
  
  return (
    <span 
      className={`inline-block w-2.5 h-2.5 rounded-full ${colorClass}`} 
      title={`Fraud Risk: ${score}/100`}
    />
  );
}
