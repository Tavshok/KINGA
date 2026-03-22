/**
 * pipeline-v2/costDecisionEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CLAIMS COST DECISION ENGINE  (v2 — mode-aware)
 *
 * Resolves the TRUE COST BASIS for a claim, evaluates deviations across all
 * available cost signals, detects anomalies, and produces either:
 *
 *   PRE_ASSESSMENT  → negotiation guidance (no final approval decision)
 *   POST_ASSESSMENT → structured APPROVE / REVIEW / REJECT adjudication
 *
 * Decision hierarchy (immutable):
 *   1. agreed_cost  → "assessor_validated"  (POST only; always overrides)
 *   2. optimised_cost → "system_optimised"  (weighted quote baseline)
 *   3. AI estimate  → REFERENCE ONLY        (never the basis)
 *
 * Anomaly detection (both modes):
 *   - Overpricing:     highest quote >40% above TRUE_COST
 *   - Under-quoting:   missing structural components in any selected quote
 *   - Misalignment:    MISALIGNED or PARTIALLY_ALIGNED alignment result
 *   - Low reliability: cost_reliability.confidence_score < 40
 *   - Spread warning:  cost_spread_pct > 60%
 *
 * PRE_ASSESSMENT additional outputs:
 *   - negotiation_range: { floor_usd, ceiling_usd, target_usd }
 *   - overpriced_quotes: quotes exceeding the overpricing threshold
 *   - missing_components: components absent from all submitted quotes
 *
 * POST_ASSESSMENT additional outputs:
 *   - negotiation_efficiency: how close agreed_cost is to optimised baseline
 *   - overpayment_risk: flag when agreed_cost > optimised_cost by >20%
 *   - under_repair_risk: flag when agreed_cost < optimised_cost by >30%
 *
 * RULES:
 *   - PRE mode → recommendation is guidance only ("NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE")
 *   - POST mode → recommendation is final ("APPROVE" | "REVIEW" | "REJECT")
 *   - Agreed cost ALWAYS overrides in POST mode
 *   - AI estimate is NEVER the baseline in either mode
 *   - Structural integrity > price
 *   - No AI/model terminology in output
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CostMode = "PRE_ASSESSMENT" | "POST_ASSESSMENT";
export type CostBasis = "assessor_validated" | "system_optimised";

/** POST mode only */
export type PostRecommendation = "APPROVE" | "REVIEW" | "REJECT";
/** PRE mode only */
export type PreRecommendation = "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE";
export type Recommendation = PostRecommendation | PreRecommendation;

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
  /** Operating mode — determines output shape and recommendation semantics. */
  cost_mode: CostMode;
  /** Agreed cost in USD — from assessor or insurer. POST mode only; always overrides. */
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
  /** Optimised cost vs TRUE_COST (only meaningful when basis is assessor_validated in POST mode) */
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

/** PRE_ASSESSMENT: negotiation guidance block */
export interface NegotiationGuidance {
  /** Recommended negotiation floor — lowest defensible cost */
  floor_usd: number;
  /** Recommended negotiation ceiling — highest acceptable cost */
  ceiling_usd: number;
  /** Target settlement cost — weighted optimised baseline */
  target_usd: number;
  /** Quotes that exceed the overpricing threshold */
  overpriced_quotes: Array<{
    panel_beater: string;
    total_cost: number;
    deviation_pct: number;
    recommended_reduction_usd: number;
  }>;
  /** Components present in damage analysis but absent from all submitted quotes */
  missing_components: string[];
  /** Negotiation strategy summary */
  strategy: string;
}

/** POST_ASSESSMENT: negotiation efficiency block */
export interface NegotiationEfficiency {
  /** Agreed cost vs optimised baseline */
  agreed_vs_optimised_pct: number | null;
  /** Whether the agreed cost represents an overpayment risk (>20% above optimised) */
  overpayment_risk: boolean;
  /** Whether the agreed cost suggests under-repair risk (>30% below optimised) */
  under_repair_risk: boolean;
  /** Efficiency label */
  efficiency_label: "optimal" | "acceptable" | "overpaid" | "under_repaired" | "unknown";
  /** Narrative summary */
  summary: string;
}

