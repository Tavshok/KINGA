/**
 * Reusable Risk Badge and AI Assess Button components
 * Used across all insurer dashboards to show fraud risk indicators
 * and trigger AI assessments on claims.
 */
import { useState } from "react";
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
  ChevronUp
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
        className={`${size === "sm" ? "text-xs px-1.5 py-0.5" : size === "md" ? "text-sm px-2 py-1" : "text-base px-3 py-1.5"} bg-gray-50 dark:bg-muted/50 text-gray-500 dark:text-muted-foreground border-gray-200 dark:border-border`}
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

interface AiAssessButtonProps {
  claimId: number;
  claimNumber?: string;
  currentStatus?: string;
  onSuccess?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "ghost";
}

/**
 * AI Assessment trigger button with loading state and result dialog.
 * Can be placed on any dashboard to trigger AI analysis of a claim.
 */
export function AiAssessButton({ 
  claimId, 
  claimNumber,
  currentStatus,
  onSuccess,
  size = "sm",
  variant = "outline"
}: AiAssessButtonProps) {
  const [showResults, setShowResults] = useState(false);
  
  const triggerAiAssessment = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      toast.success("AI Assessment completed successfully");
      onSuccess?.();
      setShowResults(true);
    },
    onError: (error) => {
      toast.error(`AI Assessment failed: ${error.message}`);
    },
  });

  const handleTrigger = () => {
    triggerAiAssessment.mutate({ claimId });
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-1 h-7",
    md: "text-sm px-3 py-1.5 h-8",
    lg: "text-base px-4 py-2 h-10"
  };

  return (
    <>
      <Button
        variant={variant}
        className={`${sizeClasses[size]} gap-1 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:bg-teal-950/30 hover:text-teal-800 dark:text-teal-200`}
        onClick={handleTrigger}
        disabled={triggerAiAssessment.isPending}
      >
        {triggerAiAssessment.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Assessing...
          </>
        ) : (
          <>
            <Brain className="h-3 w-3" />
            AI Assess
          </>
        )}
      </Button>

      {/* Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-teal-600" />
              AI Assessment Complete
            </DialogTitle>
            <DialogDescription>
              {claimNumber ? `Claim ${claimNumber}` : `Claim #${claimId}`} has been assessed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              The AI has analyzed the claim photos, damage patterns, and physics data. 
              Results are now available in the claim's comparison view.
            </p>
            <Button 
              className="w-full bg-gradient-to-r from-teal-600 to-teal-700 text-white"
              onClick={() => {
                window.location.href = `/insurer/claims/${claimId}/comparison`;
                setShowResults(false);
              }}
            >
              View Full Assessment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
      ? "bg-orange-400" 
      : "bg-emerald-400";
  
  return (
    <span 
      className={`inline-block w-2.5 h-2.5 rounded-full ${colorClass}`} 
      title={`Fraud Risk: ${score}/100`}
    />
  );
}
