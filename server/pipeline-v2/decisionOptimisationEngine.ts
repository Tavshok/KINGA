/**
 * pipeline-v2/decisionOptimisationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION OPTIMISATION ENGINE (DOE) — Phase 3C
 *
 * Produces a single "optimal defensible repair decision" from multiple competing
 * quotes and contextual signals. This is NOT a cheapest-quote selector — it is
 * a multi-objective optimisation that balances cost, quality, turnaround,
 * panel beater reliability, and fraud risk.
 *
 * PIPELINE ROLE: Called at the end of Stage 9, after:
 *   - quoteOptimisationEngine (structural completeness + cost spread)
 *   - Stage 8 (fraud analysis)
 *   - IFE (input completeness + DOE eligibility gate)
 *   - FCDI (confidence gate)
 *
 * DESIGN RULES:
 *   1. DOE is GATED by FCDI score and input completeness (hard gates, not warnings)
 *   2. Fraud-disqualified panel beaters are NEVER selected — and the disqualification
 *      is recorded in the Forensic Audit Report with the triggering signal
 *   3. The output is "optimal defensible repair decision" — not just cheapest
 *   4. All exclusions and penalties are recorded in the audit trail
 *   5. The DOE output is a separate field from the cost engine output — it does
 *      not overwrite the cost engine, it supplements it
 *
 * MULTI-OBJECTIVE SCORING:
 *   Factor              Weight    Notes
 *   ─────────────────── ───────   ──────────────────────────────────────────
 *   Cost efficiency     0.30      Lower cost vs benchmark = higher score
 *   Repair quality      0.25      Structural completeness from quoteOptimisation
 *   Turnaround time     0.15      Days to repair (from stage-9b)
 *   Panel reliability   0.20      Historical reliability score (from learning DB)
 *   Fraud risk          0.10      Inverse of fraud risk score
 *
 * FRAUD DISQUALIFICATION RULE:
 *   If a panel beater's fraud risk is HIGH or ELEVATED → disqualify
 *   → Select next optimal
 *   → Record disqualification in audit trail with triggering signal
 *
 * FCDI GATE:
 *   If FCDI score < 40 (CRITICAL) → DOE disabled, route to manual review
 *   If input completeness < 55% → DOE disabled, route to manual review
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type DOEStatus =
  | "OPTIMISED"          // DOE ran and produced a recommendation
  | "GATED_LOW_FCDI"     // FCDI too low — manual review required
  | "GATED_LOW_INPUT"    // Input completeness too low — manual review required
  | "GATED_NO_QUOTES"    // No valid quotes to optimise
  | "ALL_DISQUALIFIED";  // All quotes disqualified on fraud grounds

export interface DOECandidate {
  /** Panel beater / repairer name */
  panelBeater: string;
  /** Total quoted cost in primary currency */
  totalCost: number;
  /** Currency of the quote */
  currency: string;
  /** Structural completeness score 0–1 (from quoteOptimisationEngine) */
  structuralCompleteness: number;
  /** Component coverage ratio 0–1 */
  coverageRatio: number;
  /** Estimated turnaround days (null if unknown) */
  turnaroundDays: number | null;
  /** Panel beater reliability score 0–1 (from learning DB, default 0.5) */
  reliabilityScore: number;
  /** Fraud risk level for this panel beater */
  fraudRisk: "minimal" | "low" | "medium" | "high" | "elevated";
  /** Fraud signal that triggered the risk level (for audit trail) */
  fraudSignal: string | null;
  /** Extraction confidence */
  confidence: "high" | "medium" | "low";
}

export interface DOEDisqualification {
  /** Panel beater name */
  panelBeater: string;
  /** Reason for disqualification */
  reason: string;
  /** Fraud signal that triggered disqualification */
  triggeringSignal: string;
  /** Fraud risk level */
  fraudRisk: string;
}

export interface DOEScoreBreakdown {
  panelBeater: string;
  totalScore: number;
  costScore: number;
  qualityScore: number;
  turnaroundScore: number;
  reliabilityScore: number;
  fraudRiskScore: number;
  disqualified: boolean;
  disqualificationReason: string | null;
}

