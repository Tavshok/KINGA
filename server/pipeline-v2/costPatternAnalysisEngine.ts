/**
 * costPatternAnalysisEngine.ts — Cost Pattern Analysis Engine
 *
 * Analyses a collection of stored claim records to identify top cost-driving
 * components, compute per-component cost weightings, and surface actionable
 * insights for underwriters, assessors, and the calibration engine.
 *
 * Output contract:
 * {
 *   "high_cost_drivers": [],          // Top 5 components by total cost contribution
 *   "component_weighting": {},        // component_name → weight (0–1, sums to 1)
 *   "insights": []                    // Actionable text observations
 * }
 *
 * Rules:
 * - Identify top 5 cost-driving components
 * - Weight = contribution to total cost across all claims
 * - Ignore low-frequency noise components (< MIN_FREQUENCY_THRESHOLD)
 * - Components with 0 cost are excluded
 * - Normalise component names for consistent grouping
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum number of claims a component must appear in to be included */
const MIN_FREQUENCY_THRESHOLD = 2;

/** Maximum number of top cost drivers to return */
const TOP_N_DRIVERS = 5;

/** Minimum weight (0–1) for a component to be included in weighting map */
const MIN_WEIGHT_THRESHOLD = 0.005; // 0.5%

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface ClaimComponentCost {
  /** Component name (e.g. "Radiator", "Front Bumper Assembly") */
  component_name: string;
  /** Cost in USD */
  cost_usd: number;
  /** Optional: labour hours for this component */
  labour_hours?: number | null;
  /** Optional: parts cost vs labour cost breakdown */
  parts_cost_usd?: number | null;
  labour_cost_usd?: number | null;
}

export interface ClaimLearningRecord {
  /** Unique claim identifier */
  claim_id: number | string;
  /** Case signature for grouping (e.g. "pickup_animal_frontal_severe_8c_high") */
  case_signature?: string | null;
  /** Scenario type (e.g. "animal_strike", "vehicle_collision") */
  scenario_type?: string | null;
  /** Total claim cost in USD */
  total_cost_usd: number;
  /** List of component-level costs */
  components: ClaimComponentCost[];
  /** Quality tier from Validated Outcome Recorder */
  quality_tier?: "HIGH" | "MEDIUM" | "LOW" | null;
}

