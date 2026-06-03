/**
 * ForensicCharts — Chart.js visualisations for ForensicDecisionPanel
 *
 * Components:
 *   - CostComparisonChart: horizontal bar comparing quote, KINGA estimate, agreed cost
 *   - FraudBreakdownChart: doughnut showing fraud indicator weights
 *   - DamageSeverityChart: bar chart of component severity distribution
 *   - ConfidenceGauge: semi-circular gauge for pipeline confidence score
 */
import { useMemo, useRef, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

// ─── Theme-aware colors ──────────────────────────────────────────────────────

function useChartColors() {
  return useMemo(() => {
    // Always use the new design system tokens — report is always light
    return {
      text: "#1a1916",
      muted: "#6b6862",
      grid: "rgba(0,0,0,0.06)",
      green: "#16a34a",
      amber: "#d97706",
      red: "#c0392b",
      purple: "#7c3aed",
      blue: "#1d4ed8",
      orange: "#c2410c",
      primary: "#0a0a0a",
      bg: "#ffffff",
    };
  }, []);
}

// ─── Cost Comparison Chart ───────────────────────────────────────────────────

interface CostComparisonChartProps {
  originalQuote: number;
  agreedCost: number;
  aiEstimate: number;
  trueCost: number;
  panelBeaterName?: string | null;
  currencySymbol?: string;
}

export function CostComparisonChart({
  originalQuote,
  agreedCost,
  aiEstimate,
  trueCost,
  panelBeaterName,
  currencySymbol = "$",
}: CostComparisonChartProps) {
  const colors = useChartColors();

  const items = useMemo(() => {
    const list: { label: string; value: number; color: string }[] = [];
    if (originalQuote > 0) list.push({ label: panelBeaterName ? `Lowest Quote (${panelBeaterName})` : "Lowest Submitted Quote", value: originalQuote, color: colors.blue });
    if (trueCost > 0 && trueCost !== originalQuote) list.push({ label: "KINGA Optimised", value: trueCost, color: colors.primary });
    if (aiEstimate > 0 && aiEstimate !== trueCost) list.push({ label: "KINGA Estimate", value: aiEstimate, color: colors.muted });
    return list;
  }, [originalQuote, aiEstimate, trueCost, panelBeaterName, colors]);

  if (items.length === 0) return null;

  const data = {
    labels: items.map(i => i.label),
    datasets: [{
      data: items.map(i => i.value),
      backgroundColor: items.map(i => i.color),
      borderRadius: 0,
      barThickness: 22,
    }],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${currencySymbol}${ctx.raw.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: colors.grid },
        ticks: {
          color: colors.muted,
          callback: (v: any) => `${currencySymbol}${Number(v).toLocaleString()}`,
        },
      },
      y: {
        grid: { display: false },
        ticks: { color: colors.text, font: { size: 12 } },
      },
    },
  };

  return (
    <div style={{ height: `${Math.max(90, items.length * 36)}px` }}>
      <Bar data={data} options={options} />
    </div>
  );
}

// ─── Fraud Breakdown Chart ───────────────────────────────────────────────────

interface FraudBreakdownChartProps {
  fraudScore: number;
  indicators: Array<{ indicator?: string; label?: string; weight?: number; score?: number }>;
}

