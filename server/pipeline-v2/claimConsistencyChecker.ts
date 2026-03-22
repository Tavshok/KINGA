/**
 * pipeline-v2/claimConsistencyChecker.ts
 *
 * Claim Consistency Checker
 *
 * A pre-analysis gate that detects critical conflicts before any physics,
 * damage, or fraud model runs. If HIGH-severity conflicts are found,
 * proceed = false and downstream stages must not produce a final decision.
 *
 * Checks:
 *   1. Speed mismatch   — stated_speed vs estimated_speed (>30% → HIGH)
 *   2. Incident mismatch — classified incident type vs narrative evidence
 *   3. Damage vs speed plausibility — damage severity inconsistent with speed
 *
 * Output JSON contract:
 * {
 *   "critical_conflicts": [
 *     { "type": "speed_conflict | incident_conflict | damage_mismatch",
 *       "description": "...",
 *       "severity": "HIGH | MEDIUM" }
 *   ],
 *   "proceed": true | false
 * }
 *
 * Rules:
 *   - Speed difference > 30% → HIGH conflict
 *   - Incident type mismatch between classification and narrative → HIGH conflict
 *   - Any HIGH conflict → proceed = false
 *   - MEDIUM conflicts alone → proceed = true (flag for adjuster review)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictType =
  | "speed_conflict"
  | "incident_conflict"
  | "damage_mismatch";

export type ConflictSeverity = "HIGH" | "MEDIUM";

export interface CriticalConflict {
  type: ConflictType;
  description: string;
  severity: ConflictSeverity;
  /** Structured detail for downstream consumers */
  detail?: {
    stated_value?: string | number | null;
    estimated_value?: string | number | null;
    deviation_pct?: number | null;
    narrative_evidence?: string | null;
  };
}

export interface ConsistencyCheckResult {
  critical_conflicts: CriticalConflict[];
  /** false if any HIGH conflict exists — downstream analysis must not proceed to final decision */
  proceed: boolean;
  /** Summary of the check for logging */
  summary: string;
}

export interface ConsistencyCheckInput {
  // ── Speed ──────────────────────────────────────────────────────────────────
  /** Speed stated on the claim form or by the driver (km/h) */
  stated_speed_kmh?: number | null;
  /** Speed estimated by the physics model or AI (km/h) */
  estimated_speed_kmh?: number | null;

  // ── Incident type ──────────────────────────────────────────────────────────
  /** Incident type as classified by the Incident Classification Engine */
  classified_incident_type?: string | null;
  /** Raw driver narrative text (used to cross-check the classification) */
  narrative_text?: string | null;
  /** Incident type extracted directly from the claim form */
  claim_form_incident_type?: string | null;

