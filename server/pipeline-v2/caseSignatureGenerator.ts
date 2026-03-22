/**
 * Case Signature Generator
 * ========================
 * Creates a standardised, consistent case signature and grouping key for each
 * claim processed by the KINGA pipeline.
 *
 * Format:  {vehicle}_{scenario}_{impact}_{severity}_{components}c_{costTier}
 * Example: pickup_animal_frontal_severe_8c_high
 *
 * Rules
 * -----
 * - All tokens are lowercase, underscore-separated.
 * - No abbreviations that lose meaning (e.g. "frontal" not "frt").
 * - component_count is always suffixed with "c" (e.g. "8c", "0c").
 * - grouping_key omits component_count and cost_tier so similar incidents
 *   cluster together regardless of repair scope or price.
 * - Unknown / null inputs are normalised to "unknown" rather than omitted,
 *   so signatures are always the same length and parseable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VehicleType =
  | "sedan"
  | "hatchback"
  | "suv"
  | "pickup"
  | "ute"
  | "van"
  | "truck"
  | "motorcycle"
  | "bus"
  | "trailer"
  | "unknown";

export type ScenarioType =
  | "animal"
  | "collision"
  | "theft"
  | "fire"
  | "flood"
  | "vandalism"
  | "windscreen"
  | "cosmetic"
  | "weather"
  | "unknown";

export type ImpactDirection =
  | "frontal"
  | "rear"
  | "side"
  | "rollover"
  | "undercarriage"
  | "roof"
  | "multiple"
  | "unknown";

export type SeverityLevel =
  | "none"
  | "cosmetic"
  | "minor"
  | "moderate"
  | "severe"
  | "catastrophic"
  | "unknown";

export type CostTier = "low" | "medium" | "high" | "total_loss" | "unknown";

export interface CaseSignatureInput {
  /** Vehicle body type (e.g. "pickup", "sedan", "suv") */
  vehicle_type: string | null | undefined;
  /** Incident scenario (e.g. "animal_strike", "vehicle_collision") */
  scenario_type: string | null | undefined;
  /** Primary impact direction (e.g. "frontal", "rear", "side") */
  impact_direction: string | null | undefined;
  /** Final severity level (e.g. "severe", "moderate") */
  severity: string | null | undefined;
  /** Number of damaged components identified */
  component_count: number | null | undefined;
  /** Cost tier derived from repair cost vs market value */
  cost_tier: string | null | undefined;
}

export interface CaseSignatureOutput {
  /** Full signature: {vehicle}_{scenario}_{impact}_{severity}_{components}c_{costTier} */
  case_signature: string;
  /**
   * Grouping key: {vehicle}_{scenario}_{impact}_{severity}
   * Omits component_count and cost_tier so similar incidents cluster together.
   */
  grouping_key: string;
  /** Individual normalised tokens for downstream use */
  tokens: {
    vehicle: VehicleType;
    scenario: ScenarioType;
    impact: ImpactDirection;
    severity: SeverityLevel;
    component_count: number;
    cost_tier: CostTier;
  };
}

// ─── Normalisation maps ───────────────────────────────────────────────────────

const VEHICLE_MAP: Record<string, VehicleType> = {
  // Pickup / ute variants
  pickup: "pickup",
  "pick-up": "pickup",
  "pick up": "pickup",
  ute: "ute",
  utility: "ute",
  "utility vehicle": "ute",
  // SUV / 4WD
  suv: "suv",
  "4wd": "suv",
  "4x4": "suv",
  crossover: "suv",
  wagon: "suv",
  "station wagon": "suv",
  // Sedan
  sedan: "sedan",
  saloon: "sedan",
  // Hatchback
  hatchback: "hatchback",
  hatch: "hatchback",
  // Van
  van: "van",
  minivan: "van",
  "people mover": "van",
  mpv: "van",
  // Truck
  truck: "truck",
  lorry: "truck",
  "semi-truck": "truck",
  "heavy vehicle": "truck",
  // Motorcycle
  motorcycle: "motorcycle",
  motorbike: "motorcycle",
  bike: "motorcycle",
  scooter: "motorcycle",
  moped: "motorcycle",
  // Bus
  bus: "bus",
  coach: "bus",
  minibus: "bus",
  // Trailer
  trailer: "trailer",
  caravan: "trailer",
};

