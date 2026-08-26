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
import { useRoute, useLocation, useSearch } from "wouter";
import { ReportChooser, type ReportView } from "@/components/ReportChooser";
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
import { sanitiseField } from "@/lib/sanitise";
import { currencySymbol } from "@/lib/currency";
import { getKingaClaimsReportAudience } from "@/lib/reportAudience";
import {
  Phase3DecisionBox,
  DataCompletenessDashboard,
  ComponentHeatmap,
  CostComparisonChart,
  PhysicsConsistencyGauge,
  PhotoGallery,
  KINGAAuditTrail,
  runR7SanityChecks,
} from "@/components/Phase3ReportComponents";
import { ForensicAuditReport } from "@/components/ForensicAuditReport";
import { KingaClaimsReport } from "@/components/KingaClaimsReport";
import { ClaimDecisionReportStandardView } from "@/components/ClaimDecisionReportStandardView";
import {
  ReportPageHeader,
  ReportSectionDivider,
  ReportIntegritySeal,
  AdjusterSignOffPanel,
} from "@/components/Batch3ReportComponents";
// Removed: DecisionNarrativeView, ForensicAuditValidationPanel (pre-report panels removed)
import { MultiQuoteComparisonPanel } from "@/components/MultiQuoteComparisonPanel";
import ClaimsExplanationPanel from "@/components/ClaimsExplanationPanel";
import DecisionAuthorityPanel from "@/components/DecisionAuthorityPanel";
import EscalationRoutingPanel from "@/components/EscalationRoutingPanel";
import { PhysicsAnalysisChart } from "@/components/PhysicsAnalysisChart";
import { RepairIntelligencePanel } from "@/components/RepairIntelligencePanel";
import { RepairReplacePanel } from "@/components/RepairReplacePanel";
import { ClaimCommentThread } from "@/components/ClaimCommentThread";


// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnforcementResult {
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
  minimal:  { bg: "var(--fp-success-bg)",   border: "var(--fp-success-border)",       text: "var(--fp-success-text)", badge: "bg-emerald-600", dot: "var(--fp-success-text)" },
  low:      { bg: "var(--fp-success-bg)",   border: "var(--fp-success-border)",       text: "var(--fp-success-text)", badge: "bg-green-600",   dot: "var(--fp-success-text)" },
  // 'medium' is the legacy DB enum value — kept as alias for 'moderate'
  medium:   { bg: "var(--status-review-bg)", border: "var(--status-review-border)",  text: "var(--fp-warning-text)", badge: "bg-amber-600",  dot: "var(--fp-warning-text)" },
  moderate: { bg: "var(--status-review-bg)", border: "var(--status-review-border)",  text: "var(--fp-warning-text)", badge: "bg-amber-600",  dot: "var(--fp-warning-text)" },
  high:     { bg: "var(--fp-warning-bg)",   border: "var(--fp-warning-border)",       text: "var(--fp-warning-text)", badge: "bg-orange-600", dot: "var(--fp-warning-text)" },
  // 'critical' is the legacy DB enum value — kept as alias for 'elevated'
  critical: { bg: "var(--fp-critical-bg)",  border: "var(--status-reject-border)",   text: "var(--fp-critical-text)", badge: "bg-red-700",    dot: "var(--fp-critical-text)" },
  elevated: { bg: "var(--fp-critical-bg)",  border: "var(--status-reject-border)",   text: "var(--fp-critical-text)", badge: "bg-red-700",    dot: "var(--fp-critical-text)" },
};

const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
  none:         { color: "var(--fp-success-text)", label: "No Damage" },
  minor:        { color: "var(--fp-success-text)", label: "Minor" },
  moderate:     { color: "var(--fp-warning-text)", label: "Moderate" },
  severe:       { color: "var(--fp-warning-text)", label: "Severe" },
  catastrophic: { color: "var(--fp-critical-text)", label: "Catastrophic" },
  total_loss:   { color: "var(--fp-critical-text)", label: "Total Loss" },
  unknown:      { color: "var(--muted-foreground)", label: "Unknown" },
};

