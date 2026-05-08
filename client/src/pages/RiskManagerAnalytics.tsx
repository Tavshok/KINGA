/**
 * RiskManagerAnalytics.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Own-book motor intelligence dashboard for Risk Manager role.
 * GATED: risk_manager role + tier-enterprise tenant tier.
 *
 * 6 KPI modules:
 *  1. Claims Frequency by Incident Type (stacked bar, last 6 months)
 *  2. Average Repair Cost by Vehicle Age (horizontal bar)
 *  3. Fraud Flag Rate by Claim Type (grouped bar)
 *  4. Third-Party Recovery Exposure (dual-axis line, last 6 months)
 *  5. Repeat Offender Rate (donut + stat)
 *  6. Settlement Cycle Time (line chart, last 6 months)
 */

import { useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import {
  TrendingUp,
  ShieldAlert,
  Car,
  Target,
  Users,
  Clock,
  Lock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import Chart from "chart.js/auto";

// ─── Colour palette aligned with KINGA brand ─────────────────────────────────
const TEAL    = "#14B8A6";
const AMBER   = "#F59E0B";
const RED     = "#EF4444";
const INDIGO  = "#6366F1";
const EMERALD = "#10B981";
const SLATE   = "#64748B";

const INCIDENT_COLORS: Record<string, string> = {
  collision:  TEAL,
  theft:      AMBER,
  hail:       INDIGO,
  fire:       RED,
  vandalism:  "#EC4899",
  flood:      "#3B82F6",
  hijacking:  "#F97316",
  other:      SLATE,
};

// ─── Helper: format currency (USD) ───────────────────────────────────────────
function fmtUSD(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent ?? TEAL}22` }}
        >
          <Icon size={16} style={{ color: accent ?? TEAL }} />
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────
function ChartBox({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Chart 1: Claims Frequency by Incident Type ───────────────────────────────
function ClaimsFrequencyChart({
  data,
}: {
  data: { incidentType: string; month: string; claimCount: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const months       = [...new Set(data.map((d) => d.month))].sort();
    const incidentTypes = [...new Set(data.map((d) => d.incidentType))];

    const datasets = incidentTypes.map((type) => ({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      data: months.map((m) => {
        const row = data.find((d) => d.incidentType === type && d.month === m);
        return row?.claimCount ?? 0;
      }),
      backgroundColor: INCIDENT_COLORS[type] ?? SLATE,
      borderRadius: 3,
    }));

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: { labels: months, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94A3B8", font: { size: 11 } } },
        },
        scales: {
          x: { stacked: true, ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
          y: { stacked: true, ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 220 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 2: Avg Repair Cost by Vehicle Age ─────────────────────────────────
function RepairCostChart({
  data,
}: {
  data: { ageBucket: string; avgCost: number; claimCount: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const ordered = ["Under 3 years", "3-7 years", "Over 7 years"];
    const sorted  = ordered.map((b) => data.find((d) => d.ageBucket === b)).filter(Boolean) as typeof data;

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: sorted.map((d) => d.ageBucket),
        datasets: [
          {
            label: "Avg Repair Cost (USD)",
            data: sorted.map((d) => Math.round(d.avgCost)),
            backgroundColor: [EMERALD, TEAL, AMBER],
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${fmtUSD(ctx.parsed.x)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#64748B", callback: (v) => fmtUSD(Number(v)) },
            grid: { color: "#1E293B" },
          },
          y: { ticks: { color: "#94A3B8" }, grid: { display: false } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 180 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 3: Fraud Flag Rate by Claim Type ───────────────────────────────────
function FraudRateChart({
  data,
}: {
  data: { incidentType: string; fraudRiskLevel: string; count: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const types  = [...new Set(data.map((d) => d.incidentType))];
    const levels = ["low", "medium", "high"];
    const levelColors = { low: EMERALD, medium: AMBER, high: RED };

    const datasets = levels.map((level) => ({
      label: level.charAt(0).toUpperCase() + level.slice(1),
      data: types.map((t) => {
        const row = data.find((d) => d.incidentType === t && d.fraudRiskLevel === level);
        return row?.count ?? 0;
      }),
      backgroundColor: levelColors[level as keyof typeof levelColors],
      borderRadius: 3,
    }));

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94A3B8", font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
          y: { ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 220 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 4: TP Recovery Exposure ───────────────────────────────────────────
function RecoveryExposureChart({
  data,
}: {
  data: { month: string; totalQuantum: number; totalRecovered: number; caseCount: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.map((d) => d.month),
        datasets: [
          {
            label: "Quantum Claimed",
            data: data.map((d) => d.totalQuantum),
            borderColor: AMBER,
            backgroundColor: `${AMBER}22`,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
          },
          {
            label: "Recovered",
            data: data.map((d) => d.totalRecovered),
            borderColor: EMERALD,
            backgroundColor: `${EMERALD}22`,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94A3B8", font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
          y: {
            ticks: { color: "#64748B", callback: (v) => fmtUSD(Number(v)) },
            grid: { color: "#1E293B" },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 220 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 5: Repeat Offender Donut ──────────────────────────────────────────
function RepeatOffenderChart({
  repeatCount,
  totalCount,
  rate,
}: {
  repeatCount: number;
  totalCount: number;
  rate: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const unique = Math.max(0, totalCount - repeatCount);

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: ["Repeat Offenders", "First-Time"],
        datasets: [
          {
            data: [repeatCount, unique],
            backgroundColor: [RED, TEAL],
            borderWidth: 0,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { labels: { color: "#94A3B8", font: { size: 11 } } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [repeatCount, totalCount]);

  return (
    <div className="flex items-center gap-6">
      <div style={{ height: 160, width: 160, flexShrink: 0 }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-3xl font-bold text-white">{rate.toFixed(1)}%</p>
          <p className="text-xs text-slate-400 mt-0.5">Repeat offender rate</p>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><span className="text-red-400 font-semibold">{repeatCount}</span> repeat offenders</p>
          <p><span className="text-teal-400 font-semibold">{totalCount}</span> total TP cases</p>
        </div>
      </div>
    </div>
  );
}

// ─── Chart 6: Settlement Cycle Time ──────────────────────────────────────────
function CycleTimeChart({
  data,
}: {
  data: { month: string; avgDays: number; closedCount: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.map((d) => d.month),
        datasets: [
          {
            label: "Avg Settlement Days",
            data: data.map((d) => Math.round(d.avgDays * 10) / 10),
            borderColor: INDIGO,
            backgroundColor: `${INDIGO}22`,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: INDIGO,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y} days`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#64748B" }, grid: { color: "#1E293B" } },
          y: {
            ticks: { color: "#64748B", callback: (v) => `${v}d` },
            grid: { color: "#1E293B" },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-slate-500 text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 220 }}><canvas ref={canvasRef} /></div>;
}

