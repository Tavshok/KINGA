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
  ThirdPartyRecord,
  VehicleValuation,
  AccidentDetails,
  PoliceReportRecord,
  DamageRecord,
  RepairQuoteRecord,
  CanonicalIncidentType,
  CollisionDirection,
  CollisionScenario,
  ImpactCausation,
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
import { invokeLLM, withRetry } from "../_core/llm";
import { getDefaultCurrencyForCountry, getDefaultCurrencySymbolForCountry, COUNTRY_CURRENCY_MAP } from '../../shared/countryCurrency';
import { WRITE_OFF_RECOMMENDATION_THRESHOLD, WRITE_OFF_WARNING_THRESHOLD } from "./pipelineCostConstants";
// ── Utility: wrap async fn with a hard timeout (mirrors Stage 6 pattern) ─────
// R-B-01 / R-B-02 fix: LLM calls in Stage 5 must be bounded so a slow or hung
// LLM response cannot freeze the pipeline indefinitely.
async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}


/**
 * Combine validated extracted data into one structured ClaimRecord.
 * This record is the single input passed to all analysis engines (Stages 6–9).
 * NEVER halts — produces a minimal ClaimRecord even if most fields are missing.
 *
 * ── NAVIGATIONAL MAP (runAssemblyStage, lines 60–719) ───────────────────────
 *
 *  Lines  60–182  Vehicle property resolution
 *                  make / model / year → resolveVehicleMass → bodyType → powertrain
 *                  All failures produce an Assumption record and set isDegraded.
 *
 *  Lines 183–270  Incident Classification Engine (multi-source, conflict-aware)
 *                  Calls classifyIncident() + detectMultiEventSequence().
 *                  Prevents the "Mazda root cause" (claim form vs driver narrative conflict).
 *
 *  Lines 271–408  Collision scenario detection
 *                  Calls detectCollisionScenario() to derive CollisionScenario + boolean flags.
 *                  Builds damage record (components, description, photos).
 *
 *  Lines 409–428  Step 5b: Third-Party Record Assembly
 *                  Extracts third-party vehicle, driver, and insurer from validated fields.
 *
 *  Lines 429–586  Step 5c: Vehicle Market Valuation
 *                  LLM-based valuation with withTimeout() guard (R-B-01/R-B-02 fix).
 *                  Falls back to DB marketValueCents if LLM fails or times out.
 *
 *  Lines 587–619  Step 5d: Scenario Engine Selection
 *                  Calls selectScenarioEngine() to choose the appropriate fraud/physics engine.
 *                  Assembles the final Stage5Output and returns success/degraded result.
 *
 *  Lines 630–718  Catch block: Self-healing minimal ClaimRecord
 *                  If assembly fails entirely, builds a minimal ClaimRecord from DB fields only.
 *                  Stage 26 defensive contract applied here (markFallback).
 *
 * ── WHY THIS FUNCTION IS NOT SPLIT ──────────────────────────────────────────
 *
 *  runAssemblyStage is intentionally a single function (~660 lines of logic).
 *  The five steps share mutable state (assumptions[], recoveryActions[], isDegraded,
 *  vehicle, driver, damage, incidentType) that flows through all steps sequentially.
 *  The R-B-01/R-B-02 timeout fix and the R-B-03b night-photo rescue path both depend
 *  on this shared state flowing correctly. Splitting into sub-functions would require
 *  passing 10+ variables across function boundaries and risks reintroducing the bugs
 *  those fixes resolved.
 *
 *  If a future change requires touching this function, treat each section-header
 *  block (lines shown above) as a logical unit and re-verify against the Stage 5
 *  test coverage before committing.
 */
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
      // CALIBRATION: 1400 kg is the sedan-class industry average used as a fallback.
      // This is NOT data-derived from the Zimbabwe/Southern Africa fleet.
      // Do not change without benchmarking against the actual insured vehicle fleet.
      const DEFAULT_VEHICLE_MASS_KG = 1400;
      massResult = { massKg: DEFAULT_VEHICLE_MASS_KG, tier: "default" };
      assumptions.push({
        field: "vehicle.massKg",
        assumedValue: DEFAULT_VEHICLE_MASS_KG,
        reason: `Vehicle mass resolution failed. Using ${DEFAULT_VEHICLE_MASS_KG}kg (sedan class average).`,
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
      mileageKm: v.vehicleMileage != null ? (typeof v.vehicleMileage === 'number' ? v.vehicleMileage : parseInt(String(v.vehicleMileage), 10) || null) : (ctx.claim.vehicleMileage ? parseInt(ctx.claim.vehicleMileage, 10) || null : null),
      bodyType: bodyType as any,
      powertrain: powertrain as any,
      massKg: massResult.massKg,
      massTier: massResult.tier as "explicit" | "inferred_model" | "inferred_class" | "not_available",
      // vehicleMarketValue is stored in cents on the claims table (vehicleValue does not exist)
      valueUsd: ctx.claim.vehicleMarketValue ? ctx.claim.vehicleMarketValue / 100 : null,
      marketValueUsd,
    };

    const driver: DriverRecord = {
      // driverName/claimantName are not columns on the claims table — use extracted values only
      name: v.driverName || null,
      claimantName: v.claimantName || null,
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

    // CALIBRATION: 60% confidence threshold for low-confidence incident classification
    // is engineering-judgment. Do not change without benchmarking.
    /** Minimum confidence below which incident classification is flagged as low-confidence */
    const INCIDENT_CONF_LOW_THRESHOLD = 60;
    if (incidentClassification.incident_type === "unknown") {
      // Final fallback — only if the engine found no evidence at all
      incidentType = "collision";
      incidentClassification.incident_type = "vehicle_collision" as any; // Update classification so Decision Readiness Engine sees the resolved type
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
    } else if (incidentClassification.confidence < INCIDENT_CONF_LOW_THRESHOLD) {
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
    ctx.log("Stage 5", `Collision scenario: ${scenarioFlags.collisionScenario} | struckParty=${scenarioFlags.isStruckParty} | hitAndRun=${scenarioFlags.isHitAndRun} | parkingLot=${scenarioFlags.isParkingLotDamage} | 3rdPartyRequired=${scenarioFlags.thirdPartyClaimRequired} | causation=${scenarioFlags.impactCausation ?? 'N/A'} | speedCeiling=${scenarioFlags.causationSpeedCeilingKmh ?? 'N/A'}km/h | reversingContradiction=${scenarioFlags.reversingNarrativeContradiction ?? false}`);

    const accidentDetails: AccidentDetails = {
      date: v.accidentDate || ctx.claim.incidentDate || null,
      location: v.accidentLocation || ctx.claim.incidentLocation || null,
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
      // Preserve null (= not mentioned in documents) vs false (= explicitly not deployed).
      // The old ?? false coercion was silently disabling M4 for every claim where
      // airbag/seatbelt was not mentioned. Stage 7 already handles null correctly
      // via the === true guard (airbagDeployed = claimRecord.accidentDetails.airbagDeployment === true).
      airbagDeployment: v.airbagDeployment ?? null,
      seatbeltPretensioner: v.seatbeltPretensioner ?? null,
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
      // Impact causation classification (rear-impact scenarios only)
      impactCausation: scenarioFlags.impactCausation ?? null,
      reversingNarrativeContradiction: scenarioFlags.reversingNarrativeContradiction ?? null,
      causationSpeedCeilingKmh: scenarioFlags.causationSpeedCeilingKmh ?? null,
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
        // P4 fix: DB claimNumber is the canonical reference; document-extracted v.claimReference
        // (e.g. COR 6002812-type values) is only used as fallback when DB has no claimNumber.
        claimReference: ctx.claim.claimNumber || v.claimReference || null,
        excessAmountUsd: v.excessAmountCents ? v.excessAmountCents / 100 : null,
        bettermentUsd: v.bettermentCents ? v.bettermentCents / 100 : null,
      },
      dataQuality: {
        completenessScore: stage4.completenessScore,
        missingFields: stage4.missingFields,
        validationIssues: stage4.issues,
      },
      // marketRegion: use tenant country (ISO 3166-1 alpha-2) as the market region.
      // ctx.claim.country does not exist as a DB column — use ctx.tenantCountry instead.
      marketRegion: ctx.tenantCountry ?? "ZW",
      assumptions,
    };

    // ── Step 5b: Third-Party Record Assembly ─────────────────────────────────
    // Map extracted thirdParty fields into a structured ThirdPartyRecord.
    const thirdParty: ThirdPartyRecord | null = (
      v.thirdPartyName || v.thirdPartyVehicle || v.thirdPartyRegistration || v.thirdPartyInsurerName
    ) ? {
      driverName: v.thirdPartyName || null,
      vehicleDescription: v.thirdPartyVehicle || null,
      registration: v.thirdPartyRegistration || null,
      idNumber: v.thirdPartyIdNumber || null,
      address: v.thirdPartyAddress || null,
      contactPhone: v.thirdPartyPhone || null,
      insurerName: v.thirdPartyInsurerName || null,
      insurerAddress: v.thirdPartyInsurerAddress || null,
      insurerPhone: v.thirdPartyInsurerPhone || null,
      policyNumber: v.thirdPartyPolicyNumber || null,
      liabilityAdmitted: null,
      accountSummary: v.thirdPartyAccountSummary || null,
    } : null;
    claimRecord.thirdParty = thirdParty;

    // ── Step 5c: Vehicle Market Valuation ─────────────────────────────────────
    // Compute repair-to-value ratio and write-off verdict.
    // Uses LLM to estimate market value when not stated in the claim form.
    let valuation: VehicleValuation | null = null;
    try {
      const repairCostUsd = repairQuote.agreedCostCents
        ? repairQuote.agreedCostCents / 100
        : repairQuote.quoteTotalCents
          ? repairQuote.quoteTotalCents / 100
          : null;

      // C-05-ARCH: The assessor's document-stated value is NOT the authoritative market value.
      // We always run the LLM benchmark step when make/model/year are available.
      // The system benchmark (LLM estimate) takes precedence over the assessor-stated value.
      const assessorStatedValue = vehicle.marketValueUsd ?? vehicle.valueUsd ?? null;
      let marketValueUsdFinal: number | null = null;
      let valuationMethod: VehicleValuation["valuationMethod"] = "not_available";
      let dataSource: string | null = null;

      // R-CX-01c: Derive tenant currency for this valuation
      const tenantCurrencyCode = getDefaultCurrencyForCountry(ctx.tenantCountry);
      const tenantCurrencySymbol = getDefaultCurrencySymbolForCountry(ctx.tenantCountry);
      const tenantCountryName = ctx.tenantCountry
        ? (COUNTRY_CURRENCY_MAP[ctx.tenantCountry.toUpperCase()]?.name ?? ctx.tenantCountry)
        : 'Southern Africa';
      const isZimbabwe = (ctx.tenantCountry ?? 'ZW').toUpperCase() === 'ZW';
      // Always attempt LLM benchmark when vehicle details are available
      if (vehicle.make && vehicle.model && vehicle.year) {
        try {
          // Build a rich context string for the valuation prompt
          const vehicleSpec = [
            `Make: ${vehicle.make}`,
            `Model: ${vehicle.model}`,
            `Body Type: ${vehicle.bodyType || 'unknown'}`,
            `Year: ${vehicle.year}`,
            `Mileage: ${vehicle.mileageKm ? vehicle.mileageKm + ' km' : 'unknown'}`,
            `Colour: ${vehicle.colour || 'unknown'}`,
            `Powertrain: ${vehicle.powertrain || 'unknown'}`,
            `VIN: ${vehicle.vin || 'unknown'}`,
          ].join('\n');

          // R-B-01 fix: bounded at 30 s — on timeout the catch block falls back to
          // assessorStatedValue, identical to the existing error-fallback path.
          // R-INF-03: withRetry wraps the withTimeout call so transient 5xx errors
          // are retried (up to 2 times) before falling back to assessorStatedValue.
          const llmResponse = await withRetry(
            () => withTimeout(() => invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a certified vehicle valuation expert specialising in the ${tenantCountryName} used-car market.

KEY MARKET CONTEXT FOR ${tenantCountryName.toUpperCase()}:
${isZimbabwe
  ? `- Zimbabwe uses USD cash transactions for vehicle sales. Prices are NOT discounted vs SA.\n- Import duties and scarcity mean popular SUVs and bakkies trade at PREMIUM to SA retail.\n- A 2020 ISUZU MU-X (7-seat SUV, 3.0L diesel) retails for USD 40,000\u201355,000 in Zimbabwe (2024\u20132025).\n- A 2020 ISUZU D-MAX (bakkie) retails for USD 35,000\u201350,000 depending on variant.\n- A 2020 Toyota Fortuner retails for USD 45,000\u201360,000 in Zimbabwe.\n- A 2020 Toyota Hilux retails for USD 38,000\u201352,000 in Zimbabwe.\n- Depreciation in Zimbabwe is slower than SA due to limited supply and high import costs.\n- Do NOT use South African Rand-based valuations converted at spot rate \u2014 this significantly underestimates Zimbabwe USD values.\n- Use AutoTrader Zimbabwe, Zimclassifieds, and regional dealer knowledge as reference points.`
  : `- Provide retail market values in ${tenantCurrencyCode} (${tenantCurrencySymbol}) for the local ${tenantCountryName} market.\n- Use local classified sites, dealer pricing, and regional market knowledge.\n- Account for local import duties, taxes, and supply/demand conditions.`
}

Return ONLY valid JSON with no markdown.`,
              },
              {
                role: "user",
                content: `Estimate the current retail market value in ${tenantCurrencyCode} for the following vehicle in ${tenantCountryName}:\n\n${vehicleSpec}\n\nReturn JSON: { "market_value_usd": number, "confidence": "high"|"medium"|"low", "reasoning": string, "data_source": string }`,
                // Note: JSON field is named market_value_usd for schema compatibility; value is in tenantCurrencyCode
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "vehicle_valuation",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    market_value_usd: { type: "number" },
                    confidence: { type: "string" },
                    reasoning: { type: "string" },
                    data_source: { type: "string" },
                  },
                  required: ["market_value_usd", "confidence", "reasoning", "data_source"],
                  additionalProperties: false,
                },
              },
            },
          }), 30_000, "Stage 5c valuation LLM"),
            2, undefined, undefined, 'stage-5c valuation'
          );
          const raw = llmResponse?.choices?.[0]?.message?.content;
          if (raw) {
            const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
            if (parsed.market_value_usd && parsed.market_value_usd > 0) {
              marketValueUsdFinal = parsed.market_value_usd;
              valuationMethod = "llm_estimate";
              // C-05-ARCH: Note when the system benchmark differs significantly from the assessor's stated value
              const assessorNote = assessorStatedValue && Math.abs(parsed.market_value_usd - assessorStatedValue) / assessorStatedValue > 0.15
                ? ` (assessor stated: ${tenantCurrencyCode} ${assessorStatedValue.toLocaleString()} — ${((parsed.market_value_usd - assessorStatedValue) / assessorStatedValue * 100).toFixed(0)}% deviation)`
                : assessorStatedValue ? ` (assessor stated: ${tenantCurrencyCode} ${assessorStatedValue.toLocaleString()} — consistent)` : '';
              dataSource = `KINGA system benchmark (${parsed.confidence} confidence): ${parsed.data_source}${assessorNote}`;
              assumptions.push({
                field: "valuation.marketValueUsd",
                assumedValue: marketValueUsdFinal,
                reason: `Market value not stated in documents. LLM estimated ${tenantCurrencyCode} ${(marketValueUsdFinal as number).toLocaleString()} for ${vehicle.year} ${vehicle.make} ${vehicle.model} in ${tenantCountryName}.`,
                strategy: "industry_average",
                confidence: parsed.confidence === "high" ? 75 : parsed.confidence === "medium" ? 55 : 35,
                stage: "Stage 5c",
              });
            }
          }
        } catch (llmErr) {
          ctx.log("Stage 5c", `LLM valuation failed: ${String(llmErr)} — falling back to assessor-stated value`);
          // C-05-ARCH: Only fall back to assessor-stated value if LLM benchmark fails
          if (assessorStatedValue) {
            marketValueUsdFinal = assessorStatedValue;
            valuationMethod = "document_stated";
            dataSource = "Assessor document (not independently verified — LLM benchmark unavailable)";
          }
        }
      } else if (assessorStatedValue) {
        // No vehicle details for LLM — use assessor value with explicit warning
        marketValueUsdFinal = assessorStatedValue;
        valuationMethod = "document_stated";
        dataSource = "Assessor document (not independently verified — insufficient vehicle details for benchmark)";
      }

      if (marketValueUsdFinal && repairCostUsd) {
        const ratio = repairCostUsd / marketValueUsdFinal;
        let verdict: VehicleValuation["verdict"];
        let verdictReason: string;
        // Stage 5 is preliminary; final repairability uses the completed L2 basis.
        const WRITE_OFF_RATIO_THRESHOLD = WRITE_OFF_RECOMMENDATION_THRESHOLD;
        /** Repair-to-value ratio above which vehicle is borderline */
        const BORDERLINE_RATIO_THRESHOLD = 0.60;
        if (ratio >= WRITE_OFF_RATIO_THRESHOLD) {
          verdict = "write_off";
          verdictReason = `Repair cost (${tenantCurrencyCode} ${repairCostUsd.toLocaleString()}) is ${(ratio * 100).toFixed(0)}% of market value (${tenantCurrencyCode} ${marketValueUsdFinal.toLocaleString()}). Meets the ${Math.round(WRITE_OFF_RATIO_THRESHOLD * 100)}% economic write-off recommendation threshold.`;
        } else if (ratio >= WRITE_OFF_WARNING_THRESHOLD) {
          verdict = "borderline";
          verdictReason = `Repair cost (${tenantCurrencyCode} ${repairCostUsd.toLocaleString()}) is ${(ratio * 100).toFixed(0)}% of market value (${tenantCurrencyCode} ${marketValueUsdFinal.toLocaleString()}). Meets KINGA’s ${Math.round(WRITE_OFF_WARNING_THRESHOLD * 100)}% early-warning threshold: surface for assessor or reviewer attention; no write-off recommendation is made.`;
        } else if (ratio >= BORDERLINE_RATIO_THRESHOLD) {
          verdict = "borderline";
          verdictReason = `Repair cost (${tenantCurrencyCode} ${repairCostUsd.toLocaleString()}) is ${(ratio * 100).toFixed(0)}% of market value (${tenantCurrencyCode} ${marketValueUsdFinal.toLocaleString()}). Borderline — recommend independent valuation.`;
        } else {
          verdict = "repairable";
          verdictReason = `Repair cost (${tenantCurrencyCode} ${repairCostUsd.toLocaleString()}) is ${(ratio * 100).toFixed(0)}% of market value (${tenantCurrencyCode} ${marketValueUsdFinal.toLocaleString()}). Within acceptable repair threshold.`;
        }
        valuation = { marketValueUsd: marketValueUsdFinal, valuationMethod, repairCostUsd, repairToValueRatio: ratio, verdict, verdictReason, dataSource };
      } else if (marketValueUsdFinal) {
        valuation = { marketValueUsd: marketValueUsdFinal, valuationMethod, repairCostUsd: null, repairToValueRatio: null, verdict: "unknown", verdictReason: "Repair cost not available — cannot compute repair-to-value ratio.", dataSource };
      } else {
        valuation = { marketValueUsd: null, valuationMethod: "not_available", repairCostUsd, repairToValueRatio: null, verdict: "unknown", verdictReason: "Market value could not be determined from documents or LLM estimate.", dataSource: null };
      }
      claimRecord.valuation = valuation;
      ctx.log("Stage 5c", `Valuation: market=${marketValueUsdFinal ? tenantCurrencyCode + " " + (marketValueUsdFinal as number).toLocaleString() : "unknown"}, repair=${repairCostUsd ? tenantCurrencyCode + " " + repairCostUsd.toLocaleString() : "unknown"}, verdict=${valuation.verdict}`);
    } catch (valErr) {
      ctx.log("Stage 5c", `Valuation step failed: ${String(valErr)} — proceeding without valuation`);
    }

    // ── Step 5d: Scenario Engine Selection ─────────────────────────────────
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
      // driverName/claimantName not on claims table — use lodgerName/vehicleOwnerName as last-resort
      // fallback when the full extraction pipeline fails catastrophically. These fields exist on the
      // claims table and are the closest available proxy. In normal pipeline runs, v.driverName /
      // v.claimantName from stage-3 extraction are the primary source (Batch 2f).
      driver: {
        name: ctx.claim.lodgerName ?? null,
        claimantName: ctx.claim.vehicleOwnerName ?? ctx.claim.lodgerName ?? null,
        licenseNumber: null,
      },
      accidentDetails: {
        date: ctx.claim.incidentDate || null, time: null, location: null, description: null,
        incidentType: "collision", incidentSubType: null, incidentClassification: null,
        collisionDirection: "unknown",
        impactPoint: null, estimatedSpeedKmh: null,
        maxCrushDepthM: null, totalDamageAreaM2: null,
        structuralDamage: false, airbagDeployment: false,
        animalType: null, weatherConditions: null, visibilityConditions: null, roadSurface: null,
        narrativeAnalysis: null,
        collisionScenario: "unknown" as const, isStruckParty: false,
        thirdPartyClaimRequired: false, isHitAndRun: false, isParkingLotDamage: false,
        multiEventSequence: null,
      },
      policeReport: { reportNumber: null, station: null, officerName: null, chargeNumber: null, fineAmountCents: null, reportDate: null },
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
      marketRegion: ctx.tenantCountry ?? "ZW",
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
  impactCausation: ImpactCausation;
  causationSpeedCeilingKmh: number | null;
  reversingNarrativeContradiction: boolean;
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
  // IMPORTANT: params.incidentType === "single_vehicle" is an explicit claim-form field
  // that must always override narrative keyword matching. A single-vehicle claim with rear
  // damage (e.g. reversed into a wall) would otherwise be misclassified as rear_end_struck.
  const isSingleVehicle = singleVehicleKeywords.some(kw => d.includes(kw))
    || dir === "rollover"
    || params.incidentType === "animal_strike"
    || params.incidentType === "single_vehicle";

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
  } else if ((dir as string) === "rollover") {
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

  // ── Impact causation classification (rear-impact scenarios only) ─────────────
  // Determines WHO was in motion in reverse, which drives different physics speed
  // ceilings, damage pattern expectations, and fraud risk profiles.
  let impactCausation: ImpactCausation = 'UNKNOWN';
  let reversingNarrativeContradiction: boolean = false;
  let causationSpeedCeilingKmh: number | null = null;

  const isRearImpact = collisionScenario === 'rear_end_struck' || collisionScenario === 'rear_end_striking';
  if (isRearImpact) {
    // Keyword sets for causation verb analysis
    const selfReversingKeywords = [
      "i was reversing", "i reversed", "was reversing", "reversing out",
      "reversed out", "backing out", "backed out", "reversing from",
      "reversed from", "i was backing", "my vehicle was reversing",
      "reversing into", "reversed into", "reversing when",
    ];
    const thirdPartyReversingKeywords = [
      "reversed into me", "reversed into my", "was reversing into",
      "reversed into the", "third party reversed", "other vehicle reversed",
      "other car reversed", "they reversed", "he reversed into", "she reversed into",
      "reversed out of", "reversed from a parking", "reversed from parking",
    ];
    const thirdPartyForwardStrikeKeywords = [
      "hit from behind", "struck from behind", "rammed from behind",
      "drove into the back", "drove into my", "collided into the back",
      "came from behind", "came into the back", "another vehicle hit",
      "another car hit", "third party hit", "third party struck",
      "other vehicle hit", "other car hit", "was rear-ended", "was rear ended",
    ];

    const isSelfReversing = selfReversingKeywords.some(kw => d.includes(kw));
    const isThirdPartyReversing = thirdPartyReversingKeywords.some(kw => d.includes(kw));
    const isThirdPartyForwardStrike = thirdPartyForwardStrikeKeywords.some(kw => d.includes(kw));

    if (isSelfReversing && !isThirdPartyForwardStrike) {
      impactCausation = "SELF_REVERSING";
      causationSpeedCeilingKmh = 20; // Reverse gear physical limit
    } else if (isThirdPartyReversing) {
      impactCausation = "THIRD_PARTY_REVERSED_INTO_CLAIMANT";
      causationSpeedCeilingKmh = 20; // Third party also in reverse
    } else if (isThirdPartyForwardStrike || isStruckParty) {
      impactCausation = "THIRD_PARTY_REAR_STRIKE";
      // Speed ceiling resolved by Stage 7 from speedLimitKmh
      causationSpeedCeilingKmh = null;
    } else {
      impactCausation = "UNKNOWN";
      causationSpeedCeilingKmh = null;
    }

    // Plausibility gate: SELF_REVERSING with an ACTIVE third party is a structural
    // contradiction. An active third party is one described as moving, driving, or
    // causally involved in the collision — not merely the owner of a stationary object
    // that was struck (e.g. claimant reversed into a parked car).
    //
    // ACTIVE signals (fire the contradiction flag):
    //   - Narrative describes the third party as driving/moving at impact
    //   - Police report present AND no passive-object keywords (implies chargeable collision)
    //   - Third-party forward strike keywords detected
    //
    // PASSIVE signals (suppress the contradiction flag — innocent scenario):
    //   - Narrative contains parked/stationary/unattended keywords
    //   - isParkingLotDamage flag already set (covers most passive scenarios)
    //   - No motion verb attributed to the third party
    //
    // Extraction approach: narrative keyword analysis only (no new structured field needed).
    // The isParkingLotDamage flag captures most passive scenarios already.
    // isThirdPartyForwardStrike captures active third-party motion.
    // activeThirdPartyMotionKeywords catches remaining motion verbs.
    const passiveObjectKeywords = [
      "parked", "was parked", "stationary", "unattended", "standing",
      "parked car", "parked vehicle", "parked truck", "parked bakkie",
      "into a parked", "into the parked", "into a stationary",
      "into a wall", "into a gate", "into a pole", "into a fence",
      "into a barrier", "into a bollard", "into a pillar",
    ];
    const activeThirdPartyMotionKeywords = [
      "was driving", "was moving", "came towards", "drove towards",
      "was travelling", "was traveling", "was coming", "approached",
      "was approaching", "other driver", "other vehicle was",
      "third party was driving", "third party was moving",
    ];
    const isPassiveThirdParty = passiveObjectKeywords.some(kw => d.includes(kw)) || isParkingLotDamage;
    const isActiveThirdParty = (
      isThirdPartyForwardStrike ||
      activeThirdPartyMotionKeywords.some(kw => d.includes(kw)) ||
      (hasPoliceReport && !isPassiveThirdParty)
    );
    if (impactCausation === "SELF_REVERSING" && isActiveThirdParty && !isPassiveThirdParty) {
      // Active third party present + claimant reversing = structural contradiction
      // (either the narrative is wrong, or the causation should be THIRD_PARTY_REAR_STRIKE)
      reversingNarrativeContradiction = true;
    } else {
      // Passive third party (owner of what was struck) — no contradiction
      reversingNarrativeContradiction = false;
    }
  }

  return { collisionScenario, isStruckParty, thirdPartyClaimRequired, isHitAndRun, isParkingLotDamage, scenarioConfidence, thirdPartyConfidence, impactCausation, reversingNarrativeContradiction, causationSpeedCeilingKmh };
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
    // R-INF-03: wrap incident-classifier call in withRetry for transient resilience
    const response = await withRetry(() => invokeLLM({
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
   CRITICAL RULE: When a vehicle hits a ROAD DEPRESSION, POTHOLE, DONGA, WASH-AWAY, SPEED HUMP, or similar road surface feature and the front airbags deploy, the collisionDirection is "frontal" (the vehicle's front axle/bumper struck the road surface head-on). Do NOT classify as "rollover" for road surface impacts — rollover requires the vehicle to have physically tipped over onto its side or roof. A rear tyre puncture as a secondary consequence of a road depression impact does NOT make it a rollover.
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
    }), 2, undefined, undefined, 'stage-5 incident-classifier');
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