const SCENARIO_MAP: Record<string, ScenarioType> = {
  // Animal strike
  animal: "animal",
  "animal strike": "animal",
  "animal_strike": "animal",
  "animal collision": "animal",
  "wildlife strike": "animal",
  "cattle strike": "animal",
  "kangaroo strike": "animal",
  "bird strike": "animal",
  // Collision
  collision: "collision",
  "vehicle collision": "collision",
  "vehicle_collision": "collision",
  "motor vehicle accident": "collision",
  mva: "collision",
  "car accident": "collision",
  crash: "collision",
  // Theft
  theft: "theft",
  "vehicle theft": "theft",
  stolen: "theft",
  "theft attempt": "theft",
  "attempted theft": "theft",
  // Fire
  fire: "fire",
  "vehicle fire": "fire",
  arson: "fire",
  "engine fire": "fire",
  // Flood
  flood: "flood",
  flooding: "flood",
  "water damage": "flood",
  "flood damage": "flood",
  inundation: "flood",
  // Vandalism
  vandalism: "vandalism",
  "malicious damage": "vandalism",
  "intentional damage": "vandalism",
  graffiti: "vandalism",
  // Windscreen
  windscreen: "windscreen",
  "windscreen damage": "windscreen",
  "glass damage": "windscreen",
  "stone chip": "windscreen",
  "crack repair": "windscreen",
  // Cosmetic
  cosmetic: "cosmetic",
  "cosmetic damage": "cosmetic",
  "scratch and dent": "cosmetic",
  "minor damage": "cosmetic",
  // Weather
  weather: "weather",
  "weather event": "weather",
  "weather_event": "weather",
  hail: "weather",
  "hail damage": "weather",
  storm: "weather",
  "storm damage": "weather",
  cyclone: "weather",
  tornado: "weather",
};

const IMPACT_MAP: Record<string, ImpactDirection> = {
  // Frontal
  frontal: "frontal",
  front: "frontal",
  "head-on": "frontal",
  "head on": "frontal",
  "front-end": "frontal",
  "front end": "frontal",
  forward: "frontal",
  // Rear
  rear: "rear",
  "rear-end": "rear",
  "rear end": "rear",
  back: "rear",
  "from behind": "rear",
  // Side
  side: "side",
  "side-on": "side",
  lateral: "side",
  "t-bone": "side",
  "t bone": "side",
  broadside: "side",
  // Rollover
  rollover: "rollover",
  "roll over": "rollover",
  rolled: "rollover",
  // Undercarriage
  undercarriage: "undercarriage",
  underbody: "undercarriage",
  underneath: "undercarriage",
  bottom: "undercarriage",
  // Roof
  roof: "roof",
  "roof damage": "roof",
  overhead: "roof",
  top: "roof",
  // Multiple
  multiple: "multiple",
  "multiple impacts": "multiple",
  "multi-point": "multiple",
  "all-round": "multiple",
  // Not applicable (non-collision scenarios)
  "not applicable": "unknown",
  n_a: "unknown",
  "n/a": "unknown",
  none: "unknown",
};

const SEVERITY_MAP: Record<string, SeverityLevel> = {
  none: "none",
  "no damage": "none",
  undamaged: "none",
  cosmetic: "cosmetic",
  "cosmetic damage": "cosmetic",
  "paint only": "cosmetic",
  minor: "minor",
  "minor damage": "minor",
  light: "minor",
  low: "minor",
  moderate: "moderate",
  "moderate damage": "moderate",
  medium: "moderate",
  significant: "moderate",
  severe: "severe",
  "severe damage": "severe",
  major: "severe",
  heavy: "severe",
  high: "severe",
  catastrophic: "catastrophic",
  "total loss": "catastrophic",
  "write-off": "catastrophic",
  "write off": "catastrophic",
  destroyed: "catastrophic",
};

const COST_TIER_MAP: Record<string, CostTier> = {
  low: "low",
  minor: "low",
  small: "low",
  medium: "medium",
  moderate: "medium",
  mid: "medium",
  high: "high",
  major: "high",
  large: "high",
  "total loss": "total_loss",
  "total_loss": "total_loss",
  "write-off": "total_loss",
  "write off": "total_loss",
  totalled: "total_loss",
};

// ─── Normalisation helpers ────────────────────────────────────────────────────

