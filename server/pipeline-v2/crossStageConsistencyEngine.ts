/**
 * crossStageConsistencyEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-Stage Contradiction Detector
 *
 * This engine runs AFTER all pipeline stages and BEFORE Stage 10 (report
 * generation). It detects named, actionable contradictions between the outputs
 * of different stages — situations where the system would produce "confident
 * nonsense" if allowed to proceed without flagging.
 *
 * Unlike crossEngineConsensus.ts (which produces a numeric agreement score),
 * this engine produces NAMED FLAGS with:
 *   - A unique rule ID
 *   - Severity: CRITICAL | HIGH | MEDIUM | INFO
 *   - A plain-English description of the contradiction
 *   - The two conflicting values
 *   - A recommended adjuster action
 *
 * CRITICAL flags block auto-approval and force REVIEW.
 * HIGH flags are surfaced prominently in the report.
 * MEDIUM flags appear in the consistency section.
 * INFO flags are logged but do not affect the decision.
 *
 * Rules implemented:
 *   C1  — Classification vs primary damage zone (rear_end + front damage)
 *   C2  — Classification vs physics direction (rear_end + frontal impact vector)
 *   C3  — Classification vs damage zone (head_on + rear damage)
 *   C4  — Classification vs damage zone (sideswipe + front/rear-only damage)
 *   C5  — Speed vs damage severity (high speed + cosmetic damage)
 *   C6  — Speed vs damage severity (low speed + catastrophic damage)
 *   C7  — Quote vs AI benchmark extreme deviation (>400%)
 *   C8  — Fraud score vs incident type (theft + no police report)
 *   C9  — Structural damage vs repair action (structural damage + cosmetic repair only)
 *   C10 — Physics executed = false for physical incident type
 *   C11 — Animal strike + no animal-zone damage (bonnet/bumper/grille)
 *   C12 — Rollover + no roof/pillar/glass damage
 *   C13 — Flood + no underbody/electrical damage
 *   C14 — Fire + no engine bay/interior damage
 *   C15 — Multiple damage zones with single-point impact classification
 */

import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  Stage8Output,
  Stage9Output,
  CanonicalIncidentType,
  CollisionDirection,
  AccidentSeverity,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ConsistencyFlagSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export interface ConsistencyFlag {
  /** Unique rule identifier, e.g. "C1" */
  ruleId: string;
  /** Severity level */
  severity: ConsistencyFlagSeverity;
  /** Short title for display */
  title: string;
  /** Plain-English description of the contradiction */
  description: string;
  /** The two conflicting values */
  conflictA: { source: string; value: string };
  conflictB: { source: string; value: string };
  /** Recommended action for the adjuster */
  adjusterAction: string;
}

