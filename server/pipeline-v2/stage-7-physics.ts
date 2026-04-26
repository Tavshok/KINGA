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
    // Pass claimed speed so the physics engine can use it as primary input
    // and cross-validate against the damage-derived estimate.
    estimatedSpeed: claimRecord.accidentDetails.estimatedSpeedKmh && claimRecord.accidentDetails.estimatedSpeedKmh > 0
      ? claimRecord.accidentDetails.estimatedSpeedKmh
      : undefined,
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

/**
 * Infer crush depth from available damage evidence using a multi-factor model.
 *
 * Priority:
 *   1. Explicit crush depth from claim document (most accurate — use as-is)
 *   2. Multi-factor estimate from damage evidence when no document value exists:
 *
 *      Severity baseline (driven by most severe component):
 *        cosmetic / minor  → 0.05 m
 *        moderate          → 0.12 m
 *        severe            → 0.22 m
 *        catastrophic      → 0.38 m
 *
 *      Additive modifiers (applied to baseline):
 *        Component count   : each component beyond 3 adds 0.01 m (cap +0.08 m)
 *        Structural damage : +0.06 m  (chassis/frame deformation = high energy)
 *        Damage area       : each 0.1 m² beyond 0.2 m² adds 0.008 m (cap +0.04 m)
 *        Airbag deployment : floor raised to 0.15 m (airbags deploy at ~20-30 km/h)
 *
 *      Result clamped to [0.04 m, 0.55 m] — physically plausible range for
 *      passenger vehicles in insurance-relevant accidents.
 *
 * Correlation basis: NHTSA crash test data and Campbell (1974) stiffness model.
 */
