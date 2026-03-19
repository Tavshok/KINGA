/**
 * sourceTruthResolver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 33 — Multi-Source Truth Resolution Engine
 *
 * When physics, photo evidence, and document text provide conflicting
 * information about impact direction, damage zone, or severity, this module:
 *
 *   1. Assigns source priority:
 *        Physics     → HIGH   (3)
 *        Photo       → MEDIUM (2)
 *        Document    → LOW    (1)
 *
 *   2. Compares impact_direction, damage_zone, and severity across sources.
 *
 *   3. On conflict:
 *        a. Selects the dominant truth based on priority
 *        b. Marks conflicting sources { conflict: true, overridden: true }
 *
 *   4. Produces:
 *        {
 *          resolved_truth: { impact_direction, damage_zone, severity },
 *          conflicts: [{ source, issue, resolution }],
 *          sources_used: SourceContribution[],
 *          resolution_applied: boolean,
 *          dominant_source: SourceName
 *        }
 *
 *   5. Downstream engines MUST use resolved_truth only.
 */

import type {
  CollisionDirection,
  AccidentSeverity,
  Stage6Output,
  Stage7Output,
  ClaimRecord,
} from "./types";

// ─── Source priority constants ────────────────────────────────────────────────

export const SOURCE_PRIORITY = {
  physics: 3,
  photo: 2,
  document: 1,
} as const;

export type SourceName = keyof typeof SOURCE_PRIORITY;

// Severity ordinal for comparison (higher = more severe)
const SEVERITY_ORDINAL: Record<AccidentSeverity, number> = {
  none: 0,
  cosmetic: 1,
  minor: 2,
  moderate: 3,
  severe: 4,
  catastrophic: 5,
};

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SourceContribution {
  source: SourceName;
  priority: number;
  impact_direction: CollisionDirection | null;
  damage_zone: string | null;
  severity: AccidentSeverity | null;
  conflict: boolean;
  overridden: boolean;
}

export interface ConflictRecord {
  source: SourceName;
  issue: string;
  resolution: string;
}

export interface ResolvedTruth {
  impact_direction: CollisionDirection;
  damage_zone: string;
  severity: AccidentSeverity;
}

export interface TruthResolutionResult {
  resolved_truth: ResolvedTruth;
  conflicts: ConflictRecord[];
  sources_used: SourceContribution[];
  resolution_applied: boolean;
  dominant_source: SourceName;
}

