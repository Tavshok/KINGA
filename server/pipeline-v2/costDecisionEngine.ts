/**
 * pipeline-v2/costDecisionEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CLAIMS COST DECISION ENGINE
 *
 * Resolves the TRUE COST BASIS for a claim, evaluates deviations across all
 * available cost signals, detects anomalies, and produces a structured
 * APPROVE / REVIEW / REJECT recommendation with full audit trail.
 *
 * Decision hierarchy (immutable):
 *   1. agreed_cost  → "assessor_validated"  (always overrides)
 *   2. optimised_cost → "system_optimised"  (weighted quote baseline)
 *   3. AI estimate  → REFERENCE ONLY        (never the basis)
 *
 * Anomaly detection:
 *   - Overpricing:     highest quote >40% above TRUE_COST
 *   - Under-quoting:   missing structural components in any selected quote
 *   - Misalignment:    MISALIGNED or PARTIALLY_ALIGNED alignment result
 *   - Low reliability: cost_reliability.confidence_score < 40
 *   - Spread warning:  cost_spread_pct > 60%
 *
 * RULES:
 *   - Agreed cost ALWAYS overrides
 *   - AI estimate is NEVER the baseline
 *   - Structural integrity > price
 *   - No AI/model terminology in output
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CostBasis = "assessor_validated" | "system_optimised";
export type Recommendation = "APPROVE" | "REVIEW" | "REJECT";
export type AnomalyCategory =
  | "overpricing"
  | "under_quoting"
  | "misaligned_components"
  | "low_reliability"
  | "spread_warning"
  | "structural_gap"
  | "no_cost_basis";

export interface DecisionInputQuote {
  panel_beater: string | null;
  total_cost: number | null;
  currency?: string;
}

export interface DecisionInputOptimisation {
  optimised_cost_usd: number;
  selected_quotes: Array<{
    panel_beater: string;
    total_cost: number;
    structurally_complete: boolean;
    structural_gaps: string[];
    is_outlier: boolean;
    coverage_ratio: number;
  }>;
  excluded_quotes: Array<{
    panel_beater: string;
    total_cost: number | null;
    reason: string;
    exclusion_category: string;
  }>;
  cost_spread_pct: number;
  confidence: number;
  total_structural_gaps: number;
  median_cost_usd: number | null;
}

export interface DecisionInputAlignment {
  alignment_status: "FULLY_ALIGNED" | "PARTIALLY_ALIGNED" | "MISALIGNED";
  critical_missing: Array<{ component: string; reason: string; is_structural: boolean }>;
  unrelated_items: Array<{ component: string; reason: string; risk_level: "low" | "medium" | "high" }>;
  engineering_comment: string;
  coverage_ratio: number;
  structural_coverage_ratio: number;
}

export interface DecisionInputReliability {
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  confidence_score: number;
  reason: string;
}

export interface CostDecisionInput {
  /** Agreed cost in USD — from assessor or insurer. If present, ALWAYS the true cost basis. */
  agreed_cost_usd: number | null;
  /** Optimised cost from the Quote Optimisation Engine. */
  optimised_cost: DecisionInputOptimisation | null;
  /** Raw extracted quotes for highest-quote comparison. */
  extracted_quotes: DecisionInputQuote[];
  /** Damage components identified by the damage analysis stage. */
  damage_components: string[];
  /** Cost reliability score from the reliability scorer. */
  cost_reliability: DecisionInputReliability | null;
  /** Alignment result from the mechanical alignment evaluator. */
  alignment_result: DecisionInputAlignment | null;
  /** AI estimate in USD — reference only, never the basis. */
  ai_estimate_usd: number | null;
  /** Currency code for display. */
  currency?: string;
}

export interface DeviationAnalysis {
  /** Highest quote vs TRUE_COST */
  highest_quote_usd: number | null;
  highest_quote_deviation_pct: number | null;
  highest_quote_panel_beater: string | null;
  /** Optimised cost vs TRUE_COST (only meaningful when basis is assessor_validated) */
  optimised_vs_true_pct: number | null;
  /** AI estimate vs TRUE_COST — reference only */
  ai_estimate_usd: number | null;
  ai_vs_true_pct: number | null;
  /** Quote spread from the optimisation engine */
  quote_spread_pct: number | null;
}

