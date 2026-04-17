/**
 * pipeline-v2/incidentClassificationEngine.ts
 *
 * Incident Classification Engine v2
 *
 * ARCHITECTURE: LLM-reasoning-first
 * ─────────────────────────────────
 * The authoritative incident type is determined by an LLM that reads the full
 * incident narrative, damage description, and any available photo context.
 * Keyword matching is a deterministic fallback used ONLY when:
 *   - The LLM is unavailable (network error, timeout)
 *   - The combined input text is too short to reason over (< 80 chars)
 *
 * WHY LLM-FIRST:
 * - Claim form fields are frequently wrong or too vague ("accident", "MVA")
 * - Rollover, sideswipe, rear-end, head-on cannot be reliably detected by
 *   keyword matching alone — they require reading the narrative in context
 * - The LLM can distinguish "rolled over after hitting a pothole" (tripped
 *   rollover) from "rolled over after being hit by another vehicle"
 *   (post-collision rollover) — keyword matching cannot
 *
 * INCIDENT TYPE TAXONOMY (see INCIDENT_TYPE_TAXONOMY.md for full spec):
 *   animal_strike      — vehicle struck an animal
 *   rollover           — vehicle rolled onto side or roof
 *   rear_end           — struck from behind or struck another from behind
 *   head_on            — frontal collision with oncoming vehicle
 *   sideswipe          — lateral contact between two vehicles
 *   single_vehicle     — left road, struck fixed object, no other vehicle
 *   pedestrian_strike  — vehicle struck a pedestrian or cyclist
 *   vehicle_collision  — multi-vehicle, cannot be sub-typed
 *   theft              — vehicle stolen, hijacked, or parts removed
 *   fire               — vehicle fire
 *   flood              — flood, hail, weather damage
 *   vandalism          — malicious damage
 *   unknown            — insufficient evidence
 */

import { invokeLLM } from "../_core/llm";
import type { CanonicalIncidentType } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ClassifiedIncidentType =
  | "animal_strike"
  | "rollover"
  | "rear_end"
  | "head_on"
  | "sideswipe"
  | "single_vehicle"
  | "pedestrian_strike"
  | "vehicle_collision"
  | "theft"
  | "fire"
  | "flood"
  | "vandalism"
  | "unknown";

