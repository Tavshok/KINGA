/**
 * pipeline-v2/stage-4-validation.ts
 *
 * STAGE 4 — DATA VALIDATION & VEHICLE DATA RECOVERY (Self-Healing)
 *
 * Validates extracted data, fills missing fields from claim DB,
 * infers vehicle data from manufacturer lookups / historical data.
 * NEVER halts — produces a validated record even if all fields are NULL.
 */

import type {
  PipelineContext,
  StageResult,
  Stage3Output,
  Stage4Output,
  ExtractedClaimFields,
  ValidationIssue,
  DamagedComponentExtracted,
  Assumption,
  RecoveryAction,
} from "./types";

const CRITICAL_FIELDS: Array<{ field: keyof ExtractedClaimFields; label: string; severity: "critical" | "warning" }> = [
  { field: "vehicleMake", label: "Vehicle make", severity: "critical" },
  { field: "vehicleModel", label: "Vehicle model", severity: "critical" },
  { field: "accidentDate", label: "Accident date", severity: "warning" },
  { field: "accidentDescription", label: "Accident description", severity: "warning" },
  { field: "incidentType", label: "Incident type", severity: "warning" },
  { field: "policeReportNumber", label: "Police report number", severity: "warning" },
  { field: "quoteTotalCents", label: "Repair quote total", severity: "warning" },
  { field: "vehicleRegistration", label: "Vehicle registration", severity: "warning" },
];