export interface ConsistencyCheckResult {
  /** All flags raised by the consistency engine */
  flags: ConsistencyFlag[];
  /** Number of CRITICAL flags */
  criticalCount: number;
  /** Number of HIGH flags */
  highCount: number;
  /** Overall consistency status */
  status: "CONSISTENT" | "MINOR_ISSUES" | "CONTRADICTIONS_PRESENT" | "CRITICAL_CONTRADICTIONS";
  /** Plain-English summary for the report */
  summary: string;
  /** Whether any flag should block auto-approval */
  blockAutoApproval: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical damage zone names that indicate front-of-vehicle damage */
const FRONT_ZONES = new Set(["front", "front_left", "front_right", "bonnet", "engine_bay"]);
/** Canonical damage zone names that indicate rear-of-vehicle damage */
const REAR_ZONES = new Set(["rear", "rear_left", "rear_right", "boot", "boot_lid"]);
/** Canonical damage zone names that indicate side damage */
const SIDE_ZONES = new Set(["left", "right", "side_left", "side_right", "door_left", "door_right"]);
/** Canonical damage zone names that indicate roof/rollover damage */
const ROOF_ZONES = new Set(["roof", "pillar_a", "pillar_b", "pillar_c", "windscreen", "rear_windscreen"]);
/** Canonical damage zone names that indicate underbody/flood damage */
const UNDERBODY_ZONES = new Set(["underbody", "floor", "sill", "exhaust", "fuel_tank"]);
/** Canonical damage zone names that indicate animal strike impact zones */
const ANIMAL_STRIKE_ZONES = new Set(["front", "bonnet", "grille", "front_bumper_bar", "headlamp_lh", "headlamp_rh", "windscreen"]);
/** Canonical damage zone names that indicate fire damage */
const FIRE_ZONES = new Set(["engine_bay", "interior", "dashboard", "wiring", "bonnet"]);

function getZoneNames(stage6: Stage6Output): Set<string> {
  const zones = new Set<string>();
  for (const z of stage6.damageZones) {
    zones.add(z.zone.toLowerCase().replace(/\s+/g, "_"));
  }
  // Also include component names as zone hints
  for (const p of stage6.damagedParts) {
    const name = (p.name || "").toLowerCase();
    if (/front/.test(name)) zones.add("front");
    if (/rear|back/.test(name)) zones.add("rear");
    if (/roof/.test(name)) zones.add("roof");
    if (/bonnet|hood/.test(name)) zones.add("bonnet");
    if (/boot|trunk/.test(name)) zones.add("boot");
    if (/grille/.test(name)) zones.add("grille");
    if (/windscreen|windshield/.test(name)) zones.add("windscreen");
    if (/sill|underbody|floor/.test(name)) zones.add("underbody");
    if (/engine/.test(name)) zones.add("engine_bay");
    if (/interior|seat|dash/.test(name)) zones.add("interior");
  }
  return zones;
}

function hasAnyZone(zones: Set<string>, target: Set<string>): boolean {
  for (const z of target) {
    if (zones.has(z)) return true;
  }
  return false;
}

function severityOrdinal(s: AccidentSeverity | string | null | undefined): number {
  const map: Record<string, number> = {
    none: 0, cosmetic: 1, minor: 2, moderate: 3, severe: 4, catastrophic: 5,
  };
  return map[(s || "").toLowerCase()] ?? 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual rule functions
// ─────────────────────────────────────────────────────────────────────────────

function checkC1(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "rear_end") return null;
  const zones = getZoneNames(stage6);
  const hasFront = hasAnyZone(zones, FRONT_ZONES);
  const hasRear = hasAnyZone(zones, REAR_ZONES);
  if (hasFront && !hasRear) {
    return {
      ruleId: "C1",
      severity: "CRITICAL",
      title: "Rear-end collision with front-only damage",
      description:
        "The incident is classified as a rear-end collision, but all detected damage is in the front zone. " +
        "A rear-end impact should produce rear-zone damage. This is a direct contradiction.",
      conflictA: { source: "Classification (Stage 3)", value: "rear_end" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "front zone only" },
      adjusterAction:
        "Verify the incident narrative and photographs. Either the classification is wrong (should be head_on or single_vehicle) " +
        "or the damage description is incorrect. Do not approve until resolved.",
    };
  }
  return null;
}

function checkC2(
  incidentType: CanonicalIncidentType | string | null,
  stage7: Stage7Output | null,
): ConsistencyFlag | null {
  if (incidentType !== "rear_end") return null;
  if (!stage7?.physicsExecuted) return null;
  const direction = stage7.impactVector?.direction;
  if (direction === "frontal") {
    return {
      ruleId: "C2",
      severity: "HIGH",
      title: "Rear-end classification vs frontal physics impact vector",
      description:
        "The incident is classified as rear_end but the physics engine computed a frontal impact vector. " +
        "These are mutually exclusive — a rear-end collision produces a rear impact vector.",
      conflictA: { source: "Classification (Stage 3)", value: "rear_end" },
      conflictB: { source: "Physics impact vector (Stage 7)", value: direction },
      adjusterAction:
        "Review the impact direction. The physics engine may have been seeded with incorrect damage zone data. " +
        "Check whether the vehicle was struck from behind or from the front.",
    };
  }
  return null;
}

function checkC3(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "head_on") return null;
  const zones = getZoneNames(stage6);
  const hasRear = hasAnyZone(zones, REAR_ZONES);
  const hasFront = hasAnyZone(zones, FRONT_ZONES);
  if (hasRear && !hasFront) {
    return {
      ruleId: "C3",
      severity: "CRITICAL",
      title: "Head-on collision with rear-only damage",
      description:
        "The incident is classified as head_on (frontal collision) but all detected damage is in the rear zone. " +
        "A head-on collision should produce front-zone damage.",
      conflictA: { source: "Classification (Stage 3)", value: "head_on" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "rear zone only" },
      adjusterAction:
        "Verify the incident narrative. Either the classification is wrong (should be rear_end) " +
        "or the damage description is incorrect.",
    };
  }
  return null;
}

