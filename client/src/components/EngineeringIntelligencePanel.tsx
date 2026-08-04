/**
 * EngineeringIntelligencePanel
 * ─────────────────────────────
 * Epic 4 — Engineering Intelligence panel.
 * Used in: EngineerDashboard (Intelligence section), EngineerInspectionDetail (Intelligence tab).
 *
 * Data sources (all canonical):
 *   engineeringIntelligence.getSummary
 *   engineeringIntelligence.getInspectionTrends
 *   engineeringIntelligence.getMeasurementAnalytics
 *   engineeringIntelligence.getObservationAnalytics
 *   engineeringIntelligence.getPhysicsQualityMetrics
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, BarChart3, CheckCircle, Cpu, Ruler, Eye } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(Number(n))}%`;
}

function pctColor(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 80) return "text-green-400";
  if (v >= 60) return "text-amber-400";
  return "text-red-400";
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "180d", value: 180 },
];

export function EngineeringIntelligencePanel() {
  const [days, setDays] = useState(90);

  const { data: summary, isLoading } = trpc.engineeringIntelligence.getSummary.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: trends } = trpc.engineeringIntelligence.getInspectionTrends.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: measurements } = trpc.engineeringIntelligence.getMeasurementAnalytics.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: observations } = trpc.engineeringIntelligence.getObservationAnalytics.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: physics } = trpc.engineeringIntelligence.getPhysicsQualityMetrics.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500" />
        <span className="ml-2 text-sm text-gray-400">Loading engineering intelligence…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">Engineering Intelligence</h3>
          <p className="text-xs text-gray-500 mt-0.5">Epic 4 · Inspection quality, measurement analytics, physics validation</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                days === opt.value
                  ? "bg-yellow-900 text-yellow-200"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Total Inspections</div>
            <div className="text-2xl font-bold text-gray-100">{summary?.totalInspections ?? "—"}</div>
            <div className="text-xs text-gray-500">{summary?.completedInspections ?? "—"} completed</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Completion Rate</div>
            <div className={`text-2xl font-bold ${pctColor(summary?.completionRate)}`}>
              {pct(summary?.completionRate)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">Physics Validation</div>
            <div className={`text-2xl font-bold ${pctColor(summary?.physicsValidationRate)}`}>
              {pct(summary?.physicsValidationRate)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="text-xs text-gray-400 mb-1">AI Approval Rate</div>
            <div className={`text-2xl font-bold ${pctColor(summary?.aiApprovalRate)}`}>
              {pct(summary?.aiApprovalRate)}
            </div>
            {summary?.avgDurationMinutes != null && (
              <div className="text-xs text-gray-500">avg {Math.round(summary.avgDurationMinutes)}min</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inspection Trends + Physics Quality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Inspection type trends */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <BarChart3 className="h-3.5 w-3.5" />
              Inspection Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!trends?.trends?.length ? (
              <p className="text-xs text-gray-500 text-center py-3">No trend data</p>
            ) : (
              <div className="space-y-2">
                {trends.trends.map((t: any, i: number) => {
                  const total = trends.trends.reduce((acc: number, x: any) => acc + Number(x.count), 0);
                  const pctVal = total > 0 ? Math.round((Number(t.count) / total) * 100) : 0;
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-300 capitalize">{t.inspectionType?.replace(/_/g, ' ') ?? 'Unknown'}</span>
                        <span className="text-gray-400">{t.count} · {pctVal}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-yellow-700" style={{ width: `${pctVal}%` }} />
                      </div>
                      <div className="flex gap-3 text-[10px] text-gray-600">
                        <span>AI approval: {t.aiApprovalRate != null ? `${Math.round(Number(t.aiApprovalRate))}%` : '—'}</span>
                        <span>avg {t.avgDuration != null ? `${Math.round(Number(t.avgDuration))}min` : '—'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Physics quality */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <Cpu className="h-3.5 w-3.5" />
              Physics Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!physics ? (
              <p className="text-xs text-gray-500 text-center py-3">No physics data</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {Object.entries(physics).filter(([k]) => k !== 'period' && k !== 'dataSources').map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-gray-800 pb-1 last:border-0">
                    <span className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="text-gray-200 font-medium">{
                      typeof v === 'number' ? (k.toLowerCase().includes('rate') || k.toLowerCase().includes('pct') ? `${Math.round(v)}%` : Math.round(v)) :
                      v == null ? '—' : String(v)
                    }</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Measurement + Observation analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Measurement analytics */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <Ruler className="h-3.5 w-3.5" />
              Top Measurement Types
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!measurements?.componentFrequency?.length ? (
              <p className="text-xs text-gray-500 text-center py-3">No measurement data</p>
            ) : (
              <div className="space-y-1.5">
                {measurements.componentFrequency.slice(0, 8).map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="text-gray-200 flex-1 capitalize">{m.measurementType?.replace(/_/g, ' ') ?? '—'}</span>
                    <Badge className="bg-gray-800 text-gray-400 text-[10px]">{m.count}</Badge>
                    {Number(m.criticalCount) > 0 && (
                      <Badge className="bg-red-900 text-red-300 text-[10px]">{m.criticalCount} crit</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Observation analytics */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
              <Eye className="h-3.5 w-3.5" />
              Top Observation Types
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {!observations?.observationTypes?.length ? (
              <p className="text-xs text-gray-500 text-center py-3">No observation data</p>
            ) : (
              <div className="space-y-1.5">
                {observations.observationTypes.slice(0, 8).map((o: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="text-gray-200 flex-1 capitalize">{o.observationType?.replace(/_/g, ' ') ?? '—'}</span>
                    <Badge className="bg-gray-800 text-gray-400 text-[10px]">{o.count}</Badge>
                    {Number(o.criticalCount) > 0 && (
                      <Badge className="bg-red-900 text-red-300 text-[10px]">{o.criticalCount} crit</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data sources */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 pt-1 border-t border-gray-800">
        <BookOpen className="h-3 w-3" />
        <span>Sources: inspections · physical_measurements · engineer_observations · Period: last {days} days</span>
      </div>
    </div>
  );
}
