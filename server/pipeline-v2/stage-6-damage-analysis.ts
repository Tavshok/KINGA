/**
 * pipeline-v2/stage-6-damage-analysis.ts
 *
 * STAGE 6 — DAMAGE ANALYSIS ENGINE
 *
 * Using vehicle photos and damage descriptions from the ClaimRecord:
 *   - Identify damaged components
 *   - Create damage zones
 *   - Compute severity scores
 *
 * Input: ClaimRecord (from Stage 5)
 * Output: Stage6Output (damaged_parts, damage_zones, severity_score)
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  DamageAnalysisComponent,
  DamageZone,
  AccidentSeverity,
} from "./types";

/**
 * Map a severity string to the canonical AccidentSeverity type.
 */
function normaliseSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase().trim();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate" || s === "medium") return "moderate";
  if (s === "minor" || s === "light" || s === "slight") return "minor";
  if (s === "cosmetic" || s === "superficial") return "cosmetic";
  return "moderate"; // Default
}

/**
 * Infer the damage zone from a component's location.
 */
function inferZone(location: string): string {
  const loc = (location || "").toLowerCase();
  if (/front|bumper front|hood|bonnet|headl|grille|radiator|fender front|wing front/.test(loc)) return "front";
  if (/rear|bumper rear|tail|trunk|boot|fender rear|wing rear/.test(loc)) return "rear";
  if (/left|driver|lh|l\/h/.test(loc)) return "left_side";
  if (/right|passenger|rh|r\/h/.test(loc)) return "right_side";
  if (/roof|top|overhead/.test(loc)) return "roof";
  if (/under|bottom|chassis|subframe/.test(loc)) return "undercarriage";
  return "general";
}

/**
 * Calculate overall severity score from components (0-100).
 */
function calculateOverallSeverity(components: DamageAnalysisComponent[]): number {
  if (components.length === 0) return 0;

  const severityWeights: Record<AccidentSeverity, number> = {
    none: 0,
    cosmetic: 10,
    minor: 25,
    moderate: 50,
    severe: 75,
    catastrophic: 100,
  };

  const total = components.reduce((sum, c) => sum + (severityWeights[c.severity] || 50), 0);
  const avg = total / components.length;

  // Boost for high component count (more damage = more severe overall)
  const countBoost = Math.min(20, components.length * 2);

  return Math.min(100, Math.round(avg + countBoost));
}

export async function runDamageAnalysisStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord
): Promise<StageResult<Stage6Output>> {
  const start = Date.now();
  ctx.log("Stage 6", "Damage analysis starting");

  try {
    // Build structured damage components from ClaimRecord
    const damagedParts: DamageAnalysisComponent[] = claimRecord.damage.components.map((comp, index) => ({
      name: comp.name,
      location: comp.location,
      damageType: comp.damageType,
      severity: normaliseSeverity(comp.severity),
      visible: true,
      distanceFromImpact: index * 0.3, // Approximate based on listing order
    }));

    // Group components into damage zones
    const zoneMap = new Map<string, { components: DamageAnalysisComponent[] }>();
    for (const part of damagedParts) {
      const zone = inferZone(part.location);
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, { components: [] });
      }
      zoneMap.get(zone)!.components.push(part);
    }

    const damageZones: DamageZone[] = Array.from(zoneMap.entries()).map(([zone, data]) => {
      const severityOrder: AccidentSeverity[] = ["none", "cosmetic", "minor", "moderate", "severe", "catastrophic"];
      const maxSev = data.components.reduce((max, c) => {
        const maxIdx = severityOrder.indexOf(max);
        const curIdx = severityOrder.indexOf(c.severity);
        return curIdx > maxIdx ? c.severity : max;
      }, "none" as AccidentSeverity);

      return {
        zone,
        componentCount: data.components.length,
        maxSeverity: maxSev,
      };
    });

    const overallSeverityScore = calculateOverallSeverity(damagedParts);
    const structuralDamageDetected = claimRecord.accidentDetails.structuralDamage ||
      damagedParts.some(p => /frame|chassis|subframe|pillar|rail|structural|unibody/.test(p.name.toLowerCase()));

    const output: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
    };

    ctx.log("Stage 6", `Damage analysis complete. ${damagedParts.length} parts, ${damageZones.length} zones, severity: ${overallSeverityScore}/100, structural: ${structuralDamageDetected}`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 6", `Damage analysis failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
