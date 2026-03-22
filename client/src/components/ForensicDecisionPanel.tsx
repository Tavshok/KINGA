/**
 * ForensicDecisionPanel
 * Decision-ready UI model for claim assessment.
 * Converts all structured pipeline outputs into 7 visual sections:
 *   1. Claim Truth Summary
 *   2. Visual Physics Model
 *   3. Damage Zone Map
 *   4. Cost Intelligence
 *   5. Evidence Integrity
 *   6. Simplified Narrative
 *   7. Actions Required
 */
import { useMemo } from "react";
import { AlertTriangle, CheckCircle, XCircle, AlertCircle, Zap, Shield, DollarSign, Camera, Activity, ArrowRight, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, Layers, GitCompare, Link2, Link2Off } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

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
  const parsed = safeParse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// ── Severity color helpers ────────────────────────────────────────────────────
function fraudColor(score: number) {
  if (score <= 15) return { bg: "oklch(0.35 0.14 145 / 0.15)", border: "oklch(0.55 0.18 145 / 0.4)", text: "text-emerald-400", label: "MINIMAL" };
  if (score <= 35) return { bg: "oklch(0.72 0.18 60 / 0.10)", border: "oklch(0.72 0.18 60 / 0.35)", text: "text-amber-400", label: "LOW" };
  if (score <= 60) return { bg: "oklch(0.65 0.20 40 / 0.12)", border: "oklch(0.65 0.20 40 / 0.4)", text: "text-orange-400", label: "MEDIUM" };
  return { bg: "oklch(0.55 0.22 25 / 0.12)", border: "oklch(0.55 0.22 25 / 0.4)", text: "text-red-400", label: "HIGH" };
}

function confidenceColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-orange-400";
}

