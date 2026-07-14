/**
 * AiStatusBadge
 *
 * A small, read-only badge that displays the current KINGA assessment processing
 * state for a claim.  It derives its state purely from data already in scope —
 * the claim's status field and whether an aiAssessment record exists.
 *
 * State mapping:
 *   aiAssessment present + aiAssessmentCompleted = 1  →  "Complete"   (green)
 *   claim.status = "assessment_in_progress"
 *     or "assessment_pending"
 *     or workflowState = "ai_assessment_pending"      →  "Analysing…" (yellow)
 *   claim.status = "assessment_complete"
 *     or aiAssessment present (any)                   →  "Complete"   (green)
 *   No aiAssessment + none of the above               →  "Waiting for KINGA" (grey)
 *
 * No tRPC calls, no side-effects.
 */

import { cn } from "@/lib/utils";
import { Brain, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Claim {
  status?: string | null;
  workflowState?: string | null;
  aiAssessmentTriggered?: number | null;
  aiAssessmentCompleted?: number | null;
  documentProcessingStatus?: string | null;
}

interface AiAssessment {
  id?: number;
  [key: string]: unknown;
}

interface Props {
  claim: Claim | null | undefined;
  aiAssessment: AiAssessment | null | undefined;
  /** Extra CSS classes for the outer wrapper */
  className?: string;
}

// ─── State derivation ─────────────────────────────────────────────────────────

type AiState = "waiting" | "analysing" | "complete" | "failed";

function deriveAiState(claim: Claim | null | undefined, aiAssessment: AiAssessment | null | undefined): AiState {
  if (!claim) return "waiting";

  const status = claim.status ?? "";
  const workflowState = claim.workflowState ?? "";
  const docStatus = claim.documentProcessingStatus ?? "";

  // Explicit failure states — DRA Phase 2 failure path
  if (
    status === "ai_failed" ||
    workflowState === "ai_failed" ||
    status === "document_failed" ||
    status === "human_review_required" ||
    docStatus === "DOCUMENT_FAILED" ||
    docStatus === "HUMAN_REVIEW_REQUIRED" ||
    docStatus === "failed"
  ) return "failed";

  // DRA Phase 2 transient states — show spinner
  // Includes both legacy states (parsing/processing/extracting) and new DRA states.
  // Check this BEFORE the complete check so re-runs show the spinner correctly.
  if (
    docStatus === "parsing" ||
    docStatus === "processing" ||
    docStatus === "extracting" ||
    docStatus === "DOCUMENT_VALIDATING" ||
    docStatus === "DOCUMENT_READY" ||
    docStatus === "ANALYSIS_RUNNING" ||
    docStatus === "RECOVERY_ATTEMPTED" ||
    status === "document_validating" ||
    status === "document_ready" ||
    status === "analysis_running" ||
    status === "recovery_attempted" ||
    status === "assessment_in_progress" ||
    status === "assessment_pending" ||
    workflowState === "ai_assessment_pending" ||
    claim.aiAssessmentTriggered === 1
  ) {
    return "analysing";
  }

  // Complete: DRA success terminal (analysis_complete) or legacy assessment_complete
  if (
    claim.aiAssessmentCompleted === 1 ||
    status === "analysis_complete" ||
    docStatus === "ANALYSIS_COMPLETE" ||
    status === "assessment_complete" ||
    workflowState === "ai_assessment_completed" ||
    (aiAssessment != null)
  ) {
    return "complete";
  }

  return "waiting";
}

// ─── Visual config ────────────────────────────────────────────────────────────

const CONFIG: Record<AiState, {
  label: string;
  containerClass: string;
  Icon: React.ElementType;
  iconClass: string;
  spin?: boolean;
}> = {
  waiting: {
    label: "Waiting for KINGA",
    containerClass: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground border-gray-200 dark:border-border",
    Icon: Clock,
    iconClass: "text-gray-600 dark:text-gray-400 dark:text-muted-foreground/70",
  },
  analysing: {
    label: "Analysing…",
    containerClass: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    Icon: Loader2,
    iconClass: "text-amber-500",
    spin: true,
  },
  complete: {
    label: "KINGA Complete",
    containerClass: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    Icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  failed: {
    label: "KINGA Failed",
    containerClass: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    Icon: XCircle,
    iconClass: "text-red-500",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AiStatusBadge({ claim, aiAssessment, className }: Props) {
  const state = deriveAiState(claim, aiAssessment);
  const { label, containerClass, Icon, iconClass, spin } = CONFIG[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium select-none",
        containerClass,
        className
      )}
      title={`KINGA Assessment Status: ${label}`}
    >
      <Brain className="h-3 w-3 shrink-0 opacity-70" />
      <Icon className={cn("h-3 w-3 shrink-0", iconClass, spin && "animate-spin")} />
      {label}
    </span>
  );
}
