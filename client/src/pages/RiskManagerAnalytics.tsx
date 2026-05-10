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
 *  - Multi-page PDF export (jsPDF + canvas.toDataURL) — branded KINGA report
 *  - Send by Email dialog — delivers KPI summary via KINGA notification service
 */

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import InsurerPortalLayout from "@/components/InsurerPortalLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  Mail,
} from "lucide-react";
import Chart from "chart.js/auto";

// ─── Colour palette ───────────────────────────────────────────────────────────
const TEAL    = "#0D9488";
const AMBER   = "#D97706";
const RED     = "#DC2626";
const INDIGO  = "#4F46E5";
const EMERALD = "#059669";
const SLATE   = "#64748B";

const INCIDENT_COLORS: Record<string, string> = {
  collision:  TEAL,
  theft:      AMBER,
  hail:       INDIGO,
  fire:       RED,
  vandalism:  "#DB2777",
  flood:      "#2563EB",
  hijacking:  "#EA580C",
  other:      SLATE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

const RANGE_OPTIONS = [
  { label: "Last 3M",  value: 3  as const },
  { label: "Last 6M",  value: 6  as const },
  { label: "Last 12M", value: 12 as const },
];

// ─── Light chart options shared across charts ─────────────────────────────────
const LIGHT_GRID  = "#E2E8F0";
const LIGHT_TICKS = "#64748B";
const LIGHT_LEGEND = "#374151";

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className={color}><Icon className="h-4 w-4" /></span>
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────
function ChartBox({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="border-0 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Chart 1: Claims Frequency ────────────────────────────────────────────────
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
      data: months.map((m) => data.find((d) => d.incidentType === type && d.month === m)?.claimCount ?? 0),
      backgroundColor: INCIDENT_COLORS[type] ?? SLATE,
      borderRadius: 3,
    }));
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: { labels: months, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: LIGHT_LEGEND, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
          y: { stacked: true, ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 2: Repair Cost ─────────────────────────────────────────────────────
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
        datasets: [{ label: "Avg Repair Cost (USD)", data: sorted.map((d) => Math.round(d.avgCost)), backgroundColor: [EMERALD, TEAL, AMBER], borderRadius: 6 }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${fmtUSD(ctx.parsed.x ?? 0)}` } } },
        scales: {
          x: { ticks: { color: LIGHT_TICKS, callback: (v) => fmtUSD(Number(v)) }, grid: { color: LIGHT_GRID } },
          y: { ticks: { color: LIGHT_TICKS }, grid: { display: false } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 220 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 3: Fraud Rate ──────────────────────────────────────────────────────
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
      data: types.map((t) => data.find((d) => d.incidentType === t && d.fraudRiskLevel === level)?.count ?? 0),
      backgroundColor: levelColors[level as keyof typeof levelColors],
      borderRadius: 3,
    }));
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: { labels: types.map((t) => t.charAt(0).toUpperCase() + t.slice(1)), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: LIGHT_LEGEND, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
          y: { ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 4: Recovery Exposure ───────────────────────────────────────────────
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
          { label: "Quantum Claimed", data: data.map((d) => d.totalQuantum), borderColor: AMBER, backgroundColor: `${AMBER}22`, fill: true, tension: 0.4, pointRadius: 4 },
          { label: "Recovered",       data: data.map((d) => d.totalRecovered), borderColor: EMERALD, backgroundColor: `${EMERALD}22`, fill: true, tension: 0.4, pointRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: LIGHT_LEGEND, font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y ?? 0)}` } } },
        scales: {
          x: { ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
          y: { ticks: { color: LIGHT_TICKS, callback: (v) => fmtUSD(Number(v)) }, grid: { color: LIGHT_GRID } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

// ─── Chart 5: Repeat Offender ─────────────────────────────────────────────────
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
        datasets: [{ data: [repeatCount, Math.max(0, totalCount - repeatCount)], backgroundColor: [RED, "#E2E8F0"], borderColor: ["#fff", "#fff"], borderWidth: 3 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: "72%", plugins: { legend: { labels: { color: LIGHT_LEGEND, font: { size: 11 } } } } },
    });
    return () => { chartRef.current?.destroy(); };
  }, [repeatCount, totalCount]);

  return (
    <div className="flex items-center gap-8">
      <div style={{ height: 200, width: 200, flexShrink: 0 }}><canvas ref={canvasRef} /></div>
      <div className="flex flex-col gap-2">
        <p className="text-4xl font-bold">{rate.toFixed(1)}%</p>
        <p className="text-sm text-muted-foreground">Repeat offender rate</p>
        <p className="text-xs text-muted-foreground">{repeatCount} of {totalCount} TP cases</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          <span className="text-xs text-muted-foreground">Known repeat third-parties</span>
        </div>
      </div>
    </div>
  );
}