export interface CostPatternInput {
  /** List of claim learning records to analyse */
  claims: ClaimLearningRecord[];
  /** Optional: filter to a specific scenario type */
  scenario_filter?: string | null;
  /** Optional: filter to a specific case signature prefix */
  signature_prefix?: string | null;
  /** Optional: minimum quality tier to include */
  min_quality_tier?: "HIGH" | "MEDIUM" | null;
  /** Optional: override for minimum frequency threshold */
  min_frequency?: number | null;
  /** Optional: override for top N drivers */
  top_n?: number | null;
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface CostDriver {
  /** Normalised component name */
  component_name: string;
  /** Total cost contributed by this component across all claims */
  total_cost_usd: number;
  /** Average cost per claim where this component appears */
  avg_cost_usd: number;
  /** Number of claims this component appears in */
  frequency: number;
  /** Percentage of total cost across all claims (0–100) */
  cost_contribution_pct: number;
  /** Cumulative cost contribution percentage (top-N running total) */
  cumulative_pct: number;
  /** Whether this component is structural (higher severity indicator) */
  is_structural: boolean;
  /** Min cost observed for this component */
  min_cost_usd: number;
  /** Max cost observed for this component */
  max_cost_usd: number;
  /** Cost variance indicator */
  variance_label: "stable" | "moderate" | "high";
}

export interface CostPatternOutput {
  /** Top 5 cost-driving components by total cost contribution */
  high_cost_drivers: CostDriver[];
  /** component_name → weight (0–1, all included components sum to 1) */
  component_weighting: Record<string, number>;
  /** Actionable text observations */
  insights: string[];
  /** Analysis metadata */
  metadata: {
    claims_analysed: number;
    claims_filtered_out: number;
    total_cost_analysed_usd: number;
    unique_components_found: number;
    components_after_noise_filter: number;
    scenario_filter_applied: string | null;
    signature_prefix_applied: string | null;
    quality_tier_filter_applied: string | null;
    top_n_drivers: number;
    min_frequency_threshold: number;
    analysis_timestamp: string;
  };
}

// ─── Normalisation Helpers ────────────────────────────────────────────────────

/** Structural component keywords — presence increases severity signal */
const STRUCTURAL_KEYWORDS = [
  "radiator support", "inner frame", "frame rail", "chassis", "subframe",
  "strut tower", "firewall", "floor pan", "a-pillar", "b-pillar", "c-pillar",
  "rocker panel", "cross member", "engine cradle", "apron", "inner sill",
  "structural", "frame", "rail", "tower", "cradle",
];

/** Normalise a component name for consistent grouping */
function normaliseComponentName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Remove common noise suffixes
    .replace(/\s*(assy|assembly|unit|module|panel|cover|trim|lh|rh|lhs|rhs|left|right|front|rear|upper|lower|inner|outer)\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    // Capitalise first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a component name contains structural keywords */
function isStructuralComponent(name: string): boolean {
  const lower = name.toLowerCase();
  return STRUCTURAL_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Compute variance label from min, max, avg */
function computeVarianceLabel(
  min: number,
  max: number,
  avg: number
): "stable" | "moderate" | "high" {
  if (avg === 0) return "stable";
  const range = max - min;
  const rangePct = (range / avg) * 100;
  if (rangePct <= 25) return "stable";
  if (rangePct <= 75) return "moderate";
  return "high";
}

// ─── Quality Tier Filter ──────────────────────────────────────────────────────

const QUALITY_TIER_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function meetsQualityTier(
  record: ClaimLearningRecord,
  minTier: "HIGH" | "MEDIUM" | null | undefined
): boolean {
  if (!minTier) return true;
  const recordTier = record.quality_tier ?? "LOW";
  return (QUALITY_TIER_ORDER[recordTier] ?? 0) >= (QUALITY_TIER_ORDER[minTier] ?? 0);
}

// ─── Core Analysis ────────────────────────────────────────────────────────────

interface ComponentAccumulator {
  total_cost: number;
  count: number;
  costs: number[];
}

/**
 * Analyse a list of claim learning records and return cost pattern insights.
 */
export function analyseCostPatterns(input: CostPatternInput): CostPatternOutput {
  const {
    claims,
    scenario_filter = null,
    signature_prefix = null,
    min_quality_tier = null,
    min_frequency = null,
    top_n = null,
  } = input;

  const minFreq = min_frequency ?? MIN_FREQUENCY_THRESHOLD;
  const topN = top_n ?? TOP_N_DRIVERS;

  // ── 1. Filter claims ───────────────────────────────────────────────────────
  const filteredClaims = claims.filter((c) => {
    if (scenario_filter && c.scenario_type !== scenario_filter) return false;
    if (signature_prefix && !(c.case_signature ?? "").startsWith(signature_prefix)) return false;
    if (!meetsQualityTier(c, min_quality_tier)) return false;
    if (!c.components || c.components.length === 0) return false;
    if (c.total_cost_usd <= 0) return false;
    return true;
  });

  const filteredOut = claims.length - filteredClaims.length;

  if (filteredClaims.length === 0) {
    return buildEmptyOutput(claims.length, filteredOut, {
      scenario_filter,
      signature_prefix,
      min_quality_tier,
      topN,
      minFreq,
    });
  }

  // ── 2. Accumulate component costs ─────────────────────────────────────────
  const accumulator = new Map<string, ComponentAccumulator>();
  let grandTotalCost = 0;

  for (const claim of filteredClaims) {
    grandTotalCost += claim.total_cost_usd;

    for (const comp of claim.components) {
      if (!comp.component_name || comp.cost_usd <= 0) continue;

      const normName = normaliseComponentName(comp.component_name);
      if (!normName) continue;

      const existing = accumulator.get(normName);
      if (existing) {
        existing.total_cost += comp.cost_usd;
        existing.count += 1;
        existing.costs.push(comp.cost_usd);
      } else {
        accumulator.set(normName, {
          total_cost: comp.cost_usd,
          count: 1,
          costs: [comp.cost_usd],
        });
      }
    }
  }

  // ── 3. Filter noise components ────────────────────────────────────────────
  const uniqueComponentsFound = accumulator.size;

  const qualifiedComponents: Array<{
    name: string;
    acc: ComponentAccumulator;
  }> = [];

  for (const [name, acc] of accumulator.entries()) {
    if (acc.count >= minFreq && acc.total_cost > 0) {
      qualifiedComponents.push({ name, acc });
    }
  }

  const componentsAfterFilter = qualifiedComponents.length;

  // ── 4. Sort by total cost descending ──────────────────────────────────────
  qualifiedComponents.sort((a, b) => b.acc.total_cost - a.acc.total_cost);

  // ── 5. Compute total cost across qualified components ─────────────────────
  const qualifiedTotalCost = qualifiedComponents.reduce(
    (sum, c) => sum + c.acc.total_cost,
    0
  );

  // ── 6. Build cost drivers (top N) ─────────────────────────────────────────
  const highCostDrivers: CostDriver[] = [];
  let cumulativePct = 0;

  for (let i = 0; i < Math.min(topN, qualifiedComponents.length); i++) {
    const { name, acc } = qualifiedComponents[i];
    const contributionPct =
      qualifiedTotalCost > 0 ? (acc.total_cost / qualifiedTotalCost) * 100 : 0;
    cumulativePct += contributionPct;

    const sortedCosts = [...acc.costs].sort((a, b) => a - b);
    const minCost = sortedCosts[0] ?? 0;
    const maxCost = sortedCosts[sortedCosts.length - 1] ?? 0;
    const avgCost = acc.total_cost / acc.count;

    highCostDrivers.push({
      component_name: name,
      total_cost_usd: Math.round(acc.total_cost * 100) / 100,
      avg_cost_usd: Math.round(avgCost * 100) / 100,
      frequency: acc.count,
      cost_contribution_pct: Math.round(contributionPct * 10) / 10,
      cumulative_pct: Math.round(cumulativePct * 10) / 10,
      is_structural: isStructuralComponent(name),
      min_cost_usd: Math.round(minCost * 100) / 100,
      max_cost_usd: Math.round(maxCost * 100) / 100,
      variance_label: computeVarianceLabel(minCost, maxCost, avgCost),
    });
  }

  // ── 7. Build component weighting map (all qualified components) ───────────
  const componentWeighting: Record<string, number> = {};

  for (const { name, acc } of qualifiedComponents) {
    const weight =
      qualifiedTotalCost > 0 ? acc.total_cost / qualifiedTotalCost : 0;
    if (weight >= MIN_WEIGHT_THRESHOLD) {
      componentWeighting[name] = Math.round(weight * 10000) / 10000; // 4 d.p.
    }
  }

  // ── 8. Generate insights ──────────────────────────────────────────────────
  const insights = generateInsights({
    highCostDrivers,
    qualifiedComponents,
    filteredClaims,
    grandTotalCost,
    qualifiedTotalCost,
    cumulativePct,
    scenario_filter,
    minFreq,
  });

  // ── 9. Return result ──────────────────────────────────────────────────────
  return {
    high_cost_drivers: highCostDrivers,
    component_weighting: componentWeighting,
    insights,
    metadata: {
      claims_analysed: filteredClaims.length,
      claims_filtered_out: filteredOut,
      total_cost_analysed_usd: Math.round(grandTotalCost * 100) / 100,
      unique_components_found: uniqueComponentsFound,
      components_after_noise_filter: componentsAfterFilter,
      scenario_filter_applied: scenario_filter ?? null,
      signature_prefix_applied: signature_prefix ?? null,
      quality_tier_filter_applied: min_quality_tier ?? null,
      top_n_drivers: topN,
      min_frequency_threshold: minFreq,
      analysis_timestamp: new Date().toISOString(),
    },
  };
}

// ─── Insight Generator ────────────────────────────────────────────────────────

interface InsightContext {
  highCostDrivers: CostDriver[];
  qualifiedComponents: Array<{ name: string; acc: ComponentAccumulator }>;
  filteredClaims: ClaimLearningRecord[];
  grandTotalCost: number;
  qualifiedTotalCost: number;
  cumulativePct: number;
  scenario_filter: string | null | undefined;
  minFreq: number;
}

function generateInsights(ctx: InsightContext): string[] {
  const insights: string[] = [];
  const {
    highCostDrivers,
    qualifiedComponents,
    filteredClaims,
    grandTotalCost,
    qualifiedTotalCost,
    cumulativePct,
    scenario_filter,
    minFreq,
  } = ctx;

  if (highCostDrivers.length === 0) {
    insights.push(
      `No qualified cost drivers found after applying the minimum frequency threshold of ${minFreq}. Consider lowering the threshold or expanding the dataset.`
    );
    return insights;
  }

  // Insight 1: Top driver concentration
  const topDriver = highCostDrivers[0];
  if (topDriver) {
    insights.push(
      `"${topDriver.component_name}" is the single largest cost driver, accounting for ${topDriver.cost_contribution_pct.toFixed(1)}% of total component costs across ${topDriver.frequency} claim${topDriver.frequency !== 1 ? "s" : ""} (avg $${topDriver.avg_cost_usd.toFixed(0)} per claim).`
    );
  }

  // Insight 2: Pareto concentration (top N cumulative)
  if (highCostDrivers.length >= 3 && cumulativePct >= 60) {
    insights.push(
      `The top ${highCostDrivers.length} components account for ${cumulativePct.toFixed(1)}% of total component costs — a high concentration that suggests targeted negotiation on these components would yield the greatest cost savings.`
    );
  }

  // Insight 3: Structural component warning
  const structuralDrivers = highCostDrivers.filter((d) => d.is_structural);
  if (structuralDrivers.length > 0) {
    const names = structuralDrivers.map((d) => `"${d.component_name}"`).join(", ");
    insights.push(
      `${structuralDrivers.length} structural component${structuralDrivers.length > 1 ? "s" : ""} appear in the top cost drivers: ${names}. Structural damage claims typically require mandatory physical inspection before settlement.`
    );
  }

  // Insight 4: High-variance component warning
  const highVarianceDrivers = highCostDrivers.filter(
    (d) => d.variance_label === "high"
  );
  if (highVarianceDrivers.length > 0) {
    const names = highVarianceDrivers.map((d) => `"${d.component_name}"`).join(", ");
    insights.push(
      `High cost variance detected for ${names}. Wide price ranges suggest inconsistent quoting practices or parts availability issues — consider benchmarking against market rates.`
    );
  }

  // Insight 5: Scenario-specific insight
  if (scenario_filter === "animal_strike") {
    const frontalDrivers = highCostDrivers.filter((d) =>
      d.component_name.toLowerCase().match(/radiator|grille|bumper|bonnet|hood|headlight|condenser|intercooler/)
    );
    if (frontalDrivers.length > 0) {
      insights.push(
        `Animal strike claims show frontal component dominance (${frontalDrivers.map((d) => `"${d.component_name}"`).join(", ")}), consistent with expected impact patterns. Claims lacking frontal damage should be reviewed for scenario consistency.`
      );
    }
  }

  if (scenario_filter === "vehicle_collision") {
    const structuralCount = highCostDrivers.filter((d) => d.is_structural).length;
    if (structuralCount >= 2) {
      insights.push(
        `Multiple structural components in the top cost drivers for vehicle collision claims. This pattern is consistent with moderate-to-severe impacts and may warrant engineering assessment before settlement.`
      );
    }
  }

  // Insight 6: Dataset size warning
  if (filteredClaims.length < 10) {
    insights.push(
      `Analysis is based on ${filteredClaims.length} claim${filteredClaims.length !== 1 ? "s" : ""}, which is below the recommended minimum of 10 for reliable pattern detection. Results should be treated as indicative only.`
    );
  }

  // Insight 7: Noise component count
  const noisyComponents = qualifiedComponents.length - highCostDrivers.length;
  if (noisyComponents > 10) {
    insights.push(
      `${noisyComponents} additional components were identified but excluded from the top drivers. Consider reviewing the full component weighting map for a complete picture of cost distribution.`
    );
  }

  // Insight 8: Average claim cost
  if (filteredClaims.length > 0) {
    const avgClaimCost = grandTotalCost / filteredClaims.length;
    insights.push(
      `Average total claim cost across the analysed dataset: $${avgClaimCost.toFixed(0)}${scenario_filter ? ` (${scenario_filter} scenario)` : ""}.`
    );
  }

  return insights;
}

// ─── Empty Output Builder ─────────────────────────────────────────────────────

function buildEmptyOutput(
  totalClaims: number,
  filteredOut: number,
  opts: {
    scenario_filter: string | null | undefined;
    signature_prefix: string | null | undefined;
    min_quality_tier: string | null | undefined;
    topN: number;
    minFreq: number;
  }
): CostPatternOutput {
  return {
    high_cost_drivers: [],
    component_weighting: {},
    insights: [
      "No claims met the filter criteria. Verify that the dataset contains claims with valid component costs and that the applied filters are not too restrictive.",
    ],
    metadata: {
      claims_analysed: 0,
      claims_filtered_out: filteredOut,
      total_cost_analysed_usd: 0,
      unique_components_found: 0,
      components_after_noise_filter: 0,
      scenario_filter_applied: opts.scenario_filter ?? null,
      signature_prefix_applied: opts.signature_prefix ?? null,
      quality_tier_filter_applied: opts.min_quality_tier ?? null,
      top_n_drivers: opts.topN,
      min_frequency_threshold: opts.minFreq,
      analysis_timestamp: new Date().toISOString(),
    },
  };
}

// ─── Convenience: Analyse from raw pipeline outputs ──────────────────────────

/**
 * Build a ClaimLearningRecord from pipeline output fields stored in the DB.
 * Used by the tRPC query to convert raw DB rows into the engine's input format.
 */
export function buildLearningRecord(
  claimId: number,
  totalCostUsd: number,
  partsReconciliationJson: unknown,
  caseSignatureJson: unknown,
  validatedOutcomeJson: unknown,
  scenarioType?: string | null
): ClaimLearningRecord | null {
  // Only include claims that the Validated Outcome Recorder approved for storage
  const validatedOutcome =
    typeof validatedOutcomeJson === "string"
      ? JSON.parse(validatedOutcomeJson)
      : validatedOutcomeJson;

  if (!validatedOutcome?.store) return null;

  const partsRecon = Array.isArray(partsReconciliationJson)
    ? partsReconciliationJson
    : typeof partsReconciliationJson === "string"
    ? JSON.parse(partsReconciliationJson)
    : null;

  const caseSignature =
    typeof caseSignatureJson === "string"
      ? JSON.parse(caseSignatureJson)
      : caseSignatureJson;

  const components: ClaimComponentCost[] = [];

  if (Array.isArray(partsRecon)) {
    for (const part of partsRecon) {
      if (part?.component_name && typeof part?.total_cost === "number" && part.total_cost > 0) {
        components.push({
          component_name: String(part.component_name),
          cost_usd: part.total_cost,
          parts_cost_usd: typeof part.parts_cost === "number" ? part.parts_cost : null,
          labour_cost_usd: typeof part.labour_cost === "number" ? part.labour_cost : null,
          labour_hours: typeof part.labour_hours === "number" ? part.labour_hours : null,
        });
      }
    }
  }

  if (components.length === 0) return null;

  return {
    claim_id: claimId,
    case_signature: (caseSignature as any)?.case_signature ?? null,
    scenario_type: scenarioType ?? null,
    total_cost_usd: totalCostUsd,
    components,
    quality_tier: validatedOutcome.quality_tier ?? null,
  };
}