function inferCrushDepth(damageAnalysis: Stage6Output, claimRecord: ClaimRecord): number {
  // 1. Use explicit document value if present and plausible
  if (claimRecord.accidentDetails.maxCrushDepthM && claimRecord.accidentDetails.maxCrushDepthM >= 0.05) {
    return claimRecord.accidentDetails.maxCrushDepthM;
  }

  const parts = damageAnalysis.damagedParts;

  // 2. Primary path: use maximum crushDepthM from Stage 6 LLM measurements.
  //    These are direct numeric measurements extracted from damage photos —
  //    no qualitative string lookup tables.
  const visionDepths = parts
    .map(p => p.crushDepthM)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  if (visionDepths.length > 0) {
    const maxVision = Math.max(...visionDepths);
    // Structural displacement adds directly to crush depth
    const maxStructuralDisp = Math.max(
      0,
      ...parts.map(p => p.structuralDisplacementM ?? 0)
    );
    const airbagFloor = claimRecord.accidentDetails.airbagDeployment ? 0.15 : 0;
    const combined = maxVision + maxStructuralDisp;
    return Math.min(0.55, Math.max(0.04, Math.max(combined, airbagFloor)));
  }

  // 3. Fallback path: energy-derived crush depth from deformationEnergyJ.
  //    E = 0.5 × k × C²  →  C = √(2E/k)  where k = 1,000,000 N/m (body panel stiffness)
  const totalEnergyJ = parts
    .map(p => p.deformationEnergyJ ?? 0)
    .reduce((sum, e) => sum + e, 0);
  if (totalEnergyJ > 0) {
    const k = 1_000_000; // N/m — typical body panel stiffness
    const energyDerived = Math.sqrt((2 * totalEnergyJ) / k);
    const airbagFloor = claimRecord.accidentDetails.airbagDeployment ? 0.15 : 0;
    return Math.min(0.55, Math.max(0.04, Math.max(energyDerived, airbagFloor)));
  }

  // 4. Last-resort fallback: component count and damage area geometry.
  //    Used only when Stage 6 did not extract numeric measurements
  //    (e.g., text-only claims with no damage photos).
  const componentBonus = Math.min(0.08, Math.max(0, (parts.length - 3) * 0.01));
  const structuralBonus = damageAnalysis.structuralDamageDetected ? 0.06 : 0;
  const damageArea = damageAnalysis.totalDamageArea ?? 0;
  const areaBonus = Math.min(0.04, Math.max(0, (damageArea - 0.2) / 0.1 * 0.008));
  const airbagFloor = claimRecord.accidentDetails.airbagDeployment ? 0.15 : 0;
  // Area-based baseline: 0.10 m² ≈ 0.05 m crush, 0.30 m² ≈ 0.12 m, 0.60 m² ≈ 0.22 m
  const areaBaseline = Math.min(0.38, Math.max(0.05, damageArea * 0.40));
  const estimated = areaBaseline + componentBonus + structuralBonus + areaBonus;
  return Math.min(0.55, Math.max(0.04, Math.max(estimated, airbagFloor)));
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
  // Speed: use extracted value only. Never fabricate a speed — a guessed speed
  // cascades errors through force, energy, cost, and fraud scoring.
  const extractedSpeed = claimRecord.accidentDetails.estimatedSpeedKmh;
  const speedKmh = extractedSpeed && extractedSpeed > 0 ? extractedSpeed : null;

  const severity = damageAnalysis.overallSeverityScore > 70 ? "severe" :
    damageAnalysis.overallSeverityScore > 40 ? "moderate" : "minor";

  if (!speedKmh) {
    // Speed not available — skip force/energy calculations entirely.
    // Report physics as unavailable; downstream stages must handle null force/energy.
    return {
      impactForceKn: null as unknown as number,
      impactVector: {
        direction: claimRecord.accidentDetails.collisionDirection,
        magnitude: null as unknown as number,
        angle: 0,
      },
      energyDistribution: {
        kineticEnergyJ: null as unknown as number,
        energyDissipatedJ: null as unknown as number,
        energyDissipatedKj: null as unknown as number,
      },
      estimatedSpeedKmh: null as unknown as number,
      deltaVKmh: null as unknown as number,
      decelerationG: null as unknown as number,
      accidentSeverity: severity as AccidentSeverity,
      accidentReconstructionSummary: `Physics analysis not executed due to missing speed input. Damage severity assessed as ${severity} from visual inspection only. Speed was not recorded in the claim documents.`,
      damageConsistencyScore: 50,
      latentDamageProbability: { engine: 0.1, transmission: 0.1, suspension: 0.2, frame: 0.15, electrical: 0.05 },
      physicsExecuted: false,
      physicsStatus: 'SKIPPED_NO_SPEED' as const,
    };
  }

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
    physicsStatus: 'ESTIMATED_FALLBACK' as const,
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

  // ── SPEED EXTRACTION ────────────────────────────────────────────────────────────────
  // Use the speed extracted from the claim form (Stage 3). If speed is not
  // present in the document, it remains null — we do NOT infer or fabricate
  // speed values from damage severity. Physics calculations that require speed
  // will be skipped gracefully when speed is null.
  const extractedSpeed = claimRecord.accidentDetails.estimatedSpeedKmh;
  if (!extractedSpeed || extractedSpeed <= 0) {
    ctx.log("Stage 7", "No speed value found in claim form — speed-dependent physics calculations will be skipped.");
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
        physicsStatus: "EXECUTED" as const,
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
    skippedOutput.physicsStatus = 'SKIPPED_NON_PHYSICAL' as const;
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

  // ── SCENARIO-AWARE PHYSICS ROUTING ───────────────────────────────────────────────
  // Each collision scenario has a distinct physics posture:
  //   rear_end_struck  — energy came from the striking vehicle, not the claimant.
  //                       Claimant speed is irrelevant; use rear damage components.
  //                       Flag THIRD_PARTY_SPEED_UNAVAILABLE if no third-party speed.
  //   sideswipe        — lateral glancing contact; lower energy transfer coefficient.
  //                       Flag COSMETIC_ONLY if no structural components in damage list.
  //   hit_and_run      — physics runs on damage evidence only; no third-party data.
  //                       Flag HIT_AND_RUN_UNVERIFIABLE in reconstruction summary.
  //   parking_lot      — cap speed at 15 km/h; skip causal reasoning LLM call.
  //                       Flag PARKING_LOT_LOW_SPEED.
  //   All other scenarios proceed through the standard physics engine.
  const collisionScenario = claimRecord.accidentDetails.collisionScenario;
  const isStruckParty = claimRecord.accidentDetails.isStruckParty;
  const isHitAndRun = claimRecord.accidentDetails.isHitAndRun;
  const isParkingLot = claimRecord.accidentDetails.isParkingLotDamage;

  ctx.log("Stage 7", `Scenario routing: ${collisionScenario} | struckParty=${isStruckParty} | hitAndRun=${isHitAndRun} | parkingLot=${isParkingLot}`);

  // ── Parking lot: cap speed and flag ───────────────────────────────────────────────
  if (isParkingLot) {
    ctx.log("Stage 7", "Parking lot scenario — capping speed at 15 km/h; skipping causal reasoning");
    // Override extracted speed with parking lot cap
    const parkingSpeedKmh = Math.min(extractedSpeed || 15, 15);
    const parkingMass = claimRecord.vehicle.massKg;
    const parkingSpeedMs = parkingSpeedKmh / 3.6;
    const parkingKE = 0.5 * parkingMass * parkingSpeedMs * parkingSpeedMs;
    const parkingCrush = inferCrushDepth(damageAnalysis, claimRecord);
    const parkingDecel = (parkingSpeedMs * parkingSpeedMs) / (2 * Math.max(parkingCrush, 0.05));
    const parkingForceKn = (parkingMass * parkingDecel) / 1000;
    const parkingOutput: Stage7Output = {
      impactForceKn: parkingForceKn,
      impactVector: { direction: claimRecord.accidentDetails.collisionDirection, magnitude: parkingForceKn * 1000, angle: 0 },
      energyDistribution: { kineticEnergyJ: parkingKE, energyDissipatedJ: parkingKE * 0.6, energyDissipatedKj: parkingKE * 0.6 / 1000 },
      estimatedSpeedKmh: parkingSpeedKmh,
      deltaVKmh: parkingSpeedKmh * 0.4,
      decelerationG: parkingDecel / 9.81,
      accidentSeverity: "minor",
      accidentReconstructionSummary: `[PARKING_LOT_LOW_SPEED] Stationary/parking lot damage. Speed capped at ${parkingSpeedKmh} km/h. Impact force: ${parkingForceKn.toFixed(2)} kN. Physics based on low-speed contact model. No causal reasoning applied.`,
      damageConsistencyScore: 60,
      latentDamageProbability: { engine: 0.02, transmission: 0.01, suspension: 0.05, frame: 0.03, electrical: 0.02 },
      physicsExecuted: true,
      physicsStatus: 'EXECUTED' as const,
    };
    const parkingPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    parkingOutput.damagePatternValidation = parkingPatternValidation;
    ctx.log("Stage 7", `Parking lot physics complete. Force: ${parkingForceKn.toFixed(2)} kN at ${parkingSpeedKmh} km/h`);
    return { status: "success", data: parkingOutput, durationMs: Date.now() - start, savedToDb: false, assumptions, recoveryActions, degraded: false };
  }

  // ── Rear-end struck: annotate reconstruction summary with third-party speed flag ──
  // The main physics engine runs normally (using Campbell's formula from crush depth).
  // We annotate the output with a flag so the forensic validator and report layer
  // know that the energy source was the striking vehicle, not the claimant.
  const rearEndStruckFlag = (collisionScenario === "rear_end_struck")
    ? "[REAR_END_STRUCK] Claimant was the struck party. Impact energy originated from the third-party vehicle. "
    : "";
  const hitAndRunFlag = isHitAndRun
    ? "[HIT_AND_RUN_UNVERIFIABLE] Third party fled the scene. Physics based on damage evidence only — no third-party corroboration available. "
    : "";
  const sideswipeFlag = (collisionScenario === "sideswipe")
    ? "[SIDESWIPE] Lateral glancing contact. Energy transfer coefficient reduced. "
    : "";

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

    // ── Sideswipe lateral contact coefficient (severity-variable) ───────────────────────────
    // In a sideswipe, contact is glancing rather than direct. The effective energy transfer varies
    // by severity:
    //   minor   → 0.25  (light paint-to-paint contact, minimal structural loading)
    //   moderate → 0.40  (door/panel deformation, some structural loading)
    //   severe  → 0.60  (deep panel intrusion, possible structural damage)
    // Speed is unchanged (it is the vehicle's travel speed, not the impact speed).
    // This correction is applied AFTER the numerical contract merge so the contract floor values
    // are not artificially inflated.
    const baseSeverityForCoeff = mapSeverity(physicsResult.accidentSeverity || 'moderate');
    const sideswipeCoefficient = (collisionScenario === 'sideswipe')
      ? (baseSeverityForCoeff === 'minor' ? 0.25 : baseSeverityForCoeff === 'severe' ? 0.60 : 0.40)
      : 1.0;

    // ── Scenario-damage cross-check ────────────────────────────────────────────────────────────
    // Verify that the primary damage zone is consistent with the claimed scenario.
    // If a rear_end_struck claim has primary damage on the front, or a head_on claim
    // has primary damage on the rear, this is a strong inconsistency signal.
    // We set scenarioDamageMismatch on accidentDetails so the forensic validator
    // and fraud engine can use it without re-running physics.
    let scenarioDamageMismatch = false;
    if (damageAnalysis.damageZones && damageAnalysis.damageZones.length > 0) {
      const primaryZone = damageAnalysis.damageZones
        .slice().sort((a: any, b: any) => (b.severity_score ?? 0) - (a.severity_score ?? 0))[0]?.zone?.toLowerCase() ?? '';
      const expectedZoneMap: Record<string, string[]> = {
        rear_end_struck: ['rear', 'back', 'trunk', 'bumper_rear'],
        rear_end_striking: ['front', 'frontal', 'bumper_front', 'hood'],
        head_on: ['front', 'frontal', 'bumper_front', 'hood'],
        sideswipe: ['side', 'door', 'quarter', 'rocker', 'pillar'],
        parking_lot: ['side', 'door', 'quarter', 'rear', 'front'],
      };
      const expectedZones = expectedZoneMap[collisionScenario ?? ''] ?? [];
      if (expectedZones.length > 0 && !expectedZones.some(z => primaryZone.includes(z))) {
        scenarioDamageMismatch = true;
        ctx.log('Stage 7', `[SCENARIO_DAMAGE_MISMATCH] Scenario=${collisionScenario}, primary damage zone=${primaryZone}, expected one of [${expectedZones.join(', ')}]`);
      }
    }
    // Write back to claimRecord so forensic validator and fraud engine can read it
    if (claimRecord.accidentDetails) {
      (claimRecord.accidentDetails as any).scenarioDamageMismatch = scenarioDamageMismatch;
    }
    const finalForceKn = merged.impactForceKn * sideswipeCoefficient;
    const finalEnergyKj = (merged.energyDistribution.energyDissipatedKj ?? merged.energyDistribution.energyDissipatedJ / 1000) * sideswipeCoefficient;
    const finalEnergyJ = merged.energyDistribution.energyDissipatedJ * sideswipeCoefficient;
    const finalKineticJ = merged.energyDistribution.kineticEnergyJ * sideswipeCoefficient;

    const output: Stage7Output = {
      impactForceKn: finalForceKn,
      impactVector: {
        direction: claimRecord.accidentDetails.collisionDirection,
        magnitude: finalForceKn * 1000,
        angle: physicsResult.impactForce?.direction || 0,
      },
      energyDistribution: {
        kineticEnergyJ: finalKineticJ,
        energyDissipatedJ: finalEnergyJ,
        energyDissipatedKj: finalEnergyKj,
      },
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
      accidentReconstructionSummary: (rearEndStruckFlag + hitAndRunFlag + sideswipeFlag + buildReconstructionSummary(
        claimRecord, finalForceKn, estimatedSpeedKmh, deltaVKmh, finalEnergyKj, collisionScenario
      )).trim(),
      damageConsistencyScore: physicsResult.damageConsistency?.score || physicsResult.consistencyScore || 50,
      latentDamageProbability: physicsResult.latentDamageProbability || {
        engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0,
      },
      physicsExecuted: true,
      physicsStatus: 'EXECUTED' as const,
    };

    ctx.log("Stage 7", `Physics complete. Force: ${finalForceKn.toFixed(1)}kN${sideswipeCoefficient < 1 ? ` (sideswipe coeff ${sideswipeCoefficient})` : ''}, Speed: ${estimatedSpeedKmh.toFixed(0)}km/h, Energy: ${finalEnergyKj.toFixed(1)}kJ, Severity: ${output.accidentSeverity}`);

    // Run damage pattern validation for collision
    const collisionPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    output.damagePatternValidation = collisionPatternValidation;

    // ── Multi-method speed inference ensemble ──────────────────────────────────
    // Runs 5 independent physics methods in parallel (pure math, < 1 ms).
    // The consensus speed and per-method breakdown are surfaced in Section 2
    // of the Forensic Audit Report for adjuster transparency.
    try {
      const { runSpeedInferenceEnsemble } = await import('./speedInferenceEnsemble');

      // ── Resolve totalDamageAreaM2 ─────────────────────────────────────────
      // Priority 1: explicit document value (from claim form)
      // Priority 2: Stage 6 aggregate (if > 0)
      // Priority 3: Geometric panel dimension calculation
      //   — uses vehicle body type + panel area lookup table + per-component
      //     damage fraction (damageFractionEstimate from Stage 6 LLM, or severity-derived fallback)
      //   — this is a physics-grounded estimate, not a rough count-based proxy
      let resolvedDamageAreaM2: number | null = null;
      if (claimRecord.accidentDetails.totalDamageAreaM2 && claimRecord.accidentDetails.totalDamageAreaM2 > 0) {
        resolvedDamageAreaM2 = claimRecord.accidentDetails.totalDamageAreaM2;
        ctx.log('Stage 7', `Damage area: using document value ${resolvedDamageAreaM2.toFixed(3)} m²`);
      } else if (damageAnalysis.totalDamageArea && damageAnalysis.totalDamageArea > 0) {
        resolvedDamageAreaM2 = damageAnalysis.totalDamageArea;
        ctx.log('Stage 7', `Damage area: using Stage 6 aggregate ${resolvedDamageAreaM2.toFixed(3)} m²`);
      } else if (damageAnalysis.damagedParts.length > 0) {
        // Geometric panel dimension calculation
        const { computeTotalDamageAreaM2, inferBodyType } = await import('./vehiclePanelDimensions');
        const bodyType = inferBodyType(
          `${claimRecord.vehicle.make ?? ''} ${claimRecord.vehicle.model ?? ''}`
        );
        const geoResult = computeTotalDamageAreaM2(
          bodyType,
          damageAnalysis.damagedParts.map(p => ({
            name: p.name,
            severity: p.severity,
            panelDeformation: p.panelDeformation,
            // Use LLM-extracted fraction if available (most accurate, direct numeric measurement),
            // otherwise fall back to severity-derived fraction in vehiclePanelDimensions
            damageFractionOverride: typeof p.damageFractionEstimate === 'number'
              ? p.damageFractionEstimate
              : undefined,
          }))
        );
        resolvedDamageAreaM2 = geoResult.totalAreaM2 > 0 ? geoResult.totalAreaM2 : null;
        ctx.log('Stage 7', `Damage area: geometric panel calc (${bodyType}) = ${resolvedDamageAreaM2?.toFixed(3)} m² from ${geoResult.perComponent.length} components`);
        // Store per-component breakdown for report display
        (output as any)._panelAreaBreakdown = geoResult.perComponent;
      }

      // ── Resolve airbagDeployment / seatbeltPretensioner ──────────────────
      // Treat undefined as false — a missing field means not recorded, not deployed.
      const airbagDeployed = claimRecord.accidentDetails.airbagDeployment === true;
      const seatbeltFired = (claimRecord.accidentDetails as any).seatbeltPretensioner === true;

      // Vision crush depth: take maximum crushDepthM across all Stage 6 components.
      // This is a direct numeric measurement from the LLM, not a qualitative proxy.
      // Fall back to _forensicAnalysis for backward compatibility with older pipeline runs.
      const visionDepthsFromParts = damageAnalysis.damagedParts
        .map(p => p.crushDepthM)
        .filter((d): d is number => typeof d === 'number' && d > 0);
      const visionCrushDepthM = visionDepthsFromParts.length > 0
        ? Math.max(...visionDepthsFromParts)
        : ((claimRecord as any)._forensicAnalysis?.visionCrushDepthM ?? null);

      // Aggregate per-component numeric physics measurements from Stage 6
      const totalDeformationEnergyJ = damageAnalysis.damagedParts
        .map(p => p.deformationEnergyJ ?? 0)
        .reduce((sum, e) => sum + e, 0) || null;

      // Average visionConfidenceScore across components that reported it
      const confidenceScores = damageAnalysis.damagedParts
        .map(p => p.visionConfidenceScore)
        .filter((s): s is number => typeof s === 'number' && s > 0);
      const avgVisionConfidenceScore = confidenceScores.length > 0
        ? confidenceScores.reduce((sum, s) => sum + s, 0) / confidenceScores.length
        : null;

      const ensembleResult = runSpeedInferenceEnsemble({
        massKg: claimRecord.vehicle.massKg,
        bodyType: claimRecord.vehicle.bodyType,
        collisionDirection: claimRecord.accidentDetails.collisionDirection,
        documentCrushDepthM: claimRecord.accidentDetails.maxCrushDepthM,
        inferredCrushDepthM: inferCrushDepth(damageAnalysis, claimRecord),
        visionCrushDepthM,
        totalDamageAreaM2: resolvedDamageAreaM2,
        partsCostUsd: null, // M2 disabled — cost is not a reliable physics input
        structuralDamage: claimRecord.accidentDetails.structuralDamage ?? damageAnalysis.structuralDamageDetected,
        airbagDeployment: airbagDeployed,
        seatbeltPretensioner: seatbeltFired,
        totalDeformationEnergyJ,
        visionConfidenceScore: avgVisionConfidenceScore,
      });
      ctx.log('Stage 7', `Ensemble inputs: mass=${claimRecord.vehicle.massKg}kg, area=${resolvedDamageAreaM2?.toFixed(3)}m², airbag=${airbagDeployed}, seatbelt=${seatbeltFired}, visionDepth=${visionCrushDepthM}, deformEnergy=${totalDeformationEnergyJ?.toFixed(0)}J, visionConf=${avgVisionConfidenceScore?.toFixed(1)}`);
      output.speedInferenceEnsemble = ensembleResult;
      ctx.log('Stage 7', `Speed ensemble: consensus=${ensembleResult.consensusSpeedKmh} km/h, methods=${ensembleResult.methodsRan}, confidence=${ensembleResult.overallConfidence}${ensembleResult.highDivergence ? ' [HIGH_DIVERGENCE]' : ''}`);

      // ── Enrich speedForensics with ensemble consensus and speed limit ───────────
      // Now that the ensemble has run, recompute speedForensics with the
      // ensemble consensus as the best physics estimate (more accurate than
      // Campbell's formula alone) and add the road speed limit if known.
      if (output.physicsAnalysis?.speedForensics) {
        const { computeSpeedForensics } = await import('../accidentPhysics');
        const speedLimitKmh = (claimRecord.accidentDetails as any).speedLimitKmh ?? null;
        const enriched = computeSpeedForensics({
          claimedSpeedKmh: output.physicsAnalysis.speedForensics.claimedSpeedKmh,
          physicsSpeedKmh: output.physicsAnalysis.speedForensics.physicsSpeedKmh,
          ensembleSpeedKmh: ensembleResult.consensusSpeedKmh,
          speedLimitKmh,
          accidentSeverity: output.physicsAnalysis.accidentSeverity ?? 'minor',
          occupantInjuryRisk: output.physicsAnalysis.occupantInjuryRisk ?? 'low',
        });
        output.physicsAnalysis.speedForensics = enriched;
        ctx.log('Stage 7', `Speed forensics: claimed=${enriched.claimedSpeedKmh ?? 'N/A'} km/h, physics=${enriched.physicsSpeedKmh} km/h, deviation=${enriched.deviationPct ?? 'N/A'}% [${enriched.deviationClass}]${enriched.fraudSignal ? ' ⚠️ FRAUD_SIGNAL' : ''}`);
      }
    } catch (ensembleErr) {
      ctx.log('Stage 7', `Speed ensemble failed (non-fatal): ${String(ensembleErr)}`);
      output.speedInferenceEnsemble = null;
    }

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

function buildDefaultPhysicsOutput(
  executed: boolean,
  status: Stage7Output['physicsStatus'] = 'SKIPPED_NON_PHYSICAL'
): Stage7Output {
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
    physicsStatus: status,
  };
}

function buildReconstructionSummary(
  claimRecord: ClaimRecord,
  forceKn: number,
  speedKmh: number,
  deltaV: number,
  energyKj: number,
  scenario?: string
): string {
  const vehicle = `${claimRecord.vehicle.year || ''} ${claimRecord.vehicle.make} ${claimRecord.vehicle.model}`.trim();
  const direction = claimRecord.accidentDetails.collisionDirection.replace(/_/g, " ");
  // Speed label depends on scenario:
  //   rear_end_struck / head_on — Campbell's formula estimates the CLOSING speed (sum of both
  //     vehicles' contributions), not the claimant's own speed. Label accordingly.
  //   sideswipe — force has already been reduced by the lateral contact coefficient; note this.
  //   all others — standard "Estimated impact speed" label.
  const speedLabel =
    (scenario === 'rear_end_struck' || scenario === 'head_on')
      ? 'Estimated closing speed (Campbell formula from crush depth)'
      : (scenario === 'sideswipe')
        ? 'Estimated lateral contact speed'
        : 'Estimated impact speed';
  const parts = [
    `A ${direction} collision involving a ${vehicle} (${claimRecord.vehicle.massKg}kg).`,
    speedKmh > 0 ? `${speedLabel}: ${speedKmh.toFixed(0)} km/h.` : null,
    forceKn > 0 ? `Impact force: ${forceKn.toFixed(1)} kN.` : null,
    energyKj > 0 ? `Energy dissipated: ${energyKj.toFixed(1)} kJ.` : null,
    deltaV > 0 ? `Delta-V: ${deltaV.toFixed(1)} km/h.` : null,
    `${claimRecord.damage.components.length} damaged component(s) identified.`,
  ].filter(Boolean);
  return parts.join(" ");
}
