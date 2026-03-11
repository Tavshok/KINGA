/**
 * pipeline-v2/stage-5-assembly.ts
 *
 * STAGE 5 — CLAIM DATA ASSEMBLY
 *
 * Combines validated extracted data into one structured ClaimRecord.
 * This record is the single input passed to all analysis engines (Stages 6-9).
 *
 * Also resolves vehicle mass, body type, and powertrain from make/model.
 */

import type {
  PipelineContext,
  StageResult,
  Stage4Output,
  Stage5Output,
  ClaimRecord,
  VehicleRecord,
  DriverRecord,
  AccidentDetails,
  PoliceReportRecord,
  DamageRecord,
  RepairQuoteRecord,
  CanonicalIncidentType,
  CollisionDirection,
  VehicleBodyType,
  PowertrainType,
} from "./types";

// Import vehicle resolution utilities from existing pipeline
import {
  resolveVehicleMass,
  classifyIncidentType,
  inferVehicleBodyType,
  inferPowertrainType,
} from "../pipeline/types";

export async function runAssemblyStage(
  ctx: PipelineContext,
  stage4: Stage4Output
): Promise<StageResult<Stage5Output>> {
  const start = Date.now();
  ctx.log("Stage 5", "Claim data assembly starting");

  try {
    const v = stage4.validatedFields;

    // Resolve vehicle properties
    const make = v.vehicleMake || ctx.claim.vehicleMake || "Unknown";
    const model = v.vehicleModel || ctx.claim.vehicleModel || "Unknown";
    const year = v.vehicleYear || ctx.claim.vehicleYear || null;

    const { massKg, tier: massTier } = resolveVehicleMass(make, model, year);
    const bodyType = inferVehicleBodyType(make, model);
    const powertrain = inferPowertrainType(make, model);

    const vehicle: VehicleRecord = {
      make,
      model,
      year,
      registration: v.vehicleRegistration || ctx.claim.vehicleRegistration || null,
      vin: v.vehicleVin || null,
      colour: v.vehicleColour || null,
      engineNumber: v.vehicleEngineNumber || null,
      mileageKm: v.vehicleMileage || ctx.claim.vehicleMileage || null,
      bodyType,
      powertrain,
      massKg,
      massTier,
      valueUsd: ctx.claim.vehicleValue ? ctx.claim.vehicleValue / 100 : null,
    };

    const driver: DriverRecord = {
      name: v.driverName || ctx.claim.driverName || null,
      claimantName: v.claimantName || ctx.claim.claimantName || null,
    };

    const incidentType = classifyIncidentType(v.incidentType || ctx.claim.incidentType || "unknown");
    const collisionDirection = classifyCollisionDirection(v.accidentType || "unknown");

    const accidentDetails: AccidentDetails = {
      date: v.accidentDate || ctx.claim.accidentDate || null,
      location: v.accidentLocation || ctx.claim.accidentLocation || null,
      description: v.accidentDescription || ctx.claim.incidentDescription || null,
      incidentType,
      collisionDirection,
      impactPoint: v.impactPoint || null,
      estimatedSpeedKmh: v.estimatedSpeedKmh || null,
      maxCrushDepthM: v.maxCrushDepthM || null,
      totalDamageAreaM2: v.totalDamageAreaM2 || null,
      structuralDamage: v.structuralDamage ?? false,
      airbagDeployment: v.airbagDeployment ?? false,
    };

    const policeReport: PoliceReportRecord = {
      reportNumber: v.policeReportNumber || null,
      station: v.policeStation || null,
    };

    const damage: DamageRecord = {
      description: v.damageDescription || null,
      components: v.damagedComponents,
      imageUrls: v.uploadedImageUrls.length > 0
        ? v.uploadedImageUrls
        : (ctx.damagePhotoUrls || []),
    };

    const repairQuote: RepairQuoteRecord = {
      repairerName: v.panelBeater || null,
      repairerCompany: v.repairerCompany || null,
      assessorName: v.assessorName || null,
      quoteTotalCents: v.quoteTotalCents || null,
      labourCostCents: v.labourCostCents || null,
      partsCostCents: v.partsCostCents || null,
      lineItems: [], // Will be populated from repair quote document if available
    };

    const claimRecord: ClaimRecord = {
      claimId: ctx.claimId,
      tenantId: ctx.tenantId,
      vehicle,
      driver,
      accidentDetails,
      policeReport,
      damage,
      repairQuote,
      dataQuality: {
        completenessScore: stage4.completenessScore,
        missingFields: stage4.missingFields,
        validationIssues: stage4.issues,
      },
      marketRegion: (ctx.claim as any).country || "ZW",
    };

    const output: Stage5Output = { claimRecord };

    ctx.log("Stage 5", `Assembly complete. Vehicle: ${make} ${model} (${year || 'unknown year'}), Mass: ${massKg}kg (${massTier}), Incident: ${incidentType}, Components: ${damage.components.length}, Completeness: ${stage4.completenessScore}%`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 5", `Assembly failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}

/**
 * Classify collision direction from raw string.
 */
function classifyCollisionDirection(raw: string): CollisionDirection {
  const r = (raw || "").toLowerCase().trim();
  if (r === "frontal" || r === "front" || r === "head-on" || r === "head_on") return "frontal";
  if (r === "rear" || r === "rear-end" || r === "rear_end") return "rear";
  if (r === "side_driver" || r === "driver_side" || r === "left") return "side_driver";
  if (r === "side_passenger" || r === "passenger_side" || r === "right") return "side_passenger";
  if (r === "rollover" || r === "roll_over" || r === "overturn") return "rollover";
  if (r === "multi_impact" || r === "multiple" || r === "multi") return "multi_impact";
  return "unknown";
}
