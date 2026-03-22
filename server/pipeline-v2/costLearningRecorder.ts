/**
 * pipeline-v2/costLearningRecorder.ts
 *
 * COST INTELLIGENCE LEARNING RECORDER
 *
 * Extracts generalised cost patterns from processed claims and stores them
 * as structured records for future cost model calibration.
 *
 * This module is a pure analytics utility — it does NOT modify any claim
 * record or pipeline output. It produces a CostLearningRecord that can be
 * persisted to the cost_learning_records table for longitudinal analysis.
 *
 * INPUT:
 *   - vehicle_type            (body type + make/model)
 *   - damage_components       (from Stage 6 damage analysis)
 *   - accident_severity       ("minor" | "moderate" | "severe" | "total_loss")
 *   - true_cost_usd           (from costDecisionEngine — validated outcome)
 *   - cost_basis              ("assessor_validated" | "system_optimised")
 *   - selected_quote_components (from Stage 3 input recovery)
 *
 * OUTPUT:
 *   {
 *     high_cost_drivers:    string[]
 *     component_weighting:  Record<string, number>   // relative 0–1
 *     case_signature:       string                   // vehicleType_impact_severity_componentCount_costTier
 *     cost_tier:            "low" | "medium" | "high"
 *   }
 *
 * VALIDATED-OUTCOMES-ONLY POLICY:
 *   - Records are only stored when cost_basis is "assessor_validated" OR
 *     when cost_basis is "system_optimised" with confidence >= MINIMUM_CONFIDENCE_THRESHOLD
 *   - Raw market assumptions, AI estimates, and unvalidated quotes are NEVER
 *     used as the cost basis for learning records
 *   - If the outcome does not meet the validation threshold, the function
 *     returns null and sets rejection_reason
 *
 * Design principles:
 *   - Relative weights only — no exact cost figures stored in the pattern record
 *   - Component names are normalised to canonical form before storage
 *   - Structural components are flagged and weighted separately
 *   - The case_signature is a deterministic, human-readable descriptor
 *   - All outputs use professional insurance language — no AI/model terminology
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum confidence score for system_optimised records to be stored */
const MINIMUM_CONFIDENCE_THRESHOLD = 60;

/** High-cost driver threshold: component must account for ≥15% of total index */
const HIGH_COST_THRESHOLD = 0.15;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AccidentSeverity = "minor" | "moderate" | "severe" | "total_loss";
export type CostTier = "low" | "medium" | "high";
export type CostBasisType = "assessor_validated" | "system_optimised";

export interface LearningInputComponent {
  /** Component name as extracted by Stage 6 */
  name: string;
  /** Damage severity */
  severity: "cosmetic" | "minor" | "moderate" | "severe" | "catastrophic";
  /** Repair action recommended */
  repairAction?: "repair" | "replace" | "refinish";
  /** Component-level estimated cost in USD cents */
  estimatedCostCents?: number;
}

export interface CostLearningInput {
  /** Claim identifier */
  claimId: number | string;
  /** Vehicle body type (pickup, sedan, suv, etc.) */
  vehicleType: string;
  /** Vehicle make */
  vehicleMake: string;
  /** Vehicle model */
  vehicleModel: string;
  /** Damage components from Stage 6 */
  damageComponents: LearningInputComponent[];
  /**
   * TRUE COST in USD — from costDecisionEngine.true_cost_usd.
   * MUST be a validated outcome (assessor_validated or high-confidence system_optimised).
   * Raw AI estimates or unvalidated quotes must NOT be passed here.
   */
  trueCostUsd: number | null;
  /**
   * Cost basis from costDecisionEngine.cost_basis.
   * Determines whether this record passes the validated-outcomes-only policy.
   */
  costBasis: CostBasisType | null;
  /**
   * Decision confidence from costDecisionEngine.confidence (0–100).
   * Required when costBasis is "system_optimised" to enforce the minimum threshold.
   */
  decisionConfidence?: number;
  /** Accident severity — overall claim-level severity */
  accidentSeverity: AccidentSeverity;
  /** Quote component names from Stage 3 input recovery */
  selectedQuoteComponents: string[];
  /** Collision direction for case signature */
  collisionDirection?: string;
  /** Market region */
  marketRegion?: string;
  /**
   * @deprecated Use trueCostUsd instead. Kept for backward compatibility.
   * If trueCostUsd is null and finalCostCents is provided, finalCostCents / 100 is used.
   */
  finalCostCents?: number | null;
}

