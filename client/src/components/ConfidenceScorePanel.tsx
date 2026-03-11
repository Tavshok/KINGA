import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, AlertTriangle, Info, CheckCircle, TrendingUp } from "lucide-react";

// ─── Types (mirrors confidence-scoring.ts) ────────────────────────────────────
interface InputBreakdown {
  name: string;
  key: string;
  rawScore: number;
  weightedScore: number;
  maxWeighted: number;
  weight: number;
  available: boolean;
  signals: Array<{ label: string; value: string | number; impact: "positive" | "negative" | "neutral" }>;
  improvements: Array<{ action: string; potentialGain: number; priority: "high" | "medium" | "low" }>;
}

interface PenaltyGate {
  condition: string;
  cap: number;
  active: boolean;
  reason: string;
}

interface ConfidenceBreakdown {
  finalScore: number;
  level: "Very High" | "High" | "Moderate" | "Low" | "Very Low";
  inputs: InputBreakdown[];
  activePenalties: PenaltyGate[];
  allImprovements: Array<{ action: string; potentialGain: number; priority: "high" | "medium" | "low"; inputKey: string }>;
  adaptiveWeightsApplied: boolean;
  unavailableInputs: string[];
}

interface ConfidenceScorePanelProps {
  confidenceScore: number;
  confidenceScoreBreakdownJson?: string | null;
  compact?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getLevelColour(level: string): string {
  switch (level) {
    case "Very High": return "text-emerald-600";
    case "High": return "text-teal-600";
    case "Moderate": return "text-amber-600";
    case "Low": return "text-orange-600";
    case "Very Low": return "text-red-600";
    default: return "text-gray-600 dark:text-muted-foreground";
  }
}

function getLevelBgColour(level: string): string {
  switch (level) {
    case "Very High": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800";
    case "High": return "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800";
    case "Moderate": return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800";
    case "Low": return "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800";
    case "Very Low": return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800";
    default: return "bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground border-gray-200 dark:border-border";
  }
}

function getBarColour(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-teal-500";
  if (pct >= 40) return "bg-amber-500";
  if (pct >= 20) return "bg-orange-500";
  return "bg-red-500";
}

function getPriorityColour(priority: string): string {
  switch (priority) {
    case "high": return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800";
    case "medium": return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";
    case "low": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    default: return "bg-gray-100 dark:bg-muted text-gray-700 dark:text-foreground/80 border-gray-200 dark:border-border";
  }
}

function getInputIcon(key: string): string {
  const icons: Record<string, string> = {
    imageQuality: "📷",
    damageDetection: "🔍",
    physicsConsistency: "⚡",
    quoteReconciliation: "📋",
    vehicleDataCompleteness: "🚗",
    documentCompleteness: "📄",
    dataConsistency: "🔗",
    fraudSignalClarity: "🛡️",
  };
  return icons[key] || "📊";
}

// ─── Semicircular Gauge ───────────────────────────────────────────────────────
function SemiGauge({ score, level }: { score: number; level: string }) {
  const r = 70;
  const cx = 90;
  const cy = 90;
  const circumference = Math.PI * r; // half circle
  const offset = circumference * (1 - score / 100);

  // Zone colours: 0-20 red, 21-40 orange, 41-60 amber, 61-80 teal, 81-100 emerald
  const trackColour =
    score >= 81 ? "#10b981" :
    score >= 61 ? "#14b8a6" :
    score >= 41 ? "#f59e0b" :
    score >= 21 ? "#f97316" :
    "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="100" viewBox="0 0 180 100">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={trackColour}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Zone markers */}
        {[20, 40, 60, 80].map((pct) => {
          const angle = Math.PI * (1 - pct / 100);
          const mx = cx + r * Math.cos(Math.PI - angle);
          const my = cy - r * Math.sin(Math.PI - angle);
          return (
            <circle key={pct} cx={mx} cy={my} r="3" fill="#9ca3af" />
          );
        })}
        {/* Score text */}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="28" fontWeight="700" fill={trackColour}>
          {score}%
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="#6b7280">
          AI Confidence
        </text>
      </svg>
      <span className={`text-sm font-semibold mt-1 ${getLevelColour(level)}`}>{level}</span>
    </div>
  );
}

