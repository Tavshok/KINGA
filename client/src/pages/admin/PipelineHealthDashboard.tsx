/**
 * Pipeline Health Dashboard — Phase 2A Edition
 *
 * Now shows all 13 pipeline stages plus:
 *  - FCDI (Forensic Confidence Degradation Index)
 *  - FEL summary (fallback stages, timed-out stages)
 *  - Assumption Registry counts (total + high-impact)
 *  - Pipeline State Machine current state + FLAGGED_EXCEPTION count
 *  - Anomaly sentinel violation count
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import KingaLogo from "@/components/KingaLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  HelpCircle,
  RefreshCw,
  Search,
  Activity,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  BookOpen,
  Zap,
  Timer,
} from "lucide-react";

// ─── Stage display config — all 13 pipeline stages ────────────────────────────

const STAGE_ORDER = [
  { key: "1_ingestion",             label: "Ingestion",         short: "1:Ing" },
  { key: "2_extraction",            label: "OCR Extraction",    short: "2:OCR" },
  { key: "3_structured_extraction", label: "Structured Ext.",   short: "3:Str" },
  { key: "4_validation",            label: "Validation",        short: "4:Val" },
  { key: "5_assembly",              label: "Assembly",          short: "5:Asm" },
  { key: "6_damage",                label: "Damage Analysis",   short: "6:Dmg" },
  { key: "7_physics",               label: "Physics",           short: "7:Phy" },
  { key: "8_fraud",                 label: "Fraud Scoring",     short: "8:Frd" },
  { key: "9_cost",                  label: "Cost Engine",       short: "9:Cst" },
  { key: "9b_turnaround",           label: "Turnaround",        short: "9b:TA" },
  { key: "10_report",               label: "Report Gen.",       short: "10:Rpt" },
  // Legacy keys (pre-v2 refactor) kept for backward compatibility
  { key: "classification",          label: "Classification",    short: "Cls" },
  { key: "physics",                 label: "Physics (legacy)",  short: "Phy" },
  { key: "hiddenDamage",            label: "Hidden Damage",     short: "H.D" },
];

// Only show stages that have data in the row
function getActiveStages(stages: Record<string, StageSummary> | null) {
  if (!stages) return [];
  return STAGE_ORDER.filter(s => stages[s.key] !== undefined);
}

// ─── Types ─────────────────────────────────────────────────────────────────

type StageStatus = "success" | "failed" | "skipped" | "degraded" | "missing";

interface StageSummary {
  status: StageStatus;
  durationMs?: number;
  savedToDb?: boolean;
  error?: string;
  _timedOut?: boolean;
}

interface FelSummary {
  replayable: boolean;
  stageCount: number;
  timedOutStages: string[];
  fallbackStages: string[];
}

interface AssessmentRow {
  assessmentId: number;
  claimId: number;
  createdAt: Date | string | null;
  versionNumber: number | null;
  isReanalysis: boolean;
  fraudRiskLevel: string | null;
  confidenceScore: number | null;
  hasPipelineRunSummary: boolean;
  stages: Record<string, StageSummary> | null;
  totalDurationMs: number | null;
  completedAt: string | null;
  allSavedToDb: boolean | null;
  // Phase 2A
  fcdiScore: number | null;
  felSummary: FelSummary | null;
  assumptionCount: number;
  highImpactAssumptions: number;
  psmCurrentState: string | null;
  psmFlaggedExceptionCount: number;
  anomalyViolationCount: number;
}

// ─── Helper components ──────────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "success":  return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":   return <XCircle className="h-4 w-4 text-red-500" />;
    case "skipped":  return <MinusCircle className="h-4 w-4 text-yellow-500" />;
    case "degraded": return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    default:         return <HelpCircle className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function StageBadge({ status, durationMs, error, timedOut }: {
  status: StageStatus; durationMs?: number; error?: string; timedOut?: boolean;
}) {
  const variants: Record<StageStatus, string> = {
    success:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    failed:   "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
    skipped:  "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400",
    degraded: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
    missing:  "bg-muted/40 text-muted-foreground border-border",
  };
  const label = status === "missing" ? "—" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${variants[status]}`}>
            <StageIcon status={status} />
            {label}
            {timedOut && <Timer className="h-3 w-3 text-orange-400 ml-0.5" />}
            {durationMs != null && status !== "missing" && (
              <span className="opacity-60 ml-0.5">{durationMs}ms</span>
            )}
          </span>
        </TooltipTrigger>
        {(error || durationMs != null || timedOut) && (
          <TooltipContent side="top" className="max-w-xs text-xs">
            {timedOut && <p className="text-orange-400 mb-1">⏱ Stage timed out — fallback used</p>}
            {error ? (
              <p className="text-red-400">{error}</p>
            ) : durationMs != null ? (
              <p>Duration: {durationMs}ms{durationMs > 5000 ? " ⚠ slow" : ""}</p>
            ) : null}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function FraudBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-muted-foreground text-xs">—</span>;
  const map: Record<string, string> = {
    low:      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    medium:   "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    high:     "bg-orange-500/10 text-orange-600 border-orange-500/20",
    critical: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${map[level] ?? "bg-muted text-muted-foreground"}`}>
      {level}
    </span>
  );
}

function FCDIBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-yellow-500" : score >= 40 ? "text-orange-500" : "text-red-500";
  const label = score >= 80 ? "RELIABLE" : score >= 60 ? "DEGRADED" : score >= 40 ? "IMPAIRED" : "UNRELIABLE";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-xs font-mono font-bold ${color}`}>{score}%</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          FCDI: {label} — Forensic Confidence Degradation Index
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PSMBadge({ state, flaggedCount }: { state: string | null; flaggedCount: number }) {
  if (!state) return <span className="text-muted-foreground text-xs">—</span>;
  const isException = state === "FLAGGED_EXCEPTION";
  const isComplete = state === "REPORTED";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${
            isException ? "bg-red-500/10 text-red-500 border-red-500/20" :
            isComplete  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
            "bg-muted/40 text-muted-foreground border-border"
          }`}>
            {isException && <ShieldAlert className="h-3 w-3" />}
            {state.replace(/_/g, " ")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Pipeline state machine final state{flaggedCount > 0 ? ` · ${flaggedCount} FLAGGED_EXCEPTION transition(s)` : ""}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Summary stats bar ──────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: AssessmentRow[] }) {
  const total = rows.length;
  const withSummary = rows.filter(r => r.hasPipelineRunSummary).length;
  const anyFailed = rows.filter(r =>
    r.stages && Object.values(r.stages).some(s => s.status === "failed")
  ).length;
  const avgFcdi = (() => {
    const scored = rows.filter(r => r.fcdiScore != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, r) => s + (r.fcdiScore ?? 0), 0) / scored.length);
  })();
  const totalHighImpact = rows.reduce((s, r) => s + (r.highImpactAssumptions ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {[
        { label: "Total Assessments", value: total, icon: <Activity className="h-4 w-4" />, color: "text-foreground" },
        { label: "Pipeline Tracked", value: `${withSummary}/${total}`, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-500" },
        { label: "Has Failures", value: anyFailed, icon: <XCircle className="h-4 w-4" />, color: anyFailed > 0 ? "text-red-500" : "text-muted-foreground" },
        { label: "Avg FCDI Score", value: avgFcdi != null ? `${avgFcdi}%` : "—", icon: <Zap className="h-4 w-4" />, color: avgFcdi == null ? "text-muted-foreground" : avgFcdi >= 80 ? "text-emerald-500" : avgFcdi >= 60 ? "text-yellow-500" : "text-red-500" },
        { label: "High-Impact Assumptions", value: totalHighImpact, icon: <BookOpen className="h-4 w-4" />, color: totalHighImpact > 0 ? "text-orange-500" : "text-muted-foreground" },
      ].map(stat => (
        <Card key={stat.label} className="border-border bg-card">
          <CardContent className="pt-4 pb-3">
            <div className={`flex items-center gap-2 ${stat.color} mb-1`}>
              {stat.icon}
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Expandable detail row ──────────────────────────────────────────────────

function DetailPanel({ row }: { row: AssessmentRow }) {
  const activeStages = getActiveStages(row.stages);

  return (
    <div className="px-4 py-4 bg-muted/20 border-t border-border rounded-b space-y-4">
      {/* Stage grid */}
      {activeStages.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Stage Execution</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {activeStages.map(({ key, label }) => {
              const stage = row.stages![key];
              const status: StageStatus = stage?.status ?? "missing";
              return (
                <div key={key} className="bg-card border border-border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-foreground truncate">{label}</span>
                  </div>
                  <StageBadge status={status} durationMs={stage?.durationMs} error={stage?.error} timedOut={stage?._timedOut} />
                  {stage?.durationMs != null && stage.durationMs > 10000 && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-yellow-500">
                      <Clock className="h-3 w-3" /> Slow
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No pipeline stage data recorded. This assessment pre-dates the modular pipeline (v2).</p>
      )}

      {/* Phase 2A intelligence panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* FEL summary */}
        {row.felSummary && (
          <div className="bg-card border border-border rounded p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-blue-500" /> Forensic Execution Ledger
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Stages recorded</span>
                <span className="font-mono text-foreground">{row.felSummary.stageCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Replayable</span>
                <span className={row.felSummary.replayable ? "text-emerald-500" : "text-yellow-500"}>
                  {row.felSummary.replayable ? "Yes" : "Partial"}
                </span>
              </div>
              {row.felSummary.timedOutStages.length > 0 && (
                <div>
                  <span className="text-orange-500">Timed out: </span>
                  <span className="font-mono">{row.felSummary.timedOutStages.join(", ")}</span>
                </div>
              )}
              {row.felSummary.fallbackStages.length > 0 && (
                <div>
                  <span className="text-yellow-500">Fallback used: </span>
                  <span className="font-mono">{row.felSummary.fallbackStages.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assumption registry */}
        {row.assumptionCount > 0 && (
          <div className="bg-card border border-border rounded p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" /> Assumption Registry
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Total assumptions</span>
                <span className="font-mono text-foreground">{row.assumptionCount}</span>
              </div>
              <div className="flex justify-between">
                <span>High-impact</span>
                <span className={`font-mono ${row.highImpactAssumptions > 0 ? "text-orange-500" : "text-emerald-500"}`}>
                  {row.highImpactAssumptions}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* State machine + anomaly sentinels */}
        {(row.psmCurrentState || row.anomalyViolationCount > 0) && (
          <div className="bg-card border border-border rounded p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-purple-500" /> Pipeline State Machine
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              {row.psmCurrentState && (
                <div className="flex justify-between">
                  <span>Final state</span>
                  <PSMBadge state={row.psmCurrentState} flaggedCount={row.psmFlaggedExceptionCount} />
                </div>
              )}
              {row.psmFlaggedExceptionCount > 0 && (
                <div className="flex justify-between">
                  <span>FLAGGED_EXCEPTION</span>
                  <span className="font-mono text-red-500">{row.psmFlaggedExceptionCount}×</span>
                </div>
              )}
              {row.anomalyViolationCount > 0 && (
                <div className="flex justify-between">
                  <span>Anomaly violations</span>
                  <span className="font-mono text-orange-500">{row.anomalyViolationCount}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {row.totalDurationMs != null && (
        <p className="text-xs text-muted-foreground">
          Total pipeline duration: <strong className="text-foreground">{row.totalDurationMs}ms</strong>
          {row.completedAt && <> · Completed: {new Date(row.completedAt).toLocaleString()}</>}
          {row.allSavedToDb === false && <span className="ml-2 text-yellow-500">⚠ Some stages failed to save to DB</span>}
        </p>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function PipelineHealthDashboard() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [limit, setLimit] = useState(50);
  const [filterStatus, setFilterStatus] = useState<"all" | "failed" | "ok" | "legacy" | "flagged">("all");

  const { data: rows = [], isLoading, error, refetch, isFetching } = trpc.admin.getPipelineHealth.useQuery(
    { limit },
    { refetchInterval: false }
  );

  const filtered = useMemo(() => {
    let result = rows as AssessmentRow[];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        String(r.assessmentId).includes(q) || String(r.claimId).includes(q)
      );
    }
    if (filterStatus === "failed") {
      result = result.filter(r =>
        r.stages && Object.values(r.stages).some(s => s.status === "failed")
      );
    } else if (filterStatus === "ok") {
      result = result.filter(r => r.hasPipelineRunSummary && r.psmCurrentState === "REPORTED");
    } else if (filterStatus === "legacy") {
      result = result.filter(r => !r.hasPipelineRunSummary);
    } else if (filterStatus === "flagged") {
      result = result.filter(r => r.psmCurrentState === "FLAGGED_EXCEPTION" || r.psmFlaggedExceptionCount > 0);
    }
    return result;
  }, [rows, search, filterStatus]);

  const overallHealth = useMemo(() => {
    const tracked = (rows as AssessmentRow[]).filter(r => r.hasPipelineRunSummary);
    if (!tracked.length) return null;
    const failed = tracked.filter(r => r.stages && Object.values(r.stages).some(s => s.status === "failed")).length;
    const pct = Math.round(((tracked.length - failed) / tracked.length) * 100);
    return { pct, failed, tracked: tracked.length };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <KingaLogo size="sm" />
            <div>
              <h1 className="text-base font-semibold text-foreground leading-tight">Pipeline Intelligence</h1>
              <p className="text-xs text-muted-foreground">FCDI · FEL · State Machine · All 13 Stages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overallHealth && (
              <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                overallHealth.pct >= 90 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : overallHealth.pct >= 70 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
              }`}>
                <Activity className="h-3 w-3" />
                {overallHealth.pct}% healthy ({overallHealth.tracked} tracked)
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <SummaryBar rows={rows as AssessmentRow[]} />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by assessment ID or claim ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1.5">
            {(["all", "ok", "failed", "flagged", "legacy"] as const).map(f => (
              <Button key={f} variant={filterStatus === f ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setFilterStatus(f)}>
                {f === "all" ? "All" : f === "ok" ? "✓ Complete" : f === "failed" ? "✗ Failed" : f === "flagged" ? "⚑ Flagged" : "Legacy"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Show:
            {[25, 50, 100, 200].map(n => (
              <button key={n} onClick={() => setLimit(n)} className={`px-2 py-0.5 rounded border text-xs ${limit === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded border border-red-500/20 bg-red-500/10 text-red-500 text-sm mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load pipeline health data: {error.message}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading pipeline intelligence data…
          </div>
        )}

        {!isLoading && (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-semibold">Assessment</TableHead>
                  <TableHead className="text-xs font-semibold">Claim</TableHead>
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">FCDI</TableHead>
                  <TableHead className="text-xs font-semibold">PSM State</TableHead>
                  <TableHead className="text-xs font-semibold">Assumptions</TableHead>
                  <TableHead className="text-xs font-semibold">Anomalies</TableHead>
                  <TableHead className="text-xs font-semibold">Duration</TableHead>
                  <TableHead className="text-xs font-semibold">Fraud</TableHead>
                  <TableHead className="text-xs font-semibold">Conf.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-muted-foreground text-sm">
                      No assessments match the current filter.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(row => {
                  const isExpanded = expandedId === row.assessmentId;
                  const hasFailed = row.stages && Object.values(row.stages).some(s => s.status === "failed");
                  const isFlagged = row.psmCurrentState === "FLAGGED_EXCEPTION" || row.psmFlaggedExceptionCount > 0;

                  return (
                    <>
                      <TableRow
                        key={`row-${row.assessmentId}`}
                        className={`cursor-pointer hover:bg-muted/30 transition-colors ${hasFailed ? "bg-red-500/5" : ""} ${isFlagged ? "bg-orange-500/5" : ""} ${isExpanded ? "bg-muted/20" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : row.assessmentId)}
                      >
                        <TableCell className="py-2 pl-3 pr-0">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs text-foreground">
                          #{row.assessmentId}
                          {row.isReanalysis && <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">re-run</Badge>}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs text-muted-foreground">#{row.claimId}</TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="py-2">
                          <FCDIBadge score={row.fcdiScore} />
                        </TableCell>
                        <TableCell className="py-2">
                          <PSMBadge state={row.psmCurrentState} flaggedCount={row.psmFlaggedExceptionCount} />
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {row.assumptionCount > 0 ? (
                            <span className={row.highImpactAssumptions > 0 ? "text-orange-500" : "text-muted-foreground"}>
                              {row.assumptionCount}
                              {row.highImpactAssumptions > 0 && <span className="ml-1 text-[10px]">({row.highImpactAssumptions} high)</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                          {row.anomalyViolationCount > 0
                            ? <span className="text-orange-500 font-mono">{row.anomalyViolationCount}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.totalDurationMs != null ? `${(row.totalDurationMs / 1000).toFixed(1)}s` : "—"}
                        </TableCell>
                        <TableCell className="py-2"><FraudBadge level={row.fraudRiskLevel} /></TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {row.confidenceScore != null ? `${Math.round(row.confidenceScore * 100)}%` : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`detail-${row.assessmentId}`} className="hover:bg-transparent">
                          <TableCell colSpan={11} className="p-0">
                            <DetailPanel row={row} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            Showing {filtered.length} of {(rows as AssessmentRow[]).length} assessments
          </p>
        )}
      </main>
    </div>
  );
}
