/**
 * RiskManagerAnalytics.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Own-book motor intelligence dashboard for Risk Manager role.
 * GATED: risk_manager role + tier-enterprise tenant tier.
 *
 * Features:
 *  - Date-range selector: Last 3M / 6M / 12M
 *  - 6 KPI summary cards
 *  - 6 Chart.js visualisations
 *  - PDF export (jsPDF + html2canvas) — branded KINGA report
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
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
  Download,
  Loader2,
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

// ─── Helper: format currency ──────────────────────────────────────────────────
function fmtUSD(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

// ─── Date-range options ───────────────────────────────────────────────────────
const RANGE_OPTIONS = [
  { label: "Last 3M",  value: 3  as const },
  { label: "Last 6M",  value: 6  as const },
  { label: "Last 12M", value: 12 as const },
];

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

    const months        = [...new Set(data.map((d) => d.month))].sort();
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

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: ["Repeat Offenders", "First-Time"],
        datasets: [
          {
            data: [repeatCount, Math.max(0, totalCount - repeatCount)],
            backgroundColor: [RED, "#1E293B"],
            borderColor: ["#0F172A", "#0F172A"],
            borderWidth: 3,
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
        <p className="text-3xl font-bold text-white">{rate.toFixed(1)}%</p>
        <p className="text-sm text-slate-400">Repeat offender rate</p>
        <p className="text-xs text-slate-500">{repeatCount} of {totalCount} TP cases</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="text-xs text-slate-400">Known repeat third-parties</span>
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
            label: "Avg Days to Settlement",
            data: data.map((d) => Math.round(d.avgDays)),
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
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
        <Lock size={28} className="text-amber-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Enterprise Feature</h2>
        <p className="text-slate-400 text-sm max-w-md">
          Risk Manager Analytics is available on the <strong className="text-amber-400">Enterprise tier</strong>.
          Upgrade to unlock own-book motor intelligence, fraud benchmarking, and recovery exposure reporting.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-slate-400 max-w-sm">
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Claims frequency trends</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Repair cost benchmarking</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> Fraud flag rate by type</p>
        <p className="flex items-center gap-2"><span className="text-teal-400">✓</span> TP recovery exposure</p>
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

// ─── PDF Export ───────────────────────────────────────────────────────────────
async function exportToPDF(
  contentRef: React.RefObject<HTMLDivElement>,
  months: number,
  tenantId: string | undefined,
) {
  const { jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const el = contentRef.current;
  if (!el) return;

  // Capture the dashboard content as a canvas image
  const canvas = await html2canvas(el, {
    backgroundColor: "#0F172A",
    scale: 1.5,
    useCORS: true,
    logging: false,
  });

  const imgData   = canvas.toDataURL("image/png");
  const pageW     = 297; // A4 landscape mm
  const pageH     = 210;
  const margin    = 14;
  const headerH   = 18;
  const footerH   = 10;
  const usableW   = pageW - margin * 2;
  const usableH   = pageH - headerH - footerH - margin * 2;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── Brand header bar ──
  doc.setFillColor(20, 83, 45); // green-900
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("KINGA  ·  AutoVerify AI", margin, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Risk Manager Analytics  ·  Last ${months} months`, pageW / 2, 11, { align: "center" });
  doc.text(new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }), pageW - margin, 11, { align: "right" });

  // ── Tenant + range subtitle ──
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, headerH, pageW, 8, "F");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Tenant: ${tenantId ?? "Enterprise"}  ·  Date range: Last ${months} months  ·  Own-book data only`, margin, headerH + 5.5);

  // ── Dashboard image ──
  const imgAspect = canvas.width / canvas.height;
  const imgH      = Math.min(usableH, usableW / imgAspect);
  const imgW      = imgH * imgAspect;
  const imgX      = margin + (usableW - imgW) / 2;
  const imgY      = headerH + 8 + margin / 2;

  doc.addImage(imgData, "PNG", imgX, imgY, imgW, imgH);

  // ── Footer ──
  const footerY = pageH - footerH + 3;
  doc.setFillColor(20, 83, 45);
  doc.rect(0, pageH - footerH, pageW, footerH, "F");
  doc.setFontSize(7);
  doc.setTextColor(134, 239, 172); // green-300
  doc.text("Confidential — For internal use only", margin, footerY);
  doc.setTextColor(255, 255, 255);
  doc.text("kinga.ai", pageW - margin, footerY, { align: "right" });

  doc.save(`kinga-risk-analytics-${months}m-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RiskManagerAnalytics() {
  const { user } = useAuth();
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = trpc.analytics.getRiskManagerKPIs.useQuery(
    { months },
    { retry: false },
  );

  // Derive summary KPIs from raw data
  const summaryKpis = useMemo(() => {
    if (!data) return null;

    const totalClaims = data.claimsFrequency.reduce((s, r) => s + r.claimCount, 0);

    const totalCost  = data.repairCostByAge.reduce((s, r) => s + r.avgCost * r.claimCount, 0);
    const totalCount = data.repairCostByAge.reduce((s, r) => s + r.claimCount, 0);
    const avgRepairCost = totalCount > 0 ? totalCost / totalCount : 0;

    const highFraud = data.fraudRateByType.filter((r) => r.fraudRiskLevel === "high").reduce((s, r) => s + r.count, 0);
    const allFraud  = data.fraudRateByType.reduce((s, r) => s + r.count, 0);
    const fraudRate = allFraud > 0 ? Math.round((highFraud / allFraud) * 1000) / 10 : 0;

    const totalQuantum = data.recoveryExposure.reduce((s, r) => s + r.totalQuantum, 0);

    const totalDays   = data.settlementCycleTime.reduce((s, r) => s + r.avgDays * r.closedCount, 0);
    const totalClosed = data.settlementCycleTime.reduce((s, r) => s + r.closedCount, 0);
    const avgCycleDays = totalClosed > 0 ? Math.round(totalDays / totalClosed) : 0;

    return { totalClaims, avgRepairCost, fraudRate, totalQuantum, avgCycleDays };
  }, [data]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportToPDF(contentRef, months, user?.tenantId);
    } finally {
      setExporting(false);
    }
  }, [months, user?.tenantId]);

  // Tier gate — FORBIDDEN with TIER_UPGRADE_REQUIRED message
  const isTierGated =
    error?.data?.code === "FORBIDDEN" &&
    (error.message?.includes("TIER_UPGRADE_REQUIRED") || error.message?.includes("Enterprise"));

  // Role gate
  const isRoleGated =
    error?.data?.code === "FORBIDDEN" && !isTierGated;

  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === months)?.label ?? `Last ${months}M`;

  return (
    <InsurerPortalLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp size={20} className="text-teal-400" />
              Risk Manager Analytics
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Own-book motor intelligence · {user?.tenantId ?? "Enterprise"} · {rangeLabel}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Date-range selector */}
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMonths(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    months === opt.value
                      ? "bg-teal-600 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>

            {/* PDF Export — only shown when data is loaded */}
            {data && !isTierGated && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-600 border border-teal-600 rounded-lg transition-colors disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                {exporting ? "Exporting…" : "Download Report"}
              </button>
            )}
          </div>
        </div>

        {/* ── Tier gate ──────────────────────────────────────────────────── */}
        {isTierGated && <TierUpgradeGate />}

        {/* ── Role gate ──────────────────────────────────────────────────── */}
        {isRoleGated && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
            <AlertTriangle size={32} className="text-amber-400" />
            <p className="text-white font-semibold">Risk Manager role required</p>
            <p className="text-slate-400 text-sm">This page is only accessible to users with the Risk Manager role.</p>
          </div>
        )}

        {/* ── Loading skeletons ───────────────────────────────────────────── */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 h-28 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Dashboard content (captured for PDF) ───────────────────────── */}
        {data && summaryKpis && !isTierGated && (
          <div ref={contentRef} className="space-y-6">

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <KpiCard
                icon={Car}
                label={`Claims (${rangeLabel})`}
                value={summaryKpis.totalClaims.toLocaleString()}
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
                label={`TP Exposure (${rangeLabel})`}
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
                subtitle={`Stacked monthly count — ${rangeLabel}`}
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
                subtitle={`Quantum claimed vs recovered — ${rangeLabel}`}
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
                subtitle={`Average days from submission to closure — ${rangeLabel}`}
              >
                <CycleTimeChart data={data.settlementCycleTime} />
              </ChartBox>
            </div>

            {/* Footer note */}
            <p className="text-xs text-slate-600 text-right">
              Data is tenant-isolated · Own-book only · Refreshed on demand
            </p>
          </div>
        )}
      </div>
    </InsurerPortalLayout>
  );
}