// ─── Tier Upgrade Gate ────────────────────────────────────────────────────────
function TierUpgradeGate() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center">
        <Lock size={28} className="text-amber-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Enterprise Feature</h2>
        <p className="text-slate-400 max-w-md text-sm leading-relaxed">
          Risk Manager Analytics is available on the <span className="text-amber-400 font-semibold">Enterprise</span> tier.
          Upgrade your subscription to unlock own-book motor intelligence, fraud rate analysis, and settlement cycle benchmarking.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-xs text-slate-500">
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Claims frequency by incident type</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Repair cost analysis by vehicle age</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Fraud flag rate by claim type</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Third-party recovery exposure</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Repeat offender intelligence</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Settlement cycle time benchmarking</p>
      </div>
      <a
        href="mailto:sales@kinga.ai?subject=Enterprise%20Tier%20Upgrade%20Request"
        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors"
      >
        Contact Sales to Upgrade
      </a>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RiskManagerAnalytics() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = trpc.analytics.getRiskManagerKPIs.useQuery(undefined, {
    retry: false,
  });

  // Derive summary KPIs from raw data
  const summaryKpis = useMemo(() => {
    if (!data) return null;

    // Total claims in last 6 months
    const totalClaims6m = data.claimsFrequency.reduce((s, r) => s + r.claimCount, 0);

    // Avg repair cost across all age buckets (weighted)
    const totalCost  = data.repairCostByAge.reduce((s, r) => s + r.avgCost * r.claimCount, 0);
    const totalCount = data.repairCostByAge.reduce((s, r) => s + r.claimCount, 0);
    const avgRepairCost = totalCount > 0 ? totalCost / totalCount : 0;

    // High fraud rate
    const highFraud = data.fraudRateByType.filter((r) => r.fraudRiskLevel === "high").reduce((s, r) => s + r.count, 0);
    const allFraud  = data.fraudRateByType.reduce((s, r) => s + r.count, 0);
    const fraudRate = allFraud > 0 ? Math.round((highFraud / allFraud) * 1000) / 10 : 0;

    // Total recovery quantum
    const totalQuantum = data.recoveryExposure.reduce((s, r) => s + r.totalQuantum, 0);

    // Avg cycle time
    const totalDays   = data.settlementCycleTime.reduce((s, r) => s + r.avgDays * r.closedCount, 0);
    const totalClosed = data.settlementCycleTime.reduce((s, r) => s + r.closedCount, 0);
    const avgCycleDays = totalClosed > 0 ? Math.round(totalDays / totalClosed) : 0;

    return { totalClaims6m, avgRepairCost, fraudRate, totalQuantum, avgCycleDays };
  }, [data]);

  // Tier gate — FORBIDDEN with TIER_UPGRADE_REQUIRED message
  const isTierGated =
    error?.data?.code === "FORBIDDEN" &&
    (error.message?.includes("TIER_UPGRADE_REQUIRED") || error.message?.includes("Enterprise"));

  // Role gate
  const isRoleGated =
    error?.data?.code === "FORBIDDEN" && !isTierGated;

  return (
    <InsurerPortalLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp size={20} className="text-teal-400" />
              Risk Manager Analytics
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Own-book motor intelligence · {user?.tenantId ?? "Enterprise"} · Last 6 months
            </p>
          </div>
          {data && (
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          )}
        </div>

        {/* Tier gate */}
        {isTierGated && <TierUpgradeGate />}

        {/* Role gate */}
        {isRoleGated && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="text-white font-semibold">Risk Manager role required</p>
            <p className="text-slate-400 text-sm">This page is only accessible to users with the Risk Manager role.</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 h-28 animate-pulse" />
            ))}
          </div>
        )}

        {/* Data */}
        {data && summaryKpis && !isTierGated && (
          <>
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <KpiCard
                icon={Car}
                label="Claims (6M)"
                value={summaryKpis.totalClaims6m.toLocaleString()}
                sub="Across all incident types"
                accent={TEAL}
              />
              <KpiCard
                icon={TrendingUp}
                label="Avg Repair Cost"
                value={fmtUSD(summaryKpis.avgRepairCost)}
                sub="Weighted across age buckets"
                accent={EMERALD}
              />
              <KpiCard
                icon={ShieldAlert}
                label="High Fraud Rate"
                value={`${summaryKpis.fraudRate}%`}
                sub="Of assessed claims"
                accent={RED}
              />
              <KpiCard
                icon={Target}
                label="TP Exposure (6M)"
                value={fmtUSD(summaryKpis.totalQuantum)}
                sub="Total quantum claimed"
                accent={AMBER}
              />
              <KpiCard
                icon={Users}
                label="Repeat Offenders"
                value={`${data.repeatOffender.rate.toFixed(1)}%`}
                sub={`${data.repeatOffender.repeatCount} of ${data.repeatOffender.totalCount} TP cases`}
                accent={RED}
              />
              <KpiCard
                icon={Clock}
                label="Avg Cycle Time"
                value={`${summaryKpis.avgCycleDays}d`}
                sub="Submission to settlement"
                accent={INDIGO}
              />
            </div>

            {/* Row 1: Claims Frequency + Fraud Rate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox
                title="Claims Frequency by Incident Type"
                subtitle="Stacked monthly count — last 6 months"
              >
                <ClaimsFrequencyChart data={data.claimsFrequency} />
              </ChartBox>
              <ChartBox
                title="Fraud Flag Rate by Claim Type"
                subtitle="Low / Medium / High risk level distribution"
              >
                <FraudRateChart data={data.fraudRateByType} />
              </ChartBox>
            </div>

            {/* Row 2: Repair Cost + Recovery Exposure */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox
                title="Average Repair Cost by Vehicle Age"
                subtitle="Weighted average approved amount (USD)"
              >
                <RepairCostChart data={data.repairCostByAge} />
              </ChartBox>
              <ChartBox
                title="Third-Party Recovery Exposure"
                subtitle="Quantum claimed vs recovered — last 6 months"
              >
                <RecoveryExposureChart data={data.recoveryExposure} />
              </ChartBox>
            </div>

            {/* Row 3: Repeat Offender + Cycle Time */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox
                title="Repeat Offender Intelligence"
                subtitle="Third-party repeat offender rate across recovery cases"
              >
                <RepeatOffenderChart
                  repeatCount={data.repeatOffender.repeatCount}
                  totalCount={data.repeatOffender.totalCount}
                  rate={data.repeatOffender.rate}
                />
              </ChartBox>
              <ChartBox
                title="Settlement Cycle Time"
                subtitle="Average days from submission to closure — last 6 months"
              >
                <CycleTimeChart data={data.settlementCycleTime} />
              </ChartBox>
            </div>

            {/* Footer note */}
            <p className="text-xs text-slate-600 text-right">
              Data is tenant-isolated · Own-book only · Refreshed on demand
            </p>
          </>
        )}
      </div>
    </InsurerPortalLayout>
  );
}
