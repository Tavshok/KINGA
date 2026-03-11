/**
 * pipeline-v2/stage-6-damage-analysis.ts
 *
 * STAGE 6 — DAMAGE ANALYSIS ENGINE (Self-Healing)
 *
 * Using vehicle photos and damage descriptions from the ClaimRecord:
 *   - Identify damaged components
 *   - Create damage zones
 *   - Compute severity scores
 *
 * NEVER halts — if no damage data exists, produces empty analysis with assumptions.
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  DamageAnalysisComponent,
  DamageZone,
  AccidentSeverity,
  Assumption,
  RecoveryAction,
} from "./types";

function normaliseSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase().trim();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate" || s === "medium") return "moderate";
  if (s === "minor" || s === "light" || s === "slight") return "minor";
  if (s === "cosmetic" || s === "superficial") return "cosmetic";
  return "moderate";
}

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

function calculateOverallSeverity(components: DamageAnalysisComponent[]): number {
  if (components.length === 0) return 0;

  const severityWeights: Record<AccidentSeverity, number> = {
    none: 0, cosmetic: 10, minor: 25, moderate: 50, severe: 75, catastrophic: 100,
  };

  const total = components.reduce((sum, c) => sum + (severityWeights[c.severity] || 50), 0);
  const avg = total / components.length;
  const countBoost = Math.min(20, components.length * 2);
  return Math.min(100, Math.round(avg + countBoost));
}

/**
 * Infer damage components from accident description when no components are available.
 */
function inferDamageFromDescription(
  claimRecord: ClaimRecord,
  assumptions: Assumption[]
): DamageAnalysisComponent[] {
  const desc = (claimRecord.accidentDetails.description || "").toLowerCase();
  const impactPoint = (claimRecord.accidentDetails.impactPoint || "").toLowerCase();
  const direction = claimRecord.accidentDetails.collisionDirection;

  const inferred: DamageAnalysisComponent[] = [];

  // Infer from collision direction
  if (direction === "frontal" || /front/i.test(impactPoint)) {
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Hood/Bonnet", location: "front", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "Headlight Assembly", location: "front", damageType: "broken", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "rear" || /rear|back/i.test(impactPoint)) {
    inferred.push(
      { name: "Rear Bumper", location: "rear", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: "Trunk/Boot Lid", location: "rear", damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
      { name: "Tail Light Assembly", location: "rear", damageType: "broken", severity: "moderate", visible: true, distanceFromImpact: 0.2 },
    );
  } else if (direction === "side_driver" || direction === "side_passenger") {
    const side = direction === "side_driver" ? "left" : "right";
    inferred.push(
      { name: `${side === "left" ? "Driver" : "Passenger"} Door`, location: side, damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
      { name: `${side === "left" ? "Left" : "Right"} Fender`, location: side, damageType: "deformation", severity: "moderate", visible: true, distanceFromImpact: 0.3 },
    );
  } else {
    // Generic — assume front impact as most common
    inferred.push(
      { name: "Front Bumper", location: "front", damageType: "impact", severity: "moderate", visible: true, distanceFromImpact: 0 },
    );
  }

  if (inferred.length > 0) {
    assumptions.push({
      field: "damagedParts",
      assumedValue: `${inferred.length} inferred components`,
      reason: `No damage components extracted from documents. Inferred ${inferred.length} likely damaged components from collision direction (${direction}) and impact point.`,
      strategy: "contextual_inference",
      confidence: 35,
      stage: "Stage 6",
    });
  }

  return inferred;
}

export async function runDamageAnalysisStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord
): Promise<StageResult<Stage6Output>> {
  const start = Date.now();
  ctx.log("Stage 6", "Damage analysis starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    let damagedParts: DamageAnalysisComponent[];

    if (claimRecord.damage.components.length > 0) {
      // Normal path: build from extracted components
      damagedParts = claimRecord.damage.components.map((comp, index) => ({
        name: comp.name || "Unknown Component",
        location: comp.location || "general",
        damageType: comp.damageType || "impact",
        severity: normaliseSeverity(comp.severity),
        visible: true,
        distanceFromImpact: index * 0.3,
      }));
    } else {
      // Self-healing: no components — infer from description/direction
      isDegraded = true;
      ctx.log("Stage 6", "DEGRADED: No damage components available — inferring from accident details");
      damagedParts = inferDamageFromDescription(claimRecord, assumptions);
      recoveryActions.push({
        target: "damagedParts",
        strategy: "contextual_inference",
        success: damagedParts.length > 0,
        description: `No damage components in extraction. Inferred ${damagedParts.length} components from collision direction and impact point.`,
      });
    }

    // Group into damage zones
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

      return { zone, componentCount: data.components.length, maxSeverity: maxSev };
    });

    const overallSeverityScore = calculateOverallSeverity(damagedParts);
    const structuralDamageDetected = claimRecord.accidentDetails.structuralDamage ||
      damagedParts.some(p => /frame|chassis|subframe|pillar|rail|structural|unibody/.test((p.name || "").toLowerCase()));

    const output: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
    };

    ctx.log("Stage 6", `Damage analysis complete. ${damagedParts.length} parts, ${damageZones.length} zones, severity: ${overallSeverityScore}/100, structural: ${structuralDamageDetected}`);

    return {
      status: isDegraded ? "degraded" : "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: isDegraded,
    };
  } catch (err) {
    ctx.log("Stage 6", `Damage analysis failed: ${String(err)} — producing empty analysis`);

    return {
      status: "degraded",
      data: {
        damagedParts: [],
        damageZones: [],
        overallSeverityScore: 0,
        structuralDamageDetected: false,
        totalDamageArea: 0,
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "damageAnalysis",
        assumedValue: "empty",
        reason: `Damage analysis failed: ${String(err)}. Producing empty analysis.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 6",
      }],
      recoveryActions: [{
        target: "damage_analysis_error",
        strategy: "default_value",
        success: true,
        description: `Damage analysis error caught. Producing empty analysis to allow pipeline to continue.`,
      }],
      degraded: true,
    };
  }
}
