/**
 * pipeline-v2/quoteOptimisationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTOMOTIVE COST INTELLIGENCE OPTIMISATION ENGINE
 *
 * Validates, compares, and synthesises multiple repair quotes into a single
 * defensible optimised baseline cost with full audit trail.
 *
 * PIPELINE ROLE: Stage 9b — called after quote extraction and damage
 * reconciliation, before the final cost intelligence narrative is generated.
 *
 * INPUT:
 *   - extracted_quotes[]   (panel_beater, total_cost, components, confidence)
 *   - damage_components[]  (canonical component names from Stage 6)
 *   - vehicle_type         (body type for structural completeness rules)
 *
 * OUTPUT:
 *   {
 *     optimised_cost_usd:  number,
 *     selected_quotes:     QuoteValidationResult[],
 *     excluded_quotes:     ExcludedQuote[],
 *     cost_spread_pct:     number,
 *     confidence:          0–100,
 *     justification:       string
 *   }
 *
 * DESIGN RULES:
 *   1. Do NOT default to the lowest quote blindly
 *   2. Structural completeness > price
 *   3. Missing structural components = coverage penalty
 *   4. Quotes >30% above median are flagged as outliers
 *   5. Quotes missing structural components are penalised, not excluded outright
 *   6. The optimised cost is a weighted average, not a simple mean
 *   7. Weights are derived from: component coverage × structural completeness × confidence
 *   8. All exclusions and penalties are recorded in the audit trail
 *
 * PROFESSIONAL LANGUAGE RULES:
 *   - No AI/model terminology in justification text
 *   - Use insurance/engineering language: "assessor-agreed", "market rate",
 *     "structural completeness", "quote deviation", "coverage ratio"
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface InputQuote {
  /** Panel beater / repairer name */
  panel_beater: string | null;
  /** Total quoted cost in USD */
  total_cost: number | null;
  /** Currency of the quote (used for display only — all costs must be pre-converted to USD) */
  currency?: string;
  /** Component names quoted */
  components: string[];
  /** Whether labour was explicitly defined in the quote */
  labour_defined?: boolean;
  /** Whether parts were explicitly defined */
  parts_defined?: boolean;
  /** Actual labour cost from the quote document (USD). Null if not itemised. */
  labour_cost?: number | null;
  /** Actual parts cost from the quote document (USD). Null if not itemised. */
  parts_cost?: number | null;
  /** Extraction confidence */
  confidence: "high" | "medium" | "low";
}

export interface QuoteValidationResult {
  /** Index in the original input array */
  quote_index: number;
  /** Panel beater name */
  panel_beater: string;
  /** Total cost USD */
  total_cost: number;
  /** Actual labour cost from the quote document (USD). Null if not itemised. */
  labour_cost: number | null;
  /** Actual parts cost from the quote document (USD). Null if not itemised. */
  parts_cost: number | null;
  /** Component coverage ratio (0–1): matched_components / damage_components */
  coverage_ratio: number;
  /** Whether all structural damage components are present in this quote */
  structurally_complete: boolean;
  /** Structural components that are missing from this quote */
  structural_gaps: string[];
  /** Extra components in quote not in damage list */
  extra_components: string[];
  /** Confidence level from extraction */
  confidence: "high" | "medium" | "low";
  /** Computed optimisation weight (0–1) */
  weight: number;
  /** Whether this quote is flagged as an outlier */
  is_outlier: boolean;
  /** Outlier reason if applicable */
  outlier_reason: string | null;
  /** Penalty applied for structural incompleteness (0–1, 0 = no penalty) */
  structural_penalty: number;
}

export interface ExcludedQuote {
  /** Index in the original input array */
  quote_index: number;
  /** Panel beater name */
  panel_beater: string;
  /** Total cost USD (if available) */
  total_cost: number | null;
  /** Reason for exclusion */
  reason: string;
  /** Category of exclusion */
  exclusion_category: "no_cost" | "outlier_inflated" | "zero_coverage" | "invalid";
}

