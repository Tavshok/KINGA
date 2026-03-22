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
import { classifyIncident } from "./incidentClassificationEngine";
import { markFallback } from "./engineFallback";
import { invokeLLM } from "../_core/llm";

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

    // ── Incident Classification Engine (multi-source, conflict-aware) ────────
    // Replaces the old single-field classifyIncidentType() lookup.
    // Prevents the Mazda root cause: claim form said "collision", driver said "cow".
    const driverNarrative = v.accidentDescription || ctx.claim.incidentDescription || null;
    const claimFormField = v.incidentType || ctx.claim.incidentType || null;
    const damageDesc = v.damageDescription || null;
    const damageComponentNames = (v.damagedComponents || []).map((c: { name: string }) => c.name);

    const incidentClassification = classifyIncident({
      driver_narrative: driverNarrative,
      claim_form_incident_type: claimFormField,
      damage_description: damageDesc,
      damage_components: damageComponentNames,
    });

    let incidentType: CanonicalIncidentType = incidentClassification.canonical_type;
    const incidentSubType: string | null =
      incidentClassification.incident_type !== incidentClassification.canonical_type
        ? incidentClassification.incident_type
        : null;

    if (incidentClassification.incident_type === "unknown") {
      // Final fallback — only if the engine found no evidence at all
      incidentType = "collision";
      isDegraded = true;
      assumptions.push({
        field: "accidentDetails.incidentType",
        assumedValue: "collision",
        reason: "Incident type could not be determined from any evidence source. Defaulting to 'collision' as last resort.",
        strategy: "industry_average",
        confidence: 30,
        stage: "Stage 5",
      });
    } else if (incidentClassification.confidence < 60) {
      assumptions.push({
        field: "accidentDetails.incidentType",
        assumedValue: incidentClassification.incident_type,
        reason: `Incident type classified as "${incidentClassification.incident_type}" with low confidence (${incidentClassification.confidence}%). ${incidentClassification.reasoning}`,
        strategy: "contextual_inference",
        confidence: incidentClassification.confidence,
        stage: "Stage 5",
      });
    }

    if (incidentClassification.conflict_detected) {
      assumptions.push({
        field: "accidentDetails.incidentType",
        assumedValue: incidentClassification.incident_type,
        reason: `Conflict detected between evidence sources. ${incidentClassification.reasoning}`,
        strategy: "contextual_inference",
        confidence: incidentClassification.confidence,
        stage: "Stage 5",
      });
    }
    // Classify collision direction: first try the structured accidentType field,
    // then fall back to NLP inference from the incident description.
    let collisionDirection = classifyCollisionDirection(v.accidentType || "unknown");
    if (collisionDirection === "unknown") {
      const descriptionText = v.accidentDescription || ctx.claim.incidentDescription || "";
      const inferred = inferCollisionDirectionFromDescription(descriptionText);
      if (inferred !== "unknown") {
        collisionDirection = inferred;
        assumptions.push({
          field: "accidentDetails.collisionDirection",
          assumedValue: inferred,
          reason: `Collision direction not explicitly stated. Inferred "${inferred}" from incident description: "${descriptionText.substring(0, 100)}".`,
          strategy: "contextual_inference",
          confidence: 55,
          stage: "Stage 5",
        });
      }
    }

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
      incidentSubType,
      incidentClassification: {
        incident_type: incidentClassification.incident_type,
        confidence: incidentClassification.confidence,
        sources_used: incidentClassification.sources_used,
        conflict_detected: incidentClassification.conflict_detected,
        reasoning: incidentClassification.reasoning,
      },
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
    // Stage 26: apply defensive contract — mark all fallback fields on the minimal record
    const minimalRecord: ClaimRecord & { _fallback?: object } = {
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
        incidentType: "collision", incidentSubType: null, incidentClassification: null,
        collisionDirection: "unknown",
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
      _fallback: markFallback({}, `engine_failure: ${String(err)}`),
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
  // Animal strikes are always frontal — the vehicle hits the animal head-on
  if (r === "animal_strike" || r === "animal_damage" || r === "animal") return "frontal";
  return "unknown";
}

/**
 * LLM-based semantic incident inference.
 * Reads the raw accident description and infers incidentType, collisionDirection,
 * and whether physics should run — from MEANING, not keyword matching.
 * Handles any scenario: animal strikes, pedestrians, off-road, single-vehicle,
 * multi-vehicle, theft, vandalism, fire, flood, etc.
 */
