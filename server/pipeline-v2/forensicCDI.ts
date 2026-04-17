/**
 * Forensic Confidence Degradation Index (FCDI)
 * ─────────────────────────────────────────────
 * Measures how far a claim's pipeline run is from being fully reliable.
 *
 * Two claims may both reach REPORTED with a 72% confidence score.
 * One reached it on clean data; the other was stitched together with
 * four fallbacks and twelve assumptions. The FCDI separates these cases.
 *
 * FCDI = 1.0 means the pipeline ran cleanly with no degradation.
 * FCDI = 0.0 means the pipeline is maximally degraded.
 *
 * Formula (all penalties clamped so total cannot exceed 1.0):
 *   penalty = (fallback_count × W_FALLBACK)
 *           + (timeout_count  × W_TIMEOUT)
 *           + (assumption_count × W_ASSUMPTION)
 *           + (low_confidence_stage_count × W_LOW_CONF)
 *           + (skipped_stage_count × W_SKIPPED)
 *           + sum(domain_penalty.weight for each named domain penalty)
 *   FCDI = max(0, 1 - penalty)
 *
 * Classification:
 *   HIGH   ≥ 0.80  — minimal degradation, report is reliable
 *   MEDIUM  0.55–0.79 — moderate degradation, review recommended
 *   LOW     0.30–0.54 — significant degradation, manual review required
 *   CRITICAL < 0.30  — severe degradation, report should not be used without full review
 */

// ─── Weights ─────────────────────────────────────────────────────────────────
// These are calibrated for KINGA's mandate. A timeout is penalised more than
// a fallback because it indicates a systemic failure, not just missing data.
// An assumption is penalised less than a fallback because assumptions are
// explicitly disclosed and classified; fallbacks silently substitute values.

const W_FALLBACK   = 0.08;   // per degraded stage that used a fallback
const W_TIMEOUT    = 0.12;   // per stage that timed out
const W_ASSUMPTION = 0.025;  // per assumption introduced across the pipeline
const W_LOW_CONF   = 0.06;   // per stage with confidence < LOW_CONF_THRESHOLD
const W_SKIPPED    = 0.10;   // per critical stage that was skipped entirely

const LOW_CONF_THRESHOLD = 50;  // confidence score below which a stage is "low confidence"

// Critical stages whose absence carries a higher penalty
const CRITICAL_STAGE_IDS = new Set([
  "1_ingestion",
  "2_extraction",
  "3_structured_extraction",
  "6_damage_analysis",
  "7_unified",
  "8_fraud",
  "9_cost",
  "10_report",
]);

// ─── Named Domain Penalties ───────────────────────────────────────────────────
// Domain-specific penalties applied on top of generic stage-level penalties.
// These represent known failure modes with quantified impact on report reliability.
// Weights are expressed as fractions of 1.0 (e.g., 0.30 = −30 FCDI points).

export type DomainPenaltyCode =
  | "IMAGE_PIPELINE_FAILURE"      // Stage 6 BLOCKED or Stage 2 failed — no visual damage analysis
  | "MISSING_POLICY_NUMBER"       // Policy number absent — cannot verify coverage
  | "PHYSICS_INCONSISTENCY"       // Stage 7 speed/delta-V mismatch exceeds threshold
  | "BLOCKED_STAGE"               // Any stage was explicitly BLOCKED by dependency enforcement
  | "DATA_INTEGRITY_FAILURE"      // Stage 3/4 validation found critical field contradictions
  | "MULTI_EVENT_UNRESOLVED";     // Multi-event sequence detected but causal chain unconfirmed

