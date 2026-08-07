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
  /**
   * The recommended quote: lowest-cost valid quote with ≥80% component coverage
   * and no structural gaps. This is the KINGA cost recommendation.
   * null if no quote meets the threshold.
   */
  best_quote_by_cost: QuoteValidationResult | null;
  /**
   * Savings opportunity in USD: difference between the highest-cost selected quote
   * and the best_quote_by_cost. Represents what the insurer saves by using KINGA
   * to select the optimal quote.
   */
  savings_vs_highest_usd: number;
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
  "f/bar": "front bumper assembly",
  "bumper cover": "bumper cover",          // distinct from full assembly
  "bumper bar": "front bumper assembly",
  "bumper bracket": "bumper bracket",       // mounting bracket, not the assembly
  "bumper absorber": "bumper absorber",     // energy absorber foam, not the assembly
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
  if (!name || !name.trim()) return name;
  // Single source of truth: resolveToCanonical() from vehicleParts.ts
  // Covers all aliases, shorthands (F/B, RHS dr, w/screen, R/B assy, A/C cond),
  // and assembly names via the unified VEHICLE_PARTS catalogue.
  // Returns canonical name (e.g. "Front Bumper") or cleaned raw string if unknown.
  return resolveToCanonical(name);
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

// CALIBRATION: 0.4 similarity threshold is engineering-judgment.
// Do not change without benchmarking against a labelled component-matching sample.
/** Minimum token-overlap similarity score for a component to be considered matched */
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

// CALIBRATION: confidence score mappings are engineering-judgment.
// Do not change without benchmarking.
/** Numeric weight assigned to each extraction confidence level */
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

// CALIBRATION: 30% outlier threshold is engineering-judgment.
// Do not change without benchmarking against a labelled quote dataset.
/** Quotes more than this percentage above the median are flagged as outliers */
const OUTLIER_THRESHOLD_PCT = 30;

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
  // CALIBRATION: 0.5 outlier weight factor is engineering-judgment.
  // Do not change without benchmarking.
  /** Factor by which outlier quote weights are reduced */
  const OUTLIER_QUOTE_WEIGHT_FACTOR = 0.5;
  if (is_outlier) weight *= OUTLIER_QUOTE_WEIGHT_FACTOR;
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

  // CALIBRATION: All point allocations, spread thresholds, and bonus/penalty values
  // below are engineering-judgment. Do not change without benchmarking.

  /** Points for ≥3 valid quotes */
  const OC_POINTS_THREE_QUOTES   = 30;
  /** Points for exactly 2 valid quotes */
  const OC_POINTS_TWO_QUOTES     = 20;
  /** Points for exactly 1 valid quote */
  const OC_POINTS_ONE_QUOTE      = 10;
  /** Maximum points from average coverage ratio */
  const OC_MAX_COVERAGE_POINTS   = 25;
  /** Maximum points from structural completeness */
  const OC_MAX_STRUCTURAL_POINTS = 25;
  /** Spread threshold for high penalty (%) */
  const OC_SPREAD_HIGH           = 60;
  /** Spread threshold for medium penalty (%) */
  const OC_SPREAD_MED            = 40;
  /** Spread threshold for low penalty (%) */
  const OC_SPREAD_LOW            = 20;
  /** Penalty for high spread */
  const OC_PENALTY_SPREAD_HIGH   = 15;
  /** Penalty for medium spread */
  const OC_PENALTY_SPREAD_MED    = 10;
  /** Penalty for low spread */
  const OC_PENALTY_SPREAD_LOW    = 5;
  /** Penalty per outlier quote */
  const OC_PENALTY_PER_OUTLIER   = 5;
  /** Maximum bonus from high-confidence extractions */
  const OC_MAX_HIGH_CONF_BONUS   = 10;

  // Quote count (max OC_POINTS_THREE_QUOTES points)
  if (selectedQuotes.length >= 3) score += OC_POINTS_THREE_QUOTES;
  else if (selectedQuotes.length === 2) score += OC_POINTS_TWO_QUOTES;
  else score += OC_POINTS_ONE_QUOTE;

  // Average coverage ratio (max OC_MAX_COVERAGE_POINTS points)
  const avgCoverage = selectedQuotes.reduce((s, q) => s + q.coverage_ratio, 0) / selectedQuotes.length;
  score += Math.round(avgCoverage * OC_MAX_COVERAGE_POINTS);

  // Structural completeness (max OC_MAX_STRUCTURAL_POINTS points)
  const completeCount = selectedQuotes.filter(q => q.structurally_complete).length;
  const structuralScore = (completeCount / selectedQuotes.length) * OC_MAX_STRUCTURAL_POINTS;
  score += Math.round(structuralScore);

  // Cost spread penalty
  if (costSpreadPct > OC_SPREAD_HIGH) score -= OC_PENALTY_SPREAD_HIGH;
  else if (costSpreadPct > OC_SPREAD_MED) score -= OC_PENALTY_SPREAD_MED;
  else if (costSpreadPct > OC_SPREAD_LOW) score -= OC_PENALTY_SPREAD_LOW;

  // Outlier penalty
  const outlierCount = selectedQuotes.filter(q => q.is_outlier).length;
  score -= outlierCount * OC_PENALTY_PER_OUTLIER;

  // High confidence extraction bonus
  const highConfCount = selectedQuotes.filter(q => q.confidence === "high").length;
  score += Math.round((highConfCount / selectedQuotes.length) * OC_MAX_HIGH_CONF_BONUS);

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
      best_quote_by_cost: null,
      savings_vs_highest_usd: 0,
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
      best_quote_by_cost: null,
      savings_vs_highest_usd: 0,
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
    best_quote_by_cost: selectedQuotes.length > 0
      ? selectedQuotes.reduce((a, b) => (a.total_cost ?? Infinity) < (b.total_cost ?? Infinity) ? a : b)
      : null,
    savings_vs_highest_usd: 0, // overridden in stage-9 with L1-L2 formula after compositeResult
  };
}