export type IncidentSubType =
  // Rollover sub-types
  | "tripped"           // tripped over kerb, pothole, soft verge
  | "untripped"         // excessive speed or evasive manoeuvre
  | "post_collision"    // rolled as secondary event after collision
  // Single-vehicle sub-types
  | "run_off_road"
  | "fixed_object"      // wall, pole, tree, barrier, ditch
  | "pothole"
  // Theft sub-types
  | "full_vehicle"
  | "hijacking"
  | "parts_theft"
  // Fire sub-types
  | "engine_fire"
  | "electrical_fire"
  | "arson"
  | null;

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
  sub_type: IncidentSubType;
  confidence: number;            // 0–100
  sources_used: SourceName[];
  conflict_detected: boolean;
  reasoning: string;
  source_detail: SourceClassification[];
  /** Canonical pipeline type for downstream routing */
  canonical_type: CanonicalIncidentType;
  /** Whether classification was performed by LLM or keyword fallback */
  method: "llm" | "keyword_fallback";
  /** Claim form stated type (for audit trail) */
  claim_form_stated: string | null;
  /** Whether the claim form type matched the reasoned type */
  claim_form_matches: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `You are an expert motor insurance claims analyst specialising in incident classification.

Your task is to determine the TRUE incident type from the evidence provided. You must REASON over the narrative and damage description — do not simply match keywords.

INCIDENT TYPE TAXONOMY:
- animal_strike: Vehicle struck an animal (livestock, wildlife). Evidence: animal named, struck/hit an animal, animal damage pattern (front bumper, bonnet, grille).
- rollover: Vehicle rolled onto its side or roof. Evidence: "rolled", "overturned", "flipped", "on its roof/side", roof crush, A-pillar/B-pillar deformation. NOTE: rollover is NOT the same as a collision — it is a distinct incident type even if a collision preceded it.
- rear_end: Vehicle was struck from behind, OR the insured vehicle struck another from behind. Evidence: "rear-ended", "hit from behind", "struck the back of", rear bumper/boot damage.
- head_on: Frontal collision between two vehicles travelling in opposite directions. Evidence: "head-on", "oncoming vehicle", "wrong side of road", "opposite direction", heavy frontal damage + airbag deployment.
- sideswipe: Lateral contact between two vehicles. Evidence: "sideswiped", "scraped the side", "clipped", lane-change contact, door panel / side panel damage only.
- single_vehicle: Vehicle left the road or struck a fixed object with NO other vehicle involved. Evidence: "left the road", "struck a wall/pole/tree/barrier/ditch", "lost control", "skidded off", no other vehicle mentioned. CRITICAL: If ANY other vehicle is mentioned (third party, another vehicle, truck, bus, car, etc.) this is NOT single_vehicle.
- pedestrian_strike: Vehicle struck a pedestrian or cyclist. Evidence: "pedestrian", "cyclist", "knocked down a person", "person crossing".
- vehicle_collision: Multi-vehicle collision that cannot be sub-typed from available evidence. Use this when another vehicle is explicitly mentioned but the collision sub-type cannot be determined. NOTE: Most real-world accidents involve another vehicle — if the narrative mentions "Third Party Vehicle", "another vehicle", "a truck", "a bus", "a car", "rammed into", "collided with" another vehicle, this is vehicle_collision (or a more specific sub-type), NOT single_vehicle.
- theft: Vehicle stolen, hijacked, or parts removed. Evidence: "stolen", "hijacked", "broke in", missing vehicle or parts.
- fire: Vehicle fire. Evidence: "fire", "burnt", "smoke", "engine fire".
- flood: Flood, hail, or weather damage. Evidence: "flood", "hail", "submerged", "water damage".
- vandalism: Malicious damage. Evidence: "keyed", "smashed windows", "malicious damage", scattered damage with no collision.
- unknown: Use ONLY when there is genuinely insufficient evidence to classify.

SUB-TYPE RULES:
For rollover: sub_type = "tripped" (kerb/pothole/verge), "untripped" (speed/evasion), or "post_collision" (rolled after being hit)
For single_vehicle: sub_type = "run_off_road", "fixed_object", or "pothole"
For theft: sub_type = "full_vehicle", "hijacking", or "parts_theft"
For fire: sub_type = "engine_fire", "electrical_fire", or "arson"
For all others: sub_type = null

CRITICAL RULES:
1. Rollover is NOT vehicle_collision — if the vehicle rolled, classify as rollover even if a collision preceded it
2. Sideswipe is NOT vehicle_collision — lateral contact is a distinct type
3. Rear-end is NOT vehicle_collision — if direction is clearly rear, use rear_end
4. Head-on is NOT vehicle_collision — if oncoming/opposite direction is mentioned, use head_on
5. The claim form field is often wrong — the narrative always takes precedence
6. If the narrative says "collision" but also says "rolled over", classify as rollover
7. animal_strike applies ONLY when the narrative explicitly describes the vehicle striking or being struck by an animal. Road conditions (potholes, gravel) do NOT make a claim animal_strike. If the narrative says the vehicle was hit from behind by another vehicle AND mentions road conditions, classify as rear_end — not animal_strike.
8. PRIORITY ORDER when signals conflict: rollover > pedestrian_strike > rear_end > head_on > sideswipe > animal_strike > single_vehicle > vehicle_collision. Use the highest-priority type that has explicit narrative evidence.
9. THIRD-PARTY OVERRIDE: If the narrative explicitly mentions a "Third Party Vehicle", "third party", "another vehicle", "a truck/bus/car" that was involved in the collision, you MUST classify as vehicle_collision (or a more specific sub-type like rear_end/head_on/sideswipe) — NEVER as single_vehicle. The presence of another vehicle is the strongest possible signal and overrides all damage-pattern inferences.
10. SKID + THIRD PARTY: A vehicle that skidded and then hit a third party vehicle is vehicle_collision (or head_on/rear_end), not single_vehicle. The skid is the mechanism, not the incident type.

Respond ONLY with a JSON object in this exact format:
{
  "incident_type": "<type>",
  "sub_type": "<sub_type or null>",
  "confidence": <0-100>,
  "reasoning": "<2-3 sentence explanation citing specific evidence from the narrative>",
  "claim_form_matches": <true/false>,
  "signals": ["<signal1>", "<signal2>", ...]
}`;

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD FALLBACK — used only when LLM is unavailable
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
  "animal", "wildlife", "livestock", "game animal",
  "struck an animal", "hit an animal", "animal ran",
  "animal crossed", "animal jumped",
];

const ROLLOVER_KEYWORDS: string[] = [
  "rolled", "rollover", "roll over", "rolled over",
  "overturned", "overturn", "turned over",
  "flipped", "on its side", "on its roof",
  "roof crush", "a-pillar", "b-pillar deformation",
  "landed on roof", "ended up on side",
];

