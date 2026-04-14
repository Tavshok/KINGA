/**
 * Integrity Metrics Dashboard
 *
 * Surfaces pipeline governance data: Integrity Gate distribution,
 * Cross-Stage Congruency scores, most-overridden fields, top blocking
 * causes, and photo ingestion health.
 *
 * Route: /admin/integrity-metrics
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
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle,
  Camera, RefreshCw, CheckCircle2, XCircle, Info,
} from "lucide-react";

const GATE_COLORS = {
  CLEAR: "#22c55e",
  WARNINGS: "#f59e0b",
  BLOCKED: "#ef4444",
  UNKNOWN: "#94a3b8",
};

const PHOTO_COLORS = ["#22c55e", "#94a3b8", "#ef4444", "#f59e0b"];

function GateStatusIcon({ status }: { status: string }) {
  if (status === "CLEAR") return <ShieldCheck className="h-5 w-5 text-green-500" />;
  if (status === "WARNINGS") return <ShieldAlert className="h-5 w-5 text-amber-500" />;
  if (status === "BLOCKED") return <ShieldX className="h-5 w-5 text-red-500" />;
  return <Info className="h-5 w-5 text-slate-400" />;
}

function GateBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    CLEAR: "bg-green-100 text-green-800 border-green-200",
    WARNINGS: "bg-amber-100 text-amber-800 border-amber-200",
    BLOCKED: "bg-red-100 text-red-800 border-red-200",
    UNKNOWN: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] || variants.UNKNOWN}`}>
      <GateStatusIcon status={status} />
      {status}
    </span>
  );
}

export default function IntegrityMetricsDashboard() {
  const [days, setDays] = useState<7 | 30 | 90>(30);

  const { data, isLoading, refetch } = trpc.integrity.getMetrics.useQuery(
    { days },
    { refetchOnWindowFocus: false }
  );

  const gateData = data
    ? Object.entries(data.gateDistribution).map(([name, value]) => ({ name, value }))
    : [];

  const photoData = data
    ? [
        { name: "Photos Available", value: data.photoIngestion.photosAvailable },
        { name: "No Photos in Doc", value: data.photoIngestion.noPhotos },
        { name: "Extraction Failed", value: data.photoIngestion.extractionFailed },
        { name: "Needs Review", value: data.photoIngestion.requiresReview },
      ]
    : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrity Metrics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline governance health — Integrity Gate, Cross-Stage Congruency, and Photo Ingestion
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d as 7 | 30 | 90)}
            >
              {d}d
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-muted-foreground">Loading integrity metrics…</div>
      )}

      {data && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Assessed</p>
                <p className="text-3xl font-bold mt-1">{data.totalAssessments}</p>
                <p className="text-xs text-muted-foreground mt-1">last {days} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Congruency</p>
                <p className="text-3xl font-bold mt-1">
                  {data.avgCongruencyScore !== null ? `${data.avgCongruencyScore}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">cross-stage agreement</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Gate Clear</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {data.totalAssessments > 0
                    ? `${Math.round((data.gateDistribution.CLEAR / data.totalAssessments) * 100)}%`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{data.gateDistribution.CLEAR} claims</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Blocked</p>
                <p className="text-3xl font-bold mt-1 text-red-600">
                  {data.gateDistribution.BLOCKED}
                </p>
                <p className="text-xs text-muted-foreground mt-1">require manual review</p>
              </CardContent>
            </Card>
          </div>

          {/* Gate Distribution + Photo Ingestion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                  Integrity Gate Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  {Object.entries(data.gateDistribution).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <GateBadge status={status} />
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={gateData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {gateData.map((entry) => (
                        <Cell key={entry.name} fill={GATE_COLORS[entry.name as keyof typeof GATE_COLORS] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="h-4 w-4 text-blue-500" />
                  Photo Ingestion Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Photos successfully extracted", value: data.photoIngestion.photosAvailable, icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> },
                    { label: "No photos in document", value: data.photoIngestion.noPhotos, icon: <Info className="h-4 w-4 text-slate-400" /> },
                    { label: "Extraction failed", value: data.photoIngestion.extractionFailed, icon: <XCircle className="h-4 w-4 text-red-500" /> },
                    { label: "Requires manual photo review", value: data.photoIngestion.requiresReview, icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {icon}
                        {label}
                      </div>
                      <span className="text-sm font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Blockers + Top Warnings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldX className="h-4 w-4 text-red-500" />
                  Top Blocking Causes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topBlockers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No blocked assessments in this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.topBlockers} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cause" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Top Warning Causes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topWarnings.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No warnings in this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.topWarnings} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cause" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Most Overridden Fields + Conflicting Stages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most Overridden Fields</CardTitle>
                <p className="text-xs text-muted-foreground">Fields where the reconciliation engine resolved a conflict between pipeline stages</p>
              </CardHeader>
              <CardContent>
                {data.topOverriddenFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No field overrides recorded in this period</p>
                ) : (
                  <div className="space-y-2">
                    {data.topOverriddenFields.map(({ field, count }) => (
                      <div key={field} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <span className="text-sm font-mono text-muted-foreground">{field}</span>
                        <Badge variant="outline">{count} override{count !== 1 ? "s" : ""}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most Conflicting Stages</CardTitle>
                <p className="text-xs text-muted-foreground">Pipeline stages most frequently involved in cross-stage conflicts</p>
              </CardHeader>
              <CardContent>
                {data.topConflictingStages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No stage conflicts recorded in this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.topConflictingStages} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Empty state note */}
          {data.totalAssessments === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No assessments in the last {days} days</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Run the first governed pipeline assessment to populate this dashboard.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