export interface QuoteOptimisationResult {
  /** Optimised baseline cost in USD */
  optimised_cost_usd: number;
  /** Quotes included in the weighted average */
  selected_quotes: QuoteValidationResult[];
  /** Quotes excluded from the weighted average */
  excluded_quotes: ExcludedQuote[];
  /** Percentage spread between max and min valid quote costs */
  cost_spread_pct: number;
  /** Overall confidence score 0–100 */
  confidence: number;
  /** Engineering and market reasoning for the optimised cost */
  justification: string;
  /** Median cost of valid quotes (before weighting) */
  median_cost_usd: number | null;
  /** Number of quotes evaluated */
  quotes_evaluated: number;
  /** Number of structural gaps across all selected quotes */
  total_structural_gaps: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL COMPONENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const STRUCTURAL_PATTERNS = [
  /radiator support/i,
  /bumper bracket/i,
  /bumper mount/i,
  /chassis rail/i,
  /chassis leg/i,
  /chassis.*frame|frame.*chassis/i,
  /firewall|bulkhead/i,
  /sill panel|rocker panel/i,
  /a.?pillar|b.?pillar|c.?pillar|d.?pillar/i,
  /strut tower/i,
  /subframe/i,
  /cross.?member/i,
  /floor pan/i,
  /diff connector|differential connector/i,
];

function isStructural(componentName: string): boolean {
  return STRUCTURAL_PATTERNS.some(p => p.test(componentName));
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

const SYNONYM_MAP: Record<string, string> = {
  "bonnet": "bonnet/hood",
  "hood": "bonnet/hood",
  "boot": "boot/trunk lid",
  "trunk": "boot/trunk lid",
  "boot lid": "boot/trunk lid",
  "trunk lid": "boot/trunk lid",
  "windscreen": "windshield/windscreen",
  "windshield": "windshield/windscreen",
  "front glass": "windshield/windscreen",
  "headlight": "headlamp assembly",
  "headlamp": "headlamp assembly",
  "head light": "headlamp assembly",
  "tail light": "tail lamp assembly",
  "taillight": "tail lamp assembly",
  "tail lamp": "tail lamp assembly",
  "grille": "front grille",
  "grill": "front grille",
  "radiator grille": "front grille",
  "radiator support": "radiator support panel",
  "rad support": "radiator support panel",
  "fender": "front fender",
  "wing": "front fender",
  "front wing": "front fender",
  "quarter panel": "rear quarter panel",
  "rear fender": "rear quarter panel",
  "front bumper": "front bumper assembly",
  "bumper cover": "front bumper assembly",
  "bumper bar": "front bumper assembly",
  "f/bar": "front bumper assembly",
  "rear bumper": "rear bumper assembly",
  "b/bar": "rear bumper assembly",
  "back bumper": "rear bumper assembly",
  "chassis": "chassis/frame",
  "frame": "chassis/frame",
  "subframe": "front subframe",
  "front subframe": "front subframe",
  "sill": "sill panel",
  "rocker panel": "sill panel",
  "control arm": "control arm",
  "lower control arm": "control arm",
  "strut": "suspension strut",
  "shock absorber": "suspension strut",
  "airbag": "airbag module",
  "srs airbag": "airbag module",
  "radiator": "radiator",
  "condenser": "AC condenser",
  "mirror": "door mirror",
  "wing mirror": "door mirror",
  "side mirror": "door mirror",
};

function normalise(name: string): string {
  const lower = name.toLowerCase().trim();
  return SYNONYM_MAP[lower] ?? lower;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC SIMILARITY (token overlap)
// ─────────────────────────────────────────────────────────────────────────────

function tokenise(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

function similarity(a: string, b: string): number {
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of Array.from(ta)) {
    if (tb.has(t)) intersection++;
  }
  return intersection / Math.max(ta.size, tb.size);
}

const MATCH_THRESHOLD = 0.4;

function isComponentMatched(damageComp: string, quoteComponents: string[]): boolean {
  const normDamage = normalise(damageComp);
  for (const qc of quoteComponents) {
    const normQuote = normalise(qc);
    if (normDamage === normQuote) return true;
    if (similarity(normDamage, normQuote) >= MATCH_THRESHOLD) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE_SCORE: Record<"high" | "medium" | "low", number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL PENALTY COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the structural penalty for a quote.
 *
 * A quote missing structural components is penalised proportionally.
 * The penalty reduces the quote's weight in the weighted average.
 *
 * Penalty tiers:
 *   - 0 structural gaps:  0.00 (no penalty)
 *   - 1 structural gap:   0.20
 *   - 2 structural gaps:  0.40
 *   - 3+ structural gaps: 0.60 (capped)
 */
function computeStructuralPenalty(structuralGapCount: number): number {
  if (structuralGapCount === 0) return 0;
  if (structuralGapCount === 1) return 0.20;
  if (structuralGapCount === 2) return 0.40;
  return 0.60; // 3+ gaps
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIAN COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTLIER DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const OUTLIER_THRESHOLD_PCT = 30; // quotes >30% above median are outliers

function detectOutlier(
  cost: number,
  medianCost: number
): { is_outlier: boolean; reason: string | null } {
  if (medianCost <= 0) return { is_outlier: false, reason: null };
  const deviationPct = ((cost - medianCost) / medianCost) * 100;
  if (deviationPct > OUTLIER_THRESHOLD_PCT) {
    return {
      is_outlier: true,
      reason: `Quote is ${deviationPct.toFixed(1)}% above median (threshold: ${OUTLIER_THRESHOLD_PCT}%). Flagged as inflated.`,
    };
  }
  return { is_outlier: false, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validateQuote(
  quote: InputQuote,
  index: number,
  damageComponents: string[],
  medianCost: number
): { valid: QuoteValidationResult | null; excluded: ExcludedQuote | null } {
  const panelBeater = quote.panel_beater ?? `Quote ${index + 1}`;

  // Exclude quotes with no cost
  if (quote.total_cost === null || quote.total_cost <= 0) {
    return {
      valid: null,
      excluded: {
        quote_index: index,
        panel_beater: panelBeater,
        total_cost: quote.total_cost,
        reason: "No total cost provided in this quote. Cannot include in cost optimisation.",
        exclusion_category: "no_cost",
      },
    };
  }

  const cost = quote.total_cost;

  // Normalise component lists
  const normDamage = damageComponents.map(normalise);
  const normQuote = quote.components.map(normalise);

  // Coverage ratio: how many damage components are covered by this quote
  let matchedCount = 0;
  for (const dc of normDamage) {
    if (isComponentMatched(dc, normQuote)) matchedCount++;
  }
  const coverageRatio = normDamage.length > 0
    ? Math.round((matchedCount / normDamage.length) * 100) / 100
    : 1.0; // no damage components = full coverage by default

  // Exclude quotes with zero coverage (completely unrelated components)
  if (normDamage.length > 0 && coverageRatio === 0 && normQuote.length > 0) {
    return {
      valid: null,
      excluded: {
        quote_index: index,
        panel_beater: panelBeater,
        total_cost: cost,
        reason: "Quote components do not match any identified damage components (0% coverage). Quote may be for a different vehicle or incident.",
        exclusion_category: "zero_coverage",
      },
    };
  }

  // Identify structural gaps
  const structuralDamageComponents = normDamage.filter(isStructural);
  const structuralGaps: string[] = [];
  for (const sc of structuralDamageComponents) {
    if (!isComponentMatched(sc, normQuote)) {
      structuralGaps.push(sc);
    }
  }

  // Identify extra components (in quote but not in damage list)
  const extraComponents: string[] = [];
  for (const qc of normQuote) {
    if (!isComponentMatched(qc, normDamage)) {
      extraComponents.push(qc);
    }
  }

  // Structural completeness
  const structurallyComplete = structuralGaps.length === 0;

  // Outlier detection
  const { is_outlier, reason: outlierReason } = detectOutlier(cost, medianCost);

  // Structural penalty
  const structuralPenalty = computeStructuralPenalty(structuralGaps.length);

  // Weight computation:
  //   base_weight = coverage_ratio × confidence_score
  //   after_penalty = base_weight × (1 - structural_penalty)
  //   outlier_modifier: outliers get weight halved (not excluded — they still inform the range)
  const confidenceScore = CONFIDENCE_SCORE[quote.confidence];
  let weight = coverageRatio * confidenceScore * (1 - structuralPenalty);
  if (is_outlier) weight *= 0.5; // outliers contribute at half weight
  weight = Math.round(weight * 1000) / 1000;

  return {
    valid: {
      quote_index: index,
      panel_beater: panelBeater,
      total_cost: cost,
      labour_cost: quote.labour_cost ?? null,
      parts_cost: quote.parts_cost ?? null,
      coverage_ratio: coverageRatio,
      structurally_complete: structurallyComplete,
      structural_gaps: structuralGaps,
      extra_components: extraComponents,
      confidence: quote.confidence,
      weight,
      is_outlier,
      outlier_reason: outlierReason,
      structural_penalty: structuralPenalty,
    },
    excluded: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// JUSTIFICATION GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function buildJustification(
  selectedQuotes: QuoteValidationResult[],
  excludedQuotes: ExcludedQuote[],
  optimisedCost: number,
  medianCost: number | null,
  costSpreadPct: number,
  damageComponents: string[],
  vehicleType: string
): string {
  const parts: string[] = [];

  // Opening — quote pool summary
  const totalEvaluated = selectedQuotes.length + excludedQuotes.length;
  parts.push(
    `${totalEvaluated} quote${totalEvaluated !== 1 ? "s" : ""} were evaluated for this ${vehicleType} repair. ` +
    `${selectedQuotes.length} quote${selectedQuotes.length !== 1 ? "s" : ""} met the minimum coverage and validity criteria and were included in the cost optimisation.`
  );

  // Exclusions
  if (excludedQuotes.length > 0) {
    const exclusionSummary = excludedQuotes.map(e => {
      if (e.exclusion_category === "no_cost") return `${e.panel_beater} (no cost provided)`;
      if (e.exclusion_category === "zero_coverage") return `${e.panel_beater} (no matching components)`;
      if (e.exclusion_category === "outlier_inflated") return `${e.panel_beater} (inflated — ${e.reason})`;
      return `${e.panel_beater} (${e.reason})`;
    }).join("; ");
    parts.push(`Excluded quotes: ${exclusionSummary}.`);
  }

  // Structural completeness
  const structuralDamageComponents = damageComponents.filter(isStructural);
  if (structuralDamageComponents.length > 0) {
    const completeQuotes = selectedQuotes.filter(q => q.structurally_complete);
    if (completeQuotes.length === selectedQuotes.length) {
      parts.push(
        `All selected quotes account for the ${structuralDamageComponents.length} structural component${structuralDamageComponents.length !== 1 ? "s" : ""} identified in the damage assessment (${structuralDamageComponents.join(", ")}).`
      );
    } else {
      const incompleteQuotes = selectedQuotes.filter(q => !q.structurally_complete);
      parts.push(
        `${incompleteQuotes.length} of ${selectedQuotes.length} selected quote${selectedQuotes.length !== 1 ? "s" : ""} omit structural components. ` +
        `A structural completeness penalty was applied to these quotes, reducing their weighting in the optimised cost computation. ` +
        `Structural components identified: ${structuralDamageComponents.join(", ")}.`
      );
    }
  }

  // Outliers
  const outliers = selectedQuotes.filter(q => q.is_outlier);
  if (outliers.length > 0) {
    parts.push(
      `${outliers.length} quote${outliers.length !== 1 ? "s" : ""} (${outliers.map(q => q.panel_beater).join(", ")}) ` +
      `exceeded the 30% deviation threshold above the median market rate and were retained at half weighting to preserve range visibility without distorting the optimised baseline.`
    );
  }

  // Cost spread
  if (costSpreadPct > 0) {
    parts.push(
      `The cost spread across valid quotes is ${costSpreadPct.toFixed(1)}%${costSpreadPct > 40 ? ", indicating significant market variation that warrants adjuster review" : ""}.`
    );
  }

  // Weighting rationale
  if (selectedQuotes.length > 1) {
    const topQuote = [...selectedQuotes].sort((a, b) => b.weight - a.weight)[0];
    parts.push(
      `The optimised baseline of USD ${optimisedCost.toFixed(2)} was derived using a weighted average, ` +
      `with each quote weighted by its component coverage ratio, structural completeness, and extraction confidence. ` +
      `The highest-weighted quote was submitted by ${topQuote.panel_beater} ` +
      `(coverage: ${(topQuote.coverage_ratio * 100).toFixed(0)}%, weight: ${(topQuote.weight * 100).toFixed(0)}%).`
    );
  } else if (selectedQuotes.length === 1) {
    parts.push(
      `Only one valid quote was available. The optimised cost of USD ${optimisedCost.toFixed(2)} ` +
      `reflects the single valid quote from ${selectedQuotes[0].panel_beater} ` +
      `(coverage: ${(selectedQuotes[0].coverage_ratio * 100).toFixed(0)}%, ` +
      `structural completeness: ${selectedQuotes[0].structurally_complete ? "complete" : "incomplete"}).`
    );
  }

  return parts.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERALL CONFIDENCE SCORE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute an overall confidence score (0–100) for the optimised cost.
 *
 * Factors:
 *   - Number of valid quotes (more = higher confidence)
 *   - Average coverage ratio of selected quotes
 *   - Structural completeness across selected quotes
 *   - Cost spread (lower spread = higher confidence)
 *   - Presence of outliers
 */
function computeOverallConfidence(
  selectedQuotes: QuoteValidationResult[],
  costSpreadPct: number
): number {
  if (selectedQuotes.length === 0) return 0;

  let score = 0;

  // Quote count (max 30 points)
  if (selectedQuotes.length >= 3) score += 30;
  else if (selectedQuotes.length === 2) score += 20;
  else score += 10;

  // Average coverage ratio (max 25 points)
  const avgCoverage = selectedQuotes.reduce((s, q) => s + q.coverage_ratio, 0) / selectedQuotes.length;
  score += Math.round(avgCoverage * 25);

  // Structural completeness (max 25 points)
  const completeCount = selectedQuotes.filter(q => q.structurally_complete).length;
  const structuralScore = (completeCount / selectedQuotes.length) * 25;
  score += Math.round(structuralScore);

  // Cost spread penalty (max -15 points for high spread)
  if (costSpreadPct > 60) score -= 15;
  else if (costSpreadPct > 40) score -= 10;
  else if (costSpreadPct > 20) score -= 5;

  // Outlier penalty (max -10 points)
  const outlierCount = selectedQuotes.filter(q => q.is_outlier).length;
  score -= outlierCount * 5;

  // High confidence extraction bonus (max 10 points)
  const highConfCount = selectedQuotes.filter(q => q.confidence === "high").length;
  score += Math.round((highConfCount / selectedQuotes.length) * 10);

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optimise a set of repair quotes into a single defensible baseline cost.
 *
 * This function is pure (no side effects, no async). It can be called
 * from Stage 9 after quote extraction and damage reconciliation.
 */
export function optimiseRepairCost(
  quotes: InputQuote[],
  damageComponents: string[],
  vehicleType: string
): QuoteOptimisationResult {
  const quotesEvaluated = quotes.length;

  // ── 0. Handle empty input ─────────────────────────────────────────────────
  if (quotes.length === 0) {
    return {
      optimised_cost_usd: 0,
      selected_quotes: [],
      excluded_quotes: [],
      cost_spread_pct: 0,
      confidence: 0,
      justification: "No quotes were provided. Cost optimisation cannot be performed.",
      median_cost_usd: null,
      quotes_evaluated: 0,
      total_structural_gaps: 0,
    };
  }

  // ── 1. First pass: extract valid costs for median computation ─────────────
  const validCosts = quotes
    .map(q => q.total_cost)
    .filter((c): c is number => c !== null && c > 0);

  const medianCost = validCosts.length > 0 ? median(validCosts) : 0;

  // ── 2. Validate each quote ────────────────────────────────────────────────
  const selectedQuotes: QuoteValidationResult[] = [];
  const excludedQuotes: ExcludedQuote[] = [];

  for (let i = 0; i < quotes.length; i++) {
    const { valid, excluded } = validateQuote(quotes[i], i, damageComponents, medianCost);
    if (valid) selectedQuotes.push(valid);
    if (excluded) excludedQuotes.push(excluded);
  }

  // ── 3. Handle case where all quotes are excluded ──────────────────────────
  if (selectedQuotes.length === 0) {
    return {
      optimised_cost_usd: 0,
      selected_quotes: [],
      excluded_quotes: excludedQuotes,
      cost_spread_pct: 0,
      confidence: 0,
      justification:
        "All provided quotes were excluded from cost optimisation: " +
        excludedQuotes.map(e => `${e.panel_beater} (${e.reason})`).join("; ") +
        ". A manual cost assessment is required.",
      median_cost_usd: medianCost > 0 ? medianCost : null,
      quotes_evaluated: quotesEvaluated,
      total_structural_gaps: 0,
    };
  }

  // ── 4. Compute weighted average ───────────────────────────────────────────
  const totalWeight = selectedQuotes.reduce((s, q) => s + q.weight, 0);

  let optimisedCost: number;
  if (totalWeight <= 0) {
    // All weights are zero — fall back to simple average of valid costs
    const sum = selectedQuotes.reduce((s, q) => s + q.total_cost, 0);
    optimisedCost = sum / selectedQuotes.length;
  } else {
    const weightedSum = selectedQuotes.reduce((s, q) => s + q.total_cost * q.weight, 0);
    optimisedCost = weightedSum / totalWeight;
  }
  optimisedCost = Math.round(optimisedCost * 100) / 100;

  // ── 5. Cost spread ────────────────────────────────────────────────────────
  const selectedCosts = selectedQuotes.map(q => q.total_cost);
  const minCost = Math.min(...selectedCosts);
  const maxCost = Math.max(...selectedCosts);
  const costSpreadPct = minCost > 0
    ? Math.round(((maxCost - minCost) / minCost) * 100 * 10) / 10
    : 0;

  // ── 6. Overall confidence ─────────────────────────────────────────────────
  const confidence = computeOverallConfidence(selectedQuotes, costSpreadPct);

  // ── 7. Total structural gaps ──────────────────────────────────────────────
  const totalStructuralGaps = selectedQuotes.reduce(
    (s, q) => s + q.structural_gaps.length,
    0
  );

  // ── 8. Justification ──────────────────────────────────────────────────────
  const justification = buildJustification(
    selectedQuotes,
    excludedQuotes,
    optimisedCost,
    medianCost > 0 ? medianCost : null,
    costSpreadPct,
    damageComponents,
    vehicleType
  );

  return {
    optimised_cost_usd: optimisedCost,
    selected_quotes: selectedQuotes,
    excluded_quotes: excludedQuotes,
    cost_spread_pct: costSpreadPct,
    confidence,
    justification,
    median_cost_usd: medianCost > 0 ? medianCost : null,
    quotes_evaluated: quotesEvaluated,
    total_structural_gaps: totalStructuralGaps,
  };
}