// ─── Chart 6: Cycle Time ──────────────────────────────────────────────────────
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
        datasets: [{ label: "Avg Days to Settlement", data: data.map((d) => Math.round(d.avgDays)), borderColor: INDIGO, backgroundColor: `${INDIGO}22`, fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: INDIGO }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} days` } } },
        scales: {
          x: { ticks: { color: LIGHT_TICKS }, grid: { color: LIGHT_GRID } },
          y: { ticks: { color: LIGHT_TICKS, callback: (v) => `${v}d` }, grid: { color: LIGHT_GRID } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data]);

  if (!data.length) return <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p>;
  return <div style={{ height: 260 }}><canvas ref={canvasRef} /></div>;
}

// ─── Tier Upgrade Gate ────────────────────────────────────────────────────────
function TierUpgradeGate() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
        <Lock size={28} className="text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2">Enterprise Feature</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Risk Manager Analytics is available on the <strong className="text-amber-600">Enterprise tier</strong>.
          Upgrade to unlock own-book motor intelligence, fraud benchmarking, and recovery exposure reporting.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground max-w-sm">
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> Claims frequency trends</p>
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> Repair cost benchmarking</p>
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> Fraud flag rate by type</p>
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> TP recovery exposure</p>
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> Repeat offender intelligence</p>
        <p className="flex items-center gap-2"><span className="text-teal-600">✓</span> Settlement cycle time benchmarking</p>
      </div>
      <a
        href="mailto:sales@kinga.ai?subject=Enterprise%20Tier%20Upgrade%20Request"
        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-lg text-sm transition-colors"
      >
        Contact Sales to Upgrade
      </a>
    </div>
  );
}

// ─── PDF Export (multi-page) ──────────────────────────────────────────────────
/**
 * Strategy: render each chart canvas to a base64 PNG via canvas.toDataURL(),
 * then lay each chart on its own A4-landscape page with a full-width image,
 * a data table, and a narrative insight. This avoids html2canvas squashing
 * the entire dashboard onto one page.
 *
 * Page structure:
 *  Page 1 — Cover / KPI Summary
 *  Page 2 — Claims Frequency by Incident Type
 *  Page 3 — Average Repair Cost by Vehicle Age
 *  Page 4 — Fraud Flag Rate by Claim Type
 *  Page 5 — Third-Party Recovery Exposure
 *  Page 6 — Repeat Offender Intelligence
 *  Page 7 — Settlement Cycle Time
 */
async function exportMultiPagePDF(
  chartCanvases: Record<string, HTMLCanvasElement | null>,
  months: number,
  tenantId: string | undefined,
  summaryKpis: {
    totalClaims: number;
    avgRepairCost: number;
    fraudRate: number;
    totalQuantum: number;
    avgCycleDays: number;
    repeatOffenderRate: number;
  },
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const W = 297;  // A4 landscape width mm
  const H = 210;  // A4 landscape height mm
  const M = 14;   // margin mm
  const HEADER_H = 16;
  const FOOTER_H = 10;
  const CONTENT_TOP = HEADER_H + 6;
  const CONTENT_BOTTOM = H - FOOTER_H - 4;
  const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;

  const rangeLabel = `Last ${months} months`;
  const dateStr = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  // Load KINGA logo
  let logoBase64 = "";
  try {
    const resp = await fetch("https://files.manuscdn.com/user_upload_by_module/session_file/310419663031527958/fNMYaMBMCPpWOMMQ.png");
    const blob = await resp.blob();
    logoBase64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  } catch { /* graceful degradation */ }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function drawHeader(subtitle: string) {
    doc.setFillColor(20, 83, 45);
    doc.rect(0, 0, W, HEADER_H, "F");
    if (logoBase64) {
      try { doc.addImage(logoBase64, "PNG", 5, 2, 12, 12); } catch { /* ignore */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("KINGA", 20, 10);
    doc.setFontSize(8);
    doc.setTextColor(134, 239, 172);
    doc.text("|", 36, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(209, 250, 229);
    doc.text(subtitle, 41, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(134, 239, 172);
    doc.text("CONFIDENTIAL", W - M, 10, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  function drawFooter(pageNum: number, total: number) {
    const y = H - 4;
    doc.setDrawColor(51, 65, 85);
    doc.line(M, H - FOOTER_H, W - M, H - FOOTER_H);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`KINGA Intelligence  ·  Risk Manager Analytics  ·  ${rangeLabel}  ·  Tenant: ${tenantId ?? "Enterprise"}  ·  ${dateStr}`, M, y);
    doc.text(`Page ${pageNum} of ${total}`, W - M, y, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  function drawSectionTitle(title: string, subtitle: string) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(title, M, CONTENT_TOP + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, M, CONTENT_TOP + 15);
    doc.setTextColor(0, 0, 0);
  }

  function addChartImage(canvasEl: HTMLCanvasElement | null, x: number, y: number, w: number, h: number) {
    if (!canvasEl) return;
    try {
      const imgData = canvasEl.toDataURL("image/png");
      doc.addImage(imgData, "PNG", x, y, w, h);
    } catch { /* ignore */ }
  }

  const TOTAL_PAGES = 7;

  // ── Page 1: Cover / KPI Summary ──────────────────────────────────────────────
  drawHeader("Risk Manager Analytics Report");

  // Dark background panel on cover page only
  doc.setFillColor(15, 23, 42);
  doc.rect(0, HEADER_H, W, H - HEADER_H, "F");

  // Report title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("Risk Manager Analytics", M, CONTENT_TOP + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`${rangeLabel}  ·  Tenant: ${tenantId ?? "Enterprise"}  ·  Generated: ${dateStr}`, M, CONTENT_TOP + 22);

  // Thin accent line
  doc.setDrawColor(20, 184, 166);
  doc.setLineWidth(0.8);
  doc.line(M, CONTENT_TOP + 26, M + 80, CONTENT_TOP + 26);
  doc.setLineWidth(0.2);

  // KPI grid — 3 columns × 2 rows
  const kpis = [
    { label: `Total Claims (${rangeLabel})`,      value: summaryKpis.totalClaims.toLocaleString(),          color: [20, 184, 166] as [number,number,number] },
    { label: "Average Repair Cost",               value: fmtUSD(summaryKpis.avgRepairCost),                 color: [16, 185, 129] as [number,number,number] },
    { label: "High Fraud Rate",                   value: `${summaryKpis.fraudRate.toFixed(1)}%`,            color: [239, 68, 68]  as [number,number,number] },
    { label: `TP Exposure (${rangeLabel})`,       value: fmtUSD(summaryKpis.totalQuantum),                  color: [245, 158, 11] as [number,number,number] },
    { label: "Repeat Offender Rate",              value: `${summaryKpis.repeatOffenderRate.toFixed(1)}%`,   color: [239, 68, 68]  as [number,number,number] },
    { label: "Avg Settlement Cycle",              value: `${summaryKpis.avgCycleDays} days`,                color: [99, 102, 241] as [number,number,number] },
  ];

  const cardW = (W - M * 2 - 10) / 3;
  const cardH = 32;
  const cardStartY = CONTENT_TOP + 34;
  const cardGap = 5;

  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (cardW + cardGap);
    const y = cardStartY + row * (cardH + cardGap);

    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, "F");
    doc.setFillColor(...kpi.color);
    doc.roundedRect(x, y, 3, cardH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label.toUpperCase(), x + 7, y + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(kpi.value, x + 7, y + 23);
  });

  // Table of contents
  const tocY = cardStartY + 2 * (cardH + cardGap) + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 184, 166);
  doc.text("REPORT CONTENTS", M, tocY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const sections = [
    "Page 2 — Claims Frequency by Incident Type",
    "Page 3 — Average Repair Cost by Vehicle Age",
    "Page 4 — Fraud Flag Rate by Claim Type",
    "Page 5 — Third-Party Recovery Exposure",
    "Page 6 — Repeat Offender Intelligence",
    "Page 7 — Settlement Cycle Time",
  ];
  sections.forEach((s, i) => {
    doc.text(s, M + (i < 3 ? 0 : (W - M * 2) / 2 + 5), tocY + 6 + (i % 3) * 6);
  });

  drawFooter(1, TOTAL_PAGES);

  // ── Pages 2–7: One chart per page ────────────────────────────────────────────
  const chartPages: {
    key: string;
    title: string;
    subtitle: string;
    insight: string;
  }[] = [
    {
      key: "chart-claims",
      title: "Claims Frequency by Incident Type",
      subtitle: `Stacked monthly claim count — ${rangeLabel}`,
      insight: "This chart shows how claim volumes are distributed across incident types over the selected period. Peaks in specific months may indicate seasonal patterns or emerging risk concentrations.",
    },
    {
      key: "chart-repair",
      title: "Average Repair Cost by Vehicle Age",
      subtitle: "Weighted average approved repair amount (USD)",
      insight: "Older vehicles typically attract higher repair costs relative to their market value. Monitoring this metric helps identify underpriced premiums in specific vehicle age segments.",
    },
    {
      key: "chart-fraud",
      title: "Fraud Flag Rate by Claim Type",
      subtitle: "Low / Medium / High KINGA fraud risk level distribution",
      insight: "A high proportion of 'High' risk flags in any incident category warrants targeted investigation. This data feeds directly into the portfolio fraud exposure score.",
    },
    {
      key: "chart-recovery",
      title: "Third-Party Recovery Exposure",
      subtitle: `Quantum claimed vs amount recovered — ${rangeLabel}`,
      insight: "The gap between quantum claimed and amount recovered represents unrecovered exposure. A widening gap over time signals the need for enhanced recovery procedures or legal escalation.",
    },
    {
      key: "chart-repeat",
      title: "Repeat Offender Intelligence",
      subtitle: "Third-party repeat offender rate across recovery cases",
      insight: "Repeat third-party offenders represent a disproportionate share of recovery costs. Flagging these individuals early enables proactive case management and faster settlement.",
    },
    {
      key: "chart-cycle",
      title: "Settlement Cycle Time",
      subtitle: `Average days from claim submission to closure — ${rangeLabel}`,
      insight: "Cycle time is a key efficiency indicator. Sustained increases may point to bottlenecks in the assessment or approval pipeline, while decreases reflect operational improvements.",
    },
  ];

  chartPages.forEach(({ key, title, subtitle, insight }, idx) => {
    doc.addPage();

    // Dark background on chart pages for contrast
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, H, "F");

    drawHeader("Risk Manager Analytics Report");
    drawSectionTitle(title, subtitle);

    const chartY = CONTENT_TOP + 20;
    const chartH = CONTENT_H - 40;
    const chartW = W - M * 2;
    addChartImage(chartCanvases[key] ?? null, M, chartY, chartW, chartH);

    const insightY = chartY + chartH + 4;
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(M, insightY, chartW, 16, 2, 2, "F");
    doc.setDrawColor(20, 184, 166);
    doc.setLineWidth(0.5);
    doc.line(M, insightY, M, insightY + 16);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(20, 184, 166);
    doc.text("INSIGHT", M + 4, insightY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const lines = doc.splitTextToSize(insight, chartW - 8);
    doc.text(lines.slice(0, 2), M + 4, insightY + 12);

    drawFooter(idx + 2, TOTAL_PAGES);
  });

  doc.save(`kinga-risk-analytics-${months}m-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Send by Email Dialog ─────────────────────────────────────────────────────
