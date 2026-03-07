/**
 * pipeline/stage-2-classification.ts
 *
 * Stage 2: Claim Classification
 *
 * Responsibilities:
 *   - Classify the incident into a CanonicalIncidentType
 *   - Resolve the collision direction (frontal / rear / side_driver / etc.)
 *   - Determine whether the physics engine should run (collision only)
 *   - Resolve vehicle mass, body type, powertrain, and component set
 *
 * Inputs:  ExtractedDocumentData (Stage 1 output) + PipelineContext
 * Outputs: ClassifiedClaimData
 *
 * No side effects. Does not touch the database.
 */

import {
  type PipelineContext,
  type StageResult,
  type ExtractedDocumentData,
  type ClassifiedClaimData,
  type CollisionDirection,
  classifyIncidentType,
  resolveVehicleMass,
  inferVehicleBodyType,
  inferPowertrainType,
} from "./types";
import { resolveVehicleComponents } from "../vehicle-components";

export async function runClassificationStage(
  ctx: PipelineContext,
  extraction: ExtractedDocumentData
): Promise<StageResult<ClassifiedClaimData>> {
  const start = Date.now();
  ctx.log("Stage 2 Classification", `Classifying claim ${ctx.claimId}`);

  try {
    // ── 1. Resolve incident type ────────────────────────────────────────────
    // Priority: LLM collision sub-type (photo mode) → extracted type → claim DB field
    const llmAccidentType = extraction.accidentType;
    const isCollisionSubtype = [
      "frontal", "rear", "side_driver", "side_passenger", "rollover", "multi_impact",
    ].includes(llmAccidentType);

    const rawIncidentType =
      extraction.incidentType ||
      (ctx.claim as any).incidentType ||
      "unknown";

    const incidentType = isCollisionSubtype
      ? "collision"
      : classifyIncidentType(rawIncidentType);

    // ── 2. Resolve collision direction ──────────────────────────────────────
    // Use LLM sub-type first; fall back to impact point inference from component locations
    let collisionDirection: CollisionDirection = "unknown";

    if (isCollisionSubtype && llmAccidentType !== "unknown") {
      collisionDirection = llmAccidentType as CollisionDirection;
    } else if (incidentType === "collision") {
      // Infer from impact point string
      const ip = (extraction.impactPoint || "").toLowerCase();
      const desc = (extraction.incidentDescription || "").toLowerCase();
      const components = extraction.damagedComponents.map((c) => c.name.toLowerCase()).join(" ");

      if (ip.includes("front") || desc.includes("front") || components.includes("bonnet") || components.includes("bumper") || components.includes("fender") || components.includes("headlamp")) {
        // Determine left/right/centre from component names
        if (components.includes("r/h") || components.includes("right") || ip.includes("right")) {
          collisionDirection = "frontal"; // right-hand front — still frontal chain
        } else if (components.includes("l/h") || components.includes("left") || ip.includes("left")) {
          collisionDirection = "frontal";
        } else {
          collisionDirection = "frontal";
        }
      } else if (ip.includes("rear") || desc.includes("rear") || components.includes("tailgate") || components.includes("boot") || components.includes("rear bumper")) {
        collisionDirection = "rear";
      } else if (ip.includes("side_driver") || ip.includes("driver") || desc.includes("driver side")) {
        collisionDirection = "side_driver";
      } else if (ip.includes("side_passenger") || ip.includes("passenger") || desc.includes("passenger side")) {
        collisionDirection = "side_passenger";
      } else if (ip.includes("rollover") || desc.includes("rollover") || desc.includes("rolled over")) {
        collisionDirection = "rollover";
      } else {
        collisionDirection = "frontal"; // safe default for unclassified collisions
      }
    }

    ctx.log("Stage 2 Classification", `Incident: ${incidentType}, direction: ${collisionDirection}`);

    // ── 3. Resolve vehicle data ─────────────────────────────────────────────
    // Use extracted data first; fall back to claim DB fields
    const make = (extraction.vehicleMake || (ctx.claim as any).vehicleMake || "").toLowerCase().trim();
    const model = (extraction.vehicleModel || (ctx.claim as any).vehicleModel || "").toLowerCase().trim();
    const year = extraction.vehicleYear || (ctx.claim as any).vehicleYear || null;

    const { massKg, tier: massTier } = resolveVehicleMass(make, model, year);
    const bodyType = inferVehicleBodyType(make, model);
    const powertrain = inferPowertrainType(make, model);
    // vehicle-components.ts uses a subset of body types — map hatchback → sedan
    const vcBodyType = bodyType === "hatchback" ? "sedan" : bodyType;
    const components = resolveVehicleComponents(make, model, year, powertrain, vcBodyType);

    ctx.log("Stage 2 Classification", `Vehicle: ${make} ${model} ${year ?? "?"} — ${massKg} kg (${massTier}), ${bodyType}, ${powertrain}`);

    const vehicle = {
      make,
      model,
      year,
      powertrain,
      bodyType,
      massKg,
      massTier,
      components,
    };

    const data: ClassifiedClaimData = {
      incidentType,
      collisionDirection,
      runPhysics: incidentType === "collision",
      vehicle,
    };

    return {
      status: "success",
      data,
      durationMs: Date.now() - start,
      savedToDb: false, // Classification has no DB save — it's pure computation
    };
  } catch (err) {
    ctx.log("Stage 2 Classification", `ERROR: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