// ─── Input Row ────────────────────────────────────────────────────────────────
function InputRow({ input }: { input: InputBreakdown }) {
  const [open, setOpen] = useState(false);
  const pct = input.maxWeighted > 0 ? Math.round((input.weightedScore / input.maxWeighted) * 100) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-2 py-2 px-1 hover:bg-gray-50 dark:bg-muted/50 rounded-lg transition-colors cursor-pointer">
          <span className="text-base w-6 flex-shrink-0">{getInputIcon(input.key)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700 dark:text-foreground/80 truncate">{input.name}</span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {!input.available && (
                  <Badge variant="outline" className="text-xs px-1 py-0 bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground border-gray-200 dark:border-border">
                    N/A
                  </Badge>
                )}
                <span className="text-xs font-semibold text-gray-600 dark:text-muted-foreground">
                  {input.weightedScore.toFixed(1)}/{input.maxWeighted.toFixed(1)}
                </span>
                {open ? <ChevronDown className="h-3 w-3 text-gray-400 dark:text-muted-foreground/70" /> : <ChevronRight className="h-3 w-3 text-gray-400 dark:text-muted-foreground/70" />}
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${getBarColour(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-8 mr-1 mb-2 space-y-2">
          {/* Signals */}
          {(input.signals ?? []).length > 0 && (
            <div className="space-y-1">
              {(input.signals ?? []).map((sig, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-muted-foreground">
                  <span className={`mt-0.5 flex-shrink-0 ${sig.impact === "positive" ? "text-emerald-500" : sig.impact === "negative" ? "text-red-500" : "text-gray-400 dark:text-muted-foreground/70"}`}>
                    {sig.impact === "positive" ? "+" : sig.impact === "negative" ? "−" : "·"}
                  </span>
                  <span className="font-medium">{sig.label}:</span>
                  <span className="text-gray-500 dark:text-muted-foreground">{sig.value}</span>
                </div>
              ))}
            </div>
          )}
          {/* Improvements for this input */}
          {input.improvements.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted-foreground uppercase tracking-wide">How to improve</p>
              {input.improvements.map((imp, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1 border ${getPriorityColour(imp.priority)}`}>
                  <TrendingUp className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{imp.action}</span>
                  <span className="font-semibold flex-shrink-0">+{imp.potentialGain}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ConfidenceScorePanel({
  confidenceScore,
  confidenceScoreBreakdownJson,
  compact = false,
}: ConfidenceScorePanelProps) {
  const breakdown = useMemo<ConfidenceBreakdown | null>(() => {
    if (!confidenceScoreBreakdownJson) return null;
    try {
      return JSON.parse(confidenceScoreBreakdownJson);
    } catch {
      return null;
    }
  }, [confidenceScoreBreakdownJson]);

  const level = breakdown?.level ?? (
    confidenceScore >= 85 ? "Very High" :
    confidenceScore >= 70 ? "High" :
    confidenceScore >= 55 ? "Moderate" :
    confidenceScore >= 40 ? "Low" : "Very Low"
  );

  // Compact mode: just the badge
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`cursor-help border ${getLevelBgColour(level)}`}>
              {confidenceScore}% — {level}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">AI confidence in this assessment. Click the confidence section in the report for a full breakdown.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full panel
  const highPriorityImprovements = breakdown?.allImprovements.filter(i => i.priority === "high") ?? [];
  const otherImprovements = breakdown?.allImprovements.filter(i => i.priority !== "high") ?? [];

  return (
    <div className="space-y-4">
      {/* Header row: gauge + summary */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <SemiGauge score={confidenceScore} level={level} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`border ${getLevelBgColour(level)} text-sm font-semibold px-3 py-1`}>
              {level} Confidence
            </Badge>
            {breakdown?.adaptiveWeightsApplied && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 cursor-help">
                      <Info className="h-3 w-3 mr-1" />
                      Adaptive weights
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Some inputs were unavailable ({breakdown.unavailableInputs.join(", ")}). Their weights were redistributed to available inputs to avoid penalising missing data.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Active penalty gates */}
          {breakdown?.activePenalties && breakdown.activePenalties.length > 0 && (
            <div className="space-y-1">
              {breakdown.activePenalties.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-2 py-1.5 text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span><span className="font-semibold">Score capped at {p.cap}%:</span> {p.reason}</span>
                </div>
              ))}
            </div>
          )}
          {/* Quick improvement count */}
          {breakdown && breakdown.allImprovements.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-muted-foreground">
              <span className="font-medium text-gray-700 dark:text-foreground/80">{breakdown.allImprovements.length} improvement{breakdown.allImprovements.length !== 1 ? "s" : ""}</span> available —
              potential gain up to <span className="font-medium text-teal-700 dark:text-teal-300">
                +{Math.min(100 - confidenceScore, breakdown.allImprovements.reduce((s, i) => s + i.potentialGain, 0))}%
              </span>
            </p>
          )}
        </div>
      </div>

      {/* 8-input breakdown */}
      {breakdown && (
        <div className="border border-gray-200 dark:border-border rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-muted/50 px-3 py-2 border-b border-gray-200 dark:border-border">
            <p className="text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase tracking-wide">Score Breakdown by Input</p>
          </div>
          <div className="px-3 py-1 divide-y divide-gray-100">
            {breakdown.inputs.map((input) => (
              <InputRow key={input.key} input={input} />
            ))}
          </div>
        </div>
      )}

      {/* What's missing — high priority first */}
      {breakdown && breakdown.allImprovements.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-950/30 px-3 py-2 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              How to Improve This Score
            </p>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {highPriorityImprovements.length > 0 && (
              <>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mt-1">Immediate actions</p>
                {highPriorityImprovements.map((imp, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${getPriorityColour(imp.priority)}`}>
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">{imp.action}</span>
                    <span className="font-semibold flex-shrink-0 whitespace-nowrap">+{imp.potentialGain}%</span>
                  </div>
                ))}
              </>
            )}
            {otherImprovements.length > 0 && (
              <>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mt-2">Additional improvements</p>
                {otherImprovements.map((imp, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 border ${getPriorityColour(imp.priority)}`}>
                    <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="flex-1">{imp.action}</span>
                    <span className="font-semibold flex-shrink-0 whitespace-nowrap">+{imp.potentialGain}%</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Fallback when no breakdown JSON */}
      {!breakdown && (
        <div className="text-xs text-gray-500 dark:text-muted-foreground bg-gray-50 dark:bg-muted/50 rounded-lg p-3 border border-gray-200 dark:border-border">
          <p className="font-medium text-gray-600 dark:text-muted-foreground mb-1">Detailed breakdown not available</p>
          <p>Re-run the AI assessment to generate a full 8-input confidence breakdown with improvement suggestions.</p>
        </div>
      )}
    </div>
  );
}