function checkC4(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "sideswipe") return null;
  const zones = getZoneNames(stage6);
  const hasSide = hasAnyZone(zones, SIDE_ZONES);
  const hasFront = hasAnyZone(zones, FRONT_ZONES);
  const hasRear = hasAnyZone(zones, REAR_ZONES);
  if (!hasSide && (hasFront || hasRear)) {
    return {
      ruleId: "C4",
      severity: "HIGH",
      title: "Sideswipe classification with no side damage detected",
      description:
        "The incident is classified as sideswipe but no side-zone damage was detected. " +
        "A sideswipe should produce door/sill/quarter panel damage on the left or right side.",
      conflictA: { source: "Classification (Stage 3)", value: "sideswipe" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "front/rear only" },
      adjusterAction:
        "Check whether the side panels were photographed. If no side damage exists, reclassify the incident.",
    };
  }
  return null;
}

function checkC5(
  stage7: Stage7Output | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (!stage7?.physicsExecuted) return null;
  const speed = stage7.estimatedSpeedKmh;
  const severity = stage6.damagedParts.length > 0
    ? stage6.damagedParts.reduce((max, p) => {
        return severityOrdinal(p.severity) > severityOrdinal(max) ? p.severity : max;
      }, "none" as string)
    : null;
  if (speed > 80 && severity && severityOrdinal(severity) <= 1) {
    return {
      ruleId: "C5",
      severity: "HIGH",
      title: "High speed with cosmetic-only damage",
      description:
        `An estimated speed of ${speed} km/h was computed but the maximum damage severity detected is "${severity}". ` +
        "At speeds above 80 km/h, cosmetic-only damage is physically implausible for a collision.",
      conflictA: { source: "Physics speed (Stage 7)", value: `${speed} km/h` },
      conflictB: { source: "Max damage severity (Stage 6)", value: severity },
      adjusterAction:
        "Verify the speed estimate and the damage assessment. Either the speed is overstated or the damage is understated.",
    };
  }
  return null;
}

function checkC6(
  stage7: Stage7Output | null,
  stage6: Stage6Output,
  incidentType: CanonicalIncidentType | string | null,
): ConsistencyFlag | null {
  // Only check physical collision types
  const physicalTypes = new Set(["collision", "rear_end", "head_on", "sideswipe", "single_vehicle", "rollover"]);
  if (!physicalTypes.has(incidentType || "")) return null;
  if (!stage7?.physicsExecuted) return null;
  const speed = stage7.estimatedSpeedKmh;
  const severity = stage6.damagedParts.length > 0
    ? stage6.damagedParts.reduce((max, p) => {
        return severityOrdinal(p.severity) > severityOrdinal(max) ? p.severity : max;
      }, "none" as string)
    : null;
  if (speed < 20 && severity && severityOrdinal(severity) >= 4) {
    return {
      ruleId: "C6",
      severity: "HIGH",
      title: "Low speed with catastrophic damage",
      description:
        `An estimated speed of ${speed} km/h was computed but the maximum damage severity is "${severity}". ` +
        "Catastrophic damage at speeds below 20 km/h is physically implausible for a standard collision.",
      conflictA: { source: "Physics speed (Stage 7)", value: `${speed} km/h` },
      conflictB: { source: "Max damage severity (Stage 6)", value: severity },
      adjusterAction:
        "Verify the speed estimate. The vehicle may have been stationary (parked) when damaged, or the speed extraction is incorrect.",
    };
  }
  return null;
}