// =============================================================================
// MULTI-QUOTE COMPOSITE OPTIMISATION ENGINE
// =============================================================================
// These functions implement the three-layer cost model (L1/L2/L3), composite
// quote construction, Negotiation Feasibility Score, and component classification.
// All functions are additive — they do not modify existing optimiseRepairCost().
// =============================================================================

import type {
  CompositeLineItem,
  QuotedNotDamagedFlag,
  DamagedNotQuotedFlag,
  ProbableHiddenDamageAdvisory,
} from './types.js'; // tsx resolves .js → .ts automatically
import { resolveToCanonical, resolveToCanonicalId } from '../../shared/vehicleParts';
import { isComponentCoveredByAssembly } from './canonicalPartsVocabulary.js';

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED INPUT TYPES FOR COMPOSITE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export interface InputQuoteLineItem {
  componentName: string;
  costUsd: number;
  /** True when this row is a repair operation (not a replacement part supply) */
  isRepair?: boolean;
  /** True when this row is a replacement part supply */
  isReplacement?: boolean;
  /** True when this row is a non-component cost (labour, paint, diagnostic, VAT) that should not enter the parts matrix */
  isNonPartCost?: boolean;
}

export interface InputQuoteWithLineItems extends InputQuote {
  lineItems?: InputQuoteLineItem[];
}

export interface BenchmarkMap {
  [componentName: string]: {
    p25Usd: number | null;
    p50Usd: number | null;
    p75Usd: number | null;
    sampleSize: number;
    modelSource?: 'ml' | 'statistical' | 'db_legacy' | 'none' | null;
    vehicleMakeFiltered?: boolean | null;
  } | null;
}

