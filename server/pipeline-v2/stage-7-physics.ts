/**
 * pipeline-v2/stage-7-physics.ts
 *
 * STAGE 7 — PHYSICS ANALYSIS ENGINE
 *
 * Uses extracted information to compute accident physics.
 *
 * Required inputs (from ClaimRecord + Stage 6):
 *   vehicle_mass, impact_direction, estimated_speed, damage_zone
 *
 * Outputs:
 *   impact_force, impact_vector, energy_distribution, accident_reconstruction_summary
 *
 * GATED: Only runs when incidentType === "collision".
 */

import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  AccidentSeverity,
} from "./types";

/**
 * Build the structured input for the existing physics engine.
 */
function buildPhysicsInput(claimRecord: ClaimRecord, damageAnalysis: Stage6Output) {
  const vehicleData = {
    mass: claimRecord.vehicle.massKg,
    make: claimRecord.vehicle.make,
    model: claimRecord.vehicle.model,
    year: claimRecord.vehicle.year || 2020,
    vehicleType: claimRecord.vehicle.bodyType as any,
    powertrainType: claimRecord.vehicle.powertrain,
  };

  const accidentData = {
    accidentType: claimRecord.accidentDetails.collisionDirection as any,
    damagePhotos: claimRecord.damage.imageUrls,
    incidentDescription: claimRecord.accidentDetails.description || "No description provided",
    impactPoint: claimRecord.accidentDetails.impactPoint || "unknown",
  };

  const damageAssessment = {
    damagedComponents: damageAnalysis.damagedParts.map((p, i) => ({
      name: p.name,
      location: p.location,
      damageType: p.damageType,
      severity: p.severity,
      visible: p.visible,
      distanceFromImpact: p.distanceFromImpact,
    })),
    totalDamageArea: damageAnalysis.totalDamageArea,
    maxCrushDepth: inferCrushDepth(damageAnalysis, claimRecord),
    structuralDamage: damageAnalysis.structuralDamageDetected,
    airbagDeployment: claimRecord.accidentDetails.airbagDeployment,
  };

  return { vehicleData, accidentData, damageAssessment };
}

/**
 * Infer crush depth from damage analysis when not explicitly available.
 */
function inferCrushDepth(damageAnalysis: Stage6Output, claimRecord: ClaimRecord): number {
  // Use extracted value if available
  if (claimRecord.accidentDetails.maxCrushDepthM && claimRecord.accidentDetails.maxCrushDepthM >= 0.05) {
    return claimRecord.accidentDetails.maxCrushDepthM;
  }

  // Infer from component severities
  const severities = damageAnalysis.damagedParts.map(p => p.severity);
  if (severities.includes("catastrophic")) return 0.40;
  if (severities.includes("severe")) return 0.25;
  if (severities.includes("moderate")) return 0.15;
  return 0.08;
}

/**
 * Map physics severity string to canonical type.
 */
function mapSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate") return "moderate";
  if (s === "minor" || s === "light") return "minor";
  if (s === "cosmetic") return "cosmetic";
  return "moderate";
}

