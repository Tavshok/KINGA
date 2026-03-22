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
 *   - vehicle_type       (body type + make/model)
 *   - damage_components  (from Stage 6 damage analysis)
 *   - final_cost         (agreed/quoted cost in USD cents)
 *   - selected_quote_components (from Stage 3 input recovery)
 *
 * OUTPUT:
 *   {
 *     high_cost_drivers:    string[]
 *     component_weighting:  Record<string, number>   // relative 0–1
 *     case_signature:       string                   // short descriptor
 *   }
 *
 * Design principles:
 *   - Relative weights only — no exact cost figures stored in the pattern record
 *   - Component names are normalised to canonical form before storage
 *   - Structural components are flagged and weighted separately
 *   - The case_signature is a deterministic, human-readable descriptor
 *   - All outputs use professional insurance language — no AI/model terminology
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface LearningInputComponent {
  /** Component name as extracted by Stage 6 */
  name: string;
  /** Damage severity */
  severity: "cosmetic" | "minor" | "moderate" | "severe" | "catastrophic";
  /** Repair action recommended */
  repairAction?: "repair" | "replace" | "refinish";
  /** AI-estimated cost in USD cents */
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
  /** Final agreed/quoted cost in USD cents (null if not available) */
  finalCostCents: number | null;
  /** Quote component names from Stage 3 input recovery */
  selectedQuoteComponents: string[];
  /** Collision direction for case signature */
  collisionDirection?: string;
  /** Market region */
  marketRegion?: string;
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
  /** Short human-readable case descriptor */
  case_signature: string;
  /** Number of damage components */
  component_count: number;
  /** Final cost in USD (null if not available) */
  final_cost_usd: number | null;
  /** Whether final cost was from an assessor-agreed figure */
  cost_is_agreed: boolean;
  /** Structural component count */
  structural_component_count: number;
  /** Coverage ratio: quote components / damage components */
  quote_coverage_ratio: number;
  /** Data quality flags */
  quality_flags: string[];
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
// COMPONENT COST ESTIMATION (relative, not market-priced)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base cost index for each canonical component category.
 * These are relative index values (not USD), used only for weighting.
 * They represent the typical cost contribution of each component class
 * relative to a moderate-severity repair job.
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
// CASE SIGNATURE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a short, deterministic, human-readable case descriptor.
 * Format: {vehicle_class}_{direction}_{severity_tier}_{component_count}c
 * Example: "pickup_rear_moderate_8c"
 */
export function generateCaseSignature(
  vehicleType: string,
  collisionDirection: string,
  components: LearningInputComponent[],
  finalCostCents: number | null
): string {
  const vType = (vehicleType || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");
  const dir = (collisionDirection || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Determine severity tier from component severities
  const severities = components.map(c => c.severity);
  let tier = "cosmetic";
  if (severities.some(s => s === "catastrophic")) tier = "catastrophic";
  else if (severities.some(s => s === "severe")) tier = "severe";
  else if (severities.some(s => s === "moderate")) tier = "moderate";
  else if (severities.some(s => s === "minor")) tier = "minor";

  const count = components.length;
  const costTier = finalCostCents === null ? "no_cost"
    : finalCostCents < 50000 ? "low"        // < $500
    : finalCostCents < 200000 ? "medium"    // $500 – $2,000
    : finalCostCents < 500000 ? "high"      // $2,000 – $5,000
    : "major";                               // > $5,000

  return `${vType}_${dir}_${tier}_${count}c_${costTier}`;
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
 * The function is pure (no side effects) — persistence is the caller's
 * responsibility.
 */
export function extractCostLearningRecord(input: CostLearningInput): CostLearningRecord {
  const {
    claimId,
    vehicleType,
    vehicleMake,
    vehicleModel,
    damageComponents,
    finalCostCents,
    selectedQuoteComponents,
    collisionDirection = "unknown",
    marketRegion = "DEFAULT",
  } = input;

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
  const HIGH_COST_THRESHOLD = 0.15;
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

  // ── 6. Cost availability flags ────────────────────────────────────────────
  const costIsAgreed = finalCostCents !== null && finalCostCents > 0;
  if (!costIsAgreed) {
    qualityFlags.push("no_final_cost");
  }

  // ── 7. Structural component count ─────────────────────────────────────────
  const structuralCount = componentDetail.filter(c => c.is_structural).length;
  if (structuralCount > 0) {
    qualityFlags.push(`structural_components_present:${structuralCount}`);
  }

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
    damageComponents,
    finalCostCents
  );

  return {
    claim_id: claimId,
    recorded_at: new Date().toISOString(),
    vehicle_descriptor: vehicleDescriptor,
    collision_direction: collisionDirection,
    market_region: marketRegion,
    high_cost_drivers: highCostDrivers,
    component_weighting: weightMap,
    component_detail: componentDetail,
    case_signature: caseSignature,
    component_count: normalisedComponents.length,
    final_cost_usd: finalCostCents !== null ? finalCostCents / 100 : null,
    cost_is_agreed: costIsAgreed,
    structural_component_count: structuralCount,
    quote_coverage_ratio: quoteCoverageRatio,
    quality_flags: qualityFlags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN AGGREGATION (for batch analytics)
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregatedCostPattern {
  /** Vehicle type group */
  vehicle_type: string;
  /** Collision direction group */
  collision_direction: string;
  /** Number of claims in this group */
  claim_count: number;
  /** Average final cost USD */
  avg_cost_usd: number | null;
  /** Most frequent high-cost drivers across all claims in this group */
  top_cost_drivers: Array<{ component: string; frequency: number }>;
  /** Average component weighting across all claims in this group */
  avg_component_weighting: Record<string, number>;
}

/**
 * Aggregate multiple CostLearningRecords into a cost pattern summary.
 * Used for batch analytics and model calibration reporting.
 */
export function aggregateCostPatterns(
  records: CostLearningRecord[]
): AggregatedCostPattern[] {
  if (records.length === 0) return [];

  // Group by vehicle_type + collision_direction
  const groups = new Map<string, CostLearningRecord[]>();
  for (const r of records) {
    const key = `${r.vehicle_descriptor.split(" ")[2] ?? "unknown"}::${r.collision_direction}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const patterns: AggregatedCostPattern[] = [];

  for (const [key, groupRecords] of Array.from(groups.entries())) {
    const [vehicleType, collisionDir] = key.split("::");

    // Average cost
    const costsWithValues = groupRecords.filter((r: CostLearningRecord) => r.final_cost_usd !== null);
    const avgCost = costsWithValues.length > 0
      ? costsWithValues.reduce((sum: number, r: CostLearningRecord) => sum + (r.final_cost_usd ?? 0), 0) / costsWithValues.length
      : null;

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
    const allComponents = new Set<string>(groupRecords.flatMap((r: CostLearningRecord) => Object.keys(r.component_weighting)));
    const avgWeighting: Record<string, number> = {};
    for (const comp of Array.from(allComponents)) {
      const weights = groupRecords
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
      claim_count: groupRecords.length,
      avg_cost_usd: avgCost !== null ? Math.round(avgCost * 100) / 100 : null,
      top_cost_drivers: topDrivers,
      avg_component_weighting: avgWeighting,
    });
  }

  return patterns.sort((a, b) => b.claim_count - a.claim_count);
}