async function inferIncidentFromDescriptionLLM(description: string): Promise<{
  incidentType: CanonicalIncidentType;
  collisionDirection: CollisionDirection;
  isCollision: boolean;
  reasoning: string;
  confidence: number;
}> {
  if (!description || description.trim().length < 5) {
    return { incidentType: "collision", collisionDirection: "unknown", isCollision: true, reasoning: "No description provided; defaulting to collision.", confidence: 30 };
  }
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an insurance claim incident classifier. Given an accident description, determine:
1. incidentType: one of "collision" | "theft" | "vandalism" | "flood" | "fire" | "unknown"
   - "collision" covers ANY physical impact: vehicle vs vehicle, vehicle vs animal (cow, goat, kudu, nyala, eland, bushbuck, wildebeest, gnu, springbok, gemsbok, oryx, steenbok, duiker, warthog, baboon, zebra, buffalo, elephant, giraffe, rhino, hippo, ostrich, guinea fowl, hadeda, mongoose, porcupine, vervet monkey, dassie, rock rabbit, hyrax, bushpig, waterbuck, reedbuck, caracal, jackal, hyena, cheetah, leopard, lion, deer, horse, donkey, sheep, cattle, pedestrian, cyclist, etc.), vehicle vs object (tree, pole, wall, barrier, ditch, pothole, corrugated road, gravel road, sand drift, wash-away, donga, speed hump), single-vehicle rollover, etc.
   - "theft" covers stolen vehicle, hijacking, attempted theft
   - "vandalism" covers deliberate damage, break-in, malicious damage
   - "flood" covers water damage, hail, storm
   - "fire" covers fire, burn
2. collisionDirection: one of "frontal" | "rear" | "side_driver" | "side_passenger" | "rollover" | "multi_impact" | "unknown"
   - Infer from context: what part of the vehicle was struck? What direction was the vehicle moving?
   - "frontal": front of vehicle struck something (head-on, ran into object/animal, bull bar impact)
   - "rear": rear of vehicle struck or was struck from behind
   - "side_driver": left side of vehicle (driver's side in right-hand-drive countries)
   - "side_passenger": right side of vehicle (passenger's side in right-hand-drive countries)
   - "rollover": vehicle rolled over or overturned
   - "multi_impact": multiple distinct impact zones
   - "unknown": genuinely cannot determine from the description
3. isCollision: true if physics engine should run (any impact event), false for theft/vandalism/fire/flood
4. reasoning: one sentence explaining your classification
5. confidence: integer 0-100

Return ONLY valid JSON matching the schema. No markdown, no explanation outside JSON.`,
        },
        {
          role: "user",
          content: `Classify this accident description:\n\n"${description.substring(0, 500)}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "incident_inference",
          strict: true,
          schema: {
            type: "object",
            properties: {
              incidentType: { type: "string" },
              collisionDirection: { type: "string" },
              isCollision: { type: "boolean" },
              reasoning: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["incidentType", "collisionDirection", "isCollision", "reasoning", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });
    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : (rawContent != null ? JSON.stringify(rawContent) : "{}");
    const parsed = JSON.parse(content);
    // Validate and normalise the LLM output
    const validIncidentTypes: CanonicalIncidentType[] = ["collision", "theft", "vandalism", "flood", "fire", "unknown"];
    const validDirections: CollisionDirection[] = ["frontal", "rear", "side_driver", "side_passenger", "rollover", "multi_impact", "unknown"];
    return {
      incidentType: validIncidentTypes.includes(parsed.incidentType) ? parsed.incidentType : "collision",
      collisionDirection: validDirections.includes(parsed.collisionDirection) ? parsed.collisionDirection : "unknown",
      isCollision: typeof parsed.isCollision === "boolean" ? parsed.isCollision : true,
      reasoning: parsed.reasoning || "LLM inference",
      confidence: typeof parsed.confidence === "number" ? Math.min(100, Math.max(0, parsed.confidence)) : 70,
    };
  } catch (err) {
    // LLM call failed — fall back to keyword heuristics
    return inferIncidentFromDescriptionKeywords(description);
  }
}

/**
 * Keyword-based incident inference.
 * OFFLINE FALLBACK ONLY — used when the LLM call fails.
 * Not the primary path; do not add keywords here to fix classification issues.
 */
function inferIncidentFromDescriptionKeywords(description: string): {
  incidentType: CanonicalIncidentType;
  collisionDirection: CollisionDirection;
  isCollision: boolean;
  reasoning: string;
  confidence: number;
} {
  const d = (description || "").toLowerCase();
  // Non-collision checks first
  if (d.includes("stolen") || d.includes("theft") || d.includes("hijack") || d.includes("carjack")) {
    return { incidentType: "theft", collisionDirection: "unknown", isCollision: false, reasoning: "Keyword match: theft/hijacking", confidence: 70 };
  }
  if (d.includes("fire") || d.includes("burnt") || d.includes("burned")) {
    return { incidentType: "fire", collisionDirection: "unknown", isCollision: false, reasoning: "Keyword match: fire", confidence: 70 };
  }
  if (d.includes("flood") || d.includes("hail") || d.includes("submerged")) {
    return { incidentType: "flood", collisionDirection: "unknown", isCollision: false, reasoning: "Keyword match: flood/hail", confidence: 70 };
  }
  if (d.includes("vandal") || d.includes("broke into") || d.includes("break-in")) {
    return { incidentType: "vandalism", collisionDirection: "unknown", isCollision: false, reasoning: "Keyword match: vandalism/break-in", confidence: 70 };
  }
  // Direction heuristics for collision
  let dir: CollisionDirection = "unknown";
  if (d.includes("roll") || d.includes("overturn") || d.includes("flip")) dir = "rollover";
  else if (d.includes("rear") || d.includes("behind") || d.includes("from behind")) dir = "rear";
  else if (d.includes("driver side") || d.includes("left side") || d.includes("driver's side")) dir = "side_driver";
  else if (d.includes("passenger side") || d.includes("right side") || d.includes("passenger's side")) dir = "side_passenger";
  else if (d.includes("front") || d.includes("bonnet") || d.includes("bull bar") || d.includes("windscreen") || d.includes("grille")) dir = "frontal";
  return { incidentType: "collision", collisionDirection: dir, isCollision: true, reasoning: "Keyword fallback: collision assumed", confidence: 45 };
}

/**
 * @deprecated Use inferIncidentFromDescriptionLLM instead.
 * Kept for backward compatibility with unit tests.
 */
function inferCollisionDirectionFromDescription(description: string): CollisionDirection {
  return inferIncidentFromDescriptionKeywords(description).collisionDirection;
}
