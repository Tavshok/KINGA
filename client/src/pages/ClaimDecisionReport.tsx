/**
 * ClaimDecisionReport.tsx
 *
 * KINGA Unified Decision Engine — replaces the section-based report.
 *
 * Layout:
 *   [Verdict Banner]
 *   [Critical Alerts]
 *   [What Happened — narrative]
 *   [Damage & Impact] | [Cost Decision]
 *   [Fraud & Risk Decision]
 *   [Collapsible Technical Data]
 *   [Action Bar]
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  ArrowLeft, Shield, Zap, DollarSign, Car, FileText,
  TrendingUp, TrendingDown, Minus, RefreshCw, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnforcementResult {
  fraudLevelEnforced: string;
  fraudLevelLabel: string;
  physicsEstimate: {
    velocityRangeKmh: { min: number; max: number };
    estimatedVelocityKmh: number;
    estimatedForceKn: number;
    estimatedEnergyKj: number;
    impactForceKn?: { min: number; max: number };
    energyKj?: { min: number; max: number };
    deltaVKmh?: number;
    estimated: true;
    basis: string;
    insight?: string;
  } | null;
  physicsInsight: string;
  consistencyFlag: {
    flagged: boolean;
    score: number;
    anomalyLevel: "none" | "low" | "medium" | "high";
    explanation: string;
    fraudWeightIncrease: number;
  };
  directionFlag: {
    mismatch: boolean;
    impactDirection: string;
    damageZones: string[];
    explanation: string;
    possibleExplanations: string[];
  };
  costBenchmark: {
    estimatedFairMin: number;
    estimatedFairMax: number;
    estimatedFairMid: number;
    partsProjection: number;
    labourProjection: number;
    basis: string;
    confidence: "low" | "medium" | "high";
  };
  /** NEW: cost verdict with deviation % */
  costVerdict?: {
    aiEstimatedCost: number;
    quotedCost: number;
    fairMin: number;
    fairMax: number;
    deviationPercent: number | null;
    verdict: "OVERPRICED" | "FAIR" | "UNDERPRICED" | "NO_QUOTE";
    ruleApplied: string;
    explanation: string;
  };
  /** NEW: weighted fraud score breakdown */
  fraudScoreBreakdown?: {
    totalScore: number;
    baseScore: number;
    components: Array<{ factor: string; contribution: number; weight: string }>;
    adjustments: Array<{ source: string; delta: number; reason: string }>;
    level: string;
    label: string;
  };
  /** NEW: confidence score with penalty breakdown */
  confidenceBreakdown?: {
    score: number;
    base: number;
    penalties: Array<{ factor: string; deduction: number; reason: string }>;
    summary: string;
  };
  /** NEW: final decision with rule trace */
  finalDecision?: {
    decision: "FINALISE_CLAIM" | "REVIEW_REQUIRED" | "ESCALATE_INVESTIGATION";
    label: string;
    color: "green" | "amber" | "red";
    ruleTrace: Array<{ rule: string; value: string | number; threshold: string; triggered: boolean }>;
    primaryReason: string;
    recommendedActions: string[];
  };
  alerts: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
    engine: string;
  }>;
  fraudScoreAdjustment: number;
}

// ─── Risk level config ────────────────────────────────────────────────────────

const RISK_STYLE: Record<string, { bg: string; border: string; text: string; badge: string; dot: string }> = {
  minimal:  { bg: "oklch(0.25 0.05 155)", border: "oklch(0.45 0.18 155)", text: "#10b981", badge: "bg-emerald-600", dot: "#10b981" },
  low:      { bg: "oklch(0.25 0.05 155)", border: "oklch(0.45 0.18 155)", text: "#22c55e", badge: "bg-green-600",   dot: "#22c55e" },
  moderate: { bg: "oklch(0.25 0.08 60)",  border: "oklch(0.55 0.18 60)",  text: "#f59e0b", badge: "bg-amber-600",  dot: "#f59e0b" },
  high:     { bg: "oklch(0.22 0.08 35)",  border: "oklch(0.55 0.18 35)",  text: "#f97316", badge: "bg-orange-600", dot: "#f97316" },
  critical: { bg: "oklch(0.20 0.10 25)",  border: "oklch(0.55 0.22 25)",  text: "#f87171", badge: "bg-red-700",    dot: "#ef4444" },
};

