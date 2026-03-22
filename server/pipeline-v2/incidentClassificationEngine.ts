/**
 * pipeline-v2/incidentClassificationEngine.ts
 *
 * Incident Classification Engine
 *
 * Determines the TRUE incident type by cross-referencing three independent
 * evidence sources:
 *   1. Driver narrative (free-text description)
 *   2. Claim form fields (structured incident_type / accident_type fields)
 *   3. Damage description (damage text and component list)
 *
 * KEY RULES:
 * - Animal strike (cow, goat, livestock, wildlife) is ALWAYS preferred over
 *   generic "collision" when animal evidence is present in ANY source.
 * - "collision" is NEVER the default — it must be evidenced.
 * - Conflicts between sources are detected and reported.
 * - Output is a strict JSON contract matching the specified schema.
 *
 * This engine was introduced to prevent the root cause of the Mazda audit
 * failure, where the pipeline stored "collision" despite the driver stating
 * explicitly that a cow was struck.
 */

import type { CanonicalIncidentType } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ClassifiedIncidentType =
  | "animal_strike"
  | "vehicle_collision"
  | "theft"
  | "fire"
  | "flood"
  | "vandalism"
  | "unknown";

export type SourceName =
  | "driver_statement"
  | "claim_form"
  | "damage_description";

export interface SourceClassification {
  source: SourceName;
  raw_value: string | null;
  classified_as: ClassifiedIncidentType;
  confidence: number; // 0–100
  signals: string[];  // matched keywords / phrases
}

export interface IncidentClassificationResult {
  incident_type: ClassifiedIncidentType;
  confidence: number;            // 0–100
  sources_used: SourceName[];
  conflict_detected: boolean;
  reasoning: string;
  source_detail: SourceClassification[];
  /** Canonical pipeline type for downstream compatibility */
  canonical_type: CanonicalIncidentType;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL STRIKE KEYWORDS — exhaustive African + global wildlife and livestock
// ─────────────────────────────────────────────────────────────────────────────

const ANIMAL_STRIKE_KEYWORDS: string[] = [
  // Livestock
  "cow", "cattle", "bull", "calf", "ox", "heifer",
  "goat", "sheep", "lamb", "donkey", "horse", "mule", "pig", "hog",
  // African wildlife
  "kudu", "nyala", "eland", "bushbuck", "waterbuck", "reedbuck",
  "wildebeest", "gnu", "springbok", "gemsbok", "oryx",
  "steenbok", "duiker", "impala", "sable", "roan",
  "warthog", "baboon", "zebra", "buffalo", "elephant", "giraffe",
  "rhino", "hippo", "ostrich", "guinea fowl", "hadeda",
  "mongoose", "porcupine", "vervet", "dassie", "hyrax",
  "bushpig", "caracal", "jackal", "hyena", "cheetah",
  "leopard", "lion", "deer",
  // Generic
  "animal", "livestock", "wildlife", "game", "buck", "antelope",
  // Phrases
  "hit a cow", "struck a cow", "cow ran", "cow jumped",
  "animal ran", "animal jumped", "animal crossed",
  "hit an animal", "struck an animal",
  "animal strike", "animal collision", "animal impact",
  "ran into a cow", "ran into an animal",
];

// ─────────────────────────────────────────────────────────────────────────────
// THEFT KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

const THEFT_KEYWORDS: string[] = [
  "stolen", "theft", "hijack", "hijacking", "carjack",
  "broke in", "break-in", "break in", "smash and grab",
  "vehicle taken", "car taken", "vehicle missing",
  "unlawfully removed",
];

// ─────────────────────────────────────────────────────────────────────────────
// FIRE KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

const FIRE_KEYWORDS: string[] = [
  "fire", "burnt", "burned", "burning", "ignited", "caught fire",
  "engine fire", "electrical fire", "arson",
];

// ─────────────────────────────────────────────────────────────────────────────
// FLOOD / WEATHER KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

const FLOOD_KEYWORDS: string[] = [
  "flood", "flooded", "submerged", "hail", "hailstorm",
  "water damage", "washed away", "storm", "lightning",
];

// ─────────────────────────────────────────────────────────────────────────────
// VANDALISM KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

const VANDALISM_KEYWORDS: string[] = [
  "vandal", "vandalism", "vandalised", "vandalized",
  "keyed", "scratched deliberately", "tyres slashed",
  "windows smashed", "graffiti", "malicious damage",
];

// ─────────────────────────────────────────────────────────────────────────────
// VEHICLE COLLISION KEYWORDS (only used when no higher-priority type matches)
// ─────────────────────────────────────────────────────────────────────────────

const VEHICLE_COLLISION_KEYWORDS: string[] = [
  "collision", "collided", "collide",
  "accident", "crash", "crashed",
  "hit another vehicle", "hit a vehicle", "hit a car", "hit a truck",
  "struck another vehicle", "struck a vehicle",
  "rear-ended", "rear ended", "t-bone", "t-boned",
  "side-swiped", "sideswiped",
  "head-on", "head on collision",
  "ran into a vehicle", "ran into another",
  "vehicle vs vehicle",
  "intersection", "traffic light",
  "overtaking", "overtook",
  "lost control", "skidded", "rolled over", "rollover",
  "hit a wall", "hit a pole", "hit a tree", "hit a barrier",
  "hit a pothole", "hit a ditch",
];

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM FORM FIELD NORMALISATION
// Maps raw claim form values to ClassifiedIncidentType
// ─────────────────────────────────────────────────────────────────────────────

const CLAIM_FORM_MAP: Record<string, ClassifiedIncidentType> = {
  // Animal strike variants
  "animal_strike": "animal_strike",
  "animal strike": "animal_strike",
  "animal": "animal_strike",
  "wildlife": "animal_strike",
  "livestock": "animal_strike",
  // Collision variants
  "collision": "vehicle_collision",
  "vehicle_collision": "vehicle_collision",
  "accident": "vehicle_collision",
  "crash": "vehicle_collision",
  "motor vehicle accident": "vehicle_collision",
  "mva": "vehicle_collision",
  // Theft
  "theft": "theft",
  "hijacking": "theft",
  "hijack": "theft",
  "stolen": "theft",
  // Fire
  "fire": "fire",
  // Flood
  "flood": "flood",
  "hail": "flood",
  "weather": "flood",
  // Vandalism
  "vandalism": "vandalism",
  "malicious damage": "vandalism",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalise(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[_\-]/g, " ").trim();
}

function matchKeywords(
  text: string,
  keywords: string[]
): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    // Use word boundary matching for short keywords to avoid partial matches
    const pattern = kw.length <= 4
      ? new RegExp(`\\b${kw}\\b`, "i")
      : new RegExp(kw, "i");
    if (pattern.test(text)) {
      matched.push(kw);
    }
  }
  return matched;
}

