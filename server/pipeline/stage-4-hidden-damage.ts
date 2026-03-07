/**
 * pipeline/stage-4-hidden-damage.ts
 *
 * Stage 4: Hidden Damage Inference
 *
 * Responsibilities:
 *   - Use physics engine output (latentDamageProbability, impactForceKn,
 *     energyDissipatedKj, deltaVKmh, collisionDirection) as the primary driver
 *   - Map probabilities to vehicle-specific component names from Stage 2
 *   - Apply quantitative force thresholds (FORCE_THRESHOLDS from types.ts)
 *   - Compute cost estimates scaled with energyDissipated kJ × repair index
 *   - Produce a reason string that cites actual physics quantities
 *   - Save to DB immediately
 *
 * When physics is unavailable (Stage 3 failed/skipped):
 *   - Falls back to component-location-based inference with reduced confidence
 *
 * Inputs:  ExtractedDocumentData + ClassifiedClaimData + PhysicsResult | null
 * Outputs: HiddenDamageResult
 */

import {
  type PipelineContext,
  type StageResult,
  type ExtractedDocumentData,
  type ClassifiedClaimData,
  type PhysicsResult,
  type HiddenDamageResult,
  type InferredHiddenDamage,
  type HiddenDamageChain,
  type ConfidenceLabel,
  FORCE_THRESHOLDS,
} from "./types";
import type { VehicleComponentSet } from "../vehicle-components";
import { eq } from "drizzle-orm";

