/**
 * AdvancedAnalyticsPanel
 * Surfaces Stage 35-42 pipeline outputs:
 *   Stage 35 — Damage-Physics Coherence
 *   Stage 36 — Cost Realism Validator
 *   Stage 37 — Causal Chain Builder
 *   Stage 38 — Evidence Bundle
 *   Stage 40 — Realism Bundle
 *   Stage 41 — Benchmark Deviation
 *   Stage 42 — Cross-Engine Consensus
 */
import { Badge } from "@/components/ui/badge";

interface AdvancedAnalyticsPanelProps {
  aiAssessment: any;
}

function safeParse(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function ScoreBadge({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 60 ? "bg-amber-500" :
    pct >= 40 ? "bg-orange-500" :
    "bg-red-500";
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white ${color}`}>
      {score.toFixed(0)}{max !== 100 ? `/${max}` : ""}
    </span>
  );
}

function LabelBadge({ label }: { label: string }) {
  const upper = (label || "").toUpperCase();
  const variant =
    upper === "HIGH" || upper === "STRONG" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    upper === "MEDIUM" || upper === "MODERATE" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
    upper === "LOW" || upper === "CONFLICTING" ? "bg-red-500/20 text-red-400 border-red-500/30" :
    "bg-muted/50 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${variant}`}>
      {label}
    </span>
  );
}

