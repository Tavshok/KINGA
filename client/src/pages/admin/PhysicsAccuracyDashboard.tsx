/**
 * PhysicsAccuracyDashboard.tsx — Wave 4A Admin Panel
 *
 * Surfaces physics prediction accuracy metrics from the Historical Validation Loop:
 * - Speed MAPE (Mean Absolute Percentage Error)
 * - CI Coverage Rate (% of claims where actual speed fell within predicted CI)
 * - Uncertainty grade distribution
 * - Evidence Plugin Registry status
 * - Recent validation records table
 *
 * Route: /admin/physics-accuracy
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Gauge, TrendingUp, TrendingDown, Minus, Cpu, Plug,
} from "lucide-react";

// ─── Colour palette ───────────────────────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#f59e0b",
  D: "#f97316",
  "?": "#94a3b8",
};

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#22c55e",
  PARTIAL: "#f59e0b",
  UNAVAILABLE: "#94a3b8",
  ERROR: "#ef4444",
};

// ─── Helper components ────────────────────────────────────────────────────────
function GradeBadge({ grade }: { grade: string | null }) {
  const g = grade ?? "?";
  const color = GRADE_COLORS[g] ?? "#94a3b8";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border"
      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
    >
      {g}
    </span>
  );
}

function DriftIndicator({ drift }: { drift: number }) {
  if (Math.abs(drift) < 0.5) return <Minus className="h-4 w-4 text-slate-400" />;
  if (drift > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
  return <TrendingDown className="h-4 w-4 text-green-500" />;
}

function PluginStatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: `${color}15`, color, borderColor: `${color}30` }}
    >
      {status === "AVAILABLE" && <CheckCircle2 className="h-3 w-3" />}
      {status === "UNAVAILABLE" && <Minus className="h-3 w-3" />}
      {status === "ERROR" && <XCircle className="h-3 w-3" />}
      {status === "PARTIAL" && <AlertTriangle className="h-3 w-3" />}
      {status}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PhysicsAccuracyDashboard() {
  const [days, setDays] = useState<30 | 90 | 365>(90);

  const { data, isLoading, refetch } = trpc.validationLoop.getStats.useQuery(
    { days },
    { refetchOnWindowFocus: false }
  );

  // Grade distribution for pie chart
  const gradeData = data
    ? Object.entries(data.stats.gradeDistribution).map(([name, value]) => ({ name, value }))
    : [];

  // Method accuracy bar chart
  const methodData = data
    ? Object.entries(data.stats.methodAccuracy).map(([method, mape]) => ({
        method: method.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        mape,
      })).sort((a, b) => a.mape - b.mape)
    : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gauge className="h-6 w-6 text-blue-600" />
            Physics Accuracy Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wave 4 — Historical Validation Loop · Speed prediction accuracy, CI coverage, and evidence plugin status
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[30, 90, 365].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d as 30 | 90 | 365)}
            >
              {d === 365 ? "1y" : `${d}d`}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-8 w-8 animate-pulse mx-auto mb-3 text-blue-400" />
          Loading physics accuracy metrics…
        </div>
      )}

      {data && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Records</p>
                <p className="text-3xl font-bold mt-1">{data.totalRecords}</p>
                <p className="text-xs text-muted-foreground mt-1">last {days} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Speed MAPE</p>
                <p className="text-3xl font-bold mt-1">
                  {data.stats.totalValidated > 0 ? `${data.stats.speedMAPE.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.stats.totalValidated} validated claims
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">CI Coverage</p>
                <p className="text-3xl font-bold mt-1">
                  {data.stats.totalValidated > 0 ? `${data.stats.ciCoverageRate.toFixed(0)}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">actual speed within 90% CI</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Calibration Drift</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-3xl font-bold">
                    {data.stats.totalValidated > 0
                      ? `${data.stats.calibrationDrift > 0 ? "+" : ""}${data.stats.calibrationDrift.toFixed(1)}%`
                      : "—"}
                  </p>
                  {data.stats.totalValidated > 0 && (
                    <DriftIndicator drift={data.stats.calibrationDrift} />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">recent vs prior MAPE trend</p>
              </CardContent>
            </Card>
          </div>

          {/* Pending / Validated split */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Validation</p>
                <p className="text-3xl font-bold mt-1 text-amber-600">{data.pendingValidation}</p>
                <p className="text-xs text-muted-foreground mt-1">awaiting actual outcome data</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Validated</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{data.validated}</p>
                <p className="text-xs text-muted-foreground mt-1">actual outcomes recorded</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Uncertainty Grade Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uncertainty Grade Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {gradeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={gradeData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {gradeData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={GRADE_COLORS[entry.name] ?? "#94a3b8"}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    No grade data yet — run pipeline assessments to populate
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(GRADE_COLORS).map(([g, c]) => (
                    <span key={g} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                      Grade {g}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Per-Method MAPE */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-Method Speed MAPE</CardTitle>
              </CardHeader>
              <CardContent>
                {methodData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={methodData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="method" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                      <Bar dataKey="mape" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    No per-method data yet — requires validated claims with actual speed
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Evidence Plugin Registry */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plug className="h-4 w-4 text-blue-500" />
                Evidence Plugin Registry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Wave 4B — Extensibility layer for additional evidence sources (Telematics, EDR, LiDAR, 3D Scan).
                Plugins return UNAVAILABLE until the corresponding integration is connected by the operator.
              </p>
              <div className="divide-y divide-border">
                {data.pluginRegistry.map((plugin) => (
                  <div key={plugin.pluginId} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Cpu className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{plugin.pluginName}</p>
                        <p className="text-xs text-muted-foreground">
                          {plugin.pluginId} · v{plugin.version} · {plugin.category}
                        </p>
                      </div>
                    </div>
                    <PluginStatusBadge status={plugin.status} />
                  </div>
                ))}
                {data.pluginRegistry.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground text-center">
                    No plugins registered
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Validation Records Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Validation Records</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No validation records yet. Records are created automatically after each pipeline run.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="pb-2 pr-4">Claim</th>
                        <th className="pb-2 pr-4">Pred. Speed</th>
                        <th className="pb-2 pr-4">CI Range</th>
                        <th className="pb-2 pr-4">Crush Depth</th>
                        <th className="pb-2 pr-4">Grade</th>
                        <th className="pb-2 pr-4">Integrity</th>
                        <th className="pb-2 pr-4">Actual Speed</th>
                        <th className="pb-2 pr-4">Deviation</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.recentRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="py-2 pr-4 font-mono text-xs">{r.claimId}</td>
                          <td className="py-2 pr-4">
                            {r.predictedSpeedKmh != null
                              ? `${r.predictedSpeedKmh.toFixed(0)} km/h`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">
                            {r.predictedSpeedLowKmh != null && r.predictedSpeedHighKmh != null
                              ? `${r.predictedSpeedLowKmh.toFixed(0)}–${r.predictedSpeedHighKmh.toFixed(0)}`
                              : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {r.predictedCrushDepthMm != null
                              ? `${r.predictedCrushDepthMm.toFixed(0)} mm`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-4">
                            <GradeBadge grade={r.uncertaintyGrade} />
                          </td>
                          <td className="py-2 pr-4">
                            {r.integrityScore != null
                              ? <span className={r.integrityScore >= 80 ? "text-green-600 font-medium" : r.integrityScore >= 60 ? "text-amber-600 font-medium" : "text-red-600 font-medium"}>
                                  {r.integrityScore}
                                </span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-4">
                            {r.actualSpeedKmh != null
                              ? `${r.actualSpeedKmh.toFixed(0)} km/h`
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-4">
                            {r.speedDeviationPct != null
                              ? <span className={r.speedDeviationPct <= 15 ? "text-green-600" : r.speedDeviationPct <= 30 ? "text-amber-600" : "text-red-600"}>
                                  {r.speedDeviationPct.toFixed(1)}%
                                </span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              r.validationStatus === "validated"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {r.validationStatus}
                            </span>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">
                            {r.createdAt
                              ? new Date(r.createdAt).toLocaleDateString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Methodology note */}
          <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
            <CardContent className="pt-5">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                About the Historical Validation Loop (Wave 4A)
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Every pipeline run writes a <code>physics_validation_records</code> row with predicted speed, crush depth,
                and uncertainty grade from the Physics Truth Layer. When an adjuster closes a claim with actual repair cost
                or police-confirmed speed, the record is updated and deviation metrics are computed.
                Speed MAPE (Mean Absolute Percentage Error) and CI Coverage Rate are the primary accuracy KPIs.
                A 90% CI coverage rate ≥ 85% indicates well-calibrated uncertainty bounds.
                Calibration drift &gt; +2% over 30 claims triggers a recalibration review.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
