import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, Shield, AlertCircle, Info } from "lucide-react";

// ─── Types (mirror fraud-scoring.ts) ─────────────────────────────────────────

interface TriggeredSignal {
  indicatorId: string;
  label: string;
  points: number;
  evidence: string;
}

interface IndicatorResult {
  id: string;
  name: string;
  maxPoints: number;
  score: number;
  triggered: boolean;
  signals: TriggeredSignal[];
  summary: string;
}

interface FraudScoreBreakdown {
  totalScore: number;
  riskLevel: "minimal" | "low" | "moderate" | "high" | "very_high";
  triggeredIndicatorCount: number;
  concentrationAlert: boolean;
  concentrationIndicator?: string;
  escalated: boolean;
  escalationReason?: string;
  indicators: IndicatorResult[];
  triggeredSignals: TriggeredSignal[];
  recommendedActions: string[];
}

// ─── Risk level config ────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  gaugeColor: string;
  textColor: string;
}> = {
  minimal:  { label: "Minimal Risk",   color: "bg-emerald-600", bgColor: "bg-emerald-50",  borderColor: "border-emerald-200", gaugeColor: "#10b981", textColor: "text-emerald-700" },
  low:      { label: "Low Risk",       color: "bg-green-600",   bgColor: "bg-green-50",    borderColor: "border-green-200",   gaugeColor: "#22c55e", textColor: "text-green-700" },
  moderate: { label: "Moderate Risk",  color: "bg-amber-600",   bgColor: "bg-amber-50",    borderColor: "border-amber-200",   gaugeColor: "#f59e0b", textColor: "text-amber-700" },
  high:     { label: "High Risk",      color: "bg-orange-600",  bgColor: "bg-orange-50",   borderColor: "border-orange-200",  gaugeColor: "#f97316", textColor: "text-orange-700" },
  very_high:{ label: "Very High Risk", color: "bg-red-700",     bgColor: "bg-red-50",      borderColor: "border-red-300",     gaugeColor: "#dc2626", textColor: "text-red-700" },
};

// ─── Indicator icon mapping ───────────────────────────────────────────────────

const INDICATOR_ICONS: Record<string, string> = {
  physics_mismatch:      "⚡",
  claimant_driver_risk:  "🧑",
  staged_accident:       "🎭",
  panel_beater_patterns: "🔧",
  assessor_integrity:    "📋",
  collusion_network:     "🕸️",
  document_integrity:    "📄",
  cost_anomalies:        "💰",
  vehicle_ownership:     "🚗",
  claim_timing:          "⏱️",
};

// ─── Semicircular Gauge ───────────────────────────────────────────────────────

function FraudGauge({ score, riskLevel }: { score: number; riskLevel: string }) {
  const cfg = RISK_CONFIG[riskLevel] ?? RISK_CONFIG.minimal;
  // SVG semicircle: radius 80, center (100, 100), arc from 180° to 0°
  const r = 80;
  const cx = 100;
  const cy = 100;
  const circumference = Math.PI * r; // half circle
  const dashOffset = circumference * (1 - score / 100);

  // Zone markers at 20, 50, 75
  const angleForScore = (s: number) => Math.PI - (s / 100) * Math.PI;
  const markerAt = (s: number) => {
    const a = angleForScore(s);
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const m20 = markerAt(20);
  const m50 = markerAt(50);
  const m75 = markerAt(75);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-48 h-28">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={cfg.gaugeColor}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Zone markers */}
        {[m20, m50, m75].map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r="3" fill="#9ca3af" />
        ))}
        {/* Score text */}
        <text x={cx} y={cy - 10} textAnchor="middle" className="text-3xl font-bold" fontSize="28" fontWeight="bold" fill={cfg.gaugeColor}>
          {score}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#6b7280">
          out of 100
        </text>
      </svg>
      <div className={`px-4 py-1 rounded-full text-sm font-semibold ${cfg.color} text-white`}>
        {cfg.label}
      </div>
      {/* Zone labels */}
      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
        <span className="text-emerald-600">0–20 Minimal</span>
        <span>·</span>
        <span className="text-green-600">21–35 Low</span>
        <span>·</span>
        <span className="text-amber-600">36–50 Moderate</span>
        <span>·</span>
        <span className="text-orange-600">51–75 High</span>
        <span>·</span>
        <span className="text-red-700">76–100 Very High</span>
      </div>
    </div>
  );
}

// ─── Indicator Card ───────────────────────────────────────────────────────────