export interface DOEResult {
  /** DOE execution status */
  status: DOEStatus;
  /** Selected panel beater (null if gated or all disqualified) */
  selectedPanelBeater: string | null;
  /** Selected quote cost */
  selectedCost: number | null;
  /** Currency */
  currency: string | null;
  /** Benchmark deviation % (negative = below benchmark = favourable) */
  benchmarkDeviationPct: number | null;
  /** Quality score of selected option 0–1 */
  qualityScore: number | null;
  /** Fraud risk of selected option */
  fraudRisk: string | null;
  /** Decision confidence: "high" | "medium" | "low" */
  decisionConfidence: "high" | "medium" | "low";
  /** Per-candidate score breakdown (for audit trail) */
  scoreBreakdown: DOEScoreBreakdown[];
  /** Disqualified candidates with reasons */
  disqualifications: DOEDisqualification[];
  /** Human-readable decision rationale for Forensic Audit Report */
  rationale: string;
  /** FCDI score at time of DOE execution */
  fcdiScoreAtExecution: number;
  /** Input completeness score at time of DOE execution */
  inputCompletenessAtExecution: number;
  /** ISO timestamp */
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Multi-objective weights — must sum to 1.0 */
const W_COST         = 0.30;
const W_QUALITY      = 0.25;
const W_TURNAROUND   = 0.15;
const W_RELIABILITY  = 0.20;
const W_FRAUD_RISK   = 0.10;

/** FCDI hard gate — below this, DOE is disabled */
const DOE_FCDI_MIN = 40;

/** Input completeness hard gate */
const DOE_COMPLETENESS_MIN = 55;

/** Fraud risk levels that trigger disqualification */
const DISQUALIFYING_FRAUD_RISKS = new Set<string>(["high", "elevated"]);

/** Maximum turnaround days for normalisation (beyond this = score 0) */
const MAX_TURNAROUND_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// SCORING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function scoreCost(cost: number, benchmarkCost: number): number {
  if (benchmarkCost <= 0) return 0.5; // No benchmark — neutral score
  const ratio = cost / benchmarkCost;
  // Score 1.0 if at benchmark, 0 if 2× benchmark, bonus if below benchmark
  return Math.max(0, Math.min(1, 2 - ratio));
}

function scoreQuality(structuralCompleteness: number, coverageRatio: number): number {
  // Weighted average: structural completeness is more important
  return (structuralCompleteness * 0.7) + (coverageRatio * 0.3);
}

function scoreTurnaround(turnaroundDays: number | null): number {
  if (turnaroundDays == null) return 0.5; // Unknown — neutral
  return Math.max(0, 1 - (turnaroundDays / MAX_TURNAROUND_DAYS));
}

function scoreReliability(reliabilityScore: number): number {
  return Math.max(0, Math.min(1, reliabilityScore));
}