function checkC7(
  stage9: Stage9Output | null,
): ConsistencyFlag | null {
  if (!stage9) return null;
  const deviation = stage9.quoteDeviationPct;
  if (deviation === null || deviation === undefined) return null;
  if (deviation > 400) {
    const quotedCents = stage9.expectedRepairCostCents;
    const aiCents = stage9.recommendedCostRange.lowCents / 0.8; // reverse-compute AI estimate
    return {
      ruleId: "C7",
      severity: "HIGH",
      title: "Submitted quote exceeds AI benchmark by more than 400%",
      description:
        `The submitted repair quote is ${deviation.toFixed(0)}% above the AI benchmark. ` +
        "This level of deviation is outside normal market variance and requires manual review.",
      conflictA: { source: "Submitted quote (Stage 9)", value: `${(quotedCents / 100).toFixed(2)}` },
      conflictB: { source: "AI benchmark (Stage 9)", value: `${(aiCents / 100).toFixed(2)}` },
      adjusterAction:
        "Request an independent assessment or second quote. Do not approve without manual cost review.",
    };
  }
  return null;
}

function checkC8(
  incidentType: CanonicalIncidentType | string | null,
  claimRecord: ClaimRecord,
): ConsistencyFlag | null {
  if (incidentType !== "theft") return null;
  const hasPoliceReport = !!(
    claimRecord.policeReport?.reportNumber ||
    claimRecord.policeReport?.station
  );
  if (!hasPoliceReport) {
    return {
      ruleId: "C8",
      severity: "HIGH",
      title: "Theft claim with no police report",
      description:
        "The incident is classified as theft but no police report number or station was extracted. " +
        "A police report is mandatory for theft claims in most jurisdictions.",
      conflictA: { source: "Classification (Stage 3)", value: "theft" },
      conflictB: { source: "Police report (Stage 3)", value: "not found" },
      adjusterAction:
        "Request the police report (case number, station, officer name) before processing. " +
        "Do not approve a theft claim without a verified police report.",
    };
  }
  return null;
}

function checkC9(
  stage6: Stage6Output,
  stage9: Stage9Output | null,
): ConsistencyFlag | null {
  if (!stage9) return null;
  const hasStructural = stage6.structuralDamageDetected;
  if (!hasStructural) return null;
  // Check if the alignment result says no structural components are in the quote
  const alignment = stage9.alignmentResult;
  if (!alignment) return null;
  if (alignment.structural_coverage_ratio < 0.3) {
    return {
      ruleId: "C9",
      severity: "HIGH",
      title: "Structural damage detected but repair quote lacks structural items",
      description:
        `Structural damage was detected (Stage 6) but the repair quote covers only ${(alignment.structural_coverage_ratio * 100).toFixed(0)}% of structural components. ` +
        "A quote that omits structural repairs may be incomplete or may understate the true repair cost.",
      conflictA: { source: "Damage analysis (Stage 6)", value: "structural damage detected" },
      conflictB: { source: "Quote alignment (Stage 9)", value: `structural coverage ${(alignment.structural_coverage_ratio * 100).toFixed(0)}%` },
      adjusterAction:
        "Request an updated quote that explicitly addresses structural repair items. " +
        "Approve only after structural items are accounted for.",
    };
  }
  return null;
}