const REAR_END_KEYWORDS: string[] = [
  "rear-ended", "rear ended", "struck from behind",
  "hit from behind", "hit the back of", "ran into the back",
  "hit from the back", "hit from back", "struck from the back",
  "struck the back", "came from behind", "came from the back",
  "hit at the back", "hit at back", "struck at the back",
  "vehicle hit from", "insured was hit",
  "tailgated", "shunted", "rear impact",
  "boot damage", "rear bumper struck",
  "was hit from behind", "vehicle behind",
];

const HEAD_ON_KEYWORDS: string[] = [
  "head-on", "head on", "oncoming",
  "wrong side", "opposite direction",
  "frontal collision", "met head on",
  "collided head on", "coming towards",
];

const SIDESWIPE_KEYWORDS: string[] = [
  "sideswiped", "side-swiped", "sideswipe",
  "scraped the side", "brushed", "clipped the side",
  "lane change", "merging contact", "overtaking contact",
  "door panel scrape", "side panel scrape",
];

const SINGLE_VEHICLE_KEYWORDS: string[] = [
  "left the road", "run off road", "ran off road",
  "left the carriageway", "struck a wall", "struck a pole",
  "struck a tree", "struck a barrier", "hit a ditch",
  "hit a pothole", "lost control", "skidded off",
  "no other vehicle", "single vehicle",
  "hit a fence", "hit a culvert",
];

const PEDESTRIAN_KEYWORDS: string[] = [
  "struck a pedestrian", "hit a pedestrian", "pedestrian",
  "cyclist", "knocked down", "knocked over a person",
  "person crossing", "person in the road",
];

const THEFT_KEYWORDS: string[] = [
  "stolen", "theft", "hijack", "hijacked", "hijacking",
  "broke in", "broke into", "forced entry",
  "smash and grab", "smash-and-grab", "window smashed and", "grabbed from vehicle",
  "vehicle missing", "vehicle not found",
  "catalytic converter", "wheels stolen", "battery stolen",
  "parts removed", "stripped",
];

const FIRE_KEYWORDS: string[] = [
  "fire", "burnt", "burned", "burning", "smoke",
  "engine fire", "electrical fire", "arson", "set alight",
  "caught fire", "in flames",
];

const FLOOD_KEYWORDS: string[] = [
  "flood", "flooded", "hail", "hailstorm",
  "submerged", "water damage", "washed away",
  "storm damage", "weather damage", "heavy rain",
  "storm", "lightning", "hail damage", "hail storm",
  "wind damage", "fallen tree", "tree fell",
];

const VANDALISM_KEYWORDS: string[] = [
  "vandalism", "vandalised", "malicious damage",
  "keyed", "scratched deliberately", "smashed windows",
  "broken windows", "graffiti", "tyres slashed",
];

// Third-party explicit mentions — checked BEFORE single_vehicle in priority order
const THIRD_PARTY_VEHICLE_KEYWORDS: string[] = [
  "third party vehicle", "third party", "third-party vehicle", "third-party",
  "another vehicle", "other vehicle", "rammed into", "rammed a",
  "collided with a", "hit a vehicle", "struck a vehicle",
  "hit another car", "struck another car",
];

const VEHICLE_COLLISION_KEYWORDS: string[] = [
  "collision", "collided", "crash", "crashed",
  "hit another vehicle", "struck another vehicle",
  "t-bone", "t-boned", "intersection accident",
  "vehicle vs vehicle", "multi-vehicle",
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalise(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[_\-]/g, " ").trim();
}

function matchKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    const pattern = kw.length <= 4
      ? new RegExp(`\\b${kw}\\b`, "i")
      : new RegExp(kw, "i");
    if (pattern.test(text)) matched.push(kw);
  }
  return matched;
}

