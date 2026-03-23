/**
 * DecisionAuthorityPanel.tsx
 *
 * Displays the Claims Decision Authority result for a given claim.
 * Shows APPROVE / REVIEW / REJECT recommendation with confidence,
 * decision basis, key drivers, blocking factors, and the full decision trace.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  RefreshCw,
  GitBranch,
  ArrowRight,
  ShieldAlert,
  ShieldX,
} from "lucide-react";

interface DecisionAuthorityPanelProps {
  claimId: number;
  aiAssessment: {
    fraudRiskLevel?: string | null;
    fraudRiskScore?: number | null;
    confidenceScore?: number | null;
    structuralDamageSeverity?: string | null;
    estimatedCost?: number | null;
    physicsAnalysis?: string | null;
    consistencyCheckJson?: string | null;
    costRealismJson?: string | null;
  } | null;
  claim: {
    incidentType?: string | null;
    finalApprovedAmount?: number | null;
    claimAmount?: number | null;
    isHighValue?: boolean | null;
  } | null;
  assessorValidated?: boolean;
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  if (recommendation === "APPROVE") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "oklch(0.35 0.12 145 / 0.3)", border: "1.5px solid oklch(0.55 0.18 145)" }}>
        <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.70 0.20 145)" }} />
        <span className="font-bold text-lg" style={{ color: "oklch(0.75 0.18 145)" }}>APPROVE</span>
      </div>
    );
  }
  if (recommendation === "REJECT") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "oklch(0.35 0.18 25 / 0.3)", border: "1.5px solid oklch(0.55 0.22 25)" }}>
        <XCircle className="w-5 h-5" style={{ color: "oklch(0.65 0.22 25)" }} />
        <span className="font-bold text-lg" style={{ color: "oklch(0.70 0.20 25)" }}>REJECT</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: "oklch(0.38 0.14 70 / 0.3)", border: "1.5px solid oklch(0.58 0.18 70)" }}>
      <AlertTriangle className="w-5 h-5" style={{ color: "oklch(0.72 0.18 70)" }} />
      <span className="font-bold text-lg" style={{ color: "oklch(0.78 0.16 70)" }}>REVIEW</span>
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const color =
    confidence >= 75 ? "oklch(0.65 0.18 145)" :
    confidence >= 50 ? "oklch(0.70 0.18 70)" :
    "oklch(0.60 0.20 25)";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full" style={{ background: "var(--border)" }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${confidence}%`, background: color }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color, minWidth: "3rem", textAlign: "right" }}>
        {confidence}%
      </span>
    </div>
  );
}

// ─── Full Decision Trace Component ──────────────────────────────────────────

function FullDecisionTrace({ claimId }: { claimId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: trace, isLoading } = trpc.decision.getDecisionTrace.useQuery(
    { claimId },
    { enabled: expanded }
  );

  return (
    <div>
      <button
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--muted-foreground)" }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <GitBranch className="w-3.5 h-3.5" />
        Full Decision Trace
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {isLoading && (
            <div className="flex items-center gap-2 py-3" style={{ color: "var(--muted-foreground)" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Generating trace…</span>
            </div>
          )}

          {trace && (
            <>
              {/* Executive Summary */}
              <div className="p-3 rounded-lg" style={{ background: "var(--accent)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Executive Summary</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{trace.executive_summary}</p>
              </div>

              {/* Trace entries */}
              <div className="space-y-2">
                {trace.decision_trace.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                        {entry.stage}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs font-medium w-20 flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>Input</span>
                        <span className="text-xs" style={{ color: "var(--foreground)" }}>{entry.input_summary}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-xs font-medium w-20 flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>Output</span>
                        <span className="text-xs" style={{ color: "var(--foreground)" }}>{entry.output_summary}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.60 0.18 250)" }} />
                        <span className="text-xs italic" style={{ color: "oklch(0.65 0.14 250)" }}>{entry.impact_on_decision}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Missing stages warning */}
              {trace.missing_stages.length > 0 && (
                <div className="p-2 rounded" style={{ background: "oklch(0.38 0.14 70 / 0.15)", border: "1px solid oklch(0.55 0.18 70 / 0.3)" }}>
                  <p className="text-xs" style={{ color: "oklch(0.72 0.18 70)" }}>
                    ⚠ {trace.missing_stages.length} stage(s) unavailable: {trace.missing_stages.join(", ")}
                  </p>
                </div>
              )}

              {/* Trace metadata */}
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {trace.metadata.stages_included} stages traced · {trace.metadata.engine} {trace.metadata.version}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Contradiction Gate Component ──────────────────────────────────────────

interface ContradictionGateProps {
  recommendation: "APPROVE" | "REVIEW" | "REJECT";
  overallConfidence?: number | null;
  assessorValidated?: boolean;
  isHighValue?: boolean | null;
  severity?: string | null;
  fraudRiskLevel?: string | null;
  physicsPlausible?: boolean | null;
  hasCriticalPhysics?: boolean | null;
  damageConsistent?: boolean | null;
  hasUnexplainedDamage?: boolean | null;
  costRecommendation?: "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE" | null;
  consistencyStatus?: "CONSISTENT" | "CONFLICTED" | null;
  criticalConflictCount?: number | null;
  consistencyProceed?: boolean | null;
}

function ContradictionGate(props: ContradictionGateProps) {
  const [expanded, setExpanded] = useState(false);

  const contradictionMutation = trpc.decision.checkContradictions.useMutation();
  const [gateResult, setGateResult] = useState<Awaited<ReturnType<typeof contradictionMutation.mutateAsync>> | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  const runGate = async () => {
    setGateLoading(true);
    try {
      const r = await contradictionMutation.mutateAsync({
        recommendation: props.recommendation,
        overall_confidence: props.overallConfidence ?? null,
        assessor_validated: props.assessorValidated ?? false,
        is_high_value: props.isHighValue ?? null,
        severity: props.severity ?? null,
        fraud_result: props.fraudRiskLevel ? { fraud_risk_level: props.fraudRiskLevel } : undefined,
        physics_result: props.physicsPlausible != null || props.hasCriticalPhysics != null
          ? { is_plausible: props.physicsPlausible ?? null, has_critical_inconsistency: props.hasCriticalPhysics ?? null }
          : undefined,
        damage_validation: props.damageConsistent != null || props.hasUnexplainedDamage != null
          ? { is_consistent: props.damageConsistent ?? null, has_unexplained_damage: props.hasUnexplainedDamage ?? null }
          : undefined,
        cost_decision: props.costRecommendation
          ? { recommendation: props.costRecommendation }
          : undefined,
        consistency_status: props.consistencyStatus
          ? {
              overall_status: props.consistencyStatus,
              critical_conflict_count: props.criticalConflictCount ?? 0,
              proceed: props.consistencyProceed ?? true,
            }
          : undefined,
      });
      setGateResult(r);
    } catch (e) {
      console.error("Contradiction gate error:", e);
    } finally {
      setGateLoading(false);
    }
  };

  // Auto-run on mount
  useState(() => { runGate(); });

  if (gateLoading && !gateResult) {
    return (
      <div className="flex items-center gap-2 py-2" style={{ color: "var(--muted-foreground)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Checking for contradictions…</span>
      </div>
    );
  }

  if (!gateResult) {
    return (
      <button
        className="flex items-center gap-1.5 text-xs"
        style={{ color: "var(--muted-foreground)" }}
        onClick={runGate}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Run Contradiction Check
      </button>
    );
  }

  const isBlocked = gateResult.action === "BLOCK";
  const criticalCount = gateResult.metadata.critical_count;
  const majorCount = gateResult.metadata.major_count;
  const minorCount = gateResult.metadata.minor_count;

  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        background: isBlocked
          ? "oklch(0.35 0.18 25 / 0.15)"
          : "oklch(0.35 0.12 145 / 0.10)",
        border: `1.5px solid ${
          isBlocked ? "oklch(0.55 0.22 25 / 0.5)" : "oklch(0.55 0.18 145 / 0.4)"
        }`,
      }}
    >
      {/* Gate header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBlocked
            ? <ShieldX className="w-4 h-4" style={{ color: "oklch(0.65 0.22 25)" }} />
            : <ShieldCheck className="w-4 h-4" style={{ color: "oklch(0.65 0.18 145)" }} />}
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: isBlocked ? "oklch(0.70 0.20 25)" : "oklch(0.70 0.18 145)" }}
          >
            {isBlocked ? `Contradiction Gate — BLOCKED` : "Contradiction Gate — PASSED"}
          </span>
          {isBlocked && (
            <div className="flex items-center gap-1">
              {criticalCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "oklch(0.35 0.20 25 / 0.4)", color: "oklch(0.75 0.20 25)" }}>
                  {criticalCount} CRITICAL
                </span>
              )}
              {majorCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "oklch(0.38 0.14 70 / 0.4)", color: "oklch(0.78 0.16 70)" }}>
                  {majorCount} MAJOR
                </span>
              )}
              {minorCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: "oklch(0.38 0.12 250 / 0.3)", color: "oklch(0.72 0.14 250)" }}>
                  {minorCount} MINOR
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs"
            style={{ color: "var(--muted-foreground)" }}
            onClick={runGate}
            disabled={gateLoading}
          >
            {gateLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
          {isBlocked && gateResult.contradictions.length > 0 && (
            <button
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Details
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
        {gateResult.summary}
      </p>

      {/* Contradiction details (expandable) */}
      {expanded && gateResult.contradictions.length > 0 && (
        <div className="space-y-2 pt-1">
          {gateResult.contradictions.map((c, i) => (
            <div
              key={i}
              className="rounded p-2.5 space-y-1"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background:
                      c.severity === "CRITICAL" ? "oklch(0.35 0.20 25 / 0.4)" :
                      c.severity === "MAJOR" ? "oklch(0.38 0.14 70 / 0.4)" :
                      "oklch(0.38 0.12 250 / 0.3)",
                    color:
                      c.severity === "CRITICAL" ? "oklch(0.75 0.20 25)" :
                      c.severity === "MAJOR" ? "oklch(0.78 0.16 70)" :
                      "oklch(0.72 0.14 250)",
                  }}
                >
                  {c.severity}
                </span>
                <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>{c.rule_id}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>{c.description}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                <span className="font-medium">{c.conflicting_values.field_a}</span>={c.conflicting_values.value_a}
                {" vs "}
                <span className="font-medium">{c.conflicting_values.field_b}</span>={c.conflicting_values.value_b}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DecisionAuthorityPanel({
  claimId,
  aiAssessment,
  claim,
  assessorValidated = false,
}: DecisionAuthorityPanelProps) {
  const [showTrace, setShowTrace] = useState(false);
  const [runKey, setRunKey] = useState(0);

  // Parse consistency check from JSON
  const consistencyCheck = (() => {
    try {
      return aiAssessment?.consistencyCheckJson
        ? JSON.parse(aiAssessment.consistencyCheckJson)
        : null;
    } catch {
      return null;
    }
  })();

  // Parse cost realism from JSON
  const costRealism = (() => {
    try {
      return aiAssessment?.costRealismJson
        ? JSON.parse(aiAssessment.costRealismJson)
        : null;
    } catch {
      return null;
    }
  })();

  // Build the input for the decision engine
  const decisionInput = {
    scenario_type: claim?.incidentType ?? null,
    severity: aiAssessment?.structuralDamageSeverity ?? null,
    overall_confidence: aiAssessment?.confidenceScore ?? null,
    assessor_validated: assessorValidated,
    is_high_value: claim?.isHighValue ?? null,
    fraud_result: aiAssessment
      ? {
          fraud_risk_level: aiAssessment.fraudRiskLevel as "minimal" | "low" | "medium" | "high" | "elevated" | null,
          fraud_risk_score: aiAssessment.fraudRiskScore ?? null,
        }
      : null,
    physics_result: aiAssessment?.physicsAnalysis
      ? {
          is_plausible: !aiAssessment.physicsAnalysis.toLowerCase().includes("implausible"),
          has_critical_inconsistency: aiAssessment.physicsAnalysis.toLowerCase().includes("critical"),
          summary: aiAssessment.physicsAnalysis.slice(0, 200),
        }
      : null,
    damage_validation: consistencyCheck
      ? {
          is_consistent: consistencyCheck.overall_status === "CONSISTENT",
          consistency_score: consistencyCheck.consistency_score ?? null,
          has_unexplained_damage: consistencyCheck.has_unexplained_damage ?? false,
          summary: consistencyCheck.summary ?? null,
        }
      : null,
    costDecision: aiAssessment?.estimatedCost != null && claim?.finalApprovedAmount != null
      ? {
          recommendation: (() => {
            const est = Number(aiAssessment.estimatedCost);
            const approved = Number(claim.finalApprovedAmount);
            if (approved === 0) return "ESCALATE" as const;
            const dev = Math.abs(est - approved) / approved;
            if (dev > 0.4) return "ESCALATE" as const;
            if (dev > 0.15) return "NEGOTIATE" as const;
            return "PROCEED_TO_ASSESSMENT" as const;
          })(),
          is_within_range: (() => {
            const est = Number(aiAssessment.estimatedCost);
            const approved = Number(claim.finalApprovedAmount);
            if (approved === 0) return null;
            return Math.abs(est - approved) / approved <= 0.4;
          })(),
          has_anomalies: costRealism?.has_anomalies ?? false,
        }
      : null,
    consistency_status: consistencyCheck
      ? {
          overall_status: consistencyCheck.overall_status ?? null,
          critical_conflict_count: consistencyCheck.critical_conflict_count ?? 0,
          proceed: consistencyCheck.proceed ?? true,
          summary: consistencyCheck.summary ?? null,
        }
      : null,
  };

  const decisionMutation = trpc.decision.evaluateClaimDecision.useMutation();

  // Run on mount and when runKey changes
  const [result, setResult] = useState<Awaited<ReturnType<typeof decisionMutation.mutateAsync>> | null>(null);
  const [loading, setLoading] = useState(false);

  const runDecision = async () => {
    setLoading(true);
    try {
      const r = await decisionMutation.mutateAsync(decisionInput);
      setResult(r);
    } catch (e) {
      console.error("Decision authority error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run once on mount
  useState(() => {
    runDecision();
  });

  if (loading && !result) {
    return (
      <div className="flex items-center justify-center gap-3 py-8" style={{ color: "var(--muted-foreground)" }}>
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Running Decision Authority engine…</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <ShieldCheck className="w-10 h-10" style={{ color: "var(--muted-foreground)" }} />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Decision not yet evaluated.</p>
        <Button variant="outline" size="sm" onClick={runDecision} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run Decision Engine
        </Button>
      </div>
    );
  }

  const basisLabel: Record<string, string> = {
    assessor_validated: "Assessor Validated",
    system_validated: "System Validated",
    insufficient_data: "Insufficient Data",
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RecommendationBadge recommendation={result.recommendation} />
          <Badge variant="outline" className="text-xs">
            {basisLabel[result.decision_basis] ?? result.decision_basis}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setRunKey((k) => k + 1); runDecision(); }}
          disabled={loading}
          className="text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Re-evaluate
        </Button>
      </div>

      {/* Confidence bar */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--muted-foreground)" }}>
          Decision Confidence
        </p>
        <ConfidenceBar confidence={result.confidence} />
      </div>

      {/* Reasoning */}
      <div className="p-3 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted-foreground)" }}>Reasoning</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{result.reasoning}</p>
      </div>

      {/* Key Drivers */}
      {result.key_drivers.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>Key Drivers</p>
          <div className="flex flex-wrap gap-2">
            {result.key_drivers.map((driver, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded-md"
                style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
              >
                {driver}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Blocking Factors */}
      {result.blocking_factors.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "oklch(0.65 0.18 25)" }}>Blocking Factors</p>
          <ul className="space-y-1">
            {result.blocking_factors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.60 0.20 25)" }} />
                <span style={{ color: "var(--foreground)" }}>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="p-3 rounded-lg" style={{ background: "oklch(0.38 0.14 70 / 0.15)", border: "1px solid oklch(0.55 0.18 70 / 0.4)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "oklch(0.72 0.18 70)" }}>Warnings</p>
          <ul className="space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs" style={{ color: "oklch(0.75 0.14 70)" }}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Contradiction Gate */}
      {result && (
        <ContradictionGate
          recommendation={result.recommendation}
          overallConfidence={aiAssessment?.confidenceScore ?? null}
          assessorValidated={assessorValidated}
          isHighValue={claim?.isHighValue ?? null}
          severity={aiAssessment?.structuralDamageSeverity ?? null}
          fraudRiskLevel={aiAssessment?.fraudRiskLevel ?? null}
          physicsPlausible={
            aiAssessment?.physicsAnalysis
              ? !aiAssessment.physicsAnalysis.toLowerCase().includes("implausible")
              : null
          }
          hasCriticalPhysics={
            aiAssessment?.physicsAnalysis
              ? aiAssessment.physicsAnalysis.toLowerCase().includes("critical")
              : null
          }
          damageConsistent={consistencyCheck ? consistencyCheck.overall_status === "CONSISTENT" : null}
          hasUnexplainedDamage={consistencyCheck?.has_unexplained_damage ?? null}
          costRecommendation={
            aiAssessment?.estimatedCost != null && claim?.finalApprovedAmount != null
              ? (() => {
                  const est = Number(aiAssessment.estimatedCost);
                  const approved = Number(claim.finalApprovedAmount);
                  if (approved === 0) return "ESCALATE" as const;
                  const dev = Math.abs(est - approved) / approved;
                  if (dev > 0.4) return "ESCALATE" as const;
                  if (dev > 0.15) return "NEGOTIATE" as const;
                  return "PROCEED_TO_ASSESSMENT" as const;
                })()
              : null
          }
          consistencyStatus={consistencyCheck?.overall_status ?? null}
          criticalConflictCount={consistencyCheck?.critical_conflict_count ?? null}
          consistencyProceed={consistencyCheck?.proceed ?? null}
        />
      )}

      {/* Decision Trace (collapsible) */}
      <FullDecisionTrace claimId={claimId} />

      {/* Metadata footer */}
      <div className="flex flex-wrap gap-3 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Engine: {result.metadata.engine} v{result.metadata.version}
        </span>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Inputs: {Object.values(result.metadata.inputs_available).filter(Boolean).length}/{Object.keys(result.metadata.inputs_available).length} available
        </span>
      </div>
    </div>
  );
}