export async function runPhysicsStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output
): Promise<StageResult<Stage7Output>> {
  const start = Date.now();
  const isCollision = claimRecord.accidentDetails.incidentType === "collision";

  if (!isCollision) {
    ctx.log("Stage 7", `Physics engine SKIPPED — incident type is "${claimRecord.accidentDetails.incidentType}", not collision`);
    return {
      status: "skipped",
      data: buildDefaultPhysicsOutput(false),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }

  ctx.log("Stage 7", "Physics analysis starting");

  try {
    // Import the existing physics engine
    const { analyzeAccidentPhysics, validateQuoteAgainstPhysics } = await import("../accidentPhysics");

    const { vehicleData, accidentData, damageAssessment } = buildPhysicsInput(claimRecord, damageAnalysis);

    // Run physics analysis
    const physicsResult: any = await analyzeAccidentPhysics(vehicleData as any, accidentData as any, damageAssessment as any);

    // Extract structured outputs
    const impactForceN = physicsResult.impactForce?.magnitude || 0;
    const impactForceKn = impactForceN / 1000;
    const kineticEnergyJ = physicsResult.kineticEnergy || 0;
    const energyDissipatedJ = physicsResult.energyDissipated || 0;
    const estimatedSpeedKmh = physicsResult.speedEstimate?.estimatedSpeedKmh || physicsResult.estimatedSpeed?.value || 0;
    const deltaVKmh = physicsResult.deltaV || 0;
    const decelerationG = physicsResult.decelerationG || 0;

    const output: Stage7Output = {
      impactForceKn,
      impactVector: {
        direction: claimRecord.accidentDetails.collisionDirection,
        magnitude: impactForceN,
        angle: physicsResult.impactForce?.direction || 0,
      },
      energyDistribution: {
        kineticEnergyJ,
        energyDissipatedJ,
        energyDissipatedKj: energyDissipatedJ / 1000,
      },
      estimatedSpeedKmh,
      deltaVKmh,
      decelerationG,
      accidentSeverity: mapSeverity(physicsResult.accidentSeverity || "moderate"),
      accidentReconstructionSummary: buildReconstructionSummary(
        claimRecord, impactForceKn, estimatedSpeedKmh, deltaVKmh, energyDissipatedJ / 1000
      ),
      damageConsistencyScore: physicsResult.damageConsistency?.score || physicsResult.consistencyScore || 50,
      latentDamageProbability: physicsResult.latentDamageProbability || {
        engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0,
      },
      physicsExecuted: true,
    };

    ctx.log("Stage 7", `Physics complete. Force: ${impactForceKn.toFixed(1)}kN, Speed: ${estimatedSpeedKmh.toFixed(0)}km/h, Energy: ${(energyDissipatedJ/1000).toFixed(1)}kJ, Severity: ${output.accidentSeverity}`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 7", `Physics analysis failed: ${String(err)}`);
    return {
      status: "failed",
      data: buildDefaultPhysicsOutput(false),
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}

function buildDefaultPhysicsOutput(executed: boolean): Stage7Output {
  return {
    impactForceKn: 0,
    impactVector: { direction: "unknown", magnitude: 0, angle: 0 },
    energyDistribution: { kineticEnergyJ: 0, energyDissipatedJ: 0, energyDissipatedKj: 0 },
    estimatedSpeedKmh: 0,
    deltaVKmh: 0,
    decelerationG: 0,
    accidentSeverity: "none",
    accidentReconstructionSummary: "Physics analysis was not executed for this incident type.",
    damageConsistencyScore: 50,
    latentDamageProbability: { engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0 },
    physicsExecuted: executed,
  };
}

function buildReconstructionSummary(
  claimRecord: ClaimRecord,
  forceKn: number,
  speedKmh: number,
  deltaV: number,
  energyKj: number
): string {
  const vehicle = `${claimRecord.vehicle.year || ''} ${claimRecord.vehicle.make} ${claimRecord.vehicle.model}`.trim();
  const direction = claimRecord.accidentDetails.collisionDirection.replace(/_/g, " ");
  const parts = [
    `A ${direction} collision involving a ${vehicle} (${claimRecord.vehicle.massKg}kg).`,
    speedKmh > 0 ? `Estimated impact speed: ${speedKmh.toFixed(0)} km/h.` : null,
    forceKn > 0 ? `Impact force: ${forceKn.toFixed(1)} kN.` : null,
    energyKj > 0 ? `Energy dissipated: ${energyKj.toFixed(1)} kJ.` : null,
    deltaV > 0 ? `Delta-V: ${deltaV.toFixed(1)} km/h.` : null,
    `${claimRecord.damage.components.length} damaged component(s) identified.`,
  ].filter(Boolean);
  return parts.join(" ");
}