export interface CostAnomaly {
  category: AnomalyCategory;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affected_quotes?: string[];
  affected_components?: string[];
  deviation_pct?: number;
}

export interface CostDecisionOutput {
  true_cost_usd: number;
  cost_basis: CostBasis;
  deviation_analysis: DeviationAnalysis;
  anomalies: CostAnomaly[];
  recommendation: Recommendation;
  confidence: number;
  reasoning: string;
  /** Structured reasoning steps for audit trail */
  decision_trace: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERPRICING_THRESHOLD = 0.40;   // 40% above TRUE_COST
const SPREAD_WARNING_THRESHOLD = 60;  // 60% spread
const LOW_RELIABILITY_THRESHOLD = 40; // confidence_score < 40

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(value: number, basis: number): number {
  if (basis === 0) return 0;
  return Math.round(((value - basis) / basis) * 10000) / 100; // 2dp
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolve the highest valid quote cost and its panel beater name from
 * extracted_quotes (raw) and optimisation selected_quotes.
 */
function resolveHighestQuote(
  extractedQuotes: DecisionInputQuote[],
  optimisation: DecisionInputOptimisation | null
): { cost: number | null; panelBeater: string | null } {
  const candidates: Array<{ cost: number; panelBeater: string }> = [];

  // From raw extracted quotes
  for (const q of extractedQuotes) {
    if (q.total_cost && q.total_cost > 0) {
      candidates.push({ cost: q.total_cost, panelBeater: q.panel_beater ?? "Unknown" });
    }
  }

  // From optimisation selected quotes (may include outliers)
  if (optimisation) {
    for (const q of optimisation.selected_quotes) {
      if (q.total_cost > 0) {
        candidates.push({ cost: q.total_cost, panelBeater: q.panel_beater });
      }
    }
    for (const q of optimisation.excluded_quotes) {
      if (q.total_cost && q.total_cost > 0) {
        candidates.push({ cost: q.total_cost, panelBeater: q.panel_beater ?? "Unknown" });
      }
    }
  }

  if (candidates.length === 0) return { cost: null, panelBeater: null };

  // Deduplicate by panel_beater, keep highest cost per beater
  const deduped = new Map<string, number>();
  for (const c of candidates) {
    const existing = deduped.get(c.panelBeater);
    if (!existing || c.cost > existing) deduped.set(c.panelBeater, c.cost);
  }

  let maxCost = 0;
  let maxBeater = "Unknown";
  deduped.forEach((cost, beater) => {
    if (cost > maxCost) { maxCost = cost; maxBeater = beater; }
  });

  return { cost: maxCost > 0 ? maxCost : null, panelBeater: maxCost > 0 ? maxBeater : null };
}

/**
 * Collect all structural gaps across selected quotes.
 */
function collectStructuralGaps(optimisation: DecisionInputOptimisation | null): string[] {
  if (!optimisation) return [];
  const gaps = new Set<string>();
  for (const q of optimisation.selected_quotes) {
    for (const g of q.structural_gaps) gaps.add(g);
  }
  return Array.from(gaps);
}

/**
 * Compute the final recommendation from anomalies, confidence, and alignment.
 */
function deriveRecommendation(
  anomalies: CostAnomaly[],
  confidence: number,
  alignmentStatus: string | null,
  costBasis: CostBasis
): Recommendation {
  const hasCritical = anomalies.some(a => a.severity === "critical");
  const hasHigh = anomalies.some(a => a.severity === "high");
  const hasNoCostBasis = anomalies.some(a => a.category === "no_cost_basis");

  if (hasNoCostBasis) return "REVIEW";
  if (hasCritical) return "REJECT";
  if (hasHigh) return "REVIEW";
  if (alignmentStatus === "MISALIGNED") return "REVIEW";
  if (confidence < 30) return "REVIEW";
  if (costBasis === "assessor_validated" && anomalies.length === 0) return "APPROVE";
  if (costBasis === "system_optimised" && confidence >= 60 && anomalies.length === 0) return "APPROVE";
  if (anomalies.some(a => a.severity === "medium")) return "REVIEW";
  return "APPROVE";
}

/**
 * Compute the overall confidence score for the decision (0–100).
 * Starts from the cost_reliability score (if available) and adjusts
 * based on anomalies, alignment, and cost basis.
 */
function computeDecisionConfidence(
  costReliability: DecisionInputReliability | null,
  optimisationConfidence: number | null,
  anomalies: CostAnomaly[],
  alignmentStatus: string | null,
  costBasis: CostBasis
): number {
  // Base: use reliability score, fall back to optimisation confidence, then 50
  let base = costReliability?.confidence_score ?? optimisationConfidence ?? 50;

  // Basis bonus: assessor-validated is more reliable
  if (costBasis === "assessor_validated") base = Math.min(100, base + 10);

  // Alignment modifier
  if (alignmentStatus === "FULLY_ALIGNED") base = Math.min(100, base + 5);
  else if (alignmentStatus === "MISALIGNED") base = Math.max(0, base - 20);
  else if (alignmentStatus === "PARTIALLY_ALIGNED") base = Math.max(0, base - 10);

  // Anomaly penalties
  for (const a of anomalies) {
    if (a.severity === "critical") base = Math.max(0, base - 25);
    else if (a.severity === "high") base = Math.max(0, base - 15);
    else if (a.severity === "medium") base = Math.max(0, base - 8);
    else base = Math.max(0, base - 3);
  }

  return Math.min(100, Math.max(0, Math.round(base)));
}

/**
 * Build a human-readable reasoning paragraph from the decision components.
 * Uses insurance/engineering language — no AI/model terminology.
 */
function buildReasoning(
  trueCostUsd: number,
  costBasis: CostBasis,
  deviationAnalysis: DeviationAnalysis,
  anomalies: CostAnomaly[],
  recommendation: Recommendation,
  confidence: number,
  alignmentResult: DecisionInputAlignment | null,
  currency: string
): string {
  const parts: string[] = [];

  // 1. Cost basis statement
  if (costBasis === "assessor_validated") {
    parts.push(
      `The true cost basis of ${currency} ${trueCostUsd.toFixed(2)} has been established from the assessor-validated agreed cost, which takes precedence over all other cost signals.`
    );
  } else {
    parts.push(
      `No assessor-agreed cost was available. The true cost basis of ${currency} ${trueCostUsd.toFixed(2)} has been derived from the system-optimised weighted quote baseline.`
    );
  }

  // 2. Deviation summary
  if (deviationAnalysis.highest_quote_usd !== null && deviationAnalysis.highest_quote_deviation_pct !== null) {
    const dir = deviationAnalysis.highest_quote_deviation_pct >= 0 ? "above" : "below";
    const absPct = Math.abs(deviationAnalysis.highest_quote_deviation_pct);
    parts.push(
      `The highest submitted quote (${deviationAnalysis.highest_quote_panel_beater ?? "Unknown"}: ${currency} ${deviationAnalysis.highest_quote_usd.toFixed(2)}) is ${absPct.toFixed(1)}% ${dir} the true cost basis.`
    );
  }

  if (deviationAnalysis.optimised_vs_true_pct !== null && costBasis === "assessor_validated") {
    const dir = deviationAnalysis.optimised_vs_true_pct >= 0 ? "above" : "below";
    const absPct = Math.abs(deviationAnalysis.optimised_vs_true_pct);
    parts.push(
      `The system-optimised baseline is ${absPct.toFixed(1)}% ${dir} the agreed cost.`
    );
  }

  if (deviationAnalysis.ai_vs_true_pct !== null) {
    const dir = deviationAnalysis.ai_vs_true_pct >= 0 ? "above" : "below";
    const absPct = Math.abs(deviationAnalysis.ai_vs_true_pct);
    parts.push(
      `For reference, the component-based repair estimate is ${absPct.toFixed(1)}% ${dir} the true cost basis (reference only — not used as the basis for this decision).`
    );
  }

  // 3. Alignment summary
  if (alignmentResult) {
    if (alignmentResult.alignment_status === "FULLY_ALIGNED") {
      parts.push("Component alignment is fully consistent with the reported damage profile.");
    } else if (alignmentResult.alignment_status === "PARTIALLY_ALIGNED") {
      const missing = alignmentResult.critical_missing.map(c => c.component).join(", ");
      parts.push(
        `Partial component alignment was detected. Critical components absent from the quote: ${missing || "none identified"}.`
      );
    } else {
      parts.push(
        `Component misalignment was detected. ${alignmentResult.engineering_comment}`
      );
    }
  }

  // 4. Anomaly summary
  if (anomalies.length > 0) {
    const criticalAndHigh = anomalies.filter(a => a.severity === "critical" || a.severity === "high");
    if (criticalAndHigh.length > 0) {
      parts.push(
        `${criticalAndHigh.length} high-severity anomal${criticalAndHigh.length === 1 ? "y" : "ies"} detected: ${criticalAndHigh.map(a => a.description).join("; ")}.`
      );
    }
    const medium = anomalies.filter(a => a.severity === "medium");
    if (medium.length > 0) {
      parts.push(
        `${medium.length} advisory flag${medium.length === 1 ? "" : "s"}: ${medium.map(a => a.description).join("; ")}.`
      );
    }
  } else {
    parts.push("No cost anomalies were detected.");
  }

  // 5. Recommendation
  const recLabel: Record<Recommendation, string> = {
    APPROVE: "approved for processing",
    REVIEW: "referred for adjuster review",
    REJECT: "flagged for rejection pending investigation",
  };
  parts.push(
    `Based on the above, this claim cost is ${recLabel[recommendation]} with a decision confidence of ${confidence}/100.`
  );

  return parts.join(" ");
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Runs the Claims Cost Decision Engine.
 *
 * @param input - All available cost signals for the claim
 * @returns A structured cost decision with true cost, deviations, anomalies,
 *          recommendation, confidence, and reasoning
 */
export function runCostDecision(input: CostDecisionInput): CostDecisionOutput {
  const currency = input.currency ?? "USD";
  const trace: string[] = [];

  // ── Step 1: Resolve TRUE COST BASIS ────────────────────────────────────────

  let trueCostUsd: number;
  let costBasis: CostBasis;

  const agreedCost = input.agreed_cost_usd;
  const optimisedCost = input.optimised_cost?.optimised_cost_usd ?? null;

  if (agreedCost !== null && agreedCost > 0) {
    trueCostUsd = round2(agreedCost);
    costBasis = "assessor_validated";
    trace.push(`TRUE_COST resolved to ${currency} ${trueCostUsd.toFixed(2)} from assessor-agreed cost (assessor_validated).`);
  } else if (optimisedCost !== null && optimisedCost > 0) {
    trueCostUsd = round2(optimisedCost);
    costBasis = "system_optimised";
    trace.push(`No agreed cost present. TRUE_COST resolved to ${currency} ${trueCostUsd.toFixed(2)} from system-optimised quote baseline (system_optimised).`);
  } else {
    // No cost basis available — produce a zero-cost output with a REVIEW recommendation
    trueCostUsd = 0;
    costBasis = "system_optimised";
    trace.push("No agreed cost and no optimised cost available. TRUE_COST set to 0. Flagging for manual review.");
  }

  // ── Step 2: Deviation Analysis ─────────────────────────────────────────────

  const { cost: highestQuoteCost, panelBeater: highestQuoteBeater } = resolveHighestQuote(
    input.extracted_quotes,
    input.optimised_cost
  );

  const highestQuoteDeviationPct = highestQuoteCost !== null && trueCostUsd > 0
    ? pct(highestQuoteCost, trueCostUsd)
    : null;

  const optimisedVsTruePct = (
    costBasis === "assessor_validated" &&
    optimisedCost !== null &&
    optimisedCost > 0 &&
    trueCostUsd > 0
  ) ? pct(optimisedCost, trueCostUsd) : null;

  const aiEstimateUsd = input.ai_estimate_usd ? round2(input.ai_estimate_usd) : null;
  const aiVsTruePct = aiEstimateUsd !== null && trueCostUsd > 0
    ? pct(aiEstimateUsd, trueCostUsd)
    : null;

  const deviationAnalysis: DeviationAnalysis = {
    highest_quote_usd: highestQuoteCost !== null ? round2(highestQuoteCost) : null,
    highest_quote_deviation_pct: highestQuoteDeviationPct,
    highest_quote_panel_beater: highestQuoteBeater,
    optimised_vs_true_pct: optimisedVsTruePct,
    ai_estimate_usd: aiEstimateUsd,
    ai_vs_true_pct: aiVsTruePct,
    quote_spread_pct: input.optimised_cost?.cost_spread_pct ?? null,
  };

  trace.push(
    `Deviation analysis: highest_quote=${highestQuoteCost !== null ? currency + " " + highestQuoteCost.toFixed(2) : "N/A"} (${highestQuoteDeviationPct !== null ? highestQuoteDeviationPct.toFixed(1) + "%" : "N/A"} vs TRUE_COST), ` +
    `optimised_vs_true=${optimisedVsTruePct !== null ? optimisedVsTruePct.toFixed(1) + "%" : "N/A"}, ` +
    `ai_vs_true=${aiVsTruePct !== null ? aiVsTruePct.toFixed(1) + "%" : "N/A"}.`
  );

  // ── Step 3: Anomaly Detection ──────────────────────────────────────────────

  const anomalies: CostAnomaly[] = [];

  // 3a. No cost basis
  if (trueCostUsd === 0) {
    anomalies.push({
      category: "no_cost_basis",
      severity: "high",
      description: "No agreed cost and no optimised cost baseline could be established. Manual cost assessment is required.",
    });
    trace.push("ANOMALY: no_cost_basis — no cost signal available.");
  }

  // 3b. Overpricing: highest quote >40% above TRUE_COST
  if (
    highestQuoteCost !== null &&
    trueCostUsd > 0 &&
    highestQuoteDeviationPct !== null &&
    highestQuoteDeviationPct > OVERPRICING_THRESHOLD * 100
  ) {
    anomalies.push({
      category: "overpricing",
      severity: highestQuoteDeviationPct > 80 ? "critical" : "high",
      description: `Highest quote (${highestQuoteBeater ?? "Unknown"}: ${currency} ${highestQuoteCost.toFixed(2)}) is ${highestQuoteDeviationPct.toFixed(1)}% above the true cost basis of ${currency} ${trueCostUsd.toFixed(2)}, exceeding the 40% overpricing threshold.`,
      affected_quotes: [highestQuoteBeater ?? "Unknown"],
      deviation_pct: highestQuoteDeviationPct,
    });
    trace.push(`ANOMALY: overpricing — ${highestQuoteBeater} at ${highestQuoteDeviationPct.toFixed(1)}% above TRUE_COST.`);
  }

  // 3c. Under-quoting: structural gaps in selected quotes
  const structuralGaps = collectStructuralGaps(input.optimised_cost);
  if (structuralGaps.length > 0) {
    const affectedQuotes = (input.optimised_cost?.selected_quotes ?? [])
      .filter(q => !q.structurally_complete)
      .map(q => q.panel_beater);
    anomalies.push({
      category: "under_quoting",
      severity: structuralGaps.length >= 3 ? "critical" : structuralGaps.length >= 2 ? "high" : "medium",
      description: `${structuralGaps.length} structural component${structuralGaps.length === 1 ? "" : "s"} missing from one or more quotes: ${structuralGaps.join(", ")}. Structural completeness must be verified before approval.`,
      affected_quotes: affectedQuotes,
      affected_components: structuralGaps,
    });
    trace.push(`ANOMALY: under_quoting — structural gaps: [${structuralGaps.join(", ")}].`);
  }

  // 3d. Misaligned components
  const alignmentStatus = input.alignment_result?.alignment_status ?? null;
  if (alignmentStatus === "MISALIGNED") {
    const criticalMissing = input.alignment_result?.critical_missing.map(c => c.component) ?? [];
    anomalies.push({
      category: "misaligned_components",
      severity: "high",
      description: `Component misalignment detected. ${input.alignment_result?.engineering_comment ?? "Quoted components do not correspond to the reported damage zone."}${criticalMissing.length > 0 ? ` Critical missing: ${criticalMissing.join(", ")}.` : ""}`,
      affected_components: criticalMissing,
    });
    trace.push(`ANOMALY: misaligned_components — alignment_status=MISALIGNED.`);
  } else if (alignmentStatus === "PARTIALLY_ALIGNED") {
    const criticalMissing = input.alignment_result?.critical_missing.map(c => c.component) ?? [];
    if (criticalMissing.length > 0) {
      anomalies.push({
        category: "misaligned_components",
        severity: "medium",
        description: `Partial component alignment: ${criticalMissing.length} critical component${criticalMissing.length === 1 ? "" : "s"} absent from the quote (${criticalMissing.join(", ")}).`,
        affected_components: criticalMissing,
      });
      trace.push(`ANOMALY: misaligned_components (medium) — partially aligned, missing: [${criticalMissing.join(", ")}].`);
    }
  }

  // 3e. Low reliability
  if (
    input.cost_reliability !== null &&
    input.cost_reliability.confidence_score < LOW_RELIABILITY_THRESHOLD
  ) {
    anomalies.push({
      category: "low_reliability",
      severity: "medium",
      description: `Cost reliability score is ${input.cost_reliability.confidence_score}/100 (${input.cost_reliability.confidence_level}). ${input.cost_reliability.reason}`,
    });
    trace.push(`ANOMALY: low_reliability — score=${input.cost_reliability.confidence_score}.`);
  }

  // 3f. Spread warning
  const spreadPct = input.optimised_cost?.cost_spread_pct ?? null;
  if (spreadPct !== null && spreadPct > SPREAD_WARNING_THRESHOLD) {
    anomalies.push({
      category: "spread_warning",
      severity: "low",
      description: `Quote spread of ${spreadPct.toFixed(1)}% exceeds the 60% advisory threshold. Wide variation between submitted quotes warrants adjuster verification.`,
      deviation_pct: spreadPct,
    });
    trace.push(`ANOMALY: spread_warning — spread=${spreadPct.toFixed(1)}%.`);
  }

  trace.push(`Total anomalies detected: ${anomalies.length} (${anomalies.filter(a => a.severity === "critical").length} critical, ${anomalies.filter(a => a.severity === "high").length} high, ${anomalies.filter(a => a.severity === "medium").length} medium, ${anomalies.filter(a => a.severity === "low").length} low).`);

  // ── Step 4: Confidence and Recommendation ─────────────────────────────────

  const confidence = computeDecisionConfidence(
    input.cost_reliability,
    input.optimised_cost?.confidence ?? null,
    anomalies,
    alignmentStatus,
    costBasis
  );

  const recommendation = deriveRecommendation(anomalies, confidence, alignmentStatus, costBasis);

  trace.push(`Recommendation: ${recommendation} (confidence=${confidence}/100).`);

  // ── Step 5: Reasoning ──────────────────────────────────────────────────────

  const reasoning = buildReasoning(
    trueCostUsd,
    costBasis,
    deviationAnalysis,
    anomalies,
    recommendation,
    confidence,
    input.alignment_result ?? null,
    currency
  );

  return {
    true_cost_usd: trueCostUsd,
    cost_basis: costBasis,
    deviation_analysis: deviationAnalysis,
    anomalies,
    recommendation,
    confidence,
    reasoning,
    decision_trace: trace,
  };
}
