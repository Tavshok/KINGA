/**
 * ForensicDecisionPanel — v2 Redesign
 *
 * Decision-first, tab-based claims intelligence UI.
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  DECISION HEADER  (always visible, above fold)      │
 *   │  Decision · Cost · Confidence · Fraud · Doc Status  │
 *   └─────────────────────────────────────────────────────┘
 *   ┌─────────────────────────────────────────────────────┐
 *   │  TABS: Overview │ Cost Analysis │ Damage │          │
 *   │        Fraud & Risk │ Technical Details             │
 *   └─────────────────────────────────────────────────────┘
 */
import { useMemo, useState } from "react";
import {
  CheckCircle, XCircle, AlertTriangle, AlertCircle,
  Shield, DollarSign, Activity, Camera, ShieldAlert,
  ShieldCheck, ShieldX, Layers, GitCompare, Link2, Link2Off,
  BookOpen, RefreshCw, ChevronDown, ChevronUp, Zap,
  ArrowRight, FileText, BarChart2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ValidationGate } from "@/components/ValidationGate";

// ─────────────────────────────────────────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ForensicDecisionPanelProps {
  aiAssessment: any;
  claim?: any;
}

function safeParse(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeParseArray(raw: any): any[] {
  const p = safeParse(raw);
  return Array.isArray(p) ? p : [];
}

// ── Decision verdict ──────────────────────────────────────────────────────────
function decisionConfig(fraudScore: number, confidenceScore: number) {
  if (fraudScore > 60) return {
    verdict: "REJECT",
    label: "Reject",
    icon: <XCircle className="h-5 w-5" />,
    bg: "var(--status-reject-bg)",
    text: "var(--status-reject-text)",
    border: "var(--status-reject-border)",
    badgeCls: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  };
  if (fraudScore > 35 || confidenceScore < 60) return {
    verdict: "REVIEW",
    label: "Review Required",
    icon: <AlertTriangle className="h-5 w-5" />,
    bg: "var(--status-review-bg)",
    text: "var(--status-review-text)",
    border: "var(--status-review-border)",
    badgeCls: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  };
  return {
    verdict: "APPROVE",
    label: "Approve",
    icon: <CheckCircle className="h-5 w-5" />,
    bg: "var(--status-approve-bg)",
    text: "var(--status-approve-text)",
    border: "var(--status-approve-border)",
    badgeCls: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  };
}

function fraudBadgeCls(score: number) {
  if (score <= 15) return "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800";
  if (score <= 35) return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
  if (score <= 60) return "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
  return "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800";
}

function fraudLabel(score: number) {
  if (score <= 15) return "Minimal";
  if (score <= 35) return "Low";
  if (score <= 60) return "Medium";
  return "High";
}

function confidenceBadgeCls(score: number) {
  if (score >= 80) return "bg-green-100 text-green-900 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800";
  if (score >= 60) return "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
  return "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
}

function severityBand(kmh: number) {
  if (kmh < 15) return { label: "Cosmetic", color: "#16a34a" };
  if (kmh < 30) return { label: "Minor", color: "#d97706" };
  if (kmh < 55) return { label: "Moderate", color: "#ea580c" };
  if (kmh < 80) return { label: "Severe", color: "#dc2626" };
  return { label: "Catastrophic", color: "#7f1d1d" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Section card — clean border, no heavy background */
function Card({ title, icon, children, className = "" }: {
  title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card text-card-foreground ${className}`}>
      {title && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Stat tile — label / value / sub */
function Stat({ label, value, sub, valueCls = "text-foreground" }: {
  label: string; value: React.ReactNode; sub?: string; valueCls?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-black tabular-nums leading-none ${valueCls}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** Progress bar */
function Bar({ value, max = 100, colorCls = "bg-primary" }: {
  value: number; max?: number; colorCls?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorCls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Integrity flag row */
function FlagRow({ flag, severity, description, action }: {
  flag: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; action?: string;
}) {
  const cfg = {
    HIGH:   { rowCls: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40",   dotCls: "bg-red-500",   textCls: "text-red-700 dark:text-red-300",   badge: "HIGH" },
    MEDIUM: { rowCls: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40", dotCls: "bg-amber-500", textCls: "text-amber-700 dark:text-amber-300", badge: "MED" },
    LOW:    { rowCls: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40", dotCls: "bg-green-500", textCls: "text-green-700 dark:text-green-300",  badge: "LOW" },
  }[severity];
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${cfg.rowCls}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotCls}`} />
        <code className={`text-xs font-mono font-semibold ${cfg.textCls}`}>{flag}</code>
        <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded ${cfg.textCls} bg-white/40 dark:bg-black/20`}>{cfg.badge}</span>
      </div>
      <p className="text-xs text-muted-foreground pl-4 leading-relaxed">{description}</p>
      {action && <p className={`text-xs pl-4 mt-0.5 font-medium ${cfg.textCls}`}>→ {action}</p>}
    </div>
  );
}

/** Table row with hover */
function TR({ cells, highlight = false }: { cells: React.ReactNode[]; highlight?: boolean }) {
  return (
    <tr className={`border-b border-border transition-colors hover:bg-muted/50 ${highlight ? "bg-primary/5" : ""}`}>
      {cells.map((c, i) => (
        <td key={i} className="px-3 py-2 text-sm text-foreground">{c}</td>
      ))}
    </tr>
  );
}

function TH({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</th>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ForensicDecisionPanel({ aiAssessment, claim }: ForensicDecisionPanelProps) {
  const { fmt } = useTenantCurrency();
  const utils = trpc.useUtils();
  const [showPipelineTrace, setShowPipelineTrace] = useState(false);

  const claimId = Number(aiAssessment?.claimId ?? claim?.id ?? 0);

  const reRunMutation = trpc.claims.triggerAiAssessment.useMutation({
    onSuccess: () => {
      toast.success("Pipeline re-run queued — results will update shortly.");
      utils.claims.getById.invalidate({ id: claimId });
    },
    onError: (e) => toast.error(`Re-run failed: ${e.message}`),
  });

  // ── Parsed JSON fields ──────────────────────────────────────────────────────
  const physics          = useMemo(() => safeParse(aiAssessment?.physicsAnalysis), [aiAssessment?.physicsAnalysis]);
  const damagePattern    = useMemo(() => { const p = safeParse(aiAssessment?.physicsAnalysis); return p?.damagePatternValidation ?? null; }, [aiAssessment?.physicsAnalysis]);
  const costIntel        = useMemo(() => safeParse(aiAssessment?.costIntelligenceJson), [aiAssessment?.costIntelligenceJson]);
  const fraudBreakdown   = useMemo(() => safeParse(aiAssessment?.fraudScoreBreakdownJson), [aiAssessment?.fraudScoreBreakdownJson]);
  const scenarioFraud    = useMemo(() => { const fb = safeParse(aiAssessment?.fraudScoreBreakdownJson); return fb?.scenario_fraud_detection ?? null; }, [aiAssessment?.fraudScoreBreakdownJson]);
  const crossEngine      = useMemo(() => { const fb = safeParse(aiAssessment?.fraudScoreBreakdownJson); return fb?.cross_engine_consistency ?? null; }, [aiAssessment?.fraudScoreBreakdownJson]);
  const severityConsensus = useMemo(() => { const p = safeParse(aiAssessment?.physicsAnalysis); return p?.severityConsensus ?? null; }, [aiAssessment?.physicsAnalysis]);
  const confAgg          = useMemo(() => { const fb = safeParse(aiAssessment?.fraudScoreBreakdownJson); return fb?.confidence_aggregation ?? null; }, [aiAssessment?.fraudScoreBreakdownJson]);
  const validatedOutcome = useMemo(() => safeParse(aiAssessment?.validatedOutcomeJson), [aiAssessment?.validatedOutcomeJson]);
  const caseSignature    = useMemo(() => safeParse(aiAssessment?.caseSignatureJson), [aiAssessment?.caseSignatureJson]);
  const partsRecon       = useMemo(() => safeParseArray(aiAssessment?.partsReconciliationJson), [aiAssessment?.partsReconciliationJson]);
  const pipelineSummary  = useMemo(() => safeParse(aiAssessment?.pipelineRunSummary), [aiAssessment?.pipelineRunSummary]);
  const docVerification  = useMemo(() => { const ps = safeParse(aiAssessment?.pipelineRunSummary); return ps?.documentVerification ?? null; }, [aiAssessment?.pipelineRunSummary]);
  const enrichedPhotos   = useMemo(() => safeParse(aiAssessment?.enrichedPhotosJson), [aiAssessment?.enrichedPhotosJson]);
  const damagedComponents = useMemo(() => safeParseArray(aiAssessment?.damagedComponentsJson), [aiAssessment?.damagedComponentsJson]);
  const repairIntel      = useMemo(() => safeParseArray(aiAssessment?.repairIntelligenceJson), [aiAssessment?.repairIntelligenceJson]);
  const causalChain      = useMemo(() => safeParse(aiAssessment?.causalChainJson), [aiAssessment?.causalChainJson]);
  const fraudIndicators  = useMemo(() => safeParseArray(aiAssessment?.fraudIndicators), [aiAssessment?.fraudIndicators]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const fraudScore       = Number(aiAssessment?.fraudScore ?? fraudBreakdown?.totalScore ?? 0);
  const confidenceScore  = Math.max(0, Math.min(100, Number(aiAssessment?.confidenceScore ?? 72)));
  const estimatedSpeedKmh = Number(physics?.estimatedSpeedKmh ?? 0);
  const deltaVKmh        = Number(physics?.deltaVKmh ?? 0);
  const impactForceKn    = Number(physics?.impactForceKn ?? physics?.impactVector?.magnitude ?? 0) / (physics?.impactVector?.magnitude > 1000 ? 1000 : 1);
  const energyKj         = Number(physics?.energyDistribution?.energyDissipatedKj ?? physics?.energyKj ?? 0);
  const kineticEnergyJ   = Number(physics?.energyDistribution?.kineticEnergyJ ?? 0);
  const impactDirection  = (physics?.impactVector?.direction ?? physics?.impactDirection ?? "unknown").toUpperCase();
  const severity         = aiAssessment?.structuralDamageSeverity ?? "unknown";
  const severityInfo     = severityBand(estimatedSpeedKmh);

  const totalComponents  = damagedComponents.length;
  const frontComponents  = damagedComponents.filter((c: any) => { const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase(); return n.includes("front") || n.includes("bonnet") || n.includes("bumper") || n.includes("grille") || n.includes("headlight") || n.includes("radiator") || n.includes("hood"); });
  const rearComponents   = damagedComponents.filter((c: any) => { const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase(); return n.includes("rear") || n.includes("boot") || n.includes("trunk") || n.includes("tail"); });
  const sideComponents   = damagedComponents.filter((c: any) => { const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase(); return n.includes("door") || n.includes("side") || n.includes("wing") || n.includes("fender") || n.includes("mirror") || n.includes("sill"); });

  const aiCost           = Number(aiAssessment?.estimatedCost ?? 0);
  const agreedCost       = Number(costIntel?.documentedAgreedCostUsd ?? costIntel?.agreedCostUsd ?? 0);
  const originalQuote    = Number(costIntel?.documentedOriginalQuoteUsd ?? costIntel?.originalQuoteUsd ?? 0);
  const marketValue      = Number(costIntel?.marketValueUsd ?? 0);
  const repairToValue    = marketValue > 0 ? ((agreedCost || aiCost) / marketValue) * 100 : Number(costIntel?.repairToValuePct ?? 0);
  const maxCost          = Math.max(aiCost, agreedCost, originalQuote, 1);
  const quotesReceived   = Number(costIntel?.quotesReceived ?? 0);
  const costBasis        = agreedCost > 0 ? agreedCost : aiCost;
  const quotesMapped     = partsRecon.filter((r: any) => r.quotedAmount != null).length;
  const photosJson       = safeParseArray(aiAssessment?.damagePhotosJson);

  // ── Integrity flags ─────────────────────────────────────────────────────────
  const integrityFlags: Array<{ flag: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; action: string }> = [];
  if (!aiAssessment?.physicsAnalysis || !physics?.physicsExecuted) {
    integrityFlags.push({ flag: "physics_not_executed", severity: "MEDIUM", description: "Stage 7 physics engine did not run. Speed, force, and energy fields are absent.", action: "Re-run pipeline to generate physics analysis." });
  }
  if (!aiAssessment?.costIntelligenceJson) {
    integrityFlags.push({ flag: "cost_intelligence_missing", severity: "HIGH", description: "Stage 9 cost intelligence output is absent. Cost comparison cannot be performed.", action: "Re-run pipeline or upload claim document with quote." });
  }
  if (photosJson.length === 0 && !enrichedPhotos) {
    integrityFlags.push({ flag: "image_processing_failure", severity: "MEDIUM", description: "No damage photos extracted. Stage 11 photo enrichment has not run.", action: "Extract photos from source PDF pages 3–4 and re-run." });
  }

  // ── Narrative sentences ─────────────────────────────────────────────────────
  const narrative = [
    `The ${claim?.vehicleMake ?? "vehicle"} (${claim?.vehicleRegistration ?? "—"}) was involved in a ${impactDirection.toLowerCase()} collision${estimatedSpeedKmh > 0 ? ` at an estimated ${estimatedSpeedKmh.toFixed(1)} km/h` : ""}, dissipating ${energyKj > 0 ? `${energyKj.toFixed(1)} kJ` : "an unknown amount of energy"} across ${totalComponents} identified components.`,
    totalComponents > 0 ? `Damage spans ${[frontComponents.length > 0 && `${frontComponents.length} front`, rearComponents.length > 0 && `${rearComponents.length} rear`, sideComponents.length > 0 && `${sideComponents.length} side`].filter(Boolean).join(", ")} components — consistent with the reported collision mechanism.` : null,
    costBasis > 0 ? `${quotesReceived > 0 ? `${quotesReceived} quotes obtained;` : "Estimated"} repair cost ${fmt(costBasis)}${marketValue > 0 ? ` (${repairToValue.toFixed(1)}% of ${fmt(marketValue)} market value)` : ""} — ${repairToValue < 70 ? "clear repair case" : "approaching total-loss threshold"}.` : null,
    fraudScore <= 15 ? `Fraud score ${fraudScore}/100 (minimal); ${fraudIndicators.length > 0 ? `active indicator: ${fraudIndicators[0]?.indicator ?? fraudIndicators[0]?.label ?? "—"}` : "no active fraud indicators"}.` : `Fraud score ${fraudScore}/100 — review required.`,
    integrityFlags.length > 0 ? `${integrityFlags.length} system integrity flag${integrityFlags.length > 1 ? "s" : ""} open: ${integrityFlags.map(f => f.flag).join(", ")}.` : "All integrity checks passed.",
  ].filter(Boolean) as string[];

  const decision = decisionConfig(fraudScore, confidenceScore);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
   return (
    <div className="space-y-4">
      {/* ══════════════════════════════════════════════════════════════════════
          OUTPUT VALIDATION GATE — runs before any data is displayed
          ══════════════════════════════════════════════════════════════════════ */}
      {claimId > 0 && <ValidationGate claimId={claimId} />}
      {/* ══════════════════════════════════════════════════════════════════════
          DECISION HEADER — always visible, above fold
          ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="rounded-xl border px-5 py-4"
        style={{ background: decision.bg, borderColor: decision.border }}
      >
        {/* Row 1: verdict + cost + confidence + fraud */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Verdict badge */}
          <div className="flex items-center gap-2" style={{ color: decision.text }}>
            {decision.icon}
            <span className="text-xl font-black tracking-tight">{decision.label}</span>
          </div>

          <div className="h-6 w-px bg-border/60 hidden sm:block" />

          {/* Cost */}
          {costBasis > 0 && (
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Agreed Cost</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{fmt(costBasis)}</span>
            </div>
          )}

          {/* Confidence */}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Confidence</span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-foreground tabular-nums">{confidenceScore}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${confidenceBadgeCls(confidenceScore)}`}>
                {confidenceScore >= 80 ? "HIGH" : confidenceScore >= 60 ? "MED" : "LOW"}
              </span>
            </div>
          </div>

          {/* Fraud */}
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Fraud Risk</span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-foreground tabular-nums">{fraudScore}</span>
              <span className="text-xs text-muted-foreground">/100</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${fraudBadgeCls(fraudScore)}`}>
                {fraudLabel(fraudScore)}
              </span>
            </div>
          </div>

          {/* Doc verification pill */}
          {docVerification && (
            <div className="ml-auto">
              <span className={`text-xs font-semibold px-2 py-1 rounded border ${
                docVerification.status === "SUCCESS" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" :
                docVerification.status === "PARTIAL" ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" :
                "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
              }`}>
                Doc: {docVerification.status}
              </span>
            </div>
          )}
        </div>

        {/* Row 2: confidence bar + repair-to-value */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Pipeline Confidence</span>
              <span>{confidenceScore}%</span>
            </div>
            <Bar
              value={confidenceScore}
              colorCls={confidenceScore >= 80 ? "bg-green-500" : confidenceScore >= 60 ? "bg-amber-500" : "bg-orange-500"}
            />
          </div>
          {marketValue > 0 && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Repair-to-Value</span>
                <span className={repairToValue < 70 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {repairToValue.toFixed(1)}% {repairToValue < 70 ? "— repair" : "— near total loss"}
                </span>
              </div>
              <div className="relative">
                <Bar
                  value={repairToValue}
                  colorCls={repairToValue < 70 ? "bg-green-500" : "bg-red-500"}
                />
                {/* 70% threshold marker */}
                <div className="absolute top-0 h-1.5 w-0.5 bg-amber-400 rounded" style={{ left: "70%" }} />
              </div>
            </div>
          )}
        </div>

        {/* Row 3: open flags summary */}
        {integrityFlags.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-amber-600 dark:text-amber-400">{integrityFlags.length} open flag{integrityFlags.length > 1 ? "s" : ""}</span>
              {" "}— {integrityFlags.map(f => f.flag).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Case signature strip */}
      {caseSignature && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Case Signature</span>
          <code className="rounded px-2 py-0.5 text-sm font-mono font-bold text-primary bg-primary/10">{caseSignature.case_signature}</code>
          {caseSignature.grouping_key && (
            <>
              <span className="text-xs text-muted-foreground hidden sm:inline">Grouping Key</span>
              <code className="rounded px-2 py-0.5 text-xs font-mono text-muted-foreground bg-muted">{caseSignature.grouping_key}</code>
            </>
          )}
          {caseSignature.metadata?.similar_cases_expected != null && (
            <span className="ml-auto text-xs text-muted-foreground">{caseSignature.metadata.similar_cases_expected} similar cases</span>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB PANEL
          ══════════════════════════════════════════════════════════════════════ */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap gap-0.5 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="overview"    className="flex-1 min-w-[80px] text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">Overview</TabsTrigger>
          <TabsTrigger value="cost"        className="flex-1 min-w-[80px] text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">Cost Analysis</TabsTrigger>
          <TabsTrigger value="damage"      className="flex-1 min-w-[80px] text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">Damage</TabsTrigger>
          <TabsTrigger value="fraud"       className="flex-1 min-w-[80px] text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">Fraud & Risk</TabsTrigger>
          <TabsTrigger value="technical"   className="flex-1 min-w-[80px] text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">Technical</TabsTrigger>
        </TabsList>

        {/* ── TAB: OVERVIEW ──────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-4">

          {/* Pipeline confidence aggregation */}
          {confAgg && (
            <Card title="Pipeline Confidence" icon={<Activity className="h-4 w-4" />}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={`flex flex-col items-center justify-center rounded-lg p-4 text-center border ${
                  confAgg.confidence_level === "HIGH" ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800" :
                  confAgg.confidence_level === "MEDIUM" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800" :
                  "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800"
                }`}>
                  <p className={`text-4xl font-black tabular-nums ${
                    confAgg.confidence_level === "HIGH" ? "text-green-600 dark:text-green-400" :
                    confAgg.confidence_level === "MEDIUM" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                  }`}>{confAgg.overall_confidence}</p>
                  <p className="text-xs text-muted-foreground mt-1">Overall</p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold border ${confidenceBadgeCls(confAgg.overall_confidence)}`}>{confAgg.confidence_level}</span>
                </div>
                <div className="col-span-2 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Component Scores</p>
                  {confAgg.component_detail?.map((c: any) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className={`w-28 text-xs font-medium capitalize truncate shrink-0 ${c.is_weakest ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground"}`}>
                        {c.is_weakest ? "⚠ " : ""}{c.name.replace(/_/g, " ")}
                      </span>
                      {c.available ? (
                        <>
                          <div className="flex-1">
                            <Bar value={c.score} colorCls={c.is_weakest ? "bg-red-500" : c.score >= 75 ? "bg-green-500" : c.score >= 45 ? "bg-amber-500" : "bg-red-500"} />
                          </div>
                          <span className={`w-8 text-right text-xs font-bold tabular-nums shrink-0 ${c.is_weakest ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{c.score}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">not available</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Narrative summary */}
          <Card title="Assessment Summary" icon={<FileText className="h-4 w-4" />}>
            <ol className="space-y-2">
              {narrative.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <p className="text-sm text-foreground leading-relaxed">{s}</p>
                </li>
              ))}
            </ol>
          </Card>

          {/* Evidence integrity */}
          <Card title="Evidence Integrity" icon={<Camera className="h-4 w-4" />}>
            {integrityFlags.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">All integrity checks passed</span>
              </div>
            ) : (
              <div className="space-y-2">
                {integrityFlags.map((f, i) => (
                  <FlagRow key={i} flag={f.flag} severity={f.severity} description={f.description} action={f.action} />
                ))}
              </div>
            )}
            {/* Input usage checklist */}
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Input Usage</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { label: "Vehicle type & mass",   used: !!aiAssessment?.vehicleMake || totalComponents > 0 },
                  { label: "Component list",         used: totalComponents > 0 },
                  { label: "Accident description",   used: !!(claim?.incidentDescription ?? claim?.normalised_description) },
                  { label: "Agreed cost",            used: agreedCost > 0 },
                  { label: "Market value",           used: marketValue > 0 },
                  { label: "Damage photographs",     used: photosJson.length > 0 || !!enrichedPhotos },
                ].map(({ label, used }) => (
                  <div key={label} className="flex items-center gap-2 text-xs py-0.5">
                    {used
                      ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                    <span className={used ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Doc verification detail */}
          {docVerification && (() => {
            const status: string = docVerification.status ?? "UNKNOWN";
            const keyFields: string[] = docVerification.keyFieldsDetected ?? [];
            const missingFields: string[] = docVerification.missingCriticalFields ?? [];
            const pdfRead: boolean = docVerification.pdfReadConfirmed ?? false;
            const statusCls = status === "SUCCESS" ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800" :
              status === "PARTIAL" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800" :
              "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800";
            return (
              <Card title="Document Read Verification" icon={<FileText className="h-4 w-4" />}>
                <div className={`rounded-lg border px-4 py-3 ${statusCls}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`text-sm font-bold ${
                      status === "SUCCESS" ? "text-green-700 dark:text-green-300" :
                      status === "PARTIAL" ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"
                    }`}>{status}</span>
                    <span className="text-xs text-muted-foreground">{pdfRead ? "PDF fetched via presigned URL" : "OCR text fallback"}</span>
                    {docVerification.reason && <span className="text-xs text-muted-foreground ml-auto">{docVerification.reason}</span>}
                  </div>
                  {keyFields.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs text-muted-foreground mr-1">Detected:</span>
                      {keyFields.map((f: string) => (
                        <span key={f} className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{f}</span>
                      ))}
                    </div>
                  )}
                  {missingFields.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-xs text-muted-foreground mr-1">Missing:</span>
                      {missingFields.map((f: string) => (
                        <span key={f} className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── TAB: COST ANALYSIS ─────────────────────────────────────────────── */}
        <TabsContent value="cost" className="mt-4 space-y-4">

          {/* Cost comparison */}
          <Card title="Cost Comparison" icon={<DollarSign className="h-4 w-4" />}>
            <div className="space-y-4">
              {[
                { label: costIntel?.panelBeaterName ? `Panel Beater Quote — ${costIntel.panelBeaterName}` : "Panel Beater Quote", value: originalQuote, note: quotesReceived > 0 ? `Lowest of ${quotesReceived} quotes` : "From claim document", colorCls: "bg-red-400" },
                { label: "AI Model Estimate",  value: aiCost,      note: "Physics-based component model",       colorCls: "bg-orange-400" },
                { label: "Agreed Cost",        value: agreedCost > 0 ? agreedCost : null, note: "Assessor-negotiated — operative figure", colorCls: "bg-green-500" },
              ].filter(item => (item.value ?? 0) > 0).map(({ label, value, note, colorCls }) => (
                <div key={label}>
                  <div className="flex items-start justify-between mb-1.5 gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{note}</p>
                    </div>
                    <span className="text-base font-bold text-foreground tabular-nums shrink-0">{fmt(value ?? 0)}</span>
                  </div>
                  <Bar value={value ?? 0} max={maxCost} colorCls={colorCls} />
                </div>
              ))}
            </div>

            {/* Repair-to-value */}
            {marketValue > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-foreground">Repair-to-Value Ratio</p>
                  <span className={`text-sm font-bold tabular-nums ${repairToValue < 70 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {repairToValue.toFixed(1)}% of {fmt(marketValue)}
                  </span>
                </div>
                <div className="relative">
                  <Bar value={repairToValue} colorCls={repairToValue < 70 ? "bg-green-500" : "bg-red-500"} />
                  <div className="absolute top-0 h-1.5 w-0.5 bg-amber-400 rounded" style={{ left: "70%" }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">0%</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400">70% total-loss threshold</span>
                  <span className="text-xs text-muted-foreground">100%</span>
                </div>
                <p className={`text-xs font-semibold mt-1.5 ${repairToValue < 70 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {repairToValue < 70 ? "✓ Clear repair case" : "⚠ Approaching total-loss threshold"}
                </p>
              </div>
            )}
          </Card>

          {/* Parts reconciliation table */}
          {partsRecon.length > 0 && (
            <Card title="Parts Reconciliation" icon={<BarChart2 className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground mb-3">{quotesMapped}/{totalComponents} components mapped to quote line items</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <TH>Component</TH>
                      <TH>AI Estimate</TH>
                      <TH>Quoted</TH>
                      <TH>Variance</TH>
                      <TH>Status</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {partsRecon.slice(0, 15).map((r: any, i: number) => {
                      const variance = r.quotedAmount != null && r.aiEstimate != null
                        ? ((r.quotedAmount - r.aiEstimate) / Math.max(r.aiEstimate, 1)) * 100
                        : null;
                      const varCls = variance == null ? "text-muted-foreground" : Math.abs(variance) <= 15 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
                      return (
                        <TR key={i} cells={[
                          <span className="font-medium">{r.component ?? "—"}</span>,
                          r.aiEstimate != null ? fmt(r.aiEstimate) : <span className="text-muted-foreground">—</span>,
                          r.quotedAmount != null ? fmt(r.quotedAmount) : <span className="text-muted-foreground">—</span>,
                          variance != null ? <span className={varCls}>{variance > 0 ? "+" : ""}{variance.toFixed(1)}%</span> : <span className="text-muted-foreground">—</span>,
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${
                            r.status === "matched" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" :
                            r.status === "unmatched" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" :
                            "bg-muted text-muted-foreground border-border"
                          }`}>{r.status ?? "—"}</span>,
                        ]} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {partsRecon.length > 15 && (
                <p className="text-xs text-muted-foreground mt-2 text-right">+{partsRecon.length - 15} more components</p>
              )}
            </Card>
          )}

          {/* Repair intelligence */}
          {repairIntel.length > 0 && (
            <Card title="Repair Intelligence" icon={<Activity className="h-4 w-4" />}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <TH>Component</TH>
                      <TH>Action</TH>
                      <TH>Complexity</TH>
                      <TH>Est. Hours</TH>
                      <TH>Est. Cost</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {repairIntel.slice(0, 12).map((r: any, i: number) => (
                      <TR key={i} cells={[
                        <span className="font-medium">{r.component ?? "—"}</span>,
                        r.repair_action ?? r.action ?? "—",
                        <span className={`text-xs font-semibold ${
                          r.complexity === "HIGH" ? "text-red-600 dark:text-red-400" :
                          r.complexity === "MEDIUM" ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                        }`}>{r.complexity ?? "—"}</span>,
                        r.estimated_hours != null ? `${r.estimated_hours}h` : "—",
                        r.estimated_cost != null ? fmt(r.estimated_cost) : "—",
                      ]} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB: DAMAGE ────────────────────────────────────────────────────── */}
        <TabsContent value="damage" className="mt-4 space-y-4">

          {/* Damage zone map */}
          <Card title="Damage Zone Map" icon={<Activity className="h-4 w-4" />}>
            {totalComponents === 0 ? (
              <p className="text-sm text-muted-foreground">No components extracted from pipeline.</p>
            ) : (
              <div className="space-y-4">
                {[
                  { zone: "FRONT", components: frontComponents, colorCls: "bg-blue-500" },
                  { zone: "REAR",  components: rearComponents,  colorCls: "bg-orange-500" },
                  { zone: "SIDE",  components: sideComponents,  colorCls: "bg-purple-500" },
                ].map(({ zone, components, colorCls }) => (
                  <div key={zone}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{zone}</span>
                      <span className="text-xs text-muted-foreground">{components.length} component{components.length !== 1 ? "s" : ""}</span>
                    </div>
                    <Bar value={components.length} max={totalComponents} colorCls={colorCls} />
                    {components.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {components.slice(0, 8).map((c: any, i: number) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted text-foreground">
                            {typeof c === "string" ? c : (c?.component ?? c?.name ?? "—")}
                          </span>
                        ))}
                        {components.length > 8 && <span className="text-xs text-muted-foreground">+{components.length - 8} more</span>}
                      </div>
                    )}
                  </div>
                ))}
                {/* Highest cost component */}
                {partsRecon.length > 0 && (() => {
                  const top = [...partsRecon].sort((a, b) => (b.aiEstimate ?? 0) - (a.aiEstimate ?? 0))[0];
                  return top ? (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Highest Cost Component</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{top.component}</span>
                        <span className="text-sm font-bold text-primary">{fmt(top.aiEstimate ?? 0)}</span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </Card>

          {/* Damage pattern validation */}
          {damagePattern && (
            <Card
              title="Damage Pattern Validation"
              icon={<Layers className="h-4 w-4" />}
            >
              <div className="flex flex-wrap gap-3 mb-4">
                {[
                  { label: "Pattern Match", value: damagePattern.pattern_match, cls: damagePattern.pattern_match === "STRONG" ? "text-green-600 dark:text-green-400" : damagePattern.pattern_match === "MODERATE" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400" },
                  { label: "Confidence",    value: `${damagePattern.confidence ?? "—"}%`, cls: "text-foreground" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className={`text-lg font-bold ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
              {damagePattern.validation_detail?.image_contradiction && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2.5 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-700 dark:text-red-300">IMAGE CONTRADICTION DETECTED</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{damagePattern.validation_detail.image_contradiction_reason ?? "Image-detected zones do not match the reported damage pattern."}</p>
                </div>
              )}
              {damagePattern.missing_expected_components?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1.5">Missing Expected Components</p>
                  <div className="flex flex-wrap gap-1">
                    {damagePattern.missing_expected_components.map((c: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {damagePattern.unexpected_components?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-1.5">Unexpected Components</p>
                  <div className="flex flex-wrap gap-1">
                    {damagePattern.unexpected_components.slice(0, 8).map((c: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">{c}</span>
                    ))}
                    {damagePattern.unexpected_components.length > 8 && <span className="text-xs text-muted-foreground">+{damagePattern.unexpected_components.length - 8} more</span>}
                  </div>
                </div>
              )}
              {damagePattern.reasoning && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Engine reasoning</summary>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border">{damagePattern.reasoning}</p>
                </details>
              )}
            </Card>
          )}

          {/* Severity consensus */}
          {severityConsensus && (() => {
            const sc = severityConsensus as any;
            return (
              <Card title="Severity Consensus" icon={<Layers className="h-4 w-4" />}>
                <div className="flex flex-wrap gap-3 mb-4">
                  {[
                    { label: "Final Severity", value: sc.final_severity?.toUpperCase() ?? "—", cls: sc.final_severity === "severe" ? "text-red-600 dark:text-red-400" : sc.final_severity === "moderate" ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400" },
                    { label: "Alignment",      value: sc.source_alignment ?? "—",               cls: sc.source_alignment === "FULL" ? "text-green-600 dark:text-green-400" : sc.source_alignment === "PARTIAL" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400" },
                    { label: "Confidence",     value: `${sc.confidence ?? "—"}%`,               cls: "text-foreground" },
                    { label: "Sources",        value: `${sc.sources_available ?? 3}/3`,          cls: "text-foreground" },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                      <p className={`text-base font-bold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["physics", "damage", "image"].map((src) => {
                    const val = sc.source_signals?.[src];
                    const cls = val === "severe" ? "text-red-600 dark:text-red-400" : val === "moderate" ? "text-amber-600 dark:text-amber-400" : val === "minor" ? "text-green-600 dark:text-green-400" : "text-muted-foreground";
                    return (
                      <div key={src} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{src}</p>
                        <p className={`text-sm font-semibold ${cls}`}>{val ?? "N/A"}</p>
                      </div>
                    );
                  })}
                </div>
                {sc.reasoning && (
                  <details>
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Engine reasoning</summary>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border">{sc.reasoning}</p>
                  </details>
                )}
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── TAB: FRAUD & RISK ──────────────────────────────────────────────── */}
        <TabsContent value="fraud" className="mt-4 space-y-4">

          {/* Fraud summary */}
          <Card title="Fraud Risk Summary" icon={<ShieldAlert className="h-4 w-4" />}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className={`rounded-lg border p-3 text-center ${fraudBadgeCls(fraudScore).replace("text-", "border-").replace("bg-", "bg-")}`}>
                <p className={`text-3xl font-black tabular-nums ${fraudScore <= 35 ? "text-green-600 dark:text-green-400" : fraudScore <= 60 ? "text-amber-600 dark:text-amber-400" : "text-purple-600 dark:text-purple-400"}`}>{fraudScore}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Score /100</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className={`text-base font-bold ${fraudScore <= 35 ? "text-green-600 dark:text-green-400" : fraudScore <= 60 ? "text-amber-600 dark:text-amber-400" : "text-purple-600 dark:text-purple-400"}`}>{fraudLabel(fraudScore).toUpperCase()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Risk Level</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className="text-base font-bold text-foreground">{fraudIndicators.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active Flags</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className="text-base font-bold text-foreground">{scenarioFraud?.engine_metadata?.false_positives_suppressed ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">FP Suppressed</p>
              </div>
            </div>
            <Bar value={fraudScore} colorCls={fraudScore <= 35 ? "bg-green-500" : fraudScore <= 60 ? "bg-amber-500" : "bg-purple-500"} />
          </Card>

          {/* Scenario fraud detection */}
          {scenarioFraud && (
            <Card title="Scenario-Aware Fraud Detection" icon={<ShieldAlert className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground mb-3">
                Profile: <span className="font-semibold text-foreground">{scenarioFraud.engine_metadata?.scenario_profile_applied ?? scenarioFraud.engine_metadata?.scenario_type ?? "unknown"}</span>
              </p>
              {(scenarioFraud.engine_metadata?.trust_reduction_applied ?? 0) > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 px-3 py-2 mb-3">
                  <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Trust signals applied — score reduced by {scenarioFraud.engine_metadata.trust_reduction_applied} pts
                    {scenarioFraud.engine_metadata.trust_signals_applied?.length > 0 && (
                      <span className="text-muted-foreground"> ({scenarioFraud.engine_metadata.trust_signals_applied.join(", ")})</span>
                    )}
                  </p>
                </div>
              )}
              {scenarioFraud.flags?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Flags ({scenarioFraud.flags.length})</p>
                  {scenarioFraud.flags.map((flag: any, i: number) => (
                    <div key={i} className={`rounded-lg border px-3 py-2.5 ${
                      flag.severity === "HIGH" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40" :
                      flag.severity === "MEDIUM" ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" :
                      "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${flag.severity === "HIGH" ? "text-red-700 dark:text-red-300" : flag.severity === "MEDIUM" ? "text-amber-700 dark:text-amber-300" : "text-yellow-700 dark:text-yellow-300"}`}>{flag.label ?? flag.flag_id}</span>
                        <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded border ${
                          flag.severity === "HIGH" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" :
                          "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                        }`}>{flag.severity}</span>
                      </div>
                      {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                      {flag.recommended_action && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium">→ {flag.recommended_action}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Cross-engine consistency */}
          {crossEngine && (
            <Card title="Cross-Engine Consistency" icon={<GitCompare className="h-4 w-4" />}>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Consistency", value: crossEngine.consistency_score, cls: crossEngine.consistency_score >= 70 ? "text-green-600 dark:text-green-400" : crossEngine.consistency_score >= 45 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400" },
                  { label: "Status",      value: crossEngine.overall_status,    cls: crossEngine.overall_status === "CONSISTENT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400" },
                  { label: "Critical",    value: crossEngine.critical_conflict_count, cls: crossEngine.critical_conflict_count > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground" },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className={`text-lg font-bold ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>
              {crossEngine.agreements?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Agreements ({crossEngine.agreements.length})</p>
                  <div className="space-y-1.5">
                    {crossEngine.agreements.map((ag: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 px-3 py-2">
                        <Link2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-green-700 dark:text-green-300">{ag.label ?? ag.check_id}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{ag.strength}</span>
                          </div>
                          {ag.detail && <p className="text-xs text-muted-foreground mt-0.5">{ag.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {crossEngine.conflicts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conflicts ({crossEngine.conflicts.length})</p>
                  <div className="space-y-1.5">
                    {crossEngine.conflicts.map((cf: any, i: number) => (
                      <div key={i} className={`rounded-lg border px-3 py-2.5 ${
                        cf.severity === "CRITICAL" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40" :
                        cf.severity === "SIGNIFICANT" ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40" :
                        "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      }`}>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Link2Off className={`h-3.5 w-3.5 shrink-0 ${cf.severity === "CRITICAL" ? "text-red-600 dark:text-red-400" : cf.severity === "SIGNIFICANT" ? "text-orange-600 dark:text-orange-400" : "text-amber-600 dark:text-amber-400"}`} />
                          <span className={`text-xs font-semibold ${cf.severity === "CRITICAL" ? "text-red-700 dark:text-red-300" : cf.severity === "SIGNIFICANT" ? "text-orange-700 dark:text-orange-300" : "text-amber-700 dark:text-amber-300"}`}>{cf.label ?? cf.check_id}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${cf.severity === "CRITICAL" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>{cf.severity}</span>
                        </div>
                        {cf.physics_says && <p className="text-xs text-muted-foreground">Physics: <span className="text-foreground/80">{cf.physics_says}</span></p>}
                        {cf.damage_says && cf.damage_says !== "N/A" && <p className="text-xs text-muted-foreground">Damage: <span className="text-foreground/80">{cf.damage_says}</span></p>}
                        {cf.recommended_action && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium">→ {cf.recommended_action}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── TAB: TECHNICAL DETAILS ─────────────────────────────────────────── */}
        <TabsContent value="technical" className="mt-4 space-y-4">

          {/* Physics model */}
          {physics && (
            <Card title="Physics Model" icon={<Zap className="h-4 w-4" />}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Speed",         value: estimatedSpeedKmh > 0 ? `${estimatedSpeedKmh.toFixed(1)} km/h` : "—" },
                  { label: "ΔV",            value: deltaVKmh > 0 ? `${deltaVKmh.toFixed(1)} km/h` : "—" },
                  { label: "Impact Force",  value: impactForceKn > 0 ? `${impactForceKn.toFixed(1)} kN` : "—" },
                  { label: "Energy",        value: energyKj > 0 ? `${energyKj.toFixed(1)} kJ` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Impact Direction</p>
                  <p className="text-sm font-mono font-semibold text-primary">{impactDirection}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Severity Band</p>
                  <p className="text-sm font-semibold" style={{ color: severityInfo.color }}>{severityInfo.label}</p>
                </div>
              </div>
              {kineticEnergyJ > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Energy dissipated into structure</span>
                    <span>{((energyKj * 1000 / kineticEnergyJ) * 100).toFixed(0)}%</span>
                  </div>
                  <Bar value={(energyKj * 1000 / kineticEnergyJ) * 100} colorCls="bg-orange-500" />
                </div>
              )}
            </Card>
          )}

          {/* Causal chain */}
          {causalChain && (
            <Card title="Causal Chain" icon={<ArrowRight className="h-4 w-4" />}>
              <div className="space-y-2">
                {(causalChain.chain ?? causalChain.events ?? []).slice(0, 8).map((event: any, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{event.event ?? event.description ?? event}</p>
                      {event.confidence != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">Confidence: {event.confidence}%</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Learning gate */}
          {validatedOutcome && (
            <Card title="Learning Gate" icon={<BookOpen className="h-4 w-4" />}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${
                  validatedOutcome.store
                    ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {validatedOutcome.store ? "✓ Stored for Learning" : "✗ Not Stored"}
                </span>
                <span className={`text-xs font-bold px-2 py-1 rounded border ${
                  validatedOutcome.quality_tier === "HIGH" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" :
                  validatedOutcome.quality_tier === "MEDIUM" ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" :
                  "bg-muted text-muted-foreground border-border"
                }`}>{validatedOutcome.quality_tier} QUALITY</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{validatedOutcome.reason}</p>
              {validatedOutcome.metadata && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {validatedOutcome.metadata.true_cost_usd != null && (
                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">True Cost</p>
                      <p className="text-sm font-bold text-foreground">${validatedOutcome.metadata.true_cost_usd.toLocaleString()}</p>
                    </div>
                  )}
                  {validatedOutcome.metadata.decision_confidence != null && (
                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">Confidence</p>
                      <p className="text-sm font-bold text-foreground">{validatedOutcome.metadata.decision_confidence}%</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Pipeline controls */}
          <Card title="Pipeline Controls" icon={<RefreshCw className="h-4 w-4" />}>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1">Re-run Full Pipeline</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Triggers all stages: OCR → extraction → validation → physics → fraud → cost intelligence.
                    Use when the claim document has been updated or earlier runs produced stale data.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  disabled={reRunMutation.isPending || !claimId}
                  onClick={() => claimId && reRunMutation.mutate({ claimId, reason: "Manual re-run from Forensic Decision Panel" })}
                >
                  {reRunMutation.isPending ? (
                    <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Re-running...</>
                  ) : (
                    <><RefreshCw className="h-3.5 w-3.5" /> Re-run Pipeline</>
                  )}
                </Button>
              </div>

              {/* Pipeline trace */}
              {pipelineSummary?.stages && (
                <div>
                  <button
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left py-1"
                    onClick={() => setShowPipelineTrace(v => !v)}
                  >
                    {showPipelineTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span className="font-medium">Pipeline Stage Trace</span>
                    <span className="ml-auto text-xs text-muted-foreground/60">{Object.keys(pipelineSummary.stages).length} stages</span>
                  </button>
                  {showPipelineTrace && (
                    <div className="mt-2 space-y-1.5">
                      {Object.entries(pipelineSummary.stages as Record<string, any>).map(([stageKey, stageData]: [string, any]) => {
                        const stageName = stageKey.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                        const status: string = stageData?.status ?? "unknown";
                        const durationMs: number = stageData?.durationMs ?? 0;
                        const recoveryCount: number = stageData?.recoveryActionCount ?? 0;
                        const rowCls = status === "success" ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" :
                          status === "degraded" ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" :
                          status === "failed" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30" :
                          "border-border bg-muted/20";
                        const statusCls = status === "success" ? "text-green-700 dark:text-green-300" :
                          status === "degraded" ? "text-amber-700 dark:text-amber-300" :
                          status === "failed" ? "text-red-700 dark:text-red-300" : "text-muted-foreground";
                        return (
                          <div key={stageKey} className={`rounded-lg border px-3 py-2 flex items-center gap-3 ${rowCls}`}>
                            <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{stageKey.split("_")[0]}</span>
                            <span className="text-xs text-foreground flex-1 truncate">{stageName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {recoveryCount > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 font-mono">+{recoveryCount}</span>
                              )}
                              {durationMs > 0 && (
                                <span className="text-xs text-muted-foreground font-mono">{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}</span>
                              )}
                              <span className={`text-xs font-bold ${statusCls}`}>{status.toUpperCase()}</span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Stage 4 recovery log */}
                      {(() => {
                        const stage4 = pipelineSummary.stages?.["4_validation"];
                        const recoveryLog: string[] = stage4?.recoveryLog ?? [];
                        if (recoveryLog.length === 0) return null;
                        return (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Stage 4 Recovery Actions ({recoveryLog.length})</p>
                            <div className="space-y-0.5">
                              {recoveryLog.map((entry: string, i: number) => (
                                <p key={i} className="text-xs font-mono text-muted-foreground">→ {entry}</p>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
