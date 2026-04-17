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
  CollisionScenario,
  Assumption,
  RecoveryAction,
} from "./types";

import {
  resolveVehicleMass,
  classifyIncidentType,
  inferVehicleBodyType,
  inferPowertrainType,
} from "../pipeline/types";
import { classifyIncident, detectMultiEventSequence } from "./incidentClassificationEngine";
import { selectScenarioEngine } from "./scenarioEngineSelector";
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

    // Resolve market value from extraction or DB
    const marketValueCents = v.marketValueCents ?? null;
    const marketValueUsd = marketValueCents ? marketValueCents / 100 : null;

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
      marketValueUsd,
    };

    const driver: DriverRecord = {
      name: v.driverName || ctx.claim.driverName || null,
      claimantName: v.claimantName || ctx.claim.claimantName || null,
      licenseNumber: v.driverLicenseNumber || null,
    };

    // ── Incident Classification Engine (multi-source, conflict-aware) ────────
    // Replaces the old single-field classifyIncidentType() lookup.
    // Prevents the Mazda root cause: claim form said "collision", driver said "cow".
    const driverNarrative = v.accidentDescription || ctx.claim.incidentDescription || null;
    const claimFormField = v.incidentType || ctx.claim.incidentType || null;
    const damageDesc = v.damageDescription || null;
    const damageComponentNames = (v.damagedComponents || []).map((c: { name: string }) => c.name);

    // Run incident classification and multi-event detection in parallel
    const [incidentClassification, multiEventSequence] = await Promise.all([
      classifyIncident({
        driver_narrative: driverNarrative,
        claim_form_incident_type: claimFormField,
        damage_description: damageDesc,
        damage_components: damageComponentNames,
      }),
      detectMultiEventSequence(driverNarrative, damageDesc),
    ]);

    let incidentType: CanonicalIncidentType = incidentClassification.canonical_type;
    const incidentSubType: string | null =
      incidentClassification.incident_type !== incidentClassification.canonical_type
        ? incidentClassification.incident_type
        : null;

    if (incidentClassification.incident_type === "unknown") {
      // Final fallback — only if the engine found no evidence at all
      incidentType = "collision";
      incidentClassification.incident_type = "collision"; // Update classification so Decision Readiness Engine sees the resolved type
      incidentClassification.canonical_type = "collision";
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

    // Speed: use extracted value only. Never assume/guess speed — a fabricated speed
    // propagates errors through physics, cost modelling, and fraud scoring.
    // If not in the document, leave as null and let downstream stages handle the gap.
    const estimatedSpeed = v.estimatedSpeedKmh || null;

    // ── Collision scenario detection ────────────────────────────────────────────
    // Determines the granular scenario (rear_end_struck, sideswipe, hit_and_run, etc.)
    // from the narrative + collisionDirection. Used by Stage 7 physics routing,
    // Evidence Registry, and the forensic validator.
    const scenarioFlags = detectCollisionScenario({
      description: v.accidentDescription || ctx.claim.incidentDescription || null,
      incidentType,
      collisionDirection,
      thirdPartyVehicle: v.thirdPartyVehicle || null,
      thirdPartyName: v.thirdPartyName || null,
      policeReportNumber: v.policeReportNumber || null,
    });
    ctx.log("Stage 5", `Collision scenario: ${scenarioFlags.collisionScenario} | struckParty=${scenarioFlags.isStruckParty} | hitAndRun=${scenarioFlags.isHitAndRun} | parkingLot=${scenarioFlags.isParkingLotDamage} | 3rdPartyRequired=${scenarioFlags.thirdPartyClaimRequired}`);

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
      // Only preserve animalType when the incident is actually an animal strike.
      // For non-animal incidents, the LLM sometimes picks up OCR artifacts from
      // phrases like "HIT FROM THE BACK" and misreads them as animal names.
      // Clear animalType if incidentType is not animal_strike to prevent false positives.
      animalType: (incidentType === 'animal_strike' && v.animalType) ? v.animalType : null,
      weatherConditions: v.weatherConditions || null,
      visibilityConditions: v.visibilityConditions || null,
      roadSurface: v.roadSurface || null,
      time: v.incidentTime || null,
      narrativeAnalysis: null, // Populated by incidentNarrativeEngine in orchestrator after Stage 7
      // Scenario-awareness fields — set by detectCollisionScenario above
      collisionScenario: scenarioFlags.collisionScenario,
      isStruckParty: scenarioFlags.isStruckParty,
      thirdPartyClaimRequired: scenarioFlags.thirdPartyClaimRequired,
      isHitAndRun: scenarioFlags.isHitAndRun,
      isParkingLotDamage: scenarioFlags.isParkingLotDamage,
      scenarioConfidence: scenarioFlags.scenarioConfidence,
      thirdPartyConfidence: scenarioFlags.thirdPartyConfidence,
      // scenarioDamageMismatch is set by Stage 7 after damage zones are available
      // Multi-event sequence detected in parallel with incident classification
      multiEventSequence: multiEventSequence ?? null,
    };

    const policeReport: PoliceReportRecord = {
      reportNumber: v.policeReportNumber || null,
      station: v.policeStation || null,
      officerName: v.policeOfficerName || null,
      chargeNumber: v.policeChargeNumber || null,
      fineAmountCents: v.policeFineAmountCents ?? null,
      reportDate: v.policeReportDate || null,
      chargedParty: v.policeChargedParty || null,
      investigationStatus: v.policeInvestigationStatus || null,
      officerFindings: v.policeOfficerFindings || null,
      thirdPartyAccountSummary: v.thirdPartyAccountSummary || null,
    };

    const damage: DamageRecord = {
      description: v.damageDescription || null,
      components: v.damagedComponents,
      imageUrls: v.uploadedImageUrls.length > 0
        ? v.uploadedImageUrls
        : (ctx.damagePhotoUrls || []),
    };

    // Build repair line items from extracted damaged components.
    // The LLM extraction provides component names, locations, and repair actions
    // but not pricing — pricing comes from the cost model in Stage 9.
    // Having line items populated (even without pricing) allows the forensic
    // validator to see that cost data exists and prevents INSUFFICIENT_COST_DATA.
    const repairLineItems: import('./types').RepairLineItem[] = (v.damagedComponents || []).map((c: any) => ({
      partName: c.name || 'Unknown',
      partNumber: null,
      quantity: 1,
      unitPriceCents: 0,
      totalPriceCents: 0,
      labourHours: 0,
      labourRateCents: 0,
      isOem: false,
      isAftermarket: false,
      isUsed: false,
      repairAction: c.repairAction || 'repair',
    }));

    const repairQuote: RepairQuoteRecord = {
      repairerName: v.panelBeater || null,
      repairerCompany: v.repairerCompany || null,
      assessorName: v.assessorName || null,
      // Prefer agreed/negotiated cost over original quote total.
      // The agreed cost is the assessor-negotiated amount (e.g. USD 462.33 vs USD 591.33).
      quoteTotalCents: v.quoteTotalCents || null,
      agreedCostCents: v.agreedCostCents || null,
      labourCostCents: v.labourCostCents || null,
      partsCostCents: v.partsCostCents || null,
      lineItems: repairLineItems,
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
      insuranceContext: {
        insurerName: v.insurerName || null,
        policyNumber: v.policyNumber || ctx.claim.policyNumber || null,
        productType: v.productType || (ctx.claim as any).productType || null,
        claimReference: v.claimReference || ctx.claim.claimNumber || null,
        excessAmountUsd: v.excessAmountCents ? v.excessAmountCents / 100 : null,
        bettermentUsd: v.bettermentCents ? v.bettermentCents / 100 : null,
      },
      dataQuality: {
        completenessScore: stage4.completenessScore,
        missingFields: stage4.missingFields,
        validationIssues: stage4.issues,
      },
      marketRegion: (ctx.claim as any).country || "ZW",
      assumptions,
    };

    // ── Step 5b: Scenario Engine Selection ─────────────────────────────────
    let scenarioSelection: Stage5Output["scenarioSelection"] = null;
    try {
      const incidentClassification = accidentDetails.incidentClassification;
      const scenarioInput = {
        incident_type: incidentType as string,
        vehicle_type: (vehicle.bodyType as string) || undefined,
        context_clues: (accidentDetails.location
          ? [accidentDetails.location.toLowerCase().includes("highway") ? "highway"
            : accidentDetails.location.toLowerCase().includes("rural") ? "rural"
            : "urban"]
          : []) as import("./scenarioEngineSelector").ContextClue[],
        driver_narrative: accidentDetails.description || undefined,
        damage_description: damage.description || undefined,
      };
      const sel = selectScenarioEngine(scenarioInput);
      scenarioSelection = {
        selected_engine: sel.selected_engine,
        detected_sub_type: sel.detected_sub_type,
        confidence: sel.confidence,
        reasoning: sel.reasoning,
        is_minor_claim: sel.is_minor_claim,
        requires_specialist: sel.requires_specialist,
        engine_parameters: sel.engine_parameters as unknown as Record<string, unknown>,
      };
      ctx.log("Stage 5", `Scenario engine selected: ${sel.selected_engine} (sub-type: ${sel.detected_sub_type}, confidence: ${sel.confidence})`);
    } catch (selErr) {
      ctx.log("Stage 5", `Scenario engine selection failed: ${String(selErr)} — proceeding without selection`);
    }

    const output: Stage5Output = { claimRecord, scenarioSelection };

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
        massKg: 1400, massTier: "not_available" as const, valueUsd: null, marketValueUsd: null,
      },
      driver: { name: ctx.claim.driverName || null, claimantName: ctx.claim.claimantName || null, licenseNumber: null },
      accidentDetails: {
        date: ctx.claim.accidentDate || null, time: null, location: null, description: null,
        incidentType: "collision", incidentSubType: null, incidentClassification: null,
        collisionDirection: "unknown",
        impactPoint: null, estimatedSpeedKmh: null,
        maxCrushDepthM: null, totalDamageAreaM2: null,
        structuralDamage: false, airbagDeployment: false,
        animalType: null, weatherConditions: null, visibilityConditions: null, roadSurface: null,
        narrativeAnalysis: null,
        collisionScenario: "unknown" as const, isStruckParty: false,
        thirdPartyClaimRequired: false, isHitAndRun: false, isParkingLotDamage: false,
      },
      policeReport: { reportNumber: null, station: null },
      damage: { description: null, components: [], imageUrls: ctx.damagePhotoUrls || [] },
      repairQuote: {
        repairerName: null, repairerCompany: null, assessorName: null,
        quoteTotalCents: null, agreedCostCents: null, labourCostCents: null, partsCostCents: null, lineItems: [],
      },
      insuranceContext: {
        insurerName: null,
        policyNumber: ctx.claim.policyNumber || null,
        productType: (ctx.claim as any).productType || null,
        claimReference: ctx.claim.claimNumber || null,
        excessAmountUsd: null,
        bettermentUsd: null,
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
      data: { claimRecord: minimalRecord, scenarioSelection: null },
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

/**
 * Detect the granular collision scenario from narrative text, incidentType, and collisionDirection.
 * Returns a CollisionScenario value plus derived boolean flags used throughout the pipeline.
 *
 * Detection priority:
 * 1. Hit-and-run keywords (highest priority — overrides direction-based logic)
 * 2. Parking lot / stationary damage keywords
 * 3. Single-vehicle / rollover (no other party)
 * 4. Sideswipe (lateral contact)
 * 5. Rear-end (struck vs striking determined from narrative)
 * 6. Head-on
 * 7. Fallback to collisionDirection + incidentType
 */
function detectCollisionScenario(params: {
  description: string | null;
  incidentType: CanonicalIncidentType;
  collisionDirection: CollisionDirection;
  thirdPartyVehicle: string | null;
  thirdPartyName: string | null;
  policeReportNumber: string | null;
}): {
  collisionScenario: CollisionScenario;
  isStruckParty: boolean;
  thirdPartyClaimRequired: boolean;
  isHitAndRun: boolean;
  isParkingLotDamage: boolean;
  scenarioConfidence: number; // 0.0–1.0 — how many independent signals corroborate the scenario
  thirdPartyConfidence: number; // 0.0–1.0 — how much third-party evidence is available
} {
  const d = (params.description || "").toLowerCase();
  const dir = params.collisionDirection;
  const hasKnownThirdParty = !!(params.thirdPartyVehicle || params.thirdPartyName);

  // ── 1. Hit-and-run detection ────────────────────────────────────────────────
  const hitAndRunKeywords = [
    "hit and run", "hit-and-run", "fled", "drove off", "drove away", "sped off",
    "sped away", "drove off without", "no details", "untraced", "unknown vehicle",
    "did not stop", "didn't stop", "failed to stop", "left the scene",
    "left scene", "ran away", "ran off", "no registration", "no reg",
    "no contact details", "could not get details", "unable to get details",
  ];
  const isHitAndRun = hitAndRunKeywords.some(kw => d.includes(kw));

  // ── 2. Parking lot / stationary damage ──────────────────────────────────────
  const parkingKeywords = [
    "parked", "parking", "parking lot", "parking bay", "car park",
    "stationary", "unattended", "was parked", "while parked",
    "in the parking", "shopping centre", "shopping center", "mall",
    "found damage", "discovered damage", "came back to", "returned to",
  ];
  const isParkingLotDamage = parkingKeywords.some(kw => d.includes(kw));

  // ── 3. Single-vehicle / rollover ─────────────────────────────────────────────
  const singleVehicleKeywords = [
    "lost control", "swerved", "rolled", "overturned", "flipped",
    "hit a wall", "hit a pole", "hit a tree", "hit a fence",
    "hit a pothole", "hit the curb", "hit the kerb", "ran off the road",
    "went off the road", "into a ditch", "into the ditch", "no other vehicle",
    "no third party", "single vehicle",
  ];
  const isSingleVehicle = singleVehicleKeywords.some(kw => d.includes(kw))
    || dir === "rollover"
    || params.incidentType === "animal_strike";

  // ── 4. Sideswipe ─────────────────────────────────────────────────────────────
  const sideswipeKeywords = [
    "sideswiped", "sideswipe", "side swipe", "scraped", "scratched",
    "glancing blow", "glanced off", "clipped", "brushed",
    "lane change", "changed lanes", "merging",
  ];
  const isSideswipe = sideswipeKeywords.some(kw => d.includes(kw))
    || (dir === "side_driver" || dir === "side_passenger");

  // ── 5. Rear-end: struck vs striking ─────────────────────────────────────────
  const rearEndKeywords = [
    "rear", "rear-end", "rear end", "from behind", "hit from behind",
    "struck from behind", "rammed from behind", "bumped from behind",
    "back of my vehicle", "back of the vehicle", "boot", "tailgate",
  ];
  const isRearEnd = rearEndKeywords.some(kw => d.includes(kw)) || dir === "rear";

  // Struck-party indicators: passive voice, "was hit", "was struck", "was rammed"
  const struckPartyKeywords = [
    "was hit", "was struck", "was rammed", "was bumped", "was rear-ended",
    "was rear ended", "hit from behind", "struck from behind", "rammed from behind",
    "bumped from behind", "another vehicle hit", "another car hit",
    "third party hit", "third party struck", "other vehicle hit",
    "other car hit", "came from behind", "came into the back",
    "drove into the back", "drove into my", "collided into the back",
  ];
  const isStruckByNarrative = struckPartyKeywords.some(kw => d.includes(kw));

  // ── 6. Head-on ───────────────────────────────────────────────────────────────
  const headOnKeywords = [
    "head-on", "head on", "oncoming", "oncoming vehicle", "oncoming car",
    "wrong side", "wrong lane", "overtaking", "head to head",
  ];
  const isHeadOn = headOnKeywords.some(kw => d.includes(kw)) || dir === "frontal";

  // ── Resolve scenario ─────────────────────────────────────────────────────────
  let collisionScenario: CollisionScenario;
  let isStruckParty = false;
  let thirdPartyClaimRequired = false;

  if (isHitAndRun) {
    collisionScenario = "hit_and_run";
    isStruckParty = true; // By definition — the other party caused the damage
    thirdPartyClaimRequired = false; // No third-party details to corroborate
  } else if (isParkingLotDamage) {
    collisionScenario = "parking_lot";
    isStruckParty = true;
    thirdPartyClaimRequired = hasKnownThirdParty; // Only if third party is identified
  } else if (isSingleVehicle) {
    collisionScenario = params.incidentType === "animal_strike" ? "single_vehicle" : "single_vehicle";
    isStruckParty = false;
    thirdPartyClaimRequired = false;
  } else if (isSideswipe && !isRearEnd) {
    collisionScenario = "sideswipe";
    isStruckParty = isStruckByNarrative;
    thirdPartyClaimRequired = hasKnownThirdParty || isStruckByNarrative;
  } else if (isRearEnd) {
    // Rear-end: determine if claimant was struck or striking
    if (isStruckByNarrative || dir === "rear") {
      collisionScenario = "rear_end_struck";
      isStruckParty = true;
      thirdPartyClaimRequired = true; // Always request third-party claim for rear-end struck
    } else {
      collisionScenario = "rear_end_striking";
      isStruckParty = false;
      thirdPartyClaimRequired = hasKnownThirdParty;
    }
  } else if (isHeadOn) {
    collisionScenario = "head_on";
    isStruckParty = isStruckByNarrative;
    thirdPartyClaimRequired = true; // Head-on always involves another party
  } else if (dir === "rollover") {
    collisionScenario = "rollover";
    isStruckParty = false;
    thirdPartyClaimRequired = false;
  } else {
    collisionScenario = "unknown";
    isStruckParty = isStruckByNarrative;
    thirdPartyClaimRequired = hasKnownThirdParty;
  }

  // ── Confidence scoring ───────────────────────────────────────────────────────
  // Count how many independent signal sources corroborate the resolved scenario.
  // Sources: (1) narrative keywords, (2) collisionDirection field,
  //          (3) incidentType field, (4) third-party details present.
  // Each source that agrees adds 0.25; minimum is 0.25 (narrative always contributes).
  let corroborationCount = 1; // Narrative keywords always contribute (we resolved from them)

  const directionCorroborates = (() => {
    if (collisionScenario === 'rear_end_struck' || collisionScenario === 'rear_end_striking') return dir === 'rear';
    if (collisionScenario === 'head_on') return dir === 'frontal';
    if (collisionScenario === 'sideswipe') return dir === 'side_driver' || dir === 'side_passenger';
    if (collisionScenario === 'rollover') return dir === 'rollover';
    if (collisionScenario === 'hit_and_run') return true; // direction is irrelevant for hit-and-run
    if (collisionScenario === 'parking_lot') return true; // direction is irrelevant for parking lot
    return false;
  })();
  if (directionCorroborates) corroborationCount++;

  const incidentTypeCorroborates = (() => {
    if (params.incidentType === 'animal_strike') return collisionScenario === 'single_vehicle';
    if (params.incidentType === 'vehicle_collision') return collisionScenario !== 'single_vehicle';
    return false;
  })();
  if (incidentTypeCorroborates) corroborationCount++;

  // Third-party details corroborate scenarios that require another party
  const thirdPartyCorroborates = hasKnownThirdParty &&
    ['rear_end_struck', 'rear_end_striking', 'sideswipe', 'head_on'].includes(collisionScenario);
  if (thirdPartyCorroborates) corroborationCount++;

  const scenarioConfidence = Math.min(1.0, corroborationCount * 0.25);

  // ── Third-party evidence confidence ────────────────────────────────────────────────────────────
  // Measures how much corroborating third-party evidence exists.
  // Three binary signals, each contributing 0.33:
  //   (1) Third-party name or vehicle present in the claim
  //   (2) Police report present (establishes identity and charge status)
  //   (3) Narrative explicitly names or describes the other party
  // Score < 0.4 → suppress third-party corroboration request (nothing to corroborate)
  // Score ≥ 0.4 → request third-party insurer claim reference before settlement
  const hasThirdPartyName = !!(params.thirdPartyName && params.thirdPartyName.trim().length > 2);
  const hasThirdPartyVehicle = !!(params.thirdPartyVehicle && params.thirdPartyVehicle.trim().length > 2);
  const narrativeNamesOtherParty = [
    'third party', 'other vehicle', 'other car', 'other driver', 'another vehicle',
    'another car', 'another driver', 'the driver', 'the vehicle',
  ].some(kw => d.includes(kw));
  const hasPoliceReport = !!(params.policeReportNumber && params.policeReportNumber.trim().length > 2);
  const thirdPartySignals = [
    hasThirdPartyName || hasThirdPartyVehicle,
    hasPoliceReport,
    narrativeNamesOtherParty,
  ].filter(Boolean).length;
  // 3 signals × 0.33 each = max 1.0
  const thirdPartyConfidence = Math.min(1.0, thirdPartySignals * 0.33);

  return { collisionScenario, isStruckParty, thirdPartyClaimRequired, isHitAndRun, isParkingLotDamage, scenarioConfidence, thirdPartyConfidence };
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
1. incidentType: one of "collision" | "animal_strike" | "theft" | "vandalism" | "flood" | "fire" | "unknown"
   - "animal_strike" covers ANY impact with an animal: cow, cattle, bull, goat, sheep, horse, donkey, pig, dog, kudu, nyala, eland, bushbuck, wildebeest, gnu, springbok, gemsbok, oryx, steenbok, duiker, warthog, baboon, zebra, buffalo, elephant, giraffe, rhino, hippo, ostrich, guinea fowl, hadeda, mongoose, porcupine, vervet monkey, dassie, rock rabbit, hyrax, bushpig, waterbuck, reedbuck, caracal, jackal, hyena, cheetah, leopard, lion, deer, etc. USE THIS when the description mentions hitting, striking, or colliding with any animal.
   - "collision" covers vehicle vs vehicle, vehicle vs object (tree, pole, wall, barrier, ditch, pothole, corrugated road, gravel road, sand drift, wash-away, donga, speed hump), pedestrian, cyclist, single-vehicle rollover. Do NOT use for animal impacts.
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
   - "rollover": vehicle rolled over or overturned (ONLY use when the vehicle physically rolled — NOT for swerving to avoid an animal)
   - "multi_impact": multiple distinct impact zones
   - "unknown": genuinely cannot determine from the description
   CRITICAL RULE: When a driver swerves to AVOID an animal and then hits a tree/wall/hill/embankment, the incidentType is STILL "animal_strike" and collisionDirection is "frontal" (the animal caused the evasive action; the frontal impact with the secondary object is the primary damage event). Do NOT classify as "rollover" just because the vehicle lost control after avoiding an animal.
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
    const validIncidentTypes: CanonicalIncidentType[] = ["collision", "animal_strike", "theft", "vandalism", "flood", "fire", "unknown"];
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
