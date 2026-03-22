/**
 * pipeline-v2/scenarioEngineSelector.ts
 *
 * SCENARIO ENGINE SELECTOR
 *
 * Maps a confirmed incident type (from the Incident Classification Engine)
 * to the correct analytical scenario engine. Also handles extended sub-types:
 * windscreen damage, paint scratching (tree/human), hail, pothole, etc.
 *
 * Rules:
 * - animal_strike → ALWAYS animal_strike_engine
 * - Do NOT default to vehicle_collision_engine unless clearly justified
 * - If unclear → return confidence < 50
 * - Context clues (rural, highway, urban) refine engine selection and parameters
 */

export type ScenarioEngine =
  | "animal_strike_engine"
  | "vehicle_collision_engine"
  | "theft_engine"
  | "fire_engine"
  | "flood_engine"
  | "vandalism_engine"
  | "windscreen_engine"
  | "cosmetic_damage_engine"
  | "weather_event_engine"
  | "unknown_engine";

export type ContextClue = "rural" | "highway" | "urban" | "parking" | "offroad" | "unknown";

export type IncidentSubType =
  // Animal strike sub-types
  | "animal_strike_large"      // cow, horse, buffalo, kudu — high-energy impact
  | "animal_strike_medium"     // dog, sheep, goat, pig
  | "animal_strike_small"      // bird, rabbit, cat
  // Vehicle collision sub-types
  | "rear_end_collision"
  | "head_on_collision"
  | "side_swipe"
  | "rollover"
  | "multi_vehicle"
  | "single_vehicle_impact"    // hit a wall, pole, barrier
  // Cosmetic / minor damage sub-types
  | "windscreen_crack"
  | "windscreen_shatter"
  | "paint_scratch_tree"
  | "paint_scratch_human"
  | "paint_scratch_unknown"
  | "door_ding"
  | "bumper_scuff"
  // Theft sub-types
  | "vehicle_theft"
  | "catalytic_converter_theft"
  | "wheel_theft"
  | "contents_theft"
  // Fire sub-types
  | "engine_fire"
  | "electrical_fire"
  | "arson"
  | "fire_unknown"
  // Flood sub-types
  | "flash_flood"
  | "river_flood"
  | "storm_surge"
  // Weather event sub-types
  | "hail_damage"
  | "wind_damage"
  | "falling_tree"
  | "pothole_damage"
  // Vandalism sub-types
  | "keying"
  | "smashed_windows"
  | "spray_paint"
  | "vandalism_unknown"
  | "unknown";

export interface ScenarioEngineSelectorInput {
  /** Confirmed incident type from the Incident Classification Engine */
  incident_type: string;
  /** Optional sub-type for more precise engine routing */
  incident_sub_type?: string | null;
  /** Vehicle type for context-sensitive routing */
  vehicle_type?: string | null;
  /** Context clues from the claim narrative */
  context_clues?: ContextClue[];
  /** Raw damage description for sub-type inference when sub_type is absent */
  damage_description?: string | null;
  /** Driver narrative for additional context */
  driver_narrative?: string | null;
}

export interface ScenarioEngineParameters {
  /** Whether this engine applies physics reconstruction */
  apply_physics: boolean;
  /** Whether structural integrity checks are required */
  check_structural_integrity: boolean;
  /** Whether airbag deployment is relevant */
  check_airbag: boolean;
  /** Whether a police report is expected */
  expect_police_report: boolean;
  /** Whether a third-party vehicle is involved */
  third_party_involved: boolean;
  /** Minimum photo evidence required for this engine */
  min_photo_count: number;
  /** Whether speed estimation is relevant */
  speed_relevant: boolean;
  /** Notes for the adjuster on what to look for */
  adjuster_notes: string[];
}

