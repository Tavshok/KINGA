/**
 * pipeline-v2/stage-4-validation.ts
 *
 * STAGE 4 — DATA VALIDATION
 *
 * Before analysis, validate the extracted data.
 * Check for missing vehicle information, accident date, repair quotes, police report.
 * If fields are missing, attempt secondary extraction from other documents.
 * Merge best values from all document extractions into a single validated record.
 */

import type {
  PipelineContext,
  StageResult,
  Stage3Output,
  Stage4Output,
  ExtractedClaimFields,
  ValidationIssue,
  DamagedComponentExtracted,
} from "./types";

/**
 * Critical fields that must be present for analysis.
 */
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

/**
 * Merge multiple ExtractedClaimFields into one, preferring non-null values.
 * For arrays (damagedComponents, uploadedImageUrls), merge and deduplicate.
 */
function mergeExtractions(extractions: ExtractedClaimFields[]): ExtractedClaimFields {
  if (extractions.length === 0) {
    throw new Error("No extractions to merge");
  }
  if (extractions.length === 1) {
    return { ...extractions[0] };
  }

  // Start with the first extraction as base
  const merged: ExtractedClaimFields = { ...extractions[0] };

  // For each subsequent extraction, fill in nulls from the base
  for (let i = 1; i < extractions.length; i++) {
    const ext = extractions[i];
    for (const key of Object.keys(ext) as Array<keyof ExtractedClaimFields>) {
      if (key === "damagedComponents") continue; // Handle separately
      if (key === "uploadedImageUrls") continue; // Handle separately
      if (key === "sourceDocumentIndex") continue;

      const currentVal = merged[key];
      const newVal = ext[key];

      // Fill null values from other documents
      if (currentVal === null && newVal !== null) {
        (merged as any)[key] = newVal;
      }
    }
  }

  // Merge damaged components — deduplicate by name+location
  const allComponents: DamagedComponentExtracted[] = [];
  const seen = new Set<string>();
  for (const ext of extractions) {
    for (const comp of ext.damagedComponents) {
      const key = `${comp.name.toLowerCase()}|${comp.location.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allComponents.push(comp);
      }
    }
  }
  merged.damagedComponents = allComponents;

  // Merge image URLs
  const allImages = new Set<string>();
  for (const ext of extractions) {
    for (const url of ext.uploadedImageUrls) {
      allImages.add(url);
    }
  }
  merged.uploadedImageUrls = Array.from(allImages);

  return merged;
}

/**
 * Attempt to fill missing fields from the claim record in the database.
 * This is the "secondary extraction" — using data already in the system.
 */
function fillFromClaimRecord(
  fields: ExtractedClaimFields,
  claim: Record<string, any>
): { fields: ExtractedClaimFields; filledFields: string[] } {
  const filled: string[] = [];

  if (!fields.vehicleMake && claim.vehicleMake) {
    fields.vehicleMake = claim.vehicleMake;
    filled.push("vehicleMake");
  }
  if (!fields.vehicleModel && claim.vehicleModel) {
    fields.vehicleModel = claim.vehicleModel;
    filled.push("vehicleModel");
  }
  if (!fields.vehicleYear && claim.vehicleYear) {
    fields.vehicleYear = claim.vehicleYear;
    filled.push("vehicleYear");
  }
  if (!fields.vehicleRegistration && claim.vehicleRegistration) {
    fields.vehicleRegistration = claim.vehicleRegistration;
    filled.push("vehicleRegistration");
  }
  if (!fields.vehicleMileage && claim.vehicleMileage) {
    fields.vehicleMileage = claim.vehicleMileage;
    filled.push("vehicleMileage");
  }
  if (!fields.accidentDate && claim.accidentDate) {
    fields.accidentDate = claim.accidentDate;
    filled.push("accidentDate");
  }
  if (!fields.accidentLocation && claim.accidentLocation) {
    fields.accidentLocation = claim.accidentLocation;
    filled.push("accidentLocation");
  }
  if (!fields.accidentDescription && claim.incidentDescription) {
    fields.accidentDescription = claim.incidentDescription;
    filled.push("accidentDescription");
  }
  if (!fields.incidentType && claim.incidentType) {
    fields.incidentType = claim.incidentType;
    filled.push("incidentType");
  }
  if (!fields.claimantName && claim.claimantName) {
    fields.claimantName = claim.claimantName;
    filled.push("claimantName");
  }
  if (!fields.driverName && claim.driverName) {
    fields.driverName = claim.driverName;
    filled.push("driverName");
  }

  return { fields, filledFields: filled };
}

export async function runValidationStage(
  ctx: PipelineContext,
  stage3: Stage3Output
): Promise<StageResult<Stage4Output>> {
  const start = Date.now();
  ctx.log("Stage 4", "Data validation starting");

  try {
    const issues: ValidationIssue[] = [];

    // Step 1: Merge all document extractions into one record
    let validatedFields = mergeExtractions(stage3.perDocumentExtractions);
    ctx.log("Stage 4", `Merged ${stage3.perDocumentExtractions.length} extraction(s) into unified record`);

    // Step 2: Check for missing critical fields
    const missingBefore: string[] = [];
    for (const { field, label, severity } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingBefore.push(field);
      }
    }

    // Step 3: Secondary extraction — fill from claim record in DB
    if (missingBefore.length > 0) {
      ctx.log("Stage 4", `${missingBefore.length} critical field(s) missing. Attempting secondary extraction from claim record.`);
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
      }
      ctx.log("Stage 4", `Secondary extraction filled ${filled.length} field(s): ${filled.join(", ")}`);
    }

    // Step 4: Final validation pass — record remaining issues
    const missingAfter: string[] = [];
    for (const { field, label, severity } of CRITICAL_FIELDS) {
      const val = validatedFields[field];
      if (val === null || val === undefined || val === "") {
        missingAfter.push(field);
        issues.push({
          field,
          severity,
          message: `${label} is missing after all extraction attempts.`,
          secondaryExtractionAttempted: missingBefore.includes(field),
          resolved: false,
        });
      }
    }

    // Step 5: Validate damaged components
    if (validatedFields.damagedComponents.length === 0) {
      issues.push({
        field: "damagedComponents",
        severity: "warning",
        message: "No damaged components were extracted from any document.",
        secondaryExtractionAttempted: false,
        resolved: false,
      });
    }

    // Step 6: Calculate completeness score
    const totalFields = CRITICAL_FIELDS.length + 3; // +3 for components, images, description
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

    ctx.log("Stage 4", `Validation complete. Completeness: ${completenessScore}%. Missing: ${missingAfter.length} field(s). Issues: ${issues.length}`);

    return {
      status: "success",
      data: output,
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  } catch (err) {
    ctx.log("Stage 4", `Validation failed: ${String(err)}`);
    return {
      status: "failed",
      data: null,
      error: String(err),
      durationMs: Date.now() - start,
      savedToDb: false,
    };
  }
}
