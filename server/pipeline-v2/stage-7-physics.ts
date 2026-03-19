/**
 * pipeline-v2/stage-7-physics.ts
 *
 * STAGE 7 — PHYSICS ANALYSIS ENGINE (Self-Healing)
 *
 * Computes accident physics from ClaimRecord + Stage 6 damage analysis.
 * GATED: Only runs when incidentType === "collision".
 * NEVER halts — if physics engine fails, produces estimated output from damage data.
 */

import { ensurePhysicsContract } from "./engineFallback";
import {
  applyPhysicsNumericalContract,
  mergeNumericalContract,
} from "./physicsNumericalContract";
import type {
  PipelineContext,
  StageResult,
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  AccidentSeverity,
  Assumption,
  RecoveryAction,
} from "./types";

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
    damagedComponents: damageAnalysis.damagedParts.map((p) => ({
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

function inferCrushDepth(damageAnalysis: Stage6Output, claimRecord: ClaimRecord): number {
  if (claimRecord.accidentDetails.maxCrushDepthM && claimRecord.accidentDetails.maxCrushDepthM >= 0.05) {
    return claimRecord.accidentDetails.maxCrushDepthM;
  }
  const severities = damageAnalysis.damagedParts.map(p => p.severity);
  if (severities.includes("catastrophic")) return 0.40;
  if (severities.includes("severe")) return 0.25;
  if (severities.includes("moderate")) return 0.15;
  return 0.08;
}

function mapSeverity(raw: string): AccidentSeverity {
  const s = (raw || "").toLowerCase();
  if (s === "catastrophic") return "catastrophic";
  if (s === "severe" || s === "major") return "severe";
  if (s === "moderate") return "moderate";
  if (s === "minor" || s === "light") return "minor";
  if (s === "cosmetic") return "cosmetic";
  return "moderate";
}

/**
 * Estimate physics from damage data when the physics engine fails.
 * Uses simplified Newtonian mechanics.
 */
function estimatePhysicsFromDamage(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  assumptions: Assumption[]
): Stage7Output {
  const mass = claimRecord.vehicle.massKg;
  const speedKmh = claimRecord.accidentDetails.estimatedSpeedKmh || 30;
  const speedMs = speedKmh / 3.6;

  // KE = 0.5 * m * v^2
  const kineticEnergyJ = 0.5 * mass * speedMs * speedMs;
  // Assume 60% of energy is dissipated in deformation
  const energyDissipatedJ = kineticEnergyJ * 0.6;

  // F = m * a, assume deceleration over crush depth
  const crushDepth = inferCrushDepth(damageAnalysis, claimRecord);
  const decelDistance = Math.max(crushDepth, 0.1);
  // v^2 = 2*a*d => a = v^2 / (2*d)
  const decelMs2 = (speedMs * speedMs) / (2 * decelDistance);
  const forceN = mass * decelMs2;
  const forceKn = forceN / 1000;
  const decelerationG = decelMs2 / 9.81;

  assumptions.push({
    field: "physicsAnalysis",
    assumedValue: `force=${forceKn.toFixed(1)}kN, speed=${speedKmh}km/h`,
    reason: `Physics engine failed or unavailable. Estimated using simplified Newtonian mechanics: KE=½mv², F=ma with assumed crush depth of ${crushDepth.toFixed(2)}m.`,
    strategy: "industry_average",
    confidence: 35,
    stage: "Stage 7",
  });

  const severity = damageAnalysis.overallSeverityScore > 70 ? "severe" :
    damageAnalysis.overallSeverityScore > 40 ? "moderate" : "minor";

  return {
    impactForceKn: forceKn,
    impactVector: {
      direction: claimRecord.accidentDetails.collisionDirection,
      magnitude: forceN,
      angle: 0,
    },
    energyDistribution: {
      kineticEnergyJ,
      energyDissipatedJ,
      energyDissipatedKj: energyDissipatedJ / 1000,
    },
    estimatedSpeedKmh: speedKmh,
    deltaVKmh: speedKmh * 0.6, // Approximate delta-V
    decelerationG,
    accidentSeverity: severity as AccidentSeverity,
    accidentReconstructionSummary: `Estimated physics: ${claimRecord.vehicle.make} ${claimRecord.vehicle.model} (${mass}kg) at ~${speedKmh}km/h. Force: ~${forceKn.toFixed(0)}kN. Energy dissipated: ~${(energyDissipatedJ/1000).toFixed(0)}kJ. (Simplified calculation — physics engine was unavailable.)`,
    damageConsistencyScore: 50,
    latentDamageProbability: { engine: 0.1, transmission: 0.1, suspension: 0.2, frame: 0.15, electrical: 0.05 },
    physicsExecuted: false,
  };
}

export async function runPhysicsStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output
): Promise<StageResult<Stage7Output>> {
  const start = Date.now();
  const isCollision = claimRecord.accidentDetails.incidentType === "collision";

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];

  if (!isCollision) {
    ctx.log("Stage 7", `Physics engine SKIPPED — incident type is "${claimRecord.accidentDetails.incidentType}", not collision`);
    // Stage 26: apply defensive contract — skipped output must still be complete
    const skippedOutput = ensurePhysicsContract(buildDefaultPhysicsOutput(false), "engine_skipped");
    return {
      status: "skipped",
      data: skippedOutput,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [],
      recoveryActions: [],
      degraded: false,
    };
  }

  ctx.log("Stage 7", "Physics analysis starting");

  try {
    const { analyzeAccidentPhysics } = await import("../accidentPhysics");
    const { vehicleData, accidentData, damageAssessment } = buildPhysicsInput(claimRecord, damageAnalysis);

    const physicsResult: any = await analyzeAccidentPhysics(vehicleData as any, accidentData as any, damageAssessment as any);

    const impactForceN = physicsResult.impactForce?.magnitude || 0;
    const impactForceKn = impactForceN / 1000;
    const kineticEnergyJ = physicsResult.kineticEnergy || 0;
    const energyDissipatedJ = physicsResult.energyDissipated || 0;
    const estimatedSpeedKmh = physicsResult.speedEstimate?.estimatedSpeedKmh || physicsResult.estimatedSpeed?.value || 0;
    const deltaVKmh = physicsResult.deltaV || 0;
    const decelerationG = physicsResult.decelerationG || 0;

    // Stage 34: Apply numerical contract — fill any zero/missing values with
    // vehicle-class-based estimates so output is always fully numerical.
    const numericalContract = applyPhysicsNumericalContract({
      deltaVKmh,
      speedKmh: estimatedSpeedKmh,
      massKg: claimRecord.vehicle.massKg,
      bodyType: claimRecord.vehicle.bodyType,
      crushDepthM: inferCrushDepth(damageAnalysis, claimRecord),
    });
    const merged = mergeNumericalContract(
      {
        deltaVKmh,
        estimatedSpeedKmh,
        impactForceKn,
        energyDistribution: { kineticEnergyJ, energyDissipatedJ, energyDissipatedKj: energyDissipatedJ / 1000 },
      },
      numericalContract
    );

    const output: Stage7Output = {
      impactForceKn: merged.impactForceKn,
      impactVector: {
        direction: claimRecord.accidentDetails.collisionDirection,
        magnitude: merged.impactForceKn * 1000,
        angle: physicsResult.impactForce?.direction || 0,
      },
      energyDistribution: merged.energyDistribution,
      estimatedSpeedKmh: merged.estimatedSpeedKmh,
      deltaVKmh: merged.deltaVKmh,
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
      assumptions: [],
      recoveryActions: [],
      degraded: false,
    };
  } catch (err) {
    ctx.log("Stage 7", `Physics engine failed: ${String(err)} — estimating from damage data`);

    // Self-healing: estimate physics from damage data
    const estimated = estimatePhysicsFromDamage(claimRecord, damageAnalysis, assumptions);
    // Stage 34: Apply numerical contract to the fallback estimate too
    const fallbackNumerical = applyPhysicsNumericalContract({
      deltaVKmh: estimated.deltaVKmh,
      speedKmh: estimated.estimatedSpeedKmh,
      massKg: claimRecord.vehicle.massKg,
      bodyType: claimRecord.vehicle.bodyType,
      crushDepthM: inferCrushDepth(damageAnalysis, claimRecord),
    });
    const fallbackMerged = mergeNumericalContract(
      {
        deltaVKmh: estimated.deltaVKmh,
        estimatedSpeedKmh: estimated.estimatedSpeedKmh,
        impactForceKn: estimated.impactForceKn,
        energyDistribution: estimated.energyDistribution,
      },
      fallbackNumerical
    );
    const patchedEstimate = {
      ...estimated,
      deltaVKmh: fallbackMerged.deltaVKmh,
      estimatedSpeedKmh: fallbackMerged.estimatedSpeedKmh,
      impactForceKn: fallbackMerged.impactForceKn,
      energyDistribution: fallbackMerged.energyDistribution,
    };
    // Stage 26: apply defensive contract — mark all estimated fields
    const contractedEstimate = ensurePhysicsContract(patchedEstimate, `engine_failure: ${String(err)}`);
    recoveryActions.push({
      target: "physicsAnalysis",
      strategy: "industry_average",
      success: true,
      description: `Physics engine failed: ${String(err)}. Estimated using simplified Newtonian mechanics.`,
      recoveredValue: `force=${estimated.impactForceKn.toFixed(1)}kN`,
    });

    return {
      status: "degraded",
      data: contractedEstimate,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: true,
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