function checkC10(
  incidentType: CanonicalIncidentType | string | null,
  stage7: Stage7Output | null,
): ConsistencyFlag | null {
  const physicalTypes = new Set(["collision", "rear_end", "head_on", "sideswipe", "single_vehicle", "rollover", "pedestrian_strike"]);
  if (!physicalTypes.has(incidentType || "")) return null;
  if (!stage7) return null;
  if (!stage7.physicsExecuted) {
    return {
      ruleId: "C10",
      severity: "MEDIUM",
      title: "Physics engine did not execute for a physical incident type",
      description:
        `The incident is classified as "${incidentType}" which requires physics analysis, ` +
        "but the physics engine did not execute (physicsExecuted = false). " +
        "Physics-dependent outputs (delta-V, force, damage consistency) are unavailable.",
      conflictA: { source: "Classification (Stage 3)", value: incidentType || "unknown" },
      conflictB: { source: "Physics engine (Stage 7)", value: "physicsExecuted = false" },
      adjusterAction:
        "Check whether the speed was extracted. If speed is missing, the physics engine may have been skipped. " +
        "Manual assessment of damage severity is required.",
    };
  }
  return null;
}

function checkC11(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "animal_strike") return null;
  const zones = getZoneNames(stage6);
  if (!hasAnyZone(zones, ANIMAL_STRIKE_ZONES)) {
    return {
      ruleId: "C11",
      severity: "HIGH",
      title: "Animal strike with no expected impact zone damage",
      description:
        "The incident is classified as animal_strike but no damage was detected in the typical animal strike zones " +
        "(bonnet, grille, front bumper bar, headlamps, windscreen). " +
        "Animal strikes almost always produce front-zone damage.",
      conflictA: { source: "Classification (Stage 3)", value: "animal_strike" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "no front zones detected" },
      adjusterAction:
        "Verify the incident narrative and photographs. If no front-zone damage exists, reclassify the incident.",
    };
  }
  return null;
}

function checkC12(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "rollover") return null;
  const zones = getZoneNames(stage6);
  if (!hasAnyZone(zones, ROOF_ZONES)) {
    return {
      ruleId: "C12",
      severity: "HIGH",
      title: "Rollover with no roof or pillar damage",
      description:
        "The incident is classified as rollover but no roof, pillar, or glass damage was detected. " +
        "A rollover almost always produces roof crush, pillar deformation, or glass breakage.",
      conflictA: { source: "Classification (Stage 3)", value: "rollover" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "no roof zones detected" },
      adjusterAction:
        "Verify the incident narrative and photographs. If no roof damage exists, reclassify the incident.",
    };
  }
  return null;
}

function checkC13(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "flood") return null;
  const zones = getZoneNames(stage6);
  if (!hasAnyZone(zones, UNDERBODY_ZONES) && !zones.has("interior") && !zones.has("electrical")) {
    return {
      ruleId: "C13",
      severity: "MEDIUM",
      title: "Flood claim with no underbody or interior damage",
      description:
        "The incident is classified as flood but no underbody, interior, or electrical damage was detected. " +
        "Flood damage typically affects the underbody, floor, electrical systems, and interior.",
      conflictA: { source: "Classification (Stage 3)", value: "flood" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "no flood zones detected" },
      adjusterAction:
        "Request photographs of the underbody and interior. Verify the water ingress level.",
    };
  }
  return null;
}

function checkC14(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  if (incidentType !== "fire") return null;
  const zones = getZoneNames(stage6);
  if (!hasAnyZone(zones, FIRE_ZONES)) {
    return {
      ruleId: "C14",
      severity: "MEDIUM",
      title: "Fire claim with no engine bay or interior damage",
      description:
        "The incident is classified as fire but no engine bay, interior, or wiring damage was detected. " +
        "Vehicle fires almost always produce engine bay or interior damage.",
      conflictA: { source: "Classification (Stage 3)", value: "fire" },
      conflictB: { source: "Damage zones (Stage 6)", value: Array.from(zones).join(", ") || "no fire zones detected" },
      adjusterAction:
        "Request photographs of the engine bay and interior. Verify the fire origin and extent.",
    };
  }
  return null;
}