function scoreFraudRisk(fraudRisk: string): number {
  const scores: Record<string, number> = {
    minimal:  1.0,
    low:      0.85,
    medium:   0.50,
    high:     0.10,
    elevated: 0.05,
  };
  return scores[fraudRisk] ?? 0.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface DOEInput {
  /** Candidate quotes to evaluate */
  candidates: DOECandidate[];
  /** Benchmark cost (from cost intelligence engine) in same currency */
  benchmarkCost: number | null;
  /** FCDI score percent (0–100) */
  fcdiScore: number;
  /** Input completeness score (0–100) */
  inputCompletenessScore: number;
  /** Whether IFE has cleared DOE eligibility */
  doeEligible: boolean;
  /** IFE ineligibility reason (if applicable) */
  doeIneligibilityReason: string | null;
}

export function runDOE(input: DOEInput): DOEResult {
  const {
    candidates,
    benchmarkCost,
    fcdiScore,
    inputCompletenessScore,
    doeEligible,
    doeIneligibilityReason,
  } = input;

  const now = new Date().toISOString();

  // ── Hard gate: FCDI ────────────────────────────────────────────────────────
  if (fcdiScore < DOE_FCDI_MIN) {
    return {
      status: "GATED_LOW_FCDI",
      selectedPanelBeater: null,
      selectedCost: null,
      currency: null,
      benchmarkDeviationPct: null,
      qualityScore: null,
      fraudRisk: null,
      decisionConfidence: "low",
      scoreBreakdown: [],
      disqualifications: [],
      rationale: `Decision optimisation is disabled. The Forensic Confidence Degradation Index score (${fcdiScore}%) is below the minimum threshold (${DOE_FCDI_MIN}%) required for automated decision optimisation. Manual assessor review is required before any repair decision is made.`,
      fcdiScoreAtExecution: fcdiScore,
      inputCompletenessAtExecution: inputCompletenessScore,
      computedAt: now,
    };
  }

  // ── Hard gate: Input completeness ─────────────────────────────────────────
  if (!doeEligible || inputCompletenessScore < DOE_COMPLETENESS_MIN) {
    return {
      status: "GATED_LOW_INPUT",
      selectedPanelBeater: null,
      selectedCost: null,
      currency: null,
      benchmarkDeviationPct: null,
      qualityScore: null,
      fraudRisk: null,
      decisionConfidence: "low",
      scoreBreakdown: [],
      disqualifications: [],
      rationale: doeIneligibilityReason ?? `Decision optimisation is disabled. Input completeness (${inputCompletenessScore}%) is below the minimum threshold (${DOE_COMPLETENESS_MIN}%).`,
      fcdiScoreAtExecution: fcdiScore,
      inputCompletenessAtExecution: inputCompletenessScore,
      computedAt: now,
    };
  }

  // ── No quotes ─────────────────────────────────────────────────────────────
  if (candidates.length === 0) {
    return {
      status: "GATED_NO_QUOTES",
      selectedPanelBeater: null,
      selectedCost: null,
      currency: null,
      benchmarkDeviationPct: null,
      qualityScore: null,
      fraudRisk: null,
      decisionConfidence: "low",
      scoreBreakdown: [],
      disqualifications: [],
      rationale: "No repair quotes were available for optimisation. Manual assessor review is required.",
      fcdiScoreAtExecution: fcdiScore,
      inputCompletenessAtExecution: inputCompletenessScore,
      computedAt: now,
    };
  }

  // ── Score all candidates ───────────────────────────────────────────────────
  const benchmark = benchmarkCost ?? (
    candidates.reduce((sum, c) => sum + c.totalCost, 0) / candidates.length
  );

  const disqualifications: DOEDisqualification[] = [];
  const scoreBreakdown: DOEScoreBreakdown[] = [];

  for (const candidate of candidates) {
    const isDisqualified = DISQUALIFYING_FRAUD_RISKS.has(candidate.fraudRisk);

    if (isDisqualified) {
      disqualifications.push({
        panelBeater: candidate.panelBeater,
        reason: `Panel beater disqualified: fraud risk level is '${candidate.fraudRisk}'. This candidate cannot be selected for any repair decision.`,
        triggeringSignal: candidate.fraudSignal ?? `Fraud risk level: ${candidate.fraudRisk}`,
        fraudRisk: candidate.fraudRisk,
      });
    }

    const costScore       = scoreCost(candidate.totalCost, benchmark);
    const qualityScoreVal = scoreQuality(candidate.structuralCompleteness, candidate.coverageRatio);
    const turnaroundScoreVal = scoreTurnaround(candidate.turnaroundDays);
    const reliabilityScoreVal = scoreReliability(candidate.reliabilityScore);
    const fraudRiskScoreVal = scoreFraudRisk(candidate.fraudRisk);

    const totalScore = isDisqualified
      ? -1 // Disqualified candidates get a sentinel score
      : (costScore * W_COST) +
        (qualityScoreVal * W_QUALITY) +
        (turnaroundScoreVal * W_TURNAROUND) +
        (reliabilityScoreVal * W_RELIABILITY) +
        (fraudRiskScoreVal * W_FRAUD_RISK);

    scoreBreakdown.push({
      panelBeater: candidate.panelBeater,
      totalScore: Math.round(totalScore * 1000) / 1000,
      costScore: Math.round(costScore * 1000) / 1000,
      qualityScore: Math.round(qualityScoreVal * 1000) / 1000,
      turnaroundScore: Math.round(turnaroundScoreVal * 1000) / 1000,
      reliabilityScore: Math.round(reliabilityScoreVal * 1000) / 1000,
      fraudRiskScore: Math.round(fraudRiskScoreVal * 1000) / 1000,
      disqualified: isDisqualified,
      disqualificationReason: isDisqualified
        ? `Fraud risk: ${candidate.fraudRisk}. Signal: ${candidate.fraudSignal ?? "elevated fraud indicators"}`
        : null,
    });
  }

  // ── Select optimal candidate ───────────────────────────────────────────────
  const eligibleBreakdown = scoreBreakdown.filter(s => !s.disqualified);

  if (eligibleBreakdown.length === 0) {
    return {
      status: "ALL_DISQUALIFIED",
      selectedPanelBeater: null,
      selectedCost: null,
      currency: null,
      benchmarkDeviationPct: null,
      qualityScore: null,
      fraudRisk: null,
      decisionConfidence: "low",
      scoreBreakdown,
      disqualifications,
      rationale: `All ${candidates.length} repair quote${candidates.length !== 1 ? "s" : ""} were disqualified on fraud risk grounds. Manual assessor review is required. Disqualified: ${disqualifications.map(d => `${d.panelBeater} (${d.fraudRisk})`).join(", ")}.`,
      fcdiScoreAtExecution: fcdiScore,
      inputCompletenessAtExecution: inputCompletenessScore,
      computedAt: now,
    };
  }

  const best = eligibleBreakdown.reduce((a, b) => a.totalScore > b.totalScore ? a : b);
  const selectedCandidate = candidates.find(c => c.panelBeater === best.panelBeater)!;

  const benchmarkDeviationPct = benchmark > 0
    ? Math.round(((selectedCandidate.totalCost - benchmark) / benchmark) * 100 * 10) / 10
    : null;

  const decisionConfidence: "high" | "medium" | "low" =
    best.totalScore >= 0.75 ? "high" :
    best.totalScore >= 0.50 ? "medium" :
    "low";

  const rationale = buildRationale(
    selectedCandidate,
    best,
    benchmarkDeviationPct,
    disqualifications,
    fcdiScore,
    candidates.length,
  );

  return {
    status: "OPTIMISED",
    selectedPanelBeater: selectedCandidate.panelBeater,
    selectedCost: selectedCandidate.totalCost,
    currency: selectedCandidate.currency,
    benchmarkDeviationPct,
    qualityScore: best.qualityScore,
    fraudRisk: selectedCandidate.fraudRisk,
    decisionConfidence,
    scoreBreakdown,
    disqualifications,
    rationale,
    fcdiScoreAtExecution: fcdiScore,
    inputCompletenessAtExecution: inputCompletenessScore,
    computedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RATIONALE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildRationale(
  selected: DOECandidate,
  scores: DOEScoreBreakdown,
  benchmarkDeviationPct: number | null,
  disqualifications: DOEDisqualification[],
  fcdiScore: number,
  totalCandidates: number,
): string {
  const parts: string[] = [];

  const deviationStr = benchmarkDeviationPct != null
    ? benchmarkDeviationPct <= 0
      ? `${Math.abs(benchmarkDeviationPct)}% below benchmark`
      : `${benchmarkDeviationPct}% above benchmark`
    : "benchmark deviation unavailable";

  parts.push(
    `Optimal repair decision: ${selected.panelBeater}. ` +
    `Quoted cost: ${selected.currency} ${selected.totalCost.toLocaleString()} (${deviationStr}). ` +
    `Quality score: ${Math.round(scores.qualityScore * 100)}%. ` +
    `Fraud risk: ${selected.fraudRisk}. ` +
    `Decision confidence: ${scores.totalScore >= 0.75 ? "high" : scores.totalScore >= 0.50 ? "medium" : "low"}.`
  );

  if (disqualifications.length > 0) {
    parts.push(
      `${disqualifications.length} candidate${disqualifications.length !== 1 ? "s" : ""} were disqualified on fraud risk grounds: ` +
      disqualifications.map(d => `${d.panelBeater} (${d.fraudRisk} — ${d.triggeringSignal})`).join("; ") + "."
    );
  }

  parts.push(
    `Evaluated ${totalCandidates} quote${totalCandidates !== 1 ? "s" : ""}. ` +
    `FCDI at execution: ${fcdiScore}%. ` +
    `Multi-objective scoring: cost (30%), quality (25%), reliability (20%), turnaround (15%), fraud risk (10%).`
  );

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build DOECandidates from quoteOptimisation + fraud data
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildCandidatesInput {
  selectedQuotes: Array<{
    panel_beater: string;
    total_cost: number;
    coverage_ratio: number;
    structurally_complete: boolean;
    structural_gaps: string[];
    confidence: "high" | "medium" | "low";
  }>;
  excludedQuotes: Array<{
    panel_beater: string;
    total_cost: number;
    reason: string;
    confidence: "high" | "medium" | "low";
  }>;
  currency: string;
  /** Fraud risk level from Stage 8 (applies to all quotes unless per-quote data available) */
  overallFraudRisk: string;
  /** Fraud signal from Stage 8 */
  fraudSignal: string | null;
  /** Turnaround days from Stage 9b (applies to all quotes unless per-quote data available) */
  turnaroundDays: number | null;
}

export function buildDOECandidates(input: BuildCandidatesInput): DOECandidate[] {
  const {
    selectedQuotes,
    currency,
    overallFraudRisk,
    fraudSignal,
    turnaroundDays,
  } = input;

  return selectedQuotes.map(q => ({
    panelBeater: q.panel_beater ?? "Unknown Panel Beater",
    totalCost: q.total_cost,
    currency,
    structuralCompleteness: q.structurally_complete ? 1.0 : Math.max(0.3, 1 - (q.structural_gaps.length * 0.15)),
    coverageRatio: q.coverage_ratio,
    turnaroundDays,
    reliabilityScore: 0.5, // Default — Phase 4 will wire in learning DB reliability scores
    fraudRisk: overallFraudRisk as DOECandidate["fraudRisk"],
    fraudSignal,
    confidence: q.confidence,
  }));
}
