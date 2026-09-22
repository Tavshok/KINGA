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
import { WRITE_OFF_RECOMMENDATION_THRESHOLD } from "./pipelineCostConstants";
import {
  assessCrushDepthEligibility,
  type QuantitativeFieldDecision,
} from "../evidence-governance/quantitativeFieldGovernance";
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

/**
 * Resolve governing crush geometry exclusively from calibrated VGE/VGR evidence.
 * Stage 6 visual output may describe damage, but it cannot become a numerical
 * physics input without stored-dimension photogrammetric calibration.
 */
export function resolveCalibratedCrushDepth(ctx: PipelineContext): number | null {
  // P0 records VGE/VGR as advisory visual geometry pending P1 qualification.
  return null;
}

export type PhysicsUnavailableReason = "insufficient_geometry" | "engine_failure";

/**
 * A review-required collision result when governing physics cannot be safely
 * produced. It intentionally carries no numerical physics placeholders.
 */
export function buildUnavailablePhysicsOutput(
  ctx: Pick<PipelineContext, "vgeCalibrationResult" | "vgeReconciliationResult">,
  collisionDirection: ClaimRecord["accidentDetails"]["collisionDirection"],
  reason: PhysicsUnavailableReason,
  crushDepth: QuantitativeFieldDecision = assessCrushDepthEligibility({
    vgeResult: ctx.vgeCalibrationResult,
    vgrResult: ctx.vgeReconciliationResult,
  })
): Stage7Output {
  const insufficientGeometry = reason === "insufficient_geometry";
  return {
    quantitativeEvidence: { crushDepth },
    impactForceKn: null,
    impactVector: { direction: collisionDirection, magnitude: null, angle: 0 },
    energyDistribution: {
      kineticEnergyJ: null,
      energyDissipatedJ: null,
      energyDissipatedKj: null,
    },
    estimatedSpeedKmh: null,
    deltaVKmh: null,
    decelerationG: null,
    accidentSeverity: "none",
    accidentReconstructionSummary: insufficientGeometry
      ? "Quantitative collision physics was not run because P0 classifies all current visual crush geometry as advisory pending P1 qualification. Raw visual estimates remain descriptive evidence only."
      : "Quantitative collision physics did not complete after a pipeline failure. No numerical fallback was produced; the claim requires review or a rerun using the qualified calibrated geometry.",
    damageConsistencyScore: 0,
    latentDamageProbability: {
      engine: 0,
      transmission: 0,
      suspension: 0,
      frame: 0,
      electrical: 0,
    },
    physicsExecuted: false,
    physicsStatus: insufficientGeometry
      ? "SKIPPED_INSUFFICIENT_GEOMETRY"
      : "SKIPPED_ENGINE_FAILURE",
    geometryEvidenceBlock: ctx.vgeCalibrationResult ?? null,
    vgrReconciliation: ctx.vgeReconciliationResult ?? null,
    isPhysicallyPlausible: false,
  };
}

/** A review-required collision result when no calibrated VGE/VGR crush is admissible. */
export function buildInsufficientGeometryPhysicsOutput(
  ctx: Pick<PipelineContext, "vgeCalibrationResult" | "vgeReconciliationResult">,
  collisionDirection: ClaimRecord["accidentDetails"]["collisionDirection"],
  crushDepth?: QuantitativeFieldDecision
): Stage7Output {
  return buildUnavailablePhysicsOutput(ctx, collisionDirection, "insufficient_geometry", crushDepth);
}

function hasRawStage6CrushDepthCandidate(damageAnalysis: Stage6Output): boolean {
  return damageAnalysis.damagedParts.some(
    part => typeof part.crushDepthM === "number" && Number.isFinite(part.crushDepthM) && part.crushDepthM > 0
  );
}

function buildPhysicsInput(
  claimRecord: ClaimRecord,
  damageAnalysis: Stage6Output,
  calibratedCrushDepthM: number
) {
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
    maxCrushDepth: calibratedCrushDepthM,
    // These values remain descriptive evidence. They cannot modify the
    // calibrated numerical collision result in this integrity boundary.
    structuralDamage: false,
    airbagDeployment: false,
  };

  return { vehicleData, accidentData, damageAssessment };
}

