/**
 * pipeline-v2/damagePatternValidationEngine.ts
 *
 * DAMAGE PATTERN VALIDATION ENGINE
 *
 * Verifies whether observed damage components and image-detected zones are
 * consistent with the expected damage pattern for a given incident scenario.
 *
 * Design principles:
 *   - Every incident type has a defined expected damage pattern (primary + secondary components).
 *   - Structural components carry higher weight — their presence or absence significantly
 *     affects severity and confidence.
 *   - Image-detected zones are cross-referenced against the expected impact direction.
 *   - If images contradict the claimed damage, pattern_match is downgraded to WEAK or NONE.
 *   - The engine never blocks the pipeline — it produces a validation result that downstream
 *     stages can use to adjust confidence and flag anomalies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type PatternMatchStrength = "STRONG" | "MODERATE" | "WEAK" | "NONE";

export type ScenarioType =
  | "animal_strike"
  | "vehicle_collision"
  | "theft"
  | "fire"
  | "flood"
  | "vandalism"
  | "windscreen"
  | "cosmetic"
  | "weather_event"
  | "unknown";

export type ImpactDirection =
  | "frontal"
  | "rear"
  | "side_driver"
  | "side_passenger"
  | "rollover"
  | "multi_impact"
  | "top"
  | "undercarriage"
  | "unknown";

export interface DamagePatternInput {
  scenario_type: ScenarioType;
  damage_components: string[];
  /** Zones detected from image analysis (e.g. ["front_bumper", "hood", "radiator"]) */
  image_detected_zones?: string[];
  impact_direction: ImpactDirection;
  /** Vehicle type for pattern calibration */
  vehicle_type?: string;
}