/**
 * Classify a single text source into a ClassifiedIncidentType.
 * Priority order: animal_strike > theft > fire > flood > vandalism > vehicle_collision > unknown
 */
function classifyText(text: string | null | undefined): {
  type: ClassifiedIncidentType;
  confidence: number;
  signals: string[];
} {
  const norm = normalise(text);

  if (!norm) {
    return { type: "unknown", confidence: 0, signals: [] };
  }

  // 1. Animal strike — highest priority
  const animalSignals = matchKeywords(norm, ANIMAL_STRIKE_KEYWORDS);
  if (animalSignals.length > 0) {
    // Confidence scales with number of distinct signals (cap at 95)
    const conf = Math.min(60 + animalSignals.length * 10, 95);
    return { type: "animal_strike", confidence: conf, signals: animalSignals };
  }

  // 2. Theft
  const theftSignals = matchKeywords(norm, THEFT_KEYWORDS);
  if (theftSignals.length > 0) {
    return { type: "theft", confidence: Math.min(60 + theftSignals.length * 8, 90), signals: theftSignals };
  }

  // 3. Fire
  const fireSignals = matchKeywords(norm, FIRE_KEYWORDS);
  if (fireSignals.length > 0) {
    return { type: "fire", confidence: Math.min(60 + fireSignals.length * 8, 90), signals: fireSignals };
  }

  // 4. Flood / weather
  const floodSignals = matchKeywords(norm, FLOOD_KEYWORDS);
  if (floodSignals.length > 0) {
    return { type: "flood", confidence: Math.min(60 + floodSignals.length * 8, 90), signals: floodSignals };
  }

  // 5. Vandalism
  const vandalSignals = matchKeywords(norm, VANDALISM_KEYWORDS);
  if (vandalSignals.length > 0) {
    return { type: "vandalism", confidence: Math.min(60 + vandalSignals.length * 8, 90), signals: vandalSignals };
  }

  // 6. Vehicle collision — only if explicitly evidenced
  const collisionSignals = matchKeywords(norm, VEHICLE_COLLISION_KEYWORDS);
  if (collisionSignals.length > 0) {
    return { type: "vehicle_collision", confidence: Math.min(50 + collisionSignals.length * 5, 85), signals: collisionSignals };
  }

  // 7. Unknown — no evidence for any type
  return { type: "unknown", confidence: 0, signals: [] };
}