export interface CostDecisionOutput {
  true_cost_usd: number;
  cost_basis: CostBasis;
  /** Operating mode — determines recommendation semantics */
  mode: CostMode;
  deviation_analysis: DeviationAnalysis;
  anomalies: CostAnomaly[];
  /** PRE: "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE" — guidance only, not final approval */
  recommendation: Recommendation;
  confidence: number;
  reasoning: string;
  /** PRE_ASSESSMENT only — populated when mode = "PRE_ASSESSMENT" */
  negotiation_guidance: NegotiationGuidance | null;
  /** POST_ASSESSMENT only — populated when mode = "POST_ASSESSMENT" */
  negotiation_efficiency: NegotiationEfficiency | null;
  /** Structured reasoning steps for audit trail */
  decision_trace: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OVERPRICING_THRESHOLD = 0.40;        // 40% above TRUE_COST
const SPREAD_WARNING_THRESHOLD = 60;       // 60% spread
const LOW_RELIABILITY_THRESHOLD = 40;      // confidence_score < 40
const OVERPAYMENT_THRESHOLD = 0.20;        // agreed >20% above optimised
const UNDER_REPAIR_THRESHOLD = 0.30;       // agreed >30% below optimised
const NEGOTIATION_FLOOR_FACTOR = 0.85;     // floor = optimised * 0.85
const NEGOTIATION_CEILING_FACTOR = 1.10;   // ceiling = optimised * 1.10

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
 * extracted_quotes (raw) and optimisation selected/excluded quotes.
 */
function resolveHighestQuote(
  extractedQuotes: DecisionInputQuote[],
  optimisation: DecisionInputOptimisation | null
): { cost: number | null; panelBeater: string | null } {
  const candidates: Array<{ cost: number; panelBeater: string }> = [];

  for (const q of extractedQuotes) {
    if (q.total_cost && q.total_cost > 0) {
      candidates.push({ cost: q.total_cost, panelBeater: q.panel_beater ?? "Unknown" });
    }
  }

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
 * Identify components present in damage_components but absent from all
 * submitted quotes (selected + excluded). Used for PRE_ASSESSMENT guidance.
 */
function findMissingComponents(
  damageComponents: string[],
  optimisation: DecisionInputOptimisation | null,
  extractedQuotes: DecisionInputQuote[]
): string[] {
  if (damageComponents.length === 0) return [];

  // Collect all component names mentioned in quotes (normalised to lowercase)
  const quotedComponents = new Set<string>();

  if (optimisation) {
    for (const q of optimisation.selected_quotes) {
      // selected_quotes don't carry a component list — use structural_gaps as a proxy
      // for what IS mentioned (gaps are what's missing from the quote)
    }
  }

  // We use the alignment_result critical_missing as the authoritative source
  // for missing components when available. When not available, we return an
  // empty list to avoid false positives.
  // This function is called with alignment data separately in the PRE path.
  void quotedComponents; // suppress unused warning
  return [];
}

/**
 * Build negotiation guidance for PRE_ASSESSMENT mode.
 */
function buildNegotiationGuidance(
  trueCostUsd: number,
  optimisedCostUsd: number | null,
  extractedQuotes: DecisionInputQuote[],
  optimisation: DecisionInputOptimisation | null,
  alignmentResult: DecisionInputAlignment | null,
  currency: string
): NegotiationGuidance {
  const basis = optimisedCostUsd ?? trueCostUsd;

  const floor = round2(basis * NEGOTIATION_FLOOR_FACTOR);
  const ceiling = round2(basis * NEGOTIATION_CEILING_FACTOR);
  const target = round2(basis);

  // Identify overpriced quotes
  const overpricedQuotes: NegotiationGuidance["overpriced_quotes"] = [];
  const allQuotes: Array<{ panel_beater: string; total_cost: number }> = [];

  for (const q of extractedQuotes) {
    if (q.total_cost && q.total_cost > 0 && q.panel_beater) {
      allQuotes.push({ panel_beater: q.panel_beater, total_cost: q.total_cost });
    }
  }
  if (optimisation) {
    for (const q of optimisation.selected_quotes) {
      if (q.total_cost > 0) {
        allQuotes.push({ panel_beater: q.panel_beater, total_cost: q.total_cost });
      }
    }
    for (const q of optimisation.excluded_quotes) {
      if (q.total_cost && q.total_cost > 0) {
        allQuotes.push({ panel_beater: q.panel_beater ?? "Unknown", total_cost: q.total_cost });
      }
    }
  }

  // Deduplicate by panel_beater
  const seen = new Set<string>();
  for (const q of allQuotes) {
    if (seen.has(q.panel_beater)) continue;
    seen.add(q.panel_beater);
    const deviationPct = pct(q.total_cost, basis);
    if (deviationPct > OVERPRICING_THRESHOLD * 100) {
      overpricedQuotes.push({
        panel_beater: q.panel_beater,
        total_cost: round2(q.total_cost),
        deviation_pct: deviationPct,
        recommended_reduction_usd: round2(q.total_cost - target),
      });
    }
  }

  // Missing components from alignment result
  const missingComponents = alignmentResult
    ? alignmentResult.critical_missing.map(c => c.component)
    : [];

  // Strategy
  const strategyParts: string[] = [];
  if (overpricedQuotes.length > 0) {
    strategyParts.push(
      `${overpricedQuotes.length} quote${overpricedQuotes.length === 1 ? "" : "s"} exceed the 40% overpricing threshold and should be renegotiated toward the ${currency} ${target.toFixed(2)} target baseline.`
    );
  }
  if (missingComponents.length > 0) {
    strategyParts.push(
      `${missingComponents.length} component${missingComponents.length === 1 ? "" : "s"} identified in the damage assessment are absent from submitted quotes (${missingComponents.join(", ")}). Quotes should be revised to include these items before proceeding to assessment.`
    );
  }
  if (strategyParts.length === 0) {
    strategyParts.push(
      `Submitted quotes are within acceptable range of the optimised baseline (${currency} ${target.toFixed(2)}). Proceed to formal assessment.`
    );
  }

  return {
    floor_usd: floor,
    ceiling_usd: ceiling,
    target_usd: target,
    overpriced_quotes: overpricedQuotes,
    missing_components: missingComponents,
    strategy: strategyParts.join(" "),
  };
}

/**
 * Build negotiation efficiency analysis for POST_ASSESSMENT mode.
 */
function buildNegotiationEfficiency(
  agreedCostUsd: number,
  optimisedCostUsd: number | null,
  currency: string
): NegotiationEfficiency {
  if (optimisedCostUsd === null || optimisedCostUsd === 0) {
    return {
      agreed_vs_optimised_pct: null,
      overpayment_risk: false,
      under_repair_risk: false,
      efficiency_label: "unknown",
      summary: "No optimised baseline was available to evaluate negotiation efficiency.",
    };
  }

  const agreedVsOptimisedPct = pct(agreedCostUsd, optimisedCostUsd);
  const overpaymentRisk = agreedVsOptimisedPct > OVERPAYMENT_THRESHOLD * 100;
  const underRepairRisk = agreedVsOptimisedPct < -(UNDER_REPAIR_THRESHOLD * 100);

  let efficiencyLabel: NegotiationEfficiency["efficiency_label"];
  if (overpaymentRisk) {
    efficiencyLabel = "overpaid";
  } else if (underRepairRisk) {
    efficiencyLabel = "under_repaired";
  } else if (Math.abs(agreedVsOptimisedPct) <= 5) {
    efficiencyLabel = "optimal";
  } else {
    efficiencyLabel = "acceptable";
  }

  const dir = agreedVsOptimisedPct >= 0 ? "above" : "below";
  const absPct = Math.abs(agreedVsOptimisedPct);
  const summaryParts: string[] = [
    `The agreed cost of ${currency} ${agreedCostUsd.toFixed(2)} is ${absPct.toFixed(1)}% ${dir} the system-optimised baseline of ${currency} ${optimisedCostUsd.toFixed(2)}.`,
  ];

  if (overpaymentRisk) {
    summaryParts.push(
      `This exceeds the 20% overpayment advisory threshold. The agreed cost may represent an overpayment relative to the validated repair baseline. Adjuster review is recommended.`
    );
  } else if (underRepairRisk) {
    summaryParts.push(
      `The agreed cost is more than 30% below the optimised baseline. This may indicate under-repair or scope reduction. Structural completeness should be verified before claim closure.`
    );
  } else if (efficiencyLabel === "optimal") {
    summaryParts.push("Negotiation outcome is within the optimal range of the validated baseline.");
  } else {
    summaryParts.push("Negotiation outcome is within the acceptable range of the validated baseline.");
  }

  return {
    agreed_vs_optimised_pct: agreedVsOptimisedPct,
    overpayment_risk: overpaymentRisk,
    under_repair_risk: underRepairRisk,
    efficiency_label: efficiencyLabel,
    summary: summaryParts.join(" "),
  };
}

/**
 * Compute the final POST recommendation from anomalies, confidence, and alignment.
 */
function derivePostRecommendation(
  anomalies: CostAnomaly[],
  confidence: number,
  alignmentStatus: string | null,
  costBasis: CostBasis,
  negotiationEfficiency: NegotiationEfficiency | null
): PostRecommendation {
  const hasCritical = anomalies.some(a => a.severity === "critical");
  const hasHigh = anomalies.some(a => a.severity === "high");
  const hasNoCostBasis = anomalies.some(a => a.category === "no_cost_basis");

  if (hasNoCostBasis) return "REVIEW";
  if (hasCritical) return "REJECT";
  if (hasHigh) return "REVIEW";
  if (alignmentStatus === "MISALIGNED") return "REVIEW";
  if (confidence < 30) return "REVIEW";

  // Overpayment risk in POST mode escalates to REVIEW
  if (negotiationEfficiency?.overpayment_risk) return "REVIEW";
  // Under-repair risk in POST mode also escalates to REVIEW
  if (negotiationEfficiency?.under_repair_risk) return "REVIEW";

  if (costBasis === "assessor_validated" && anomalies.length === 0) return "APPROVE";
  if (costBasis === "system_optimised" && confidence >= 60 && anomalies.length === 0) return "APPROVE";
  if (anomalies.some(a => a.severity === "medium")) return "REVIEW";
  return "APPROVE";
}

/**
 * Compute the PRE recommendation (guidance only — no final approval).
 */
function derivePreRecommendation(
  anomalies: CostAnomaly[],
  negotiationGuidance: NegotiationGuidance
): PreRecommendation {
  const hasCritical = anomalies.some(a => a.severity === "critical");
  const hasHigh = anomalies.some(a => a.severity === "high");

  if (hasCritical) return "ESCALATE";
  if (negotiationGuidance.overpriced_quotes.length > 0 || negotiationGuidance.missing_components.length > 0) {
    return hasHigh ? "ESCALATE" : "NEGOTIATE";
  }
  return "PROCEED_TO_ASSESSMENT";
}

/**
 * Compute the overall confidence score for the decision (0–100).
 */
function computeDecisionConfidence(
  costReliability: DecisionInputReliability | null,
  optimisationConfidence: number | null,
  anomalies: CostAnomaly[],
  alignmentStatus: string | null,
  costBasis: CostBasis
): number {
  let base = costReliability?.confidence_score ?? optimisationConfidence ?? 50;

  if (costBasis === "assessor_validated") base = Math.min(100, base + 10);

  if (alignmentStatus === "FULLY_ALIGNED") base = Math.min(100, base + 5);
  else if (alignmentStatus === "MISALIGNED") base = Math.max(0, base - 20);
  else if (alignmentStatus === "PARTIALLY_ALIGNED") base = Math.max(0, base - 10);

  for (const a of anomalies) {
    if (a.severity === "critical") base = Math.max(0, base - 25);
    else if (a.severity === "high") base = Math.max(0, base - 15);
    else if (a.severity === "medium") base = Math.max(0, base - 8);
    else base = Math.max(0, base - 3);
  }

  return Math.min(100, Math.max(0, Math.round(base)));
}

/**
 * Build a mode-aware human-readable reasoning paragraph.
 * Uses insurance/engineering language — no AI/model terminology.
 */
function buildReasoning(
  trueCostUsd: number,
  costBasis: CostBasis,
  mode: CostMode,
  deviationAnalysis: DeviationAnalysis,
  anomalies: CostAnomaly[],
  recommendation: Recommendation,
  confidence: number,
  alignmentResult: DecisionInputAlignment | null,
  negotiationGuidance: NegotiationGuidance | null,
  negotiationEfficiency: NegotiationEfficiency | null,
  currency: string
): string {
  const parts: string[] = [];

  // 1. Mode context
  if (mode === "PRE_ASSESSMENT") {
    parts.push(
      `This analysis was performed in pre-assessment mode. No assessor-agreed cost is available at this stage; the cost basis of ${currency} ${trueCostUsd.toFixed(2)} is derived from the system-optimised weighted quote baseline and is intended to guide negotiation only — it does not constitute a final approval decision.`
    );
  } else {
    if (costBasis === "assessor_validated") {
      parts.push(
        `The true cost basis of ${currency} ${trueCostUsd.toFixed(2)} has been established from the assessor-validated agreed cost, which takes precedence over all other cost signals.`
      );
    } else {
      parts.push(
        `No assessor-agreed cost was available. The true cost basis of ${currency} ${trueCostUsd.toFixed(2)} has been derived from the system-optimised weighted quote baseline.`
      );
    }
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
    parts.push(`The system-optimised baseline is ${absPct.toFixed(1)}% ${dir} the agreed cost.`);
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
      parts.push(`Component misalignment was detected. ${alignmentResult.engineering_comment}`);
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

  // 5. Mode-specific outcome
  if (mode === "PRE_ASSESSMENT" && negotiationGuidance) {
    const recLabel: Record<PreRecommendation, string> = {
      NEGOTIATE: "negotiation is recommended before proceeding to formal assessment",
      PROCEED_TO_ASSESSMENT: "quotes are within acceptable range — proceed to formal assessment",
      ESCALATE: "escalation to senior adjuster is recommended due to significant anomalies",
    };
    parts.push(
      `Based on the above, ${recLabel[recommendation as PreRecommendation]}. Negotiation target: ${currency} ${negotiationGuidance.target_usd.toFixed(2)} (range: ${currency} ${negotiationGuidance.floor_usd.toFixed(2)}–${currency} ${negotiationGuidance.ceiling_usd.toFixed(2)}).`
    );
  } else if (mode === "POST_ASSESSMENT") {
    if (negotiationEfficiency && negotiationEfficiency.efficiency_label !== "unknown") {
      parts.push(negotiationEfficiency.summary);
    }
    const recLabel: Record<PostRecommendation, string> = {
      APPROVE: "approved for processing",
      REVIEW: "referred for adjuster review",
      REJECT: "flagged for rejection pending investigation",
    };
    parts.push(
      `Based on the above, this claim cost is ${recLabel[recommendation as PostRecommendation]} with a decision confidence of ${confidence}/100.`
    );
  }

  return parts.join(" ");
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Runs the Claims Cost Decision Engine (mode-aware).
 *
 * @param input - All available cost signals for the claim, including cost_mode
 * @returns A structured cost decision with true cost, deviations, anomalies,
 *          mode-specific guidance or adjudication, confidence, and reasoning
 */
export function runCostDecision(input: CostDecisionInput): CostDecisionOutput {
  const currency = input.currency ?? "USD";
  const mode = input.cost_mode;
  const trace: string[] = [];

  trace.push(`Cost Decision Engine started in ${mode} mode.`);

  // ── Step 1: Resolve TRUE COST BASIS ────────────────────────────────────────
  //
  // POST_ASSESSMENT: agreed_cost overrides if present
  // PRE_ASSESSMENT:  agreed_cost is not yet available — always use optimised

  let trueCostUsd: number;
  let costBasis: CostBasis;

  const agreedCost = input.agreed_cost_usd;
  const optimisedCost = input.optimised_cost?.optimised_cost_usd ?? null;

  if (mode === "POST_ASSESSMENT" && agreedCost !== null && agreedCost > 0) {
    trueCostUsd = round2(agreedCost);
    costBasis = "assessor_validated";
    trace.push(`TRUE_COST resolved to ${currency} ${trueCostUsd.toFixed(2)} from assessor-agreed cost (assessor_validated).`);
  } else if (optimisedCost !== null && optimisedCost > 0) {
    trueCostUsd = round2(optimisedCost);
    costBasis = "system_optimised";
    if (mode === "PRE_ASSESSMENT") {
      trace.push(`PRE_ASSESSMENT mode: TRUE_COST set to system-optimised baseline of ${currency} ${trueCostUsd.toFixed(2)}.`);
    } else {
      trace.push(`No agreed cost present. TRUE_COST resolved to ${currency} ${trueCostUsd.toFixed(2)} from system-optimised quote baseline (system_optimised).`);
    }
  } else {
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

  // ── Step 4: Confidence ─────────────────────────────────────────────────────

  const confidence = computeDecisionConfidence(
    input.cost_reliability,
    input.optimised_cost?.confidence ?? null,
    anomalies,
    alignmentStatus,
    costBasis
  );

  // ── Step 5: Mode-specific outputs ─────────────────────────────────────────

  let negotiationGuidance: NegotiationGuidance | null = null;
  let negotiationEfficiency: NegotiationEfficiency | null = null;
  let recommendation: Recommendation;

  if (mode === "PRE_ASSESSMENT") {
    negotiationGuidance = buildNegotiationGuidance(
      trueCostUsd,
      optimisedCost,
      input.extracted_quotes,
      input.optimised_cost,
      input.alignment_result ?? null,
      currency
    );
    recommendation = derivePreRecommendation(anomalies, negotiationGuidance);
    trace.push(`PRE_ASSESSMENT guidance: target=${currency} ${negotiationGuidance.target_usd.toFixed(2)}, overpriced_quotes=${negotiationGuidance.overpriced_quotes.length}, missing_components=${negotiationGuidance.missing_components.length}.`);
  } else {
    // POST_ASSESSMENT
    if (agreedCost !== null && agreedCost > 0 && optimisedCost !== null) {
      negotiationEfficiency = buildNegotiationEfficiency(agreedCost, optimisedCost, currency);
      trace.push(`POST_ASSESSMENT efficiency: agreed_vs_optimised=${negotiationEfficiency.agreed_vs_optimised_pct?.toFixed(1) ?? "N/A"}%, label=${negotiationEfficiency.efficiency_label}.`);
    }
    recommendation = derivePostRecommendation(anomalies, confidence, alignmentStatus, costBasis, negotiationEfficiency);
  }

  trace.push(`Recommendation: ${recommendation} (confidence=${confidence}/100).`);

  // ── Step 6: Reasoning ──────────────────────────────────────────────────────

  const reasoning = buildReasoning(
    trueCostUsd,
    costBasis,
    mode,
    deviationAnalysis,
    anomalies,
    recommendation,
    confidence,
    input.alignment_result ?? null,
    negotiationGuidance,
    negotiationEfficiency,
    currency
  );

  return {
    true_cost_usd: trueCostUsd,
    cost_basis: costBasis,
    mode,
    deviation_analysis: deviationAnalysis,
    anomalies,
    recommendation,
    confidence,
    reasoning,
    negotiation_guidance: negotiationGuidance,
    negotiation_efficiency: negotiationEfficiency,
    decision_trace: trace,
  };
}