export interface ComponentWeightEntry {
  /** Normalised canonical component name */
  component: string;
  /** Relative cost weight (0.0 – 1.0, proportional share of total cost) */
  relative_weight: number;
  /** Whether this component is structural */
  is_structural: boolean;
  /** Severity at time of recording */
  severity: string;
  /** Repair action */
  repair_action: string;
}

export interface CostLearningRecord {
  /** Claim reference */
  claim_id: number | string;
  /** ISO timestamp of when this record was extracted */
  recorded_at: string;
  /** Vehicle descriptor used for pattern grouping */
  vehicle_descriptor: string;
  /** Collision direction */
  collision_direction: string;
  /** Market region */
  market_region: string;
  /** Components that individually account for ≥15% of total cost */
  high_cost_drivers: string[];
  /** Per-component relative cost weights (sum ≈ 1.0) */
  component_weighting: Record<string, number>;
  /** Full component weight entries with metadata */
  component_detail: ComponentWeightEntry[];
  /**
   * Short human-readable case descriptor.
   * Format: {vehicleType}_{impact}_{severity}_{componentCount}c_{costTier}
   * Example: "pickup_frontal_severe_6c_high"
   */
  case_signature: string;
  /** Derived cost tier from true_cost_usd */
  cost_tier: CostTier;
  /** Number of damage components */
  component_count: number;
  /** True cost in USD — validated outcome from costDecisionEngine */
  true_cost_usd: number | null;
  /** Cost basis that produced the true cost */
  cost_basis: CostBasisType | null;
  /** Decision confidence at time of recording */
  decision_confidence: number | null;
  /** Accident severity */
  accident_severity: AccidentSeverity;
  /** Whether the cost was assessor-validated */
  cost_is_validated: boolean;
  /** Structural component count */
  structural_component_count: number;
  /** Coverage ratio: quote components / damage components */
  quote_coverage_ratio: number;
  /** Data quality flags */
  quality_flags: string[];
  /**
   * @deprecated Use true_cost_usd. Kept for backward compatibility with
   * existing DB schema and Stage 9 persistence code.
   */
  final_cost_usd: number | null;
  /**
   * @deprecated Use cost_is_validated. Kept for backward compatibility.
   */
  cost_is_agreed: boolean;
}