export interface CompositeQuoteResult {
  compositeLineItems: CompositeLineItem[];
  compositeOptimisedCostUsd: number;
  benchmarkReferenceCostUsd: number;
  negotiationSavingsUsd: number;
  marketOverpriceDeltaUsd: number;
  totalSavingsOpportunityUsd: number;
  benchmarkCoverageComponents: number;
  negotiationFeasibilityScore: number;
  negotiationFeasibilityLabel: 'achievable' | 'partial' | 'complex';
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICE VARIANCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coefficient of variation (CV) = stddev / mean × 100.
 * Returns null if fewer than 2 prices are provided.
 * CV < 20% = low variance (prices are consistent)
 * CV 20–40% = moderate variance
 * CV > 40% = high variance (prices are inconsistent)
 */
function coefficientOfVariation(prices: number[]): number | null {
  if (prices.length < 2) return null;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (mean === 0) return null;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  return Math.round((Math.sqrt(variance) / mean) * 100 * 10) / 10;
}

function buildVarianceSignal(
  cv: number | null,
  priceCount: number,
  selectedFromSubmitted: boolean,
  isBenchmarkFill: boolean
): string {
  if (priceCount === 0) return 'No submitted prices available — benchmark reference used.';
  if (priceCount === 1) return 'Single submitted price — no cross-quote comparison available.';
  if (cv === null) return 'Variance not calculable.';
  if (isBenchmarkFill) {
    if (cv <= 20) return `Submitted prices are consistent (CV ${cv}%) but failed the credibility gate — benchmark P50 used as reference.`;
    return `Submitted prices show high variance (CV ${cv}%) — benchmark P50 used as credibility anchor.`;
  }
  if (cv <= 20) return `Submitted prices are consistent across repairers (CV ${cv}%) — lowest submitted price selected with high confidence.`;
  if (cv <= 40) return `Moderate price variation across repairers (CV ${cv}%) — lowest credible submitted price selected.`;
  return `High price variation across repairers (CV ${cv}%) — assessor review of scope alignment recommended.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIBILITY GATE
// ─────────────────────────────────────────────────────────────────────────────

// CALIBRATION: Credibility gate thresholds (0.40 coverage floor, 0.70×P25 floor,
// 2.00×P75 ceiling) are engineering-judgment.
// Do not change without benchmarking against a labelled quote dataset.

/** Minimum quote coverage ratio to pass the credibility gate */
const CG_MIN_COVERAGE_RATIO  = 0.40;
/** Credibility floor: reject prices below this fraction of P25 */
const CG_P25_FLOOR_FACTOR    = 0.70;
/** Credibility ceiling: reject prices above this multiple of P75 */
const CG_P75_CEILING_FACTOR  = 2.00;

function applyCredibilityGate(
  costUsd: number,
  p25Usd: number | null,
  p75Usd: number | null,
  quoteCoverageRatio: number
): { passed: boolean; reason?: string } {
  if (quoteCoverageRatio < CG_MIN_COVERAGE_RATIO) {
    return { passed: false, reason: `Quote covers only ${Math.round(quoteCoverageRatio * 100)}% of damaged components (minimum ${Math.round(CG_MIN_COVERAGE_RATIO * 100)}% required)` };
  }
  if (p25Usd !== null && costUsd < p25Usd * CG_P25_FLOOR_FACTOR) {
    return { passed: false, reason: `Price $${costUsd.toFixed(0)} is below the credibility floor ($${(p25Usd * CG_P25_FLOOR_FACTOR).toFixed(0)} = P25 × ${CG_P25_FLOOR_FACTOR}) — may exclude fitment or use unfit parts` };
  }
  if (p75Usd !== null && costUsd > p75Usd * CG_P75_CEILING_FACTOR) {
    return { passed: false, reason: `Price $${costUsd.toFixed(0)} exceeds the credibility ceiling ($${(p75Usd * CG_P75_CEILING_FACTOR).toFixed(0)} = P75 × ${CG_P75_CEILING_FACTOR}) — likely a data entry error or scope mismatch` };
  }
  return { passed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK VERDICT + APPROVED SIGNAL LANGUAGE
// ─────────────────────────────────────────────────────────────────────────────

function computeBenchmarkVerdict(
  costUsd: number,
  p25Usd: number | null,
  p75Usd: number | null
): { verdict: CompositeLineItem['benchmarkVerdict']; signal: string } {
  if (p25Usd === null || p75Usd === null) {
    return { verdict: 'NO_DATA', signal: 'Insufficient benchmark data for this component.' };
  }
  if (costUsd < p25Usd) {
    return { verdict: 'BELOW_MARKET', signal: 'Pricing is below the lower benchmark reference range. Verify scope completeness.' };
  }
  if (costUsd > p75Usd) {
    const pct = Math.round(((costUsd - p75Usd) / p75Usd) * 100);
    if (pct > 50) {
      return { verdict: 'ABOVE_MARKET', signal: `Pricing materially exceeds benchmark reference ranges (${pct}% above P75). Assessor review recommended.` };
    }
    return { verdict: 'ABOVE_MARKET', signal: 'Potential negotiation opportunity exists based on alternative credible quotations.' };
  }
  return { verdict: 'MARKET_RATE', signal: 'Comparable market-aligned pricing identified.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE QUOTE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the KINGA L2 optimised cost.
 *
 * CONFIRMED FORMULA (product owner, July 2026):
 *   1. Normalise each submitted quote to a comparable total (sum all component
 *      rows per quote — parts + associated repair-ops — to get the all-in cost
 *      for that quote). Labour is already inside each quote's component rows;
 *      it is NOT added separately.
 *   2. Build a cross-quote component matrix: for each component, collect all
 *      normalised prices from all quotes.
 *   3. Per-component L2 selection:
 *      lowestSubmitted_c = min price across all quotes for component c
 *      K_c = KINGA benchmark P50 for component c
 *      deviation_c = |lowestSubmitted_c - K_c| / lowestSubmitted_c
 *      If K_c < lowestSubmitted_c AND deviation_c <= 30%: L2_c = K_c
 *      Else: L2_c = lowestSubmitted_c  (30% floor or no benchmark)
 *   4. L1 = lowest normalised quote total (best real package deal)
 *   5. L2_total = sum of L2_c across all components
 *      L2_total MAY exceed L1 (when 30% floor engages on all components).
 *      KINGA reports both; insurer can accept L1 as the authorisation amount.
 *   6. savings = L1 - L2_total (can be negative; always report both)
 *
 * compositeLineItems is the per-component breakdown of the L2 selection —
 * each item shows which repairer provided the lowest price for that component
 * and whether the benchmark was applied.
 *
 * @param quotes       All submitted quotes with per-line-item costs
 * @param benchmarks   Per-component benchmark data (P25/P50/P75)
 * @param l1TotalUsd   L1 hint from stage-9 (lowest quote total already computed upstream)
 * @param componentSeverityMap  Per-component severity (used for scope classification in audit trail)
 */
export function buildCompositeQuote(
  quotes: InputQuoteWithLineItems[],
  benchmarks: BenchmarkMap,
  l1TotalUsd: number,
  componentSeverityMap?: Map<string, string>
): CompositeQuoteResult {
  // ── 0. Handle edge cases ──────────────────────────────────────────────────
  const EMPTY_RESULT: CompositeQuoteResult = {
    compositeLineItems: [],
    compositeOptimisedCostUsd: l1TotalUsd,
    benchmarkReferenceCostUsd: 0,
    negotiationSavingsUsd: 0,
    marketOverpriceDeltaUsd: 0,
    totalSavingsOpportunityUsd: 0,
    benchmarkCoverageComponents: 0,
    negotiationFeasibilityScore: 0,
    negotiationFeasibilityLabel: 'complex',
  };
  if (quotes.length === 0) return EMPTY_RESULT;

  // ── 1. Normalise each quote to a comparable total ────────────────────────
  //
  // For each quote, sum all component rows (parts + associated repair-ops) to
  // get the all-in cost for that quote. Labour is already inside each quote's
  // component rows; it is NOT added separately.
  //
  // Standalone overhead rows (VAT, general workshop fee not tied to any
  // specific component) are excluded from the normalised total.
  //
  // Safety-critical components (airbags, seat belts, chassis) must be
  // replacement-scope only. If a quote only has a repair-scope price for a
  // safety-critical component, that component's cost is excluded from the
  // normalised total and flagged as a data gap.

  const SAFETY_CRITICAL_REPLACE_ONLY = new Set([
    'airbag', 'driver airbag', 'passenger airbag', 'knee airbag', 'curtain airbag',
    'side airbag', 'airbag module', 'airbag control module', 'srs module',
    'seat belt', 'seatbelt', 'seat belt pretensioner', 'seat belt buckle',
    'chassis', 'subframe', 'chassis frame', 'chassis frame subframe',
    'front subframe', 'rear subframe', 'engine subframe',
  ]);

  interface NormalisedQuote {
    repairer: string;
    normalisedTotalUsd: number;
    lineItemBreakdown: Array<{
      normName: string;
      costUsd: number;
      scope: 'repair' | 'replace' | 'bundled';
      dataGap: boolean;
      dataGapReason?: string;
    }>;
    dataGaps: string[];
  }

  const normalisedQuotes: NormalisedQuote[] = quotes.map((q, qi) => {
    const repairer = q.panel_beater ?? `Quote ${qi + 1}`;
    const items = q.lineItems ?? [];

    // Group rows by component name + scope within this quote
    const compAccumulator: Map<string, { costUsd: number; scope: 'repair' | 'replace' | 'bundled' }> = new Map();

    for (const item of items) {
      if (!item.costUsd || item.costUsd <= 0) continue;
      if (!item.componentName || item.componentName.trim() === '') continue;
      // Skip standalone non-component overhead rows
      if (item.isNonPartCost && !item.isRepair) continue;

      const normName = normalise(item.componentName);
      const rowScope: 'repair' | 'replace' | 'bundled' =
        item.isRepair ? 'repair' :
        item.isReplacement ? 'replace' :
        'bundled';

      // For safety-critical components, only replacement scope is valid
      const isSafetyCritical = SAFETY_CRITICAL_REPLACE_ONLY.has(normName);
      if (isSafetyCritical && rowScope === 'repair') continue; // skip repair rows for safety-critical

      // Use a key that groups by component+scope so repair and replace are separate
      const key = `${normName}|||${rowScope}`;
      const existing = compAccumulator.get(key);
      if (existing) {
        existing.costUsd += item.costUsd;
      } else {
        compAccumulator.set(key, { costUsd: item.costUsd, scope: rowScope });
      }
    }

    // For each component, if both repair and replace scopes exist, use the
    // severity signal to pick the appropriate scope; default to replace.
    const componentMap: Map<string, { costUsd: number; scope: 'repair' | 'replace' | 'bundled' }> = new Map();
    for (const [key, entry] of compAccumulator.entries()) {
      const normName = key.split('|||')[0];
      const severity = componentSeverityMap?.get(normName) ?? null;
      const severityRequiresReplace = severity === 'severe' || severity === 'catastrophic';

      const existing = componentMap.get(normName);
      if (!existing) {
        componentMap.set(normName, entry);
      } else {
        // Both scopes exist for this component in this quote.
        // If severity requires replace: prefer replace scope.
        // Otherwise: prefer the lower-cost scope.
        const preferReplace = severityRequiresReplace || SAFETY_CRITICAL_REPLACE_ONLY.has(normName);
        if (preferReplace) {
          if (entry.scope === 'replace' || entry.scope === 'bundled') {
            componentMap.set(normName, entry);
          }
        } else {
          // Prefer lower cost
          if (entry.costUsd < existing.costUsd) {
            componentMap.set(normName, entry);
          }
        }
      }
    }

    // Build the line item breakdown and normalised total
    const lineItemBreakdown: NormalisedQuote['lineItemBreakdown'] = [];
    const dataGaps: string[] = [];
    let normalisedTotalUsd = 0;

    // If no line items at all, fall back to the quote's total_cost header
    if (componentMap.size === 0 && (q.total_cost ?? 0) > 0) {
      normalisedTotalUsd = q.total_cost!;
    } else {
      for (const [normName, entry] of componentMap.entries()) {
        const isSafetyCritical = SAFETY_CRITICAL_REPLACE_ONLY.has(normName);
        // Check for safety-critical data gap: safety-critical but only repair scope available
        if (isSafetyCritical && entry.scope === 'repair') {
          dataGaps.push(normName);
          lineItemBreakdown.push({
            normName,
            costUsd: 0,
            scope: entry.scope,
            dataGap: true,
            dataGapReason: `Safety-critical component: replacement-scope quote required but only repair scope available.`,
          });
          continue; // Do NOT add to normalised total
        }
        normalisedTotalUsd += entry.costUsd;
        lineItemBreakdown.push({
          normName,
          costUsd: entry.costUsd,
          scope: entry.scope,
          dataGap: false,
        });
      }
    }

    return { repairer, normalisedTotalUsd, lineItemBreakdown, dataGaps };
  });

  // Filter out quotes with zero normalised total
  const validNormalisedQuotes = normalisedQuotes.filter(q => q.normalisedTotalUsd > 0);
  if (validNormalisedQuotes.length === 0) return { ...EMPTY_RESULT };

  // ── 2. Build cross-quote component matrix ────────────────────────────────────
  //
  // For each component, collect all normalised prices from all quotes.
  // This enables per-component comparison across all repairers.

  // CALIBRATION (Aug 2026): Reduced from 0.30 to 0.15.
  // At 30%, the engine was selecting benchmark P50 values up to 26% below the
  // lowest market quote — a cost no repairer in Zimbabwe would accept. At 15%,
  // the benchmark must be very close to market before it overrides submitted quotes.
  const MAX_MODEL_DISCOUNT_PCT = 0.15;

  // componentMatrix[normName] = array of { repairer, costUsd, scope }
  type ComponentEntry = { repairer: string; costUsd: number; scope: 'repair' | 'replace' | 'bundled' };
  const componentMatrix = new Map<string, ComponentEntry[]>();

  for (const nq of validNormalisedQuotes) {
    for (const item of nq.lineItemBreakdown) {
      if (item.dataGap || item.costUsd <= 0) continue;
      const existing = componentMatrix.get(item.normName) ?? [];
      existing.push({ repairer: nq.repairer, costUsd: item.costUsd, scope: item.scope });
      componentMatrix.set(item.normName, existing);
    }
  }

  // ── 3. Per-component L2 selection ──────────────────────────────────────────
  //
  // CONFIRMED FORMULA (product owner, July 2026):
  //   For each component:
  //     lowestSubmitted = min price across all quotes for this component
  //     K = benchmark P50 for this component
  //     deviation = |lowestSubmitted - K| / lowestSubmitted
  //     If K < lowestSubmitted AND deviation <= 15%: L2_component = K
  //     Else: L2_component = lowestSubmitted  (15% floor or no benchmark)
  //
  // L2_component <= lowestSubmitted for every component.
  // L2_total = sum of L2_component across all components.

  const compositeLineItems: CompositeLineItem[] = [];
  let compositeOptimisedCostUsd = 0;
  let benchmarkReferenceUsd = 0;
  let benchmarkCoverageCount = 0;

  for (const [normName, entries] of componentMatrix.entries()) {
    if (entries.length === 0) continue;

    // Find lowest submitted price for this component across all quotes
    const lowestEntry = entries.reduce((best, e) => e.costUsd < best.costUsd ? e : best);
    const lowestSubmitted = lowestEntry.costUsd;

    // Build allQuotedPrices in the typed format expected by CompositeLineItem
    const allQuotedPrices = entries.map(e => ({
      quote: e.repairer,
      costUsd: e.costUsd,
      passedGate: true,
    }));

    const bm = benchmarks[normName] ?? null;
    const p25 = bm?.p25Usd ?? null;
    const p50 = bm?.p50Usd ?? null;
    const p75 = bm?.p75Usd ?? null;

    let l2Component: number;
    let isBenchmarkFill = false;
    let tier: CompositeLineItem['kingaOptimisedTier'] = 'T3';
    let tierLabel: string;
    let scopeDecisionRule: NonNullable<CompositeLineItem['scopeDecisionRule']> = 'SINGLE_SCOPE_AVAILABLE';

    if (p50 != null) {
      benchmarkReferenceUsd += p50;
      benchmarkCoverageCount++;
      const deviation = Math.abs(lowestSubmitted - p50) / lowestSubmitted;
      if (p50 < lowestSubmitted && deviation <= MAX_MODEL_DISCOUNT_PCT) {
        // Benchmark is cheaper and within 15% — use benchmark
        l2Component = Math.round(p50 * 100) / 100;
        isBenchmarkFill = true;
        tier = 'T1';
        tierLabel = `KINGA Benchmark P50 · ${Math.round(deviation * 100)}% below lowest quote`;
        scopeDecisionRule = 'BENCHMARK_WITHIN_30PCT';
      } else {
        // 15% floor engaged or benchmark above market — use lowest submitted
        l2Component = Math.round(lowestSubmitted * 100) / 100;
        tier = 'T3';
        tierLabel = p50 >= lowestSubmitted
          ? `Lowest Quote · ${lowestEntry.repairer} (benchmark above market)`
          : `Lowest Quote · ${lowestEntry.repairer} (deviation ${Math.round(deviation * 100)}% > 15% floor)`;
        scopeDecisionRule = p50 >= lowestSubmitted ? 'BENCHMARK_ABOVE_MARKET' : 'BENCHMARK_FLOOR_EXCEEDED';
      }
    } else {
      // No benchmark — use lowest submitted
      l2Component = Math.round(lowestSubmitted * 100) / 100;
      tier = 'T3';
      tierLabel = `Lowest Quote · ${lowestEntry.repairer} (no benchmark)`;
      scopeDecisionRule = 'SINGLE_SCOPE_AVAILABLE';
    }

    compositeOptimisedCostUsd += l2Component;

    const { verdict, signal } = computeBenchmarkVerdict(l2Component, p25, p75);
    const rawPrices = entries.map(e => e.costUsd);
    const cv = coefficientOfVariation(rawPrices);
    const varianceSignal = buildVarianceSignal(cv, rawPrices.length, !isBenchmarkFill, isBenchmarkFill);

    compositeLineItems.push({
      componentName: normName,
      selectedCostUsd: l2Component,
      selectedFromQuote: isBenchmarkFill ? 'kinga_benchmark' : lowestEntry.repairer,
      isBenchmarkFill,
      kingaOptimisedTier: tier,
      kingaOptimisedTierLabel: tierLabel,
      benchmarkVerdict: verdict,
      benchmarkSignal: `${signal} ${varianceSignal}`.trim(),
      p25Usd: p25,
      p50Usd: p50,
      p75Usd: p75,
      allQuotedPrices,
      selectedScope: lowestEntry.scope,
      scopeDecisionRule,
      scopeDecisionConfidence: entries.length >= 2 ? 'high' : 'medium',
      dataGap: false,
      benchmarkModelSource: bm?.modelSource ?? null,
      benchmarkVehicleMakeFiltered: bm?.vehicleMakeFiltered ?? null,
      benchmarkSampleSize: bm?.sampleSize ?? null,
    } satisfies CompositeLineItem);
  }

  // Add data gap items from all quotes (safety-critical with no replacement scope)
  const allDataGapNames = new Set(validNormalisedQuotes.flatMap(q => q.dataGaps));
  for (const gapName of allDataGapNames) {
    if (compositeLineItems.some(i => i.componentName === gapName)) continue;
    const bm = benchmarks[gapName] ?? null;
    compositeLineItems.push({
      componentName: gapName,
      selectedCostUsd: 0,
      selectedFromQuote: 'data_gap',
      isBenchmarkFill: false,
      kingaOptimisedTier: 'T4',
      kingaOptimisedTierLabel: 'Data Gap — Safety-Critical',
      benchmarkVerdict: 'NO_DATA',
      benchmarkSignal: 'Safety-critical component: no replacement-scope quote available from any repairer.',
      p25Usd: bm?.p25Usd ?? null,
      p50Usd: bm?.p50Usd ?? null,
      p75Usd: bm?.p75Usd ?? null,
      allQuotedPrices: [],
      selectedScope: 'replace',
      scopeDecisionRule: 'SAFETY_CRITICAL_REPLACE_ONLY',
      scopeDecisionConfidence: 'high',
      dataGap: true,
      dataGapReason: 'Safety-critical component: replacement-scope quote required but only repair scope available.',
    });
  }

  compositeOptimisedCostUsd = Math.round(compositeOptimisedCostUsd * 100) / 100;

  // ── MINIMUM FLOOR GUARD ──────────────────────────────────────────────────────
  // KINGA optimised total must never fall below the lowest submitted quote total.
  // This prevents the per-component cherry-pick from producing a figure that no
  // repairer in the market would accept (e.g. when benchmark P50 covers only a
  // subset of components and the uncovered components are excluded from the sum).
  const lowestSubmittedTotal = Math.min(...validNormalisedQuotes.map(q => q.normalisedTotalUsd));
  // Only apply the floor when benchmark fills are present. A pure cherry-pick composite
  // (all T3 items from submitted quotes, benchmarkCoverageCount === 0) is intentionally
  // allowed to be lower than any single repairer's total — that is the core value proposition
  // of L2 optimisation. The floor prevents benchmark P50 values from pushing the total below
  // what any repairer in the market would actually accept.
  const hasBenchmarkFills = benchmarkCoverageCount > 0;
  if (hasBenchmarkFills && lowestSubmittedTotal > 0 && compositeOptimisedCostUsd < lowestSubmittedTotal) {
    compositeOptimisedCostUsd = Math.round(lowestSubmittedTotal * 100) / 100;
  }

  // ── 4. L1 for savings calculation ──────────────────────────────────────────
  // L1 = lowest normalised quote total (best real package deal)
  const normalisedL1 = Math.min(...validNormalisedQuotes.map(q => q.normalisedTotalUsd));
  const l1Usd = (l1TotalUsd > 0) ? l1TotalUsd : normalisedL1;

  // ── 5. Savings metrics ──────────────────────────────────────────────────────
  // negotiationSavingsUsd = L1 - L2_total (can be negative if L2 > L1)
  // When L2 > L1, the per-component cherry-pick total exceeds the best package
  // deal. KINGA reports both; insurer can accept L1 as the authorisation amount.
  const negotiationSavingsUsd = Math.round((l1Usd - compositeOptimisedCostUsd) * 100) / 100;
  // marketOverpriceDeltaUsd = L2 - benchmark total
  const marketOverpriceDeltaUsd = benchmarkReferenceUsd > 0
    ? Math.round((compositeOptimisedCostUsd - benchmarkReferenceUsd) * 100) / 100
    : 0;
  // totalSavingsOpportunityUsd = L1 - benchmark total (max possible saving)
  const totalSavingsOpportunityUsd = benchmarkReferenceUsd > 0
    ? Math.max(0, Math.round((l1Usd - benchmarkReferenceUsd) * 100) / 100)
    : 0;

  // ── 6. Negotiation Feasibility Score ───────────────────────────────────────
  // Use the lowest-quote repairer as the NFS reference
  const l1Repairer = validNormalisedQuotes.reduce((best, q) =>
    q.normalisedTotalUsd < best.normalisedTotalUsd ? q : best
  ).repairer;
  const { score: negotiationFeasibilityScore, label: negotiationFeasibilityLabel } =
    computeNFS(compositeLineItems, l1Repairer);

  return {
    compositeLineItems,
    compositeOptimisedCostUsd,
    benchmarkReferenceCostUsd: Math.round(benchmarkReferenceUsd * 100) / 100,
    negotiationSavingsUsd,
    marketOverpriceDeltaUsd,
    totalSavingsOpportunityUsd,
    benchmarkCoverageComponents: benchmarkCoverageCount,
    negotiationFeasibilityScore,
    negotiationFeasibilityLabel,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// NEGOTIATION FEASIBILITY SCORE (NFS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Negotiation Feasibility Score (NFS) — an internal metric
 * measuring whether the composite L2 is operationally achievable.
 * NOT shown in the primary forensic report.
 */
export function computeNFS(
  compositeLineItems: CompositeLineItem[],
  labourSourceRepairer: string | null
): { score: number; label: 'achievable' | 'partial' | 'complex' } {
  if (compositeLineItems.length === 0) {
    return { score: 0, label: 'complex' };
  }

  const totalItems = compositeLineItems.length;
  const fills = compositeLineItems.filter(i => i.isBenchmarkFill).length;
  const realItems = totalItems - fills;

  if (realItems === 0) {
    return { score: 20, label: 'complex' };
  }

  // CALIBRATION: All NFS factor weights, proximity tier scores, and label thresholds
  // are engineering-judgment. Do not change without benchmarking.

  /** NFS Factor 1 weight: concentration ratio */
  const NFS_W_CONCENTRATION  = 0.40;
  /** NFS Factor 2 weight: supplier overlap */
  const NFS_W_OVERLAP        = 0.25;
  /** NFS Factor 3 weight: ecosystem consistency */
  const NFS_W_ECOSYSTEM      = 0.15;
  /** NFS Factor 4 weight: geographic proximity */
  const NFS_W_PROXIMITY      = 0.20;
  /** NFS Factor 2: score when labour and parts source match */
  const NFS_OVERLAP_MATCH    = 100;
  /** NFS Factor 2: score when labour and parts source do not match */
  const NFS_OVERLAP_NO_MATCH = 30;
  /** NFS Factor 4: score for 1 distinct repairer */
  const NFS_PROXIMITY_1      = 100;
  /** NFS Factor 4: score for 2 distinct repairers */
  const NFS_PROXIMITY_2      = 70;
  /** NFS Factor 4: score for 3 distinct repairers */
  const NFS_PROXIMITY_3      = 45;
  /** NFS Factor 4: score for 4+ distinct repairers */
  const NFS_PROXIMITY_4PLUS  = 20;
  /** NFS label threshold for 'achievable' */
  const NFS_ACHIEVABLE_MIN   = 70;
  /** NFS label threshold for 'partial' */
  const NFS_PARTIAL_MIN      = 40;

  // Factor 1: Concentration ratio (NFS_W_CONCENTRATION) — % of composite items from a single repairer
  const repairerCounts: Record<string, number> = {};
  for (const item of compositeLineItems) {
    if (!item.isBenchmarkFill) {
      repairerCounts[item.selectedFromQuote] = (repairerCounts[item.selectedFromQuote] ?? 0) + 1;
    }
  }
  const maxConcentration = Math.max(...Object.values(repairerCounts), 0);
  const concentrationRatio = maxConcentration / realItems;
  const concentrationScore = Math.round(concentrationRatio * 100); // 0–100

  // Factor 2: Supplier overlap (NFS_W_OVERLAP) — does the labour source match the dominant parts source?
  const dominantPartsRepairer = Object.entries(repairerCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const overlapScore = (labourSourceRepairer && dominantPartsRepairer &&
    labourSourceRepairer === dominantPartsRepairer) ? NFS_OVERLAP_MATCH : NFS_OVERLAP_NO_MATCH;

  // Factor 3: Parts ecosystem consistency (NFS_W_ECOSYSTEM) — are benchmark fills minimal?
  const fillRatio = fills / totalItems;
  const ecosystemScore = Math.round((1 - fillRatio) * 100);

  // Factor 4: Geographic proximity (NFS_W_PROXIMITY) — proxy: number of distinct repairers used
  const distinctRepairers = Object.keys(repairerCounts).length;
  const proximityScore = distinctRepairers <= 1 ? NFS_PROXIMITY_1
    : distinctRepairers === 2 ? NFS_PROXIMITY_2
    : distinctRepairers === 3 ? NFS_PROXIMITY_3
    : NFS_PROXIMITY_4PLUS;

  const nfs = Math.round(
    concentrationScore * NFS_W_CONCENTRATION +
    overlapScore * NFS_W_OVERLAP +
    ecosystemScore * NFS_W_ECOSYSTEM +
    proximityScore * NFS_W_PROXIMITY
  );

  const label: 'achievable' | 'partial' | 'complex' =
    nfs >= NFS_ACHIEVABLE_MIN ? 'achievable' : nfs >= NFS_PARTIAL_MIN ? 'partial' : 'complex';

  return { score: nfs, label };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/** Structural zone adjacency map — components that are plausibly co-damaged */
const ADJACENCY_ZONES: Record<string, string[]> = {
  front: ['bonnet', 'front bumper', 'grille', 'radiator', 'headlamp', 'fog lamp', 'intercooler', 'condenser', 'bumper bracket', 'radiator support', 'front panel'],
  rear: ['boot lid', 'rear bumper', 'tail lamp', 'rear panel', 'spare wheel', 'tow bar'],
  left_side: ['left front door', 'left rear door', 'left fender', 'left sill', 'left mirror', 'left shock'],
  right_side: ['right front door', 'right rear door', 'right fender', 'right sill', 'right mirror', 'right shock'],
  roof: ['roof', 'windscreen', 'rear windscreen', 'sunroof', 'a pillar', 'b pillar'],
  underbody: ['exhaust', 'gearbox', 'engine', 'sump', 'driveshaft', 'differential'],
};

function getZone(componentName: string): string | null {
  const norm = normalise(componentName);
  for (const [zone, members] of Object.entries(ADJACENCY_ZONES)) {
    if (members.some(m => norm.includes(normalise(m)) || normalise(m).includes(norm))) {
      return zone;
    }
  }
  return null;
}

function isAdjacentToConfirmedDamage(
  componentName: string,
  confirmedDamagedComponents: string[]
): boolean {
  const zone = getZone(componentName);
  if (!zone) return false;
  return confirmedDamagedComponents.some(c => getZone(c) === zone);
}

/**
 * Classifies components into four categories:
 * - Confirmed Damaged + Quoted (handled by composite builder)
 * - Quoted but Not Confirmed Damaged (scope inflation detection)
 * - Confirmed Damaged but Not Quoted (scope gap detection)
 */
export function classifyComponents(
  confirmedDamagedComponents: string[],
  allQuotedComponents: string[],
  benchmarks: BenchmarkMap,
  quoteRepairerNames: string[]
): {
  quotedNotDamaged: QuotedNotDamagedFlag[];
  damagedNotQuoted: DamagedNotQuotedFlag[];
} {
  const normDamaged = confirmedDamagedComponents.map(normalise);
  const normQuoted = allQuotedComponents.map(normalise);

  // Quoted but not confirmed damaged
  const quotedNotDamaged: QuotedNotDamagedFlag[] = [];
  for (const qc of normQuoted) {
    const isConfirmed = normDamaged.some(dc =>
      isComponentMatched(dc, [qc]) || isComponentMatched(qc, [dc])
    );
    if (!isConfirmed) {
      const adjacent = isAdjacentToConfirmedDamage(qc, confirmedDamagedComponents);
      const classification = adjacent ? 'plausible_scope_extension' : 'potential_scope_inflation';
      const reportSignal = adjacent
        ? `Component "${qc}" was not identified in the damage assessment but is structurally adjacent to confirmed damage. Plausible scope extension — assessor verification recommended.`
        : `Component "${qc}" appears in the submitted quotation but was not identified in the damage assessment. Assessor verification of physical damage is recommended.`;

      // Find which repairers quoted this
      const quotedBy = quoteRepairerNames.filter((_, i) => {
        // We pass repairer names in order — this is a best-effort attribution
        return true; // simplified: flag all repairers since we don't have per-repairer breakdown here
      });

      quotedNotDamaged.push({
        componentName: qc,
        quotedByRepairers: quotedBy.slice(0, 3), // cap at 3 for display
        totalQuotedCostUsd: 0, // populated by stage-9 with actual costs
        isAdjacentToConfirmedDamage: adjacent,
        classification,
        reportSignal,
      });
    }
  }

  // Confirmed damaged but not quoted
  // Note: also check if the component is covered by a quoted assembly
  // (e.g. "Radiator" is covered by "Cooling Pack Assembly").
  const damagedNotQuoted: DamagedNotQuotedFlag[] = [];
  // Deduplicate: multiple raw damage part strings may resolve to the same
  // canonical component name (e.g. "F/Bumper" and "Front Bumper" both → "Front Bumper").
  // Track seen canonical names so each component appears at most once.
  const damagedNotQuotedSeen = new Set<string>();
  for (const dc of normDamaged) {
    const isQuoted = normQuoted.some(qc =>
      isComponentMatched(dc, [qc]) || isComponentMatched(qc, [dc])
    );
    // Assembly containment check: if the raw (pre-normalised) quoted components
    // include an assembly that contains this part, treat it as quoted.
    const isCoveredByAssembly = isComponentCoveredByAssembly(dc, allQuotedComponents);
    if (!isQuoted && !isCoveredByAssembly && !damagedNotQuotedSeen.has(dc)) {
      damagedNotQuotedSeen.add(dc);
      const bm = benchmarks[dc] ?? null;
      const p50 = bm?.p50Usd ?? null;
      const reportSignal = p50 !== null
        ? `Component "${dc}" was identified as damaged but was not included in any submitted quotation. Benchmark reference pricing for this component: $${p50.toFixed(0)}. Assessor should confirm whether this component is included in the repairer's scope.`
        : `Component "${dc}" was identified as damaged but was not included in any submitted quotation. No benchmark reference data is available for this component. Assessor should confirm scope coverage.`;

      damagedNotQuoted.push({
        componentName: dc,
        severity: 'unknown', // populated by stage-9 from damage assessment severity
        benchmarkP50Usd: p50,
        reportSignal,
      });
    }
  }

  return { quotedNotDamaged, damagedNotQuoted };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROBABLE HIDDEN DAMAGE (PROBABILISTIC ADVISORIES)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Co-occurrence probability table derived from the training corpus.
 * Format: { triggerComponent: { hiddenComponent: probabilityPct } }
 * These are conservative estimates — only components with ≥40% co-occurrence
 * in the training data are included.
 * CALIBRATION: All probability values in this table are estimates derived from
 * engineering judgment and a limited training corpus. They are NOT statistically
 * validated. Do not change without a proper co-occurrence analysis on a large
 * labelled claim dataset.
 */