export interface ScenarioEngineSelectorOutput {
  /** The selected analytical engine */
  selected_engine: ScenarioEngine;
  /** Detected or inferred sub-type */
  detected_sub_type: IncidentSubType;
  /** Confidence in the engine selection (0–100) */
  confidence: number;
  /** Reasoning for the selection */
  reasoning: string;
  /** Engine-specific parameters for downstream stages */
  engine_parameters: ScenarioEngineParameters;
  /** Whether this is a minor/cosmetic-only claim (fast-track eligible) */
  is_minor_claim: boolean;
  /** Whether the claim requires specialist assessment */
  requires_specialist: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD MAPS FOR SUB-TYPE INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

const ANIMAL_LARGE_KEYWORDS = [
  "cow", "cattle", "bull", "horse", "donkey", "buffalo", "kudu", "eland",
  "wildebeest", "zebra", "impala", "warthog", "baboon", "giraffe", "elephant",
  "rhino", "hippo", "large animal",
];

const ANIMAL_MEDIUM_KEYWORDS = [
  "dog", "sheep", "goat", "pig", "porcupine", "medium animal",
];

const ANIMAL_SMALL_KEYWORDS = [
  "bird", "rabbit", "chicken", "small animal", "fowl",
  // Note: "cat" intentionally omitted — too ambiguous (catalytic converter)
];

const WINDSCREEN_KEYWORDS = [
  "windscreen", "windshield", "crack", "chip", "stone chip", "glass crack",
  "front glass", "rear glass", "side window", "window crack", "cracked glass",
];

const PAINT_SCRATCH_TREE_KEYWORDS = [
  "tree", "branch", "bush", "shrub", "vegetation", "thorns", "bark",
  "scraped by tree", "scratched by branch",
];

const PAINT_SCRATCH_HUMAN_KEYWORDS = [
  // "keyed" intentionally omitted here — it is handled by the vandalism block first
  "key scratch", "scratched by person", "human scratch",
  "intentional scratch", "deliberately scratched",
];

const HAIL_KEYWORDS = [
  "hail", "hailstorm", "hailstone", "dent", "dents all over", "multiple dents",
  "storm damage", "weather damage",
];

const POTHOLE_KEYWORDS = [
  "pothole", "road damage", "tyre damage", "rim damage", "suspension damage",
  "hit a hole", "road hazard",
];

const FALLING_TREE_KEYWORDS = [
  "tree fell", "fallen tree", "tree on car", "branch fell", "tree collapsed",
  "storm tree",
];

const CATALYTIC_KEYWORDS = [
  "catalytic converter", "cat converter", "exhaust stolen", "exhaust cut",
];

const WHEEL_THEFT_KEYWORDS = [
  "wheels stolen", "tyres stolen", "rims stolen", "wheel theft",
  "wheels and tyres", "wheels were stolen", "tyres were stolen",
];

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE PARAMETER PRESETS
// ─────────────────────────────────────────────────────────────────────────────

const ENGINE_PARAMETERS: Record<ScenarioEngine, ScenarioEngineParameters> = {
  animal_strike_engine: {
    apply_physics: true,
    check_structural_integrity: true,
    check_airbag: true,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 3,
    speed_relevant: true,
    adjuster_notes: [
      "Verify animal species — large livestock (cow, horse) cause significantly more structural damage than small animals.",
      "Check for secondary damage: radiator, intercooler, fan cowling, bull bar, bonnet.",
      "Police report is not always required for animal strikes — do not penalise absence.",
      "Confirm time of incident: dawn/dusk animal movement patterns support claim plausibility.",
      "Rural highway context strongly supports animal strike plausibility.",
    ],
  },
  vehicle_collision_engine: {
    apply_physics: true,
    check_structural_integrity: true,
    check_airbag: true,
    expect_police_report: true,
    third_party_involved: true,
    min_photo_count: 4,
    speed_relevant: true,
    adjuster_notes: [
      "Verify third-party vehicle details — registration, insurer, driver.",
      "Check damage pattern is consistent with stated collision direction.",
      "Police report is expected for vehicle-to-vehicle collisions.",
      "Airbag deployment should be consistent with stated impact speed.",
    ],
  },
  theft_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: true,
    third_party_involved: false,
    min_photo_count: 2,
    speed_relevant: false,
    adjuster_notes: [
      "Police report is mandatory for vehicle theft claims.",
      "Check for forced entry evidence: broken locks, ignition damage.",
      "Verify vehicle tracking system status if applicable.",
      "Review CCTV or witness statements if available.",
    ],
  },
  fire_engine: {
    apply_physics: false,
    check_structural_integrity: true,
    check_airbag: false,
    expect_police_report: true,
    third_party_involved: false,
    min_photo_count: 4,
    speed_relevant: false,
    adjuster_notes: [
      "Fire investigator report is required for significant fire damage.",
      "Check for arson indicators: multiple ignition points, accelerant traces.",
      "Verify fire brigade attendance record.",
      "Engine fire may indicate mechanical failure — check service history.",
    ],
  },
  flood_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 3,
    speed_relevant: false,
    adjuster_notes: [
      "Verify weather records for the incident date and location.",
      "Check waterline marks on interior for flood depth assessment.",
      "Engine hydro-lock is a common total-loss indicator.",
      "Electrical system damage is expected in flood claims.",
    ],
  },
  vandalism_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: true,
    third_party_involved: false,
    min_photo_count: 3,
    speed_relevant: false,
    adjuster_notes: [
      "Police report is expected for vandalism claims.",
      "Check for pattern of damage consistent with stated vandalism type.",
      "Keying damage: look for uniform scratch depth and direction.",
      "Spray paint: check for overspray on adjacent panels.",
    ],
  },
  windscreen_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 2,
    speed_relevant: false,
    adjuster_notes: [
      "Windscreen claims are fast-track eligible if no structural damage is present.",
      "Verify crack origin: stone chip cracks have a distinct impact point.",
      "Check for stress cracks (temperature/age) vs impact cracks.",
      "ADAS recalibration may be required after windscreen replacement.",
    ],
  },
  cosmetic_damage_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 2,
    speed_relevant: false,
    adjuster_notes: [
      "Cosmetic claims are fast-track eligible.",
      "Verify scratch depth: surface clear coat vs primer vs metal.",
      "Tree scratches typically show irregular, branching patterns.",
      "Human scratches (keying) are typically uniform and linear.",
      "Check for pre-existing damage in the same area.",
    ],
  },
  weather_event_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 3,
    speed_relevant: false,
    adjuster_notes: [
      "Verify weather event with meteorological records for date and location.",
      "Hail damage: check for uniform dent distribution consistent with hail trajectory.",
      "Falling tree: verify tree condition (diseased, storm-felled) vs pre-existing.",
      "Pothole damage: check local authority road condition records.",
    ],
  },
  unknown_engine: {
    apply_physics: false,
    check_structural_integrity: false,
    check_airbag: false,
    expect_police_report: false,
    third_party_involved: false,
    min_photo_count: 2,
    speed_relevant: false,
    adjuster_notes: [
      "Incident type could not be determined — manual adjuster review required.",
      "Re-run the Incident Classification Engine with additional source documents.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: KEYWORD MATCH
// ─────────────────────────────────────────────────────────────────────────────

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function combineText(input: ScenarioEngineSelectorInput): string {
  return [
    input.damage_description ?? "",
    input.driver_narrative ?? "",
    input.incident_sub_type ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TYPE INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function inferAnimalSubType(text: string): IncidentSubType {
  if (matchesAny(text, ANIMAL_LARGE_KEYWORDS)) return "animal_strike_large";
  if (matchesAny(text, ANIMAL_MEDIUM_KEYWORDS)) return "animal_strike_medium";
  if (matchesAny(text, ANIMAL_SMALL_KEYWORDS)) return "animal_strike_small";
  return "animal_strike_large"; // Default to large — conservative assumption
}

function inferTheftSubType(text: string): IncidentSubType {
  if (matchesAny(text, CATALYTIC_KEYWORDS)) return "catalytic_converter_theft";
  if (matchesAny(text, WHEEL_THEFT_KEYWORDS)) return "wheel_theft";
  // Check smashed windows before contents — window smashing is a distinct sub-type
  if (matchesAny(text, ["smashed", "broken window", "shattered window"])) return "contents_theft";
  if (matchesAny(text, ["contents", "bag", "laptop", "phone", "stolen from"])) return "contents_theft";
  return "vehicle_theft";
}

function inferVandalismSubType(text: string): IncidentSubType {
  // smashed_windows checked first — takes priority over keying/spray
  if (matchesAny(text, ["smashed", "broken window", "shattered window", "smashed window"])) return "smashed_windows";
  if (matchesAny(text, ["keyed", "key scratch", "scratched by person", "key mark"])) return "keying";
  if (matchesAny(text, ["spray paint", "graffiti", "painted"])) return "spray_paint";
  return "vandalism_unknown";
}

function inferFireSubType(text: string): IncidentSubType {
  if (matchesAny(text, ["engine fire", "engine bay", "bonnet fire"])) return "engine_fire";
  if (matchesAny(text, ["electrical", "wiring", "short circuit"])) return "electrical_fire";
  if (matchesAny(text, ["arson", "deliberately", "intentional", "set alight"])) return "arson";
  return "fire_unknown";
}

function inferWeatherSubType(text: string): IncidentSubType {
  if (matchesAny(text, HAIL_KEYWORDS)) return "hail_damage";
  if (matchesAny(text, FALLING_TREE_KEYWORDS)) return "falling_tree";
  if (matchesAny(text, POTHOLE_KEYWORDS)) return "pothole_damage";
  if (matchesAny(text, ["wind", "storm", "gale"])) return "wind_damage";
  return "hail_damage";
}

function inferCosmeticSubType(text: string): IncidentSubType {
  if (matchesAny(text, WINDSCREEN_KEYWORDS)) return "windscreen_crack";
  if (matchesAny(text, PAINT_SCRATCH_TREE_KEYWORDS)) return "paint_scratch_tree";
  // "keyed" is safe here because this function is only called when incident_type is explicitly cosmetic
  if (matchesAny(text, [...PAINT_SCRATCH_HUMAN_KEYWORDS, "keyed", "key marks", "key mark"])) return "paint_scratch_human";
  if (matchesAny(text, ["door ding", "parking dent", "door dent"])) return "door_ding";
  if (matchesAny(text, ["bumper scuff", "bumper scratch", "bumper rub"])) return "bumper_scuff";
  return "paint_scratch_unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT CLUE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

function extractContextClues(
  input: ScenarioEngineSelectorInput
): ContextClue[] {
  if (input.context_clues && input.context_clues.length > 0) {
    return input.context_clues;
  }

  const text = combineText(input);
  const clues: ContextClue[] = [];

  if (matchesAny(text, ["highway", "motorway", "freeway", "national road", "n1", "n2", "n3", "n4"])) {
    clues.push("highway");
  }
  if (matchesAny(text, ["rural", "farm", "gravel road", "dirt road", "country road", "game farm"])) {
    clues.push("rural");
  }
  if (matchesAny(text, ["urban", "city", "town", "suburb", "street", "intersection", "traffic"])) {
    clues.push("urban");
  }
  if (matchesAny(text, ["parking", "car park", "parking lot", "garage", "parked"])) {
    clues.push("parking");
  }
  if (matchesAny(text, ["offroad", "off-road", "4x4", "bush", "trail", "track"])) {
    clues.push("offroad");
  }

  return clues.length > 0 ? clues : ["unknown"];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

export function selectScenarioEngine(
  input: ScenarioEngineSelectorInput
): ScenarioEngineSelectorOutput {
  const incidentType = (input.incident_type ?? "unknown").toLowerCase().trim();
  const combinedText = combineText(input);
  const contextClues = extractContextClues(input);

  // ── ANIMAL STRIKE ──────────────────────────────────────────────────────────
  // Hard rule: any animal mention → animal_strike_engine, no exceptions
  if (
    incidentType === "animal_strike" ||
    incidentType.includes("animal") ||
    matchesAny(combinedText, [...ANIMAL_LARGE_KEYWORDS, ...ANIMAL_MEDIUM_KEYWORDS, ...ANIMAL_SMALL_KEYWORDS])
  ) {
    const subType = inferAnimalSubType(combinedText);
    const isLarge = subType === "animal_strike_large";
    const isHighway = contextClues.includes("highway") || contextClues.includes("rural");

    let confidence = 90;
    if (incidentType === "animal_strike") confidence = 97;
    // When incident_type was 'collision' but animal keywords override → high confidence
    if (incidentType !== "animal_strike" && matchesAny(combinedText, [...ANIMAL_LARGE_KEYWORDS, ...ANIMAL_MEDIUM_KEYWORDS, ...ANIMAL_SMALL_KEYWORDS])) {
      confidence = 95;
    }
    if (isHighway) confidence = Math.min(confidence + 2, 100);

    return {
      selected_engine: "animal_strike_engine",
      detected_sub_type: subType,
      confidence,
      reasoning:
        `Incident type confirmed as animal_strike. ` +
        `Sub-type detected: ${subType}. ` +
        (isLarge
          ? "Large animal impact — full structural analysis and physics reconstruction required. "
          : "Medium/small animal impact — structural damage less likely but should be verified. ") +
        (isHighway
          ? "Highway/rural context supports animal strike plausibility at speed."
          : "Context does not confirm highway/rural setting — verify incident location."),
      engine_parameters: ENGINE_PARAMETERS.animal_strike_engine,
      is_minor_claim: !isLarge,
      requires_specialist: isLarge,
    };
  }

  // ── EXPLICIT INCIDENT TYPE TAKES ABSOLUTE PRIORITY ─────────────────────────────────
  // When the incident_type is explicitly set to a known type, route directly
  // without allowing keyword matches from other categories to override.
  if (incidentType === "cosmetic" || incidentType.includes("scratch") || incidentType.includes("paint")) {
    const subType = inferCosmeticSubType(combinedText);
    const isHumanScratching = subType === "paint_scratch_human";
    return {
      selected_engine: "cosmetic_damage_engine",
      detected_sub_type: subType,
      confidence: 88,
      reasoning:
        `Cosmetic or paint damage detected. Sub-type: ${subType}. ` +
        (isHumanScratching
          ? "Human-inflicted scratching detected — consider vandalism_engine if intentional damage is confirmed."
          : "Environmental or accidental cosmetic damage. Fast-track eligible."),
      engine_parameters: ENGINE_PARAMETERS.cosmetic_damage_engine,
      is_minor_claim: true,
      requires_specialist: false,
    };
  }

  if (incidentType === "vandalism") {
    const subType = inferVandalismSubType(combinedText);
    return {
      selected_engine: "vandalism_engine",
      detected_sub_type: subType,
      confidence: 88,
      reasoning:
        `Vandalism detected. Sub-type: ${subType}. ` +
        `Police report is expected. Vandalism engine selected for intentional damage pattern analysis.`,
      engine_parameters: ENGINE_PARAMETERS.vandalism_engine,
      is_minor_claim: subType === "keying" || subType === "spray_paint",
      requires_specialist: false,
    };
  }

  // ── FLOOD (explicit — before weather to avoid fallthrough to unknown) ────────
  if (
    incidentType === "flood" ||
    matchesAny(combinedText, ["flood", "submerged", "water damage", "river flood", "storm surge"])
  ) {
    const subType: IncidentSubType = matchesAny(combinedText, ["flash flood", "flash"])
      ? "flash_flood"
      : matchesAny(combinedText, ["river", "river flood"])
      ? "river_flood"
      : "storm_surge";
    return {
      selected_engine: "flood_engine",
      detected_sub_type: subType,
      confidence: 90,
      reasoning:
        "Flood or water damage confirmed. Flood engine selected for water ingress and electrical damage assessment.",
      engine_parameters: ENGINE_PARAMETERS.flood_engine,
      is_minor_claim: false,
      requires_specialist: true,
    };
  }

  // ── THEFT (before vandalism — catalytic/wheel theft is not vandalism) ─────────
  if (
    incidentType === "theft" ||
    matchesAny(combinedText, ["stolen", "theft", "hijack", "hijacked", "carjack", "broke in",
      ...CATALYTIC_KEYWORDS, ...WHEEL_THEFT_KEYWORDS])
  ) {
    const subType = inferTheftSubType(combinedText);
    return {
      selected_engine: "theft_engine",
      detected_sub_type: subType,
      confidence: 92,
      reasoning:
        `Theft incident detected. Sub-type: ${subType}. ` +
        `Police report is mandatory. Theft engine selected for forced entry and tracking analysis.`,
      engine_parameters: ENGINE_PARAMETERS.theft_engine,
      is_minor_claim: false,
      requires_specialist: false,
    };
  }

  // ── VANDALISM (before cosmetic — keying/smashed_windows must not match paint scratch) ─
  if (
    incidentType === "vandalism" ||
    matchesAny(combinedText, ["vandal", "vandalised", "vandalized", "keyed", "graffiti",
      "spray paint", "smashed windows", "windows smashed", "smashed and contents"])
  ) {
    const subType = inferVandalismSubType(combinedText);
    return {
      selected_engine: "vandalism_engine",
      detected_sub_type: subType,
      confidence: 88,
      reasoning:
        `Vandalism detected. Sub-type: ${subType}. ` +
        `Police report is expected. Vandalism engine selected for intentional damage pattern analysis.`,
      engine_parameters: ENGINE_PARAMETERS.vandalism_engine,
      is_minor_claim: subType === "keying" || subType === "spray_paint",
      requires_specialist: false,
    };
  }

  // ── WINDSCREEN DAMAGE ──────────────────────────────────────────────────────
  // Detected before cosmetic to avoid misrouting stone chip → cosmetic
  if (
    incidentType === "windscreen" ||
    incidentType.includes("windscreen") ||
    incidentType.includes("glass") ||
    matchesAny(combinedText, WINDSCREEN_KEYWORDS)
  ) {
    const subType: IncidentSubType = matchesAny(combinedText, ["shatter", "completely broken", "smashed"])
      ? "windscreen_shatter"
      : "windscreen_crack";

    return {
      selected_engine: "windscreen_engine",
      detected_sub_type: subType,
      confidence: 92,
      reasoning:
        `Windscreen or glass damage detected. ` +
        `Sub-type: ${subType}. ` +
        `Fast-track eligible if no structural damage is present. ` +
        `ADAS recalibration may be required after replacement.`,
      engine_parameters: ENGINE_PARAMETERS.windscreen_engine,
      is_minor_claim: true,
      requires_specialist: false,
    };
  }

  // ── WEATHER EVENT (before cosmetic — "tree" keyword must not match paint_scratch_tree) ─
  if (
    incidentType === "weather" ||
    incidentType.includes("hail") ||
    incidentType.includes("storm") ||
    matchesAny(combinedText, [...HAIL_KEYWORDS, ...FALLING_TREE_KEYWORDS, ...POTHOLE_KEYWORDS])
  ) {
    // Distinguish flood from general weather
    if (
      incidentType === "flood" ||
      matchesAny(combinedText, ["flood", "submerged", "water damage", "river", "storm surge"])
    ) {
      return {
        selected_engine: "flood_engine",
        detected_sub_type: matchesAny(combinedText, ["flash flood", "flash"]) ? "flash_flood" :
          matchesAny(combinedText, ["river", "river flood"]) ? "river_flood" : "storm_surge",
        confidence: 88,
        reasoning:
          "Flood or water damage detected. Flood engine selected for water ingress and electrical damage assessment.",
        engine_parameters: ENGINE_PARAMETERS.flood_engine,
        is_minor_claim: false,
        requires_specialist: true,
      };
    }

    const subType = inferWeatherSubType(combinedText);
    return {
      selected_engine: "weather_event_engine",
      detected_sub_type: subType,
      confidence: 85,
      reasoning:
        `Weather event damage detected. Sub-type: ${subType}. ` +
        `Meteorological records should be verified for incident date and location.`,
      engine_parameters: ENGINE_PARAMETERS.weather_event_engine,
      is_minor_claim: subType === "hail_damage" || subType === "wind_damage",
      requires_specialist: subType === "falling_tree",
    };
  }

  // ── COSMETIC / PAINT DAMAGE ────────────────────────────────────────────────
  if (
    incidentType === "cosmetic" ||
    incidentType.includes("scratch") ||
    incidentType.includes("paint") ||
    matchesAny(combinedText, [
      ...PAINT_SCRATCH_TREE_KEYWORDS,
      ...PAINT_SCRATCH_HUMAN_KEYWORDS,
      "door ding", "bumper scuff", "surface scratch", "paint damage",
    ])
  ) {
    const subType = inferCosmeticSubType(combinedText);
    const isHumanScratching = subType === "paint_scratch_human";

    return {
      selected_engine: "cosmetic_damage_engine",
      detected_sub_type: subType,
      confidence: 88,
      reasoning:
        `Cosmetic or paint damage detected. Sub-type: ${subType}. ` +
        (isHumanScratching
          ? "Human-inflicted scratching detected — consider vandalism_engine if intentional damage is confirmed."
          : "Environmental or accidental cosmetic damage. Fast-track eligible."),
      engine_parameters: ENGINE_PARAMETERS.cosmetic_damage_engine,
      is_minor_claim: true,
      requires_specialist: false,
    };
  }


  // ── FIRE ───────────────────────────────────────────────────────────────────
  if (incidentType === "fire" || matchesAny(combinedText, ["fire", "burnt", "burned", "flames", "smoke damage"])) {
    const subType = inferFireSubType(combinedText);
    return {
      selected_engine: "fire_engine",
      detected_sub_type: subType,
      confidence: 90,
      reasoning:
        `Fire incident detected. Sub-type: ${subType}. ` +
        (subType === "arson"
          ? "Arson indicators present — police report and fire investigator report are required."
          : "Fire engine selected for burn pattern and origin analysis."),
      engine_parameters: ENGINE_PARAMETERS.fire_engine,
      is_minor_claim: false,
      requires_specialist: true,
    };
  }


  // ── VEHICLE COLLISION ──────────────────────────────────────────────────────
  // Only selected when explicitly confirmed — never as a default
  if (
    incidentType === "collision" ||
    incidentType === "vehicle_collision" ||
    incidentType.includes("collision") ||
    matchesAny(combinedText, [
      "collided with", "hit by vehicle", "third party", "rear ended", "head on",
      "side impact", "t-bone", "vehicle accident",
    ])
  ) {
    const isRearEnd = matchesAny(combinedText, ["rear end", "rear ended", "hit from behind"]);
    const isHeadOn = matchesAny(combinedText, ["head on", "head-on", "frontal collision"]);
    const subType: IncidentSubType = isRearEnd
      ? "rear_end_collision"
      : isHeadOn
      ? "head_on_collision"
      : "single_vehicle_impact";

    const isHighSpeed = contextClues.includes("highway");
    return {
      selected_engine: "vehicle_collision_engine",
      detected_sub_type: subType,
      confidence: 85,
      reasoning:
        `Vehicle collision explicitly confirmed. Sub-type: ${subType}. ` +
        (isHighSpeed
          ? "Highway context — high-energy impact likely. Full structural analysis required."
          : "Vehicle collision engine selected for physics reconstruction and third-party verification."),
      engine_parameters: ENGINE_PARAMETERS.vehicle_collision_engine,
      is_minor_claim: false,
      requires_specialist: isHighSpeed,
    };
  }

  // ── UNKNOWN ────────────────────────────────────────────────────────────────
  return {
    selected_engine: "unknown_engine",
    detected_sub_type: "unknown",
    confidence: 20,
    reasoning:
      `Incident type '${input.incident_type}' could not be mapped to a known scenario engine. ` +
      `Manual adjuster review is required. Re-run the Incident Classification Engine with additional source documents.`,
    engine_parameters: ENGINE_PARAMETERS.unknown_engine,
    is_minor_claim: false,
    requires_specialist: false,
  };
}
