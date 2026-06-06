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
      text: "#111827",
      muted: "#374151",
      grid: "rgba(0,0,0,0.08)",
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
    if (aiEstimate > 0 && aiEstimate !== trueCost) list.push({ label: "KINGA Estimate", value: aiEstimate, color: "#0891b2" }); // teal — distinct from black muted
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
          color: colors.text,
          font: { size: 12, weight: 'bold' as const },
          callback: (v: any) => `${currencySymbol}${Number(v).toLocaleString()}`,
          maxTicksLimit: 6,
        },
      },
      y: {
        grid: { display: false },
        ticks: { color: colors.text, font: { size: 12, weight: 'bold' as const } },
      },
    },
  };

  return (
    <div style={{ height: `${Math.max(110, items.length * 42)}px` }}>
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
          <p style={{ fontFamily: "'DM Sans',Inter,sans-serif", fontSize: 22, fontWeight: 700, color: fraudScore <= 35 ? '#16a34a' : fraudScore <= 60 ? '#d97706' : '#c0392b', lineHeight: 1 }}>{fraudScore}</p>
          <p style={{ fontFamily: "'DM Sans',Inter,sans-serif", fontSize: 10, color: '#374151', fontWeight: 600 }}>/100</p>
        </div>
      </div>
    </div>
  );
}

// ─── Damage Severity Distribution Chart ──────────────────────────────────────

interface DamageSeverityChartProps {
  components: Array<{ name?: string; component?: string; severity?: string }>;
}

/**
 * DamageSeverityChart — horizontal stacked bar.
 * Each severity band is a proportional segment of the full bar.
 * Inline count labels appear inside segments wide enough to hold them.
 * A compact legend row sits below the bar.
 *
 * Design rationale: a single horizontal bar makes the severity distribution
 * immediately readable — the viewer sees at a glance which band dominates
 * without needing to read axis values.
 */
export function DamageSeverityChart({ components }: DamageSeverityChartProps) {
  const BANDS: Array<{ key: string; label: string; color: string; textColor: string }> = [
    { key: 'catastrophic', label: 'Catastrophic', color: '#ef4444', textColor: '#fff' },
    { key: 'severe',       label: 'Severe',       color: '#f97316', textColor: '#fff' },
    { key: 'moderate',     label: 'Moderate',     color: '#f59e0b', textColor: '#fff' },
    { key: 'minor',        label: 'Minor',        color: '#22c55e', textColor: '#fff' },
    { key: 'cosmetic',     label: 'Cosmetic',     color: '#3b82f6', textColor: '#fff' },
    { key: 'none',         label: 'None',         color: '#e2e8f0', textColor: '#64748b' },
  ];

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    BANDS.forEach(b => { map[b.key] = 0; });
    components.forEach(c => {
      const s = (c.severity ?? 'minor').toLowerCase().trim();
      if (s in map) map[s]++;
      else map['minor']++;
    });
    return map;
  }, [components]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const activeBands = BANDS.filter(b => counts[b.key] > 0);

  return (
    <div style={{ width: '100%' }}>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 36, borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {activeBands.map((band, i) => {
          const pct = (counts[band.key] / total) * 100;
          const showLabel = pct >= 10; // only label segments ≥10% wide
          return (
            <div
              key={band.key}
              title={`${band.label}: ${counts[band.key]} component${counts[band.key] !== 1 ? 's' : ''} (${Math.round(pct)}%)`}
              style={{
                width: `${pct}%`,
                background: band.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: i < activeBands.length - 1 ? '1px solid rgba(255,255,255,0.3)' : undefined,
                transition: 'width 0.3s ease',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {showLabel && (
                <span style={{ fontSize: 11, fontWeight: 700, color: band.textColor, whiteSpace: 'nowrap' }}>
                  {counts[band.key]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 }}>
        {activeBands.map(band => (
          <span key={band.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: band.color, flexShrink: 0 }} />
            <span style={{ color: '#334155' }}>
              {band.label}
              <span style={{ color: '#64748b', marginLeft: 3 }}>({counts[band.key]})</span>
            </span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>
          {total} component{total !== 1 ? 's' : ''} total
        </span>
      </div>
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
    ctx.font = `600 ${size * 0.18}px 'DM Sans',Inter,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${score}`, cx, cy - 2);

    // Label
    ctx.fillStyle = "#374151";
    ctx.font = `700 ${size * 0.09}px 'DM Sans',Inter,sans-serif`;
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