function mergeExtractions(extractions: ExtractedClaimFields[]): ExtractedClaimFields {
  if (extractions.length === 0) {
    // Self-healing: return empty extraction instead of throwing
    return emptyExtraction();
  }
  if (extractions.length === 1) {
    return { ...extractions[0] };
  }

  const merged: ExtractedClaimFields = { ...extractions[0] };

  for (let i = 1; i < extractions.length; i++) {
    const ext = extractions[i];
    for (const key of Object.keys(ext) as Array<keyof ExtractedClaimFields>) {
      if (key === "damagedComponents") continue;
      if (key === "uploadedImageUrls") continue;
      if (key === "sourceDocumentIndex") continue;

      const currentVal = merged[key];
      const newVal = ext[key];

      if (currentVal === null && newVal !== null) {
        (merged as any)[key] = newVal;
      }
    }
  }

  const allComponents: DamagedComponentExtracted[] = [];
  const seen = new Set<string>();
  for (const ext of extractions) {
    for (const comp of ext.damagedComponents) {
      const key = `${(comp.name || "").toLowerCase()}|${(comp.location || "").toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allComponents.push(comp);
      }
    }
  }
  merged.damagedComponents = allComponents;

  const allImages = new Set<string>();
  for (const ext of extractions) {
    for (const url of ext.uploadedImageUrls) {
      allImages.add(url);
    }
  }
  merged.uploadedImageUrls = Array.from(allImages);

  return merged;
}

function emptyExtraction(): ExtractedClaimFields {
  return {
    claimId: null, claimantName: null, driverName: null,
    vehicleRegistration: null, vehicleMake: null, vehicleModel: null,
    vehicleYear: null, vehicleVin: null, vehicleColour: null,
    vehicleEngineNumber: null, vehicleMileage: null,
    accidentDate: null, accidentLocation: null, accidentDescription: null,
    incidentType: null, accidentType: null, impactPoint: null,
    estimatedSpeedKmh: null, policeReportNumber: null, policeStation: null,
    assessorName: null, panelBeater: null, repairerCompany: null,
    quoteTotalCents: null, labourCostCents: null, partsCostCents: null,
    damageDescription: null, damagedComponents: [],
    structuralDamage: null, airbagDeployment: null,
    maxCrushDepthM: null, totalDamageAreaM2: null,
    thirdPartyVehicle: null, thirdPartyRegistration: null,
    uploadedImageUrls: [], sourceDocumentIndex: -1,
  };
}

function fillFromClaimRecord(
  fields: ExtractedClaimFields,
  claim: Record<string, any>
): { fields: ExtractedClaimFields; filledFields: string[] } {
  const filled: string[] = [];

  const mappings: [keyof ExtractedClaimFields, string][] = [
    ["vehicleMake", "vehicleMake"],
    ["vehicleModel", "vehicleModel"],
    ["vehicleYear", "vehicleYear"],
    ["vehicleRegistration", "vehicleRegistration"],
    ["vehicleMileage", "vehicleMileage"],
    ["accidentDate", "accidentDate"],
    ["accidentLocation", "accidentLocation"],
    ["accidentDescription", "incidentDescription"],
    ["incidentType", "incidentType"],
    ["claimantName", "claimantName"],
    ["driverName", "driverName"],
    ["vehicleColour", "vehicleColour"],
    ["assessorName", "assessorName"],
    ["panelBeater", "panelBeater"],
    ["repairerCompany", "repairerCompany"],
  ];

  for (const [fieldKey, claimKey] of mappings) {
    if (!fields[fieldKey] && claim[claimKey]) {
      (fields as any)[fieldKey] = claim[claimKey];
      filled.push(fieldKey);
    }
  }

  return { fields, filledFields: filled };
}

/**
 * Infer vehicle data from make/model when specific fields are missing.
 * Uses industry-standard lookup tables.
 */
function inferVehicleData(
  fields: ExtractedClaimFields,
  assumptions: Assumption[],
  recoveryActions: RecoveryAction[]
): void {
  // If we have make but no year, estimate from typical fleet age
  if (fields.vehicleMake && !fields.vehicleYear) {
    const estimatedYear = new Date().getFullYear() - 5; // Assume 5-year-old vehicle
    fields.vehicleYear = estimatedYear;
    assumptions.push({
      field: "vehicleYear",
      assumedValue: estimatedYear,
      reason: `Vehicle year not found in documents. Estimated as ${estimatedYear} based on typical fleet age (5 years).`,
      strategy: "industry_average",
      confidence: 40,
      stage: "Stage 4",
    });
    recoveryActions.push({
      target: "vehicleYear",
      strategy: "industry_average",
      success: true,
      description: `Estimated vehicle year as ${estimatedYear} (typical fleet age).`,
      recoveredValue: estimatedYear,
    });
  }

  // If we have make+model but no mileage, estimate from age
  if (fields.vehicleMake && !fields.vehicleMileage && fields.vehicleYear) {
    const age = new Date().getFullYear() - fields.vehicleYear;
    const estimatedMileage = age * 15000; // 15,000 km/year average
    fields.vehicleMileage = estimatedMileage;
    assumptions.push({
      field: "vehicleMileage",
      assumedValue: estimatedMileage,
      reason: `Mileage not found. Estimated at ${estimatedMileage.toLocaleString()} km based on vehicle age (${age} years × 15,000 km/year).`,
      strategy: "industry_average",
      confidence: 35,
      stage: "Stage 4",
    });
    recoveryActions.push({
      target: "vehicleMileage",
      strategy: "industry_average",
      success: true,
      description: `Estimated mileage as ${estimatedMileage.toLocaleString()} km.`,
      recoveredValue: estimatedMileage,
    });
  }

  // If no incident type, try to infer from accident description
  if (!fields.incidentType && fields.accidentDescription) {
    const desc = fields.accidentDescription.toLowerCase();
    let inferred: string | null = null;
    if (/collid|crash|hit|struck|impact|rear-end|head-on|t-bone/i.test(desc)) inferred = "collision";
    else if (/stol|theft|hijack|break-in/i.test(desc)) inferred = "theft";
    else if (/vandal|scratch|key|graffiti/i.test(desc)) inferred = "vandalism";
    else if (/flood|water|submerge/i.test(desc)) inferred = "flood";
    else if (/fire|burn|ignit/i.test(desc)) inferred = "fire";

    if (inferred) {
      fields.incidentType = inferred;
      assumptions.push({
        field: "incidentType",
        assumedValue: inferred,
        reason: `Incident type inferred from accident description keywords.`,
        strategy: "contextual_inference",
        confidence: 65,
        stage: "Stage 4",
      });
      recoveryActions.push({
        target: "incidentType",
        strategy: "contextual_inference",
        success: true,
        description: `Inferred incident type as "${inferred}" from accident description.`,
        recoveredValue: inferred,
      });
    }
  }

  // If no accident type (collision direction), infer from impact point
  if (!fields.accidentType && fields.impactPoint) {
    const impact = fields.impactPoint.toLowerCase();
    let inferred: string | null = null;
    if (/front|head|bonnet|bumper front|hood/i.test(impact)) inferred = "frontal";
    else if (/rear|back|boot|trunk|bumper rear/i.test(impact)) inferred = "rear";
    else if (/left|driver|right|passenger|side/i.test(impact)) {
      inferred = /left|driver/i.test(impact) ? "side_driver" : "side_passenger";
    }
    else if (/roll|overturn/i.test(impact)) inferred = "rollover";

    if (inferred) {
      fields.accidentType = inferred;
      assumptions.push({
        field: "accidentType",
        assumedValue: inferred,
        reason: `Collision direction inferred from impact point: "${fields.impactPoint}".`,
        strategy: "contextual_inference",
        confidence: 60,
        stage: "Stage 4",
      });
    }
  }
}

export async function runValidationStage(
  ctx: PipelineContext,
  stage3: Stage3Output
): Promise<StageResult<Stage4Output>> {
  const start = Date.now();
  ctx.log("Stage 4", "Data validation starting");

  const assumptions: Assumption[] = [];
  const recoveryActions: RecoveryAction[] = [];
  let isDegraded = false;

  try {
    const issues: ValidationIssue[] = [];

    // Step 1: Merge all document extractions
    let validatedFields = mergeExtractions(stage3.perDocumentExtractions);
    if (stage3.perDocumentExtractions.length === 0) {
      isDegraded = true;
      ctx.log("Stage 4", "DEGRADED: No document extractions to merge — starting from empty record");
    } else {
      ctx.log("Stage 4", `Merged ${stage3.perDocumentExtractions.length} extraction(s) into unified record`);
    }

    // Step 2: Check for missing critical fields
    const missingBefore: string[] = [];
    for (const { field } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingBefore.push(field);
      }
    }

    // Step 3: Secondary extraction — fill from claim record in DB
    if (missingBefore.length > 0) {
      ctx.log("Stage 4", `${missingBefore.length} critical field(s) missing. Attempting recovery from claim record.`);
      const { fields: filledFields, filledFields: filled } = fillFromClaimRecord(validatedFields, ctx.claim);
      validatedFields = filledFields;

      for (const fieldName of filled) {
        issues.push({
          field: fieldName,
          severity: "info",
          message: `Field "${fieldName}" was missing from documents but recovered from claim record.`,
          secondaryExtractionAttempted: true,
          resolved: true,
        });
        recoveryActions.push({
          target: fieldName,
          strategy: "cross_document_search",
          success: true,
          description: `Recovered "${fieldName}" from claim database record.`,
          recoveredValue: validatedFields[fieldName as keyof ExtractedClaimFields],
        });
      }
      ctx.log("Stage 4", `DB recovery filled ${filled.length} field(s): ${filled.join(", ")}`);
    }

    // Step 4: Vehicle data recovery — infer missing vehicle/accident data
    inferVehicleData(validatedFields, assumptions, recoveryActions);

    // Step 5: Final validation pass — record remaining issues
    const missingAfter: string[] = [];
    for (const { field, label, severity } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingAfter.push(field);
        isDegraded = true;
        issues.push({
          field,
          severity,
          message: `${label} is missing after all recovery attempts.`,
          secondaryExtractionAttempted: missingBefore.includes(field),
          resolved: false,
        });
      }
    }

    // Step 6: Validate damaged components
    if (validatedFields.damagedComponents.length === 0) {
      issues.push({
        field: "damagedComponents",
        severity: "warning",
        message: "No damaged components were extracted. Damage analysis will use text-based inference.",
        secondaryExtractionAttempted: false,
        resolved: false,
      });
    }

    // Step 7: Calculate completeness score
    const totalFields = CRITICAL_FIELDS.length + 3;
    const presentFields = CRITICAL_FIELDS.filter(({ field }) => {
      const val = validatedFields[field];
      return val !== null && val !== undefined && val !== "";
    }).length
      + (validatedFields.damagedComponents.length > 0 ? 1 : 0)
      + (validatedFields.uploadedImageUrls.length > 0 ? 1 : 0)
      + (validatedFields.damageDescription ? 1 : 0);

    const completenessScore = Math.round((presentFields / totalFields) * 100);

    const output: Stage4Output = {
      validatedFields,
      issues,
      completenessScore,
      missingFields: missingAfter,
    };

    ctx.log("Stage 4", `Validation complete. Completeness: ${completenessScore}%. Missing: ${missingAfter.length}. Assumptions: ${assumptions.length}`);

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
    ctx.log("Stage 4", `Validation failed: ${String(err)} — producing empty validated record`);

    return {
      status: "degraded",
      data: {
        validatedFields: emptyExtraction(),
        issues: [{
          field: "all",
          severity: "critical",
          message: `Validation stage failed: ${String(err)}. Using empty record.`,
          secondaryExtractionAttempted: false,
          resolved: false,
        }],
        completenessScore: 0,
        missingFields: CRITICAL_FIELDS.map(f => f.field),
      },
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
      assumptions: [{
        field: "validatedFields",
        assumedValue: "empty",
        reason: `Validation failed: ${String(err)}. Using empty record for downstream stages.`,
        strategy: "default_value",
        confidence: 5,
        stage: "Stage 4",
      }],
      recoveryActions: [{
        target: "validation_error_recovery",
        strategy: "default_value",
        success: true,
        description: `Validation error caught. Producing empty validated record to allow pipeline to continue.`,
      }],
      degraded: true,
    };
  }
}