export function FraudBreakdownChart({ fraudScore, indicators }: FraudBreakdownChartProps) {
  const colors = useChartColors();

  const items = useMemo(() => {
    if (indicators.length === 0) return [];
    return indicators.slice(0, 6).map((ind, i) => ({
      label: ind.indicator ?? ind.label ?? `Indicator ${i + 1}`,
      value: ind.weight ?? ind.score ?? 10,
    }));
  }, [indicators]);

  if (items.length === 0) return null;

  const remaining = Math.max(0, 100 - items.reduce((s, i) => s + i.value, 0));

  const palette = [colors.purple, colors.red, colors.amber, colors.orange, colors.blue, "#a78bfa"];

  const data = {
    labels: [...items.map(i => i.label), ...(remaining > 0 ? ["Baseline"] : [])],
    datasets: [{
      data: [...items.map(i => i.value), ...(remaining > 0 ? [remaining] : [])],
      backgroundColor: [...items.map((_, i) => palette[i % palette.length]), ...(remaining > 0 ? [colors.grid] : [])],
      borderWidth: 0,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "60%",
    plugins: {
      legend: {
        position: "right" as const,
        labels: { color: colors.text, font: { size: 11 }, padding: 8 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.label}: ${ctx.raw} pts`,
        },
      },
    },
  };

  return (
    <div className="relative" style={{ height: "150px" }}>
      <Doughnut data={data} options={options} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginRight: "80px" }}>
        <div className="text-center">
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 22, fontWeight: 500, color: fraudScore <= 35 ? '#16a34a' : fraudScore <= 60 ? '#d97706' : '#c0392b', lineHeight: 1 }}>{fraudScore}</p>
          <p style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: '#6b6862' }}>/100</p>
        </div>
      </div>
    </div>
  );
}

// ─── Damage Severity Distribution Chart ──────────────────────────────────────

interface DamageSeverityChartProps {
  components: Array<{ name?: string; component?: string; severity?: string }>;
}

export function DamageSeverityChart({ components }: DamageSeverityChartProps) {
  const colors = useChartColors();

  const counts = useMemo(() => {
    const map: Record<string, number> = { cosmetic: 0, minor: 0, moderate: 0, severe: 0, catastrophic: 0 };
    components.forEach(c => {
      const s = (c.severity ?? "minor").toLowerCase();
      if (s in map) map[s]++;
      else map.minor++;
    });
    return Object.entries(map).filter(([_, v]) => v > 0);
  }, [components]);

  if (counts.length === 0) return null;

  const severityColors: Record<string, string> = {
    cosmetic: colors.blue,
    minor: colors.green,
    moderate: colors.amber,
    severe: colors.orange,
    catastrophic: colors.red,
  };

  const data = {
    labels: counts.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)),
    datasets: [{
      data: counts.map(([_, v]) => v),
      backgroundColor: counts.map(([k]) => severityColors[k] ?? colors.muted),
      borderRadius: 0,
      barThickness: 24,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.raw} component${ctx.raw > 1 ? "s" : ""}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: colors.text, font: { size: 11 } },
      },
      y: {
        grid: { color: colors.grid },
        ticks: { color: colors.muted, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  return (
    <div style={{ height: "140px" }}>
      <Bar data={data} options={options} />
    </div>
  );
}

// ─── Confidence Gauge ────────────────────────────────────────────────────────

interface ConfidenceGaugeProps {
  score: number;  // 0-100
  size?: number;
}

export function ConfidenceGauge({ score, size = 120 }: ConfidenceGaugeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = (size * 0.65) * dpr;
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.classList.contains("dark");
    const cx = size / 2;
    const cy = size * 0.55;
    const radius = size * 0.38;
    const lineWidth = size * 0.08;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    // Value arc
    const pct = Math.min(100, Math.max(0, score)) / 100;
    const endAngle = Math.PI + pct * Math.PI;
    const color = score >= 80 ? "#16a34a" :
                  score >= 60 ? "#d97706" :
                  "#c0392b";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    // Score text
    ctx.fillStyle = "#0a0a0a";
    ctx.font = `500 ${size * 0.18}px 'DM Mono',monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${score}`, cx, cy - 2);

    // Label
    ctx.fillStyle = "#6b6862";
    ctx.font = `400 ${size * 0.08}px 'DM Mono',monospace`;
    ctx.fillText("CONFIDENCE", cx, cy + size * 0.12);
  }, [score, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${size}px`, height: `${size * 0.65}px` }}
      aria-label={`Confidence score: ${score}/100`}
    />
  );
}
