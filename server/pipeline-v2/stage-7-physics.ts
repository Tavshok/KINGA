/**
 * pipeline-v2/stage-7-physics.ts
 *
 * STAGE 7 — PHYSICS ANALYSIS ENGINE (Self-Healing)
 *
 * Computes accident physics from ClaimRecord + Stage 6 damage analysis.
 * GATED: Runs when incidentType is "collision" or "unknown" (physical damage events).
 * Skipped for non-physical types: theft, fire, flood, vandalism.
 * NEVER halts — if physics engine fails, produces estimated output from damage data.
 */

import { ensurePhysicsContract } from "./engineFallback";
import {
  applyPhysicsNumericalContract,
  mergeNumericalContract,
} from "./physicsNumericalContract";
import {
  validateDamagePattern,
  type DamagePatternOutput,
  type ScenarioType,
  type ImpactDirection,
} from "./damagePatternValidationEngine";
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
  // SAFEGUARD: Use extracted speed from claim form; only fall back to 30 km/h if truly missing
  const speedKmh = claimRecord.accidentDetails.estimatedSpeedKmh && claimRecord.accidentDetails.estimatedSpeedKmh > 0
    ? claimRecord.accidentDetails.estimatedSpeedKmh
    : 30;
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

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE PATTERN VALIDATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps ClaimRecord + Stage6Output fields to DamagePatternInput and runs
 * the Damage Pattern Validation Engine. Never throws — returns null on error.
 */
function runDamagePatternValidation(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output
): DamagePatternOutput | null {
  try {
    const incidentType = claimRecord.accidentDetails.incidentType;
    // Map canonical incident type to ScenarioType
    const scenarioMap: Record<string, ScenarioType> = {
      collision: "vehicle_collision",
      vehicle_collision: "vehicle_collision",
      rear_end: "vehicle_collision",
      head_on: "vehicle_collision",
      sideswipe: "vehicle_collision",
      single_vehicle: "vehicle_collision",
      rollover: "vehicle_collision",
      pedestrian_strike: "vehicle_collision",
      animal_strike: "animal_strike",
      theft: "theft",
      fire: "fire",
      flood: "flood",
      vandalism: "vandalism",
      unknown: "unknown",
    };
    const scenarioType: ScenarioType = scenarioMap[incidentType] ?? "unknown";

    // Map collision direction to ImpactDirection
    const directionMap: Record<string, ImpactDirection> = {
      frontal: "frontal",
      rear: "rear",
      side_driver: "side_driver",
      side_passenger: "side_passenger",
      rollover: "rollover",
      multi_impact: "multi_impact",
      unknown: "unknown",
    };
    const impactDirection: ImpactDirection =
      directionMap[claimRecord.accidentDetails.collisionDirection] ?? "unknown";

    // Collect damage components from both claim record and damage analysis
    // claimRecord.damage.components may contain strings or objects — normalise to string
    const claimComponents = claimRecord.damage.components.map((c: any) =>
      typeof c === "string" ? c : (c?.name ?? String(c))
    );
    const components = [
      ...claimComponents,
      ...damageAnalysis.damagedParts.map(p => p.name),
    ];
    const uniqueComponents = [...new Set(components)];

    // Collect image-detected zones from damage analysis
    const imageZones = damageAnalysis.damageZones.map(z => z.zone);

    const result = validateDamagePattern({
      scenario_type: scenarioType,
      damage_components: uniqueComponents,
      image_detected_zones: imageZones.length > 0 ? imageZones : undefined,
      impact_direction: impactDirection,
      vehicle_type: claimRecord.vehicle.bodyType,
    });

    ctx.log(
      "Stage 7 (DamagePattern)",
      `Pattern match: ${result.pattern_match} (confidence: ${result.confidence}/100). ` +
      `Structural: ${result.structural_damage_detected}. ` +
      `Image contradiction: ${result.validation_detail.image_contradiction}. ` +
      `Missing primary: ${result.missing_expected_components.slice(0, 3).join(", ") || "none"}.`
    );

    return result;
  } catch (err) {
    ctx.log("Stage 7 (DamagePattern)", `Damage pattern validation failed (non-fatal): ${String(err)}`);
    return null;
  }
}

