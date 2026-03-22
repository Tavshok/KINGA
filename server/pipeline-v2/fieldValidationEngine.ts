/**
 * pipeline-v2/fieldValidationEngine.ts
 *
 * Field Validation Engine
 *
 * Resolves the authoritative value for four focus fields using a strict
 * source priority hierarchy:
 *
 *   1. claim_form      — highest authority (stated by claimant on official form)
 *   2. assessor        — professional assessor report / strip inspection
 *   3. narrative       — driver narrative / incident description
 *   4. ocr             — OCR-extracted text (may contain recognition errors)
 *   5. inferred        — AI-estimated / model-derived value (lowest authority)
 *
 * RULES:
 * - ALWAYS prefer claim_form over inferred values
 * - If inferred ≠ stated → flag conflict
 * - NEVER overwrite a stated value with an AI estimate
 * - Conflicts are reported with resolution explanation
 *
 * Focus fields:
 *   - speed_kmh
 *   - incident_type
 *   - repair_cost
 *   - market_value
 *
 * This engine was introduced to prevent the Mazda audit failure where:
 *   - The claim form stated 90 km/h
 *   - The AI physics model inferred 17 km/h
 *   - The inferred value was used, invalidating all downstream analysis
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type FieldSource =
  | "claim_form"
  | "assessor"
  | "narrative"
  | "ocr"
  | "inferred";

/** Priority ranking — lower number = higher authority */
const SOURCE_PRIORITY: Record<FieldSource, number> = {
  claim_form: 1,
  assessor: 2,
  narrative: 3,
  ocr: 4,
  inferred: 5,
};

export interface ValidatedFieldValue<T> {
  value: T | null;
  source: FieldSource;
  confidence: number; // 0–100
  /** All candidate values considered, in priority order */
  candidates: FieldCandidate<T>[];
}

export interface FieldCandidate<T> {
  value: T;
  source: FieldSource;
  confidence: number;
  raw_text?: string; // The original text this was extracted from
}

export interface FieldConflict {
  field: string;
  values: Array<{ source: FieldSource; value: unknown }>;
  resolution: string;
}

export interface FieldValidationInput {
  // ── speed_kmh ──────────────────────────────────────────────────────────────
  /** Speed stated on the claim form (e.g. "90 km/h" → 90) */
  speed_claim_form?: number | null;
  /** Speed stated in the assessor report */
  speed_assessor?: number | null;
  /** Speed mentioned in the driver narrative */
  speed_narrative?: number | null;
  /** Speed extracted by OCR from documents */
  speed_ocr?: number | null;
  /** Speed estimated by the AI physics model */
  speed_inferred?: number | null;
  /** Raw narrative text for speed extraction */
  narrative_text?: string | null;

  // ── incident_type ──────────────────────────────────────────────────────────
  /** Incident type stated on the claim form */
  incident_type_claim_form?: string | null;
  /** Incident type from the assessor report */
  incident_type_assessor?: string | null;
  /** Incident type inferred from driver narrative */
  incident_type_narrative?: string | null;
  /** Incident type extracted by OCR */
  incident_type_ocr?: string | null;
  /** Incident type inferred by AI */
  incident_type_inferred?: string | null;

  // ── repair_cost ────────────────────────────────────────────────────────────
  /** Repair cost agreed with assessor / on claim form (USD) */
  repair_cost_claim_form?: number | null;
  /** Repair cost from the assessor report (USD) */
  repair_cost_assessor?: number | null;
  /** Repair cost mentioned in driver narrative (USD) */
  repair_cost_narrative?: number | null;
  /** Repair cost extracted by OCR (USD) */
  repair_cost_ocr?: number | null;
  /** Repair cost estimated by AI (USD) */
  repair_cost_inferred?: number | null;

  // ── market_value ───────────────────────────────────────────────────────────
  /** Market value stated on the claim form (USD) */
  market_value_claim_form?: number | null;
  /** Market value from the assessor report (USD) */
  market_value_assessor?: number | null;
  /** Market value mentioned in driver narrative (USD) */
  market_value_narrative?: number | null;
  /** Market value extracted by OCR (USD) */
  market_value_ocr?: number | null;
  /** Market value estimated by AI (USD) */
  market_value_inferred?: number | null;
}

