/**
 * ExceptionIntelligenceHub.tsx
 *
 * Phase 5B — Exception Intelligence Hub + System Drift Monitor
 *
 * Four panels in a single page:
 *   1. Exception Queue — categorised list of claims requiring attention
 *   2. Exception Analytics — aggregated breakdown by category and insurer
 *   3. System Drift Monitor — FCDI, fraud score, DOE rate, escalation rate drift
 *   4. Actionable Recommendations — deterministic remediation from IFE attribution patterns
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  XCircle,
  CheckCircle,
  Clock,
  AlertCircle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  BarChart3,
  FileSearch,
  Lightbulb,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  GATED_LOW_FCDI: {
    label: "Insufficient Evidence Quality",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  GATED_LOW_INPUT: {
    label: "Incomplete Input Data",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  ALL_DISQUALIFIED: {
    label: "Economic Infeasibility",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  MANUAL_REVIEW_REQUIRED: {
    label: "Ambiguity — Manual Review",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  GATED_NO_QUOTES: {
    label: "No Valid Quotes",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  FRAUD_ESCALATION: {
    label: "Fraud Escalation",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: <Shield className="w-3.5 h-3.5" />,
  },
  UNKNOWN: {
    label: "Unknown Exception",
    color: "text-gray-700",
    bg: "bg-gray-50 border-gray-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
};

function driftIcon(delta: number | null, threshold = 0) {
  if (delta === null) return <Minus className="w-4 h-4 text-slate-400" />;
  if (delta > threshold) return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (delta < -threshold) return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function driftSeverityBadge(severity: string) {
  if (severity === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Critical Drift</Badge>;
  if (severity === "warning") return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Warning</Badge>;
  return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Stable</Badge>;
}

function priorityBadge(priority: string) {
  if (priority === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Critical</Badge>;
  if (priority === "high") return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">High</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Medium</Badge>;
}

function typeBadge(type: string) {
  if (type === "INSURER_ACTION") return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">Insurer Action</Badge>;
  if (type === "SYSTEM_ACTION") return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">System Action</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">Process Action</Badge>;
}

// ─── Exception Queue Panel ────────────────────────────────────────────────────

function ExceptionQueuePanel() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const { data, isLoading, refetch } = trpc.exceptionIntelligence.getExceptionQueue.useQuery({
    category: selectedCategory as any,
    limit: 50,
  });

  const categories = ["ALL", "GATED_LOW_FCDI", "GATED_LOW_INPUT", "ALL_DISQUALIFIED", "FRAUD_ESCALATION", "MANUAL_REVIEW_REQUIRED", "GATED_NO_QUOTES"];

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            Exception Queue
            {data && <Badge className="bg-amber-100 text-amber-800 border-amber-200 ml-1">{data.total}</Badge>}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {categories.map(cat => {
            const meta = cat === "ALL" ? null : CATEGORY_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {cat === "ALL" ? "All Exceptions" : meta?.label ?? cat}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Loading exception queue...</div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-700">No exceptions in this category</div>
            <div className="text-xs text-slate-500 mt-1">All claims are either automated or pending initial assessment</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((item: any) => {
              const meta = CATEGORY_META[item.category] ?? CATEGORY_META.UNKNOWN;
              return (
                <div
                  key={item.assessmentId}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/insurer/claims/${item.claimId}/verdict`)}
                >
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium shrink-0 ${meta.bg} ${meta.color}`}>
                    {meta.icon}
                    <span className="hidden sm:inline">{meta.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {item.claimNumber ?? `Claim #${item.claimId}`}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {item.vehicleMake} {item.vehicleModel}
                      {item.fcdiScore !== null && item.fcdiScore !== undefined && (
                        <span className={`ml-2 ${Number(item.fcdiScore) < 60 ? "text-red-500" : "text-slate-400"}`}>
                          FCDI: {item.fcdiScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exception Analytics Panel ────────────────────────────────────────────────

function ExceptionAnalyticsPanel() {
  const { data, isLoading } = trpc.exceptionIntelligence.getExceptionAggregates.useQuery({ daysBack: 30 });

  if (isLoading) return <Card className="border-slate-200"><CardContent className="py-8 text-center text-sm text-slate-500">Loading analytics...</CardContent></Card>;
  if (!data) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          Exception Analytics
          <span className="text-xs font-normal text-slate-500 ml-1">Last 30 days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{data.totalAssessments}</div>
            <div className="text-xs text-slate-500 mt-1">Total Assessed</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{data.exceptionCount}</div>
            <div className="text-xs text-amber-600 mt-1">In Exception</div>
          </div>
          <div className={`rounded-lg border p-3 text-center ${data.exceptionPct >= 20 ? "border-red-200 bg-red-50" : data.exceptionPct >= 10 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
            <div className={`text-2xl font-bold ${data.exceptionPct >= 20 ? "text-red-700" : data.exceptionPct >= 10 ? "text-amber-700" : "text-green-700"}`}>
              {data.exceptionPct}%
            </div>
            <div className="text-xs text-slate-500 mt-1">Exception Rate</div>
          </div>
        </div>

        {/* Top causes */}
        {data.topCauses && data.topCauses.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Top Exception Causes</div>
            <div className="space-y-2">
              {data.topCauses.map((cause: any) => {
                const meta = CATEGORY_META[cause.category] ?? CATEGORY_META.UNKNOWN;
                return (
                  <div key={cause.category} className="flex items-center gap-3">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${meta.bg} ${meta.color}`}>
                      {meta.icon}
                      <span>{meta.label}</span>
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${cause.category === "ALL_DISQUALIFIED" || cause.category === "FRAUD_ESCALATION" ? "bg-red-400" : "bg-amber-400"}`}
                        style={{ width: `${cause.pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-600 shrink-0 w-16 text-right">{cause.count} ({cause.pct}%)</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attribution breakdown */}
        {data.attributionCounts && (
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Data Gap Attribution (Exception Claims)</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "CLAIMANT_DEFICIENCY", label: "Claimant", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
                { key: "INSURER_DATA_GAP", label: "Insurer", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
                { key: "SYSTEM_EXTRACTION_FAILURE", label: "System", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
                { key: "DOCUMENT_LIMITATION", label: "Document", color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
              ].map(({ key, label, color, bg }) => (
                <div key={key} className={`rounded-lg border p-2.5 ${bg}`}>
                  <div className={`text-lg font-bold ${color}`}>{(data.attributionCounts as any)[key] ?? 0}</div>
                  <div className={`text-xs ${color} mt-0.5`}>{label} Gaps</div>
                </div>
              ))}
            </div>
            {(data.attributionCounts as any).INSURER_DATA_GAP > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {(data.attributionCounts as any).INSURER_DATA_GAP} insurer-side gaps are contributing to exceptions. These should not be attributed to claimants.
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── System Drift Monitor Panel ───────────────────────────────────────────────

function SystemDriftMonitorPanel() {
  const { data, isLoading } = trpc.exceptionIntelligence.getSystemDriftReport.useQuery({ windowDays: 30 });

  if (isLoading) return <Card className="border-slate-200"><CardContent className="py-8 text-center text-sm text-slate-500">Loading drift report...</CardContent></Card>;
  if (!data) return null;

  const healthColor = data.overallHealth === "critical" ? "text-red-700" : data.overallHealth === "warning" ? "text-amber-700" : "text-green-700";
  const healthBg = data.overallHealth === "critical" ? "bg-red-50 border-red-200" : data.overallHealth === "warning" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200";

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            System Drift Monitor
            <span className="text-xs font-normal text-slate-500 ml-1">vs. prior {data.windowDays}-day window</span>
          </CardTitle>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${healthColor} ${healthBg}`}>
            {data.overallHealth === "stable" ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {data.overallHealth === "critical" ? "Critical Drift" : data.overallHealth === "warning" ? "Warning" : "Stable"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-slate-500">
          Current period: {data.currentPeriodCount} assessments · Previous period: {data.previousPeriodCount} assessments
        </div>
        {data.driftSummary.map((d: any, i: number) => (
          <div key={i} className={`rounded-lg border p-3 ${d.severity === "critical" ? "border-red-200 bg-red-50" : d.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {driftIcon(d.delta, 0)}
                <span className="text-sm font-semibold text-slate-800">{d.metric}</span>
              </div>
              <div className="flex items-center gap-2">
                {driftSeverityBadge(d.severity)}
                {d.delta !== null && (
                  <span className={`text-xs font-bold ${d.delta > 0 ? "text-red-600" : d.delta < 0 ? "text-green-600" : "text-slate-500"}`}>
                    {d.delta > 0 ? "+" : ""}{typeof d.delta === "number" ? d.delta.toFixed(1) : d.delta}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 mb-1">
              <span>Current: <strong>{d.current ?? "N/A"}</strong></span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span>Previous: <strong>{d.previous ?? "N/A"}</strong></span>
            </div>
            <p className="text-xs text-slate-600">{d.interpretation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Actionable Recommendations Panel ────────────────────────────────────────

function ActionableRecommendationsPanel() {
  const { data, isLoading } = trpc.exceptionIntelligence.getActionableRecommendations.useQuery({ daysBack: 60 });

  if (isLoading) return <Card className="border-slate-200"><CardContent className="py-8 text-center text-sm text-slate-500">Analysing patterns...</CardContent></Card>;
  if (!data) return null;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-600" />
          Actionable Recommendations
          <span className="text-xs font-normal text-slate-500 ml-1">Last 60 days · {data.totalAssessedWithIFE} claims with IFE data</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.recommendations.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-700">No systemic issues detected</div>
            <div className="text-xs text-slate-500 mt-1">Attribution patterns are within normal ranges. No remediation actions required at this time.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.recommendations.map((rec: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {priorityBadge(rec.priority)}
                    {typeBadge(rec.type)}
                    {rec.affectedField && (
                      <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{rec.affectedField}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{rec.frequency}× ({rec.frequencyPct}%)</span>
                </div>
                <div className="text-sm font-semibold text-slate-800 mb-1">{rec.title}</div>
                <p className="text-xs text-slate-600">{rec.detail}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExceptionIntelligenceHub() {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exception Intelligence Hub</h1>
          <p className="text-sm text-slate-500 mt-1">
            Categorised exception queue, aggregated analytics, system drift monitoring, and data-driven remediation recommendations.
          </p>
        </div>

        <Separator />

        {/* Top row: Queue + Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExceptionQueuePanel />
          <ExceptionAnalyticsPanel />
        </div>

        {/* Bottom row: Drift + Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SystemDriftMonitorPanel />
          <ActionableRecommendationsPanel />
        </div>
      </div>
    </DashboardLayout>
  );
}