export async function runHiddenDamageStage(
  ctx: PipelineContext,
  extraction: ExtractedDocumentData,
  classification: ClassifiedClaimData,
  physics: PhysicsResult | null
): Promise<StageResult<HiddenDamageResult>> {
  const start = Date.now();
  ctx.log("Stage 4 Hidden Damage", `Running for claim ${ctx.claimId}`);

  try {
    const damages = physics
      ? _inferFromPhysics(extraction, classification, physics)
      : _inferFromComponents(extraction, classification);

    const totalEstimatedCostUsd = damages.reduce((s, d) => s + d.estimatedCostUsd, 0);
    const energySeverityIndex = physics
      ? Math.min(3.0, Math.max(1.0, Math.sqrt(physics.energyDissipatedKj / 10)))
      : 1.0;

    const result: HiddenDamageResult = {
      damages,
      totalEstimatedCostUsd,
      physicsUsed: !!physics,
      energySeverityIndex,
    };

    ctx.log("Stage 4 Hidden Damage", `Inferred ${damages.length} hidden damage(s), total ~$${totalEstimatedCostUsd.toFixed(0)}`);

    // ── Save to DB ─────────────────────────────────────────────────────────
    try {
      const { aiAssessments } = await import("../../drizzle/schema");
      await ctx.db
        .update(aiAssessments)
        .set({
          inferredHiddenDamagesJson: JSON.stringify(damages),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(aiAssessments.claimId, ctx.claimId));

      ctx.log("Stage 4 Hidden Damage", "Saved to DB");
      return { status: "success", data: result, durationMs: Date.now() - start, savedToDb: true };
    } catch (dbErr) {
      ctx.log("Stage 4 Hidden Damage", `DB save failed: ${String(dbErr)}`);
      return { status: "success", data: result, durationMs: Date.now() - start, savedToDb: false };
    }
  } catch (err) {
    ctx.log("Stage 4 Hidden Damage", `ERROR: ${String(err)}`);
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
// PHYSICS-DRIVEN INFERENCE
// ─────────────────────────────────────────────────────────────────────────────

function _inferFromPhysics(
  extraction: ExtractedDocumentData,
  classification: ClassifiedClaimData,
  physics: PhysicsResult
): InferredHiddenDamage[] {
  const { impactForceKn, energyDissipatedKj, estimatedSpeedKmh, deltaVKmh, latentDamageProbability } = physics;
  const c = classification.vehicle.components as VehicleComponentSet;
  const chain = _directionToChain(classification.collisionDirection);

  // Energy Severity Index: √(E_kJ / 10), clamped 1.0–3.0
  // At 10 kJ → ESI=1.0 (minor), 40 kJ → 2.0 (moderate), 90 kJ → 3.0 (severe)
  const esi = Math.min(3.0, Math.max(1.0, Math.sqrt(energyDissipatedKj / 10)));

  const damages: InferredHiddenDamage[] = [];

  // ── Front impact chain ────────────────────────────────────────────────────
  if (chain === "front" || chain === "general") {
    // Step 1: Bumper reinforcement beam (onset: 8 kN)
    if (impactForceKn >= FORCE_THRESHOLDS.BUMPER_BEAM) {
      const prob = _clamp(40 + latentDamageProbability.frame * 0.3 + (impactForceKn - FORCE_THRESHOLDS.BUMPER_BEAM) * 1.5);
      damages.push(_make({
        component: c.frontBumperBeam,
        reason: `Impact force ${impactForceKn.toFixed(1)} kN exceeds bumper beam deformation onset (${FORCE_THRESHOLDS.BUMPER_BEAM} kN). Energy dissipated: ${energyDissipatedKj.toFixed(0)} kJ.`,
        probability: prob, propagationStep: 1, chain, baseCostUsd: 180, esi, physics,
      }));
    }

    // Step 2: Radiator support (onset: 15 kN)
    if (impactForceKn >= FORCE_THRESHOLDS.RADIATOR_SUPPORT) {
      const prob = _clamp(30 + latentDamageProbability.frame * 0.4 + (impactForceKn - FORCE_THRESHOLDS.RADIATOR_SUPPORT) * 1.2);
      damages.push(_make({
        component: c.radiatorSupport,
        reason: `Force ${impactForceKn.toFixed(1)} kN exceeds radiator support deformation threshold (${FORCE_THRESHOLDS.RADIATOR_SUPPORT} kN). Estimated speed: ${estimatedSpeedKmh.toFixed(0)} km/h.`,
        probability: prob, propagationStep: 2, chain, baseCostUsd: 320, esi, physics,
      }));

      // Step 2b: Radiator / AC condenser (co-located)
      damages.push(_make({
        component: c.radiator,
        reason: `Radiator support deformation at ${impactForceKn.toFixed(1)} kN typically displaces the radiator. Energy: ${energyDissipatedKj.toFixed(0)} kJ. Engine latent probability: ${latentDamageProbability.engine}%.`,
        probability: _clamp(latentDamageProbability.engine * 0.6 + 20),
        propagationStep: 2, chain, baseCostUsd: 280, esi, physics,
      }));

      // Wheel alignment (always relevant above 15 kN)
      damages.push(_make({
        component: c.suspensionGeometry,
        reason: `Front suspension geometry disturbed at ${impactForceKn.toFixed(1)} kN. Alignment check and reset required. Suspension latent probability: ${latentDamageProbability.suspension}%.`,
        probability: _clamp(latentDamageProbability.suspension * 0.6 + 40),
        propagationStep: 2, chain, baseCostUsd: 95, esi, physics,
      }));
    }

    // Step 3: Engine mounts (onset: 25 kN)
    if (impactForceKn >= FORCE_THRESHOLDS.ENGINE_MOUNTS) {
      damages.push(_make({
        component: c.engineMounts,
        reason: `Engine mount stress threshold (${FORCE_THRESHOLDS.ENGINE_MOUNTS} kN) exceeded at ${impactForceKn.toFixed(1)} kN. ΔV: ${deltaVKmh.toFixed(1)} km/h. Engine latent probability: ${latentDamageProbability.engine}%.`,
        probability: _clamp(latentDamageProbability.engine * 0.8 + 10),
        propagationStep: 3, chain, baseCostUsd: 220, esi, physics,
      }));
    }

    // Step 4: Steering rack (onset: 35 kN)
    if (impactForceKn >= FORCE_THRESHOLDS.STEERING_RACK) {
      damages.push(_make({
        component: c.steeringRack,
        reason: `Steering rack displacement threshold (${FORCE_THRESHOLDS.STEERING_RACK} kN) exceeded at ${impactForceKn.toFixed(1)} kN. Suspension latent probability: ${latentDamageProbability.suspension}%.`,
        probability: _clamp(latentDamageProbability.suspension * 0.7 + 15),
        propagationStep: 4, chain, baseCostUsd: 480, esi, physics,
      }));

      // Front subframe (co-loaded with steering rack)
      damages.push(_make({
        component: c.frontSubframe,
        reason: `Front subframe loaded at ${impactForceKn.toFixed(1)} kN. Frame latent probability: ${latentDamageProbability.frame}%. Energy: ${energyDissipatedKj.toFixed(0)} kJ.`,
        probability: _clamp(latentDamageProbability.frame * 0.7 + 10),
        propagationStep: 4, chain, baseCostUsd: 650, esi, physics,
      }));
    }

    // Step 5: Transmission mount (onset: 60 kN — catastrophic only)
    if (impactForceKn >= FORCE_THRESHOLDS.TRANSMISSION) {
      damages.push(_make({
        component: c.transmissionMount,
        reason: `Transmission mount failure threshold (${FORCE_THRESHOLDS.TRANSMISSION} kN) exceeded at ${impactForceKn.toFixed(1)} kN. Transmission latent probability: ${latentDamageProbability.transmission}%.`,
        probability: _clamp(latentDamageProbability.transmission * 0.85 + 5),
        propagationStep: 5, chain, baseCostUsd: 950, esi, physics,
      }));
    }
  }

  // ── Rear impact chain ─────────────────────────────────────────────────────
  if (chain === "rear") {
    if (impactForceKn >= FORCE_THRESHOLDS.BUMPER_BEAM) {
      damages.push(_make({
        component: c.rearBumperBeam,
        reason: `Rear impact force ${impactForceKn.toFixed(1)} kN exceeds rear bumper beam deformation onset (${FORCE_THRESHOLDS.BUMPER_BEAM} kN).`,
        probability: _clamp(45 + (impactForceKn - FORCE_THRESHOLDS.BUMPER_BEAM) * 1.5),
        propagationStep: 1, chain, baseCostUsd: 160, esi, physics,
      }));
    }
    if (impactForceKn >= FORCE_THRESHOLDS.RADIATOR_SUPPORT) {
      damages.push(_make({
        component: c.bootFloor,
        reason: `Rear floor pan deformation at ${impactForceKn.toFixed(1)} kN. Energy: ${energyDissipatedKj.toFixed(0)} kJ.`,
        probability: _clamp(latentDamageProbability.frame * 0.6 + 20),
        propagationStep: 2, chain, baseCostUsd: 380, esi, physics,
      }));
      damages.push(_make({
        component: c.rearAxle,
        reason: `Rear axle and suspension geometry disturbed at ${impactForceKn.toFixed(1)} kN. Suspension latent probability: ${latentDamageProbability.suspension}%.`,
        probability: _clamp(latentDamageProbability.suspension * 0.65 + 15),
        propagationStep: 2, chain, baseCostUsd: 520, esi, physics,
      }));
    }
    if (impactForceKn >= FORCE_THRESHOLDS.FRAME_RAIL) {
      damages.push(_make({
        component: c.rearChassisRails,
        reason: `Rear chassis rail deformation at ${impactForceKn.toFixed(1)} kN. Frame latent probability: ${latentDamageProbability.frame}%.`,
        probability: _clamp(latentDamageProbability.frame * 0.85 + 5),
        propagationStep: 3, chain, baseCostUsd: 980, esi, physics,
      }));
    }
    if (impactForceKn >= FORCE_THRESHOLDS.ENGINE_MOUNTS && c.fuelTank) {
      damages.push(_make({
        component: c.fuelTank,
        reason: `Fuel tank at risk from rear chassis deformation at ${impactForceKn.toFixed(1)} kN. Inspection required.`,
        probability: _clamp(latentDamageProbability.frame * 0.5 + 15),
        propagationStep: 3, chain, baseCostUsd: 480, esi, physics,
      }));
    }
  }

  // ── Side impact chains ────────────────────────────────────────────────────
  if (chain === "side_driver" || chain === "side_passenger") {
    const side: "driver" | "passenger" = chain === "side_driver" ? "driver" : "passenger";
    if (impactForceKn >= FORCE_THRESHOLDS.RADIATOR_SUPPORT) {
      damages.push(_make({
        component: c.doorIntrusionBeam(side),
        reason: `Side door intrusion beam loaded at ${impactForceKn.toFixed(1)} kN. Energy: ${energyDissipatedKj.toFixed(0)} kJ.`,
        probability: _clamp(35 + (impactForceKn - FORCE_THRESHOLDS.RADIATOR_SUPPORT) * 1.2),
        propagationStep: 1, chain, baseCostUsd: 280, esi, physics,
      }));
      damages.push(_make({
        component: c.rockerSill(side),
        reason: `Rocker/sill panel deformation at ${impactForceKn.toFixed(1)} kN. Suspension latent probability: ${latentDamageProbability.suspension}%.`,
        probability: _clamp(latentDamageProbability.suspension * 0.55 + 20),
        propagationStep: 2, chain, baseCostUsd: 420, esi, physics,
      }));
    }
    if (impactForceKn >= FORCE_THRESHOLDS.FRAME_RAIL) {
      damages.push(_make({
        component: c.bPillar(side),
        reason: `B-pillar structural deformation at ${impactForceKn.toFixed(1)} kN. Frame latent probability: ${latentDamageProbability.frame}%.`,
        probability: _clamp(latentDamageProbability.frame * 0.8 + 10),
        propagationStep: 3, chain, baseCostUsd: 850, esi, physics,
      }));
    }
  }

  // ── Wiring harness (relevant above 20 kN for all impact directions) ───────
  if (impactForceKn >= 20) {
    damages.push(_make({
      component: c.wiringHarness,
      reason: `Wiring harness chafing and connector damage probable at ${impactForceKn.toFixed(1)} kN. Electrical latent probability: ${latentDamageProbability.electrical}%.`,
      probability: _clamp(latentDamageProbability.electrical * 0.7 + 10),
      propagationStep: 2, chain, baseCostUsd: 180, esi, physics,
    }));
  }

  // Filter out very low probability items (< 15%) to avoid noise
  return damages.filter((d) => d.probability >= 15);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT-BASED FALLBACK (when physics is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

function _inferFromComponents(
  extraction: ExtractedDocumentData,
  classification: ClassifiedClaimData
): InferredHiddenDamage[] {
  const c = classification.vehicle.components as VehicleComponentSet;
  const chain = _directionToChain(classification.collisionDirection);
  const damages: InferredHiddenDamage[] = [];
  const esi = 1.5; // Conservative default when physics unavailable

  const compNames = extraction.damagedComponents.map((d) => d.name.toLowerCase());
  const hasFrontDamage = compNames.some((n) =>
    n.includes("bumper") || n.includes("bonnet") || n.includes("fender") ||
    n.includes("headlamp") || n.includes("grille") || n.includes("hood")
  );
  const hasRearDamage = compNames.some((n) =>
    n.includes("boot") || n.includes("tailgate") || n.includes("rear bumper") || n.includes("tail")
  );
  const hasSevereDamage = extraction.damagedComponents.some(
    (d) => d.severity === "severe" || d.severity === "catastrophic"
  );

  const _fallback = (component: string, reason: string, prob: number, step: number, baseCost: number): InferredHiddenDamage => ({
    component,
    reason: reason + " Physics data unavailable — confidence reduced.",
    probability: prob,
    confidenceLabel: "Low" as ConfidenceLabel,
    propagationStep: step,
    chain,
    estimatedCostUsd: Math.round((baseCost * esi) / 5) * 5,
    physicsForceKn: 0,
    physicsEnergyKj: 0,
    physicsSpeedKmh: 0,
    physicsDeltaV: 0,
  });

  if ((chain === "front" || chain === "general") && hasFrontDamage) {
    damages.push(_fallback(c.frontBumperBeam, "Front impact detected from component locations. Bumper reinforcement beam deformation likely.", 55, 1, 180));
    damages.push(_fallback(c.radiatorSupport, "Front component damage pattern suggests radiator support involvement.", 45, 2, 320));
    damages.push(_fallback(c.suspensionGeometry, "Front impact — wheel alignment check required.", 60, 2, 95));
    if (hasSevereDamage) {
      damages.push(_fallback(c.engineMounts, "Severe front damage detected. Engine mount stress probable.", 40, 3, 220));
    }
  }

  if (chain === "rear" && hasRearDamage) {
    damages.push(_fallback(c.rearBumperBeam, "Rear impact detected from component locations. Rear bumper beam deformation likely.", 55, 1, 160));
    damages.push(_fallback(c.rearAxle, "Rear impact — rear axle geometry check required.", 40, 2, 520));
  }

  return damages;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface MakeParams {
  component: string;
  reason: string;
  probability: number;
  propagationStep: number;
  chain: HiddenDamageChain;
  baseCostUsd: number;
  esi: number;
  physics: PhysicsResult;
}

function _make(p: MakeParams): InferredHiddenDamage {
  const prob = _clamp(p.probability);
  const confidence: ConfidenceLabel = prob >= 70 ? "High" : prob >= 40 ? "Medium" : "Low";
  // Cost scales with ESI: baseCost × ESI, rounded to nearest $5
  const cost = Math.round((p.baseCostUsd * p.esi) / 5) * 5;
  return {
    component: p.component,
    reason: p.reason,
    probability: prob,
    confidenceLabel: confidence,
    propagationStep: p.propagationStep,
    chain: p.chain,
    estimatedCostUsd: cost,
    physicsForceKn: p.physics.impactForceKn,
    physicsEnergyKj: p.physics.energyDissipatedKj,
    physicsSpeedKmh: p.physics.estimatedSpeedKmh,
    physicsDeltaV: p.physics.deltaVKmh,
  };
}

function _clamp(v: number): number {
  return Math.round(Math.min(95, Math.max(5, v)));
}

function _directionToChain(direction: string): HiddenDamageChain {
  if (direction === "frontal") return "front";
  if (direction === "rear") return "rear";
  if (direction === "side_driver") return "side_driver";
  if (direction === "side_passenger") return "side_passenger";
  if (direction === "rollover") return "rollover";
  return "general";
}
