/**
 * AiStatusBadge
 *
 * A small, read-only badge that displays the current AI assessment processing
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
 *   No aiAssessment + none of the above               →  "Waiting for AI" (grey)
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

  // Explicit failure states (extend as the workflow evolves)
  if (status === "ai_failed" || workflowState === "ai_failed") return "failed";

  // Complete: either the flag is set, the status is assessment_complete, or a
  // record already exists.
  if (
    claim.aiAssessmentCompleted === 1 ||
    status === "assessment_complete" ||
    workflowState === "ai_assessment_completed" ||
    (aiAssessment != null)
  ) {
    return "complete";
  }

  // In-progress: status or workflowState signals the job is running
  if (
    status === "assessment_in_progress" ||
    status === "assessment_pending" ||
    workflowState === "ai_assessment_pending" ||
    claim.aiAssessmentTriggered === 1
  ) {
    return "analysing";
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
    label: "Waiting for AI",
    containerClass: "bg-gray-100 text-gray-600 border-gray-200",
    Icon: Clock,
    iconClass: "text-gray-400",
  },
  analysing: {
    label: "Analysing…",
    containerClass: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: Loader2,
    iconClass: "text-amber-500",
    spin: true,
  },
  complete: {
    label: "AI Complete",
    containerClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  failed: {
    label: "AI Failed",
    containerClass: "bg-red-50 text-red-700 border-red-200",
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
      title={`AI Assessment Status: ${label}`}
    >
      <Brain className="h-3 w-3 shrink-0 opacity-70" />
      <Icon className={cn("h-3 w-3 shrink-0", iconClass, spin && "animate-spin")} />
      {label}
    </span>
  );
}