/**
 * Classify a claim form field value using the normalised map.
 */
function classifyClaimFormField(
  rawValue: string | null | undefined
): {
  type: ClassifiedIncidentType;
  confidence: number;
  signals: string[];
} {
  const norm = normalise(rawValue);
  if (!norm) return { type: "unknown", confidence: 0, signals: [] };

  // Exact map lookup first
  if (CLAIM_FORM_MAP[norm]) {
    return {
      type: CLAIM_FORM_MAP[norm],
      confidence: 85,
      signals: [`claim_form_field: "${norm}"`],
    };
  }

  // Partial map lookup
  for (const [key, type] of Object.entries(CLAIM_FORM_MAP)) {
    if (norm.includes(key) || key.includes(norm)) {
      return {
        type,
        confidence: 70,
        signals: [`claim_form_partial_match: "${key}"`],
      };
    }
  }

  // Fall back to text classification
  return classifyText(rawValue);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect a meaningful conflict between source classifications.
 *
 * Rules:
 * - animal_strike vs vehicle_collision is NOT a conflict — animal strikes
 *   are a subset of physical impacts; the claim form may say "collision"
 *   while the narrative says "cow". animal_strike always wins.
 * - Any other type disagreement IS a conflict.
 * - unknown sources do not contribute to conflict detection.
 */
function detectConflict(
  sources: SourceClassification[]
): boolean {
  const knownTypes = sources
    .filter((s) => s.classified_as !== "unknown")
    .map((s) => s.classified_as);

  if (knownTypes.length <= 1) return false;

  const uniqueTypes = Array.from(new Set(knownTypes));
  if (uniqueTypes.length <= 1) return false;

  // animal_strike + vehicle_collision is not a true conflict
  // (claim form says "collision", narrative says "cow" — animal_strike wins)
  const hasAnimalStrike = uniqueTypes.includes("animal_strike");
  const hasVehicleCollision = uniqueTypes.includes("vehicle_collision");
  const otherTypes = uniqueTypes.filter(
    (t) => t !== "animal_strike" && t !== "vehicle_collision"
  );

  if (hasAnimalStrike && hasVehicleCollision && otherTypes.length === 0) {
    return false; // Not a real conflict — animal strike overrides collision
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL DECISION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Priority-weighted vote across all source classifications.
 *
 * Priority order (highest first):
 *   animal_strike > theft > fire > flood > vandalism > vehicle_collision > unknown
 *
 * A single high-confidence animal_strike signal from ANY source overrides
 * a vehicle_collision from all other sources.
 */
const TYPE_PRIORITY: Record<ClassifiedIncidentType, number> = {
  animal_strike: 100,
  theft: 80,
  fire: 80,
  flood: 80,
  vandalism: 80,
  vehicle_collision: 40,
  unknown: 0,
};

function resolveType(
  sources: SourceClassification[]
): { type: ClassifiedIncidentType; confidence: number; reasoning: string } {
  const knownSources = sources.filter((s) => s.classified_as !== "unknown");

  if (knownSources.length === 0) {
    return {
      type: "unknown",
      confidence: 0,
      reasoning: "No evidence found in any source to determine incident type.",
    };
  }

  // Find the highest-priority type across all sources
  let bestType: ClassifiedIncidentType = "unknown";
  let bestPriority = -1;

  for (const s of knownSources) {
    const priority = TYPE_PRIORITY[s.classified_as];
    if (priority > bestPriority) {
      bestPriority = priority;
      bestType = s.classified_as;
    }
  }

  // Collect all sources that agree with the best type
  const agreingSources = knownSources.filter((s) => s.classified_as === bestType);
  const disagreingSources = knownSources.filter(
    (s) => s.classified_as !== bestType && s.classified_as !== "unknown"
  );

  // Confidence: average of agreeing sources, penalised for disagreement
  const avgConf =
    agreingSources.reduce((sum, s) => sum + s.confidence, 0) /
    agreingSources.length;
  const penalty = disagreingSources.length * 5;
  const finalConf = Math.max(Math.round(avgConf - penalty), 10);

  // Build reasoning
  const agreeList = agreingSources
    .map((s) => `${s.source} (signals: ${s.signals.slice(0, 3).join(", ")})`)
    .join("; ");

  let reasoning = `Classified as "${bestType}" based on evidence from: ${agreeList}.`;

  if (disagreingSources.length > 0) {
    const disagreeList = disagreingSources
      .map((s) => `${s.source} → "${s.classified_as}"`)
      .join(", ");
    reasoning += ` Overriding conflicting classification(s): ${disagreeList}.`;

    if (bestType === "animal_strike") {
      reasoning +=
        " Animal strike evidence takes precedence over generic collision classification — claim form field 'collision' is a common mis-classification when the actual striking object is an animal.";
    }
  }

  return { type: bestType, confidence: finalConf, reasoning };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL TYPE MAPPING
// Maps ClassifiedIncidentType → CanonicalIncidentType for pipeline compatibility
// ─────────────────────────────────────────────────────────────────────────────

function toCanonicalType(type: ClassifiedIncidentType): CanonicalIncidentType {
  switch (type) {
    case "animal_strike":
      // Animal strikes are physical damage events — map to "collision" for
      // physics engine compatibility. The specific sub-type is preserved in
      // the classification result for all other engines.
      return "collision";
    case "vehicle_collision":
      return "collision";
    case "theft":
      return "theft";
    case "fire":
      return "fire";
    case "flood":
      return "flood";
    case "vandalism":
      return "vandalism";
    case "unknown":
    default:
      return "unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidentClassificationInput {
  /** Free-text driver narrative (claim form Q&A, incident description) */
  driver_narrative: string | null | undefined;
  /** Raw value from the claim form's incident_type / accident_type field */
  claim_form_incident_type: string | null | undefined;
  /** Free-text damage description (what was damaged, how it looks) */
  damage_description: string | null | undefined;
  /** Optional: raw damage component names (e.g. ["bonnet", "radiator"]) */
  damage_components?: string[] | null;
}

/**
 * Classify the true incident type from multiple evidence sources.
 *
 * @param input - Three independent evidence sources
 * @returns IncidentClassificationResult — the exact JSON contract specified
 */
export function classifyIncident(
  input: IncidentClassificationInput
): IncidentClassificationResult {
  const sourceClassifications: SourceClassification[] = [];

  // ── Source 1: Driver narrative ──────────────────────────────────────────
  if (input.driver_narrative !== null && input.driver_narrative !== undefined) {
    const result = classifyText(input.driver_narrative);
    sourceClassifications.push({
      source: "driver_statement",
      raw_value: input.driver_narrative,
      classified_as: result.type,
      confidence: result.confidence,
      signals: result.signals,
    });
  }

  // ── Source 2: Claim form field ──────────────────────────────────────────
  if (
    input.claim_form_incident_type !== null &&
    input.claim_form_incident_type !== undefined
  ) {
    const result = classifyClaimFormField(input.claim_form_incident_type);
    sourceClassifications.push({
      source: "claim_form",
      raw_value: input.claim_form_incident_type,
      classified_as: result.type,
      confidence: result.confidence,
      signals: result.signals,
    });
  }

  // ── Source 3: Damage description + components ───────────────────────────
  const combinedDamageText = [
    input.damage_description ?? "",
    (input.damage_components ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  if (combinedDamageText.trim()) {
    const result = classifyText(combinedDamageText);
    sourceClassifications.push({
      source: "damage_description",
      raw_value: combinedDamageText.slice(0, 300), // Truncate for readability
      classified_as: result.type,
      confidence: result.confidence,
      signals: result.signals,
    });
  }

  // ── Resolve final type ──────────────────────────────────────────────────
  const { type, confidence, reasoning } = resolveType(sourceClassifications);
  const conflictDetected = detectConflict(sourceClassifications);
  const sourcesUsed: SourceName[] = sourceClassifications.map((s) => s.source);

  return {
    incident_type: type,
    confidence,
    sources_used: sourcesUsed,
    conflict_detected: conflictDetected,
    reasoning,
    source_detail: sourceClassifications,
    canonical_type: toCanonicalType(type),
  };
}