function keywordClassifyText(text: string | null | undefined): {
  type: ClassifiedIncidentType;
  sub_type: IncidentSubType;
  confidence: number;
  signals: string[];
} {
  const norm = normalise(text);
  if (!norm) return { type: "unknown", sub_type: null, confidence: 0, signals: [] };

  // Priority: animal_strike > rollover > pedestrian > rear_end > head_on
  //           > sideswipe > single_vehicle > theft > fire > flood
  //           > vandalism > vehicle_collision > unknown

  const animalSignals = matchKeywords(norm, ANIMAL_STRIKE_KEYWORDS);
  if (animalSignals.length > 0) {
    return { type: "animal_strike", sub_type: null, confidence: Math.min(60 + animalSignals.length * 10, 95), signals: animalSignals };
  }

  const rolloverSignals = matchKeywords(norm, ROLLOVER_KEYWORDS);
  if (rolloverSignals.length > 0) {
    const sub_type: IncidentSubType = norm.includes("pothole") || norm.includes("kerb") || norm.includes("verge")
      ? "tripped"
      : norm.includes("after") || norm.includes("collision") || norm.includes("hit")
        ? "post_collision"
        : "untripped";
    return { type: "rollover", sub_type, confidence: Math.min(65 + rolloverSignals.length * 8, 92), signals: rolloverSignals };
  }

  const pedestrianSignals = matchKeywords(norm, PEDESTRIAN_KEYWORDS);
  if (pedestrianSignals.length > 0) {
    return { type: "pedestrian_strike", sub_type: null, confidence: Math.min(65 + pedestrianSignals.length * 8, 90), signals: pedestrianSignals };
  }

  const rearEndSignals = matchKeywords(norm, REAR_END_KEYWORDS);
  if (rearEndSignals.length > 0) {
    return { type: "rear_end", sub_type: null, confidence: Math.min(60 + rearEndSignals.length * 8, 90), signals: rearEndSignals };
  }

  const headOnSignals = matchKeywords(norm, HEAD_ON_KEYWORDS);
  if (headOnSignals.length > 0) {
    return { type: "head_on", sub_type: null, confidence: Math.min(60 + headOnSignals.length * 8, 90), signals: headOnSignals };
  }

  const sideswipeSignals = matchKeywords(norm, SIDESWIPE_KEYWORDS);
  if (sideswipeSignals.length > 0) {
    return { type: "sideswipe", sub_type: null, confidence: Math.min(60 + sideswipeSignals.length * 8, 88), signals: sideswipeSignals };
  }

  // Third-party vehicle check — must run BEFORE single_vehicle to prevent misclassification
  // when a narrative mentions skid/ditch AND a third party vehicle
  const thirdPartySignals = matchKeywords(norm, THIRD_PARTY_VEHICLE_KEYWORDS);
  if (thirdPartySignals.length > 0) {
    return { type: "vehicle_collision", sub_type: null, confidence: Math.min(65 + thirdPartySignals.length * 8, 88), signals: thirdPartySignals };
  }

  const singleVehicleSignals = matchKeywords(norm, SINGLE_VEHICLE_KEYWORDS);
  if (singleVehicleSignals.length > 0) {
    const sub_type: IncidentSubType = norm.includes("pothole") ? "pothole"
      : norm.includes("left the road") || norm.includes("run off") || norm.includes("ran off") ? "run_off_road"
      : "fixed_object";
    return { type: "single_vehicle", sub_type, confidence: Math.min(60 + singleVehicleSignals.length * 8, 88), signals: singleVehicleSignals };
  }

  const theftSignals = matchKeywords(norm, THEFT_KEYWORDS);
  if (theftSignals.length > 0) {
    const sub_type: IncidentSubType = norm.includes("hijack") ? "hijacking"
      : norm.includes("parts") || norm.includes("catalytic") || norm.includes("wheels") || norm.includes("stripped") ? "parts_theft"
      : "full_vehicle";
    return { type: "theft", sub_type, confidence: Math.min(60 + theftSignals.length * 8, 90), signals: theftSignals };
  }

  const fireSignals = matchKeywords(norm, FIRE_KEYWORDS);
  if (fireSignals.length > 0) {
    const sub_type: IncidentSubType = norm.includes("arson") || norm.includes("set alight") ? "arson"
      : norm.includes("electrical") || norm.includes("wiring") ? "electrical_fire"
      : "engine_fire";
    return { type: "fire", sub_type, confidence: Math.min(60 + fireSignals.length * 8, 90), signals: fireSignals };
  }

  const floodSignals = matchKeywords(norm, FLOOD_KEYWORDS);
  if (floodSignals.length > 0) {
    return { type: "flood", sub_type: null, confidence: Math.min(60 + floodSignals.length * 8, 90), signals: floodSignals };
  }

  const vandalSignals = matchKeywords(norm, VANDALISM_KEYWORDS);
  if (vandalSignals.length > 0) {
    return { type: "vandalism", sub_type: null, confidence: Math.min(60 + vandalSignals.length * 8, 90), signals: vandalSignals };
  }

  const collisionSignals = matchKeywords(norm, VEHICLE_COLLISION_KEYWORDS);
  if (collisionSignals.length > 0) {
    return { type: "vehicle_collision", sub_type: null, confidence: Math.min(50 + collisionSignals.length * 5, 80), signals: collisionSignals };
  }

  return { type: "unknown", sub_type: null, confidence: 0, signals: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL TYPE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

function toCanonicalType(type: ClassifiedIncidentType): CanonicalIncidentType {
  switch (type) {
    case "animal_strike":     return "animal_strike";
    case "rollover":          return "rollover";
    case "rear_end":          return "rear_end";
    case "head_on":           return "head_on";
    case "sideswipe":         return "sideswipe";
    case "single_vehicle":    return "single_vehicle";
    case "pedestrian_strike": return "pedestrian_strike";
    case "vehicle_collision": return "collision";
    case "theft":             return "theft";
    case "fire":              return "fire";
    case "flood":             return "flood";
    case "vandalism":         return "vandalism";
    case "unknown":
    default:                  return "unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM CLASSIFICATION PASS
// ─────────────────────────────────────────────────────────────────────────────

async function llmClassify(
  combinedText: string,
  claimFormType: string | null,
): Promise<{
  incident_type: ClassifiedIncidentType;
  sub_type: IncidentSubType;
  confidence: number;
  reasoning: string;
  claim_form_matches: boolean;
  signals: string[];
} | null> {
  try {
    const userMessage = [
      claimFormType ? `CLAIM FORM INCIDENT TYPE: ${claimFormType}` : "CLAIM FORM INCIDENT TYPE: not provided",
      "",
      "INCIDENT NARRATIVE AND DAMAGE DESCRIPTION:",
      combinedText,
    ].join("\n");

    const response = await invokeLLM({
      messages: [
        { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "incident_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              incident_type: { type: "string" },
              sub_type: { type: ["string", "null"] },
              confidence: { type: "number" },
              reasoning: { type: "string" },
              claim_form_matches: { type: "boolean" },
              signals: { type: "array", items: { type: "string" } },
            },
            required: ["incident_type", "sub_type", "confidence", "reasoning", "claim_form_matches", "signals"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    const VALID_TYPES: ClassifiedIncidentType[] = [
      "animal_strike", "rollover", "rear_end", "head_on", "sideswipe",
      "single_vehicle", "pedestrian_strike", "vehicle_collision",
      "theft", "fire", "flood", "vandalism", "unknown",
    ];
    if (!VALID_TYPES.includes(parsed.incident_type)) {
      console.warn(`[IncidentClassification] LLM returned unknown type: ${parsed.incident_type}, falling back to keyword`);
      return null;
    }

    return {
      incident_type: parsed.incident_type as ClassifiedIncidentType,
      sub_type: (parsed.sub_type ?? null) as IncidentSubType,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 50))),
      reasoning: parsed.reasoning ?? "LLM classification.",
      claim_form_matches: Boolean(parsed.claim_form_matches),
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    };
  } catch (err) {
    console.warn("[IncidentClassification] LLM call failed, using keyword fallback:", String(err));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — async (LLM-first)
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
  /** Optional: photo context summary from vision analysis */
  photo_context?: string | null;
  /** Optional: damage zones from Stage 6 (e.g. ["rear", "general"]) — used for physical arbitration */
  damage_zones?: string[] | null;
  /** Optional: collision direction from Stage 7 physics (e.g. "rear", "frontal") — used for physical arbitration */
  physics_direction?: string | null;
}

/**
 * Classify the true incident type from multiple evidence sources.
 *
 * PRIMARY PATH: LLM reasoning over the full narrative and damage context.
 * FALLBACK PATH: Keyword matching when LLM is unavailable or input is too short.
 */
export async function classifyIncident(
  input: IncidentClassificationInput
): Promise<IncidentClassificationResult> {
  const textParts = [
    input.driver_narrative ?? "",
    input.damage_description ?? "",
    (input.damage_components ?? []).join(" "),
    input.photo_context ?? "",
  ].filter(Boolean);
  const combinedText = textParts.join("\n\n").trim();

  const claimFormType = input.claim_form_incident_type?.trim() ?? null;

  const sourcesUsed: SourceName[] = [];
  if (input.driver_narrative?.trim()) sourcesUsed.push("driver_statement");
  if (input.claim_form_incident_type?.trim()) sourcesUsed.push("claim_form");
  if (input.damage_description?.trim() || (input.damage_components ?? []).length > 0) sourcesUsed.push("damage_description");

  // ── LLM path (primary) ───────────────────────────────────────────────────
  const MIN_LLM_LENGTH = 80;
  let llmResult: Awaited<ReturnType<typeof llmClassify>> = null;

  if (combinedText.length >= MIN_LLM_LENGTH) {
    llmResult = await llmClassify(combinedText, claimFormType);
  }

  if (llmResult) {
    const sourceDetail: SourceClassification[] = [];
    if (input.driver_narrative?.trim()) {
      const kw = keywordClassifyText(input.driver_narrative);
      sourceDetail.push({ source: "driver_statement", raw_value: input.driver_narrative, classified_as: kw.type, confidence: kw.confidence, signals: kw.signals });
    }
    if (input.claim_form_incident_type?.trim()) {
      sourceDetail.push({ source: "claim_form", raw_value: input.claim_form_incident_type, classified_as: keywordClassifyText(input.claim_form_incident_type).type, confidence: 50, signals: [`claim_form_stated: "${input.claim_form_incident_type}"`] });
    }
    if (input.damage_description?.trim()) {
      const kw = keywordClassifyText(input.damage_description);
      sourceDetail.push({ source: "damage_description", raw_value: (input.damage_description ?? "").slice(0, 300), classified_as: kw.type, confidence: kw.confidence, signals: kw.signals });
    }

    const keywordTypes = sourceDetail.map(s => s.classified_as).filter(t => t !== "unknown");
    const uniqueKeywordTypes = Array.from(new Set(keywordTypes));

    // ── Perspective-normalisation: same-event descriptions from different viewpoints
    // should NOT be flagged as conflicts. Apply the same EXPECTED_OVERRIDES exemption
    // used by the keyword fallback path.
    //
    // A "conflict" requires that keyword sources disagree AND the disagreement is NOT
    // explained by:
    //   (a) a specific sub-type overriding the generic "vehicle_collision" catch-all, OR
    //   (b) the LLM's high-confidence verdict (≥ 85%) already resolving the ambiguity.
    //
    // Example: driver says "hit from the back" (→ rear_end) and damage description says
    // "vehicle collision" (→ vehicle_collision). These describe the same event from
    // different perspectives — NOT a genuine conflict.
    const LLM_EXPECTED_OVERRIDES: Partial<Record<ClassifiedIncidentType, ClassifiedIncidentType[]>> = {
      animal_strike:       ["vehicle_collision"],
      rollover:            ["vehicle_collision"],
      rear_end:            ["vehicle_collision"],
      rear_end_collision:  ["vehicle_collision"],
      head_on:             ["vehicle_collision"],
      head_on_collision:   ["vehicle_collision"],
      sideswipe:           ["vehicle_collision"],
      single_vehicle:      ["vehicle_collision"],
      pedestrian_strike:   ["vehicle_collision"],
    };
    const llmFinalType = llmResult!.incident_type;
    const isExpectedLLMOverride = uniqueKeywordTypes.length === 2 &&
      (LLM_EXPECTED_OVERRIDES[llmFinalType] ?? []).some(overridden => uniqueKeywordTypes.includes(overridden));
    // Also suppress when LLM is highly confident (≥ 85%) — the LLM has reasoned over the
    // full narrative and its verdict supersedes keyword-level disagreements.
    const llmHighConfidence = (llmResult!.confidence ?? 0) >= 85;
    const conflictDetected = uniqueKeywordTypes.length > 1
      && !uniqueKeywordTypes.every(t => t === llmFinalType)
      && !isExpectedLLMOverride
      && !llmHighConfidence;

    // ── THIRD-PARTY NARRATIVE GUARD ──────────────────────────────────────────
    // If the driver narrative explicitly mentions a third-party vehicle, the incident
    // CANNOT be single_vehicle regardless of the damage pattern or skid/ditch language.
    // This guard runs BEFORE physical arbitration so it cannot be overridden downstream.
    const THIRD_PARTY_PATTERNS = [
      /third[\s-]party\s+vehicle/i,
      /third[\s-]party/i,
      /another\s+vehicle/i,
      /other\s+vehicle/i,
      /rammed\s+into\s+a/i,
      /collided\s+with\s+a/i,
      /hit\s+a\s+vehicle/i,
      /struck\s+a\s+vehicle/i,
      /hit\s+another\s+car/i,
      /struck\s+another\s+car/i,
    ];
    const narrativeHasThirdParty = THIRD_PARTY_PATTERNS.some(p => p.test(input.driver_narrative ?? ""));

    let finalType = llmResult.incident_type;
    let finalCanonical = toCanonicalType(llmResult.incident_type);
    let finalConfidence = llmResult.confidence;
    let finalReasoning = llmResult.reasoning;
    let arbitrationOverride = false;

    // Override: LLM says single_vehicle but narrative explicitly mentions a third party
    if (finalType === "single_vehicle" && narrativeHasThirdParty) {
      finalType = "vehicle_collision";
      finalCanonical = "collision";
      finalConfidence = Math.max(finalConfidence, 80);
      finalReasoning = `Third-party narrative override: the driver narrative explicitly mentions a third-party vehicle, which is incompatible with single_vehicle classification. ${finalReasoning}`;
      arbitrationOverride = true;
    }

    // ── PHYSICAL ARBITRATION ──────────────────────────────────────────────────
    // When physical evidence (damage zones + physics direction) strongly contradicts
    // the LLM classification, override with the physically-evidenced type.
    // This prevents narrative ambiguity from overriding hard physical evidence.
    // NOTE: Physical arbitration must NOT override vehicle_collision when the narrative
    // has already confirmed a third party — physical damage patterns alone cannot
    // determine whether another vehicle was involved.
    const physicalArbitrationAllowed = !narrativeHasThirdParty;

    const zones = (input.damage_zones ?? []).map(z => z.toLowerCase());
    const physDir = (input.physics_direction ?? "").toLowerCase();

    // Rule A: LLM says animal_strike but damage is exclusively rear → rear_end
    if (
      physicalArbitrationAllowed &&
      (finalType === "animal_strike" || finalType === "road_hazard") &&
      (zones.includes("rear") || physDir === "rear") &&
      !zones.some(z => ["front", "bonnet", "grille"].includes(z))
    ) {
      finalType = "rear_end_collision";
      finalCanonical = "rear_end";
      finalConfidence = Math.max(finalConfidence, 75);
      finalReasoning = `Physical arbitration override: damage zones [${zones.join(", ")}] and physics direction "${physDir}" indicate rear-end collision, not ${llmResult.incident_type}. ${finalReasoning}`;
      arbitrationOverride = true;
    }

    // Rule B: LLM says rear_end but damage is exclusively front → head_on or single_vehicle
    if (
      physicalArbitrationAllowed &&
      (finalType === "rear_end_collision" || finalType === "rear_end") &&
      (zones.includes("front") || physDir === "frontal") &&
      !zones.some(z => ["rear", "boot", "bumper_rear"].includes(z))
    ) {
      finalType = "head_on_collision";
      finalCanonical = "head_on";
      finalConfidence = Math.max(finalConfidence, 70);
      finalReasoning = `Physical arbitration override: damage zones [${zones.join(", ")}] and physics direction "${physDir}" indicate frontal collision, not rear_end. ${finalReasoning}`;
      arbitrationOverride = true;
    }

    // Rule C: LLM says theft/vandalism but physics shows impact force > 0 → vehicle_collision
    if (
      physicalArbitrationAllowed &&
      (finalType === "theft" || finalType === "vandalism") &&
      physDir !== "" && physDir !== "unknown"
    ) {
      finalType = "vehicle_collision";
      finalCanonical = "collision";
      finalConfidence = 65;
      finalReasoning = `Physical arbitration override: physics analysis found directional impact ("${physDir}") inconsistent with ${llmResult.incident_type}. ${finalReasoning}`;
      arbitrationOverride = true;
    }

    return {
      incident_type: finalType,
      sub_type: arbitrationOverride ? null : llmResult.sub_type,
      confidence: finalConfidence,
      sources_used: sourcesUsed,
      conflict_detected: conflictDetected || arbitrationOverride,
      reasoning: finalReasoning,
      source_detail: sourceDetail,
      canonical_type: finalCanonical,
      method: arbitrationOverride ? "physical_arbitration" : "llm",
      claim_form_stated: claimFormType,
      claim_form_matches: arbitrationOverride ? false : llmResult.claim_form_matches,
    };
  }

  // ── Keyword fallback path ─────────────────────────────────────────────────
  return classifyIncidentSync(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNCHRONOUS KEYWORD-ONLY EXPORT
// For use in test environments and places where async is not available
// ─────────────────────────────────────────────────────────────────────────────

export function classifyIncidentSync(
  input: Omit<IncidentClassificationInput, "photo_context">
): IncidentClassificationResult {
  const sourceClassifications: SourceClassification[] = [];
  const claimFormType = input.claim_form_incident_type?.trim() ?? null;

  if (input.driver_narrative?.trim()) {
    const result = keywordClassifyText(input.driver_narrative);
    sourceClassifications.push({ source: "driver_statement", raw_value: input.driver_narrative, classified_as: result.type, confidence: result.confidence, signals: result.signals });
  }

  if (input.claim_form_incident_type?.trim()) {
    const result = keywordClassifyText(input.claim_form_incident_type);
    sourceClassifications.push({ source: "claim_form", raw_value: input.claim_form_incident_type, classified_as: result.type, confidence: Math.min(result.confidence, 60), signals: result.signals });
  }

  const combinedDamageText = [
    input.damage_description ?? "",
    (input.damage_components ?? []).join(" "),
  ].filter(Boolean).join(" ");
  if (combinedDamageText.trim()) {
    const result = keywordClassifyText(combinedDamageText);
    sourceClassifications.push({ source: "damage_description", raw_value: combinedDamageText.slice(0, 300), classified_as: result.type, confidence: result.confidence, signals: result.signals });
  }

  const TYPE_PRIORITY: Record<ClassifiedIncidentType, number> = {
    animal_strike: 100, rollover: 90, pedestrian_strike: 85,
    rear_end: 80, head_on: 80, sideswipe: 75, single_vehicle: 70,
    theft: 80, fire: 80, flood: 80, vandalism: 80,
    vehicle_collision: 40, unknown: 0,
  };

  const knownSources = sourceClassifications.filter(s => s.classified_as !== "unknown");
  let finalType: ClassifiedIncidentType = "unknown";
  let finalSubType: IncidentSubType = null;
  let finalConfidence = 0;
  let finalReasoning = "No evidence found in any source to determine incident type.";

  if (knownSources.length > 0) {
    const bestSource = knownSources.reduce((best, s) =>
      TYPE_PRIORITY[s.classified_as] > TYPE_PRIORITY[best.classified_as] ? s : best
    );
    finalType = bestSource.classified_as;
    const fullResult = keywordClassifyText(bestSource.raw_value ?? "");
    finalSubType = fullResult.sub_type;
    const agreingSources = knownSources.filter(s => s.classified_as === finalType);
    const avgConf = agreingSources.reduce((sum, s) => sum + s.confidence, 0) / agreingSources.length;
    const disagreingSources = knownSources.filter(s => s.classified_as !== finalType);
    finalConfidence = Math.max(Math.round(avgConf - disagreingSources.length * 5), 10);
    finalReasoning = `[Keyword fallback] Classified as "${finalType}" based on: ${agreingSources.map(s => s.source).join(", ")}.`;
    if (disagreingSources.length > 0) {
      finalReasoning += ` Overriding: ${disagreingSources.map(s => `${s.source} → "${s.classified_as}"`).join(", ")}.`;
    }
  }

  const sourcesUsed: SourceName[] = [];
  if (input.driver_narrative?.trim()) sourcesUsed.push("driver_statement");
  if (input.claim_form_incident_type?.trim()) sourcesUsed.push("claim_form");
  if (combinedDamageText.trim()) sourcesUsed.push("damage_description");

  const uniqueTypes = Array.from(new Set(knownSources.map(s => s.classified_as)));
  // Expected overrides: animal_strike always overrides vehicle_collision — this is NOT a conflict
  // Similarly, specific sub-types (rear_end, rollover, sideswipe, head_on) overriding vehicle_collision is expected
  const EXPECTED_OVERRIDES: Partial<Record<ClassifiedIncidentType, ClassifiedIncidentType[]>> = {
    animal_strike: ["vehicle_collision"],
    rollover: ["vehicle_collision"],
    rear_end: ["vehicle_collision"],
    head_on: ["vehicle_collision"],
    sideswipe: ["vehicle_collision"],
    single_vehicle: ["vehicle_collision"],
    pedestrian_strike: ["vehicle_collision"],
  };
  const isExpectedOverride = uniqueTypes.length === 2 &&
    (EXPECTED_OVERRIDES[finalType] ?? []).some(overridden => uniqueTypes.includes(overridden));
  return {
    incident_type: finalType,
    sub_type: finalSubType,
    confidence: finalConfidence,
    sources_used: sourcesUsed,
    conflict_detected: uniqueTypes.length > 1 && !isExpectedOverride,
    reasoning: finalReasoning,
    source_detail: sourceClassifications,
    canonical_type: toCanonicalType(finalType),
    method: "keyword_fallback",
    claim_form_stated: claimFormType,
    claim_form_matches: finalType === keywordClassifyText(claimFormType ?? "").type,
  };
}