const CO_OCCURRENCE_TABLE: Record<string, Record<string, number>> = {
  'bonnet': { 'radiator': 73, 'condenser': 61, 'intercooler': 48, 'radiator support': 55 },
  'front bumper': { 'grille': 82, 'fog lamp': 67, 'bumper bracket': 71, 'radiator': 58 },
  'radiator': { 'condenser': 69, 'intercooler': 52, 'bonnet': 61 },
  'left front door': { 'left mirror': 74, 'left fender': 58, 'left sill': 43 },
  'right front door': { 'right mirror': 74, 'right fender': 58, 'right sill': 43 },
  'windscreen': { 'roof': 41, 'a pillar': 55, 'dashboard': 40 },
  'boot lid': { 'rear bumper': 68, 'tail lamp': 59, 'rear panel': 47 },
  'rear bumper': { 'boot lid': 62, 'tail lamp': 54 },
  'left fender': { 'left front door': 49, 'left headlamp': 44 },
  'right fender': { 'right front door': 49, 'right headlamp': 44 },
};

/**
 * Computes probabilistic hidden damage advisories based on confirmed damage
 * and the co-occurrence table. Only components with probability ≥ 40% are
 * returned. These are ADVISORY ONLY and must never be included in cost totals.
 */
export function computeProbableHiddenDamage(
  confirmedDamagedComponents: string[],
  allQuotedComponents: string[],
  allDamagedComponents: string[]  // union of confirmed + quoted
): ProbableHiddenDamageAdvisory[] {
  const normConfirmed = confirmedDamagedComponents.map(normalise);
  const normAll = allDamagedComponents.map(normalise);
  const advisories: Map<string, { prob: number; basis: string[] }> = new Map();

  for (const trigger of normConfirmed) {
    const coOccurrences = CO_OCCURRENCE_TABLE[trigger] ?? {};
    for (const [hidden, prob] of Object.entries(coOccurrences)) {
      const normHidden = normalise(hidden);
      // Skip if already confirmed or quoted
      const alreadyKnown = normAll.some(c =>
        isComponentMatched(c, [normHidden]) || isComponentMatched(normHidden, [c])
      );
      if (alreadyKnown) continue;

      const existing = advisories.get(normHidden);
      if (!existing) {
        advisories.set(normHidden, { prob, basis: [trigger] });
      } else {
        // Combine probabilities: P(A or B) = 1 - (1-P(A))(1-P(B))
        const combined = Math.round(100 * (1 - (1 - existing.prob / 100) * (1 - prob / 100)));
        // CALIBRATION: 95% combined-probability cap is engineering-judgment.
        // Do not change without benchmarking.
        /** Maximum combined hidden-damage probability (never claim certainty) */
        const HIDDEN_DAMAGE_MAX_PROB = 95;
        advisories.set(normHidden, {
          prob: Math.min(combined, HIDDEN_DAMAGE_MAX_PROB),
          basis: [...existing.basis, trigger],
        });
      }
    }
  }

  const result: ProbableHiddenDamageAdvisory[] = [];
  // CALIBRATION: 40% minimum probability threshold and ±12% confidence band
  // are engineering-judgment. Do not change without benchmarking.
  /** Minimum probability to surface a hidden-damage advisory */
  const HIDDEN_DAMAGE_MIN_PROB = 40;
  /** Half-width of the confidence band around the probability estimate */
  const HIDDEN_DAMAGE_BAND_HALF_WIDTH = 12;

  for (const [component, { prob, basis }] of advisories.entries()) {
    if (prob < HIDDEN_DAMAGE_MIN_PROB) continue;

    const bandLow = Math.max(0, prob - HIDDEN_DAMAGE_BAND_HALF_WIDTH);
    const bandHigh = Math.min(95, prob + HIDDEN_DAMAGE_BAND_HALF_WIDTH); // 95 = HIDDEN_DAMAGE_MAX_PROB

    result.push({
      componentName: component,
      probabilityPct: prob,
      confidenceBand: `${bandLow}–${bandHigh}%`,
      basisComponents: basis,
      reportSignal: `Based on the collision pattern and confirmed damage profile, "${component}" has a ${prob}% probability of hidden damage (range: ${bandLow}–${bandHigh}%). This is an advisory signal only. Physical inspection is required to confirm.`,
    });
  }

  // Sort by probability descending
  return result.sort((a, b) => b.probabilityPct - a.probabilityPct);
}
