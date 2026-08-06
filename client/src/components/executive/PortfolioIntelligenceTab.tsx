/**
 * PortfolioIntelligenceTab
 * ─────────────────────────
 * Epic 4 — Portfolio Intelligence panel for the Executive Dashboard.
 * Surfaces exposure, fraud, operational, financial, and concentration
 * intelligence from the portfolioIntelligenceRouter.
 *
 * Data sources (all canonical, no mocks):
 *   portfolioIntelligence.getPortfolioSummary
 *   portfolioIntelligence.getExposureSummary
 *   portfolioIntelligence.getFraudSummary
 *   portfolioIntelligence.getOperationalMetrics
 *   portfolioIntelligence.getFinancialMetrics
 *   portfolioIntelligence.getRiskConcentration
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Car,
  DollarSign,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(Number(n))}%`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${accent ?? "text-gray-100"}`}>{value}</div>
            {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
          </div>
          <div className="text-gray-600 flex-shrink-0 mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-gray-500">{icon}</span>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

export function PortfolioIntelligenceTab() {
  const [days, setDays] = useState(90);

  const { data: summary, isLoading: loadingSummary } = trpc.portfolioIntelligence.getPortfolioSummary.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: exposure } = trpc.portfolioIntelligence.getExposureSummary.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: fraud } = trpc.portfolioIntelligence.getFraudSummary.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: ops } = trpc.portfolioIntelligence.getOperationalMetrics.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: financial } = trpc.portfolioIntelligence.getFinancialMetrics.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );
  const { data: concentration } = trpc.portfolioIntelligence.getRiskConcentration.useQuery(
    { days },
    { staleTime: 3 * 60 * 1000 }
  );

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        <span className="ml-3 text-sm text-gray-400">Loading portfolio intelligence…</span>
      </div>
    );
  }

  const s = summary?.summary;
  const e = exposure?.exposure;
  const f = fraud?.alerts;
  const ai = fraud?.aiScores;

  return (
    <div className="space-y-8">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-100">Portfolio Intelligence</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Epic 4 · Sources: claims · fraud_alerts · ai_assessments · claim_confidence_scores · vehicle_market_valuations
          </p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                days === opt.value
                  ? "bg-green-800 text-green-200"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 1: Exposure Summary ── */}
      <div>
        <SectionHeader title="Exposure Summary" icon={<TrendingUp className="h-4 w-4" />} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Claims"
            value={s?.totalClaims ?? e?.totalClaims ?? "—"}
            sub={`${days}-day window`}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <KpiCard
            label="Open Claims"
            value={s?.openClaims ?? e?.openClaims ?? "—"}
            icon={<Zap className="h-5 w-5" />}
            accent="text-amber-400"
          />
          <KpiCard
            label="Total Approved"
            value={fmt(s?.totalApprovedCents ?? e?.totalApprovedCents)}
            icon={<DollarSign className="h-5 w-5" />}
            accent="text-green-400"
          />
          <KpiCard
            label="High-Value Claims"
            value={e?.highValueClaims ?? "—"}
            sub="≥ $5,000"
            icon={<AlertTriangle className="h-5 w-5" />}
            accent="text-red-400"
          />
        </div>
      </div>

      {/* ── Section 2: Fraud Intelligence ── */}
      <div>
        <SectionHeader title="Fraud Intelligence" icon={<Shield className="h-4 w-4" />} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Fraud Alerts"
            value={summary?.fraudAlertCount ?? f?.totalAlerts ?? "—"}
            icon={<AlertTriangle className="h-5 w-5" />}
            accent={Number(summary?.fraudAlertCount ?? f?.totalAlerts ?? 0) > 0 ? "text-red-400" : "text-green-400"}
          />
          <KpiCard
            label="High Severity"
            value={f?.highSeverity ?? "—"}
            icon={<Shield className="h-5 w-5" />}
            accent="text-red-400"
          />
          <KpiCard
            label="Avg AI Fraud Score"
            value={ai?.avgFraudScore != null ? `${Math.round(Number(ai.avgFraudScore))}` : "—"}
            sub="0–100 scale"
            icon={<Zap className="h-5 w-5" />}
            accent={Number(ai?.avgFraudScore ?? 0) >= 50 ? "text-red-400" : "text-gray-100"}
          />
          <KpiCard
            label="High-Risk Assessed"
            value={ai?.highRiskClaims ?? "—"}
            sub={`of ${ai?.totalAssessed ?? "—"} assessed`}
            icon={<AlertTriangle className="h-5 w-5" />}
            accent="text-orange-400"
          />
        </div>
      </div>

      {/* ── Section 3: Operational Metrics ── */}
      <div>
        <SectionHeader title="Operational Metrics" icon={<BarChart3 className="h-4 w-4" />} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Completion Rate"
            value={pct(ops?.completionRate)}
            sub={`${ops?.completedClaims ?? "—"} completed`}
            icon={<TrendingUp className="h-5 w-5" />}
            accent={Number(ops?.completionRate ?? 0) >= 70 ? "text-green-400" : "text-amber-400"}
          />
          <KpiCard
            label="Rejected Claims"
            value={ops?.rejectedClaims ?? "—"}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <KpiCard
            label="Avg KINGA Confidence"
            value={pct(ops?.avgConfidenceScore)}
            icon={<Zap className="h-5 w-5" />}
            accent={Number(ops?.avgConfidenceScore ?? 0) >= 80 ? "text-green-400" : "text-amber-400"}
          />
          <KpiCard
            label="High-Confidence Rate"
            value={pct(ops?.highConfidenceRate)}
            sub="≥ 80% confidence"
            icon={<Shield className="h-5 w-5" />}
            accent={Number(ops?.highConfidenceRate ?? 0) >= 60 ? "text-green-400" : "text-amber-400"}
          />
        </div>
      </div>

      {/* ── Section 4: Financial Metrics ── */}
      <div>
        <SectionHeader title="Financial Metrics" icon={<DollarSign className="h-4 w-4" />} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Approved"
            value={fmt(financial?.financial?.totalApproved)}
            icon={<DollarSign className="h-5 w-5" />}
            accent="text-green-400"
          />
          <KpiCard
            label="Avg Approved"
            value={fmt(financial?.financial?.avgApproved)}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KpiCard
            label="Max Single Claim"
            value={fmt(financial?.financial?.maxApproved)}
            icon={<AlertTriangle className="h-5 w-5" />}
            accent="text-amber-400"
          />
          <KpiCard
            label="Avg Market Value"
            value={fmt(financial?.valuations?.avgMarketValue != null ? Number(financial.valuations.avgMarketValue) : null)}
            sub={`${financial?.valuations?.totalValuations ?? "—"} valuations`}
            icon={<Car className="h-5 w-5" />}
          />
        </div>
      </div>

      {/* ── Section 5: Risk Concentration ── */}
      {concentration && (
        <div>
          <SectionHeader title="Risk Concentration" icon={<AlertTriangle className="h-4 w-4" />} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Top vehicles by claim count */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
                  <Car className="h-3.5 w-3.5" />
                  Top Vehicles by Claim Count
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {concentration.topVehicles.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">No data</p>
                ) : (
                  <div className="space-y-1.5">
                    {concentration.topVehicles.slice(0, 8).map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                        <span className="font-mono text-gray-200 flex-1 truncate">
                          {v.vehicleRegistration ?? "—"}
                        </span>
                        <Badge className="bg-gray-800 text-gray-300 text-[10px]">
                          {v.claimCount} claim{Number(v.claimCount) !== 1 ? "s" : ""}
                        </Badge>
                        <span className="text-green-400 flex-shrink-0">{fmt(v.totalApproved)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Claim type distribution */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-semibold text-gray-400 flex items-center gap-2 uppercase tracking-wide">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Claim Type Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {concentration.claimTypes.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">No data</p>
                ) : (
                  <div className="space-y-2">
                    {concentration.claimTypes.map((ct, i) => {
                      const total = concentration.claimTypes.reduce((acc, c) => acc + Number(c.count), 0);
                      const pctVal = total > 0 ? Math.round((Number(ct.count) / total) * 100) : 0;
                      return (
                        <div key={i} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-300 capitalize">{ct.claimantType ?? "Unknown"}</span>
                            <span className="text-gray-400">{ct.count} · {pctVal}%</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-green-700"
                              style={{ width: `${pctVal}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Data Sources footnote */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-600 pt-1 border-t border-gray-800">
        <BookOpen className="h-3 w-3" />
        <span>
          Sources: claims · fraud_alerts · ai_assessments · claim_confidence_scores · vehicle_market_valuations
          · Period: last {days} days
        </span>
      </div>
    </div>
  );
}
