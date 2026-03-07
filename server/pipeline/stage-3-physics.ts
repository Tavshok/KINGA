/**
 * pipeline/stage-3-physics.ts
 *
 * Stage 3: Physics Analysis
 *
 * Responsibilities:
 *   - Build the vehicleData, accidentData, and damageAssessment inputs
 *     for the physics engine from Stage 1 + Stage 2 outputs
 *   - Call analyzeAccidentPhysics
 *   - Normalise the raw output into the typed PhysicsResult contract
 *   - Save the normalised result to the aiAssessments table
 *
 * Gate: only runs when ClassifiedClaimData.runPhysics === true
 *
 * Inputs:  ExtractedDocumentData + ClassifiedClaimData + PipelineContext
 * Outputs: PhysicsResult
 */

import {
  type PipelineContext,
  type StageResult,
  type ExtractedDocumentData,
  type ClassifiedClaimData,
  type PhysicsResult,
  type AccidentSeverity,
} from "./types";
import { eq } from "drizzle-orm";

export async function runPhysicsStage(
  ctx: PipelineContext,
  extraction: ExtractedDocumentData,
  classification: ClassifiedClaimData
): Promise<StageResult<PhysicsResult>> {
  const start = Date.now();

  if (!classification.runPhysics) {
    ctx.log("Stage 3 Physics", `Skipped — incident type: ${classification.incidentType}`);
    return { status: "skipped", data: null, durationMs: 0, savedToDb: false };
  }

  ctx.log("Stage 3 Physics", `Running physics engine for claim ${ctx.claimId}`);

  try {
    const { analyzeAccidentPhysics } = await import("../accidentPhysics");

    const v = classification.vehicle;

    // ── Build vehicleData ──────────────────────────────────────────────────
    // Map our powertrain type to accidentPhysics.ts powertrainType enum
    const powertrainMap: Record<string, "ice" | "hybrid" | "phev" | "bev"> = {
      ice: "ice", bev: "bev", phev: "phev", hev: "hybrid",
    };
    // Map our body type to accidentPhysics.ts vehicleType enum (no hatchback)
    const vtMap: Record<string, "sedan" | "suv" | "truck" | "van" | "sports" | "compact"> = {
      sedan: "sedan", hatchback: "compact", suv: "suv",
      pickup: "truck", van: "van", truck: "truck",
      sports: "sports", compact: "compact",
    };
    const vehicleData = {
      make: v.make,
      model: v.model,
      year: v.year ?? new Date().getFullYear() - 5,
      mass: v.massKg,
      vehicleType: vtMap[v.bodyType] ?? "sedan",
      powertrainType: powertrainMap[v.powertrain] ?? "ice",
    };

    // ── Build accidentData ─────────────────────────────────────────────────
    // Crush depth: use extracted value; fall back to severity-based estimate
    const crushDepth = extraction.maxCrushDepth > 0
      ? extraction.maxCrushDepth
      : _estimateCrushDepth(extraction.damagedComponents);

    // Map our CollisionDirection to AccidentType (they share the same values)
    const accidentType = (classification.collisionDirection === "unknown"
      ? "frontal"
      : classification.collisionDirection) as any;

    const accidentData = {
      accidentType,
      damagePhotos: ctx.sourceDocument.photos,
      incidentDescription: extraction.incidentDescription || "",
      weatherConditions: "unknown",
      roadConditions: "unknown",
      impactPoint: (extraction.impactPoint || "front_center") as any,
    };

    // ── Build damageAssessment ─────────────────────────────────────────────
    const damageAssessment = {
      damagedComponents: extraction.damagedComponents.map((c) => ({
        name: c.name,
        location: c.location || "front",
        damageType: (c.damageType as any) || "structural",
        severity: (c.severity as any) || "moderate",
        visible: c.visible ?? true,
        distanceFromImpact: c.distanceFromImpact ?? 0,
      })),
      totalDamageArea: extraction.totalDamageArea || 0.5,
      maxCrushDepth: crushDepth,
      structuralDamage: extraction.structuralDamage,
      airbagDeployment: extraction.airbagDeployment,
    };

    const raw = await analyzeAccidentPhysics(vehicleData, accidentData, damageAssessment);

    const result = _normalise(raw);

    ctx.log(
      "Stage 3 Physics",
      `Complete — ${result.impactForceKn.toFixed(1)} kN, ${result.estimatedSpeedKmh.toFixed(0)} km/h, ` +
      `${result.energyDissipatedKj.toFixed(0)} kJ, severity: ${result.accidentSeverity}`
    );

    // ── Save to DB ─────────────────────────────────────────────────────────
    try {
      const { aiAssessments } = await import("../../drizzle/schema");
      await ctx.db
        .update(aiAssessments)
        .set({
          physicsAnalysis: JSON.stringify(result),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiAssessments.claimId, ctx.claimId));

      ctx.log("Stage 3 Physics", "Saved to DB");
      return { status: "success", data: result, durationMs: Date.now() - start, savedToDb: true };
    } catch (dbErr) {
      ctx.log("Stage 3 Physics", `DB save failed: ${String(dbErr)}`);
      return { status: "success", data: result, durationMs: Date.now() - start, savedToDb: false };
    }
  } catch (err) {
    ctx.log("Stage 3 Physics", `ERROR: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate crush depth from damage component severity when not measured.
 * Based on IIHS typical deformation ranges:
 *   minor: 0.05–0.15 m, moderate: 0.15–0.35 m, severe: 0.35–0.60 m
 */
function _estimateCrushDepth(components: ExtractedDocumentData["damagedComponents"]): number {
  if (!components || components.length === 0) return 0.10; // conservative minor
  const severities = components.map((c) => (c.severity || "").toLowerCase());
  if (severities.some((s) => s === "catastrophic")) return 0.55;
  if (severities.some((s) => s === "severe")) return 0.45;
  if (severities.some((s) => s === "moderate")) return 0.25;
  if (severities.some((s) => s === "minor")) return 0.10;
  return 0.10;
}

/**
 * Normalise the raw accidentPhysics.ts output into the typed PhysicsResult contract.
 * Handles all known field name variations across engine versions.
 */
function _normalise(raw: any): PhysicsResult {
  // Impact force — may be a number (Newtons) or { magnitude: number }
  const forceN: number = (() => {
    const f = raw.impactForce;
    if (!f) return 0;
    if (typeof f === "number") return f;
    if (typeof f === "object" && "magnitude" in f) return f.magnitude ?? 0;
    return 0;
  })();

  // Energy
  const energyJ: number = raw.energyDissipated ?? raw.kineticEnergy ?? 0;
  const kineticJ: number = raw.kineticEnergy ?? energyJ;

  // Speed
  const speedKmh: number =
    raw.estimatedSpeed?.value ??
    raw.estimatedSpeedKmh ??
    raw.speedEstimate?.estimatedSpeedKmh ??
    0;

  // Delta-V
  const deltaV: number =
    raw.deltaV?.value ??
    raw.deltaVKmh ??
    raw.deltaV ??
    0;

  // Deceleration
  const decelG: number =
    raw.deceleration?.value ??
    raw.decelerationG ??
    raw.deceleration ??
    0;

  // Severity
  const severity: AccidentSeverity =
    raw.accidentSeverity ?? raw.severity ?? _severityFromForce(forceN / 1000);

  // Latent damage probabilities
  const ldp = raw.latentDamageProbability ?? {};
  const latentDamageProbability = {
    engine: ldp.engine ?? _engineProbFromForce(forceN / 1000),
    transmission: ldp.transmission ?? _transmissionProbFromForce(forceN / 1000),
    suspension: ldp.suspension ?? _suspensionProbFromForce(forceN / 1000),
    frame: ldp.frame ?? _frameProbFromForce(forceN / 1000),
    electrical: ldp.electrical ?? _electricalProbFromForce(forceN / 1000),
  };

  return {
    impactForceN: forceN,
    impactForceKn: forceN / 1000,
    energyDissipatedJ: energyJ,
    energyDissipatedKj: energyJ / 1000,
    kineticEnergyJ: kineticJ,
    estimatedSpeedKmh: speedKmh,
    deltaVKmh: deltaV,
    decelerationG: decelG,
    accidentSeverity: severity,
    collisionType: raw.collisionType ?? raw.accidentType ?? "unknown",
    primaryImpactZone: raw.primaryImpactZone ?? raw.impactPoint ?? "unknown",
    latentDamageProbability,
    damageConsistencyScore: raw.damageConsistency?.score ?? raw.consistencyScore ?? raw.overallConsistency ?? 70,
    rawPhysicsOutput: raw,
  };
}

// Fallback probability functions when physics engine doesn't return latentDamageProbability
// Based on IIHS structural deformation onset data (kN thresholds)
function _engineProbFromForce(kn: number): number {
  if (kn < 25) return 5;
  if (kn < 35) return 20;
  if (kn < 45) return 45;
  if (kn < 60) return 70;
  return 90;
}
function _transmissionProbFromForce(kn: number): number {
  if (kn < 35) return 5;
  if (kn < 50) return 25;
  if (kn < 65) return 55;
  return 80;
}
function _suspensionProbFromForce(kn: number): number {
  if (kn < 15) return 10;
  if (kn < 30) return 30;
  if (kn < 50) return 60;
  return 85;
}
function _frameProbFromForce(kn: number): number {
  if (kn < 45) return 5;
  if (kn < 60) return 30;
  if (kn < 75) return 65;
  return 90;
}
function _electricalProbFromForce(kn: number): number {
  if (kn < 20) return 15;
  if (kn < 40) return 35;
  if (kn < 60) return 60;
  return 80;
}
function _severityFromForce(kn: number): AccidentSeverity {
  if (kn < 8) return "cosmetic";
  if (kn < 20) return "minor";
  if (kn < 40) return "moderate";
  if (kn < 65) return "severe";
  return "catastrophic";
}