export interface TruthResolutionInput {
  /** Stage 7 physics output — HIGH priority */
  physicsOutput: Stage7Output | null;
  /** Stage 6 damage analysis (photo-derived) — MEDIUM priority */
  damageAnalysis: Stage6Output | null;
  /** Stage 5 assembled claim record (document-derived) — LOW priority */
  claimRecord: ClaimRecord | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Maps an overallSeverityScore (0–100) from Stage 6 to an AccidentSeverity band.
 */
function scoreToBand(score: number): AccidentSeverity {
  if (score >= 85) return "catastrophic";
  if (score >= 65) return "severe";
  if (score >= 45) return "moderate";
  if (score >= 25) return "minor";
  if (score >= 5) return "cosmetic";
  return "none";
}

/**
 * Returns the primary zone label from Stage 6 output.
 * Picks the zone with the highest maxSeverity ordinal.
 */
function primaryZoneFromDamageAnalysis(damageAnalysis: Stage6Output): string | null {
  if (!damageAnalysis.damageZones || damageAnalysis.damageZones.length === 0) return null;
  const sorted = [...damageAnalysis.damageZones].sort(
    (a, b) =>
      (SEVERITY_ORDINAL[b.maxSeverity] ?? 0) - (SEVERITY_ORDINAL[a.maxSeverity] ?? 0)
  );
  return sorted[0]?.zone ?? null;
}

/**
 * Returns the primary zone from a ClaimRecord's damage components or impactPoint.
 */
function primaryZoneFromDocument(claimRecord: ClaimRecord): string | null {
  const first = claimRecord.damage?.components?.[0];
  if (first && (first as { zone?: string }).zone) {
    return (first as { zone?: string }).zone!;
  }
  return claimRecord.accidentDetails.impactPoint ?? null;
}

/**
 * Returns the dominant severity from a ClaimRecord's damage components.
 */
function severityFromDocument(claimRecord: ClaimRecord): AccidentSeverity | null {
  const severities = (claimRecord.damage?.components ?? [])
    .map((c) => c.severity as AccidentSeverity)
    .filter((s) => s && SEVERITY_ORDINAL[s] !== undefined);
  if (severities.length === 0) return null;
  return severities.reduce((max, s) =>
    (SEVERITY_ORDINAL[s] ?? 0) > (SEVERITY_ORDINAL[max] ?? 0) ? s : max
  );
}

function directionsConflict(a: CollisionDirection | null, b: CollisionDirection | null): boolean {
  if (!a || !b || a === "unknown" || b === "unknown") return false;
  return a !== b;
}

function zonesConflict(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().trim() !== b.toLowerCase().trim();
}

function severitiesConflict(a: AccidentSeverity | null, b: AccidentSeverity | null): boolean {
  if (!a || !b) return false;
  return a !== b;
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolves conflicting multi-source data into a single authoritative truth.
 *
 * Priority order: physics (3) > photo (2) > document (1)
 * The highest-priority source providing a non-null value wins each dimension.
 * Conflicting lower-priority sources are marked { conflict: true, overridden: true }.
 */
export function resolveSourceTruth(input: TruthResolutionInput): TruthResolutionResult {
  const { physicsOutput, damageAnalysis, claimRecord } = input;

  // ── Build per-source contributions ──────────────────────────────────────────

  const physicsContrib: SourceContribution = {
    source: "physics",
    priority: SOURCE_PRIORITY.physics,
    impact_direction: physicsOutput?.physicsExecuted
      ? (physicsOutput.impactVector?.direction ?? null)
      : null,
    damage_zone: null, // physics does not produce a zone label
    severity: physicsOutput?.physicsExecuted ? physicsOutput.accidentSeverity : null,
    conflict: false,
    overridden: false,
  };

  const photoContrib: SourceContribution = {
    source: "photo",
    priority: SOURCE_PRIORITY.photo,
    impact_direction: null, // photo analysis produces zones, not direction
    damage_zone: damageAnalysis ? primaryZoneFromDamageAnalysis(damageAnalysis) : null,
    severity: damageAnalysis ? scoreToBand(damageAnalysis.overallSeverityScore) : null,
    conflict: false,
    overridden: false,
  };

  const documentContrib: SourceContribution = {
    source: "document",
    priority: SOURCE_PRIORITY.document,
    impact_direction: claimRecord?.accidentDetails.collisionDirection ?? null,
    damage_zone: claimRecord ? primaryZoneFromDocument(claimRecord) : null,
    severity: claimRecord ? severityFromDocument(claimRecord) : null,
    conflict: false,
    overridden: false,
  };

  const contributions: SourceContribution[] = [physicsContrib, photoContrib, documentContrib];

  // ── Resolve impact_direction (physics > document; photo has none) ────────────

  const dirCandidates: Array<{ contrib: SourceContribution; value: CollisionDirection }> = [];
  if (physicsContrib.impact_direction && physicsContrib.impact_direction !== "unknown") {
    dirCandidates.push({ contrib: physicsContrib, value: physicsContrib.impact_direction });
  }
  if (documentContrib.impact_direction && documentContrib.impact_direction !== "unknown") {
    dirCandidates.push({ contrib: documentContrib, value: documentContrib.impact_direction });
  }
  dirCandidates.sort((a, b) => b.contrib.priority - a.contrib.priority);

  const resolvedDirection: CollisionDirection =
    dirCandidates[0]?.value ??
    claimRecord?.accidentDetails.collisionDirection ??
    "unknown";
  const dominantDirSource = dirCandidates[0]?.contrib.source ?? "document";

  // ── Resolve damage_zone (photo > document; physics has none) ────────────────

  const zoneCandidates: Array<{ contrib: SourceContribution; value: string }> = [];
  if (photoContrib.damage_zone) {
    zoneCandidates.push({ contrib: photoContrib, value: photoContrib.damage_zone });
  }
  if (documentContrib.damage_zone) {
    zoneCandidates.push({ contrib: documentContrib, value: documentContrib.damage_zone });
  }
  zoneCandidates.sort((a, b) => b.contrib.priority - a.contrib.priority);

  const resolvedZone: string =
    zoneCandidates[0]?.value ??
    claimRecord?.accidentDetails.impactPoint ??
    "unspecified";
  const dominantZoneSource = zoneCandidates[0]?.contrib.source ?? "document";

  // ── Resolve severity (physics > photo > document) ────────────────────────────

  const sevCandidates: Array<{ contrib: SourceContribution; value: AccidentSeverity }> = [];
  if (physicsContrib.severity) {
    sevCandidates.push({ contrib: physicsContrib, value: physicsContrib.severity });
  }
  if (photoContrib.severity) {
    sevCandidates.push({ contrib: photoContrib, value: photoContrib.severity });
  }
  if (documentContrib.severity) {
    sevCandidates.push({ contrib: documentContrib, value: documentContrib.severity });
  }
  sevCandidates.sort((a, b) => b.contrib.priority - a.contrib.priority);

  const resolvedSeverity: AccidentSeverity = sevCandidates[0]?.value ?? "minor";
  const dominantSevSource = sevCandidates[0]?.contrib.source ?? "document";

  // ── Detect conflicts and mark overridden sources ─────────────────────────────

  const conflicts: ConflictRecord[] = [];
  let resolutionApplied = false;

  // Direction conflicts
  if (dirCandidates.length >= 2) {
    const [dominant, ...losers] = dirCandidates;
    for (const loser of losers) {
      if (directionsConflict(dominant.value, loser.value)) {
        loser.contrib.conflict = true;
        loser.contrib.overridden = true;
        resolutionApplied = true;
        conflicts.push({
          source: loser.contrib.source,
          issue: `${loser.value} direction vs ${dominant.value} ${dominantDirSource}`,
          resolution: `${dominantDirSource}_overridden`,
        });
      }
    }
  }

  // Zone conflicts
  if (zoneCandidates.length >= 2) {
    const [dominant, ...losers] = zoneCandidates;
    for (const loser of losers) {
      if (zonesConflict(dominant.value, loser.value)) {
        loser.contrib.conflict = true;
        loser.contrib.overridden = true;
        resolutionApplied = true;
        conflicts.push({
          source: loser.contrib.source,
          issue: `${loser.value} zone vs ${dominant.value} ${dominantZoneSource}`,
          resolution: `${dominantZoneSource}_overridden`,
        });
      }
    }
  }

  // Severity conflicts
  if (sevCandidates.length >= 2) {
    const [dominant, ...losers] = sevCandidates;
    for (const loser of losers) {
      if (severitiesConflict(dominant.value, loser.value)) {
        loser.contrib.conflict = true;
        loser.contrib.overridden = true;
        resolutionApplied = true;
        conflicts.push({
          source: loser.contrib.source,
          issue: `${loser.value} severity vs ${dominant.value} ${dominantSevSource}`,
          resolution: `${dominantSevSource}_overridden`,
        });
      }
    }
  }

  // ── Determine overall dominant source ────────────────────────────────────────

  const winCounts: Record<SourceName, number> = { physics: 0, photo: 0, document: 0 };
  winCounts[dominantDirSource as SourceName] += 1;
  winCounts[dominantZoneSource as SourceName] += 1;
  winCounts[dominantSevSource as SourceName] += 1;

  const dominantSource = (
    Object.entries(winCounts).sort(([, a], [, b]) => b - a)[0][0]
  ) as SourceName;

  return {
    resolved_truth: {
      impact_direction: resolvedDirection,
      damage_zone: resolvedZone,
      severity: resolvedSeverity,
    },
    conflicts,
    sources_used: contributions,
    resolution_applied: resolutionApplied,
    dominant_source: dominantSource,
  };
}

// ─── Convenience helpers for downstream enforcement ───────────────────────────

/** Returns the resolved impact direction for use as Stage7Input.impactDirection. */
export function getResolvedDirection(result: TruthResolutionResult): CollisionDirection {
  return result.resolved_truth.impact_direction;
}

/** Returns the resolved severity for downstream use. */
export function getResolvedSeverity(result: TruthResolutionResult): AccidentSeverity {
  return result.resolved_truth.severity;
}
