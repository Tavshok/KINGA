/**
 * Pipeline Health Dashboard
 *
 * Shows per-stage completion status for every AI assessment pipeline run.
 * Stages: classification → physics → hiddenDamage (+ future stages)
 *
 * Status colours:
 *   success  → green
 *   failed   → red
 *   skipped  → yellow
 *   missing  → grey (assessment pre-dates pipeline refactor)
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import KingaLogo from "@/components/KingaLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

// ─── Stage display config ──────────────────────────────────────────────────

const STAGE_ORDER = [
  { key: "classification", label: "Classification", short: "Class." },
  { key: "physics",        label: "Physics",        short: "Physics" },
  { key: "hiddenDamage",   label: "Hidden Damage",  short: "H.Dmg" },
];

// ─── Types ─────────────────────────────────────────────────────────────────

type StageStatus = "success" | "failed" | "skipped" | "missing";

interface StageSummary {
  status: StageStatus;
  durationMs?: number;
  savedToDb?: boolean;
  error?: string;
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
}

// ─── Helper components ──────────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "skipped":
      return <MinusCircle className="h-4 w-4 text-yellow-500" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function StageBadge({ status, durationMs, error }: { status: StageStatus; durationMs?: number; error?: string }) {
  const variants: Record<StageStatus, string> = {
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    failed:  "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
    skipped: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400",
    missing: "bg-muted/40 text-muted-foreground border-border",
  };

  const label = status === "missing" ? "—" : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${variants[status]}`}
          >
            <StageIcon status={status} />
            {label}
            {durationMs != null && status !== "missing" && (
              <span className="opacity-60 ml-0.5">{durationMs}ms</span>
            )}
          </span>
        </TooltipTrigger>
        {(error || durationMs != null) && (
          <TooltipContent side="top" className="max-w-xs text-xs">
            {error ? (
              <p className="text-red-400">{error}</p>
            ) : (
              <p>Duration: {durationMs}ms{durationMs != null && durationMs > 5000 ? " ⚠ slow" : ""}</p>
            )}
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

// ─── Summary stats bar ──────────────────────────────────────────────────────

function SummaryBar({ rows }: { rows: AssessmentRow[] }) {
  const total = rows.length;
  const withSummary = rows.filter(r => r.hasPipelineRunSummary).length;
  const allSuccess = rows.filter(r =>
    r.stages && STAGE_ORDER.every(s => (r.stages![s.key]?.status ?? "missing") === "success")
  ).length;
  const anyFailed = rows.filter(r =>
    r.stages && STAGE_ORDER.some(s => r.stages![s.key]?.status === "failed")
  ).length;
  const avgDuration = rows
    .filter(r => r.totalDurationMs != null)
    .reduce((sum, r, _, arr) => sum + (r.totalDurationMs ?? 0) / arr.length, 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {[
        { label: "Total Assessments", value: total, icon: <Activity className="h-4 w-4" />, color: "text-foreground" },
        { label: "Pipeline Tracked", value: `${withSummary} / ${total}`, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-500" },
        { label: "All Stages OK", value: allSuccess, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-500" },
        { label: "Has Failures", value: anyFailed, icon: <XCircle className="h-4 w-4" />, color: anyFailed > 0 ? "text-red-500" : "text-muted-foreground" },
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
  if (!row.stages) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/30 rounded-b border-t border-border">
        No pipeline run summary recorded. This assessment was processed before the modular pipeline refactor (v2).
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-muted/20 border-t border-border rounded-b">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STAGE_ORDER.map(({ key, label }) => {
          const stage = row.stages![key];
          const status: StageStatus = stage?.status ?? "missing";
          return (
            <div key={key} className="bg-card border border-border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <StageBadge status={status} durationMs={stage?.durationMs} error={stage?.error} />
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {stage?.durationMs != null && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{stage.durationMs}ms</span>
                    {stage.durationMs > 10000 && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                  </div>
                )}
                {stage?.savedToDb != null && (
                  <div className="flex items-center gap-1">
                    {stage.savedToDb
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      : <XCircle className="h-3 w-3 text-red-500" />}
                    <span>{stage.savedToDb ? "Saved to DB" : "DB save failed"}</span>
                  </div>
                )}
                {stage?.error && (
                  <p className="text-red-400 break-words mt-1">{stage.error}</p>
                )}
                {!stage && (
                  <span className="italic">Stage not recorded</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {row.totalDurationMs != null && (
        <p className="text-xs text-muted-foreground mt-3">
          Total pipeline duration: <strong className="text-foreground">{row.totalDurationMs}ms</strong>
          {row.completedAt && (
            <> · Completed: {new Date(row.completedAt).toLocaleString()}</>
          )}
          {row.allSavedToDb === false && (
            <span className="ml-2 text-yellow-500">⚠ Some stages failed to save to DB</span>
          )}
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
  const [filterStatus, setFilterStatus] = useState<"all" | "failed" | "ok" | "legacy">("all");

  const { data: rows = [], isLoading, error, refetch, isFetching } = trpc.admin.getPipelineHealth.useQuery(
    { limit },
    { refetchInterval: false }
  );

  const filtered = useMemo(() => {
    let result = rows as AssessmentRow[];

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        String(r.assessmentId).includes(q) ||
        String(r.claimId).includes(q)
      );
    }

    // Status filter
    if (filterStatus === "failed") {
      result = result.filter(r =>
        r.stages && STAGE_ORDER.some(s => r.stages![s.key]?.status === "failed")
      );
    } else if (filterStatus === "ok") {
      result = result.filter(r =>
        r.hasPipelineRunSummary &&
        r.stages &&
        STAGE_ORDER.every(s => (r.stages![s.key]?.status ?? "missing") === "success")
      );
    } else if (filterStatus === "legacy") {
      result = result.filter(r => !r.hasPipelineRunSummary);
    }

    return result;
  }, [rows, search, filterStatus]);

  const overallHealth = useMemo(() => {
    const tracked = (rows as AssessmentRow[]).filter(r => r.hasPipelineRunSummary);
    if (tracked.length === 0) return null;
    const failed = tracked.filter(r =>
      r.stages && STAGE_ORDER.some(s => r.stages![s.key]?.status === "failed")
    ).length;
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
              <h1 className="text-base font-semibold text-foreground leading-tight">Pipeline Health</h1>
              <p className="text-xs text-muted-foreground">AI assessment stage monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overallHealth && (
              <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                overallHealth.pct >= 90
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : overallHealth.pct >= 70
                  ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                  : "bg-red-500/10 text-red-600 border-red-500/20"
              }`}>
                <Activity className="h-3 w-3" />
                {overallHealth.pct}% healthy ({overallHealth.tracked} tracked)
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        {/* Summary cards */}
        <SummaryBar rows={filtered.length > 0 ? (rows as AssessmentRow[]) : []} />

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
            {(["all", "ok", "failed", "legacy"] as const).map(f => (
              <Button
                key={f}
                variant={filterStatus === f ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setFilterStatus(f)}
              >
                {f === "all" ? "All" : f === "ok" ? "✓ OK" : f === "failed" ? "✗ Failed" : "Legacy"}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Show:
            {[25, 50, 100, 200].map(n => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-2 py-0.5 rounded border text-xs ${limit === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded border border-red-500/20 bg-red-500/10 text-red-500 text-sm mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Failed to load pipeline health data: {error.message}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading pipeline data…
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs font-semibold">Assessment</TableHead>
                  <TableHead className="text-xs font-semibold">Claim</TableHead>
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Ver.</TableHead>
                  {STAGE_ORDER.map(s => (
                    <TableHead key={s.key} className="text-xs font-semibold">{s.short}</TableHead>
                  ))}
                  <TableHead className="text-xs font-semibold">Duration</TableHead>
                  <TableHead className="text-xs font-semibold">Fraud</TableHead>
                  <TableHead className="text-xs font-semibold">Conf.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                      No assessments match the current filter.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(row => {
                  const isExpanded = expandedId === row.assessmentId;
                  const rowHasFailed = row.stages && STAGE_ORDER.some(s => row.stages![s.key]?.status === "failed");

                  return (
                    <>
                      <TableRow
                        key={`row-${row.assessmentId}`}
                        className={`cursor-pointer hover:bg-muted/30 transition-colors ${rowHasFailed ? "bg-red-500/5" : ""} ${isExpanded ? "bg-muted/20" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : row.assessmentId)}
                      >
                        <TableCell className="py-2 pl-3 pr-0">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs text-foreground">
                          #{row.assessmentId}
                          {row.isReanalysis && (
                            <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">re-run</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                          #{row.claimId}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {row.versionNumber ?? "—"}
                        </TableCell>
                        {STAGE_ORDER.map(({ key }) => {
                          const stage = row.stages?.[key];
                          const status: StageStatus = stage?.status ?? "missing";
                          return (
                            <TableCell key={key} className="py-2">
                              <StageBadge
                                status={status}
                                durationMs={stage?.durationMs}
                                error={stage?.error}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.totalDurationMs != null ? `${row.totalDurationMs}ms` : "—"}
                        </TableCell>
                        <TableCell className="py-2">
                          <FraudBadge level={row.fraudRiskLevel} />
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">
                          {row.confidenceScore != null ? `${Math.round(row.confidenceScore * 100)}%` : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`detail-${row.assessmentId}`} className="hover:bg-transparent">
                          <TableCell colSpan={10} className="p-0">
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
