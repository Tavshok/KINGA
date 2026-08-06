/**
 * Platform Operations Centre — Epic 5-C
 *
 * Operational intelligence dashboard for Platform Administrators.
 * Aggregates: background jobs, queue health, KINGA processing, report generation,
 * workflow execution, failed jobs, active users, governance violations, audit statistics, storage.
 *
 * Access: platform_super_admin only.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  HardDrive,
  RefreshCw,
  Server,
  Shield,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    generating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    skipped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// ─── KPI Strip ───────────────────────────────────────────────────────────────

function KpiStrip() {
  const { data, isLoading } = trpc.platformOperations.getOperationsSummary.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const kpis = [
    {
      label: "Jobs Running",
      value: isLoading ? "…" : fmt(data?.jobs.running),
      icon: <Zap className="w-4 h-4" />,
      accent: data?.jobs.running ? "text-blue-600" : "text-muted-foreground",
    },
    {
      label: "Failed (24 h)",
      value: isLoading ? "…" : fmt((data?.jobs.failed24h ?? 0) + (data?.reports.failed24h ?? 0)),
      icon: <XCircle className="w-4 h-4" />,
      accent: ((data?.jobs.failed24h ?? 0) + (data?.reports.failed24h ?? 0)) > 0 ? "text-red-600" : "text-muted-foreground",
    },
    {
      label: "Governance Violations (24 h)",
      value: isLoading ? "…" : fmt(data?.governance.violations24h),
      icon: <Shield className="w-4 h-4" />,
      accent: (data?.governance.violations24h ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground",
    },
    {
      label: "Audit Actions (24 h)",
      value: isLoading ? "…" : fmt(data?.audit.actions24h),
      icon: <Activity className="w-4 h-4" />,
      accent: "text-muted-foreground",
    },
    {
      label: "Active Users (24 h)",
      value: isLoading ? "…" : fmt(data?.audit.activeUsers),
      icon: <Users className="w-4 h-4" />,
      accent: "text-muted-foreground",
    },
    {
      label: "Claims In Progress",
      value: isLoading ? "…" : fmt(data?.claims.inProgress),
      icon: <FileText className="w-4 h-4" />,
      accent: "text-muted-foreground",
    },
    {
      label: "Reports Generating",
      value: isLoading ? "…" : fmt(data?.reports.generating),
      icon: <RefreshCw className="w-4 h-4" />,
      accent: (data?.reports.generating ?? 0) > 0 ? "text-blue-600" : "text-muted-foreground",
    },
    {
      label: "Total Users",
      value: isLoading ? "…" : fmt(data?.users.total),
      icon: <Users className="w-4 h-4" />,
      accent: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {kpis.map((k) => (
        <Card key={k.label} className="p-3">
          <div className={`flex items-center gap-1.5 text-xs text-muted-foreground mb-1 ${k.accent}`}>
            {k.icon}
            <span className="truncate">{k.label}</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${k.accent}`}>{k.value}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Jobs Panel ──────────────────────────────────────────────────────────────

function JobsPanel() {
  const { data, isLoading } = trpc.platformOperations.getJobsOverview.useQuery(undefined, {
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total", value: data?.jobStats?.total, color: "text-foreground" },
          { label: "Pending", value: data?.jobStats?.pending, color: "text-amber-600" },
          { label: "Running", value: data?.jobStats?.running, color: "text-blue-600" },
          { label: "Completed", value: data?.jobStats?.completed, color: "text-emerald-600" },
          { label: "Failed", value: data?.jobStats?.failed, color: "text-red-600" },
          { label: "Last 24 h", value: data?.jobStats?.last24h, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            Failed Jobs (last 48 h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !data?.recentFailed?.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              No failed jobs in the last 48 hours
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Job ID</th>
                    <th className="text-left py-1.5 pr-3">Claim ID</th>
                    <th className="text-left py-1.5 pr-3">Stage</th>
                    <th className="text-left py-1.5">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentFailed.map((j) => (
                    <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 font-mono">{j.id}</td>
                      <td className="py-1.5 pr-3 font-mono">{j.claimId ?? "—"}</td>
                      <td className="py-1.5 pr-3">{j.stageId}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {j.startedAt ? new Date(j.startedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" />
            Ingestion Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Pending Batches", value: data?.queueStats?.pending, color: "text-amber-600" },
              { label: "Processing", value: data?.queueStats?.processing, color: "text-blue-600" },
              { label: "Completed", value: data?.queueStats?.completed, color: "text-emerald-600" },
              { label: "Failed", value: data?.queueStats?.failed, color: "text-red-600" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-xs text-muted-foreground mb-0.5">{s.label}</div>
                <div className={`text-lg font-bold tabular-nums ${s.color}`}>
                  {isLoading ? "…" : fmt(Number(s.value ?? 0))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div>Total docs: <span className="font-medium text-foreground">{fmt(Number(data?.queueStats?.totalDocs ?? 0))}</span></div>
            <div>Processed: <span className="font-medium text-emerald-600">{fmt(Number(data?.queueStats?.processedDocs ?? 0))}</span></div>
            <div>Failed: <span className="font-medium text-red-600">{fmt(Number(data?.queueStats?.failedDocs ?? 0))}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── KINGA Processing Panel ─────────────────────────────────────────────────────

function AiProcessingPanel() {
  const { data, isLoading } = trpc.platformOperations.getAiProcessingStats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const cb = data?.circuitBreaker;
  const cbColor =
    cb?.state === "OPEN" ? "text-red-600" :
    cb?.state === "HALF_OPEN" ? "text-amber-500" :
    "text-emerald-600";

  return (
    <div className="space-y-4">
      {/* M-03: Circuit Breaker Status Card */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">LLM Circuit Breaker</div>
            <div className={`text-sm font-bold font-mono ${cbColor}`}>
              {isLoading ? "…" : (cb?.state ?? "CLOSED")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Consecutive Failures</div>
            <div className="text-sm font-bold tabular-nums">
              {isLoading ? "…" : (cb?.consecutiveFailures ?? 0)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-0.5">Total Trips</div>
            <div className="text-sm font-bold tabular-nums">
              {isLoading ? "…" : (cb?.totalTrips ?? 0)}
            </div>
          </div>
        </div>
        {cb?.state === "OPEN" && cb.openedAt && (
          <div className="mt-2 text-xs text-red-500">
            Opened {new Date(cb.openedAt).toLocaleTimeString()} — auto-probe in 60s
          </div>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-1">Processed (24 h)</div>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums">
            {isLoading ? "…" : fmt(Number(data?.last24h?.processed ?? 0))}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-1">Failed (24 h)</div>
          <div className="text-2xl font-bold text-red-600 tabular-nums">
            {isLoading ? "…" : fmt(Number(data?.last24h?.failed ?? 0))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Stage Throughput (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !data?.stageStats?.length ? (
            <div className="text-sm text-muted-foreground">No pipeline activity in the last 7 days</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Stage</th>
                    <th className="text-right py-1.5 pr-3">Total</th>
                    <th className="text-right py-1.5 pr-3">Completed</th>
                    <th className="text-right py-1.5 pr-3">Running</th>
                    <th className="text-right py-1.5">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stageStats.map((s) => (
                    <tr key={s.stageId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 font-mono text-xs">{s.stageId}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(Number(s.total))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">{fmt(Number(s.completed))}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-blue-600">{fmt(Number(s.running))}</td>
                      <td className="py-1.5 text-right tabular-nums text-red-600">{fmt(Number(s.failed))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Reports Panel ───────────────────────────────────────────────────────────

function ReportsPanel() {
  const { data, isLoading } = trpc.platformOperations.getReportStats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: data?.summary?.total, color: "text-foreground" },
          { label: "Ready", value: data?.summary?.ready, color: "text-emerald-600" },
          { label: "Generating", value: data?.summary?.generating, color: "text-blue-600" },
          { label: "Failed", value: data?.summary?.failed, color: "text-red-600" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-1">Generated (24 h)</div>
          <div className="text-xl font-bold tabular-nums">{isLoading ? "…" : fmt(Number(data?.summary?.last24h ?? 0))}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-1">Total Storage</div>
          <div className="text-xl font-bold tabular-nums">{isLoading ? "…" : fmtBytes(Number(data?.summary?.totalSizeBytes ?? 0))}</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By Report Type (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-1.5">
              {(data?.byType ?? []).map((r) => (
                <div key={r.reportType} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{r.reportType.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{fmt(Number(r.total))}</span>
                    {Number(r.failed) > 0 && (
                      <span className="text-red-600 tabular-nums">{fmt(Number(r.failed))} failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.recentFailed?.length ?? 0) > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Failed Reports (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data!.recentFailed.map((r) => (
                <div key={r.id} className="text-xs border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium capitalize">{r.reportType.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</span>
                  </div>
                  {r.errorMessage && (
                    <div className="text-red-600 dark:text-red-400 font-mono text-[10px] truncate">{r.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Workflow Panel ───────────────────────────────────────────────────────────

function WorkflowPanel() {
  const { data, isLoading } = trpc.platformOperations.getWorkflowStats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Claims", value: data?.totals?.total, color: "text-foreground" },
          { label: "New (24 h)", value: data?.totals?.last24h, color: "text-blue-600" },
          { label: "New (7 d)", value: data?.totals?.last7d, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Claims by Workflow State</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-1.5">
              {(data?.byState ?? []).map((s) => (
                <div key={s.workflowState ?? "unknown"} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{(s.workflowState ?? "unknown").replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium">{fmt(Number(s.total))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Users Panel ─────────────────────────────────────────────────────────────

function UsersPanel() {
  const { data, isLoading } = trpc.platformOperations.getActiveUsers.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Users", value: data?.totals?.total, color: "text-foreground" },
          { label: "Active (24 h)", value: data?.recentActivity?.activeUsers, color: "text-blue-600" },
          { label: "Audit Actions (24 h)", value: data?.recentActivity?.totalActions, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Users by Role</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-1.5">
              {(data?.byRole ?? []).map((r) => (
                <div key={r.role ?? "unknown"} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{(r.role ?? "unknown").replace(/_/g, " ")}</span>
                  <span className="tabular-nums font-medium">{fmt(Number(r.total))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Governance Panel ─────────────────────────────────────────────────────────

function GovernancePanel() {
  const { data, isLoading } = trpc.platformOperations.getGovernanceStats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Violations", value: data?.summary?.total, color: "text-foreground" },
          { label: "Last 24 h", value: data?.summary?.last24h, color: Number(data?.summary?.last24h ?? 0) > 0 ? "text-red-600" : "text-emerald-600" },
          { label: "Last 7 d", value: data?.summary?.last7d, color: Number(data?.summary?.last7d ?? 0) > 0 ? "text-amber-600" : "text-emerald-600" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Violations by Type (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !data?.byType?.length ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              No violations in the last 30 days
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.byType.map((v) => (
                <div key={v.violationType} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{v.violationType.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="tabular-nums font-medium text-amber-600">{fmt(Number(v.total))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Violations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !data?.recent?.length ? (
            <div className="text-sm text-muted-foreground">No recent violations</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-3">Tenant</th>
                    <th className="text-left py-1.5 pr-3">Role</th>
                    <th className="text-left py-1.5 pr-3">Type</th>
                    <th className="text-left py-1.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 font-mono text-[10px]">{v.tenantId}</td>
                      <td className="py-1.5 pr-3 capitalize">{v.userRole}</td>
                      <td className="py-1.5 pr-3">
                        <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded text-[10px]">
                          {v.violationType.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {v.violatedAt ? new Date(v.violatedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Audit Panel ─────────────────────────────────────────────────────────────

function AuditPanel() {
  const { data, isLoading } = trpc.platformOperations.getAuditStats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Entries", value: data?.summary?.total, color: "text-foreground" },
          { label: "Last 24 h", value: data?.summary?.last24h, color: "text-blue-600" },
          { label: "Last 7 d", value: data?.summary?.last7d, color: "text-muted-foreground" },
          { label: "Unique Users (all time)", value: data?.summary?.uniqueUsers, color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : fmt(Number(s.value ?? 0))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Actions (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-1.5">
                {(data?.byAction ?? []).map((a) => (
                  <div key={a.action} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{a.action}</span>
                    <span className="tabular-nums font-medium">{fmt(Number(a.total))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(data?.recent ?? []).map((a) => (
                  <div key={a.id} className="text-xs border-b last:border-0 pb-1.5 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">{a.action}</span>
                      <span className="text-muted-foreground text-[10px]">
                        {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "—"}
                      </span>
                    </div>
                    <div className="text-muted-foreground capitalize">
                      {a.userRole} · {a.entityType} #{a.entityId}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Storage Panel ────────────────────────────────────────────────────────────

function StoragePanel() {
  const { data, isLoading } = trpc.platformOperations.getStorageStats.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Reports", value: fmt(Number(data?.reportStorage?.totalReports ?? 0)), color: "text-foreground" },
          { label: "Total Storage", value: fmtBytes(Number(data?.reportStorage?.totalBytes ?? 0)), color: "text-blue-600" },
          { label: "Avg Report Size", value: fmtBytes(Number(data?.reportStorage?.avgBytes ?? 0)), color: "text-muted-foreground" },
          { label: "Largest Report", value: fmtBytes(Number(data?.reportStorage?.maxBytes ?? 0)), color: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>
              {isLoading ? "…" : s.value}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Storage by Report Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-2">
              {(data?.byReportType ?? []).map((r) => {
                const pct = data?.reportStorage?.totalBytes
                  ? Math.round((Number(r.totalBytes ?? 0) / Number(data.reportStorage!.totalBytes!)) * 100)
                  : 0;
                return (
                  <div key={r.reportType}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="capitalize">{r.reportType.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{fmtBytes(Number(r.totalBytes ?? 0))} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlatformOperationsCentre() {
  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            Platform Super Admin
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Clock className="w-3 h-3 mr-1" />
            Auto-refreshes every 15–60 s
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-purple-600" />
          Platform Operations Centre
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time operational intelligence across all platform modules
        </p>
      </div>

      {/* KPI Strip */}
      <KpiStrip />

      {/* Tabbed panels */}
      <Tabs defaultValue="jobs">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="jobs" className="flex items-center gap-1.5 text-xs">
            <Server className="w-3.5 h-3.5" /> Jobs &amp; Queue
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 text-xs">
            <Zap className="w-3.5 h-3.5" /> KINGA Processing
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex items-center gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" /> Report Generation
          </TabsTrigger>
          <TabsTrigger value="workflow" className="flex items-center gap-1.5 text-xs">
            <Activity className="w-3.5 h-3.5" /> Workflow
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="governance" className="flex items-center gap-1.5 text-xs">
            <Shield className="w-3.5 h-3.5" /> Governance
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs">
            <Database className="w-3.5 h-3.5" /> Audit
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-1.5 text-xs">
            <HardDrive className="w-3.5 h-3.5" /> Storage
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="jobs"><JobsPanel /></TabsContent>
          <TabsContent value="ai"><AiProcessingPanel /></TabsContent>
          <TabsContent value="reports"><ReportsPanel /></TabsContent>
          <TabsContent value="workflow"><WorkflowPanel /></TabsContent>
          <TabsContent value="users"><UsersPanel /></TabsContent>
          <TabsContent value="governance"><GovernancePanel /></TabsContent>
          <TabsContent value="audit"><AuditPanel /></TabsContent>
          <TabsContent value="storage"><StoragePanel /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