function IndicatorCard({ indicator }: { indicator: IndicatorResult }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((indicator.score / indicator.maxPoints) * 100);
  const icon = INDICATOR_ICONS[indicator.id] ?? "🔍";

  const barColor =
    pct >= 80 ? "bg-red-500" :
    pct >= 60 ? "bg-orange-500" :
    pct >= 40 ? "bg-amber-500" :
    pct >= 20 ? "bg-yellow-400" :
    "bg-emerald-400";

  return (
    <div className={`rounded-lg border p-3 ${indicator.triggered ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-70"}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{icon}</span>
          <span className="text-xs font-semibold text-slate-700 leading-tight">{indicator.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs font-bold text-slate-700">{indicator.score}</span>
          <span className="text-xs text-slate-400">/{indicator.maxPoints}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
        <div
          className={`h-1.5 rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-500 leading-snug">{indicator.summary}</p>

      {/* Expand button */}
      {indicator.signals.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide" : `View ${indicator.signals.length} signal${indicator.signals.length > 1 ? "s" : ""}`}
        </button>
      )}

      {/* Expanded signals */}
      {expanded && indicator.signals.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t pt-2">
          {indicator.signals.map((sig, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-red-600 shrink-0 mt-0.5">+{sig.points}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700">{sig.label}</p>
                <p className="text-xs text-slate-500 leading-snug">{sig.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface FraudScorePanelProps {
  aiAssessment: any;
}

export default function FraudScorePanel({ aiAssessment }: FraudScorePanelProps) {
  // Parse fraudScoreBreakdownJson
  let breakdown: FraudScoreBreakdown | null = null;
  try {
    const raw = (aiAssessment as any)?.fraudScoreBreakdownJson;
    if (raw) {
      breakdown = typeof raw === "string" ? JSON.parse(raw) : raw;
    }
  } catch { /* ignore */ }

  // Fallback: build a minimal display from legacy fields
  if (!breakdown) {
    const legacyScore = (aiAssessment as any)?.fraudRiskScore ?? 0;
    const legacyLevel = (aiAssessment as any)?.fraudRiskLevel ?? "minimal";
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-4">
          <FraudGauge score={legacyScore} riskLevel={legacyLevel} />
          <p className="text-xs text-muted-foreground mt-3">
            Detailed 10-indicator breakdown will appear after the next AI assessment re-run.
          </p>
        </div>
      </div>
    );
  }

  const cfg = RISK_CONFIG[breakdown.riskLevel] ?? RISK_CONFIG.minimal;

  // Sort indicators: triggered first, then by score desc
  const sortedIndicators = [...breakdown.indicators].sort((a, b) => {
    if (a.triggered !== b.triggered) return a.triggered ? -1 : 1;
    return b.score - a.score;
  });

  return (
    <div className="space-y-5">
      {/* ── Gauge + summary row ── */}
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
        <div className="shrink-0">
          <FraudGauge score={breakdown.totalScore} riskLevel={breakdown.riskLevel} />
        </div>
        <div className="flex-1 space-y-3">
          {/* Triggered count */}
          <div className={`p-3 rounded-lg border ${cfg.bgColor} ${cfg.borderColor}`}>
            <p className={`text-sm font-semibold ${cfg.textColor}`}>
              {breakdown.triggeredIndicatorCount} of 10 indicators triggered
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Score: <strong>{breakdown.totalScore}/100</strong> — {cfg.label}
            </p>
          </div>

          {/* Escalation banner */}
          {breakdown.escalated && breakdown.escalationReason && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-800">Risk Escalated</p>
                <p className="text-xs text-orange-700">{breakdown.escalationReason}</p>
              </div>
            </div>
          )}

          {/* Concentration alert */}
          {breakdown.concentrationAlert && breakdown.concentrationIndicator && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800">Concentration Alert</p>
                <p className="text-xs text-red-700">
                  A single indicator is driving the score: <strong>{breakdown.concentrationIndicator}</strong>. Verify this domain independently.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 10-Indicator Grid ── */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Indicator Breakdown
          <span className="text-xs text-muted-foreground font-normal">(click any card to expand signals)</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {sortedIndicators.map(ind => (
            <IndicatorCard key={ind.id} indicator={ind} />
          ))}
        </div>
      </div>

      {/* ── Recommended Actions ── */}
      {breakdown.recommendedActions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            Recommended Actions
          </h4>
          <div className="space-y-2">
            {breakdown.recommendedActions.map((action, i) => {
              const isUrgent = action.startsWith("IMMEDIATE") || action.startsWith("ESCALATE") || action.startsWith("FLAG");
              const isAmber  = action.startsWith("VERIFY") || action.startsWith("REQUEST") || action.startsWith("CROSS-CHECK");
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                    isUrgent ? "bg-red-50 border-red-200 text-red-800" :
                    isAmber  ? "bg-amber-50 border-amber-200 text-amber-800" :
                    "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <span className={`shrink-0 font-bold text-xs mt-0.5 ${isUrgent ? "text-red-600" : isAmber ? "text-amber-600" : "text-slate-500"}`}>
                    {i + 1}.
                  </span>
                  <span className="leading-snug">{action}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── All triggered signals summary ── */}
      {breakdown.triggeredSignals.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-primary font-medium flex items-center gap-1 select-none">
            <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
            View all {breakdown.triggeredSignals.length} triggered signals
          </summary>
          <div className="mt-2 space-y-1 pl-4 border-l-2 border-primary/20">
            {breakdown.triggeredSignals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge variant="destructive" className="text-xs shrink-0 mt-0.5">+{sig.points}</Badge>
                <div>
                  <p className="text-xs font-medium">{sig.label}</p>
                  <p className="text-xs text-muted-foreground">{sig.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