export interface DamagePatternOutput {
  pattern_match: PatternMatchStrength;
  missing_expected_components: string[];
  unexpected_components: string[];
  structural_damage_detected: boolean;
  confidence: number;
  reasoning: string;
  /** Internal detail for audit trail */
  validation_detail: {
    expected_primary: string[];
    expected_secondary: string[];
    matched_primary: string[];
    matched_secondary: string[];
    structural_components_found: string[];
    image_contradiction: boolean;
    image_contradiction_reason?: string;
    primary_coverage_pct: number;
    secondary_coverage_pct: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL COMPONENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const STRUCTURAL_COMPONENTS = new Set([
  "radiator support",
  "radiator support panel",
  "inner frame",
  "frame rail",
  "chassis",
  "chassis rail",
  "a-pillar",
  "b-pillar",
  "c-pillar",
  "firewall",
  "floor pan",
  "rocker panel",
  "strut tower",
  "engine cradle",
  "subframe",
  "cross member",
  "crumple zone",
  "sill",
  "door sill",
  "bull bar mounting",
  "intercooler mounting",
]);

function isStructural(component: string): boolean {
  const c = component.toLowerCase();
  for (const s of STRUCTURAL_COMPONENTS) {
    if (c.includes(s)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO PATTERN LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

interface ScenarioPattern {
  /** Components that MUST be present for a strong match */
  primary: string[];
  /** Components that SHOULD be present for a complete match */
  secondary: string[];
  /** Expected image zones for this scenario */
  expected_image_zones: string[];
  /** Expected impact directions for this scenario */
  expected_impact_directions: ImpactDirection[];
  /** Whether structural damage is typical for this scenario */
  structural_expected: boolean;
  /** Minimum primary coverage % for STRONG match */
  strong_threshold: number;
  /** Minimum primary coverage % for MODERATE match */
  moderate_threshold: number;
}

const SCENARIO_PATTERNS: Record<ScenarioType, ScenarioPattern> = {
  animal_strike: {
    primary: [
      "front bumper",
      "bonnet",
      "hood",
      "radiator",
      "grille",
      "headlamp",
      "headlight",
    ],
    secondary: [
      "radiator support",
      "radiator support panel",
      "bull bar",
      "bumper bar",
      "intercooler",
      "fan cowling",
      "fender",
      "wing",
      "windscreen",
      "wiper",
      "a-pillar",
    ],
    expected_image_zones: ["front", "front_bumper", "hood", "bonnet", "grille", "radiator", "headlamp"],
    expected_impact_directions: ["frontal", "unknown"],
    structural_expected: true,
    strong_threshold: 0.6,
    moderate_threshold: 0.35,
  },

  vehicle_collision: {
    primary: [
      "bumper",
      "fender",
      "wing",
      "door",
      "quarter panel",
    ],
    secondary: [
      "airbag",
      "radiator",
      "headlamp",
      "taillight",
      "boot lid",
      "bonnet",
      "hood",
      "frame rail",
      "radiator support",
      "crumple zone",
    ],
    expected_image_zones: ["front", "rear", "side", "bumper", "fender", "door"],
    expected_impact_directions: ["frontal", "rear", "side_driver", "side_passenger", "multi_impact"],
    structural_expected: true,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  theft: {
    primary: [
      "door lock",
      "ignition",
      "window",
      "steering column",
    ],
    secondary: [
      "dashboard",
      "wiring",
      "catalytic converter",
      "wheels",
      "tyres",
      "radio",
      "navigation system",
      "airbag",
      "battery",
    ],
    expected_image_zones: ["interior", "door", "window", "ignition", "dashboard"],
    expected_impact_directions: ["unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  fire: {
    primary: [
      "engine bay",
      "wiring harness",
      "fuel system",
    ],
    secondary: [
      "dashboard",
      "interior",
      "seats",
      "bonnet",
      "hood",
      "tyres",
      "battery",
      "exhaust",
    ],
    expected_image_zones: ["engine_bay", "interior", "bonnet", "wiring"],
    expected_impact_directions: ["unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  flood: {
    primary: [
      "interior",
      "carpet",
      "electrical",
      "wiring",
    ],
    secondary: [
      "engine",
      "transmission",
      "exhaust",
      "brakes",
      "seats",
      "dashboard",
      "door seals",
    ],
    expected_image_zones: ["interior", "carpet", "door_sill", "engine_bay"],
    expected_impact_directions: ["undercarriage", "unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  vandalism: {
    primary: [
      "paint",
      "window",
      "windscreen",
      "tyre",
    ],
    secondary: [
      "mirror",
      "antenna",
      "door handle",
      "wiper",
      "headlamp",
      "taillight",
      "body panel",
    ],
    expected_image_zones: ["paint", "window", "exterior", "door", "mirror"],
    expected_impact_directions: ["unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  windscreen: {
    primary: [
      "windscreen",
      "windshield",
    ],
    secondary: [
      "wiper",
      "a-pillar",
      "rear window",
      "side window",
    ],
    expected_image_zones: ["windscreen", "windshield", "glass"],
    expected_impact_directions: ["frontal", "unknown"],
    structural_expected: false,
    strong_threshold: 0.8,
    moderate_threshold: 0.5,
  },

  cosmetic: {
    primary: [
      "paint",
      "scratch",
      "scuff",
      "dent",
    ],
    secondary: [
      "bumper",
      "door",
      "fender",
      "wing",
      "mirror",
      "body panel",
    ],
    expected_image_zones: ["paint", "exterior", "door", "bumper", "fender"],
    expected_impact_directions: ["unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  weather_event: {
    primary: [
      "roof",
      "bonnet",
      "hood",
      "boot lid",
    ],
    secondary: [
      "windscreen",
      "window",
      "mirror",
      "fender",
      "wing",
      "door",
      "paint",
    ],
    expected_image_zones: ["roof", "bonnet", "hood", "exterior"],
    expected_impact_directions: ["top", "unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },

  unknown: {
    primary: [],
    secondary: [],
    expected_image_zones: [],
    expected_impact_directions: ["unknown"],
    structural_expected: false,
    strong_threshold: 0.5,
    moderate_threshold: 0.25,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Returns true if the observed component matches any of the pattern keywords.
 * Uses substring matching to handle variations (e.g. "front bumper assembly" → "bumper").
 */
function matchesPattern(observed: string, patternKeywords: string[]): boolean {
  const obs = normalise(observed);
  return patternKeywords.some(k => obs.includes(normalise(k)) || normalise(k).includes(obs));
}

/**
 * Find which pattern keywords are matched by the observed components.
 */
function findMatched(observed: string[], patternKeywords: string[]): string[] {
  const matched: string[] = [];
  for (const keyword of patternKeywords) {
    if (observed.some(o => matchesPattern(o, [keyword]))) {
      matched.push(keyword);
    }
  }
  return matched;
}

/**
 * Find observed components that do not match any expected pattern keyword.
 */
function findUnexpected(observed: string[], primary: string[], secondary: string[]): string[] {
  const allExpected = [...primary, ...secondary];
  return observed.filter(o => !matchesPattern(o, allExpected));
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE CONTRADICTION DETECTION
// ─────────────────────────────────────────────────────────────────────────────

interface ImageContradictionResult {
  contradiction: boolean;
  reason?: string;
}

function detectImageContradiction(
  scenario: ScenarioType,
  imageZones: string[],
  impactDirection: ImpactDirection,
  pattern: ScenarioPattern
): ImageContradictionResult {
  if (!imageZones || imageZones.length === 0) {
    return { contradiction: false };
  }

  const normZones = imageZones.map(normalise);

  // Check 1: Impact direction contradiction
  // If images show rear damage but claim says frontal animal strike → contradiction
  if (scenario === "animal_strike") {
    const hasRearDamage = normZones.some(z => z.includes("rear") || z.includes("boot") || z.includes("trunk"));
    const hasFrontalDamage = normZones.some(z =>
      z.includes("front") || z.includes("bonnet") || z.includes("hood") ||
      z.includes("bumper") || z.includes("grille") || z.includes("radiator")
    );
    if (hasRearDamage && !hasFrontalDamage) {
      return {
        contradiction: true,
        reason: "Image zones show rear damage only — inconsistent with frontal animal strike pattern.",
      };
    }
  }

  // Check 2: Fire claim but images show only exterior paint damage
  if (scenario === "fire") {
    const hasFireDamage = normZones.some(z =>
      z.includes("engine") || z.includes("interior") || z.includes("burn") || z.includes("char")
    );
    const hasOnlyExterior = normZones.every(z =>
      z.includes("paint") || z.includes("exterior") || z.includes("scratch")
    );
    if (hasOnlyExterior && !hasFireDamage) {
      return {
        contradiction: true,
        reason: "Image zones show only exterior paint damage — inconsistent with fire damage claim.",
      };
    }
  }

  // Check 3: Flood claim but images show only collision damage
  if (scenario === "flood") {
    const hasFloodDamage = normZones.some(z =>
      z.includes("interior") || z.includes("carpet") || z.includes("water") || z.includes("electrical")
    );
    const hasCollisionDamage = normZones.some(z =>
      z.includes("front") || z.includes("bumper") || z.includes("crumple")
    );
    if (hasCollisionDamage && !hasFloodDamage) {
      return {
        contradiction: true,
        reason: "Image zones show collision-type damage — inconsistent with flood damage claim.",
      };
    }
  }

  // Check 4: Expected zone coverage — if images show zones that contradict the scenario
  const expectedZones = pattern.expected_image_zones;
  if (expectedZones.length > 0) {
    const matchedExpectedZones = normZones.filter(z =>
      expectedZones.some(e => z.includes(normalise(e)) || normalise(e).includes(z))
    );
    const coverageRatio = matchedExpectedZones.length / Math.max(normZones.length, 1);
    // If less than 20% of image zones match expected zones → possible contradiction
    if (normZones.length >= 3 && coverageRatio < 0.2) {
      return {
        contradiction: true,
        reason: `Image zones (${normZones.slice(0, 3).join(", ")}) show minimal overlap with expected zones for ${scenario} scenario.`,
      };
    }
  }

  return { contradiction: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function validateDamagePattern(input: DamagePatternInput): DamagePatternOutput {
  const { scenario_type, damage_components, image_detected_zones, impact_direction } = input;

  // Handle unknown scenario
  if (scenario_type === "unknown" || !damage_components || damage_components.length === 0) {
    return {
      pattern_match: "NONE",
      missing_expected_components: [],
      unexpected_components: [],
      structural_damage_detected: false,
      confidence: 0,
      reasoning: "Scenario type is unknown or no damage components were provided. Pattern validation cannot proceed.",
      validation_detail: {
        expected_primary: [],
        expected_secondary: [],
        matched_primary: [],
        matched_secondary: [],
        structural_components_found: [],
        image_contradiction: false,
        primary_coverage_pct: 0,
        secondary_coverage_pct: 0,
      },
    };
  }

  const pattern = SCENARIO_PATTERNS[scenario_type];
  const normComponents = damage_components.map(normalise);

  // ── 1. Match primary and secondary components ────────────────────────────
  const matchedPrimary = findMatched(normComponents, pattern.primary);
  const matchedSecondary = findMatched(normComponents, pattern.secondary);

  const primaryCoverage = pattern.primary.length > 0
    ? matchedPrimary.length / pattern.primary.length
    : 1.0;
  const secondaryCoverage = pattern.secondary.length > 0
    ? matchedSecondary.length / pattern.secondary.length
    : 1.0;

  // ── 2. Missing expected components ──────────────────────────────────────
  const missingPrimary = pattern.primary.filter(p => !matchedPrimary.includes(p));
  const missingSecondary = pattern.secondary.filter(s => !matchedSecondary.includes(s));
  const missingExpected = [...missingPrimary, ...missingSecondary.slice(0, 3)]; // cap secondary list

  // ── 3. Unexpected components ─────────────────────────────────────────────
  const unexpectedComponents = findUnexpected(normComponents, pattern.primary, pattern.secondary);

  // ── 4. Structural damage detection ───────────────────────────────────────
  const structuralFound = normComponents.filter(c => isStructural(c));
  const structuralDamageDetected = structuralFound.length > 0;

  // ── 5. Image contradiction check ─────────────────────────────────────────
  const imageContradiction = detectImageContradiction(
    scenario_type,
    image_detected_zones || [],
    impact_direction,
    pattern
  );

  // ── 6. Impact direction plausibility ─────────────────────────────────────
  const directionPlausible = pattern.expected_impact_directions.includes(impact_direction) ||
    impact_direction === "unknown" ||
    pattern.expected_impact_directions.includes("unknown");

  // ── 7. Determine pattern match strength ──────────────────────────────────
  let patternMatch: PatternMatchStrength;

  if (imageContradiction.contradiction) {
    // Image contradiction always downgrades to WEAK or NONE
    patternMatch = primaryCoverage >= pattern.moderate_threshold ? "WEAK" : "NONE";
  } else if (!directionPlausible) {
    // Wrong impact direction downgrades one tier
    if (primaryCoverage >= pattern.strong_threshold) {
      patternMatch = "MODERATE";
    } else if (primaryCoverage >= pattern.moderate_threshold) {
      patternMatch = "WEAK";
    } else {
      patternMatch = "NONE";
    }
  } else {
    // Normal scoring
    if (primaryCoverage >= pattern.strong_threshold) {
      patternMatch = "STRONG";
    } else if (primaryCoverage >= pattern.moderate_threshold) {
      patternMatch = "MODERATE";
    } else if (primaryCoverage > 0) {
      patternMatch = "WEAK";
    } else {
      patternMatch = "NONE";
    }
  }

  // ── 8. Confidence score ───────────────────────────────────────────────────
  let confidence = Math.round(
    primaryCoverage * 50 +          // primary coverage: up to 50 pts
    secondaryCoverage * 20 +        // secondary coverage: up to 20 pts
    (directionPlausible ? 15 : 0) + // direction plausibility: 15 pts
    (structuralDamageDetected && pattern.structural_expected ? 10 : 0) + // structural: 10 pts
    (image_detected_zones && image_detected_zones.length > 0 ? 5 : 0)   // image data present: 5 pts
  );
  if (imageContradiction.contradiction) confidence = Math.max(0, confidence - 30);
  confidence = Math.min(100, Math.max(0, confidence));

  // ── 9. Build reasoning ────────────────────────────────────────────────────
  const reasoningParts: string[] = [];

  reasoningParts.push(
    `Scenario: ${scenario_type}. Impact direction: ${impact_direction}. ` +
    `${damage_components.length} damage component(s) evaluated.`
  );

  if (matchedPrimary.length > 0) {
    reasoningParts.push(
      `Primary components matched (${matchedPrimary.length}/${pattern.primary.length}): ` +
      `${matchedPrimary.join(", ")}.`
    );
  } else if (pattern.primary.length > 0) {
    reasoningParts.push(
      `No primary components matched. Expected: ${pattern.primary.slice(0, 4).join(", ")}.`
    );
  }

  if (missingPrimary.length > 0) {
    reasoningParts.push(
      `Missing primary components: ${missingPrimary.join(", ")}.`
    );
  }

  if (structuralDamageDetected) {
    reasoningParts.push(
      `Structural damage confirmed: ${structuralFound.join(", ")}. ` +
      `Structural components increase repair severity and cost.`
    );
  } else if (pattern.structural_expected) {
    reasoningParts.push(
      `Structural damage expected for this scenario but no structural components were identified.`
    );
  }

  if (unexpectedComponents.length > 0) {
    reasoningParts.push(
      `Unexpected components (${unexpectedComponents.length}): ${unexpectedComponents.slice(0, 4).join(", ")}.`
    );
  }

  if (imageContradiction.contradiction) {
    reasoningParts.push(`IMAGE CONTRADICTION: ${imageContradiction.reason}`);
  }

  if (!directionPlausible) {
    reasoningParts.push(
      `Impact direction "${impact_direction}" is not typical for ${scenario_type} incidents ` +
      `(expected: ${pattern.expected_impact_directions.join(", ")}).`
    );
  }

  reasoningParts.push(
    `Pattern match: ${patternMatch} (primary coverage: ${Math.round(primaryCoverage * 100)}%, ` +
    `secondary coverage: ${Math.round(secondaryCoverage * 100)}%). Confidence: ${confidence}/100.`
  );

  return {
    pattern_match: patternMatch,
    missing_expected_components: missingExpected,
    unexpected_components: unexpectedComponents,
    structural_damage_detected: structuralDamageDetected,
    confidence,
    reasoning: reasoningParts.join(" "),
    validation_detail: {
      expected_primary: pattern.primary,
      expected_secondary: pattern.secondary,
      matched_primary: matchedPrimary,
      matched_secondary: matchedSecondary,
      structural_components_found: structuralFound,
      image_contradiction: imageContradiction.contradiction,
      image_contradiction_reason: imageContradiction.reason,
      primary_coverage_pct: Math.round(primaryCoverage * 100),
      secondary_coverage_pct: Math.round(secondaryCoverage * 100),
    },
  };
}