function checkC15(
  incidentType: CanonicalIncidentType | string | null,
  stage6: Stage6Output,
): ConsistencyFlag | null {
  // Single-point impact types should not have damage spread across 3+ distinct zones
  const singlePointTypes = new Set(["rear_end", "head_on", "animal_strike"]);
  if (!singlePointTypes.has(incidentType || "")) return null;
  const zones = stage6.damageZones;
  if (zones.length >= 4) {
    return {
      ruleId: "C15",
      severity: "MEDIUM",
      title: "Single-point impact classification with widespread multi-zone damage",
      description:
        `The incident is classified as "${incidentType}" (a single-point impact) but damage was detected across ${zones.length} distinct zones. ` +
        "Single-point impacts typically produce localised damage. Widespread damage may indicate a more complex incident or pre-existing damage.",
      conflictA: { source: "Classification (Stage 3)", value: incidentType || "unknown" },
      conflictB: { source: "Damage zones (Stage 6)", value: `${zones.length} zones: ${zones.map(z => z.zone).join(", ")}` },
      adjusterAction:
        "Review photographs to determine whether the widespread damage is consistent with the single incident or includes pre-existing damage.",
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function runCrossStageConsistencyCheck(
  claimRecord: ClaimRecord,
  stage6: Stage6Output,
  stage7: Stage7Output | null,
  stage8: Stage8Output | null,
  stage9: Stage9Output | null,
): ConsistencyCheckResult {
  const incidentType = claimRecord.incidentClassification?.incidentType ?? null;

  const rawFlags: (ConsistencyFlag | null)[] = [
    checkC1(incidentType, stage6),
    checkC2(incidentType, stage7),
    checkC3(incidentType, stage6),
    checkC4(incidentType, stage6),
    checkC5(stage7, stage6),
    checkC6(stage7, stage6, incidentType),
    checkC7(stage9),
    checkC8(incidentType, claimRecord),
    checkC9(stage6, stage9),
    checkC10(incidentType, stage7),
    checkC11(incidentType, stage6),
    checkC12(incidentType, stage6),
    checkC13(incidentType, stage6),
    checkC14(incidentType, stage6),
    checkC15(incidentType, stage6),
  ];

  const flags = rawFlags.filter((f): f is ConsistencyFlag => f !== null);
  const criticalCount = flags.filter(f => f.severity === "CRITICAL").length;
  const highCount = flags.filter(f => f.severity === "HIGH").length;

  let status: ConsistencyCheckResult["status"];
  if (criticalCount > 0) {
    status = "CRITICAL_CONTRADICTIONS";
  } else if (highCount > 0) {
    status = "CONTRADICTIONS_PRESENT";
  } else if (flags.length > 0) {
    status = "MINOR_ISSUES";
  } else {
    status = "CONSISTENT";
  }

  const blockAutoApproval = criticalCount > 0 || highCount > 0;

  let summary: string;
  if (flags.length === 0) {
    summary = "All pipeline stages are internally consistent. No contradictions detected.";
  } else if (criticalCount > 0) {
    summary =
      `${criticalCount} critical contradiction${criticalCount > 1 ? "s" : ""} detected. ` +
      `${highCount > 0 ? `${highCount} additional high-severity issue${highCount > 1 ? "s" : ""} present. ` : ""}` +
      "Manual review is required before any decision is made.";
  } else {
    summary =
      `${highCount} high-severity issue${highCount > 1 ? "s" : ""} detected. ` +
      `${flags.length - highCount > 0 ? `${flags.length - highCount} additional minor issue${flags.length - highCount > 1 ? "s" : ""} present. ` : ""}` +
      "Review the flagged items before approving.";
  }

  return { flags, criticalCount, highCount, status, summary, blockAutoApproval };
}