// ── Stage 37: Causal Chain ────────────────────────────────────────────────────
function CausalChainSection({ data }: { data: any }) {
  if (!data) return null;
  const steps: any[] = data.causal_chain ?? [];
  const outcomeColor =
    data.decision_outcome === "approve" ? "text-emerald-400" :
    data.decision_outcome === "reject" ? "text-red-400" :
    data.decision_outcome === "escalate" ? "text-amber-400" :
    "text-muted-foreground";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Decision Outcome:</span>
        <span className={`text-xs font-bold uppercase ${outcomeColor}`}>{data.decision_outcome}</span>
        <span className="text-xs text-muted-foreground">Confidence:</span>
        <ScoreBadge score={Math.round((data.confidence_score ?? 0) * 100)} />
        {data.escalation_required && (
          <Badge variant="destructive" className="text-xs">Escalation Required</Badge>
        )}
      </div>
      {data.chain_summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">{data.chain_summary}</p>
      )}
      {steps.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {steps.map((step: any, i: number) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded p-2 text-xs ${
                step.severity === "critical" ? "bg-red-500/10 border border-red-500/20" :
                step.severity === "warning" ? "bg-amber-500/10 border border-amber-500/20" :
                "bg-muted/30 border border-border/50"
              }`}
            >
              <span className={`shrink-0 font-bold mt-0.5 ${
                step.severity === "critical" ? "text-red-400" :
                step.severity === "warning" ? "text-amber-400" :
                "text-muted-foreground"
              }`}>{i + 1}.</span>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{step.title ?? step.label ?? `Step ${i + 1}`}</p>
                {step.description && <p className="text-muted-foreground mt-0.5 leading-snug">{step.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage 38: Evidence Bundle ─────────────────────────────────────────────────
function EvidenceBundleSection({ data }: { data: any }) {
  if (!data) return null;
  const engines = [
    { key: "composite", label: "Composite" },
    { key: "damage", label: "Damage" },
    { key: "physics", label: "Physics" },
    { key: "fraud", label: "Fraud" },
    { key: "cost", label: "Cost" },
    { key: "reconstruction", label: "Reconstruction" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {engines.map(({ key, label }) => {
        const tag = data[key];
        if (!tag) return null;
        return (
          <div key={key} className="rounded border border-border/50 bg-muted/20 p-2.5">
            <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
            <div className="flex items-center gap-1.5">
              <LabelBadge label={tag.evidence_label ?? tag.label ?? "—"} />
              {typeof tag.evidence_strength === "number" && (
                <span className="text-xs text-muted-foreground">{(tag.evidence_strength * 100).toFixed(0)}%</span>
              )}
            </div>
            {tag.rationale && (
              <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{tag.rationale}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Stage 40: Realism Bundle ──────────────────────────────────────────────────
function RealismBundleSection({ data }: { data: any }) {
  if (!data) return null;
  const engines = [
    { key: "physics", label: "Physics Realism" },
    { key: "cost", label: "Cost Realism" },
    { key: "fraud", label: "Fraud Realism" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Overall Realism:</span>
        <LabelBadge label={data.overall_realism_flag ? "REALISTIC" : "UNREALISTIC"} />
        {typeof data.overall_confidence_multiplier === "number" && (
          <span className="text-xs text-muted-foreground">
            Confidence ×{data.overall_confidence_multiplier.toFixed(2)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {engines.map(({ key, label }) => {
          const engine = data[key];
          if (!engine) return null;
          return (
            <div key={key} className="rounded border border-border/50 bg-muted/20 p-2.5">
              <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
              <LabelBadge label={engine.realism_flag ? "REALISTIC" : "UNREALISTIC"} />
              {engine.realism_summary && (
                <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{engine.realism_summary}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage 41: Benchmark Deviation ────────────────────────────────────────────
function BenchmarkBundleSection({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Source:</span>
        <span className="text-xs font-semibold text-foreground uppercase">{data.benchmark_source ?? "—"}</span>
        <span className="text-xs text-muted-foreground">Overall Deviation:</span>
        <LabelBadge label={data.overall_deviation_flag ? "FLAGGED" : "WITHIN RANGE"} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {["cost", "physics", "fraud"].map((key) => {
          const engine = data[key];
          if (!engine) return null;
          return (
            <div key={key} className="rounded border border-border/50 bg-muted/20 p-2.5">
              <p className="text-xs font-semibold text-foreground mb-1 capitalize">{key} Benchmark</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <LabelBadge label={engine.deviation_flag ? "FLAGGED" : "OK"} />
                {typeof engine.deviation_percent === "number" && (
                  <span className={`text-xs font-bold ${Math.abs(engine.deviation_percent) > 20 ? "text-red-400" : "text-muted-foreground"}`}>
                    {engine.deviation_percent > 0 ? "+" : ""}{engine.deviation_percent.toFixed(1)}%
                  </span>
                )}
              </div>
              {engine.deviation_summary && (
                <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{engine.deviation_summary}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage 42: Cross-Engine Consensus ─────────────────────────────────────────
function ConsensusSection({ data }: { data: any }) {
  if (!data) return null;
  const dims: any[] = data.dimensions ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground">Consensus Score:</span>
        <ScoreBadge score={Math.round(data.consensus_score ?? 0)} />
        <LabelBadge label={data.consensus_label ?? "—"} />
        {data.conflict_present && (
          <Badge variant="destructive" className="text-xs">
            {data.conflict_dimension_count} Conflict{data.conflict_dimension_count !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      {data.conflict_summary && (
        <p className="text-xs text-amber-400 leading-relaxed">{data.conflict_summary}</p>
      )}
      {data.narrative && (
        <p className="text-xs text-muted-foreground leading-relaxed">{data.narrative}</p>
      )}
      {dims.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {dims.map((dim: any, i: number) => (
            <div key={i} className="flex items-center gap-2 rounded border border-border/50 bg-muted/20 px-2.5 py-1.5">
              <LabelBadge label={dim.agreement_label ?? (dim.agreement ? "AGREE" : "CONFLICT")} />
              <span className="text-xs text-foreground font-medium">{dim.dimension ?? dim.name ?? `Dimension ${i + 1}`}</span>
              {typeof dim.agreement_score === "number" && (
                <span className="text-xs text-muted-foreground ml-auto">{dim.agreement_score.toFixed(0)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage 7b: Causal Verdict ─────────────────────────────────────────────────
function CausalVerdictSection({ data }: { data: any }) {
  if (!data) return null;
  const plausibilityColor =
    data.plausibilityBand === "very_high" || data.plausibilityBand === "high" ? "text-emerald-400" :
    data.plausibilityBand === "moderate" ? "text-amber-400" :
    data.plausibilityBand === "low" ? "text-orange-400" :
    "text-red-400";
  const alignmentBadge = (v: string) => {
    const map: Record<string, string> = {
      consistent: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      partially_consistent: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      inconsistent: "bg-red-500/20 text-red-400 border-red-500/30",
      not_applicable: "bg-muted/50 text-muted-foreground border-border",
      no_photos: "bg-muted/50 text-muted-foreground border-border",
    };
    return map[v] || map.not_applicable;
  };
  const severityColor = (s: string) =>
    s === "critical" ? "text-red-400" :
    s === "major" ? "text-orange-400" :
    s === "moderate" ? "text-amber-400" :
    "text-muted-foreground";
  return (
    <div className="space-y-4">
      {/* Inferred Cause + Plausibility */}
      <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Inferred Cause</p>
            <p className="text-sm font-medium text-foreground">{data.inferredCause}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground mb-1">Plausibility</p>
            <p className={`text-xl font-bold ${plausibilityColor}`}>{data.plausibilityScore}%</p>
            <p className={`text-xs capitalize ${plausibilityColor}`}>{(data.plausibilityBand || "").replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Direction:</span>
            <span className="text-xs font-semibold text-foreground capitalize">{(data.inferredCollisionDirection || "unknown").replace(/_/g, " ")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Physics:</span>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${alignmentBadge(data.physicsAlignment)}`}>
              {(data.physicsAlignment || "").replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Images:</span>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold ${alignmentBadge(data.imageAlignment)}`}>
              {(data.imageAlignment || "").replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>
      {/* Narrative Verdict */}
      {data.narrativeVerdict && (
        <div className="rounded-lg bg-muted/20 border border-border/50 p-3">
          <p className="text-xs text-muted-foreground mb-1.5">Adjuster Narrative</p>
          <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{data.narrativeVerdict}&rdquo;</p>
        </div>
      )}
      {/* Fraud Flag */}
      {data.flagForFraud && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
          <span className="text-red-400 text-base mt-0.5">⚠</span>
          <div>
            <p className="text-xs font-semibold text-red-400 mb-0.5">Fraud Flag Raised by Causal Engine</p>
            <p className="text-xs text-red-300">{data.fraudFlagReason}</p>
          </div>
        </div>
      )}
      {/* Supporting Evidence */}
      {Array.isArray(data.supportingEvidence) && data.supportingEvidence.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Supporting Evidence</p>
          <div className="space-y-1.5">
            {data.supportingEvidence.map((e: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={e.supports_claim ? "text-emerald-400 mt-0.5" : "text-red-400 mt-0.5"}>●</span>
                <span className="text-muted-foreground capitalize shrink-0">[{(e.source || "").replace(/_/g, " ")}]</span>
                <span className="text-foreground flex-1">{e.finding}</span>
                <span className="text-muted-foreground shrink-0">{e.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Contradictions */}
      {Array.isArray(data.contradictions) && data.contradictions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contradictions</p>
          <div className="space-y-2">
            {data.contradictions.map((c: any, i: number) => (
              <div key={i} className="rounded bg-orange-500/10 border border-orange-500/20 p-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold ${severityColor(c.severity)}`}>{(c.severity || "").toUpperCase()}</span>
                  <span className="text-xs text-muted-foreground">{c.source_a} vs {c.source_b}</span>
                </div>
                <p className="text-xs text-foreground">{c.description}</p>
                {c.implication && <p className="text-xs text-muted-foreground mt-0.5 italic">{c.implication}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ── Main Panel ────────────────────────────────────────────────────────────────
export default function AdvancedAnalyticsPanel({ aiAssessment }: AdvancedAnalyticsPanelProps) {
  if (!aiAssessment) return null;

  const causalVerdict = safeParse(aiAssessment.causalVerdictJson);
  const causalChain = safeParse(aiAssessment.causalChainJson);
  const evidenceBundle = safeParse(aiAssessment.evidenceBundleJson);
  const realismBundle = safeParse(aiAssessment.realismBundleJson);
  const benchmarkBundle = safeParse(aiAssessment.benchmarkBundleJson);
  const consensusResult = safeParse(aiAssessment.consensusResultJson);

  const hasData = causalVerdict || causalChain || evidenceBundle || realismBundle || benchmarkBundle || consensusResult;

  if (!hasData) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Advanced analytics (Stages 35-42) will appear here after the next pipeline run.
        </p>
      </div>
    );
  }

  const sections = [
    {
      id: "causal_verdict",
      label: "Causal Reasoning Verdict",
      stage: "7b",
      icon: "🧠",
      data: causalVerdict,
      render: (d: any) => <CausalVerdictSection data={d} />,
    },
    {
      id: "consensus",
      label: "Cross-Engine Consensus",
      stage: "42",
      icon: "⚖",
      data: consensusResult,
      render: (d: any) => <ConsensusSection data={d} />,
    },
    {
      id: "evidence",
      label: "Evidence Bundle",
      stage: "38",
      icon: "🔍",
      data: evidenceBundle,
      render: (d: any) => <EvidenceBundleSection data={d} />,
    },
    {
      id: "causal",
      label: "Causal Chain",
      stage: "37",
      icon: "🔗",
      data: causalChain,
      render: (d: any) => <CausalChainSection data={d} />,
    },
    {
      id: "realism",
      label: "Realism Validation",
      stage: "40",
      icon: "✓",
      data: realismBundle,
      render: (d: any) => <RealismBundleSection data={d} />,
    },
    {
      id: "benchmark",
      label: "Benchmark Deviation",
      stage: "41",
      icon: "📊",
      data: benchmarkBundle,
      render: (d: any) => <BenchmarkBundleSection data={d} />,
    },
  ].filter((s) => s.data);

  return (
    <div className="space-y-3">
      {sections.map((sec) => (
        <div key={sec.id} className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/30">
            <span className="text-base">{sec.icon}</span>
            <span className="text-sm font-semibold text-foreground">{sec.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">Stage {sec.stage}</span>
          </div>
          <div className="p-4">
            {sec.render(sec.data)}
          </div>
        </div>
      ))}
    </div>
  );
}
