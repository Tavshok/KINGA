/**
 * ForensicCharts — Chart.js visualisations for ForensicDecisionPanel
 *
 * Components:
 *   - CostComparisonChart: horizontal bar comparing quote, AI estimate, agreed cost
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
    const isDark = document.documentElement.classList.contains("dark");
    return {
      text: isDark ? "#e5e7eb" : "#1f2937",
      muted: isDark ? "#6b7280" : "#9ca3af",
      grid: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      green: isDark ? "#4ade80" : "#16a34a",
      amber: isDark ? "#fbbf24" : "#d97706",
      red: isDark ? "#f87171" : "#dc2626",
      purple: isDark ? "#c084fc" : "#9333ea",
      blue: isDark ? "#60a5fa" : "#2563eb",
      orange: isDark ? "#fb923c" : "#ea580c",
      primary: isDark ? "#4ade80" : "#16a34a",
      bg: isDark ? "#1e1e1e" : "#ffffff",
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
    if (originalQuote > 0) list.push({ label: panelBeaterName ? `Quote (${panelBeaterName})` : "Panel Beater Quote", value: originalQuote, color: colors.blue });
    if (agreedCost > 0) list.push({ label: "Agreed Cost", value: agreedCost, color: colors.green });
    if (trueCost > 0 && trueCost !== agreedCost && trueCost !== originalQuote) list.push({ label: "True Cost (Engine)", value: trueCost, color: colors.primary });
    if (aiEstimate > 0) list.push({ label: "AI Estimate", value: aiEstimate, color: colors.muted });
    return list;
  }, [originalQuote, agreedCost, aiEstimate, trueCost, panelBeaterName, colors]);

  if (items.length === 0) return null;

  const data = {
    labels: items.map(i => i.label),
    datasets: [{
      data: items.map(i => i.value),
      backgroundColor: items.map(i => i.color),
      borderRadius: 4,
      barThickness: 28,
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
    <div style={{ height: `${Math.max(120, items.length * 50)}px` }}>
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
    <div className="relative" style={{ height: "200px" }}>
      <Doughnut data={data} options={options} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginRight: "100px" }}>
        <div className="text-center">
          <p className={`text-2xl font-black tabular-nums ${fraudScore <= 35 ? "text-green-600 dark:text-green-400" : fraudScore <= 60 ? "text-amber-600 dark:text-amber-400" : "text-purple-600 dark:text-purple-400"}`}>{fraudScore}</p>
          <p className="text-xs text-muted-foreground">/100</p>
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
      borderRadius: 4,
      barThickness: 32,
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
    <div style={{ height: "180px" }}>
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
    const color = score >= 80 ? (isDark ? "#4ade80" : "#16a34a") :
                  score >= 60 ? (isDark ? "#fbbf24" : "#d97706") :
                  (isDark ? "#f87171" : "#dc2626");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();

    // Score text
    ctx.fillStyle = isDark ? "#e5e7eb" : "#1f2937";
    ctx.font = `bold ${size * 0.18}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${score}`, cx, cy - 2);

    // Label
    ctx.fillStyle = isDark ? "#6b7280" : "#9ca3af";
    ctx.font = `${size * 0.08}px system-ui, sans-serif`;
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