const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
  none:         { color: "#10b981", label: "No Damage" },
  minor:        { color: "#22c55e", label: "Minor" },
  moderate:     { color: "#f59e0b", label: "Moderate" },
  severe:       { color: "#f97316", label: "Severe" },
  catastrophic: { color: "#ef4444", label: "Catastrophic" },
  total_loss:   { color: "#dc2626", label: "Total Loss" },
  unknown:      { color: "#6b7280", label: "Unknown" },
};

const ALERT_STYLE: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  critical: { bg: "oklch(0.55 0.22 25 / 0.12)", border: "oklch(0.55 0.22 25 / 0.50)", icon: "#f87171", label: "CRITICAL" },
  warning:  { bg: "oklch(0.72 0.18 60 / 0.10)", border: "oklch(0.72 0.18 60 / 0.40)", icon: "#fbbf24", label: "WARNING"  },
  info:     { bg: "oklch(0.55 0.18 250 / 0.08)", border: "oklch(0.55 0.18 250 / 0.30)", icon: "#60a5fa", label: "INFO"   },
};

// ─── Cost verdict helper ──────────────────────────────────────────────────────

function computeCostVerdict(
  aiCostCents: number,
  fairMin: number,
  fairMax: number,
  quotedAmounts: number[]
): { verdict: "UNDERPRICED" | "FAIR" | "OVERPRICED"; color: string; Icon: typeof TrendingUp; explanation: string } {
  const aiCost = aiCostCents / 100;
  const compareAmount = quotedAmounts.length > 0
    ? quotedAmounts.reduce((a, b) => a + b, 0) / quotedAmounts.length
    : aiCost;

  if (compareAmount > fairMax * 1.15) {
    return {
      verdict: "OVERPRICED",
      color: "#f87171",
      Icon: TrendingUp,
      explanation: quotedAmounts.length > 0
        ? `The submitted quote of $${compareAmount.toLocaleString()} exceeds the fair cost ceiling of $${fairMax.toLocaleString()} by ${Math.round(((compareAmount - fairMax) / fairMax) * 100)}%.`
        : `The AI estimate of $${aiCost.toLocaleString()} is above the expected fair range for this damage profile.`,
    };
  }
  if (compareAmount < fairMin * 0.85) {
    return {
      verdict: "UNDERPRICED",
      color: "#fbbf24",
      Icon: TrendingDown,
      explanation: quotedAmounts.length > 0
        ? `The submitted quote of $${compareAmount.toLocaleString()} is significantly below the fair cost floor of $${fairMin.toLocaleString()}. This may indicate incomplete scope of work.`
        : `The AI estimate is below the expected fair range — verify that all damage components are captured.`,
    };
  }
  return {
    verdict: "FAIR",
    color: "#10b981",
    Icon: Minus,
    explanation: quotedAmounts.length > 0
      ? `The submitted quote of $${compareAmount.toLocaleString()} falls within the fair cost range of $${fairMin.toLocaleString()}–$${fairMax.toLocaleString()}.`
      : `The AI estimate of $${aiCost.toLocaleString()} is consistent with the expected cost for this damage profile.`,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Final Decision Banner ────────────────────────────────────────────────────

function FinalDecisionBanner({ finalDecision, confidenceScore }: {
  finalDecision: NonNullable<EnforcementResult["finalDecision"]>;
  confidenceScore: number;
}) {
  const { decision, label, color, primaryReason } = finalDecision;
  const cfg = {
    green: { bg: "oklch(0.20 0.06 155 / 0.9)", border: "oklch(0.45 0.18 155)", text: "#10b981", Icon: CheckCircle },
    amber: { bg: "oklch(0.22 0.08 60 / 0.9)",  border: "oklch(0.55 0.18 60)",  text: "#f59e0b", Icon: AlertTriangle },
    red:   { bg: "oklch(0.20 0.10 25 / 0.9)",  border: "oklch(0.55 0.22 25)",  text: "#f87171", Icon: AlertTriangle },
  }[color];
  const decisionLabel = decision === "FINALISE_CLAIM" ? "FINALISE CLAIM" : decision === "REVIEW_REQUIRED" ? "REVIEW REQUIRED" : "ESCALATE INVESTIGATION";

  return (
    <div className="rounded-xl p-4 mb-3" style={{ background: cfg.bg, border: `2px solid ${cfg.border}` }}>
      <div className="flex items-start gap-3">
        <cfg.Icon className="h-6 w-6 shrink-0 mt-0.5" style={{ color: cfg.text }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <span className="text-lg font-black tracking-wide" style={{ color: cfg.text }}>{decisionLabel}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${cfg.text}20`, color: cfg.text }}>
              Confidence {confidenceScore}/100
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{primaryReason}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Confidence Breakdown Panel ───────────────────────────────────────────────

function ConfidenceBreakdownPanel({ confidenceBreakdown }: { confidenceBreakdown: NonNullable<EnforcementResult["confidenceBreakdown"]> }) {
  const { score, penalties, summary } = confidenceBreakdown;
  const scoreColor = score >= 85 ? "#10b981" : score >= 70 ? "#f59e0b" : "#f87171";
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4" style={{ color: scoreColor }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Assessment Confidence</p>
        <span className="ml-auto text-2xl font-black" style={{ color: scoreColor }}>{score}<span className="text-xs font-normal text-muted-foreground">/100</span></span>
      </div>
      <div className="relative h-2 rounded-full mb-2" style={{ background: "var(--muted)" }}>
        <div className="absolute h-2 rounded-full transition-all" style={{ width: `${score}%`, background: scoreColor }} />
      </div>
      <p className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>{summary}</p>
      {penalties.length > 0 && (
        <div className="space-y-1.5">
          {penalties.map((p, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="font-black shrink-0" style={{ color: "#f87171" }}>−{p.deduction}</span>
              <span style={{ color: "var(--foreground)" }}>{p.factor}:</span>
              <span style={{ color: "var(--muted-foreground)" }}>{p.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rule Trace Panel ─────────────────────────────────────────────────────────

function RuleTracePanel({ ruleTrace }: { ruleTrace: NonNullable<EnforcementResult["finalDecision"]>["ruleTrace"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <button className="w-full flex items-center justify-between p-4" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Decision Rule Trace</p>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            {ruleTrace.filter(r => r.triggered).length} triggered
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-1.5">
          {ruleTrace.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs rounded px-2 py-1.5" style={{ background: r.triggered ? "oklch(0.72 0.18 60 / 0.08)" : "var(--muted)", border: r.triggered ? "1px solid oklch(0.72 0.18 60 / 0.35)" : "1px solid transparent" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: r.triggered ? "#f59e0b" : "var(--muted-foreground)", color: r.triggered ? "#000" : "var(--background)" }}>{r.triggered ? "!" : "✓"}</span>
              <span className="flex-1" style={{ color: "var(--foreground)" }}>{r.rule}</span>
              <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: r.triggered ? "oklch(0.72 0.18 60 / 0.15)" : "var(--muted)", color: r.triggered ? "#f59e0b" : "var(--muted-foreground)" }}>{String(r.value)}</span>
              <span style={{ color: "var(--muted-foreground)" }}>vs</span>
              <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>{r.threshold}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ assessment, enforcement, quotes }: { assessment: any; enforcement: EnforcementResult; quotes: any[] }) {
  const riskLevel = enforcement.fraudLevelEnforced;
  const style = RISK_STYLE[riskLevel] ?? RISK_STYLE.moderate;
  const severityKey = assessment.structuralDamageSeverity ?? "unknown";
  const severity = SEVERITY_STYLE[severityKey] ?? SEVERITY_STYLE.unknown;
  const confidence = enforcement.confidenceBreakdown?.score ?? assessment.confidenceScore ?? 0;
  const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100);
  const costVerdict = computeCostVerdict(
    assessment.estimatedCost ?? 0,
    enforcement.costBenchmark.estimatedFairMin,
    enforcement.costBenchmark.estimatedFairMax,
    quotedAmounts
  );
  const { Icon: CostIcon } = costVerdict;

  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{ background: style.bg, border: `2px solid ${style.border}` }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: style.text }}>
            CLAIM VERDICT
          </p>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: style.dot, boxShadow: `0 0 10px ${style.dot}` }} />
            <h1 className="text-2xl font-black" style={{ color: style.text }}>
              {enforcement.fraudLevelLabel.toUpperCase()} RISK
            </h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>AI Confidence</p>
          <p className="text-3xl font-black" style={{ color: "var(--foreground)" }}>{confidence}%</p>
        </div>
      </div>

      {/* Three verdict pills */}
      <div className="grid grid-cols-3 gap-3">
        {/* Cost verdict */}
        <div className="rounded-lg p-3" style={{ background: "oklch(0.15 0.02 0 / 0.5)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <CostIcon className="h-3.5 w-3.5 shrink-0" style={{ color: costVerdict.color }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: costVerdict.color }}>
              {costVerdict.verdict}
            </p>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>Repair Cost</p>
        </div>

        {/* Damage severity */}
        <div className="rounded-lg p-3" style={{ background: "oklch(0.15 0.02 0 / 0.5)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Car className="h-3.5 w-3.5 shrink-0" style={{ color: severity.color }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: severity.color }}>
              {severity.label}
            </p>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>Damage Severity</p>
        </div>

        {/* Fraud level */}
        <div className="rounded-lg p-3" style={{ background: "oklch(0.15 0.02 0 / 0.5)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: style.text }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: style.text }}>
              {enforcement.fraudLevelLabel}
            </p>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>Fraud Classification</p>
        </div>
      </div>
    </div>
  );
}

function CriticalAlerts({ alerts }: { alerts: EnforcementResult["alerts"] }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="space-y-2 mb-4">
      {alerts.map(alert => {
        const s = ALERT_STYLE[alert.severity];
        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 p-3 rounded-lg"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: s.icon }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-black uppercase tracking-wide" style={{ color: s.icon }}>{s.label}</span>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>· {alert.engine}</span>
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{alert.title}</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{alert.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WhatHappened({ assessment, enforcement, claim }: { assessment: any; enforcement: EnforcementResult; claim: any }) {
  // Build narrative from real data
  const vehicle = [claim?.vehicleMake, claim?.vehicleModel, claim?.vehicleYear].filter(Boolean).join(" ") || "the vehicle";
  const direction = enforcement.directionFlag.impactDirection || assessment.incidentType || "unknown direction";
  const speed = enforcement.physicsEstimate
    ? `estimated ${enforcement.physicsEstimate.estimatedVelocityKmh} km/h (range: ${enforcement.physicsEstimate.velocityRangeKmh.min}–${enforcement.physicsEstimate.velocityRangeKmh.max} km/h)`
    : "speed not determined from available data";
  const severity = (assessment.structuralDamageSeverity ?? "minor").toLowerCase();
  const components: string[] = (() => {
    try {
      const raw = assessment.damagedComponentsJson ? JSON.parse(assessment.damagedComponentsJson) : [];
      return Array.isArray(raw) ? raw.map((c: any) => typeof c === "string" ? c : c?.name || "").filter(Boolean) : [];
    } catch { return []; }
  })();
  const componentList = components.length > 0
    ? components.slice(0, 4).join(", ") + (components.length > 4 ? ` and ${components.length - 4} more` : "")
    : "multiple components";

  const hasStructural = assessment.structuralDamageSeverity && assessment.structuralDamageSeverity !== "none";
  const consistencyNote = enforcement.consistencyFlag.flagged
    ? ` The damage pattern shows a consistency score of ${enforcement.consistencyFlag.score}%, which is below the expected threshold — ${enforcement.consistencyFlag.explanation.toLowerCase()}`
    : "";
  const directionNote = enforcement.directionFlag.mismatch
    ? ` Note: the reported impact direction (${direction}) does not fully align with the detected damage zones. ${enforcement.directionFlag.possibleExplanations[0] ?? ""}`
    : "";

  const narrative = [
    `${vehicle} sustained a ${severity} ${direction}-impact collision at ${speed}.`,
    `The AI damage assessment identified ${components.length} affected components: ${componentList}.`,
    hasStructural ? `Structural damage has been detected, indicating the impact exceeded surface-level deformation.` : null,
    enforcement.physicsInsight || null,
    consistencyNote || null,
    directionNote || null,
  ].filter(Boolean).join(" ");

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4" style={{ color: "var(--primary)" }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>What Happened</p>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "oklch(0.55 0.18 250 / 0.15)", color: "oklch(0.70 0.18 250)" }}>
          AI Reconstructed
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{narrative}</p>
      {assessment.damageDescription && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Original AI Description</p>
          <p className="text-xs leading-relaxed italic" style={{ color: "var(--muted-foreground)" }}>{assessment.damageDescription}</p>
        </div>
      )}
    </div>
  );
}

function DamageImpact({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
  const components: Array<{ name: string; severity?: string; zone?: string }> = (() => {
    try {
      const raw = assessment.damagedComponentsJson ? JSON.parse(assessment.damagedComponentsJson) : [];
      return Array.isArray(raw) ? raw.map((c: any) => typeof c === "string" ? { name: c } : c) : [];
    } catch { return []; }
  })();

  const severityKey = assessment.structuralDamageSeverity ?? "unknown";
  const severity = SEVERITY_STYLE[severityKey] ?? SEVERITY_STYLE.unknown;
  const direction = enforcement.directionFlag.impactDirection || "unknown";

  // Simple vehicle silhouette zones
  const ZONE_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
    front:        { x: 50, y: 12, label: "Front" },
    rear:         { x: 50, y: 88, label: "Rear" },
    left:         { x: 12, y: 50, label: "Left" },
    right:        { x: 88, y: 50, label: "Right" },
    "side_driver":{ x: 12, y: 50, label: "Driver" },
    "side_passenger": { x: 88, y: 50, label: "Passenger" },
    roof:         { x: 50, y: 50, label: "Roof" },
    unknown:      { x: 50, y: 50, label: "?" },
  };
  const impactZone = ZONE_POSITIONS[direction] ?? ZONE_POSITIONS.unknown;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Car className="h-4 w-4" style={{ color: "var(--primary)" }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Damage & Impact</p>
      </div>

      {/* Vehicle diagram */}
      <div className="flex justify-center mb-4">
        <div className="relative w-40 h-40">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Vehicle body — top-down view */}
            <rect x="25" y="10" width="50" height="80" rx="12" fill="oklch(0.25 0.03 250)" stroke="oklch(0.45 0.08 250)" strokeWidth="2" />
            {/* Windshield */}
            <rect x="30" y="16" width="40" height="18" rx="4" fill="oklch(0.35 0.05 250)" opacity="0.6" />
            {/* Rear window */}
            <rect x="30" y="66" width="40" height="14" rx="4" fill="oklch(0.35 0.05 250)" opacity="0.6" />
            {/* Wheels */}
            <rect x="14" y="18" width="12" height="18" rx="3" fill="oklch(0.20 0.02 0)" stroke="oklch(0.40 0.05 0)" strokeWidth="1.5" />
            <rect x="74" y="18" width="12" height="18" rx="3" fill="oklch(0.20 0.02 0)" stroke="oklch(0.40 0.05 0)" strokeWidth="1.5" />
            <rect x="14" y="64" width="12" height="18" rx="3" fill="oklch(0.20 0.02 0)" stroke="oklch(0.40 0.05 0)" strokeWidth="1.5" />
            <rect x="74" y="64" width="12" height="18" rx="3" fill="oklch(0.20 0.02 0)" stroke="oklch(0.40 0.05 0)" strokeWidth="1.5" />
            {/* Impact indicator */}
            <circle
              cx={impactZone.x}
              cy={impactZone.y}
              r="8"
              fill={severity.color}
              opacity="0.35"
            />
            <circle
              cx={impactZone.x}
              cy={impactZone.y}
              r="4"
              fill={severity.color}
              opacity="0.8"
            />
            {/* Impact label */}
            <text
              x={impactZone.x}
              y={impactZone.y > 50 ? impactZone.y + 14 : impactZone.y - 10}
              textAnchor="middle"
              fontSize="7"
              fontWeight="bold"
              fill={severity.color}
            >
              {impactZone.label}
            </text>
          </svg>
        </div>
      </div>

      {/* Damage match assessment */}
      <div
        className="p-2.5 rounded-lg mb-3 text-xs leading-relaxed"
        style={{
          background: enforcement.directionFlag.mismatch ? "oklch(0.72 0.18 60 / 0.08)" : "oklch(0.55 0.18 155 / 0.08)",
          border: `1px solid ${enforcement.directionFlag.mismatch ? "oklch(0.72 0.18 60 / 0.35)" : "oklch(0.55 0.18 155 / 0.30)"}`,
          color: "var(--foreground)",
        }}
      >
        {enforcement.directionFlag.mismatch
          ? <><span className="font-bold" style={{ color: "#fbbf24" }}>⚠ Mismatch: </span>{enforcement.directionFlag.explanation}</>
          : <><span className="font-bold" style={{ color: "#10b981" }}>✓ Consistent: </span>{enforcement.directionFlag.explanation}</>
        }
      </div>

      {/* Component list */}
      {components.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
            Affected Components ({components.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {components.slice(0, 8).map((c, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "oklch(0.30 0.04 250)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              >
                {c.name}
              </span>
            ))}
            {components.length > 8 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: "var(--muted-foreground)" }}>
                +{components.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Structural implication */}
      {assessment.structuralDamageSeverity && assessment.structuralDamageSeverity !== "none" && (
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "oklch(0.55 0.22 25 / 0.10)", border: "1px solid oklch(0.55 0.22 25 / 0.35)" }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
          <p className="text-xs" style={{ color: "var(--foreground)" }}>
            <span className="font-bold text-red-400">Structural damage detected.</span> Frame or unibody inspection required before repair authorisation.
          </p>
        </div>
      )}
    </div>
  );
}

function CostDecision({ assessment, enforcement, quotes }: { assessment: any; enforcement: EnforcementResult; quotes: any[] }) {
  const aiCostCents = assessment.estimatedCost ?? 0;
  const aiCost = aiCostCents / 100;
  const partsCost = (assessment.estimatedPartsCost ?? 0) / 100;
  const labourCost = (assessment.estimatedLaborCost ?? 0) / 100;
  const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100);
  const { costBenchmark } = enforcement;
  const costVerdict = computeCostVerdict(aiCostCents, costBenchmark.estimatedFairMin, costBenchmark.estimatedFairMax, quotedAmounts);
  const { Icon: CostIcon } = costVerdict;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="h-4 w-4" style={{ color: "var(--primary)" }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Cost Decision</p>
      </div>

      {/* Verdict pill */}
      <div
        className="flex items-center gap-2 p-3 rounded-lg mb-3"
        style={{ background: `${costVerdict.color}18`, border: `1.5px solid ${costVerdict.color}60` }}
      >
        <CostIcon className="h-4 w-4 shrink-0" style={{ color: costVerdict.color }} />
        <div>
          <p className="text-sm font-black" style={{ color: costVerdict.color }}>{costVerdict.verdict}</p>
          <p className="text-xs leading-snug mt-0.5" style={{ color: "var(--muted-foreground)" }}>{costVerdict.explanation}</p>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between items-center py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>AI Estimated Total</span>
          <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>${aiCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {partsCost > 0 && (
          <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Parts</span>
            <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>${partsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        {labourCost > 0 && (
          <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Labour</span>
            <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>${labourCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        {quotedAmounts.length > 0 && (
          <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Panel Beater Quote{quotedAmounts.length > 1 ? "s" : ""}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
              {quotedAmounts.length === 1
                ? `$${quotedAmounts[0].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$${Math.min(...quotedAmounts).toLocaleString()} – $${Math.max(...quotedAmounts).toLocaleString()}`
              }
            </span>
          </div>
        )}
      </div>

      {/* Fair range bar */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
          <span>Fair Range</span>
          <span>${costBenchmark.estimatedFairMin.toLocaleString()} – ${costBenchmark.estimatedFairMax.toLocaleString()}</span>
        </div>
        <div className="relative h-2 rounded-full" style={{ background: "var(--muted)" }}>
          <div
            className="absolute h-2 rounded-full"
            style={{
              left: "10%",
              width: "80%",
              background: "linear-gradient(90deg, #10b981, #22c55e)",
              opacity: 0.6,
            }}
          />
          {/* AI cost marker */}
          {aiCost > 0 && costBenchmark.estimatedFairMax > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white"
              style={{
                left: `${Math.min(95, Math.max(5, (aiCost / (costBenchmark.estimatedFairMax * 1.5)) * 100))}%`,
                background: costVerdict.color,
              }}
            />
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{costBenchmark.basis}</p>
      </div>
    </div>
  );
}

function FraudRiskDecision({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
  const riskLevel = enforcement.fraudLevelEnforced;
  const style = RISK_STYLE[riskLevel] ?? RISK_STYLE.moderate;

  // Parse fraud breakdown
  let breakdown: any = null;
  try {
    const raw = assessment.fraudScoreBreakdownJson;
    if (raw) breakdown = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { /* ignore */ }

  const score = breakdown?.totalScore ?? 0;
  const triggeredSignals: Array<{ label: string; points: number; evidence: string }> = breakdown?.triggeredSignals ?? [];
  const topSignals = triggeredSignals.slice(0, 3);

  // Build fraud reasoning narrative
  const reasoningParts: string[] = [];
  if (score === 0) {
    reasoningParts.push("No fraud indicators were triggered by the AI assessment.");
  } else {
    reasoningParts.push(`The fraud score of ${score}/100 places this claim in the ${enforcement.fraudLevelLabel} category.`);
    if (topSignals.length > 0) {
      reasoningParts.push(`The primary contributing factors are: ${topSignals.map(s => s.label.toLowerCase()).join("; ")}.`);
    }
    if (enforcement.consistencyFlag.fraudWeightIncrease > 0) {
      reasoningParts.push(`An additional ${enforcement.consistencyFlag.fraudWeightIncrease} points were applied by the Intelligence Enforcement Layer due to a damage consistency anomaly.`);
    }
    if (enforcement.directionFlag.mismatch) {
      reasoningParts.push("The direction-damage mismatch is a contributing risk signal that warrants assessor review.");
    }
  }
  const reasoning = reasoningParts.join(" ");

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4" style={{ color: "var(--primary)" }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Fraud & Risk Decision</p>
      </div>

      <div className="flex items-start gap-4 mb-4">
        {/* Score circle */}
        <div className="shrink-0 flex flex-col items-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black"
            style={{ background: `${style.dot}20`, border: `3px solid ${style.dot}`, color: style.dot }}
          >
            {score}
          </div>
          <p className="text-xs mt-1 font-semibold" style={{ color: style.text }}>{enforcement.fraudLevelLabel}</p>
        </div>

        {/* Reasoning */}
        <div className="flex-1">
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{reasoning}</p>
        </div>
      </div>

      {/* Top signals */}
      {topSignals.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
            Top Fraud Signals
          </p>
          <div className="space-y-2">
            {topSignals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ background: "oklch(0.55 0.22 25 / 0.08)", border: "1px solid oklch(0.55 0.22 25 / 0.25)" }}>
                <span className="text-xs font-black shrink-0 mt-0.5" style={{ color: "#f87171" }}>+{sig.points}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{sig.label}</p>
                  <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>{sig.evidence}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended actions */}
      {breakdown?.recommendedActions && breakdown.recommendedActions.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Recommended Actions</p>
          <ul className="space-y-1">
            {breakdown.recommendedActions.slice(0, 3).map((action: string, i: number) => (
              <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--foreground)" }}>
                <span className="shrink-0 mt-0.5 font-bold" style={{ color: "var(--primary)" }}>→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CollapsibleTechnicalData({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
  const [open, setOpen] = useState(false);
  const pe = enforcement.physicsEstimate;

  // Parse physics analysis
  let physicsRaw: any = null;
  try {
    physicsRaw = assessment.physicsAnalysis
      ? (typeof assessment.physicsAnalysis === "string" ? JSON.parse(assessment.physicsAnalysis) : assessment.physicsAnalysis)
      : null;
  } catch { /* ignore */ }

  const deltaV = pe?.deltaVKmh ?? physicsRaw?.deltaVKmh ?? physicsRaw?.deltaV ?? 0;
  const forceDisplay = pe
    ? pe.impactForceKn
      ? `${pe.impactForceKn.min}–${pe.impactForceKn.max} kN (estimated)`
      : pe.estimatedForceKn ? `~${pe.estimatedForceKn.toFixed(1)} kN (estimated)` : "N/A"
    : physicsRaw?.impactForceKn ? `${physicsRaw.impactForceKn} kN` : "N/A";
  const energyDisplay = pe
    ? pe.energyKj
      ? `${pe.energyKj.min}–${pe.energyKj.max} kJ (estimated)`
      : pe.estimatedEnergyKj ? `~${pe.estimatedEnergyKj.toFixed(0)} kJ (estimated)` : "N/A"
    : physicsRaw?.energyDistribution?.energyDissipatedKj ? `${physicsRaw.energyDistribution.energyDissipatedKj} kJ` : "N/A";
  const speedDisplay = pe
    ? `${pe.estimatedVelocityKmh} km/h (estimated, range: ${pe.velocityRangeKmh.min}–${pe.velocityRangeKmh.max})`
    : physicsRaw?.estimatedSpeedKmh && Number(physicsRaw.estimatedSpeedKmh) > 0
      ? `${physicsRaw.estimatedSpeedKmh} km/h`
      : "Not calculable from available data";

  return (
    <div className="rounded-xl mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Supporting Technical Data</p>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
            Physics · Delta-V · Force · Energy
          </span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Impact Speed", value: speedDisplay },
              { label: "Delta-V", value: deltaV > 0 ? `${deltaV} km/h` : "N/A" },
              { label: "Impact Force", value: forceDisplay },
              { label: "Energy Dissipated", value: energyDisplay },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-lg" style={{ background: "var(--muted)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</p>
                <p className="text-xs font-bold" style={{ color: "var(--foreground)" }}>{value}</p>
              </div>
            ))}
          </div>
          {pe && (
            <p className="text-xs mt-3 italic" style={{ color: "var(--muted-foreground)" }}>
              ⚠ Physics values are estimated — {pe.basis}
            </p>
          )}
          {physicsRaw?.accidentSeverity && (
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Physics engine severity: <strong>{physicsRaw.accidentSeverity}</strong> · Consistency score: <strong>{physicsRaw.damageConsistencyScore ?? enforcement.consistencyFlag.score}%</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClaimDecisionReport() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurer/claims/:id/verdict");
  const claimId = params?.id ? parseInt(params.id) : 0;

  const { data: claim, isLoading: claimLoading } = trpc.claims.getById.useQuery(
    { id: claimId },
    { enabled: !!claimId }
  );
  const { data: aiAssessment, isLoading: aiLoading } = trpc.aiAssessments.byClaim.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  const { data: enforcement, isLoading: enforcementLoading } = trpc.aiAssessments.getEnforcement.useQuery(
    { claimId },
    { enabled: !!claimId }
  );
  const { data: quotesWithItems = [], isLoading: quotesLoading } = trpc.quotes.getWithLineItems.useQuery(
    { claimId },
    { enabled: !!claimId }
  );

  const utils = trpc.useUtils();
  const reRunMutation = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      utils.claims.getById.invalidate({ id: claimId });
      utils.aiAssessments.byClaim.invalidate({ claimId });
      utils.aiAssessments.getEnforcement.invalidate({ claimId });
      toast.success("AI assessment re-triggered", { description: "Results will update in 30–60 seconds." });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const isLoading = claimLoading || aiLoading || enforcementLoading || quotesLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading decision report…</p>
        </div>
      </div>
    );
  }

  if (!claim || !aiAssessment || !enforcement) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold mb-2" style={{ color: "var(--foreground)" }}>
            {!aiAssessment ? "AI Assessment Pending" : "Claim Not Found"}
          </p>
          <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
            {!aiAssessment
              ? "The AI pipeline has not yet processed this claim. Trigger the assessment to generate the decision report."
              : "This claim could not be found or you do not have access."}
          </p>
          {claim && !aiAssessment && (
            <Button
              onClick={() => reRunMutation.mutate({ claimId })}
              disabled={reRunMutation.isPending}
            >
              {reRunMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running…</> : "Run AI Assessment"}
            </Button>
          )}
          <Button variant="ghost" className="mt-2" onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Full Report
          </Button>
        </div>
      </div>
    );
  }

  const vehicleTitle = [claim.vehicleMake, claim.vehicleModel, claim.vehicleYear].filter(Boolean).join(" ") || `Claim #${claim.claimNumber}`;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Full Report
          </Button>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{vehicleTitle}</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{claim.claimNumber} · Decision Report</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reRunMutation.mutate({ claimId })}
            disabled={reRunMutation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reRunMutation.isPending ? "animate-spin" : ""}`} />
            Re-run AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* 0. Final Decision Banner (FINALISE / REVIEW / ESCALATE) */}
        {(enforcement as EnforcementResult).finalDecision && (
          <FinalDecisionBanner
            finalDecision={(enforcement as EnforcementResult).finalDecision!}
            confidenceScore={(enforcement as EnforcementResult).confidenceBreakdown?.score ?? aiAssessment.confidenceScore ?? 75}
          />
        )}

        {/* 1. Verdict Banner */}
        <VerdictBanner assessment={aiAssessment} enforcement={enforcement as EnforcementResult} quotes={quotesWithItems} />

        {/* 2. Critical Alerts */}
        <CriticalAlerts alerts={(enforcement as EnforcementResult).alerts} />

        {/* 3. What Happened */}
        <WhatHappened assessment={aiAssessment} enforcement={enforcement as EnforcementResult} claim={claim} />

        {/* 4. Damage & Impact + Cost Decision — two-column on wide screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <DamageImpact assessment={aiAssessment} enforcement={enforcement as EnforcementResult} />
          <CostDecision assessment={aiAssessment} enforcement={enforcement as EnforcementResult} quotes={quotesWithItems} />
        </div>

        {/* 5. Fraud & Risk Decision */}
        <FraudRiskDecision assessment={aiAssessment} enforcement={enforcement as EnforcementResult} />

        {/* 5b. Confidence Breakdown */}
        {(enforcement as EnforcementResult).confidenceBreakdown && (
          <ConfidenceBreakdownPanel confidenceBreakdown={(enforcement as EnforcementResult).confidenceBreakdown!} />
        )}

        {/* 5c. Rule Trace (collapsible) */}
        {(enforcement as EnforcementResult).finalDecision?.ruleTrace?.length ? (
          <RuleTracePanel ruleTrace={(enforcement as EnforcementResult).finalDecision!.ruleTrace} />
        ) : null}

        {/* 6. Collapsible Technical Data */}
        <CollapsibleTechnicalData assessment={aiAssessment} enforcement={enforcement as EnforcementResult} />

        {/* 7. Action Bar */}
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Ready to decide?</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Open the full report to approve, reject, or request more information.</p>
          </div>
          <Button onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}>
            Open Full Report →
          </Button>
        </div>
      </div>
    </div>
  );
}