const ALERT_STYLE: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  critical: { bg: "var(--fp-critical-bg)", border: "var(--fp-critical-border)", icon: "var(--fp-critical-text)", label: "CRITICAL" },
  warning:  { bg: "var(--fp-warning-bg)", border: "var(--fp-warning-border)", icon: "var(--fp-warning-text)", label: "WARNING"  },
  info:     { bg: "var(--fp-info-bg)", border: "var(--fp-info-border)", icon: "var(--fp-info-text)", label: "INFO"   },
};

// ─── Cost verdict helper ──────────────────────────────────────────────────────

function computeCostVerdict(
  aiCostDollars: number,
  fairMin: number,
  fairMax: number,
  quotedAmounts: number[],
  sym: string = '$'
): { verdict: "UNDERPRICED" | "FAIR" | "OVERPRICED"; color: string; Icon: typeof TrendingUp; explanation: string } {
  // All values are in dollars/currency units
  const aiCost = aiCostDollars;
  const compareAmount = quotedAmounts.length > 0
    ? quotedAmounts.reduce((a, b) => a + b, 0) / quotedAmounts.length
    : aiCost;

  if (compareAmount > fairMax * 1.15) {
    return {
      verdict: "OVERPRICED",
      color: "var(--fp-critical-text)",
      Icon: TrendingUp,
      explanation: quotedAmounts.length > 0
        ? `The submitted quote of ${sym}${compareAmount.toLocaleString()} exceeds the fair cost ceiling of ${sym}${fairMax.toLocaleString()} by ${Math.round(((compareAmount - fairMax) / fairMax) * 100)}%.`
        : `The KINGA estimate of ${sym}${aiCost.toLocaleString()} is above the expected fair range for this damage profile.`,
    };
  }
  if (compareAmount < fairMin * 0.85) {
    return {
      verdict: "UNDERPRICED",
      color: "var(--fp-warning-text)",
      Icon: TrendingDown,
      explanation: quotedAmounts.length > 0
        ? `The submitted quote of ${sym}${compareAmount.toLocaleString()} is significantly below the fair cost floor of ${sym}${fairMin.toLocaleString()}. This may indicate incomplete scope of work.`
        : `The KINGA estimate is below the expected fair range — verify that all damage components are captured.`,
    };
  }
  return {
    verdict: "FAIR",
    color: "var(--fp-success-text)",
    Icon: Minus,
    explanation: quotedAmounts.length > 0
      ? `The submitted quote of ${sym}${compareAmount.toLocaleString()} falls within the fair cost range of ${sym}${fairMin.toLocaleString()}–${sym}${fairMax.toLocaleString()}.`
      : `The KINGA estimate of ${sym}${aiCost.toLocaleString()} is consistent with the expected cost for this damage profile.`,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section heading divider for the report layout */
export function SectionHeading({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--fp-info-bg)" }}>
        <Icon className="h-4 w-4" style={{ color: "var(--primary)" }} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold tracking-tight" style={{ color: "var(--foreground)" }}>{title}</p>
        {subtitle && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{subtitle}</p>}
      </div>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

// ─── Final Decision Banner ────────────────────────────────────────────────────

export function FinalDecisionBanner({ finalDecision, confidenceScore }: {
  finalDecision: NonNullable<EnforcementResult["finalDecision"]>;
  confidenceScore: number;
}) {
  const { decision, label, color, primaryReason } = finalDecision;
  const cfg = {
    green: { bg: "var(--fp-success-bg)", border: "var(--fp-success-border)", text: "var(--fp-success-text)", Icon: CheckCircle },
    amber: { bg: "var(--fp-warning-bg)",  border: "var(--status-review-border)",  text: "var(--fp-warning-text)", Icon: AlertTriangle },
    red:   { bg: "var(--fp-critical-bg)",  border: "var(--status-reject-border)",  text: "var(--fp-critical-text)", Icon: AlertTriangle },
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

export function ConfidenceBreakdownPanel({ confidenceBreakdown }: { confidenceBreakdown: NonNullable<EnforcementResult["confidenceBreakdown"]> }) {
  const { score, penalties, summary } = confidenceBreakdown;
  const scoreColor = score >= 85 ? "var(--fp-success-text)" : score >= 70 ? "var(--fp-warning-text)" : "var(--fp-critical-text)";
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
              <span className="font-black shrink-0" style={{ color: "var(--fp-critical-text)" }}>−{p.deduction}</span>
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

export function RuleTracePanel({ ruleTrace }: { ruleTrace: NonNullable<EnforcementResult["finalDecision"]>["ruleTrace"] }) {
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
            <div key={i} className="flex items-center gap-2 text-xs rounded px-2 py-1.5" style={{ background: r.triggered ? "var(--fp-warning-bg)" : "var(--muted)", border: r.triggered ? "1px solid var(--fp-warning-border)" : "1px solid transparent" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: r.triggered ? "var(--fp-warning-text)" : "var(--muted-foreground)", color: r.triggered ? "var(--background)" : "var(--background)" }}>{r.triggered ? "!" : "✓"}</span>
              <span className="flex-1" style={{ color: "var(--foreground)" }}>{r.rule}</span>
              <span className="tabular-nums px-1.5 py-0.5 rounded" style={{ background: r.triggered ? "var(--fp-warning-bg)" : "var(--muted)", color: r.triggered ? "var(--fp-warning-text)" : "var(--muted-foreground)" }}>{String(r.value)}</span>
              <span style={{ color: "var(--muted-foreground)" }}>vs</span>
              <span className="tabular-nums" style={{ color: "var(--muted-foreground)" }}>{r.threshold}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VerdictBanner({ assessment, enforcement, quotes, claimCurrencyCode }: { assessment: any; enforcement: EnforcementResult; quotes: any[]; claimCurrencyCode?: string }) {
  const riskLevel = enforcement.fraudLevelEnforced;
  const style = RISK_STYLE[riskLevel] ?? RISK_STYLE.moderate;
  const severityKey = assessment.structuralDamageSeverity ?? "unknown";
  const severity = SEVERITY_STYLE[severityKey] ?? SEVERITY_STYLE.unknown;
  const confidence = enforcement.confidenceBreakdown?.score ?? assessment.confidenceScore ?? 0;
  // quotedAmount is in cents — divide by 100; estimatedCost is in dollars — pass directly
  const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100);
  const costVerdict = computeCostVerdict(
    assessment.estimatedCost ?? 0,  // already in dollars
    enforcement.costBenchmark.estimatedFairMin,
    enforcement.costBenchmark.estimatedFairMax,
    quotedAmounts,
    currencySymbol(claimCurrencyCode)
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
              {enforcement.fraudLevelLabel.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} Risk
            </h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>KINGA Confidence</p>
          <p className="text-3xl font-black" style={{ color: "var(--foreground)" }}>{confidence}%</p>
        </div>
      </div>

      {/* Three verdict pills */}
      <div className="grid grid-cols-3 gap-3">
        {/* Cost verdict */}
        <div className="rounded-lg p-3" style={{ background: "var(--fp-subtle-bg)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <CostIcon className="h-3.5 w-3.5 shrink-0" style={{ color: costVerdict.color }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: costVerdict.color }}>
              {costVerdict.verdict}
            </p>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>Repair Cost</p>
        </div>

        {/* Damage severity */}
        <div className="rounded-lg p-3" style={{ background: "var(--fp-subtle-bg)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Car className="h-3.5 w-3.5 shrink-0" style={{ color: severity.color }} />
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: severity.color }}>
              {severity.label}
            </p>
          </div>
          <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>Damage Severity</p>
        </div>

        {/* Fraud level */}
        <div className="rounded-lg p-3" style={{ background: "var(--fp-subtle-bg)", border: "1px solid var(--border)" }}>
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

export function CriticalAlerts({ alerts }: { alerts: EnforcementResult["alerts"] }) {
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

export function WhatHappened({ assessment, enforcement, claim }: { assessment: any; enforcement: EnforcementResult; claim: any }) {
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
    `The KINGA damage assessment identified ${components.length} affected components: ${componentList}.`,
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
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "var(--fp-info-bg)", color: "var(--fp-info-text)" }}>
          KINGA Reconstructed
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{narrative}</p>
      {assessment.damageDescription && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Original KINGA Description</p>
          <p className="text-xs leading-relaxed italic" style={{ color: "var(--muted-foreground)" }}>{sanitiseField(assessment.damageDescription)}</p>
        </div>
      )}
    </div>
  );
}

export function DamageImpact({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
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
            <rect x="25" y="10" width="50" height="80" rx="12" fill="var(--fp-vehicle-body)" stroke="var(--fp-vehicle-stroke)" strokeWidth="2" />
            {/* Windshield */}
            <rect x="30" y="16" width="40" height="18" rx="4" fill="var(--fp-vehicle-glass)" opacity="0.6" />
            {/* Rear window */}
            <rect x="30" y="66" width="40" height="14" rx="4" fill="var(--fp-vehicle-glass)" opacity="0.6" />
            {/* Wheels */}
            <rect x="14" y="18" width="12" height="18" rx="3" fill="var(--fp-vehicle-wheel)" stroke="var(--fp-vehicle-stroke)" strokeWidth="1.5" />
            <rect x="74" y="18" width="12" height="18" rx="3" fill="var(--fp-vehicle-wheel)" stroke="var(--fp-vehicle-stroke)" strokeWidth="1.5" />
            <rect x="14" y="64" width="12" height="18" rx="3" fill="var(--fp-vehicle-wheel)" stroke="var(--fp-vehicle-stroke)" strokeWidth="1.5" />
            <rect x="74" y="64" width="12" height="18" rx="3" fill="var(--fp-vehicle-wheel)" stroke="var(--fp-vehicle-stroke)" strokeWidth="1.5" />
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
          background: enforcement.directionFlag.mismatch ? "var(--fp-warning-bg)" : "var(--fp-success-bg)",
          border: `1px solid ${enforcement.directionFlag.mismatch ? "var(--fp-warning-border)" : "var(--fp-match-border)"}`,
          color: "var(--foreground)",
        }}
      >
        {enforcement.directionFlag.mismatch
          ? <><span className="font-bold" style={{ color: "var(--fp-warn-text)" }}>⚠ Mismatch: </span>{enforcement.directionFlag.explanation}</>
          : <><span className="font-bold" style={{ color: "var(--fp-success-text)" }}>✓ Consistent: </span>{enforcement.directionFlag.explanation}</>
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
                style={{ background: "var(--fp-badge-bg)", color: "var(--foreground)", border: "1px solid var(--border)" }}
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
        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--fp-critical-bg)", border: "1px solid var(--fp-critical-border)" }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "var(--fp-critical-text)" }} />
          <p className="text-xs" style={{ color: "var(--foreground)" }}>
            <span className="font-bold" style={{ color: "var(--fp-critical-text)" }}>Structural damage detected.</span> Frame or unibody inspection required before repair authorisation.
          </p>
        </div>
      )}
    </div>
  );
}

export function CostDecision({ assessment, enforcement, quotes, claimCurrencyCode }: { assessment: any; enforcement: EnforcementResult & { costExtraction?: any }; quotes: any[]; claimCurrencyCode?: string }) {
  const sym = currencySymbol(claimCurrencyCode);
  const [showItemised, setShowItemised] = useState(false);
  // Use guaranteed costExtraction object if available, fall back to raw assessment fields
  const ce = enforcement.costExtraction;
  // estimatedCost/Parts/Labor are stored in dollars — do NOT divide by 100
  const aiCost = ce ? ce.ai_estimate : (assessment.estimatedCost ?? 0);
  const partsCost = ce ? ce.parts : (assessment.estimatedPartsCost ?? 0);
  const labourCost = ce ? ce.labour : (assessment.estimatedLaborCost ?? 0);
  const fairMin = ce ? ce.fair_range.min : enforcement.costBenchmark.estimatedFairMin;
  const fairMax = ce ? ce.fair_range.max : enforcement.costBenchmark.estimatedFairMax;
  const confidence = ce ? ce.confidence : (assessment.confidenceScore ?? 75);
  const itemisedParts: Array<{ component: string; parts_cost: number; labour_cost: number; total: number; source: string }> = ce?.itemised_parts ?? [];
  const basis = ce ? ce.basis : enforcement.costBenchmark.basis;
  const dataSource = ce?.source ?? "extracted";

  const quotedAmounts = quotes.map((q: any) => (q.quotedAmount || 0) / 100);
  // aiCost is already in dollars — pass directly to computeCostVerdict (which also expects dollars)
  const costVerdict = computeCostVerdict(aiCost, fairMin, fairMax, quotedAmounts, sym);
  const { Icon: CostIcon } = costVerdict;

  // Confidence colour
  const confColor = confidence >= 80 ? "var(--fp-success-text)" : confidence >= 60 ? "var(--fp-warn-text)" : "var(--fp-critical-text)";
  // Reconciliation check: if parts + labour don't add up to aiCost, show a note
  const computedTotal = partsCost + labourCost;
  const hasReconciliationGap = computedTotal > 0 && Math.abs(computedTotal - aiCost) > 1;
  const sourceLabel: Record<string, string> = {
    extracted: "KINGA Extracted",
    estimated: "KINGA + Estimated",
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
          <span className="text-sm font-black" style={{ color: "var(--foreground)" }}>{sym}{aiCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Parts</span>
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{sym}{partsCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Labour</span>
          <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{sym}{labourCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        {quotedAmounts.length > 0 && (
          <div className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Panel Beater Quote{quotedAmounts.length > 1 ? "s" : ""}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
              {quotedAmounts.length === 1
                ? `${sym}${quotedAmounts[0].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${sym}${Math.min(...quotedAmounts).toLocaleString()} – ${sym}${Math.max(...quotedAmounts).toLocaleString()}`
              }
            </span>
          </div>
        )}
      </div>

      {/* Reconciliation note */}
      {hasReconciliationGap && (
        <div className="mb-2 px-2 py-1.5 rounded text-xs" style={{ background: "var(--fp-warn-bg)", color: "var(--fp-warn-text)", border: "1px solid var(--fp-warn-border)" }}>
          ⚠ Note: Parts ({sym}{partsCost.toLocaleString()}) + Labour ({sym}{labourCost.toLocaleString()}) = {sym}{computedTotal.toLocaleString()} — differs from KINGA total estimate of {sym}{aiCost.toLocaleString()}. The KINGA total is used as the authoritative figure.
        </div>
      )}

      {/* Fair range bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
          <span>Fair Range</span>
          <span>{sym}{fairMin.toLocaleString()} – {sym}{fairMax.toLocaleString()}</span>
        </div>
        <div className="relative h-2 rounded-full" style={{ background: "var(--muted)" }}>
          <div
            className="absolute h-2 rounded-full"
            style={{ left: "10%", width: "80%", background: "linear-gradient(90deg, var(--fp-success-text), var(--fp-success-text))", opacity: 0.4 }}
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
                    <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{sym}{item.total.toLocaleString()}</span>
                    <span className="text-xs ml-1" style={{ color: "var(--muted-foreground)" }}>Parts: {sym}{item.parts_cost.toLocaleString()} · Labour: {sym}{item.labour_cost.toLocaleString()}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 px-2 rounded font-bold" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--foreground)" }}>Itemised Total</span>
                <span className="text-xs" style={{ color: "var(--foreground)" }}>{sym}{itemisedParts.reduce((s, p) => s + p.total, 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FraudRiskDecision({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
  // Prefer the new deterministic weighted fraud score; fall back to KINGA pipeline score
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
                    ? "var(--fp-critical-bg)"
                    : "var(--fp-success-bg)",
                  border: c.triggered
                    ? "1px solid var(--fp-critical-border)"
                    : "1px solid var(--border)",
                }}
              >
                <div className="shrink-0 w-8 text-center">
                  {c.triggered ? (
                    <span className="text-xs font-black" style={{ color: "var(--fp-critical-text)" }}>+{c.value}</span>
                  ) : (
                    <span className="text-xs font-semibold" style={{ color: "var(--fp-success-text)" }}>0</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>{c.factor}</p>
                  <p className="text-xs leading-snug" style={{ color: "var(--muted-foreground)" }}>{c.detail}</p>
                </div>
                <div className="shrink-0">
                  {c.triggered ? (
                    <span className="text-xs font-bold" style={{ color: "var(--fp-critical-text)" }}>✗ Triggered</span>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: "var(--fp-success-text)" }}>✓ Clear</span>
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

export function CollapsibleTechnicalData({ assessment, enforcement }: { assessment: any; enforcement: EnforcementResult }) {
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