/**
 * Raw Stage 6 crush, energy, severity, and document values remain descriptive
 * evidence only in this package. They are intentionally not converted into a
 * physics input: resolveCalibratedCrushDepth is the sole governing admission.
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

/**
 * Stage 7: Physics Reconstruction
 *
 * Reconstructs the accident physics from damage analysis, vehicle data, and
 * claim description. Produces speed estimates, energy calculations, and a
 * collision reconstruction summary used by Stage 7b (causal reasoning) and
 * Stage 8 (fraud detection).
 *
 * ── ROUTING LOGIC ────────────────────────────────────────────────────────────────
 *
 *   Collision / unknown: Full physics reconstruction via calibrated geometry,
 *     `analyzeAccidentPhysics`, and `speedInferenceEnsemble`. Includes scenario-aware routing for animal
 *     strikes, parking lot impacts, and rear-end collisions.
 *
 *   Non-physical (theft, fire, flood, vandalism): Physics stage is skipped.
 *     Returns a default output with isDegraded=false and a skip reason.
 *
 * ── KEY SUB-FUNCTIONS ────────────────────────────────────────────────────────────────
 *
 *   `resolveCalibratedCrushDepth` — admits only qualified VGE/VGR crush geometry
 *   `buildPhysicsInput`        — assemble all physics inputs from claim record
 *   `runDamagePatternValidation`— cross-validate damage zones vs collision direction
 *   `speedInferenceEnsemble`   — multi-method speed consensus (M1–M5)
 *
 * Calibration basis: stored vehicle geometry, calibrated pixel spans, and the
 * quantitative models that consume only qualifying VGE/VGR geometry.
 *
 * The R-C-01/R-C-02 physics fixes (Batch 3) restructured the scenario-aware
 * routing. If touching this function, re-verify against the R-C-01/R-C-02
 * test coverage before committing.
 */
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

  const crushDepthEligibility = assessCrushDepthEligibility({
    vgeResult: ctx.vgeCalibrationResult,
    vgrResult: ctx.vgeReconciliationResult,
    rawStage6CrushDepthCandidatePresent: hasRawStage6CrushDepthCandidate(damageAnalysis),
  });

  // ── ANIMAL STRIKE ROUTING ──────────────────────────────────────────────────
  // Animal-strike numerical estimation has no active P0 governing measurement
  // adapter, so it must not bypass collision-physics eligibility.
  if (isAnimalStrike) {
    const unavailableOutput = buildInsufficientGeometryPhysicsOutput(
      ctx,
      claimRecord.accidentDetails.collisionDirection,
      crushDepthEligibility
    );
    unavailableOutput.damagePatternValidation = runDamagePatternValidation(
      ctx,
      claimRecord,
      damageAnalysis
    );
    ctx.log(
      "Stage 7",
      "Animal-strike numerical physics skipped: P0 has no governing quantitative measurement adapter for this route."
    );
    return {
      status: "skipped",
      data: unavailableOutput,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: false,
    };
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
  const calibratedCrushDepthM = resolveCalibratedCrushDepth(ctx);

  ctx.log("Stage 7", `Scenario routing: ${collisionScenario} | struckParty=${isStruckParty} | hitAndRun=${isHitAndRun} | parkingLot=${isParkingLot}`);

  if (calibratedCrushDepthM == null) {
    const unavailableOutput = buildInsufficientGeometryPhysicsOutput(
      ctx,
      claimRecord.accidentDetails.collisionDirection,
      crushDepthEligibility
    );
    unavailableOutput.damagePatternValidation = runDamagePatternValidation(
      ctx,
      claimRecord,
      damageAnalysis
    );
    ctx.log(
      "Stage 7",
      "Quantitative physics skipped: P0 classifies current VGE/VGR visual geometry as advisory pending P1; raw Stage 6 crush values were not admitted."
    );
    return {
      status: "skipped",
      data: unavailableOutput,
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions,
      recoveryActions,
      degraded: false,
    };
  }

  // ── Parking lot: cap speed and flag ───────────────────────────────────────────────
  if (isParkingLot) {
    ctx.log("Stage 7", "Parking lot scenario — capping speed at 15 km/h; skipping causal reasoning");
    if (!extractedSpeed || extractedSpeed <= 0) {
      const unavailableOutput: Stage7Output = {
        impactForceKn: null,
        impactVector: { direction: claimRecord.accidentDetails.collisionDirection, magnitude: null, angle: 0 },
        energyDistribution: { kineticEnergyJ: null, energyDissipatedJ: null, energyDissipatedKj: null },
        estimatedSpeedKmh: null,
        deltaVKmh: null,
        decelerationG: null,
        accidentSeverity: "none",
        accidentReconstructionSummary: "Parking-lot collision physics was not run because no recorded speed was available.",
        damageConsistencyScore: 0,
        latentDamageProbability: { engine: 0, transmission: 0, suspension: 0, frame: 0, electrical: 0 },
        physicsExecuted: false,
        physicsStatus: "SKIPPED_NO_SPEED",
      };
      unavailableOutput.damagePatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
      return { status: "skipped", data: unavailableOutput, durationMs: Date.now() - start, savedToDb: false, assumptions, recoveryActions, degraded: false };
    }
    // Cap a recorded parking-lot speed; never invent a default speed.
    const parkingSpeedKmh = Math.min(extractedSpeed, 15);
    const parkingMass = claimRecord.vehicle.massKg;
    const parkingSpeedMs = parkingSpeedKmh / 3.6;
    const parkingKE = 0.5 * parkingMass * parkingSpeedMs * parkingSpeedMs;
    const parkingCrush = calibratedCrushDepthM;
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
    const { vehicleData, accidentData, damageAssessment } = buildPhysicsInput(
      claimRecord,
      damageAnalysis,
      calibratedCrushDepthM
    );

    const physicsResult: any = await analyzeAccidentPhysics(vehicleData as any, accidentData as any, damageAssessment as any);

    const impactForceN = physicsResult.impactForce?.magnitude ?? 0;
    const impactForceKn = impactForceN / 1000;
    const kineticEnergyJ = physicsResult.kineticEnergy ?? 0;
    const energyDissipatedJ = physicsResult.energyDissipated ?? 0;
    const estimatedSpeedKmh = physicsResult.speedEstimate?.estimatedSpeedKmh ?? physicsResult.estimatedSpeed?.value ?? 0;
    const deltaVKmh = physicsResult.deltaV ?? 0;
    const decelerationG = physicsResult.decelerationG ?? 0;
    if (!(impactForceKn > 0 && kineticEnergyJ > 0 && energyDissipatedJ > 0 && estimatedSpeedKmh > 0 && deltaVKmh > 0)) {
      throw new Error("Calibrated collision physics did not produce complete governing values; numerical defaults are not admitted");
    }

    // Compute decelerationG from the calibrated crush depth if the engine did not return it.
    // analyzeAccidentPhysics does not return decelerationG, so this is always needed.
    // Formula: a = v^2 / (2 * crushDepth), capped between 0.1 G and 50 G.
    const crushDepthForDecel = calibratedCrushDepthM;
    const speedMsForDecel = estimatedSpeedKmh / 3.6;
    const decelMs2Computed = (speedMsForDecel * speedMsForDecel) / (2 * crushDepthForDecel);
    const decelerationGComputed = Math.min(50, Math.max(0.1, decelMs2Computed / 9.81));
    const finalDecelerationG = decelerationG > 0 ? decelerationG : decelerationGComputed;

    // ── Sideswipe lateral contact coefficient (severity-variable) ───────────────────────────
    // In a sideswipe, contact is glancing rather than direct. The effective energy transfer varies
    // by severity:
    //   minor   → 0.25  (light paint-to-paint contact, minimal structural loading)
    //   moderate → 0.40  (door/panel deformation, some structural loading)
    //   severe  → 0.60  (deep panel intrusion, possible structural damage)
    // Speed is unchanged (it is the vehicle's travel speed, not the impact speed).
    // This coefficient is fixed by collision type; raw Stage 6 severity cannot
    // alter governing force or energy in the calibrated-only path.
    const sideswipeCoefficient = collisionScenario === 'sideswipe' ? 0.40 : 1.0;

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
    const finalForceKn = impactForceKn * sideswipeCoefficient;
    const finalEnergyKj = (energyDissipatedJ / 1000) * sideswipeCoefficient;
    const finalEnergyJ = energyDissipatedJ * sideswipeCoefficient;
    const finalKineticJ = kineticEnergyJ * sideswipeCoefficient;

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
      estimatedSpeedKmh,
      deltaVKmh,
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
        // CALIBRATION: 6-component threshold for minor→moderate upgrade is engineering-judgment.
        /** Minimum damaged component count triggering minor→moderate severity upgrade */
        const MINOR_TO_MODERATE_COMPONENT_THRESHOLD = 6;
        // Upgrade minor → moderate if 6+ components or electrical systems damaged
        if (baseSeverity === "minor" && (componentCount >= MINOR_TO_MODERATE_COMPONENT_THRESHOLD || hasElectrical)) return "moderate";
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
      // Carry forward speedForensics from analyzeAccidentPhysics so the enrichment
      // block below (which adds ensemble consensus) has something to work with.
      speedForensics: physicsResult.speedForensics ?? null,
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
      const seatbeltFired = claimRecord.accidentDetails.seatbeltPretensioner === true;

      // Governing crush geometry was admitted at the stage boundary above.
      // The ensemble receives the same VGE/VGR-calibrated measurement; Stage 6
      // pixel interpretations, energy, severity, and document values remain advisory.
      const visionCrushDepthM = calibratedCrushDepthM;
      ctx.log(
        "Stage 7",
        `[VGE/VGR] Using qualified calibrated crush depth: ${(visionCrushDepthM * 1000).toFixed(0)} mm. Raw Stage 6 crush values were not considered for physics.`
      );

      // Count distinct damage zones — used to determine if M5 Path B is valid
      // (Path B is disabled for multi-zone damage: rollover, multi-impact, etc.)
      const distinctZones = new Set(
        damageAnalysis.damagedParts
          .map((p: any) => (p.zone ?? p.damageZone ?? 'unknown').toLowerCase())
          .filter((z: string) => z && z !== 'unknown')
      );
      const damagedZoneCount = distinctZones.size || 1;

      const ensembleResult = runSpeedInferenceEnsemble({
        massKg: claimRecord.vehicle.massKg,
        make: claimRecord.vehicle.make,
        model: claimRecord.vehicle.model,
        bodyType: claimRecord.vehicle.bodyType,
        collisionDirection: claimRecord.accidentDetails.collisionDirection,
        // Collision physics in this package admits only qualified VGE/VGR geometry.
        documentCrushDepthM: null,
        inferredCrushDepthM: null,
        visionCrushDepthM,
        totalDamageAreaM2: resolvedDamageAreaM2,
        partsCostUsd: null, // M2 disabled — cost is not a reliable physics input
        structuralDamage: false,
        airbagDeployment: false,
        seatbeltPretensioner: false,
        totalDeformationEnergyJ: null,
        visionConfidenceScore: null,
        damagedZoneCount,
        // Damage severity context for crush-depth plausibility check
        damageSeverity: null,
        totalLossIndicated: !!(claimRecord.valuation?.repairToValueRatio && claimRecord.valuation.repairToValueRatio >= WRITE_OFF_RECOMMENDATION_THRESHOLD),
        // M7: Claimant-stated speed from claim documents.
        // MUST read from ctx.claimantStatedSpeedKmh — the IMMUTABLE field set once
        // after Stage 5 from the original Stage 3 extraction. DO NOT use
        // claimRecord.accidentDetails.estimatedSpeedKmh here — that field is
        // overwritten by Stage 7 consensus on every pipeline run, causing M7 to
        // receive the previous run's consensus instead of the claimant's stated speed.
        claimedSpeedKmh: ctx.claimantStatedSpeedKmh ?? null,
      });
      ctx.log('Stage 7', `Ensemble inputs: mass=${claimRecord.vehicle.massKg}kg, area=${resolvedDamageAreaM2?.toFixed(3)}m², calibratedCrush=${visionCrushDepthM}, claimedSpeed=${ctx.claimantStatedSpeedKmh ?? 'null'} [immutable]; raw Stage 6 energy, severity, and deployment methods disabled.`);
      output.speedInferenceEnsemble = ensembleResult;
      ctx.log('Stage 7', `Speed ensemble: consensus=${ensembleResult.consensusSpeedKmh} km/h, methods=${ensembleResult.methodsRan}, confidence=${ensembleResult.overallConfidence}${ensembleResult.highDivergence ? ' [HIGH_DIVERGENCE]' : ''}`);

      // ── Override estimatedSpeedKmh with ensemble consensus ────────────────────
      // The ensemble is the authoritative multi-method speed estimate.
      // output.estimatedSpeedKmh was set from the legacy analyzeAccidentPhysics()
      // call above. Now that the ensemble has run, replace it with the consensus
      // so the report, fraud engine, and speed forensics all use the same number.
      // Only override when the ensemble produced a valid consensus.
      if (ensembleResult.consensusSpeedKmh != null && ensembleResult.consensusSpeedKmh > 0) {
        const legacySpeed = output.estimatedSpeedKmh;
        output.estimatedSpeedKmh = ensembleResult.consensusSpeedKmh;
        ctx.log('Stage 7',
          `[ENSEMBLE_OVERRIDE] estimatedSpeedKmh: ${legacySpeed} km/h (legacy) → ${ensembleResult.consensusSpeedKmh} km/h (ensemble consensus, ${ensembleResult.overallConfidence} confidence)`
        );
        // ── Recompute derived physics values from the ensemble consensus speed ──
        // The pre-ensemble values (impactForceKn, deltaVKmh, kineticEnergyJ,
        // decelerationG) were computed from the legacy speed. Now that the
        // ensemble has produced a consensus, recompute all four so the output
        // is internally consistent with the reported estimatedSpeedKmh.
        const ensembleSpeedMs = ensembleResult.consensusSpeedKmh / 3.6;
        const massKgForRecompute = claimRecord.vehicle.massKg;
        if (!Number.isFinite(massKgForRecompute) || massKgForRecompute <= 0) {
          throw new Error("Vehicle mass is required for calibrated physics recomputation");
        }
        const crushDepthForRecompute = calibratedCrushDepthM;
        // KE = ½mv²
        const recomputedKEJ = 0.5 * massKgForRecompute * ensembleSpeedMs * ensembleSpeedMs;
        // F = mv²/(2d), in kN — use same 0.1 m floor as the pre-ensemble path (line ~258)
        const crushFloor = Math.max(crushDepthForRecompute, 0.1);
        const recomputedForceKn = (massKgForRecompute * ensembleSpeedMs * ensembleSpeedMs)
          / (2 * crushFloor * 1000);
        // ΔV = √(2KE/m), back to km/h
        const recomputedDeltaVKmh = Math.sqrt(2 * recomputedKEJ / massKgForRecompute) * 3.6;
        // a = v²/(2d), in g
        const recomputedDecelMs2 = (ensembleSpeedMs * ensembleSpeedMs)
          / (2 * crushFloor);
        const recomputedDecelerationG = Math.min(50, Math.max(0.1, recomputedDecelMs2 / 9.81));
        // Apply sideswipe coefficient to force/energy (same as the pre-ensemble path)
        const recomputedForceKnFinal = recomputedForceKn * sideswipeCoefficient;
        const recomputedKEJFinal     = recomputedKEJ * sideswipeCoefficient;
        output.impactForceKn = recomputedForceKnFinal;
        output.impactVector  = { ...output.impactVector, magnitude: recomputedForceKnFinal * 1000 };
        output.energyDistribution = {
          kineticEnergyJ:     recomputedKEJFinal,
          energyDissipatedJ:  recomputedKEJFinal,
          energyDissipatedKj: recomputedKEJFinal / 1000,
        };
        output.deltaVKmh     = recomputedDeltaVKmh;
        output.decelerationG = recomputedDecelerationG;
        // ── Braking distance: d = v²/(2μg) ──────────────────────────────────────
        // μ is selected from road surface; defaults to 0.7 (dry asphalt).
        const roadSurface = claimRecord.accidentDetails.roadSurface?.toLowerCase() ?? '';
        const mu = roadSurface.includes('wet') || roadSurface.includes('rain') ? 0.4
          : roadSurface.includes('gravel') || roadSurface.includes('dirt') || roadSurface.includes('sand') ? 0.3
          : 0.7; // dry asphalt default
        output.brakingDistanceM = ensembleSpeedMs > 0
          ? Math.round((ensembleSpeedMs * ensembleSpeedMs) / (2 * mu * 9.81) * 100) / 100
          : null;
        output.brakingFrictionCoefficient = mu;
        ctx.log('Stage 7',
          `[ENSEMBLE_RECOMPUTE] impactForceKn=${recomputedForceKnFinal.toFixed(3)} kN, deltaVKmh=${recomputedDeltaVKmh.toFixed(1)} km/h, decelerationG=${recomputedDecelerationG.toFixed(3)} g, brakingDistanceM=${output.brakingDistanceM} m (μ=${mu})`
        );
      }

      // ── Enrich speedForensics with ensemble consensus and speed limit ───────────
      // Now that the ensemble has run, recompute speedForensics with the
      // ensemble consensus as the best physics estimate (more accurate than
      // Campbell's formula alone) and add the road speed limit if known.
      if (output.speedForensics) {
        const { computeSpeedForensics } = await import('../accidentPhysics');
        const speedLimitKmh = claimRecord.accidentDetails.speedLimitKmh ?? null;
        const enriched = computeSpeedForensics({
          claimedSpeedKmh: output.speedForensics.claimedSpeedKmh,
          physicsSpeedKmh: output.speedForensics.physicsSpeedKmh,
          ensembleSpeedKmh: ensembleResult.consensusSpeedKmh,
          speedLimitKmh,
          accidentSeverity: output.accidentSeverity ?? 'minor',
          occupantInjuryRisk: output.occupantInjuryRisk ?? 'low',
        });
        output.speedForensics = enriched;
        ctx.log('Stage 7', `Speed forensics: claimed=${enriched.claimedSpeedKmh ?? 'N/A'} km/h, physics=${enriched.physicsSpeedKmh} km/h, deviation=${enriched.deviationPct ?? 'N/A'}% [${enriched.deviationClass}]${enriched.requiresVerification ? ' ⚠️ REQUIRES_VERIFICATION' : ''}`);
      }
      // ── Damage classification: Possible / Impossible / Unexplained ──────────────
      // Run after the ensemble so we use the final consensus speed.
      // This classifies each observed damage component and image zone against
      // the expected damage profile for the stated speed and direction.
      try {
        const { classifyDamage } = await import('./damageClassificationEngine');
        const observedComponents: string[] = [
          ...(damageAnalysis.damagedParts ?? []).map((c: { name: string }) => c.name),
        ].filter(Boolean);
        const imageDetectedZones: string[] = [
          ...(damageAnalysis.damageZones ?? []).map((z: { zone: string }) => z.zone),
        ].filter(Boolean);
        const finalSpeedForClassification = ensembleResult.consensusSpeedKmh ?? output.estimatedSpeedKmh ?? 0;
        const crushDepthForClassification = calibratedCrushDepthM;
        output.damageClassification = classifyDamage({
          consensusSpeedKmh: finalSpeedForClassification,
          collisionDirection: claimRecord.accidentDetails.collisionDirection,
          observedComponents,
          imageDetectedZones,
          airbagDeploymentObserved: airbagDeployed === true ? true : airbagDeployed === false ? false : null,
          pretensionerObserved: seatbeltFired === true ? true : seatbeltFired === false ? false : null,
          structuralDamageDetected: damageAnalysis.structuralDamageDetected ?? false,
          crushDepthM: crushDepthForClassification,
          damageSeverity: output.accidentSeverity ?? null,
        });
        ctx.log('Stage 7',
          `Damage classification: ${output.damageClassification.overallClassification} ` +
          `(possible=${output.damageClassification.counts.possible}, ` +
          `impossible=${output.damageClassification.counts.impossible}, ` +
          `unexplained=${output.damageClassification.counts.unexplained})`
        );
      } catch (classErr) {
        ctx.log('Stage 7', `Damage classification failed (non-fatal): ${String(classErr)}`);
        output.damageClassification = null;
      }
    } catch (ensembleErr) {
      ctx.log('Stage 7', `Speed ensemble failed (non-fatal): ${String(ensembleErr)}`);
      output.speedInferenceEnsemble = null;
      output.damageClassification = null;
    }

    // ── Attach VGE/VGR geometry calibration results to Stage 7 output ──────────
    // These are stored on ctx by Stage 6.5A/B and must be forwarded through
    // Stage7Output so db.ts can persist them in physics_analysis JSON.
    output.geometryEvidenceBlock = ctx.vgeCalibrationResult ?? null;
    output.vgrReconciliation = ctx.vgeReconciliationResult ?? null;

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
    ctx.log("Stage 7", `Physics engine failed: ${String(err)} — retaining null-valued review output`);

    // Governing physics must never be reconstructed with a generic or raw Stage
    // 6 fallback after the calibrated path has failed. Preserve descriptive
    // damage-pattern evidence only; force, energy, speed, delta-V, and
    // deceleration remain unavailable.
    const unavailablePhysics = buildUnavailablePhysicsOutput(
      ctx,
      claimRecord.accidentDetails.collisionDirection,
      calibratedCrushDepthM == null ? "insufficient_geometry" : "engine_failure"
    );
    const fallbackPatternValidation = runDamagePatternValidation(ctx, claimRecord, damageAnalysis);
    unavailablePhysics.damagePatternValidation = fallbackPatternValidation;
    recoveryActions.push({
      target: "physicsAnalysis",
      strategy: "skip",
      success: true,
      description: `Physics engine failed: ${String(err)}. No numerical fallback was produced; review or rerun is required.`,
    });

    return {
      status: "degraded",
      data: unavailablePhysics,
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