export interface FieldValidationResult {
  validated_fields: {
    speed_kmh: ValidatedFieldValue<number>;
    incident_type: ValidatedFieldValue<string>;
    repair_cost: ValidatedFieldValue<number>;
    market_value: ValidatedFieldValue<number>;
  };
  conflicts: FieldConflict[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEED EXTRACTION FROM NARRATIVE TEXT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a speed value from free text.
 * Handles patterns like:
 *   "90 km/h", "90km/h", "90 kph", "90 kmph",
 *   "travelling at 90", "speed of 90", "doing 90"
 */
export function extractSpeedFromText(text: string | null | undefined): number | null {
  if (!text) return null;

  const patterns = [
    // Explicit km/h patterns
    /(\d{1,3})\s*km\/h/i,
    /(\d{1,3})\s*kph/i,
    /(\d{1,3})\s*kmph/i,
    /(\d{1,3})\s*kilometers?\s*per\s*hour/i,
    /(\d{1,3})\s*kilometres?\s*per\s*hour/i,
    // Contextual speed patterns
    /travelling\s+at\s+(\d{1,3})/i,
    /traveling\s+at\s+(\d{1,3})/i,
    /speed\s+of\s+(\d{1,3})/i,
    /doing\s+(\d{1,3})/i,
    /going\s+(\d{1,3})/i,
    /at\s+(\d{1,3})\s*km/i,
    /at\s+(\d{1,3})\s*kph/i,
    // "90 km/h" with surrounding context
    /\bat\s+(\d{1,3})\b(?!\s*%)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const speed = parseInt(match[1], 10);
      // Sanity check: valid road speed range 1–200 km/h
      if (speed >= 1 && speed <= 200) {
        return speed;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT TYPE NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

const INCIDENT_TYPE_ALIASES: Record<string, string> = {
  // Animal strike
  "animal_strike": "animal_strike",
  "animal strike": "animal_strike",
  "animal": "animal_strike",
  "wildlife": "animal_strike",
  "livestock": "animal_strike",
  // Collision
  "collision": "vehicle_collision",
  "vehicle_collision": "vehicle_collision",
  "accident": "vehicle_collision",
  "crash": "vehicle_collision",
  "mva": "vehicle_collision",
  "motor vehicle accident": "vehicle_collision",
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

function normaliseIncidentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[_\-]/g, " ").trim();
  return INCIDENT_TYPE_ALIASES[key] || raw.toLowerCase().trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC PRIORITY RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the authoritative value from a set of candidates.
 * Picks the candidate with the highest source authority (lowest priority number).
 * Never overwrites a stated value with an inferred one.
 */
function resolveField<T>(
  candidates: FieldCandidate<T>[]
): ValidatedFieldValue<T> {
  const valid = candidates.filter((c) => c.value !== null && c.value !== undefined);

  if (valid.length === 0) {
    return {
      value: null,
      source: "inferred",
      confidence: 0,
      candidates: [],
    };
  }

  // Sort by source priority (ascending = highest authority first)
  const sorted = [...valid].sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  );

  const winner = sorted[0];

  return {
    value: winner.value,
    source: winner.source,
    confidence: winner.confidence,
    candidates: sorted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect conflicts between stated values and inferred values.
 *
 * A conflict is raised when:
 * - An inferred value differs materially from a stated value
 * - Two stated values from different sources disagree
 *
 * For numeric fields: "material difference" = >20% deviation
 * For string fields: different normalised values
 */
function detectNumericConflict(
  fieldName: string,
  resolved: ValidatedFieldValue<number>,
  candidates: FieldCandidate<number>[],
  thresholdPct: number = 20
): FieldConflict | null {
  const stated = candidates.filter(
    (c) => c.source !== "inferred" && c.value !== null
  );
  const inferred = candidates.filter(
    (c) => c.source === "inferred" && c.value !== null
  );

  if (stated.length === 0 || inferred.length === 0) {
    // Check for disagreement between stated sources
    if (stated.length >= 2) {
      const values = stated.map((c) => c.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (min > 0 && (max - min) / min > thresholdPct / 100) {
        return {
          field: fieldName,
          values: stated.map((c) => ({ source: c.source, value: c.value })),
          resolution: `Conflict between stated sources. Highest authority (${resolved.source}) value of ${resolved.value} used.`,
        };
      }
    }
    return null;
  }

  // Check inferred vs stated
  const statedWinner = stated.sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  )[0];
  const inferredValue = inferred[0].value;

  if (statedWinner.value === null || statedWinner.value === 0) return null;

  const deviation = Math.abs(inferredValue - statedWinner.value) / statedWinner.value;

  if (deviation > thresholdPct / 100) {
    return {
      field: fieldName,
      values: [
        { source: statedWinner.source, value: statedWinner.value },
        { source: "inferred", value: inferredValue },
      ],
      resolution: `Stated value (${statedWinner.source}: ${statedWinner.value}) differs from AI estimate (${inferredValue}) by ${Math.round(deviation * 100)}%. Stated value retained — AI estimate discarded.`,
    };
  }

  return null;
}

function detectStringConflict(
  fieldName: string,
  resolved: ValidatedFieldValue<string>,
  candidates: FieldCandidate<string>[]
): FieldConflict | null {
  const stated = candidates.filter(
    (c) => c.source !== "inferred" && c.value !== null
  );
  const inferred = candidates.filter(
    (c) => c.source === "inferred" && c.value !== null
  );

  if (stated.length === 0 || inferred.length === 0) {
    // Check for disagreement between stated sources
    if (stated.length >= 2) {
      const uniqueValues = Array.from(new Set(stated.map((c) => c.value)));
      if (uniqueValues.length > 1) {
        return {
          field: fieldName,
          values: stated.map((c) => ({ source: c.source, value: c.value })),
          resolution: `Conflict between stated sources. Highest authority (${resolved.source}: "${resolved.value}") used.`,
        };
      }
    }
    return null;
  }

  const statedWinner = stated.sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]
  )[0];
  const inferredValue = inferred[0].value;

  if (statedWinner.value !== inferredValue) {
    return {
      field: fieldName,
      values: [
        { source: statedWinner.source, value: statedWinner.value },
        { source: "inferred", value: inferredValue },
      ],
      resolution: `Stated value (${statedWinner.source}: "${statedWinner.value}") differs from AI estimate ("${inferredValue}"). Stated value retained — AI estimate discarded.`,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORING
// ─────────────────────────────────────────────────────────────────────────────

function sourceConfidence(source: FieldSource, hasValue: boolean): number {
  if (!hasValue) return 0;
  switch (source) {
    case "claim_form": return 95;
    case "assessor":   return 85;
    case "narrative":  return 70;
    case "ocr":        return 60;
    case "inferred":   return 40;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and arbitrate the four focus fields using source priority.
 *
 * @param input - All available candidate values from all sources
 * @returns FieldValidationResult — the exact JSON contract specified
 */
export function validateFields(input: FieldValidationInput): FieldValidationResult {
  const conflicts: FieldConflict[] = [];

  // ── 1. speed_kmh ───────────────────────────────────────────────────────────

  // Attempt to extract speed from narrative text if not already provided
  const speedFromNarrative =
    input.speed_narrative ??
    extractSpeedFromText(input.narrative_text ?? null);

  const speedCandidates: FieldCandidate<number>[] = [
    { source: "claim_form", value: input.speed_claim_form ?? null as any, confidence: sourceConfidence("claim_form", input.speed_claim_form != null) },
    { source: "assessor",   value: input.speed_assessor ?? null as any,   confidence: sourceConfidence("assessor",   input.speed_assessor != null) },
    { source: "narrative",  value: speedFromNarrative ?? null as any,     confidence: sourceConfidence("narrative",  speedFromNarrative != null) },
    { source: "ocr",        value: input.speed_ocr ?? null as any,        confidence: sourceConfidence("ocr",        input.speed_ocr != null) },
    { source: "inferred",   value: input.speed_inferred ?? null as any,   confidence: sourceConfidence("inferred",   input.speed_inferred != null) },
  ].filter((c) => c.value !== null && c.value !== undefined) as FieldCandidate<number>[];

  const speedResolved = resolveField<number>(speedCandidates);
  const speedConflict = detectNumericConflict("speed_kmh", speedResolved, speedCandidates, 20);
  if (speedConflict) conflicts.push(speedConflict);

  // ── 2. incident_type ───────────────────────────────────────────────────────

  const incidentCandidates: FieldCandidate<string>[] = [
    { source: "claim_form", value: normaliseIncidentType(input.incident_type_claim_form) ?? null as any, confidence: sourceConfidence("claim_form", input.incident_type_claim_form != null) },
    { source: "assessor",   value: normaliseIncidentType(input.incident_type_assessor) ?? null as any,   confidence: sourceConfidence("assessor",   input.incident_type_assessor != null) },
    { source: "narrative",  value: normaliseIncidentType(input.incident_type_narrative) ?? null as any,  confidence: sourceConfidence("narrative",  input.incident_type_narrative != null) },
    { source: "ocr",        value: normaliseIncidentType(input.incident_type_ocr) ?? null as any,        confidence: sourceConfidence("ocr",        input.incident_type_ocr != null) },
    { source: "inferred",   value: normaliseIncidentType(input.incident_type_inferred) ?? null as any,   confidence: sourceConfidence("inferred",   input.incident_type_inferred != null) },
  ].filter((c) => c.value !== null && c.value !== undefined) as FieldCandidate<string>[];

  // Special rule: animal_strike in ANY non-inferred source overrides collision
  const animalStrikeStated = incidentCandidates.find(
    (c) => c.source !== "inferred" && c.value === "animal_strike"
  );
  const collisionInferred = incidentCandidates.find(
    (c) => c.source === "inferred" && c.value === "vehicle_collision"
  );

  let incidentResolved = resolveField<string>(incidentCandidates);

  // If animal_strike is stated but inferred says collision, force animal_strike
  if (animalStrikeStated && collisionInferred) {
    incidentResolved = {
      value: "animal_strike",
      source: animalStrikeStated.source,
      confidence: animalStrikeStated.confidence,
      candidates: incidentCandidates,
    };
    conflicts.push({
      field: "incident_type",
      values: [
        { source: animalStrikeStated.source, value: "animal_strike" },
        { source: "inferred", value: "vehicle_collision" },
      ],
      resolution: `Animal strike stated by ${animalStrikeStated.source} overrides AI inference of "vehicle_collision". Stated value retained.`,
    });
  } else {
    const incidentConflict = detectStringConflict("incident_type", incidentResolved, incidentCandidates);
    if (incidentConflict) conflicts.push(incidentConflict);
  }

  // ── 3. repair_cost ─────────────────────────────────────────────────────────

  const repairCostCandidates: FieldCandidate<number>[] = [
    { source: "claim_form", value: input.repair_cost_claim_form ?? null as any, confidence: sourceConfidence("claim_form", input.repair_cost_claim_form != null) },
    { source: "assessor",   value: input.repair_cost_assessor ?? null as any,   confidence: sourceConfidence("assessor",   input.repair_cost_assessor != null) },
    { source: "narrative",  value: input.repair_cost_narrative ?? null as any,  confidence: sourceConfidence("narrative",  input.repair_cost_narrative != null) },
    { source: "ocr",        value: input.repair_cost_ocr ?? null as any,        confidence: sourceConfidence("ocr",        input.repair_cost_ocr != null) },
    { source: "inferred",   value: input.repair_cost_inferred ?? null as any,   confidence: sourceConfidence("inferred",   input.repair_cost_inferred != null) },
  ].filter((c) => c.value !== null && c.value !== undefined) as FieldCandidate<number>[];

  const repairCostResolved = resolveField<number>(repairCostCandidates);
  const repairCostConflict = detectNumericConflict("repair_cost", repairCostResolved, repairCostCandidates, 25);
  if (repairCostConflict) conflicts.push(repairCostConflict);

  // ── 4. market_value ────────────────────────────────────────────────────────

  const marketValueCandidates: FieldCandidate<number>[] = [
    { source: "claim_form", value: input.market_value_claim_form ?? null as any, confidence: sourceConfidence("claim_form", input.market_value_claim_form != null) },
    { source: "assessor",   value: input.market_value_assessor ?? null as any,   confidence: sourceConfidence("assessor",   input.market_value_assessor != null) },
    { source: "narrative",  value: input.market_value_narrative ?? null as any,  confidence: sourceConfidence("narrative",  input.market_value_narrative != null) },
    { source: "ocr",        value: input.market_value_ocr ?? null as any,        confidence: sourceConfidence("ocr",        input.market_value_ocr != null) },
    { source: "inferred",   value: input.market_value_inferred ?? null as any,   confidence: sourceConfidence("inferred",   input.market_value_inferred != null) },
  ].filter((c) => c.value !== null && c.value !== undefined) as FieldCandidate<number>[];

  const marketValueResolved = resolveField<number>(marketValueCandidates);
  const marketValueConflict = detectNumericConflict("market_value", marketValueResolved, marketValueCandidates, 25);
  if (marketValueConflict) conflicts.push(marketValueConflict);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    validated_fields: {
      speed_kmh: speedResolved,
      incident_type: incidentResolved,
      repair_cost: repairCostResolved,
      market_value: marketValueResolved,
    },
    conflicts,
  };
}
