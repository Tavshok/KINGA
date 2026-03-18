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

import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  ArrowLeft, Shield, Zap, DollarSign, Car, FileText,
  TrendingUp, TrendingDown, Minus, RefreshCw, Printer, Code, GitCompareArrows,
  Lock, Unlock, Eye, Gavel, Download, AlertCircle, XCircle
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
  /** NEW: deterministic weighted fraud score */
  weightedFraud?: {
    score: number;
    level: string;
    contributions: Array<{ factor: string; value: number }>;
    full_contributions: Array<{
      factor: string;
      value: number;
      triggered: boolean;
      detail: string;
    }>;
    explanation: string;
  };
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

function CostDecision({ assessment, enforcement, quotes }: { assessment: any; enforcement: EnforcementResult & { costExtraction?: any }; quotes: any[] }) {
  const [showItemised, setShowItemised] = useState(false);
  // Use guaranteed costExtraction object if available, fall back to raw assessment fields
  const ce = enforcement.costExtraction;
  const aiCost = ce ? ce.ai_estimate : (assessment.estimatedCost ?? 0) / 100;
  const partsCost = ce ? ce.parts : (assessment.estimatedPartsCost ?? 0) / 100;
  const labourCost = ce ? ce.labour : (assessment.estimatedLaborCost ?? 0) / 100;
  const fairMin = ce ? ce.fair_range.min : enforcement.costBenchmark.estimatedFairMin;
  const fairMax = ce ? ce.fair_range.max : enforcement.costBenchmark.estimatedFairMax;
  const confidence = ce ? ce.confidence : (assessment.confidenceScore ?? 75);
  const itemisedParts: Array<{ component: string; parts_cost: number; labour_cost: number; total: number; source: string }> = ce?.itemised_parts ?? [];
  const basis = ce ? ce.basis : enforcement.costBenchmark.basis;
  const dataSource = ce?.source ?? "extracted";

  const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100);
  const aiCostCents = aiCost * 100;
  const costVerdict = computeCostVerdict(aiCostCents, fairMin, fairMax, quotedAmounts);
  const { Icon: CostIcon } = costVerdict;

  // Confidence colour
  const confColor = confidence >= 80 ? "#10b981" : confidence >= 60 ? "#f59e0b" : "#ef4444";
  const sourceLabel: Record<string, string> = {
    extracted: "AI Extracted",
    estimated: "AI + Estimated",
    severity_fallback: "Severity Benchmark",
  };

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" style={{ color: "var(--primary)" }} />
          <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Cost Decision</p>
        </div>
        {/* Confidence badge */}
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${confColor}18`, color: confColor, border: `1px solid ${confColor}40` }}>
          {confidence}% confidence
        </span>
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

      {/* Guaranteed cost breakdown — no empty fields */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between items-center py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Total Estimate</span>
          <span className="text-sm font-black" style={{ color: "var(--foreground)" }}>${aiCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Parts</span>
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>${partsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Labour</span>
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>${labourCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
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
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
          <span>Fair Range</span>
          <span>${fairMin.toLocaleString()} – ${fairMax.toLocaleString()}</span>
        </div>
        <div className="relative h-2 rounded-full" style={{ background: "var(--muted)" }}>
          <div
            className="absolute h-2 rounded-full"
            style={{ left: "10%", width: "80%", background: "linear-gradient(90deg, #10b981, #22c55e)", opacity: 0.6 }}
          />
          {aiCost > 0 && fairMax > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white"
              style={{ left: `${Math.min(95, Math.max(5, (aiCost / (fairMax * 1.5)) * 100))}%`, background: costVerdict.color }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span style={{ color: "var(--muted-foreground)" }}>{basis}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{sourceLabel[dataSource] ?? dataSource}</span>
        </div>
      </div>

      {/* Itemised parts breakdown (collapsible) */}
      {itemisedParts.length > 0 && (
        <div>
          <button
            className="w-full flex items-center justify-between text-xs py-1.5"
            style={{ color: "var(--muted-foreground)", borderTop: "1px solid var(--border)" }}
            onClick={() => setShowItemised(v => !v)}
          >
            <span className="font-semibold">Itemised Parts Breakdown ({itemisedParts.length} component{itemisedParts.length !== 1 ? "s" : ""})</span>
            <span>{showItemised ? "▲" : "▼"}</span>
          </button>
          {showItemised && (
            <div className="mt-2 space-y-1">
              {itemisedParts.map((item, i) => (
                <div key={i} className="flex justify-between items-center py-1 px-2 rounded" style={{ background: "var(--muted)", opacity: item.source === "estimated" ? 0.9 : 1 }}>
                  <div>
                    <span className="text-xs font-medium capitalize" style={{ color: "var(--foreground)" }}>{item.component}</span>
                    {item.source === "estimated" && (
                      <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>(est.)</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>${item.total.toLocaleString()}</span>
                    <span className="text-xs ml-1" style={{ color: "var(--muted-foreground)" }}>P:${item.parts_cost} L:${item.labour_cost}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 px-2 rounded font-bold" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--foreground)" }}>Itemised Total</span>
                <span className="text-xs" style={{ color: "var(--foreground)" }}>${itemisedParts.reduce((s, p) => s + p.total, 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FraudRiskDecision({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
  // Prefer the new deterministic weighted fraud score; fall back to AI pipeline score
  const wf = enforcement.weightedFraud;
  const riskLevel = wf?.level ?? enforcement.fraudLevelEnforced;
  const style = RISK_STYLE[riskLevel] ?? RISK_STYLE.moderate;
  const score = wf?.score ?? 0;
  const levelLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4" style={{ color: "var(--primary)" }} />
        <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>Fraud & Risk Decision</p>
        {wf && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${style.dot}20`, color: style.dot }}>
            Weighted Score
          </span>
        )}
      </div>

      {/* Score + explanation */}
      <div className="flex items-start gap-4 mb-4">
        <div className="shrink-0 flex flex-col items-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black"
            style={{ background: `${style.dot}20`, border: `3px solid ${style.dot}`, color: style.dot }}
          >
            {score}
          </div>
          <p className="text-xs mt-1 font-semibold" style={{ color: style.text }}>{levelLabel}</p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>/ 100</p>
        </div>
        <div className="flex-1">
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {wf?.explanation ?? enforcement.fraudLevelLabel}
          </p>
        </div>
      </div>

      {/* Weighted contributions breakdown */}
      {wf && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
            Score Breakdown — 5 Weighted Factors
          </p>
          <div className="space-y-1.5">
            {wf.full_contributions.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 p-2 rounded-lg"
                style={{
                  background: c.triggered
                    ? "oklch(0.55 0.22 25 / 0.08)"
                    : "oklch(0.45 0.04 155 / 0.06)",
                  border: c.triggered
                    ? "1px solid oklch(0.55 0.22 25 / 0.30)"
                    : "1px solid var(--border)",
                }}
              >
                <div className="shrink-0 w-8 text-center">
                  {c.triggered ? (
                    <span className="text-xs font-black" style={{ color: "#f87171" }}>+{c.value}</span>
                  ) : (
                    <span className="text-xs font-semibold" style={{ color: "#10b981" }}>0</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{c.factor}</p>
                  <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>{c.detail}</p>
                </div>
                <div className="shrink-0">
                  {c.triggered ? (
                    <span className="text-xs font-bold" style={{ color: "#f87171" }}>✗ TRIGGERED</span>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: "#10b981" }}>✓ CLEAR</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Total */}
          <div className="mt-2 flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: `${style.dot}15`, border: `1px solid ${style.dot}40` }}>
            <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>Total Fraud Score</span>
            <span className="text-sm font-black" style={{ color: style.dot }}>{score}/100 — {levelLabel}</span>
          </div>
        </div>
      )}

      {/* Enforcement adjustments from intelligence layer */}
      {(enforcement.consistencyFlag.fraudWeightIncrease > 0 || enforcement.directionFlag.mismatch) && (
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--muted-foreground)" }}>Intelligence Layer Adjustments</p>
          {enforcement.consistencyFlag.fraudWeightIncrease > 0 && (
            <p className="text-xs" style={{ color: "var(--foreground)" }}>
              +{enforcement.consistencyFlag.fraudWeightIncrease} pts applied for damage consistency anomaly ({enforcement.consistencyFlag.score}% consistency).
            </p>
          )}
          {enforcement.directionFlag.mismatch && (
            <p className="text-xs mt-1" style={{ color: "var(--foreground)" }}>
              Direction-damage mismatch detected: {enforcement.directionFlag.explanation}
            </p>
          )}
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

  // ── Snapshot auto-save: fires once when enforcement data first loads ──────
  const snapshotSaved = useRef(false);
  const saveSnapshotMutation = trpc.aiAssessments.saveSnapshot.useMutation();
  const { data: snapshotHistory = [] } = trpc.aiAssessments.getSnapshots.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const { data: latestSnapshot } = trpc.aiAssessments.getLatestSnapshot.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const [showSnapshotHistory, setShowSnapshotHistory] = useState(false);
  const [showSpecJson, setShowSpecJson] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [replayResult, setReplayResult] = useState<null | {
    original_verdict: string;
    new_verdict: string;
    changed: boolean;
    differences: Array<{ field: string; original: unknown; new: unknown }>;
    impact_analysis: string;
    replayed_at: string;
    original_snapshot_version: number;
    lifecycle_state?: string;
    is_final?: boolean;
    is_locked?: boolean;
  }>(null);

  // Lifecycle state
  const { data: lifecycle, refetch: refetchLifecycle } = trpc.aiAssessments.getLifecycle.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId }
  );
  const isLocked = lifecycle?.is_locked ?? false;
  const isFinal = lifecycle?.is_final ?? false;
  const lifecycleState = (lifecycle?.lifecycle_state ?? 'DRAFT') as string;

  // Governance: reason dialog state
  const [reasonDialog, setReasonDialog] = useState<{
    open: boolean;
    action: 'REVIEWED' | 'FINALISED' | 'LOCKED' | null;
    finalDecisionChoice?: 'FINALISE_CLAIM' | 'REVIEW_REQUIRED' | 'ESCALATE_INVESTIGATION';
    reason: string;
    error: string;
  }>({
    open: false,
    action: null,
    reason: '',
    error: '',
  });
  const [showAuditLog, setShowAuditLog] = useState(false);
  const { data: auditLog = [], refetch: refetchAuditLog } = trpc.aiAssessments.getAuditLog.useQuery(
    { claimId: String(claimId) },
    { enabled: !!claimId && showAuditLog }
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportValidationErrors, setExportValidationErrors] = useState<Array<{check: string; passed: boolean; detail: string}> | null>(null);
  const [showExportValidation, setShowExportValidation] = useState(false);

  const downloadAuditExport = async () => {
    if (!claimId) return;
    setIsExporting(true);
    setExportValidationErrors(null);
    setShowExportValidation(false);
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(String(claimId))}/audit-export.json`);
      if (res.status === 422) {
        // Pre-export validation gate blocked the export
        const body = await res.json() as { export_allowed: boolean; reason: string; checks: Array<{check: string; passed: boolean; detail: string}> };
        setExportValidationErrors(body.checks);
        setShowExportValidation(true);
        toast.error('Export blocked — missing or inconsistent audit data', {
          description: 'See the validation details below the action bar.',
          duration: 6000,
        });
        return;
      }
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const payloadHash = res.headers.get('X-Payload-Hash');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${claimId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Audit export downloaded${payloadHash ? ` · SHA-256: ${payloadHash.slice(0, 12)}…` : ''}`);
    } catch (err) {
      console.error('[AuditExport] Download failed:', err);
      toast.error('Failed to download audit export');
    } finally {
      setIsExporting(false);
    }
  };

  // Helper: open reason dialog
  const openReasonDialog = (
    action: 'REVIEWED' | 'FINALISED' | 'LOCKED',
    finalDecisionChoice?: 'FINALISE_CLAIM' | 'REVIEW_REQUIRED' | 'ESCALATE_INVESTIGATION'
  ) => {
    setReasonDialog({ open: true, action, finalDecisionChoice, reason: '', error: '' });
  };

  const markReviewedMutation = trpc.aiAssessments.markReviewed.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        toast.success("Decision marked as Reviewed");
      }
    },
    onError: (err) => toast.error(`Failed to mark reviewed: ${err.message}`),
  });

  const finaliseDecisionMutation = trpc.aiAssessments.finaliseDecision.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        const overrideMsg = data.override_flag ? ' ⚠️ Override recorded.' : '';
        toast.success(`Decision FINALISED — Snapshot #${data.authoritative_snapshot_id} created.${overrideMsg}`);
      }
    },
    onError: (err) => toast.error(`Finalise failed: ${err.message}`),
  });

  const lockDecisionMutation = trpc.aiAssessments.lockDecision.useMutation({
    onSuccess: (data) => {
      refetchLifecycle();
      refetchAuditLog();
      if (!data.action_allowed) {
        toast.error(`Governance blocked: ${data.validation_errors.join('; ')}`);
      } else {
        toast.success("Claim LOCKED — This is now an immutable legal record");
      }
    },
    onError: (err) => toast.error(`Lock failed: ${err.message}`),
  });

  // Submit reason dialog
  const submitReasonDialog = () => {
    const { action, finalDecisionChoice, reason } = reasonDialog;
    if (!reason || reason.trim().length < 10) {
      setReasonDialog(d => ({ ...d, error: 'Reason must be at least 10 characters.' }));
      return;
    }
    const aiVerdictDecision = (enforcement as any)?.finalDecision?.decision as string | undefined;
    if (action === 'REVIEWED') {
      markReviewedMutation.mutate({ claimId: String(claimId), reason });
    } else if (action === 'FINALISED' && finalDecisionChoice) {
      finaliseDecisionMutation.mutate({
        claimId: String(claimId),
        finalDecisionChoice,
        reason,
        aiDecision: aiVerdictDecision,
      });
    } else if (action === 'LOCKED') {
      lockDecisionMutation.mutate({ claimId: String(claimId), reason });
    }
    setReasonDialog({ open: false, action: null, reason: '', error: '' });
  };

  const replayMutation = trpc.aiAssessments.replayDecision.useMutation({
    onSuccess: (data) => {
      setReplayResult(data);
      setShowReplay(true);
      refetchLifecycle();
      if (data.changed) {
        toast.warning(`Logic drift detected — ${data.differences.length} field(s) changed`);
      } else {
        toast.success("No drift detected — decision is consistent with current logic");
      }
    },
    onError: (err) => toast.error(`Replay failed: ${err.message}`),
  });

  useEffect(() => {
    if (!enforcement || !aiAssessment || snapshotSaved.current) return;
    snapshotSaved.current = true;
    const e = enforcement as EnforcementResult;
    const pe = e.physicsEstimate;
    const ce = (enforcement as any).costExtraction;
    const wf = (enforcement as any).weightedFraud;
    const fd = e.finalDecision;
    const cb = e.confidenceBreakdown;
    const aiEstimateCents = (aiAssessment.estimatedCost ?? 0) * 100;
    const quotedCents = (quotesWithItems as any[]).length > 0
      ? Math.max(...(quotesWithItems as any[]).map((q: any) => q.quotedAmount ?? 0)) * 100
      : 0;
    const deviationPct = aiEstimateCents > 0 && quotedCents > 0
      ? ((quotedCents - aiEstimateCents) / aiEstimateCents) * 100
      : 0;
    saveSnapshotMutation.mutate({
      claimId: String(claimId),
      verdict: {
        decision: fd?.decision ?? 'REVIEW_REQUIRED',
        primaryReason: fd?.primaryReason ?? 'Insufficient data for automatic decision',
        confidence: cb?.score ?? aiAssessment.confidenceScore ?? 0,
      },
      cost: {
        aiEstimate: aiEstimateCents,
        quoted: quotedCents,
        deviationPercent: Math.round(deviationPct),
        fairRangeMin: ce?.fair_range?.min ?? Math.round(aiEstimateCents * 0.85),
        fairRangeMax: ce?.fair_range?.max ?? Math.round(aiEstimateCents * 1.15),
        verdict: ce?.verdict ?? 'FAIR',
      },
      fraud: {
        score: wf?.score ?? (aiAssessment as any).fraudRiskScore ?? 0,
        level: wf?.level ?? e.fraudLevelEnforced ?? 'minimal',
        contributions: wf?.contributions ?? [],
      },
      physics: {
        deltaV: pe?.deltaVKmh ?? 0,
        velocityRange: pe ? `${pe.velocityRangeKmh.min}–${pe.velocityRangeKmh.max} km/h` : 'Not calculated',
        energyKj: pe?.estimatedEnergyKj ?? 0,
        forceKn: pe?.estimatedForceKn ?? 0,
        estimated: pe?.estimated ?? false,
      },
      damage: {
        zones: e.directionFlag?.damageZones ?? [],
        severity: aiAssessment.structuralDamageSeverity ?? 'unknown',
        consistencyScore: e.consistencyFlag?.score ?? 0,
      },
      enforcementTrace: fd?.ruleTrace?.map((r: any) => ({
        rule: r.rule,
        value: r.value,
        threshold: r.threshold,
        triggered: r.triggered,
      })) ?? [],
      confidenceBreakdown: cb?.penalties?.map((p: any) => ({
        factor: p.reason,
        penalty: p.deduction,
      })) ?? [],
      dataQuality: {
        missingFields: (e.costBenchmark as any)?.missingFields ?? [],
        estimatedFields: pe ? ['velocity', 'force', 'energy'] : [],
        extractionConfidence: aiAssessment.confidenceScore ?? 0,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enforcement, aiAssessment]);

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

        {/* 7. Snapshot History */}
        {(snapshotHistory as any[]).length > 0 && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--card)", color: "var(--foreground)" }}
              onClick={() => setShowSnapshotHistory(v => !v)}
            >
              <span style={{ color: "var(--muted-foreground)" }}>
                <FileText className="inline h-3.5 w-3.5 mr-1.5" />
                Decision Snapshot History ({(snapshotHistory as any[]).length} version{(snapshotHistory as any[]).length !== 1 ? 's' : ''})
              </span>
              {showSnapshotHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSnapshotHistory && (
              <div className="divide-y" style={{ borderTop: "1px solid var(--border)", background: "var(--background)" }}>
                {(snapshotHistory as any[]).map((snap: any) => (
                  <div key={snap.id} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold mb-0.5" style={{ color: "var(--foreground)" }}>
                        v{snap.version} — {snap.verdict.decision.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                        {snap.verdict.primaryReason}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {new Date(snap.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Fraud {snap.fraud.score}/100 · ${((snap.cost.aiEstimate ?? 0) / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7b. Spec JSON Viewer */}
        {latestSnapshot && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--card)", color: "var(--foreground)" }}
              onClick={() => setShowSpecJson(v => !v)}
            >
              <span className="flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                <Code className="inline h-3.5 w-3.5" />
                Audit Snapshot — Spec JSON (v{latestSnapshot.snapshot_version})
              </span>
              {showSpecJson ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSpecJson && (
              <div className="p-4" style={{ background: "var(--background)", borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                    Immutable snapshot · snake_case · no null fields
                  </p>
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--muted)", color: "var(--foreground)" }}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(latestSnapshot, null, 2));
                      toast.success("Snapshot JSON copied to clipboard");
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
                <pre
                  className="text-xs overflow-auto rounded p-3"
                  style={{
                    background: "oklch(0.15 0.02 250)",
                    color: "#a5f3fc",
                    maxHeight: "400px",
                    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                    lineHeight: "1.5",
                  }}
                >
                  {JSON.stringify(latestSnapshot, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 7c. Decision Replay Panel */}
        {latestSnapshot && (
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: "var(--card)" }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>
                <GitCompareArrows className="h-3.5 w-3.5" />
                Decision Replay — Logic Drift Detection
              </span>
              <div className="flex items-center gap-2">
                {replayResult && (
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: "var(--muted)", color: "var(--foreground)" }}
                    onClick={() => setShowReplay(v => !v)}
                  >
                    {showReplay ? "Hide Results" : "Show Results"}
                  </button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={replayMutation.isPending}
                  onClick={() => replayMutation.mutate({ claimId: String(claimId) })}
                >
                  {replayMutation.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Replaying...</>
                  ) : (
                    <><GitCompareArrows className="h-3.5 w-3.5 mr-1" /> Run Replay</>
                  )}
                </Button>
              </div>
            </div>

            {showReplay && replayResult && (
              <div className="p-4" style={{ background: "var(--background)", borderTop: "1px solid var(--border)" }}>
                {/* Header row */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background: replayResult.changed ? "oklch(0.35 0.12 30)" : "oklch(0.25 0.08 145)",
                      color: replayResult.changed ? "#fca5a5" : "#86efac",
                    }}
                  >
                    {replayResult.changed ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    {replayResult.changed
                      ? `Logic Drift Detected — ${replayResult.differences.length} field(s) changed`
                      : "No Drift — Decision Consistent"}
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Replayed at {new Date(replayResult.replayed_at).toLocaleString()} · Original v{replayResult.original_snapshot_version}
                  </span>
                </div>

                {/* Verdict comparison */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Original Verdict</p>
                    <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                      {replayResult.original_verdict.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "var(--card)", border: `1px solid ${replayResult.changed && replayResult.original_verdict !== replayResult.new_verdict ? "oklch(0.65 0.2 30)" : "var(--border)"}` }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Replayed Verdict</p>
                    <p className="text-sm font-bold" style={{ color: replayResult.original_verdict !== replayResult.new_verdict ? "#fca5a5" : "var(--foreground)" }}>
                      {replayResult.new_verdict.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {/* Differences table */}
                {replayResult.differences.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Field Differences</p>
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: "var(--muted)" }}>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Field</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Original</th>
                            <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--muted-foreground)" }}>Replayed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {replayResult.differences.map((diff, i) => (
                            <tr key={diff.field} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--background)" }}>
                              <td className="px-3 py-2 font-mono font-semibold" style={{ color: "#a5f3fc" }}>{diff.field}</td>
                              <td className="px-3 py-2" style={{ color: "#fca5a5" }}>{JSON.stringify(diff.original)}</td>
                              <td className="px-3 py-2" style={{ color: "#86efac" }}>{JSON.stringify(diff.new)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Impact analysis */}
                <div className="rounded-lg p-3" style={{ background: "oklch(0.15 0.02 250)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Impact Analysis</p>
                  <pre
                    className="text-xs whitespace-pre-wrap"
                    style={{ color: "#e2e8f0", fontFamily: "inherit", lineHeight: "1.6" }}
                  >
                    {replayResult.impact_analysis}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. Lifecycle Status Bar */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${isLocked ? "oklch(0.65 0.2 30)" : isFinal ? "oklch(0.65 0.18 145)" : "var(--border)"}` }}>
          {/* State progress track */}
          <div className="flex items-stretch" style={{ background: "var(--muted)", minHeight: "44px" }}>
            {(["DRAFT", "REVIEWED", "FINALISED", "LOCKED"] as const).map((state, i) => {
              const stateOrder = ["DRAFT", "REVIEWED", "FINALISED", "LOCKED"];
              const currentIdx = stateOrder.indexOf(lifecycleState);
              const isActive = lifecycleState === state;
              const isPast = stateOrder.indexOf(state) < currentIdx;
              const stateIcons = { DRAFT: FileText, REVIEWED: Eye, FINALISED: Gavel, LOCKED: Lock };
              const Icon = stateIcons[state];
              return (
                <div
                  key={state}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2"
                  style={{
                    background: isActive
                      ? state === "LOCKED" ? "oklch(0.35 0.12 30)" : state === "FINALISED" ? "oklch(0.25 0.08 145)" : "oklch(0.25 0.06 250)"
                      : "transparent",
                    color: isActive
                      ? state === "LOCKED" ? "#fca5a5" : state === "FINALISED" ? "#86efac" : "#93c5fd"
                      : isPast ? "var(--foreground)" : "var(--muted-foreground)",
                    borderRight: i < 3 ? "1px solid var(--border)" : undefined,
                    opacity: isPast ? 0.7 : 1,
                  }}
                >
                  <Icon className="h-3 w-3" />
                  {state}
                  {isPast && <CheckCircle className="h-3 w-3" style={{ color: "#86efac" }} />}
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 p-4" style={{ background: "var(--card)" }}>
            <div>
              {isLocked ? (
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" style={{ color: "#fca5a5" }} />
                  <span className="text-sm font-semibold" style={{ color: "#fca5a5" }}>LOCKED — Immutable Legal Record</span>
                </div>
              ) : isFinal ? (
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4" style={{ color: "#86efac" }} />
                  <span className="text-sm font-semibold" style={{ color: "#86efac" }}>FINALISED — {lifecycle?.final_decision_choice?.replace(/_/g, " ") ?? "Decision recorded"}</span>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>Decision Lifecycle</p>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Advance the state to create an auditable decision trail.</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* REVIEWED button — only when DRAFT */}
              {lifecycleState === "DRAFT" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markReviewedMutation.isPending}
                  onClick={() => openReasonDialog('REVIEWED')}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Mark Reviewed
                </Button>
              )}

              {/* FINALISE buttons — when DRAFT or REVIEWED */}
              {(lifecycleState === "DRAFT" || lifecycleState === "REVIEWED") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={finaliseDecisionMutation.isPending}
                    onClick={() => openReasonDialog('FINALISED', 'REVIEW_REQUIRED')}
                  >
                    <Gavel className="h-3.5 w-3.5 mr-1" />
                    Review Required
                  </Button>
                  <Button
                    size="sm"
                    disabled={finaliseDecisionMutation.isPending}
                    onClick={() => openReasonDialog('FINALISED', 'FINALISE_CLAIM')}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Finalise Claim
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={finaliseDecisionMutation.isPending}
                    style={{ borderColor: "oklch(0.65 0.2 30)", color: "#fca5a5" }}
                    onClick={() => openReasonDialog('FINALISED', 'ESCALATE_INVESTIGATION')}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                    Escalate
                  </Button>
                </>
              )}

              {/* LOCK button — only when FINALISED */}
              {lifecycleState === "FINALISED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={lockDecisionMutation.isPending}
                  style={{ borderColor: "oklch(0.65 0.2 30)", color: "#fca5a5" }}
                  onClick={() => openReasonDialog('LOCKED')}
                >
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  Lock Decision
                </Button>
              )}

              {/* Download Audit Export */}
              <Button
                size="sm"
                variant="outline"
                onClick={downloadAuditExport}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                {isExporting ? 'Exporting…' : 'Export Audit'}
              </Button>

              {/* Audit Log toggle */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowAuditLog(v => !v); refetchAuditLog(); }}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Audit Log
              </Button>

              {/* Full Report link */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLocation(`/insurer/claims/${claimId}/comparison`)}
              >
                Full Report →
              </Button>
            </div>
          </div>
        </div>

        {/* Export Validation Gate Panel — shown when export is blocked */}
        {showExportValidation && exportValidationErrors && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid oklch(0.55 0.22 30)", background: "oklch(0.18 0.06 30 / 0.5)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ background: "oklch(0.22 0.08 30 / 0.7)" }}>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" style={{ color: "#fca5a5" }} />
                <span className="text-sm font-semibold" style={{ color: "#fca5a5" }}>Export Blocked — Validation Failed</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "oklch(0.30 0.10 30)", color: "#fca5a5" }}>
                  {exportValidationErrors.filter(c => !c.passed).length} check{exportValidationErrors.filter(c => !c.passed).length !== 1 ? 's' : ''} failed
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowExportValidation(false)}>Dismiss</Button>
            </div>
            <div className="p-4 space-y-2">
              {exportValidationErrors.map((check, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5" style={{ background: check.passed ? "oklch(0.20 0.06 150 / 0.4)" : "oklch(0.20 0.08 30 / 0.4)", border: `1px solid ${check.passed ? "oklch(0.40 0.12 150)" : "oklch(0.45 0.18 30)"}` }}>
                  {check.passed
                    ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#86efac" }} />
                    : <XCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#fca5a5" }} />
                  }
                  <div>
                    <p className="text-xs font-mono font-semibold" style={{ color: check.passed ? "#86efac" : "#fca5a5" }}>{check.check}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{check.detail}</p>
                  </div>
                </div>
              ))}
              <p className="text-xs pt-1" style={{ color: "var(--muted-foreground)" }}>
                Resolve the failed checks above, then click <strong>Export Audit</strong> again.
              </p>
            </div>
          </div>
        )}

        {/* 9. Governance Audit Log */}
        {showAuditLog && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--muted)" }}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: "#93c5fd" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Governance Audit Log</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "oklch(0.25 0.06 250)", color: "#93c5fd" }}>
                  {auditLog.length} {auditLog.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowAuditLog(false)}>Close</Button>
            </div>
            <div className="p-4" style={{ background: "var(--card)" }}>
              {auditLog.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: "var(--muted-foreground)" }}>No governance actions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg p-3"
                      style={{
                        background: "var(--background)",
                        border: `1px solid ${entry.overrideFlag ? "oklch(0.65 0.2 30)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{
                              background: entry.action === 'LOCKED' ? "oklch(0.25 0.08 30)"
                                : entry.action === 'FINALISED' ? "oklch(0.2 0.06 145)"
                                : entry.action === 'REVIEWED' ? "oklch(0.2 0.05 250)"
                                : "oklch(0.2 0.04 280)",
                              color: entry.action === 'LOCKED' ? "#fca5a5"
                                : entry.action === 'FINALISED' ? "#86efac"
                                : entry.action === 'REVIEWED' ? "#93c5fd"
                                : "#c4b5fd",
                            }}
                          >
                            {entry.action}
                          </span>
                          {entry.overrideFlag && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "oklch(0.25 0.1 50)", color: "#fbbf24" }}>
                              ⚠️ OVERRIDE
                            </span>
                          )}
                          {!entry.actionAllowed && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "oklch(0.2 0.08 30)", color: "#fca5a5" }}>
                              BLOCKED
                            </span>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          <span className="font-semibold" style={{ color: "var(--foreground)" }}>By:</span> {entry.performedByName ?? entry.performedBy}
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          <span className="font-semibold" style={{ color: "var(--foreground)" }}>Reason:</span> {entry.reason}
                        </p>
                        {entry.overrideFlag && entry.aiDecision && entry.humanDecision && (
                          <p className="text-xs" style={{ color: "#fbbf24" }}>
                            <span className="font-semibold">Override:</span> AI recommended “{entry.aiDecision.replace(/_/g, ' ')}” → Human chose “{entry.humanDecision.replace(/_/g, ' ')}”
                          </p>
                        )}
                        {entry.validationErrors.length > 0 && (
                          <p className="text-xs" style={{ color: "#fca5a5" }}>
                            <span className="font-semibold">Blocked:</span> {entry.validationErrors.join('; ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reason Dialog (Governance Rule 1 — mandatory justification) */}
      {reasonDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setReasonDialog(d => ({ ...d, open: false })); }}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md mx-4"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{
                  background: reasonDialog.action === 'LOCKED' ? "oklch(0.25 0.08 30)"
                    : reasonDialog.action === 'FINALISED' ? "oklch(0.2 0.06 145)"
                    : "oklch(0.2 0.05 250)",
                }}
              >
                {reasonDialog.action === 'LOCKED' ? <Lock className="h-4 w-4" style={{ color: "#fca5a5" }} />
                  : reasonDialog.action === 'FINALISED' ? <Gavel className="h-4 w-4" style={{ color: "#86efac" }} />
                  : <Eye className="h-4 w-4" style={{ color: "#93c5fd" }} />}
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
                  {reasonDialog.action === 'REVIEWED' ? 'Mark Decision as Reviewed'
                    : reasonDialog.action === 'LOCKED' ? 'Lock Claim — Immutable Record'
                    : `Finalise: ${(reasonDialog.finalDecisionChoice ?? '').replace(/_/g, ' ')}`}
                </h3>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>A written justification is required (min. 10 characters)</p>
              </div>
            </div>

            <textarea
              className="w-full rounded-lg p-3 text-sm resize-none"
              rows={4}
              placeholder="Enter your reason for this action..."
              value={reasonDialog.reason}
              onChange={(e) => setReasonDialog(d => ({ ...d, reason: e.target.value, error: '' }))}
              style={{
                background: "var(--background)",
                border: `1px solid ${reasonDialog.error ? "oklch(0.65 0.2 30)" : "var(--border)"}`,
                color: "var(--foreground)",
                outline: "none",
              }}
              autoFocus
            />

            <div className="flex items-center justify-between mt-1 mb-4">
              <span className="text-xs" style={{ color: reasonDialog.error ? "#fca5a5" : "var(--muted-foreground)" }}>
                {reasonDialog.error || `${reasonDialog.reason.trim().length} / 10 characters minimum`}
              </span>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReasonDialog(d => ({ ...d, open: false }))}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={reasonDialog.reason.trim().length < 10}
                onClick={submitReasonDialog}
                style={{
                  background: reasonDialog.action === 'LOCKED' ? "oklch(0.45 0.15 30)"
                    : reasonDialog.action === 'FINALISED' ? "oklch(0.4 0.12 145)"
                    : undefined,
                }}
              >
                Confirm {reasonDialog.action}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