export interface CostLearningRejection {
  /** Why this record was not stored */
  rejection_reason: string;
  /** The cost basis that was provided */
  cost_basis: CostBasisType | null;
  /** The confidence score that was provided */
  decision_confidence: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL COMPONENT NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_SYNONYMS: Record<string, string> = {
  // Bumper variants
  "front bumper": "front bumper assembly",
  "front bumper bar": "front bumper assembly",
  "bumper cover": "front bumper assembly",
  "rear bumper": "rear bumper assembly",
  "rear bumper bar": "rear bumper assembly",
  "bumper": "front bumper assembly",

  // Bonnet/Hood
  "bonnet": "bonnet/hood",
  "hood": "bonnet/hood",

  // Boot/Trunk
  "boot": "boot/trunk lid",
  "trunk": "boot/trunk lid",
  "boot lid": "boot/trunk lid",
  "trunk lid": "boot/trunk lid",

  // Windscreen
  "windscreen": "windshield/windscreen",
  "windshield": "windshield/windscreen",
  "front glass": "windshield/windscreen",

  // Lights
  "headlight": "headlamp assembly",
  "headlamp": "headlamp assembly",
  "head light": "headlamp assembly",
  "tail light": "tail lamp assembly",
  "taillight": "tail lamp assembly",
  "tail lamp": "tail lamp assembly",
  "fog light": "fog lamp",
  "fog lamp": "fog lamp",

  // Grille
  "grille": "front grille",
  "grill": "front grille",
  "radiator grille": "front grille",

  // Radiator support
  "radiator support": "radiator support panel",
  "radiator support panel": "radiator support panel",
  "rad support": "radiator support panel",

  // Fender/Wing
  "fender": "front fender",
  "wing": "front fender",
  "front wing": "front fender",
  "rear fender": "rear quarter panel",
  "quarter panel": "rear quarter panel",

  // Doors
  "front door": "front door skin",
  "rear door": "rear door skin",
  "door skin": "front door skin",

  // Structural
  "chassis": "chassis/frame",
  "frame": "chassis/frame",
  "subframe": "front subframe",
  "front subframe": "front subframe",
  "sill": "sill panel",
  "rocker panel": "sill panel",

  // Suspension
  "control arm": "control arm",
  "lower control arm": "control arm",
  "upper control arm": "control arm",
  "strut": "suspension strut",
  "shock absorber": "suspension strut",

  // Airbag
  "airbag": "airbag module",
  "srs airbag": "airbag module",
  "airbag module": "airbag module",

  // Radiator/Cooling
  "radiator": "radiator",
  "condenser": "AC condenser",
  "intercooler": "intercooler",

  // Mirrors
  "mirror": "door mirror",
  "wing mirror": "door mirror",
  "side mirror": "door mirror",

  // Trim
  "moulding": "body moulding",
  "trim": "body trim",
  "garnish": "body trim",
};

/**
 * Normalise a component name to its canonical form.
 */
export function normaliseComponentName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return COMPONENT_SYNONYMS[lower] ?? lower;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL COMPONENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const STRUCTURAL_PATTERNS = [
  /chassis|frame/i,
  /subframe/i,
  /sill panel/i,
  /radiator support/i,
  /bumper bracket/i,
  /diff connector|differential connector/i,
  /cross member/i,
  /a.?pillar|b.?pillar|c.?pillar/i,
  /floor pan/i,
  /firewall/i,
  /suspension (tower|mount)/i,
];

export function isStructuralComponent(name: string): boolean {
  return STRUCTURAL_PATTERNS.some(p => p.test(name));
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT COST INDEX (relative, not market-priced)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base cost index for each canonical component category.
 * These are relative index values (not USD), used only for weighting.
 * They represent the typical cost contribution of each component class
 * relative to a moderate-severity repair job.
 *
 * RULE: These values are derived from validated claim outcomes only.
 * Market assumptions, catalogue prices, or AI estimates are NOT used.
 */
const COMPONENT_BASE_INDEX: Record<string, number> = {
  "airbag module": 60,
  "chassis/frame": 80,
  "front subframe": 70,
  "radiator support panel": 45,
  "sill panel": 40,
  "intercooler": 45,
  "radiator": 45,
  "AC condenser": 35,
  "bonnet/hood": 35,
  "boot/trunk lid": 35,
  "windshield/windscreen": 30,
  "front door skin": 40,
  "rear door skin": 40,
  "rear quarter panel": 40,
  "front fender": 20,
  "headlamp assembly": 25,
  "tail lamp assembly": 20,
  "front bumper assembly": 20,
  "rear bumper assembly": 20,
  "suspension strut": 35,
  "control arm": 30,
  "front grille": 12,
  "fog lamp": 10,
  "door mirror": 15,
  "body moulding": 8,
  "body trim": 8,
};

const SEVERITY_INDEX_MULTIPLIER: Record<string, number> = {
  cosmetic: 0.2,
  minor: 0.5,
  moderate: 1.0,
  severe: 1.6,
  catastrophic: 2.5,
};

const ACTION_INDEX_MULTIPLIER: Record<string, number> = {
  repair: 0.4,
  replace: 1.0,
  refinish: 0.2,
};

/**
 * Compute a relative cost index for a single component.
 * Returns a dimensionless number proportional to the expected cost contribution.
 */
function computeComponentIndex(
  canonicalName: string,
  severity: string,
  repairAction: string
): number {
  const base = COMPONENT_BASE_INDEX[canonicalName] ?? 15; // default: small trim item
  const sevMult = SEVERITY_INDEX_MULTIPLIER[severity] ?? 1.0;
  const actMult = ACTION_INDEX_MULTIPLIER[repairAction] ?? 1.0;
  return base * sevMult * actMult;
}

// ─────────────────────────────────────────────────────────────────────────────
// COST TIER DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the cost tier from a validated true_cost_usd.
 *
 * Thresholds (USD):
 *   low:    < 1,500
 *   medium: 1,500 – 5,000
 *   high:   > 5,000
 *
 * RULE: Only derived from validated true_cost_usd — never from raw quotes
 * or AI estimates.
 */
export function deriveCostTier(trueCostUsd: number): CostTier {
  if (trueCostUsd < 1500) return "low";
  if (trueCostUsd <= 5000) return "medium";
  return "high";
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE SIGNATURE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a short, deterministic, human-readable case descriptor.
 *
 * Format: {vehicleType}_{impact}_{severity}_{componentCount}c_{costTier}
 * Example: "pickup_frontal_severe_6c_high"
 *
 * Fields:
 *   vehicleType  — normalised body type (sedan, pickup, suv, etc.)
 *   impact       — collision direction (frontal, rear, side, rollover, etc.)
 *   severity     — accident_severity (minor, moderate, severe, total_loss)
 *   componentCount — number of damage components
 *   costTier     — low | medium | high (from deriveCostTier)
 */
export function generateCaseSignature(
  vehicleType: string,
  collisionDirection: string,
  accidentSeverity: AccidentSeverity,
  componentCount: number,
  costTier: CostTier
): string {
  const vType = (vehicleType || "vehicle")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const dir = (collisionDirection || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const sev = accidentSeverity.toLowerCase().replace(/[^a-z0-9]/g, "_");

  return `${vType}_${dir}_${sev}_${componentCount}c_${costTier}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATED-OUTCOMES-ONLY POLICY GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether a learning record should be stored based on the
 * validated-outcomes-only policy.
 *
 * RULES:
 *   - assessor_validated + any confidence → ACCEPT (assessor has reviewed)
 *   - system_optimised + confidence >= 60  → ACCEPT (high-confidence baseline)
 *   - system_optimised + confidence < 60   → REJECT (insufficient validation)
 *   - null cost_basis                      → REJECT (no cost signal)
 *   - null or zero true_cost_usd           → REJECT (no validated outcome)
 *
 * Returns null if the record should be stored, or a CostLearningRejection
 * describing why it was rejected.
 */
export function checkValidatedOutcomePolicy(
  trueCostUsd: number | null,
  costBasis: CostBasisType | null,
  decisionConfidence: number | null
): CostLearningRejection | null {
  if (!trueCostUsd || trueCostUsd <= 0) {
    return {
      rejection_reason: "No validated true cost available. Learning records require a positive true_cost_usd from the cost decision engine.",
      cost_basis: costBasis,
      decision_confidence: decisionConfidence,
    };
  }

  if (!costBasis) {
    return {
      rejection_reason: "No cost basis provided. Learning records require cost_basis from the cost decision engine.",
      cost_basis: null,
      decision_confidence: decisionConfidence,
    };
  }

  if (costBasis === "assessor_validated") {
    // Assessor-validated always passes — human review is the highest validation
    return null;
  }

  if (costBasis === "system_optimised") {
    const confidence = decisionConfidence ?? 0;
    if (confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
      return {
        rejection_reason: `System-optimised cost basis with confidence ${confidence}/100 is below the minimum threshold of ${MINIMUM_CONFIDENCE_THRESHOLD}. Record not stored to prevent low-quality patterns from entering the learning corpus.`,
        cost_basis: costBasis,
        decision_confidence: confidence,
      };
    }
    return null; // passes
  }

  return {
    rejection_reason: `Unknown cost_basis value: "${costBasis}". Record not stored.`,
    cost_basis: costBasis,
    decision_confidence: decisionConfidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RECORDER FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract cost intelligence signals from a processed claim.
 *
 * This function is called at the end of Stage 9 after all cost analysis
 * has been completed. It produces a CostLearningRecord that can be
 * persisted for longitudinal cost model calibration.
 *
 * VALIDATED-OUTCOMES-ONLY POLICY:
 *   Returns null (with rejection details) if the cost basis does not meet
 *   the validation threshold. The caller should log the rejection reason
 *   but NOT treat it as an error — it is expected behaviour for unvalidated claims.
 *
 * The function is pure (no side effects) — persistence is the caller's
 * responsibility.
 *
 * @returns { record: CostLearningRecord, rejection: null } on success
 * @returns { record: null, rejection: CostLearningRejection } when policy rejects
 */
export function extractCostLearningRecord(input: CostLearningInput): {
  record: CostLearningRecord | null;
  rejection: CostLearningRejection | null;
} {
  const {
    claimId,
    vehicleType,
    vehicleMake,
    vehicleModel,
    damageComponents,
    trueCostUsd: rawTrueCost,
    costBasis,
    decisionConfidence,
    accidentSeverity,
    selectedQuoteComponents,
    collisionDirection = "unknown",
    marketRegion = "DEFAULT",
    finalCostCents, // legacy compat
  } = input;

  // Resolve true cost — prefer trueCostUsd, fall back to finalCostCents for compat
  const resolvedTrueCostUsd: number | null =
    rawTrueCost !== null && rawTrueCost !== undefined
      ? rawTrueCost
      : (finalCostCents !== null && finalCostCents !== undefined && finalCostCents > 0)
        ? finalCostCents / 100
        : null;

  // ── Policy gate ────────────────────────────────────────────────────────────
  const rejection = checkValidatedOutcomePolicy(
    resolvedTrueCostUsd,
    costBasis ?? null,
    decisionConfidence ?? null
  );
  if (rejection) {
    return { record: null, rejection };
  }

  const trueCostUsd = resolvedTrueCostUsd!; // guaranteed non-null after policy gate

  const qualityFlags: string[] = [];

  // ── 1. Normalise component names ──────────────────────────────────────────
  const normalisedComponents = damageComponents.map(c => ({
    ...c,
    canonicalName: normaliseComponentName(c.name),
    repairAction: c.repairAction ?? (
      c.severity === "cosmetic" || c.severity === "minor" ? "repair" : "replace"
    ),
  }));

  if (normalisedComponents.length === 0) {
    qualityFlags.push("no_damage_components");
  }

  // ── 2. Compute per-component cost index ──────────────────────────────────
  const componentIndexes = normalisedComponents.map(c => ({
    canonicalName: c.canonicalName,
    severity: c.severity,
    repairAction: c.repairAction,
    index: computeComponentIndex(c.canonicalName, c.severity, c.repairAction),
    is_structural: isStructuralComponent(c.canonicalName),
  }));

  const totalIndex = componentIndexes.reduce((sum, c) => sum + c.index, 0);

  // ── 3. Compute relative weights ───────────────────────────────────────────
  const componentDetail: ComponentWeightEntry[] = componentIndexes.map(c => ({
    component: c.canonicalName,
    relative_weight: totalIndex > 0 ? Math.round((c.index / totalIndex) * 1000) / 1000 : 0,
    is_structural: c.is_structural,
    severity: c.severity,
    repair_action: c.repairAction,
  }));

  // Aggregate by canonical name (in case of duplicates)
  const weightMap: Record<string, number> = {};
  for (const entry of componentDetail) {
    weightMap[entry.component] = (weightMap[entry.component] ?? 0) + entry.relative_weight;
  }

  // ── 4. Identify high-cost drivers (≥15% of total) ────────────────────────
  const highCostDrivers = Object.entries(weightMap)
    .filter(([, w]) => w >= HIGH_COST_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .map(([name]) => name);

  if (highCostDrivers.length === 0 && normalisedComponents.length > 0) {
    // If no single component exceeds 15%, flag the top 2 as drivers
    const top2 = Object.entries(weightMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([name]) => name);
    highCostDrivers.push(...top2);
    qualityFlags.push("no_dominant_cost_driver");
  }

  // ── 5. Quote coverage ratio ───────────────────────────────────────────────
  const normalisedQuoteComponents = selectedQuoteComponents.map(normaliseComponentName);
  const damageNames = new Set(normalisedComponents.map(c => c.canonicalName));
  const matchedInQuote = normalisedQuoteComponents.filter(q => damageNames.has(q)).length;
  const quoteCoverageRatio = damageNames.size > 0
    ? Math.round((matchedInQuote / damageNames.size) * 100) / 100
    : 0;

  if (quoteCoverageRatio < 0.5 && selectedQuoteComponents.length > 0) {
    qualityFlags.push("low_quote_coverage");
  }
  if (selectedQuoteComponents.length === 0) {
    qualityFlags.push("no_quote_components");
  }

  // ── 6. Structural component count ─────────────────────────────────────────
  const structuralCount = componentDetail.filter(c => c.is_structural).length;
  if (structuralCount > 0) {
    qualityFlags.push(`structural_components_present:${structuralCount}`);
  }

  // ── 7. Cost tier (from validated true_cost_usd) ───────────────────────────
  const costTier = deriveCostTier(trueCostUsd);

  // ── 8. Vehicle descriptor ─────────────────────────────────────────────────
  const vehicleDescriptor = [vehicleMake, vehicleModel, vehicleType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim() || "unknown_vehicle";

  // ── 9. Case signature ─────────────────────────────────────────────────────
  const caseSignature = generateCaseSignature(
    vehicleType,
    collisionDirection,
    accidentSeverity,
    normalisedComponents.length,
    costTier
  );

  // ── 10. Validation quality flag ───────────────────────────────────────────
  if (costBasis === "assessor_validated") {
    qualityFlags.push("assessor_validated");
  } else {
    qualityFlags.push(`system_optimised_confidence:${decisionConfidence ?? "unknown"}`);
  }

  const record: CostLearningRecord = {
    claim_id: claimId,
    recorded_at: new Date().toISOString(),
    vehicle_descriptor: vehicleDescriptor,
    collision_direction: collisionDirection,
    market_region: marketRegion,
    high_cost_drivers: highCostDrivers,
    component_weighting: weightMap,
    component_detail: componentDetail,
    case_signature: caseSignature,
    cost_tier: costTier,
    component_count: normalisedComponents.length,
    true_cost_usd: trueCostUsd,
    cost_basis: costBasis,
    decision_confidence: decisionConfidence ?? null,
    accident_severity: accidentSeverity,
    cost_is_validated: true, // guaranteed by policy gate
    structural_component_count: structuralCount,
    quote_coverage_ratio: quoteCoverageRatio,
    quality_flags: qualityFlags,
    // Backward-compat aliases
    final_cost_usd: trueCostUsd,
    cost_is_agreed: costBasis === "assessor_validated",
  };

  return { record, rejection: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN AGGREGATION (for batch analytics)
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregatedCostPattern {
  /** Vehicle type group */
  vehicle_type: string;
  /** Collision direction group */
  collision_direction: string;
  /** Accident severity group */
  accident_severity: string;
  /** Cost tier group */
  cost_tier: CostTier | "mixed";
  /** Number of claims in this group */
  claim_count: number;
  /** Average true cost USD (validated outcomes only) */
  avg_true_cost_usd: number | null;
  /** Most frequent high-cost drivers across all claims in this group */
  top_cost_drivers: Array<{ component: string; frequency: number }>;
  /** Average component weighting across all claims in this group */
  avg_component_weighting: Record<string, number>;
}

/**
 * Aggregate multiple CostLearningRecords into a cost pattern summary.
 * Used for batch analytics and calibration reporting.
 *
 * Only records with cost_is_validated = true are included.
 */
export function aggregateCostPatterns(
  records: CostLearningRecord[]
): AggregatedCostPattern[] {
  if (records.length === 0) return [];

  // Filter to validated records only
  const validatedRecords = records.filter(r => r.cost_is_validated);
  if (validatedRecords.length === 0) return [];

  // Group by vehicle_type + collision_direction + accident_severity
  const groups = new Map<string, CostLearningRecord[]>();
  for (const r of validatedRecords) {
    const vType = r.vehicle_descriptor.split(" ")[2] ?? "unknown";
    const key = `${vType}::${r.collision_direction}::${r.accident_severity ?? "unknown"}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const patterns: AggregatedCostPattern[] = [];

  for (const [key, groupRecords] of Array.from(groups.entries()) as Array<[string, CostLearningRecord[]]>) {
    const [vehicleType, collisionDir, accidentSev] = key.split("::");

    // Average true cost
    const costsWithValues = groupRecords.filter((r: CostLearningRecord) => r.true_cost_usd !== null && r.true_cost_usd > 0);
    const avgCost = costsWithValues.length > 0
      ? costsWithValues.reduce((sum: number, r: CostLearningRecord) => sum + (r.true_cost_usd ?? 0), 0) / costsWithValues.length
      : null;

    // Dominant cost tier
    const tierCounts: Record<string, number> = {};
    for (const r of groupRecords) {
      tierCounts[r.cost_tier] = (tierCounts[r.cost_tier] ?? 0) + 1;
    }
    const dominantTier = Object.entries(tierCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as CostTier | undefined;
    const costTierGroup: CostTier | "mixed" = (
      Object.keys(tierCounts).length === 1 ? (dominantTier ?? "mixed") : "mixed"
    );

    // Top cost drivers by frequency
    const driverFreq: Record<string, number> = {};
    for (const r of groupRecords) {
      for (const driver of r.high_cost_drivers) {
        driverFreq[driver] = (driverFreq[driver] ?? 0) + 1;
      }
    }
    const topDrivers = Object.entries(driverFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([component, frequency]) => ({ component, frequency }));

    // Average component weighting
    const allComponentNames: string[] = groupRecords.flatMap((r: CostLearningRecord) => Object.keys(r.component_weighting));
    const allComponents = new Set<string>(allComponentNames);
    const avgWeighting: Record<string, number> = {};
    for (const comp of Array.from(allComponents) as string[]) {
      const weights: number[] = groupRecords
        .filter((r: CostLearningRecord) => comp in r.component_weighting)
        .map((r: CostLearningRecord) => r.component_weighting[comp]);
      if (weights.length > 0) {
        avgWeighting[comp] = Math.round(
          (weights.reduce((s: number, w: number) => s + w, 0) / weights.length) * 1000
        ) / 1000;
      }
    }

    patterns.push({
      vehicle_type: vehicleType,
      collision_direction: collisionDir,
      accident_severity: accidentSev,
      cost_tier: costTierGroup,
      claim_count: groupRecords.length,
      avg_true_cost_usd: avgCost !== null ? Math.round(avgCost * 100) / 100 : null,
      top_cost_drivers: topDrivers,
      avg_component_weighting: avgWeighting,
    });
  }

  return patterns.sort((a, b) => b.claim_count - a.claim_count);
}