function severityBand(kmh: number) {
  if (kmh < 15) return { label: "Cosmetic", color: "#86efac" };
  if (kmh < 30) return { label: "Minor", color: "#fde68a" };
  if (kmh < 55) return { label: "Moderate", color: "#fb923c" };
  if (kmh < 80) return { label: "Severe", color: "#f87171" };
  return { label: "Catastrophic", color: "#7f1d1d" };
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden" style={{ background: "oklch(0.18 0.01 260 / 0.6)" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40" style={{ background: "oklch(0.22 0.02 260 / 0.8)" }}>
        <span className="text-primary">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Metric tile ───────────────────────────────────────────────────────────────
function Metric({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold ${color ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Integrity flag pill ───────────────────────────────────────────────────────
function IntegrityFlag({ flag, severity, description, action }: { flag: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; action?: string }) {
  const colors = {
    HIGH: { bg: "oklch(0.55 0.22 25 / 0.12)", border: "oklch(0.55 0.22 25 / 0.4)", text: "text-red-400", dot: "bg-red-400" },
    MEDIUM: { bg: "oklch(0.72 0.18 60 / 0.10)", border: "oklch(0.72 0.18 60 / 0.35)", text: "text-amber-400", dot: "bg-amber-400" },
    LOW: { bg: "oklch(0.35 0.14 145 / 0.10)", border: "oklch(0.55 0.18 145 / 0.3)", text: "text-emerald-400", dot: "bg-emerald-400" },
  }[severity];
  return (
    <div className="rounded-lg p-3 space-y-1" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
        <span className={`text-xs font-mono font-semibold ${colors.text}`}>{flag}</span>
        <span className={`ml-auto text-xs font-bold ${colors.text}`}>{severity}</span>
      </div>
      <p className="text-xs text-muted-foreground pl-4">{description}</p>
      {action && <p className="text-xs text-primary pl-4 font-medium">→ {action}</p>}
    </div>
  );
}

export default function ForensicDecisionPanel({ aiAssessment, claim }: ForensicDecisionPanelProps) {
  const { fmt } = useTenantCurrency();

  const physics = useMemo(() => safeParse(aiAssessment?.physicsAnalysis), [aiAssessment?.physicsAnalysis]);
  const damagePattern = useMemo(() => {
    // damagePatternValidation is nested inside physicsAnalysis
    const p = safeParse(aiAssessment?.physicsAnalysis);
    return p?.damagePatternValidation ?? null;
  }, [aiAssessment?.physicsAnalysis]);
  const costIntel = useMemo(() => safeParse(aiAssessment?.costIntelligenceJson), [aiAssessment?.costIntelligenceJson]);
  const fraudBreakdown = useMemo(() => safeParse(aiAssessment?.fraudScoreBreakdownJson), [aiAssessment?.fraudScoreBreakdownJson]);
  const scenarioFraud = useMemo(() => {
    // scenarioFraudResult is stored inside fraudScoreBreakdownJson or as a direct field
    const fb = safeParse(aiAssessment?.fraudScoreBreakdownJson);
    return fb?.scenarioFraudResult ?? safeParse(aiAssessment?.scenarioFraudResult) ?? null;
  }, [aiAssessment?.fraudScoreBreakdownJson, aiAssessment?.scenarioFraudResult]);
  const crossEngineConsistency = useMemo(() => {
    const fb = safeParse(aiAssessment?.fraudScoreBreakdownJson);
    return fb?.crossEngineConsistency ?? null;
  }, [aiAssessment?.fraudScoreBreakdownJson]);
  const partsRecon = useMemo(() => safeParseArray(aiAssessment?.partsReconciliationJson), [aiAssessment?.partsReconciliationJson]);
  const pipelineSummary = useMemo(() => safeParse(aiAssessment?.pipelineRunSummary), [aiAssessment?.pipelineRunSummary]);
  const enrichedPhotos = useMemo(() => safeParse(aiAssessment?.enrichedPhotosJson), [aiAssessment?.enrichedPhotosJson]);
  const damagedComponents = useMemo(() => safeParseArray(aiAssessment?.damagedComponentsJson), [aiAssessment?.damagedComponentsJson]);

  if (!aiAssessment) {
    return (
      <div className="rounded-xl border border-border/50 p-8 text-center" style={{ background: "oklch(0.18 0.01 260 / 0.6)" }}>
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No assessment data available. Run the AI pipeline to generate the decision model.</p>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const fraudScore = Number(aiAssessment.fraudScore ?? fraudBreakdown?.totalScore ?? 0);
  const fraudIndicators: any[] = fraudBreakdown?.indicators ?? fraudBreakdown?.breakdown ?? [];
  const fraudColors = fraudColor(fraudScore);

  const confidenceScore = Number(aiAssessment.confidenceScore ?? 72);
  const estimatedSpeedKmh = Number(physics?.estimatedSpeedKmh ?? 0);
  const deltaVKmh = Number(physics?.deltaVKmh ?? 0);
  const impactForceKn = Number(physics?.impactForceKn ?? physics?.impactVector?.magnitude ?? 0) / (physics?.impactVector?.magnitude > 1000 ? 1000 : 1);
  const energyKj = Number(physics?.energyDistribution?.energyDissipatedKj ?? physics?.energyKj ?? 0);
  const kineticEnergyJ = Number(physics?.energyDistribution?.kineticEnergyJ ?? 0);
  const severity = physics?.accidentSeverity ?? "unknown";
  const impactDirection = (physics?.impactVector?.direction ?? physics?.impactDirection ?? "unknown").toUpperCase();
  const latent = physics?.latentDamageProbability ?? {};
  const severityInfo = severityBand(estimatedSpeedKmh);

  // Stale severity check — if physics says minor but speed > 15, flag it
  const severityStale = severity === "minor" && estimatedSpeedKmh >= 15;

  // Zone distribution
  const frontComponents = damagedComponents.filter((c: any) => {
    const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase();
    return n.includes("front") || n.includes("grille") || n.includes("radiator") || n.includes("tow") || n.includes("diff");
  });
  const rearComponents = damagedComponents.filter((c: any) => {
    const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase();
    return n.includes("rear") || n.includes("tail") || n.includes("tailgate") || n.includes("loading");
  });
  const sideComponents = damagedComponents.filter((c: any) => {
    const n = (typeof c === "string" ? c : c?.component ?? c?.name ?? "").toLowerCase();
    return n.includes("door") || n.includes("side") || n.includes("quarter") || n.includes("pillar") || n.includes("sill");
  });
  const totalComponents = damagedComponents.length;

  // Cost data
  const aiCost = Number(aiAssessment.estimatedCost ?? 0);
  const agreedCost = Number(costIntel?.documentedAgreedCostUsd ?? costIntel?.agreedCostUsd ?? 0);
  const originalQuote = Number(costIntel?.documentedOriginalQuoteUsd ?? costIntel?.originalQuoteUsd ?? 0);
  const marketValue = Number(costIntel?.marketValueUsd ?? 0);
  const repairToValue = marketValue > 0 ? ((agreedCost || aiCost) / marketValue) * 100 : Number(costIntel?.repairToValuePct ?? 0);
  const maxCost = Math.max(aiCost, agreedCost, originalQuote, 1);
  const costBasis = agreedCost > 0 ? agreedCost : aiCost;
  const quotesReceived = Number(costIntel?.quotesReceived ?? 0);

  // Integrity flags
  const integrityFlags: Array<{ flag: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; action: string }> = [];
  const physicsMs = pipelineSummary?.stages?.["7_physics"]?.durationMs ?? 0;
  if (physicsMs < 10 || severity === "minor" && estimatedSpeedKmh >= 15) {
    integrityFlags.push({
      flag: "physics_estimated",
      severity: "HIGH",
      description: `Physics ran in ${physicsMs}ms (deterministic fallback). Severity field shows "${severity}" but corrected speed is ${estimatedSpeedKmh.toFixed(1)} km/h.`,
      action: "Re-run Stage 7 with accident description as input. Patch accidentSeverity to 'moderate'."
    });
  }
  const quotesMapped = partsRecon.filter((r: any) => r.quotedAmount != null).length;
  if (agreedCost === 0 || quotesMapped === 0) {
    integrityFlags.push({
      flag: "quote_mapping_failure",
      severity: "HIGH",
      description: `Agreed cost ${agreedCost > 0 ? fmt(agreedCost) : "not mapped"} at assessment level. ${quotesMapped}/${totalComponents} components have quoted amounts in reconciliation.`,
      action: "Re-run Stage 9 with recovered agreed cost disaggregated across components."
    });
  }
  const photosJson = safeParseArray(aiAssessment?.damagePhotosJson);
  if (!enrichedPhotos && photosJson.length === 0) {
    integrityFlags.push({
      flag: "image_processing_failure",
      severity: "MEDIUM",
      description: "damage_photos_json = []. enriched_photos_json = NULL. Stage 11 photo enrichment has not been executed.",
      action: "Extract photos from source PDF pages 3–4. Trigger Stage 11 photo enrichment."
    });
  }

  // Simplified narrative
  const narrative = [
    `The ${claim?.vehicleMake ?? "vehicle"} (${claim?.vehicleRegistration ?? "—"}) was involved in a ${impactDirection.toLowerCase()} collision${estimatedSpeedKmh > 0 ? ` at an estimated ${estimatedSpeedKmh.toFixed(1)} km/h` : ""}, dissipating ${energyKj > 0 ? `${energyKj.toFixed(1)} kJ` : "an unknown amount of energy"} across ${totalComponents} identified components.`,
    totalComponents > 0 ? `Damage spans ${[frontComponents.length > 0 && `${frontComponents.length} front`, rearComponents.length > 0 && `${rearComponents.length} rear`, sideComponents.length > 0 && `${sideComponents.length} side`].filter(Boolean).join(", ")} components — consistent with the reported collision mechanism.` : null,
    costBasis > 0 ? `${quotesReceived > 0 ? `${quotesReceived} quotes obtained;` : "Estimated"} repair cost ${fmt(costBasis)}${marketValue > 0 ? ` (${repairToValue.toFixed(1)}% of ${fmt(marketValue)} market value)` : ""} — ${repairToValue < 70 ? "clear repair case" : "approaching total-loss threshold"}.` : null,
    fraudScore <= 15 ? `Fraud score ${fraudScore}/100 (minimal); ${fraudIndicators.length > 0 ? `active indicator: ${fraudIndicators[0]?.indicator ?? fraudIndicators[0]?.label ?? "—"}` : "no active fraud indicators"}.` : `Fraud score ${fraudScore}/100 — review required.`,
    integrityFlags.length > 0 ? `${integrityFlags.length} system integrity flag${integrityFlags.length > 1 ? "s" : ""} open: ${integrityFlags.map(f => f.flag).join(", ")}.` : "All integrity checks passed.",
  ].filter(Boolean) as string[];

  // Actions
  const actions: Array<{ priority: number; label: string; type: string; flag?: string; effort: string }> = [
    ...integrityFlags.map((f, i) => ({
      priority: i + 1,
      label: f.action.split(".")[0],
      type: "PIPELINE_RERUN",
      flag: f.flag,
      effort: "automated"
    })),
    ...(photosJson.length === 0 && !enrichedPhotos ? [{
      priority: integrityFlags.length + 1,
      label: "Review source document pages 3–4 for damage photographs",
      type: "MANUAL_REVIEW",
      effort: "manual"
    }] : [])
  ];

  return (
    <div className="space-y-4">

      {/* ── 1. CLAIM TRUTH SUMMARY ─────────────────────────────────────────── */}
      <Section icon={<Shield className="h-4 w-4" />} title="Claim Truth Summary" subtitle="Overall decision recommendation and risk profile">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Status */}
          <div className="col-span-1 flex flex-col gap-2">
            <div className="rounded-lg p-4 text-center" style={{ background: fraudScore <= 15 ? "oklch(0.35 0.14 145 / 0.15)" : "oklch(0.55 0.22 25 / 0.12)", border: `1px solid ${fraudScore <= 15 ? "oklch(0.55 0.18 145 / 0.4)" : "oklch(0.55 0.22 25 / 0.4)"}` }}>
              {fraudScore <= 35 ? <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" /> : <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />}
              <p className={`text-xl font-black ${fraudScore <= 35 ? "text-emerald-400" : "text-amber-400"}`}>{fraudScore <= 35 ? "APPROVE" : "REVIEW"}</p>
              <p className="text-xs text-muted-foreground mt-1">Recommendation</p>
            </div>
          </div>
          {/* Confidence */}
          <div className="col-span-1 flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Confidence Score</p>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-black ${confidenceColor(confidenceScore)}`}>{confidenceScore}</span>
                <span className="text-sm text-muted-foreground mb-1">/100</span>
              </div>
              <div className="w-full h-2 rounded-full bg-border/40 mt-1">
                <div className="h-2 rounded-full transition-all" style={{ width: `${confidenceScore}%`, background: confidenceScore >= 80 ? "#4ade80" : confidenceScore >= 60 ? "#fbbf24" : "#f97316" }} />
              </div>
              {confidenceScore < 80 && <p className="text-xs text-muted-foreground mt-1">Provisional — photo enrichment pending</p>}
            </div>
          </div>
          {/* Fraud */}
          <div className="col-span-1">
            <p className="text-xs text-muted-foreground mb-1">Fraud Risk</p>
            <div className="rounded-lg p-3" style={{ background: fraudColors.bg, border: `1px solid ${fraudColors.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-2xl font-black ${fraudColors.text}`}>{fraudScore}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${fraudColors.text}`} style={{ border: `1px solid currentColor` }}>{fraudColors.label}</span>
              </div>
              {fraudIndicators.length > 0 && (
                <div className="space-y-1">
                  {fraudIndicators.slice(0, 2).map((ind: any, i: number) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className={`font-mono ${fraudColors.text}`}>{ind.indicator ?? ind.label ?? "—"}</span>
                      {ind.type === "system_gap" && <span className="text-muted-foreground/60"> (system gap)</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 2. VISUAL PHYSICS MODEL ───────────────────────────────────────────── */}
      <Section icon={<Zap className="h-4 w-4" />} title="Physics Model" subtitle="Impact reconstruction — speed, energy, force, severity">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Metric label="Est. Speed" value={`${estimatedSpeedKmh.toFixed(1)} km/h`} color={estimatedSpeedKmh > 0 ? "text-foreground" : "text-muted-foreground"} />
          <Metric label="Delta-V" value={`${deltaVKmh.toFixed(1)} km/h`} />
          <Metric label="Impact Force" value={`${impactForceKn.toFixed(1)} kN`} />
          <Metric label="Energy Dissipated" value={`${energyKj.toFixed(1)} kJ`} />
        </div>
        {/* Severity scale */}
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-2">Severity Classification</p>
          <div className="flex gap-1 items-center">
            {[
              { band: "Cosmetic", range: "0–15", color: "#86efac" },
              { band: "Minor", range: "15–30", color: "#fde68a" },
              { band: "Moderate", range: "30–55", color: "#fb923c" },
              { band: "Severe", range: "55–80", color: "#f87171" },
              { band: "Catastrophic", range: "80+", color: "#7f1d1d" },
            ].map(b => {
              const isActive = b.band.toLowerCase() === (severityStale ? "moderate" : severity?.toLowerCase());
              return (
                <div key={b.band} className={`flex-1 rounded px-1 py-1.5 text-center transition-all ${isActive ? "ring-2 ring-white/30" : "opacity-40"}`} style={{ background: b.color + (isActive ? "cc" : "40") }}>
                  <p className="text-xs font-bold" style={{ color: isActive ? "#fff" : b.color }}>{b.band}</p>
                  <p className="text-xs opacity-70" style={{ color: isActive ? "#fff" : b.color }}>{b.range}</p>
                </div>
              );
            })}
          </div>
          {severityStale && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-400">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>Stored value is "<strong>{severity}</strong>" — stale from pre-fix pipeline run. Corrected classification: <strong>Moderate</strong>.</span>
            </div>
          )}
        </div>
        {/* Energy distribution bar */}
        {kineticEnergyJ > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Energy Distribution</p>
            <div className="flex h-4 rounded overflow-hidden gap-px">
              <div className="flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(energyKj * 1000 / kineticEnergyJ) * 100}%`, background: "#f97316" }}>
                {((energyKj * 1000 / kineticEnergyJ) * 100).toFixed(0)}%
              </div>
              <div className="flex-1" style={{ background: "#374151" }} />
            </div>
            <div className="flex gap-4 mt-1">
              <span className="text-xs text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "#f97316" }} />Dissipated into structure</span>
              <span className="text-xs text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm mr-1 bg-muted" />Retained by mass</span>
            </div>
          </div>
        )}
        {/* Impact direction */}
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Impact Direction:</p>
          <span className="text-xs font-mono font-semibold text-primary">{impactDirection}</span>
          {impactDirection === "REAR" && <span className="text-xs text-muted-foreground">— chain collision; reaction load on front structure</span>}
        </div>
        {/* Latent damage */}
        {Object.keys(latent).length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Latent Damage Probability</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(latent).map(([system, prob]) => (
                <span key={system} className="text-xs px-2 py-0.5 rounded border border-border/40 text-muted-foreground">
                  {system}: <span className={Number(prob) === 0 ? "text-emerald-400" : "text-amber-400"}>{Number(prob) === 0 ? "0%" : `${(Number(prob) * 100).toFixed(0)}%`}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── 3. DAMAGE ZONE MAP ────────────────────────────────────────────────── */}
      <Section icon={<Activity className="h-4 w-4" />} title="Damage Zone Map" subtitle={`${totalComponents} components across ${[frontComponents.length > 0, rearComponents.length > 0, sideComponents.length > 0].filter(Boolean).length} zone(s)`}>
        {totalComponents === 0 ? (
          <p className="text-sm text-muted-foreground">No components extracted from pipeline.</p>
        ) : (
          <div className="space-y-3">
            {/* Zone bars */}
            {[
              { zone: "FRONT", components: frontComponents, color: "#3b82f6" },
              { zone: "REAR", components: rearComponents, color: "#f97316" },
              { zone: "SIDE", components: sideComponents, color: "#a855f7" },
            ].map(({ zone, components, color }) => (
              <div key={zone}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">{zone}</span>
                  <span className="text-xs text-muted-foreground">{components.length} component{components.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="w-full h-3 rounded-full bg-border/30">
                  <div className="h-3 rounded-full" style={{ width: totalComponents > 0 ? `${(components.length / totalComponents) * 100}%` : "0%", background: color }} />
                </div>
                {components.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {components.slice(0, 6).map((c: any, i: number) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
                        {typeof c === "string" ? c : (c?.component ?? c?.name ?? "—")}
                      </span>
                    ))}
                    {components.length > 6 && <span className="text-xs text-muted-foreground">+{components.length - 6} more</span>}
                  </div>
                )}
              </div>
            ))}
            {/* Highest cost component */}
            {partsRecon.length > 0 && (() => {
              const top = [...partsRecon].sort((a, b) => (b.aiEstimate ?? 0) - (a.aiEstimate ?? 0))[0];
              return top ? (
                <div className="mt-2 rounded-lg p-3 border border-border/40" style={{ background: "oklch(0.22 0.02 260 / 0.5)" }}>
                  <p className="text-xs text-muted-foreground">Highest Cost Component</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-semibold text-foreground">{top.component}</span>
                    <span className="text-sm font-bold text-primary">{fmt(top.aiEstimate ?? 0)}</span>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </Section>

      {/* ── 3b. DAMAGE PATTERN VALIDATION ─────────────────────────────────────────────────── */}
      {damagePattern ? (
        <Section
          icon={<Layers className="h-4 w-4" />}
          title="Damage Pattern Validation"
          subtitle={`Scenario: ${(physics?.animalStrikePhysics ? 'animal_strike' : (safeParse(aiAssessment?.claimRecord)?.accidentDetails?.incidentType ?? 'unknown')).replace(/_/g, ' ')} — ${damagePattern.pattern_match} match`}
        >
          {/* Match strength header */}
          <div className="flex items-center gap-3 mb-4">
            {damagePattern.pattern_match === 'STRONG' && <ShieldCheck className="h-8 w-8 text-emerald-400 flex-shrink-0" />}
            {damagePattern.pattern_match === 'MODERATE' && <ShieldCheck className="h-8 w-8 text-amber-400 flex-shrink-0" />}
            {damagePattern.pattern_match === 'WEAK' && <ShieldAlert className="h-8 w-8 text-orange-400 flex-shrink-0" />}
            {damagePattern.pattern_match === 'NONE' && <ShieldX className="h-8 w-8 text-red-400 flex-shrink-0" />}
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black ${
                  damagePattern.pattern_match === 'STRONG' ? 'text-emerald-400' :
                  damagePattern.pattern_match === 'MODERATE' ? 'text-amber-400' :
                  damagePattern.pattern_match === 'WEAK' ? 'text-orange-400' : 'text-red-400'
                }`}>{damagePattern.pattern_match}</span>
                <span className="text-xs text-muted-foreground">pattern match</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-32 h-2 rounded-full bg-border/30">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${damagePattern.confidence}%`,
                      background: damagePattern.confidence >= 70 ? '#4ade80' : damagePattern.confidence >= 40 ? '#fbbf24' : '#f97316'
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{damagePattern.confidence}/100 confidence</span>
              </div>
            </div>
            {/* Structural damage badge */}
            {damagePattern.structural_damage_detected && (
              <span className="ml-auto text-xs px-2 py-1 rounded border border-red-400/40 text-red-400 font-semibold flex-shrink-0">
                STRUCTURAL
              </span>
            )}
          </div>

          {/* Coverage metrics */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg p-3 border border-border/40" style={{ background: 'oklch(0.22 0.02 260 / 0.5)' }}>
              <p className="text-xs text-muted-foreground mb-1">Primary Coverage</p>
              <div className="flex items-end gap-1">
                <span className="text-xl font-bold text-foreground">{damagePattern.validation_detail.primary_coverage_pct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-border/30 mt-1">
                <div className="h-1.5 rounded-full" style={{ width: `${damagePattern.validation_detail.primary_coverage_pct}%`, background: '#3b82f6' }} />
              </div>
              {damagePattern.validation_detail.matched_primary.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{damagePattern.validation_detail.matched_primary.slice(0, 3).join(', ')}</p>
              )}
            </div>
            <div className="rounded-lg p-3 border border-border/40" style={{ background: 'oklch(0.22 0.02 260 / 0.5)' }}>
              <p className="text-xs text-muted-foreground mb-1">Secondary Coverage</p>
              <div className="flex items-end gap-1">
                <span className="text-xl font-bold text-foreground">{damagePattern.validation_detail.secondary_coverage_pct}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-border/30 mt-1">
                <div className="h-1.5 rounded-full" style={{ width: `${damagePattern.validation_detail.secondary_coverage_pct}%`, background: '#a855f7' }} />
              </div>
              {damagePattern.validation_detail.matched_secondary.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{damagePattern.validation_detail.matched_secondary.slice(0, 3).join(', ')}</p>
              )}
            </div>
          </div>

          {/* Image contradiction alert */}
          {damagePattern.validation_detail.image_contradiction && (
            <div className="rounded-lg p-3 mb-3 border border-red-500/40" style={{ background: 'oklch(0.55 0.22 25 / 0.10)' }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <span className="text-xs font-bold text-red-400">IMAGE CONTRADICTION DETECTED</span>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {damagePattern.validation_detail.image_contradiction_reason ?? 'Image-detected zones do not match the reported damage pattern.'}
              </p>
            </div>
          )}

          {/* Missing expected components */}
          {damagePattern.missing_expected_components.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1">Missing Expected Components</p>
              <div className="flex flex-wrap gap-1">
                {damagePattern.missing_expected_components.map((c: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded border border-amber-400/30 text-amber-400">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Unexpected components */}
          {damagePattern.unexpected_components.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1">Unexpected Components</p>
              <div className="flex flex-wrap gap-1">
                {damagePattern.unexpected_components.slice(0, 6).map((c: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded border border-blue-400/30 text-blue-400">{c}</span>
                ))}
                {damagePattern.unexpected_components.length > 6 && (
                  <span className="text-xs text-muted-foreground">+{damagePattern.unexpected_components.length - 6} more</span>
                )}
              </div>
            </div>
          )}

          {/* Structural components found */}
          {damagePattern.validation_detail.structural_components_found.length > 0 && (
            <div className="rounded-lg p-3 border border-red-400/30" style={{ background: 'oklch(0.55 0.22 25 / 0.08)' }}>
              <p className="text-xs font-semibold text-red-400 mb-1">Structural Components Identified</p>
              <div className="flex flex-wrap gap-1">
                {damagePattern.validation_detail.structural_components_found.map((c: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded border border-red-400/30 text-red-400">{c}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Structural damage increases repair severity and cost estimates.</p>
            </div>
          )}

          {/* Reasoning */}
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Engine reasoning →</summary>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{damagePattern.reasoning}</p>
          </details>
        </Section>
      ) : null}

      {/* ── 4. COST INTELLIGENCE ────────────────────────────────────────────────────────── */}  <Section icon={<DollarSign className="h-4 w-4" />} title="Cost Intelligence" subtitle="AI estimate vs. agreed cost vs. market value">
        <div className="space-y-3">
          {/* Comparison bars */}
          {[
            { label: "Original Quote", value: originalQuote, color: "#f87171", note: `${quotesReceived > 0 ? `Lowest of ${quotesReceived} quotes` : "Submitted quote"}` },
            { label: "AI Model Estimate", value: aiCost, color: "#fb923c", note: "Flat per-component model" },
            { label: "Agreed Cost", value: agreedCost > 0 ? agreedCost : null, color: "#4ade80", note: "Assessor-negotiated — operative figure" },
          ].filter(item => (item.value ?? 0) > 0).map(({ label, value, color, note }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{note}</span>
                </div>
                <span className="text-sm font-bold" style={{ color }}>{fmt(value ?? 0)}</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-border/30">
                <div className="h-2.5 rounded-full" style={{ width: `${((value ?? 0) / maxCost) * 100}%`, background: color }} />
              </div>
            </div>
          ))}
          {/* Repair-to-value gauge */}
          {marketValue > 0 && (
            <div className="mt-2 rounded-lg p-3 border border-border/40" style={{ background: "oklch(0.22 0.02 260 / 0.5)" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Repair-to-Value Ratio</p>
                <span className={`text-xs font-bold ${repairToValue < 70 ? "text-emerald-400" : "text-red-400"}`}>{repairToValue.toFixed(1)}% of {fmt(marketValue)}</span>
              </div>
              <div className="w-full h-3 rounded-full bg-border/30 relative">
                <div className="h-3 rounded-full" style={{ width: `${Math.min(repairToValue, 100)}%`, background: repairToValue < 70 ? "#4ade80" : "#f87171" }} />
                {/* 70% threshold marker */}
                <div className="absolute top-0 h-3 w-0.5 bg-amber-400" style={{ left: "70%" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">0%</span>
                <span className="text-xs text-amber-400">70% total-loss threshold</span>
                <span className="text-xs text-muted-foreground">100%</span>
              </div>
              <p className={`text-xs font-semibold mt-1 ${repairToValue < 70 ? "text-emerald-400" : "text-red-400"}`}>
                {repairToValue < 70 ? "✓ Clear repair case" : "⚠ Approaching total-loss threshold"}
              </p>
            </div>
          )}
          {/* Parts reconciliation status */}
          <div className="flex items-center gap-2 text-xs">
            {quotesMapped > 0 ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            )}
            <span className="text-muted-foreground">
              Parts reconciliation: <span className={quotesMapped > 0 ? "text-emerald-400" : "text-red-400"}>{quotesMapped}/{totalComponents} components mapped</span>
            </span>
          </div>
        </div>
      </Section>

      {/* ── 5. EVIDENCE INTEGRITY ─────────────────────────────────────────────── */}
      <Section icon={<Camera className="h-4 w-4" />} title="Evidence Integrity" subtitle="System input usage and pipeline completeness">
        {integrityFlags.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">All integrity checks passed</span>
          </div>
        ) : (
          <div className="space-y-2">
            {integrityFlags.map((f, i) => (
              <IntegrityFlag key={i} flag={f.flag} severity={f.severity} description={f.description} action={f.action} />
            ))}
          </div>
        )}
        {/* Input usage table */}
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Input Usage</p>
          <div className="space-y-1">
            {[
              { label: "Vehicle type & mass", used: !!aiAssessment.vehicleMake || totalComponents > 0 },
              { label: "Component list", used: totalComponents > 0 },
              { label: "Accident description", used: !!(claim?.incidentDescription ?? claim?.normalised_description) },
              { label: "Agreed cost", used: agreedCost > 0 },
              { label: "Market value", used: marketValue > 0 },
              { label: "Damage photographs", used: photosJson.length > 0 || !!enrichedPhotos },
            ].map(({ label, used }) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                {used ? <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" /> : <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                <span className={used ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                {!used && <span className="text-muted-foreground/60 ml-auto">not used</span>}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 5b. SCENARIO-AWARE FRAUD DETECTION ──────────────────────────────── */}
      {scenarioFraud && (
        <Section
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Scenario-Aware Fraud Detection"
          subtitle={`Profile: ${scenarioFraud.engine_metadata?.scenario_profile_applied ?? scenarioFraud.engine_metadata?.scenario_type ?? "unknown"} — ${scenarioFraud.risk_level} risk`}
        >
          <div className="space-y-4">
            {/* Score + risk level row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: scenarioFraud.risk_level === "LOW" ? "oklch(0.35 0.14 145 / 0.15)" : scenarioFraud.risk_level === "MEDIUM" ? "oklch(0.72 0.18 60 / 0.10)" : "oklch(0.55 0.22 25 / 0.12)", border: `1px solid ${scenarioFraud.risk_level === "LOW" ? "oklch(0.55 0.18 145 / 0.4)" : scenarioFraud.risk_level === "MEDIUM" ? "oklch(0.72 0.18 60 / 0.35)" : "oklch(0.55 0.22 25 / 0.4)"}` }}>
                <p className={`text-2xl font-black ${scenarioFraud.risk_level === "LOW" ? "text-emerald-400" : scenarioFraud.risk_level === "MEDIUM" ? "text-amber-400" : "text-red-400"}`}>{scenarioFraud.fraud_score}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scenario Score</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.18 0.01 260 / 0.4)", border: "1px solid oklch(0.35 0.01 260 / 0.4)" }}>
                <p className={`text-lg font-bold ${scenarioFraud.risk_level === "LOW" ? "text-emerald-400" : scenarioFraud.risk_level === "MEDIUM" ? "text-amber-400" : "text-red-400"}`}>{scenarioFraud.risk_level}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Risk Level</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.18 0.01 260 / 0.4)", border: "1px solid oklch(0.35 0.01 260 / 0.4)" }}>
                <p className="text-lg font-bold text-foreground">{scenarioFraud.engine_metadata?.false_positives_suppressed ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">FP Suppressed</p>
              </div>
            </div>

            {/* Trust signal reductions */}
            {(scenarioFraud.engine_metadata?.trust_reduction_applied ?? 0) > 0 && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "oklch(0.35 0.14 145 / 0.12)", border: "1px solid oklch(0.55 0.18 145 / 0.3)" }}>
                <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-emerald-400">
                  Trust signals applied — score reduced by {scenarioFraud.engine_metadata.trust_reduction_applied} pts
                  {scenarioFraud.engine_metadata.trust_signals_applied?.length > 0 && (
                    <span className="text-muted-foreground"> ({scenarioFraud.engine_metadata.trust_signals_applied.join(", ")})</span>
                  )}
                </p>
              </div>
            )}

            {/* Active flags */}
            {scenarioFraud.flags?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Active Fraud Flags ({scenarioFraud.flags.length})</p>
                <div className="space-y-1.5">
                  {scenarioFraud.flags.map((flag: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: flag.severity === "HIGH" ? "oklch(0.55 0.22 25 / 0.10)" : flag.severity === "MEDIUM" ? "oklch(0.65 0.20 40 / 0.10)" : "oklch(0.72 0.18 60 / 0.08)", border: `1px solid ${flag.severity === "HIGH" ? "oklch(0.55 0.22 25 / 0.3)" : flag.severity === "MEDIUM" ? "oklch(0.65 0.20 40 / 0.3)" : "oklch(0.72 0.18 60 / 0.25)"}` }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-mono font-bold ${flag.severity === "HIGH" ? "text-red-400" : flag.severity === "MEDIUM" ? "text-orange-400" : "text-amber-400"}`}>{flag.code}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${flag.severity === "HIGH" ? "text-red-400" : flag.severity === "MEDIUM" ? "text-orange-400" : "text-amber-400"}`} style={{ border: "1px solid currentColor" }}>{flag.severity}</span>
                          <span className="text-xs text-muted-foreground ml-auto">+{flag.score_contribution} pts</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{flag.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* False positive protections */}
            {scenarioFraud.false_positive_protection?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">False Positive Protections Applied ({scenarioFraud.false_positive_protection.length})</p>
                <div className="space-y-1">
                  {scenarioFraud.false_positive_protection.map((fpp: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "oklch(0.35 0.14 145 / 0.08)", border: "1px solid oklch(0.55 0.18 145 / 0.25)" }}>
                      <ShieldX className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-emerald-400">{fpp.suppressed_flag} <span className="text-muted-foreground font-sans font-normal">suppressed</span></p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{fpp.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing inputs warning */}
            {scenarioFraud.engine_metadata?.inputs_missing?.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "oklch(0.72 0.18 60 / 0.08)", border: "1px solid oklch(0.72 0.18 60 / 0.25)" }}>
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">
                  Missing inputs (reduced confidence): <span className="font-mono">{scenarioFraud.engine_metadata.inputs_missing.join(", ")}</span>
                </p>
              </div>
            )}

            {/* Reasoning */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">Engine reasoning ▸</summary>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-l-2 border-border/50 pl-3">{scenarioFraud.reasoning}</p>
            </details>
          </div>
        </Section>
      )}

      {/* ── 5b. CROSS-ENGINE CONSISTENCY VALIDATOR ─────────────────────────── */}
      {crossEngineConsistency && (
        <Section
          icon={<GitCompare className="h-4 w-4" />}
          title="Cross-Engine Consistency"
          subtitle={`${crossEngineConsistency.overall_status} — ${crossEngineConsistency.consistency_score}/100 · ${crossEngineConsistency.agreements?.length ?? 0} agreements · ${crossEngineConsistency.conflicts?.length ?? 0} conflicts`}
        >
          <div className="space-y-4">
            {/* Score row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: crossEngineConsistency.consistency_score >= 70 ? "oklch(0.35 0.14 145 / 0.15)" : crossEngineConsistency.consistency_score >= 45 ? "oklch(0.72 0.18 60 / 0.10)" : "oklch(0.55 0.22 25 / 0.12)", border: `1px solid ${crossEngineConsistency.consistency_score >= 70 ? "oklch(0.55 0.18 145 / 0.4)" : crossEngineConsistency.consistency_score >= 45 ? "oklch(0.72 0.18 60 / 0.35)" : "oklch(0.55 0.22 25 / 0.4)"}` }}>
                <p className={`text-2xl font-black ${crossEngineConsistency.consistency_score >= 70 ? "text-emerald-400" : crossEngineConsistency.consistency_score >= 45 ? "text-amber-400" : "text-red-400"}`}>{crossEngineConsistency.consistency_score}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Consistency</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "oklch(0.18 0.01 260 / 0.4)", border: "1px solid oklch(0.35 0.01 260 / 0.4)" }}>
                <p className={`text-sm font-bold ${crossEngineConsistency.overall_status === "CONSISTENT" ? "text-emerald-400" : "text-red-400"}`}>{crossEngineConsistency.overall_status}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Status</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: crossEngineConsistency.critical_conflict_count > 0 ? "oklch(0.55 0.22 25 / 0.12)" : "oklch(0.18 0.01 260 / 0.4)", border: `1px solid ${crossEngineConsistency.critical_conflict_count > 0 ? "oklch(0.55 0.22 25 / 0.4)" : "oklch(0.35 0.01 260 / 0.4)"}` }}>
                <p className={`text-2xl font-black ${crossEngineConsistency.critical_conflict_count > 0 ? "text-red-400" : "text-muted-foreground"}`}>{crossEngineConsistency.critical_conflict_count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Critical</p>
              </div>
            </div>

            {/* Agreements */}
            {crossEngineConsistency.agreements?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Engine Agreements ({crossEngineConsistency.agreements.length})</p>
                <div className="space-y-1.5">
                  {crossEngineConsistency.agreements.map((ag: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "oklch(0.35 0.14 145 / 0.08)", border: "1px solid oklch(0.55 0.18 145 / 0.25)" }}>
                      <Link2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-emerald-400">{ag.label ?? ag.check_id}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: ag.strength === "STRONG" ? "oklch(0.35 0.14 145 / 0.25)" : "oklch(0.35 0.10 145 / 0.15)", color: "oklch(0.75 0.18 145)" }}>{ag.strength}</span>
                          {ag.engines?.map((e: string, j: number) => <span key={j} className="text-xs px-1 py-0.5 rounded font-mono" style={{ background: "oklch(0.25 0.01 260 / 0.6)", color: "oklch(0.65 0.01 260)" }}>{e}</span>)}
                        </div>
                        {ag.detail && <p className="text-xs text-muted-foreground mt-0.5">{ag.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conflicts */}
            {crossEngineConsistency.conflicts?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Engine Conflicts ({crossEngineConsistency.conflicts.length})</p>
                <div className="space-y-1.5">
                  {crossEngineConsistency.conflicts.map((cf: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: cf.severity === "CRITICAL" ? "oklch(0.55 0.22 25 / 0.10)" : cf.severity === "SIGNIFICANT" ? "oklch(0.65 0.20 40 / 0.10)" : "oklch(0.72 0.18 60 / 0.08)", border: `1px solid ${cf.severity === "CRITICAL" ? "oklch(0.55 0.22 25 / 0.3)" : cf.severity === "SIGNIFICANT" ? "oklch(0.65 0.20 40 / 0.3)" : "oklch(0.72 0.18 60 / 0.25)"}` }}>
                      <Link2Off className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${cf.severity === "CRITICAL" ? "text-red-400" : cf.severity === "SIGNIFICANT" ? "text-orange-400" : "text-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${cf.severity === "CRITICAL" ? "text-red-400" : cf.severity === "SIGNIFICANT" ? "text-orange-400" : "text-amber-400"}`}>{cf.label ?? cf.check_id}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: cf.severity === "CRITICAL" ? "oklch(0.55 0.22 25 / 0.25)" : cf.severity === "SIGNIFICANT" ? "oklch(0.65 0.20 40 / 0.20)" : "oklch(0.72 0.18 60 / 0.15)", color: cf.severity === "CRITICAL" ? "oklch(0.75 0.22 25)" : cf.severity === "SIGNIFICANT" ? "oklch(0.75 0.20 40)" : "oklch(0.80 0.18 60)" }}>{cf.severity}</span>
                          {cf.engines?.map((e: string, j: number) => <span key={j} className="text-xs px-1 py-0.5 rounded font-mono" style={{ background: "oklch(0.25 0.01 260 / 0.6)", color: "oklch(0.65 0.01 260)" }}>{e}</span>)}
                        </div>
                        {cf.physics_says && <p className="text-xs text-muted-foreground mt-0.5">Physics: <span className="text-foreground/80">{cf.physics_says}</span></p>}
                        {cf.damage_says && cf.damage_says !== "N/A" && <p className="text-xs text-muted-foreground">Damage: <span className="text-foreground/80">{cf.damage_says}</span></p>}
                        {cf.fraud_says && cf.fraud_says !== "N/A" && <p className="text-xs text-muted-foreground">Fraud: <span className="text-foreground/80">{cf.fraud_says}</span></p>}
                        {cf.recommended_action && <p className="text-xs text-amber-400/80 mt-0.5 italic">{cf.recommended_action}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reasoning */}
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Engine reasoning</summary>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-l-2 border-border/50 pl-3">{crossEngineConsistency.reasoning}</p>
            </details>
          </div>
        </Section>
      )}

      {/* ── 6. SIMPLIFIED NARRATIVE ───────────────────────────────────────────── */}
      <Section icon={<Activity className="h-4 w-4" />} title="Simplified Narrative" subtitle="Evidence-based summary — 5 sentences">
        <div className="space-y-2">
          {narrative.map((sentence, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}.</span>
              <p className="text-sm text-foreground leading-relaxed">{sentence}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. ACTIONS REQUIRED ───────────────────────────────────────────────── */}
      {actions.length > 0 && (
        <Section icon={<ArrowRight className="h-4 w-4" />} title="Actions Required" subtitle={`${actions.length} open action${actions.length > 1 ? "s" : ""}`}>
          <div className="space-y-2">
            {actions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-3 border border-border/40" style={{ background: "oklch(0.22 0.02 260 / 0.5)" }}>
                <span className="text-xs font-bold text-primary w-5 h-5 rounded-full border border-primary/40 flex items-center justify-center flex-shrink-0 mt-0.5">{action.priority}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{action.label}</p>
                  {action.flag && <p className="text-xs font-mono text-muted-foreground mt-0.5">{action.flag}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 ${action.effort === "automated" ? "text-blue-400 border-blue-400/30" : "text-amber-400 border-amber-400/30"}`}>
                  {action.effort}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
