/**
 * IntelligenceEnforcementPanel.tsx
 *
 * Displays the output of the KINGA Intelligence Enforcement Layer for a claim.
 *
 * Sections:
 *   1. Critical Alerts (top-3, severity-ranked)
 *   2. Physics Intelligence (estimated or real values + insight)
 *   3. Impact Consistency Analysis
 *   4. Direction vs Damage Validation
 *   5. Fair Cost Benchmark (always populated)
 *   6. Enforced Fraud Level (corrected label)
 */

import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, Info, Zap, DollarSign, Shield, ArrowRight } from "lucide-react";

// ─── Types (mirror server/intelligence-enforcement.ts) ───────────────────────

interface PhysicsEstimate {
  velocityRangeKmh: { min: number; max: number };
  estimatedVelocityKmh: number;
  impactForceKn: { min: number; max: number };
  energyKj: { min: number; max: number };
  deltaVKmh: number;
  estimated: true;
  basis: string;
  insight: string;
}

interface ImpactConsistencyFlag {
  flagged: boolean;
  score: number;
  anomalyLevel: "none" | "low" | "medium" | "high";
  explanation: string;
  fraudWeightIncrease: number;
}

interface DirectionDamageFlag {
  mismatch: boolean;
  impactDirection: string;
  damageZones: string[];
  explanation: string;
  possibleExplanations: string[];
}

interface CostBenchmark {
  estimatedFairMin: number;
  estimatedFairMax: number;
  estimatedFairMid: number;
  partsProjection: number;
  labourProjection: number;
  basis: string;
  confidence: "low" | "medium" | "high";
}

interface CriticalAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  engine: string;
}

interface EnforcementResult {
  fraudLevelEnforced: string;
  fraudLevelLabel: string;
  physicsEstimate: PhysicsEstimate | null;
  physicsInsight: string;
  consistencyFlag: ImpactConsistencyFlag;
  directionFlag: DirectionDamageFlag;
  costBenchmark: CostBenchmark;
  alerts: CriticalAlert[];
  fraudScoreAdjustment: number;
}

// ─── Alert severity config ────────────────────────────────────────────────────

const ALERT_CONFIG = {
  critical: {
    bg: "var(--fp-critical-bg)",
    border: "var(--fp-critical-border)",
    iconColor: "#f87171",
    labelColor: "#f87171",
    Icon: AlertTriangle,
    label: "CRITICAL",
  },
  warning: {
    bg: "var(--fp-warning-bg)",
    border: "var(--fp-warning-border)",
    iconColor: "#fbbf24",
    labelColor: "#fbbf24",
    Icon: AlertTriangle,
    label: "WARNING",
  },
  info: {
    bg: "var(--fp-info-bg)",
    border: "var(--fp-info-border)",
    iconColor: "#60a5fa",
    labelColor: "#60a5fa",
    Icon: Info,
    label: "INFO",
  },
};

const FRAUD_LEVEL_COLORS: Record<string, string> = {
  minimal:  "#10b981",
  low:      "#22c55e",
  moderate: "#f59e0b",
  high:     "#f97316",
  critical: "#dc2626",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "Low confidence — no quotes available",
  medium: "Medium confidence — limited data",
  high: "High confidence — multiple quotes",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: CriticalAlert }) {
  const cfg = ALERT_CONFIG[alert.severity];
  const { Icon } = cfg;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: cfg.labelColor }}>
            {cfg.label}
          </span>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            · {alert.engine}
          </span>
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{alert.title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{alert.detail}</p>
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4" style={{ color: "var(--primary)" }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{sub}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  claimId: number;
}