export async function runPhysicsStage(
  ctx: PipelineContext,
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output
): Promise<StageResult<Stage7Output>> {
  const start = Date.now();
  // Run physics for collision AND unknown incident types.
  // "unknown" often means classification failed but the claim is still a physical damage event.
  // Non-physical types (theft, fire, flood, vandalism) are explicitly excluded.
  const incidentType = claimRecord.accidentDetails.incidentType;
  const isAnimalStrike = incidentType === "animal_strike";
  // All incident types that involve physical vehicle damage and should run the physics engine.
  // NON-physical types (theft, fire, flood, vandalism) are explicitly excluded.
  const PHYSICAL_DAMAGE_TYPES: string[] = [
    "collision",
    "rear_end",
    "head_on",
    "sideswipe",
    "single_vehicle",
    "rollover",
    "pedestrian_strike",
    "vehicle_collision",
    "unknown",  // unknown often means classification failed but claim is still physical
  ];
  const isPhysicalDamage = PHYSICAL_DAMAGE_TYPES.includes(incidentType ?? "");
  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];

  // ── SPEED EXTRACTION SAFEGUARD ──────────────────────────────────────────────
  // SAFEGUARD: If the claim form contains a speed value, it MUST flow through
  // to the physics engine. Log a warning if speed is missing so the extraction
  // stage can be investigated.
  const extractedSpeed = claimRecord.accidentDetails.estimatedSpeedKmh;
  if (!extractedSpeed || extractedSpeed <= 0) {
    ctx.log("Stage 7", `⚠️ SPEED SAFEGUARD: No speed extracted from claim form (estimatedSpeedKmh=${extractedSpeed}). ` +
      `If the claim form contains a handwritten speed, the OCR extraction (Stage 2/3) may have missed it. ` +
      `Physics will use a conservative default. Review extraction logs.`);
    assumptions.push({
      field: "estimatedSpeedKmh",
      assumedValue: "Default speed used (extraction gap)",
      reason: `No speed was extracted from the claim form. If the claimant wrote a speed on the form, ` +
              `the OCR extraction stage may have failed to capture it. A conservative default will be used.`,
      strategy: "default_value",
      confidence: 20,
      stage: "Stage 7",
    });
  } else {
    ctx.log("Stage 7", `Speed from claim form: ${extractedSpeed} km/h — using as primary speed input`);
  }

  // ── ANIMAL STRIKE ROUTING ──────────────────────────────────────────────────
  // When incident type is confirmed as animal_strike, use the dedicated
  // Animal Strike Physics Engine instead of the vehicle-collision model.
  if (isAnimalStrike) {
    ctx.log("Stage 7", "Animal strike detected — routing to Animal Strike Physics Engine");
    try {
      const { runAnimalStrikePhysics } = await import("./animalStrikePhysicsEngine");
      // SAFEGUARD: Use extracted speed from claim form, not a hardcoded default
      const speedKmh = extractedSpeed && extractedSpeed > 0 ? extractedSpeed : 60;
      const damageComponents = damageAnalysis.damagedParts.map(p => p.name);
      const hasBullbar: "true" | "false" | "unknown" = "unknown";

      // Infer animal category from narrative
      const narrative = (claimRecord.accidentDetails.description || "").toLowerCase();
      let animalCategory: import('./animalStrikePhysicsEngine').AnimalCategory = "unknown";
      if (narrative.includes("cow") || narrative.includes("cattle") || narrative.includes("bull")) animalCategory = "cattle";
      else if (narrative.includes("horse")) animalCategory = "horse";
      else if (narrative.includes("donkey")) animalCategory = "donkey";
      else if (narrative.includes("goat")) animalCategory = "goat";
      else if (narrative.includes("sheep")) animalCategory = "sheep";
      else if (narrative.includes("pig")) animalCategory = "pig";
      else if (narrative.includes("dog")) animalCategory = "dog";

      const animalResult = runAnimalStrikePhysics({
        speed_kmh: speedKmh,
        vehicle_type: claimRecord.vehicle.bodyType,
        damage_components: damageComponents,
        presence_of_bullbar: hasBullbar as any,
        animal_category: animalCategory,
        airbags_deployed: claimRecord.accidentDetails.airbagDeployment === true,
        seatbelts_triggered: false,
      });

      // Map animal strike output to Stage7Output format
      const animalOutput: Stage7Output = {
        impactForceKn: animalResult.impact_force_kn,
        impactVector: {
          direction: claimRecord.accidentDetails.collisionDirection,
          magnitude: animalResult.impact_force_kn * 1000,
          angle: 0,
        },
        energyDistribution: {
          kineticEnergyJ: animalResult.energy_absorbed_kj * 1000,
          energyDissipatedJ: animalResult.energy_absorbed_kj * 1000,
          energyDissipatedKj: animalResult.energy_absorbed_kj,
        },
        estimatedSpeedKmh: speedKmh,
        deltaVKmh: animalResult.delta_v_kmh,
        decelerationG: animalResult.peak_deceleration_g,
        accidentSeverity: animalResult.impact_severity as any,
        accidentReconstructionSummary: animalResult.reasoning,
        damageConsistencyScore: animalResult.plausibility_score,
        latentDamageProbability: {
          engine: animalResult.impact_severity === "catastrophic" ? 0.4 : animalResult.impact_severity === "severe" ? 0.25 : 0.1,
          transmission: 0.05,
          suspension: animalResult.impact_severity === "catastrophic" ? 0.3 : 0.1,
          frame: animalResult.impact_severity === "catastrophic" ? 0.35 : animalResult.impact_severity === "severe" ? 0.15 : 0.05,
          electrical: 0.1,
        },
        physicsExecuted: true,
        animalStrikePhysics: animalResult,
      };

      ctx.log("Stage 7", `Animal strike physics complete. Severity: ${animalResult.impact_severity}, Delta-V: ${animalResult.delta_v_kmh.toFixed(1)} km/h, Force: ${animalResult.impact_force_kn.toFixed(1)} kN, Plausibility: ${animalResult.plausibility_score}`);

      // Run damage pattern validation for animal strike
      const animalPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
      animalOutput.damagePatternValidation = animalPatternValidation;

      return {
        status: "success",
        data: animalOutput,
        durationMs: Date.now() - start,
        savedToDb: false,
        assumptions: [],
        recoveryActions: [],
        degraded: false,
      };
    } catch (err) {
      ctx.log("Stage 7", `Animal strike physics engine failed: ${String(err)} — falling through to vehicle collision engine`);
      // Fall through to standard collision physics as a safety net
    }
  }

  if (!isPhysicalDamage && !isAnimalStrike) {
    ctx.log("Stage 7", `Physics engine SKIPPED — incident type is "${incidentType}" (non-physical damage event)`);
    // Stage 26: apply defensive contract — skipped output must still be complete
    const skippedOutput = ensurePhysicsContract(buildDefaultPhysicsOutput(false), "engine_skipped");
    // Still run damage pattern validation for non-physical incidents (theft, fire, flood, vandalism)
    const skippedPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    skippedOutput.damagePatternValidation = skippedPatternValidation;
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

    // Compute decelerationG from merged values if physicsResult did not return it.
    // analyzeAccidentPhysics does not return decelerationG, so this is always needed.
    // Formula: a = v^2 / (2 * crushDepth), capped between 0.1 G and 50 G.
    const crushDepthForDecel = inferCrushDepth(damageAnalysis, claimRecord);
    const speedMsForDecel = merged.estimatedSpeedKmh / 3.6;
    const decelMs2Computed = (speedMsForDecel * speedMsForDecel) / (2 * Math.max(crushDepthForDecel, 0.05));
    const decelerationGComputed = Math.min(50, Math.max(0.1, decelMs2Computed / 9.81));
    const finalDecelerationG = decelerationG > 0 ? decelerationG : decelerationGComputed;

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
      decelerationG: finalDecelerationG,
      accidentSeverity: (() => {
        // Base severity from physics engine
        const baseSeverity = mapSeverity(physicsResult.accidentSeverity || "moderate");
        // Upgrade severity if component count or system types suggest more damage
        const componentCount = damageAnalysis.damagedParts.length;
        const hasElectrical = damageAnalysis.damagedParts.some(p =>
          /electrical|fuse|relay|dashboard|light|sensor|ecu|wiring|belt|airbag/i.test(p.name)
        );
        const hasStructural = damageAnalysis.damagedParts.some(p =>
          /chassis|frame|subframe|sill|pillar|rail/i.test(p.name)
        );
        // Upgrade minor → moderate if 6+ components or electrical systems damaged
        if (baseSeverity === "minor" && (componentCount >= 6 || hasElectrical)) return "moderate";
        // Upgrade moderate → severe if structural damage present
        if (baseSeverity === "moderate" && hasStructural) return "severe";
        return baseSeverity;
      })(),
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

    // Run damage pattern validation for collision
    const collisionPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    output.damagePatternValidation = collisionPatternValidation;

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
    // Run damage pattern validation even in fallback mode
    const fallbackPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    contractedEstimate.damagePatternValidation = fallbackPatternValidation;
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
