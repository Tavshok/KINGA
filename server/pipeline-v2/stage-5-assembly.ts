/**
 * pipeline-v2/stage-5-assembly.ts
 *
 * STAGE 5 — CLAIM DATA ASSEMBLY (Self-Healing)
 *
 * Combines validated extracted data into one structured ClaimRecord.
 * This record is the single input passed to all analysis engines (Stages 6-9).
 * NEVER halts — produces a minimal ClaimRecord even if most fields are missing.
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
  Assumption,
  RecoveryAction,
} from "./types";

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

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const v = stage4.validatedFields;

    // Resolve vehicle properties with fallbacks
    const make = v.vehicleMake || ctx.claim.vehicleMake || null;
    const model = v.vehicleModel || ctx.claim.vehicleModel || null;
    const year = v.vehicleYear || ctx.claim.vehicleYear || null;

    if (!make) {
      isDegraded = true;
      assumptions.push({
        field: "vehicle.make",
        assumedValue: "Unknown",
        reason: "Vehicle make not found in any source. Using 'Unknown' — physics and cost engines will use generic defaults.",
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 5",
      });
    }
    if (!model) {
      isDegraded = true;
      assumptions.push({
        field: "vehicle.model",
        assumedValue: "Unknown",
        reason: "Vehicle model not found in any source. Using 'Unknown' — mass and cost estimates will use class averages.",
        strategy: "default_value",
        confidence: 10,
        stage: "Stage 5",
      });
    }

    const effectiveMake = make || "Unknown";
    const effectiveModel = model || "Unknown";

    let massResult: { massKg: number; tier: string };
    try {
      massResult = resolveVehicleMass(effectiveMake, effectiveModel, year);
    } catch {
      massResult = { massKg: 1400, tier: "default" };
      assumptions.push({
        field: "vehicle.massKg",
        assumedValue: 1400,
        reason: "Vehicle mass resolution failed. Using 1400kg (sedan class average).",
        strategy: "industry_average",
        confidence: 40,
        stage: "Stage 5",
      });
    }

    let bodyType: string;
    try {
      bodyType = inferVehicleBodyType(effectiveMake, effectiveModel);
    } catch {
      bodyType = "sedan";
      assumptions.push({
        field: "vehicle.bodyType",
        assumedValue: "sedan",
        reason: "Body type inference failed. Defaulting to sedan.",
        strategy: "default_value",
        confidence: 30,
        stage: "Stage 5",
      });
    }

    let powertrain: string;
    try {
      powertrain = inferPowertrainType(effectiveMake, effectiveModel);
    } catch {
      powertrain = "ice";
      assumptions.push({
        field: "vehicle.powertrain",
        assumedValue: "ice",
        reason: "Powertrain inference failed. Defaulting to ICE.",
        strategy: "default_value",
        confidence: 70,
        stage: "Stage 5",
      });
    }

    const vehicle: VehicleRecord = {
      make: effectiveMake,
      model: effectiveModel,
      year,
      registration: v.vehicleRegistration || ctx.claim.vehicleRegistration || null,
      vin: v.vehicleVin || null,
      colour: v.vehicleColour || null,
      engineNumber: v.vehicleEngineNumber || null,
      mileageKm: v.vehicleMileage || ctx.claim.vehicleMileage || null,
      bodyType: bodyType as any,
      powertrain: powertrain as any,
      massKg: massResult.massKg,
      massTier: massResult.tier as "explicit" | "inferred_model" | "inferred_class" | "not_available",
      valueUsd: ctx.claim.vehicleValue ? ctx.claim.vehicleValue / 100 : null,
    };

    const driver: DriverRecord = {
      name: v.driverName || ctx.claim.driverName || null,
      claimantName: v.claimantName || ctx.claim.claimantName || null,
    };

    const rawIncidentType = v.incidentType || ctx.claim.incidentType || null;
    let incidentType: CanonicalIncidentType;
    if (rawIncidentType) {
      incidentType = classifyIncidentType(rawIncidentType);
    } else {
      incidentType = "collision"; // Default assumption
      isDegraded = true;
      assumptions.push({
        field: "accidentDetails.incidentType",
        assumedValue: "collision",
        reason: "Incident type not found in any source. Defaulting to 'collision' as most common claim type.",
        strategy: "industry_average",
        confidence: 50,
        stage: "Stage 5",
      });
    }

    const collisionDirection = classifyCollisionDirection(v.accidentType || "unknown");

    // Estimate speed if missing but we have damage indicators
    let estimatedSpeed = v.estimatedSpeedKmh || null;
    if (!estimatedSpeed && v.damagedComponents.length > 0) {
      const hasSevere = v.damagedComponents.some(c => c.severity === "severe" || c.severity === "catastrophic");
      const hasStructural = v.structuralDamage === true;
      const hasAirbag = v.airbagDeployment === true;

      if (hasAirbag || (hasSevere && hasStructural)) {
        estimatedSpeed = 60;
        assumptions.push({
          field: "accidentDetails.estimatedSpeedKmh",
          assumedValue: 60,
          reason: "Speed not provided. Estimated at 60 km/h based on severe damage + airbag deployment / structural damage.",
          strategy: "contextual_inference",
          confidence: 45,
          stage: "Stage 5",
        });
      } else if (hasSevere) {
        estimatedSpeed = 45;
        assumptions.push({
          field: "accidentDetails.estimatedSpeedKmh",
          assumedValue: 45,
          reason: "Speed not provided. Estimated at 45 km/h based on severe component damage.",
          strategy: "contextual_inference",
          confidence: 40,
          stage: "Stage 5",
        });
      } else {
        estimatedSpeed = 30;
        assumptions.push({
          field: "accidentDetails.estimatedSpeedKmh",
          assumedValue: 30,
          reason: "Speed not provided. Estimated at 30 km/h based on minor/moderate damage pattern.",
          strategy: "contextual_inference",
          confidence: 35,
          stage: "Stage 5",
        });
      }
    }

    const accidentDetails: AccidentDetails = {
      date: v.accidentDate || ctx.claim.accidentDate || null,
      location: v.accidentLocation || ctx.claim.accidentLocation || null,
      description: v.accidentDescription || ctx.claim.incidentDescription || null,
      incidentType,
      collisionDirection,
      impactPoint: v.impactPoint || null,
      estimatedSpeedKmh: estimatedSpeed,
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
      lineItems: [],
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
      assumptions,
    };

    const output: Stage5Output = { claimRecord };

    ctx.log("Stage 5", `Assembly complete. Vehicle: ${effectiveMake} ${effectiveModel} (${year || 'unknown year'}), Mass: ${massResult.massKg}kg (${massResult.tier}), Incident: ${incidentType}, Components: ${damage.components.length}, Completeness: ${stage4.completenessScore}%, Assumptions: ${assumptions.length}`);

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
    ctx.log("Stage 5", `Assembly failed: ${String(err)} — producing minimal ClaimRecord`);

    // Self-healing: produce a minimal ClaimRecord from DB fields only
    const minimalRecord: ClaimRecord = {
      claimId: ctx.claimId,
      tenantId: ctx.tenantId,
      vehicle: {
        make: ctx.claim.vehicleMake || "Unknown",
        model: ctx.claim.vehicleModel || "Unknown",
        year: ctx.claim.vehicleYear || null,
        registration: ctx.claim.vehicleRegistration || null,
        vin: null, colour: null, engineNumber: null,
        mileageKm: null, bodyType: "sedan" as any, powertrain: "ice" as any,
        massKg: 1400, massTier: "not_available" as const, valueUsd: null,
      },
      driver: { name: ctx.claim.driverName || null, claimantName: ctx.claim.claimantName || null },
      accidentDetails: {
        date: ctx.claim.accidentDate || null, location: null, description: null,
        incidentType: "collision", collisionDirection: "unknown",
        impactPoint: null, estimatedSpeedKmh: null,
        maxCrushDepthM: null, totalDamageAreaM2: null,
        structuralDamage: false, airbagDeployment: false,
      },
      policeReport: { reportNumber: null, station: null },
      damage: { description: null, components: [], imageUrls: ctx.damagePhotoUrls || [] },
      repairQuote: {
        repairerName: null, repairerCompany: null, assessorName: null,
        quoteTotalCents: null, labourCostCents: null, partsCostCents: null, lineItems: [],
      },
      dataQuality: { completenessScore: 0, missingFields: ["all"], validationIssues: [] },
      marketRegion: "ZW",
      assumptions: [{
        field: "claimRecord",
        assumedValue: "minimal_from_db",
        reason: `Assembly failed: ${String(err)}. Built minimal ClaimRecord from database fields only.`,
        strategy: "default_value" as const,
        confidence: 15,
        stage: "Stage 5",
      }],
    };

    return {
      status: "degraded",
      data: { claimRecord: minimalRecord },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "claimRecord",
        assumedValue: "minimal_from_db",
        reason: `Assembly failed: ${String(err)}. Built minimal ClaimRecord from database fields only.`,
        strategy: "default_value",
        confidence: 15,
        stage: "Stage 5",
      }],
      recoveryActions: [{
        target: "assembly_error_recovery",
        strategy: "default_value",
        success: true,
        description: `Assembly error caught. Built minimal ClaimRecord from database fields.`,
      }],
      degraded: true,
    };
  }
}

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