export const DOMAIN_PENALTY_WEIGHTS: Record<DomainPenaltyCode, number> = {
  IMAGE_PIPELINE_FAILURE:   0.30,  // −30 FCDI points — vision analysis is a core capability
  MISSING_POLICY_NUMBER:    0.20,  // −20 FCDI points — cannot verify coverage without policy ref
  PHYSICS_INCONSISTENCY:    0.15,  // −15 FCDI points — claimed speed contradicts damage physics
  BLOCKED_STAGE:            0.12,  // −12 FCDI points — per blocked stage (dependency failure)
  DATA_INTEGRITY_FAILURE:   0.18,  // −18 FCDI points — contradictory data in critical fields
  MULTI_EVENT_UNRESOLVED:   0.08,  // −8 FCDI points — event sequence ambiguous
};

export interface DomainPenalty {
  code: DomainPenaltyCode;
  /** Human-readable reason for this penalty (shown in the forensic report) */
  reason: string;
  /** Penalty weight (0.0–1.0 fraction of FCDI) — defaults to DOMAIN_PENALTY_WEIGHTS[code] */
  weight?: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type FCDILabel = "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";

export interface FCDIInput {
  /** Per-stage summary from the pipeline orchestrator (stages object from buildResult) */
  stages: Record<string, {
    status: string;
    degraded?: boolean;
    _timedOut?: boolean;
    assumptionCount?: number;
    confidenceScore?: number;
  }>;
  /** Total assumptions collected across the entire pipeline run */
  totalAssumptionCount: number;
  /**
   * Named domain penalties applied on top of generic stage penalties.
   * These represent specific failure modes with quantified impact.
   * The orchestrator computes these from pipeline state before calling computeFCDI.
   */
  domainPenalties?: DomainPenalty[];
}

export interface FCDIResult {
  /** 0.0 (fully degraded) to 1.0 (fully reliable) */
  score: number;
  /** Percentage representation: 0–100 */
  scorePercent: number;
  label: FCDILabel;
  /** Breakdown of each penalty component for transparency */
  breakdown: {
    fallbackCount: number;
    timeoutCount: number;
    assumptionCount: number;
    lowConfidenceStageCount: number;
    skippedCriticalStageCount: number;
    fallbackPenalty: number;
    timeoutPenalty: number;
    assumptionPenalty: number;
    lowConfPenalty: number;
    skippedPenalty: number;
    domainPenaltyTotal: number;
    domainPenalties: Array<{ code: string; reason: string; weight: number }>;
    totalPenalty: number;
  };
  /** Human-readable explanation for the report */
  explanation: string;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function computeFCDI(input: FCDIInput): FCDIResult {
  const { stages, totalAssumptionCount, domainPenalties = [] } = input;

  let fallbackCount = 0;
  let timeoutCount = 0;
  let lowConfidenceStageCount = 0;
  let skippedCriticalStageCount = 0;

  for (const [stageId, stage] of Object.entries(stages)) {
    // Count timed-out stages
    if ((stage as any)._timedOut === true) {
      timeoutCount++;
    }
    // Count degraded stages that used a fallback (but did not time out — that's already counted)
    else if (stage.degraded === true || stage.status === "degraded") {
      fallbackCount++;
    }
    // Count skipped critical stages
    if (stage.status === "skipped" && CRITICAL_STAGE_IDS.has(stageId)) {
      skippedCriticalStageCount++;
    }
    // Count low-confidence stages (only for stages that produced output)
    if (
      stage.status !== "skipped" &&
      stage.confidenceScore != null &&
      stage.confidenceScore < LOW_CONF_THRESHOLD
    ) {
      lowConfidenceStageCount++;
    }
  }

  const fallbackPenalty   = fallbackCount            * W_FALLBACK;
  const timeoutPenalty    = timeoutCount             * W_TIMEOUT;
  const assumptionPenalty = totalAssumptionCount     * W_ASSUMPTION;
  const lowConfPenalty    = lowConfidenceStageCount  * W_LOW_CONF;
  const skippedPenalty    = skippedCriticalStageCount * W_SKIPPED;

  // Compute named domain penalties
  const resolvedDomainPenalties = domainPenalties.map(dp => ({
    code: dp.code,
    reason: dp.reason,
    weight: dp.weight ?? DOMAIN_PENALTY_WEIGHTS[dp.code] ?? 0,
  }));
  const domainPenaltyTotal = resolvedDomainPenalties.reduce((sum, dp) => sum + dp.weight, 0);

  const totalPenalty = Math.min(
    1.0,
    fallbackPenalty + timeoutPenalty + assumptionPenalty + lowConfPenalty + skippedPenalty + domainPenaltyTotal
  );

  const score = Math.max(0, 1 - totalPenalty);
  const scorePercent = Math.round(score * 100);

  const label: FCDILabel =
    scorePercent >= 80 ? "HIGH" :
    scorePercent >= 55 ? "MEDIUM" :
    scorePercent >= 30 ? "LOW" :
    "CRITICAL";

  const explanation = buildExplanation(label, {
    fallbackCount, timeoutCount, totalAssumptionCount,
    lowConfidenceStageCount, skippedCriticalStageCount,
    domainPenalties: resolvedDomainPenalties,
  });

  return {
    score,
    scorePercent,
    label,
    breakdown: {
      fallbackCount,
      timeoutCount,
      assumptionCount: totalAssumptionCount,
      lowConfidenceStageCount,
      skippedCriticalStageCount,
      fallbackPenalty: round2(fallbackPenalty),
      timeoutPenalty: round2(timeoutPenalty),
      assumptionPenalty: round2(assumptionPenalty),
      lowConfPenalty: round2(lowConfPenalty),
      skippedPenalty: round2(skippedPenalty),
      domainPenaltyTotal: round2(domainPenaltyTotal),
      domainPenalties: resolvedDomainPenalties,
      totalPenalty: round2(totalPenalty),
    },
    explanation,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildExplanation(
  label: FCDILabel,
  counts: {
    fallbackCount: number;
    timeoutCount: number;
    totalAssumptionCount: number;
    lowConfidenceStageCount: number;
    skippedCriticalStageCount: number;
    domainPenalties: Array<{ code: string; reason: string; weight: number }>;
  }
): string {
  const parts: string[] = [];

  if (counts.timeoutCount > 0) {
    parts.push(`${counts.timeoutCount} stage${counts.timeoutCount > 1 ? "s" : ""} timed out and ran on fallback paths`);
  }
  if (counts.fallbackCount > 0) {
    parts.push(`${counts.fallbackCount} stage${counts.fallbackCount > 1 ? "s" : ""} used degraded fallback output`);
  }
  if (counts.totalAssumptionCount > 0) {
    parts.push(`${counts.totalAssumptionCount} assumption${counts.totalAssumptionCount > 1 ? "s" : ""} were introduced to fill missing data`);
  }
  if (counts.lowConfidenceStageCount > 0) {
    parts.push(`${counts.lowConfidenceStageCount} stage${counts.lowConfidenceStageCount > 1 ? "s" : ""} produced low-confidence output`);
  }
  if (counts.skippedCriticalStageCount > 0) {
    parts.push(`${counts.skippedCriticalStageCount} critical stage${counts.skippedCriticalStageCount > 1 ? "s" : ""} were skipped entirely`);
  }
  // Named domain penalties — each gets an explicit mention
  for (const dp of counts.domainPenalties) {
    parts.push(`${dp.code.replace(/_/g, ' ')}: ${dp.reason} (−${Math.round(dp.weight * 100)} FCDI points)`);
  }

  if (parts.length === 0) {
    return "Pipeline ran cleanly with no degradation. All stages completed successfully with high confidence.";
  }

  const labelDesc: Record<FCDILabel, string> = {
    HIGH:     "The report is reliable despite minor degradation.",
    MEDIUM:   "Moderate degradation detected. Independent review is recommended before settlement.",
    LOW:      "Significant degradation. Manual review is required before any decision is made.",
    CRITICAL: "Severe degradation. This report must not be used for settlement without full manual reconstruction.",
  };

  return `${parts.join("; ")}. ${labelDesc[label]}`;
}
