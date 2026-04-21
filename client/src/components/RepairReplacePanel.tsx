/**
 * RepairReplacePanel
 *
 * Displays per-component repair-vs-replace probability scores for a claim.
 * Each row shows the component, severity, a probability bar, and a suggestion badge.
 * Adjusters can confirm or override the suggestion — this feeds the learning DB silently.
 *
 * Design principle: this looks and feels like a standard adjuster annotation tool.
 * The learning feedback is not surfaced to the user.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp } from "lucide-react";

interface RepairReplacePanelProps {
  claimId: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
}

type Suggestion = "repair" | "replace" | "uncertain";
type Outcome = "repair" | "replace" | "write_off";

interface ComponentRow {
  componentName: string;
  componentCategory: string;
  severity: string;
  repairProbability: number;
  suggestion: Suggestion;
  confidenceLevel: "high" | "medium" | "low";
  signalBreakdown: {
    severityScore: number;
    categoryScore: number;
    vehicleScore: number;
    learningScore: number | null;
    learningRecordCount: number;
  };
  rationale: string;
}

const SUGGESTION_CONFIG: Record<Suggestion, { label: string; color: string; icon: React.ReactNode }> = {
  repair:    { label: "Repair",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle className="w-3 h-3" /> },
  replace:   { label: "Replace",  color: "bg-red-500/15 text-red-400 border-red-500/30",             icon: <XCircle className="w-3 h-3" /> },
  uncertain: { label: "Inspect",  color: "bg-amber-500/15 text-amber-400 border-amber-500/30",       icon: <AlertTriangle className="w-3 h-3" /> },
};

const SEVERITY_COLOR: Record<string, string> = {
  minor:    "text-emerald-400",
  moderate: "text-amber-400",
  severe:   "text-orange-400",
  critical: "text-red-400",
};

function ProbabilityBar({ value, suggestion }: { value: number; suggestion: Suggestion }) {
  const barColor =
    suggestion === "repair"    ? "bg-emerald-500" :
    suggestion === "replace"   ? "bg-red-500" :
    "bg-amber-500";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-8 text-right shrink-0">{value}%</span>
    </div>
  );
}

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const color =
    level === "high"   ? "bg-emerald-400" :
    level === "medium" ? "bg-amber-400" :
    "bg-white/30";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-block w-2 h-2 rounded-full ${color} cursor-help`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {level === "high"   ? "High confidence — based on 10+ historical cases" :
           level === "medium" ? "Medium confidence — based on 3–9 historical cases" :
           "Low confidence — no historical data yet; based on damage signals only"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SignalBreakdown({ breakdown }: { breakdown: ComponentRow["signalBreakdown"] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/50">
      <div className="flex justify-between">
        <span>Severity signal</span>
        <span className="text-white/70">{breakdown.severityScore}</span>
      </div>
      <div className="flex justify-between">
        <span>Category signal</span>
        <span className="text-white/70">{breakdown.categoryScore}</span>
      </div>
      <div className="flex justify-between">
        <span>Vehicle signal</span>
        <span className="text-white/70">{breakdown.vehicleScore}</span>
      </div>
      <div className="flex justify-between">
        <span>Historical data</span>
        <span className="text-white/70">
          {breakdown.learningScore !== null
            ? `${breakdown.learningScore} (${breakdown.learningRecordCount} cases)`
            : "—"}
        </span>
      </div>
    </div>
  );
}

function ComponentRowItem({
  row,
  assessmentId,
  claimId,
  vehicleMake,
  vehicleModel,
  vehicleYear,
}: {
  row: ComponentRow;
  assessmentId: number;
  claimId: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmed, setConfirmed] = useState<Outcome | null>(null);

  const recordOutcome = trpc.repairReplace.recordOutcome.useMutation({
    onSuccess: () => {
      // Silent — no toast needed, this is a background annotation
    },
  });

  const config = SUGGESTION_CONFIG[row.suggestion];

  function handleAnnotate(outcome: Outcome) {
    if (confirmed) return; // Already annotated
    setConfirmed(outcome);
    recordOutcome.mutate({
      claimId,
      assessmentId,
      componentName: row.componentName,
      componentCategory: row.componentCategory,
      severityAtDecision: row.severity,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      outcome,
      aiSuggestion: row.suggestion === "uncertain" ? "uncertain" : row.suggestion,
    });
  }

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Component name + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{row.componentName}</span>
            <ConfidenceDot level={row.confidenceLevel} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-white/40 capitalize">{row.componentCategory}</span>
            <span className="text-white/20">·</span>
            <span className={`text-xs capitalize ${SEVERITY_COLOR[row.severity] ?? "text-white/40"}`}>
              {row.severity}
            </span>
          </div>
        </div>

        {/* Probability bar */}
        <div className="w-32 shrink-0">
          <ProbabilityBar value={row.repairProbability} suggestion={row.suggestion} />
        </div>

        {/* Suggestion badge */}
        <div className="shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
            {config.icon}
            {config.label}
          </span>
        </div>

        {/* Expand toggle */}
        <div className="text-white/30 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/10 bg-white/[0.02]">
          {/* Rationale */}
          <p className="text-xs text-white/50 mt-3 leading-relaxed">{row.rationale}</p>

          {/* Signal breakdown */}
          <SignalBreakdown breakdown={row.signalBreakdown} />

          {/* Adjuster annotation */}
          {!confirmed ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-white/30 mr-1">Annotate:</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => handleAnnotate("repair")}
              >
                Repair
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => handleAnnotate("replace")}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs border-white/20 text-white/40 hover:bg-white/5"
                onClick={() => handleAnnotate("write_off")}
              >
                Write-off
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400">
                Annotated as <strong className="capitalize">{confirmed}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RepairReplacePanel({ claimId, vehicleMake, vehicleModel, vehicleYear }: RepairReplacePanelProps) {
  const { data, isLoading, isError } = trpc.repairReplace.scoreComponents.useQuery(
    { claimId },
    { retry: 0 }
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-sm py-4">
        <Info className="w-4 h-4" />
        <span>Repair probability data unavailable</span>
      </div>
    );
  }

  if (data.message || data.components.length === 0) {
    return (
      <div className="flex items-center gap-2 text-white/30 text-sm py-4">
        <Info className="w-4 h-4" />
        <span>{data.message ?? "No components detected in this assessment"}</span>
      </div>
    );
  }

  const assessmentId = data.assessmentId ?? 0;

  // Sort: replace first, then uncertain, then repair
  const sorted = [...data.components].sort((a, b) => {
    const order = { replace: 0, uncertain: 1, repair: 2 };
    return (order[a.suggestion as Suggestion] ?? 1) - (order[b.suggestion as Suggestion] ?? 1);
  });

  const replaceCount  = sorted.filter(c => c.suggestion === "replace").length;
  const uncertainCount = sorted.filter(c => c.suggestion === "uncertain").length;
  const repairCount   = sorted.filter(c => c.suggestion === "repair").length;

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="flex items-center gap-4 text-xs text-white/50 pb-1">
        {replaceCount > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3 h-3" />
            {replaceCount} replace
          </span>
        )}
        {uncertainCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {uncertainCount} inspect
          </span>
        )}
        {repairCount > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            {repairCount} repair
          </span>
        )}
        <span className="ml-auto text-white/20">
          Confidence dots: <span className="text-emerald-400">●</span> high &nbsp;
          <span className="text-amber-400">●</span> medium &nbsp;
          <span className="text-white/30">●</span> low
        </span>
      </div>

      {/* Component rows */}
      {sorted.map(row => (
        <ComponentRowItem
          key={row.componentName}
          row={row as ComponentRow}
          assessmentId={assessmentId}
          claimId={claimId}
          vehicleMake={vehicleMake}
          vehicleModel={vehicleModel}
          vehicleYear={vehicleYear}
        />
      ))}
    </div>
  );
}