function normaliseToken(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function normaliseVehicle(raw: string | null | undefined): VehicleType {
  if (raw == null) return "unknown";
  const key = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  // Direct map lookup
  if (VEHICLE_MAP[key]) return VEHICLE_MAP[key];
  // Fallback: try each word in the string (e.g. "Mazda BT-50 Pickup" → try "pickup")
  const words = key.split(/\s+/);
  for (const word of words) {
    if (VEHICLE_MAP[word]) return VEHICLE_MAP[word];
  }
  // Fallback: try last word (most specific)
  const lastWord = words[words.length - 1];
  if (VEHICLE_MAP[lastWord]) return VEHICLE_MAP[lastWord];
  return "unknown";
}

function normaliseScenario(raw: string | null | undefined): ScenarioType {
  if (raw == null) return "unknown";
  const key = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  return SCENARIO_MAP[key] ?? "unknown";
}

function normaliseImpact(raw: string | null | undefined): ImpactDirection {
  if (raw == null) return "unknown";
  const key = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  return IMPACT_MAP[key] ?? "unknown";
}

function normaliseSeverity(raw: string | null | undefined): SeverityLevel {
  if (raw == null) return "unknown";
  const key = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  return SEVERITY_MAP[key] ?? "unknown";
}

function normaliseCostTier(raw: string | null | undefined): CostTier {
  if (raw == null) return "unknown";
  const key = raw.trim().toLowerCase().replace(/[-_]+/g, " ");
  return COST_TIER_MAP[key] ?? "unknown";
}

function normaliseComponentCount(raw: number | null | undefined): number {
  if (raw == null || isNaN(raw) || raw < 0) return 0;
  return Math.round(raw);
}

// ─── Cost tier inference from numeric cost ────────────────────────────────────

/**
 * Infer cost tier from a numeric repair cost (USD) when no explicit tier is given.
 * Thresholds are based on typical motor vehicle repair cost distributions.
 */
export function inferCostTier(repairCostUsd: number, marketValueUsd?: number): CostTier {
  if (marketValueUsd != null && marketValueUsd > 0) {
    const ratio = repairCostUsd / marketValueUsd;
    if (ratio >= 0.75) return "total_loss";
    if (ratio >= 0.40) return "high";
    if (ratio >= 0.15) return "medium";
    return "low";
  }
  // Fallback: absolute thresholds (USD)
  if (repairCostUsd >= 15000) return "total_loss";
  if (repairCostUsd >= 5000) return "high";
  if (repairCostUsd >= 1500) return "medium";
  return "low";
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Generate a standardised case signature and grouping key for a claim.
 *
 * @example
 * generateCaseSignature({
 *   vehicle_type: "Mazda BT-50 Pickup",
 *   scenario_type: "animal_strike",
 *   impact_direction: "frontal",
 *   severity: "severe",
 *   component_count: 8,
 *   cost_tier: "high"
 * })
 * // → { case_signature: "pickup_animal_frontal_severe_8c_high", grouping_key: "pickup_animal_frontal_severe" }
 */
export function generateCaseSignature(input: CaseSignatureInput): CaseSignatureOutput {
  const vehicle = normaliseVehicle(input.vehicle_type);
  const scenario = normaliseScenario(input.scenario_type);
  const impact = normaliseImpact(input.impact_direction);
  const severity = normaliseSeverity(input.severity);
  const componentCount = normaliseComponentCount(input.component_count);
  const costTier = normaliseCostTier(input.cost_tier);

  const case_signature = [
    vehicle,
    scenario,
    impact,
    severity,
    `${componentCount}c`,
    costTier,
  ].join("_");

  // Grouping key: vehicle + scenario + impact + severity (no count or cost)
  const grouping_key = [vehicle, scenario, impact, severity].join("_");

  return {
    case_signature,
    grouping_key,
    tokens: {
      vehicle,
      scenario,
      impact,
      severity,
      component_count: componentCount,
      cost_tier: costTier,
    },
  };
}

// ─── Signature parser ─────────────────────────────────────────────────────────

/**
 * Parse a case_signature string back into its component tokens.
 * Returns null if the signature does not match the expected format.
 *
 * @example
 * parseCaseSignature("pickup_animal_frontal_severe_8c_high")
 * // → { vehicle: "pickup", scenario: "animal", impact: "frontal",
 * //      severity: "severe", component_count: 8, cost_tier: "high" }
 */
export function parseCaseSignature(signature: string): CaseSignatureOutput["tokens"] | null {
  if (!signature) return null;

  // Split on underscore — last two tokens are always "{n}c" and cost_tier
  // The rest may contain underscores (e.g. "total_loss") so we parse from the right.
  const parts = signature.split("_");
  if (parts.length < 6) return null;

  const costTierRaw = parts[parts.length - 1];
  const componentRaw = parts[parts.length - 2]; // e.g. "8c"
  const severityRaw = parts[parts.length - 3];
  const impactRaw = parts[parts.length - 4];
  const scenarioRaw = parts[parts.length - 5];
  const vehicleRaw = parts.slice(0, parts.length - 5).join("_");

  if (!componentRaw.endsWith("c")) return null;
  const componentCount = parseInt(componentRaw.slice(0, -1), 10);
  if (isNaN(componentCount)) return null;

  return {
    vehicle: vehicleRaw as VehicleType,
    scenario: scenarioRaw as ScenarioType,
    impact: impactRaw as ImpactDirection,
    severity: severityRaw as SeverityLevel,
    component_count: componentCount,
    cost_tier: costTierRaw as CostTier,
  };
}

// ─── Batch generator ──────────────────────────────────────────────────────────

/**
 * Generate signatures for multiple claims in one call.
 */
export function generateBatchSignatures(
  inputs: CaseSignatureInput[]
): CaseSignatureOutput[] {
  return inputs.map(generateCaseSignature);
}

// ─── Similarity check ─────────────────────────────────────────────────────────

/**
 * Check if two claims share the same grouping_key (i.e. same vehicle type,
 * scenario, impact direction, and severity — regardless of component count
 * or cost tier).
 */
export function areSimilarCases(
  a: CaseSignatureOutput,
  b: CaseSignatureOutput
): boolean {
  return a.grouping_key === b.grouping_key;
}
