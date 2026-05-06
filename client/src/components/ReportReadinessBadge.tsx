/**
 * ReportReadinessBadge
 *
 * Reusable badge that shows the AI report readiness state for a given claim.
 * Queries trpc.reporting.getReportReadiness and renders a colour-coded pill.
 *
 * Variants:
 *   "inline"  — compact pill for claim list rows (default)
 *   "banner"  — prominent banner for claim detail view
 *   "compact" — icon-only with tooltip for very tight spaces
 */

import React, { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, AlertTriangle, FileX, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type ReadinessState = "not_submitted" | "ai_processing" | "ai_failed" | "partial" | "ready";
type Colour = "green" | "amber" | "red" | "grey" | "blue";

interface ReadinessData {
  claimId: number;
  claimReference: string;
  claimStatus: string;
  state: ReadinessState;
  label: string;
  colour: Colour;
  missingFields: string[];
  availableReports: string[];
  hasAssessment: boolean;
  recommendation: string | null;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────
const COLOUR_CLASS: Record<Colour, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red:   "bg-red-500/15 text-red-400 border-red-500/30",
  grey:  "bg-slate-500/15 text-slate-400 border-slate-500/30",
  blue:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const BANNER_COLOUR_CLASS: Record<Colour, string> = {
  green: "bg-emerald-950/60 border-emerald-500/40 text-emerald-300",
  amber: "bg-amber-950/60 border-amber-500/40 text-amber-300",
  red:   "bg-red-950/60 border-red-500/40 text-red-300",
  grey:  "bg-slate-800/60 border-slate-600/40 text-slate-400",
  blue:  "bg-blue-950/60 border-blue-500/40 text-blue-300",
};

const STATE_ICON: Record<ReadinessState, React.ReactNode> = {
  ready:         <CheckCircle2 className="w-3.5 h-3.5" />,
  partial:       <AlertTriangle className="w-3.5 h-3.5" />,
  ai_processing: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
  ai_failed:     <FileX className="w-3.5 h-3.5" />,
  not_submitted: <Clock className="w-3.5 h-3.5" />,
};

const BANNER_ICON: Record<ReadinessState, React.ReactNode> = {
  ready:         <CheckCircle2 className="w-5 h-5" />,
  partial:       <AlertTriangle className="w-5 h-5" />,
  ai_processing: <RefreshCw className="w-5 h-5 animate-spin" />,
  ai_failed:     <FileX className="w-5 h-5" />,
  not_submitted: <Clock className="w-5 h-5" />,
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  claimId: number;
  variant?: "inline" | "banner" | "compact";
  /** Called when the readiness data loads — useful for parent to know available reports */
  onLoad?: (data: ReadinessData) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ReportReadinessBadge({ claimId, variant = "inline", onLoad }: Props) {
  const { data, isLoading, isError } = trpc.reportingEngine.getReportReadiness.useQuery(
    { claimId },
    { staleTime: 30_000, retry: 1 }
  );
  // tRPC v11 removed onSuccess from useQuery options — use useEffect instead
  useEffect(() => {
    if (data) onLoad?.(data as ReadinessData);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    if (variant === "compact") return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />;
    if (variant === "banner") {
      return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border bg-slate-800/40 border-slate-700/40 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Checking report readiness…</span>
        </div>
      );
    }
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />;
  }

  // ── Error / not found ──────────────────────────────────────────────────────
  if (isError || !data) {
    if (variant === "compact") return null;
    return null;
  }

  const { state, label, colour, missingFields, availableReports, recommendation } = data as ReadinessData;

  // ── Compact variant (icon only) ────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border ${COLOUR_CLASS[colour]}`}>
              {STATE_ICON[state]}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium">{label}</p>
            {missingFields.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Missing: {missingFields.join(", ")}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ── Inline variant (pill badge) ────────────────────────────────────────────
  if (variant === "inline") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium cursor-default select-none ${COLOUR_CLASS[colour]}`}
            >
              {STATE_ICON[state]}
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs bg-slate-900 border-slate-700">
            <p className="font-medium text-white">{label}</p>
            {missingFields.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                Missing: {missingFields.join(", ")}
              </p>
            )}
            {recommendation && (
              <p className="text-xs text-slate-300 mt-1">
                AI Recommendation: <span className="font-semibold">{recommendation}</span>
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {availableReports.filter(r => r.startsWith("claim.")).length} claim report(s) available
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ── Banner variant (prominent block for claim detail) ─────────────────────
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${BANNER_COLOUR_CLASS[colour]}`}>
      <span className="mt-0.5 shrink-0">{BANNER_ICON[state]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{label}</span>
          {recommendation && (
            <Badge variant="outline" className="text-xs border-current opacity-80">
              AI: {recommendation}
            </Badge>
          )}
        </div>

        {state === "ready" && (
          <p className="text-xs mt-0.5 opacity-80">
            All AI assessment fields are complete. Full report suite available.
          </p>
        )}

        {state === "partial" && missingFields.length > 0 && (
          <p className="text-xs mt-0.5 opacity-80">
            Missing fields: {missingFields.join(" · ")}
          </p>
        )}

        {state === "ai_processing" && (
          <p className="text-xs mt-0.5 opacity-80">
            AI pipeline is processing this claim. Reports will be available once complete.
          </p>
        )}

        {state === "not_submitted" && (
          <p className="text-xs mt-0.5 opacity-80">
            No AI assessment has been submitted for this claim yet.
          </p>
        )}

        {availableReports.filter(r => r.startsWith("claim.")).length > 0 && (
          <p className="text-xs mt-1 opacity-60">
            {availableReports.filter(r => r.startsWith("claim.")).length} claim-level report(s) available
          </p>
        )}
      </div>
    </div>
  );
}

export default ReportReadinessBadge;