  // ── Damage ─────────────────────────────────────────────────────────────────
  /** Damage severity as assessed (minor | moderate | severe | catastrophic) */
  damage_severity?: "minor" | "moderate" | "severe" | "catastrophic" | null;
  /** Number of structural components damaged */
  structural_component_count?: number | null;
  /** Whether airbag deployment was reported */
  airbag_deployed?: boolean | null;
  /** Maximum crush depth in metres (from physics model) */
  max_crush_depth_m?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEED CONFLICT CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check 1: Speed mismatch
 *
 * If the stated speed and estimated speed differ by more than 30%, raise HIGH.
 * If they differ by 15–30%, raise MEDIUM.
 */
function checkSpeedConflict(input: ConsistencyCheckInput): CriticalConflict | null {
  const stated = input.stated_speed_kmh;
  const estimated = input.estimated_speed_kmh;

  if (stated == null || estimated == null) return null;
  if (stated <= 0 || estimated <= 0) return null;

  const deviation = Math.abs(stated - estimated) / stated;
  const deviationPct = Math.round(deviation * 100);

  if (deviation > 0.30) {
    return {
      type: "speed_conflict",
      severity: "HIGH",
      description: `Stated speed (${stated} km/h) differs from estimated speed (${estimated} km/h) by ${deviationPct}%, which exceeds the 30% conflict threshold. The estimated speed must not override the stated value. All physics calculations must use the stated speed.`,
      detail: {
        stated_value: stated,
        estimated_value: estimated,
        deviation_pct: deviationPct,
      },
    };
  }

  if (deviation > 0.15) {
    return {
      type: "speed_conflict",
      severity: "MEDIUM",
      description: `Stated speed (${stated} km/h) differs from estimated speed (${estimated} km/h) by ${deviationPct}%. This is within the acceptable range but warrants adjuster review.`,
      detail: {
        stated_value: stated,
        estimated_value: estimated,
        deviation_pct: deviationPct,
      },
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT CONFLICT CHECK
// ─────────────────────────────────────────────────────────────────────────────

/** Animal strike keywords — presence in narrative strongly implies animal_strike */
const ANIMAL_KEYWORDS = [
  "cow", "goat", "donkey", "horse", "pig", "dog", "cat", "sheep", "cattle",
  "livestock", "animal", "wildlife", "buck", "kudu", "impala", "warthog",
  "baboon", "monkey", "elephant", "buffalo", "zebra",
];

/** Theft keywords */
const THEFT_KEYWORDS = ["stolen", "theft", "hijack", "break-in", "broke in", "smashed window"];

/** Fire keywords */
const FIRE_KEYWORDS = ["fire", "burn", "ignit", "flame", "smoke"];

/** Flood keywords */
const FLOOD_KEYWORDS = ["flood", "water", "submerge", "hail", "storm damage"];

/** Vandalism keywords */
const VANDALISM_KEYWORDS = ["vandal", "scratch", "keyed", "graffiti", "malicious damage"];

function detectNarrativeIncidentType(narrative: string): string | null {
  const lower = narrative.toLowerCase();

  // Animal strike is highest priority — any animal keyword → animal_strike
  if (ANIMAL_KEYWORDS.some((kw) => lower.includes(kw))) return "animal_strike";
  if (THEFT_KEYWORDS.some((kw) => lower.includes(kw))) return "theft";
  if (FIRE_KEYWORDS.some((kw) => lower.includes(kw))) return "fire";
  if (FLOOD_KEYWORDS.some((kw) => lower.includes(kw))) return "flood";
  if (VANDALISM_KEYWORDS.some((kw) => lower.includes(kw))) return "vandalism";

  // Collision indicators
  if (/collid|crash|hit|struck|impact|rear.end|head.on|t.bone|ran into|drove into/i.test(lower)) {
    return "vehicle_collision";
  }

  return null;
}

function normaliseIncidentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[_\-\s]+/g, "_").trim();
  if (lower.includes("animal")) return "animal_strike";
  if (lower.includes("collision") || lower === "accident" || lower === "crash") return "vehicle_collision";
  if (lower.includes("theft") || lower.includes("hijack")) return "theft";
  if (lower.includes("fire")) return "fire";
  if (lower.includes("flood")) return "flood";
  if (lower.includes("vandal")) return "vandalism";
  return lower;
}

/**
 * Check 2: Incident mismatch
 *
 * Compares the classified incident type against narrative evidence.
 * If the narrative clearly implies a different type → HIGH conflict.
 */
function checkIncidentConflict(input: ConsistencyCheckInput): CriticalConflict | null {
  const classified = normaliseIncidentType(input.classified_incident_type);
  const claimForm = normaliseIncidentType(input.claim_form_incident_type);
  const narrative = input.narrative_text;

  if (!narrative) {
    // If no narrative, check claim form vs classified
    if (classified && claimForm && classified !== claimForm) {
      return {
        type: "incident_conflict",
        severity: "HIGH",
        description: `Classified incident type ("${classified}") conflicts with claim form incident type ("${claimForm}"). The claim form value must take precedence.`,
        detail: {
          stated_value: claimForm,
          estimated_value: classified,
          narrative_evidence: null,
        },
      };
    }
    return null;
  }

  const narrativeType = detectNarrativeIncidentType(narrative);

  // Check 1: Classified vs narrative
  if (classified && narrativeType && classified !== narrativeType) {
    // Special case: animal_strike in narrative always overrides vehicle_collision classification
    const isAnimalOverride =
      narrativeType === "animal_strike" && classified === "vehicle_collision";

    return {
      type: "incident_conflict",
      severity: "HIGH",
      description: isAnimalOverride
        ? `Narrative evidence clearly indicates an animal strike (animal keywords detected), but the incident was classified as "${classified}". The classification must be corrected to "animal_strike" before analysis proceeds.`
        : `Classified incident type ("${classified}") conflicts with narrative evidence suggesting "${narrativeType}". Classification must be reviewed before analysis proceeds.`,
      detail: {
        stated_value: narrativeType,
        estimated_value: classified,
        narrative_evidence: narrative.slice(0, 200),
      },
    };
  }

  // Check 2: Claim form vs narrative
  if (claimForm && narrativeType && claimForm !== narrativeType) {
    // Only flag if the claim form says collision but narrative says animal
    if (narrativeType === "animal_strike" && claimForm === "vehicle_collision") {
      return {
        type: "incident_conflict",
        severity: "HIGH",
        description: `Claim form records incident type as "vehicle_collision" but narrative evidence indicates an animal strike. Claim form type must be reviewed — animal strike evidence takes priority.`,
        detail: {
          stated_value: claimForm,
          estimated_value: narrativeType,
          narrative_evidence: narrative.slice(0, 200),
        },
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE VS SPEED PLAUSIBILITY CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum speed (km/h) expected for each damage severity level.
 * Below this threshold, the damage is implausible for the stated speed.
 */
const DAMAGE_SPEED_THRESHOLDS: Record<string, { min_kmh: number; max_kmh: number }> = {
  minor:        { min_kmh: 0,   max_kmh: 60  },
  moderate:     { min_kmh: 20,  max_kmh: 120 },
  severe:       { min_kmh: 50,  max_kmh: 200 },
  catastrophic: { min_kmh: 80,  max_kmh: 200 },
};

/**
 * Check 3: Damage vs speed plausibility
 *
 * Compares the damage severity against the stated or estimated speed.
 * Raises HIGH if the damage is implausible for the speed (e.g., catastrophic
 * damage at 5 km/h, or no damage at 120 km/h).
 */
function checkDamageMismatch(input: ConsistencyCheckInput): CriticalConflict | null {
  const severity = input.damage_severity;
  // Prefer stated speed; fall back to estimated
  const speed = input.stated_speed_kmh ?? input.estimated_speed_kmh;

  // Airbag check is independent of damage_severity — run it first
  if (input.airbag_deployed && speed != null && speed < 30) {
    return {
      type: "damage_mismatch",
      severity: "HIGH",
      description: `Airbag deployment is reported at ${speed} km/h. Airbags typically deploy at impact speeds above 25\u201330 km/h in a direct collision. This combination requires review.`,
      detail: {
        stated_value: `${speed} km/h with airbag deployment`,
        estimated_value: "Airbag deployment threshold: ~25\u201330 km/h",
        deviation_pct: null,
      },
    };
  }

  if (!severity || speed == null) return null;

  const thresholds = DAMAGE_SPEED_THRESHOLDS[severity];
  if (!thresholds) return null;

  // Check if speed is implausibly low for the damage severity
  if (speed < thresholds.min_kmh) {
    const isHigh = severity === "severe" || severity === "catastrophic";
    return {
      type: "damage_mismatch",
      severity: isHigh ? "HIGH" : "MEDIUM",
      description: `${severity.charAt(0).toUpperCase() + severity.slice(1)} damage is reported at ${speed} km/h, but this severity typically requires a minimum of ${thresholds.min_kmh} km/h. The damage extent is implausible for the stated speed.`,
      detail: {
        stated_value: `${speed} km/h`,
        estimated_value: `${severity} damage (min ${thresholds.min_kmh} km/h expected)`,
        deviation_pct: null,
      },
    };
  }

  // Check if speed is implausibly high for the damage severity (minor damage at very high speed)
  if (speed > thresholds.max_kmh && severity === "minor") {
    return {
      type: "damage_mismatch",
      severity: "MEDIUM",
      description: `Only minor damage is reported at ${speed} km/h. At this speed, more significant damage would typically be expected. The damage assessment may be incomplete.`,
      detail: {
        stated_value: `${speed} km/h`,
        estimated_value: `${severity} damage (max ${thresholds.max_kmh} km/h typical)`,
        deviation_pct: null,
      },
    };
  }

  // Special: airbag deployment implies high-speed impact — flag if speed is low
  if (input.airbag_deployed && speed < 30) {
    return {
      type: "damage_mismatch",
      severity: "HIGH",
      description: `Airbag deployment is reported at ${speed} km/h. Airbags typically deploy at impact speeds above 25–30 km/h in a direct collision. This combination requires review.`,
      detail: {
        stated_value: `${speed} km/h with airbag deployment`,
        estimated_value: "Airbag deployment threshold: ~25–30 km/h",
        deviation_pct: null,
      },
    };
  }

  // Special: structural damage + very low speed
  if (
    (input.structural_component_count ?? 0) >= 2 &&
    speed < 20 &&
    severity !== "minor"
  ) {
    return {
      type: "damage_mismatch",
      severity: "MEDIUM",
      description: `${input.structural_component_count} structural components are damaged at ${speed} km/h. Multiple structural failures at low speed warrant review.`,
      detail: {
        stated_value: `${speed} km/h`,
        estimated_value: `${input.structural_component_count} structural components damaged`,
        deviation_pct: null,
      },
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all three consistency checks and return the conflict report.
 *
 * @param input - All available claim data for consistency checking
 * @returns ConsistencyCheckResult — the exact JSON contract specified
 */
export function checkClaimConsistency(input: ConsistencyCheckInput): ConsistencyCheckResult {
  const conflicts: CriticalConflict[] = [];

  // Run all three checks
  const speedConflict = checkSpeedConflict(input);
  if (speedConflict) conflicts.push(speedConflict);

  const incidentConflict = checkIncidentConflict(input);
  if (incidentConflict) conflicts.push(incidentConflict);

  const damageMismatch = checkDamageMismatch(input);
  if (damageMismatch) conflicts.push(damageMismatch);

  // Determine proceed: false if ANY HIGH conflict exists
  const hasHighConflict = conflicts.some((c) => c.severity === "HIGH");
  const proceed = !hasHighConflict;

  // Build summary
  const highCount = conflicts.filter((c) => c.severity === "HIGH").length;
  const mediumCount = conflicts.filter((c) => c.severity === "MEDIUM").length;

  let summary: string;
  if (conflicts.length === 0) {
    summary = "No consistency conflicts detected. Analysis may proceed.";
  } else if (!proceed) {
    summary = `${highCount} HIGH conflict(s) and ${mediumCount} MEDIUM conflict(s) detected. Analysis BLOCKED — conflicts must be resolved before a final decision can be issued.`;
  } else {
    summary = `${mediumCount} MEDIUM conflict(s) detected. Analysis may proceed but adjuster review is recommended.`;
  }

  return {
    critical_conflicts: conflicts,
    proceed,
    summary,
  };
}