function SendEmailDialog({
  open,
  onClose,
  defaultEmail,
  defaultName,
  months,
  summaryKpis,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmail: string;
  defaultName: string;
  months: 3 | 6 | 12;
  summaryKpis: {
    totalClaims: number;
    avgRepairCost: number;
    fraudRate: number;
    totalQuantum: number;
    avgCycleDays: number;
    repeatOffenderRate: number;
  };
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [name,  setName]  = useState(defaultName);

  const sendMutation = trpc.analytics.sendRiskAnalyticsReport.useMutation({
    onSuccess: () => {
      toast.success("Report sent successfully", {
        description: `KPI summary delivered to ${email}`,
      });
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to send report", { description: err.message });
    },
  });

  const handleSend = () => {
    if (!email.trim()) { toast.error("Please enter a recipient email address"); return; }
    sendMutation.mutate({
      months,
      recipientEmail: email.trim(),
      recipientName: name.trim() || undefined,
      summaryKpis,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={18} className="text-teal-600" />
            Send Report by Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            The KPI summary for the <strong>Last {months} months</strong> will be delivered to the recipient's inbox via the KINGA notification service.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Recipient Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Recipient Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. jane@insurer.com"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* KPI preview */}
          <div className="bg-muted/40 border border-border rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold mb-2">KPIs included in this report</p>
            {[
              [`Total Claims (Last ${months}M)`, summaryKpis.totalClaims.toLocaleString()],
              ["Avg Repair Cost",                fmtUSD(summaryKpis.avgRepairCost)],
              ["High Fraud Rate",                `${summaryKpis.fraudRate.toFixed(1)}%`],
              [`TP Exposure (Last ${months}M)`,  fmtUSD(summaryKpis.totalQuantum)],
              ["Repeat Offender Rate",           `${summaryKpis.repeatOffenderRate.toFixed(1)}%`],
              ["Avg Cycle Time",                 `${summaryKpis.avgCycleDays} days`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {sendMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Mail size={14} className="mr-1.5" />}
            {sendMutation.isPending ? "Sending…" : "Send Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RiskManagerAnalytics() {
  const { user } = useAuth();
  const { fmt } = useTenantCurrency();
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [exporting, setExporting] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  // Refs to each chart's canvas element for PDF capture
  const chartRefs = useRef<Record<string, HTMLCanvasElement | null>>({
    "chart-claims":   null,
    "chart-repair":   null,
    "chart-fraud":    null,
    "chart-recovery": null,
    "chart-repeat":   null,
    "chart-cycle":    null,
  });

  const { data, isLoading, error, refetch } = trpc.analytics.getRiskManagerKPIs.useQuery(
    { months },
    { retry: false },
  );

  const summaryKpis = useMemo(() => {
    if (!data) return null;
    const totalClaims   = data.claimsFrequency.reduce((s: number, r: any) => s + r.claimCount, 0);
    const totalCost     = data.repairCostByAge.reduce((s: number, r: any) => s + r.avgCost * r.claimCount, 0);
    const totalCount    = data.repairCostByAge.reduce((s: number, r: any) => s + r.claimCount, 0);
    const avgRepairCost = totalCount > 0 ? totalCost / totalCount : 0;
    const highFraud     = data.fraudRateByType.filter((r: any) => r.fraudRiskLevel === "high").reduce((s: number, r: any) => s + r.count, 0);
    const allFraud      = data.fraudRateByType.reduce((s: number, r: any) => s + r.count, 0);
    const fraudRate     = allFraud > 0 ? Math.round((highFraud / allFraud) * 1000) / 10 : 0;
    const totalQuantum  = data.recoveryExposure.reduce((s: number, r: any) => s + r.totalQuantum, 0);
    const totalDays     = data.settlementCycleTime.reduce((s: number, r: any) => s + r.avgDays * r.closedCount, 0);
    const totalClosed   = data.settlementCycleTime.reduce((s: number, r: any) => s + r.closedCount, 0);
    const avgCycleDays  = totalClosed > 0 ? Math.round(totalDays / totalClosed) : 0;
    return {
      totalClaims,
      avgRepairCost,
      fraudRate,
      totalQuantum,
      avgCycleDays,
      repeatOffenderRate: data.repeatOffender.rate,
    };
  }, [data]);

  const handleExport = useCallback(async () => {
    if (!summaryKpis) return;
    setExporting(true);
    try {
      await exportMultiPagePDF(chartRefs.current, months, user?.tenantId ?? undefined, summaryKpis);
      toast.success("PDF downloaded", { description: `kinga-risk-analytics-${months}m report saved` });
    } catch (e) {
      toast.error("Export failed", { description: String(e) });
    } finally {
      setExporting(false);
    }
  }, [months, user?.tenantId, summaryKpis]);

  const isTierGated =
    error?.data?.code === "FORBIDDEN" &&
    (error.message?.includes("TIER_UPGRADE_REQUIRED") || error.message?.includes("Enterprise"));

  const isRoleGated = error?.data?.code === "FORBIDDEN" && !isTierGated;

  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === months)?.label ?? `Last ${months}M`;

  return (
    <InsurerPortalLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp size={20} className="text-teal-600" />
              Risk Manager Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Own-book motor intelligence · {user?.tenantId ?? "Enterprise"} · {rangeLabel}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date-range selector */}
            <div className="flex items-center bg-muted border border-border rounded-lg overflow-hidden">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMonths(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    months === opt.value
                      ? "bg-teal-600 text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 px-3 text-xs"
            >
              <RefreshCw size={12} className={`mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            {/* Export controls — only when data is loaded */}
            {data && !isTierGated && (
              <>
                <Button
                  size="sm"
                  onClick={handleExport}
                  disabled={exporting}
                  className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {exporting ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Download size={12} className="mr-1.5" />}
                  {exporting ? "Exporting…" : "Download PDF"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => setEmailOpen(true)}
                  className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Mail size={12} className="mr-1.5" />
                  Send by Email
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Gates ──────────────────────────────────────────────────────── */}
        {isTierGated && <TierUpgradeGate />}
        {isRoleGated && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="font-semibold">Risk Manager role required</p>
            <p className="text-muted-foreground text-sm">This page is only accessible to users with the Risk Manager role.</p>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Dashboard ───────────────────────────────────────────────────── */}
        {data && summaryKpis && !isTierGated && (
          <div className="space-y-6">

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard icon={Car}        label={`Claims (${rangeLabel})`}      value={summaryKpis.totalClaims.toLocaleString()}                sub="Across all incident types"         color="text-teal-600"   />
              <KpiCard icon={TrendingUp} label="Avg Repair Cost"               value={fmtUSD(summaryKpis.avgRepairCost)}                       sub="Weighted across age buckets"       color="text-green-600"  />
              <KpiCard icon={ShieldAlert} label="High Fraud Rate"              value={`${summaryKpis.fraudRate}%`}                             sub="Of assessed claims"                color="text-red-600"    />
              <KpiCard icon={Target}     label={`TP Exposure (${rangeLabel})`} value={fmtUSD(summaryKpis.totalQuantum)}                        sub="Total quantum claimed"             color="text-orange-600" />
              <KpiCard icon={Users}      label="Repeat Offenders"              value={`${data.repeatOffender.rate.toFixed(1)}%`}               sub={`${data.repeatOffender.repeatCount} of ${data.repeatOffender.totalCount} TP cases`} color="text-red-600"    />
              <KpiCard icon={Clock}      label="Avg Cycle Time"                value={`${summaryKpis.avgCycleDays}d`}                          sub="Submission to settlement"          color="text-purple-600" />
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox id="chart-claims-box" title="Claims Frequency by Incident Type" subtitle={`Stacked monthly count — ${rangeLabel}`}>
                <ClaimsFrequencyChart data={data.claimsFrequency} />
              </ChartBox>
              <ChartBox id="chart-fraud-box" title="Fraud Flag Rate by Claim Type" subtitle="Low / Medium / High risk level distribution">
                <FraudRateChart data={data.fraudRateByType} />
              </ChartBox>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox id="chart-repair-box" title="Average Repair Cost by Vehicle Age" subtitle="Weighted average approved amount (USD)">
                <RepairCostChart data={data.repairCostByAge} />
              </ChartBox>
              <ChartBox id="chart-recovery-box" title="Third-Party Recovery Exposure" subtitle={`Quantum claimed vs recovered — ${rangeLabel}`}>
                <RecoveryExposureChart data={data.recoveryExposure} />
              </ChartBox>
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartBox id="chart-repeat-box" title="Repeat Offender Intelligence" subtitle="Third-party repeat offender rate across recovery cases">
                <RepeatOffenderChart
                  repeatCount={data.repeatOffender.repeatCount}
                  totalCount={data.repeatOffender.totalCount}
                  rate={data.repeatOffender.rate}
                />
              </ChartBox>
              <ChartBox id="chart-cycle-box" title="Settlement Cycle Time" subtitle={`Average days from submission to closure — ${rangeLabel}`}>
                <CycleTimeChart data={data.settlementCycleTime} />
              </ChartBox>
            </div>

            <p className="text-xs text-muted-foreground text-right">
              Data is tenant-isolated · Own-book only · Refreshed on demand
            </p>
          </div>
        )}

        {/* ── Hidden canvas capture layer for PDF ─────────────────────────── */}
        {data && !isTierGated && (
          <ChartCanvasCapture
            chartRefs={chartRefs}
            data={data}
            months={months}
          />
        )}
      </div>

      {/* ── Email Dialog ──────────────────────────────────────────────────── */}
      {summaryKpis && (
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          defaultEmail={user?.email ?? ""}
          defaultName={user?.name ?? ""}
          months={months}
          summaryKpis={summaryKpis}
        />
      )}
    </InsurerPortalLayout>
  );
}

// ─── Canvas Capture Helper ────────────────────────────────────────────────────
/**
 * After charts mount, locate their canvas elements in the DOM and store
 * references so the PDF exporter can call canvas.toDataURL() directly.
 * Each ChartBox has an id like "chart-claims-box"; the canvas is inside it.
 */
function ChartCanvasCapture({
  chartRefs,
  data,
  months,
}: {
  chartRefs: React.MutableRefObject<Record<string, HTMLCanvasElement | null>>;
  data: unknown;
  months: number;
}) {
  useEffect(() => {
    const mapping: Record<string, string> = {
      "chart-claims":   "chart-claims-box",
      "chart-fraud":    "chart-fraud-box",
      "chart-repair":   "chart-repair-box",
      "chart-recovery": "chart-recovery-box",
      "chart-repeat":   "chart-repeat-box",
      "chart-cycle":    "chart-cycle-box",
    };
    // Small delay to ensure Chart.js has finished rendering
    const timer = setTimeout(() => {
      Object.entries(mapping).forEach(([key, boxId]) => {
        const box = document.getElementById(boxId);
        if (box) {
          const canvas = box.querySelector("canvas");
          chartRefs.current[key] = canvas ?? null;
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [data, months, chartRefs]);

  return null;
}