export default function IntelligenceEnforcementPanel({ claimId }: Props) {
  const { data: enforcement, isLoading } = trpc.aiAssessments.getEnforcement.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 rounded-lg" style={{ background: "var(--muted)" }}>
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Running Intelligence Enforcement Layer…</p>
      </div>
    );
  }

  if (!enforcement) {
    return (
      <div className="py-4 px-3 rounded-lg text-sm" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
        No AI assessment available — run the AI pipeline first to generate enforcement analysis.
      </div>
    );
  }

  const e = enforcement as EnforcementResult;
  const fraudColor = FRAUD_LEVEL_COLORS[e.fraudLevelEnforced] ?? "#6b7280";

  return (
    <div className="space-y-5">

      {/* ── 1. Critical Alerts ── */}
      {e.alerts.length > 0 && (
        <div>
          <SectionHeader
            icon={AlertTriangle}
            title="Critical Alerts"
            sub={`Top ${e.alerts.length} enforcement flag${e.alerts.length > 1 ? "s" : ""} — ranked by severity`}
          />
          <div className="space-y-2">
            {e.alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)}
          </div>
        </div>
      )}

      {/* ── 2. Physics Intelligence ── */}
      <div>
        <SectionHeader
          icon={Zap}
          title="Physics Intelligence"
          sub={e.physicsEstimate ? "Values estimated from delta-V — marked as inferred" : "Values from physics engine"}
        />
        {e.physicsInsight && (
          <div
            className="p-3 rounded-lg mb-3 text-sm leading-relaxed"
            style={{ background: "var(--fp-info-bg)", border: "1px solid var(--fp-info-border)", color: "var(--foreground)" }}
          >
            <span className="font-semibold text-xs uppercase tracking-wide" style={{ color: "var(--primary)" }}>
              Assessor Insight:{" "}
            </span>
            {e.physicsInsight}
          </div>
        )}
        {e.physicsEstimate && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox
              label="Est. Impact Speed"
              value={`${e.physicsEstimate.estimatedVelocityKmh} km/h`}
              sub={`Range: ${e.physicsEstimate.velocityRangeKmh.min}–${e.physicsEstimate.velocityRangeKmh.max} km/h`}
            />
            <MetricBox
              label="Impact Force"
              value={`${e.physicsEstimate.impactForceKn.min}–${e.physicsEstimate.impactForceKn.max} kN`}
              sub="Estimated range"
            />
            <MetricBox
              label="Energy Dissipated"
              value={`${e.physicsEstimate.energyKj.min}–${e.physicsEstimate.energyKj.max} kJ`}
              sub="Estimated range"
            />
            <MetricBox
              label="Delta-V"
              value={`${e.physicsEstimate.deltaVKmh} km/h`}
              sub="From physics engine"
            />
          </div>
        )}
        {!e.physicsEstimate && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: "var(--muted)" }}>
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Physics engine produced real values — no estimation required.
            </p>
          </div>
        )}
      </div>

      {/* ── 3. Impact Consistency ── */}
      <div>
        <SectionHeader
          icon={Zap}
          title="Impact Consistency Analysis"
          sub="Damage pattern vs reported impact direction"
        />
        <div
          className="p-3 rounded-lg"
          style={{
            background: e.consistencyFlag.flagged
              ? (e.consistencyFlag.anomalyLevel === "high" ? "var(--fp-critical-bg)" : "var(--fp-warning-bg)")
              : "var(--fp-success-bg)",
            border: `1px solid ${e.consistencyFlag.flagged
              ? (e.consistencyFlag.anomalyLevel === "high" ? "var(--fp-critical-border)" : "var(--fp-warning-border)")
              : "var(--fp-match-border)"}`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {e.consistencyFlag.flagged
              ? <AlertTriangle className="h-4 w-4" style={{ color: e.consistencyFlag.anomalyLevel === "high" ? "#f87171" : "#fbbf24" }} />
              : <CheckCircle className="h-4 w-4 text-emerald-500" />
            }
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Consistency Score: {e.consistencyFlag.score}%
              {e.consistencyFlag.flagged && (
                <span className="ml-2 text-xs font-bold uppercase" style={{ color: e.consistencyFlag.anomalyLevel === "high" ? "#f87171" : "#fbbf24" }}>
                  {e.consistencyFlag.anomalyLevel.toUpperCase()} ANOMALY
                </span>
              )}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {e.consistencyFlag.explanation}
          </p>
          {e.consistencyFlag.fraudWeightIncrease > 0 && (
            <p className="text-xs mt-1 font-semibold" style={{ color: "#fbbf24" }}>
              ⚠ Fraud score adjusted +{e.consistencyFlag.fraudWeightIncrease} points due to consistency anomaly.
            </p>
          )}
        </div>
      </div>

      {/* ── 4. Direction vs Damage ── */}
      <div>
        <SectionHeader
          icon={ArrowRight}
          title="Direction vs Damage Validation"
          sub="Impact direction cross-checked against detected damage zones"
        />
        <div
          className="p-3 rounded-lg"
          style={{
            background: e.directionFlag.mismatch ? "var(--fp-warning-bg)" : "var(--fp-success-bg)",
            border: `1px solid ${e.directionFlag.mismatch ? "var(--fp-warning-border)" : "var(--fp-match-border)"}`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {e.directionFlag.mismatch
              ? <AlertTriangle className="h-4 w-4" style={{ color: "#fbbf24" }} />
              : <CheckCircle className="h-4 w-4 text-emerald-500" />
            }
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              {e.directionFlag.mismatch ? "Direction-Damage Mismatch Detected" : "Direction-Damage Consistent"}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {e.directionFlag.explanation}
          </p>
          {e.directionFlag.mismatch && e.directionFlag.possibleExplanations.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>Possible explanations:</p>
              <ul className="space-y-0.5">
                {e.directionFlag.possibleExplanations.map((exp, i) => (
                  <li key={i} className="text-xs flex items-start gap-1" style={{ color: "var(--muted-foreground)" }}>
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{exp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Fair Cost Benchmark ── */}
      <div>
        <SectionHeader
          icon={DollarSign}
          title="Fair Cost Benchmark"
          sub={e.costBenchmark.basis}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricBox
            label="Fair Cost Range"
            value={`$${e.costBenchmark.estimatedFairMin.toLocaleString()} – $${e.costBenchmark.estimatedFairMax.toLocaleString()}`}
            sub={`Mid: $${e.costBenchmark.estimatedFairMid.toLocaleString()}`}
          />
          <MetricBox
            label="Parts Projection"
            value={`$${e.costBenchmark.partsProjection.toLocaleString()}`}
            sub="Estimated parts cost"
          />
          <MetricBox
            label="Labour Projection"
            value={`$${e.costBenchmark.labourProjection.toLocaleString()}`}
            sub="Estimated labour cost"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-1.5 rounded-full flex-1"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="h-1.5 rounded-full"
              style={{
                width: e.costBenchmark.confidence === "high" ? "90%" : e.costBenchmark.confidence === "medium" ? "60%" : "30%",
                background: e.costBenchmark.confidence === "high" ? "#10b981" : e.costBenchmark.confidence === "medium" ? "#f59e0b" : "#f87171",
              }}
            />
          </div>
          <span className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
            {CONFIDENCE_LABELS[e.costBenchmark.confidence]}
          </span>
        </div>
      </div>

      {/* ── 6. Enforced Fraud Level ── */}
      <div>
        <SectionHeader
          icon={Shield}
          title="Enforced Fraud Classification"
          sub="Corrected label using strict 5-band mapping (0–20 Minimal · 21–40 Low · 41–60 Moderate · 61–80 High · 81–100 Critical)"
        />
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: fraudColor, boxShadow: `0 0 8px ${fraudColor}` }}
          />
          <div>
            <p className="text-sm font-bold" style={{ color: fraudColor }}>
              {e.fraudLevelLabel}
            </p>
            {e.fraudScoreAdjustment > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                Score adjusted +{e.fraudScoreAdjustment} points from consistency and direction anomalies.
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
