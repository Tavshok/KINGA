/**
 * claim-record-schema.ts
 *
 * Zod schema contract for the ResolvedClaimRecord produced by ClaimRecordBridge.
 *
 * Purpose:
 *   - Validates the bridge output at runtime before it reaches the report generator
 *   - Distinguishes REQUIRED fields (blocking) from OPTIONAL fields (warning only)
 *   - Produces a structured ValidationResult that the integrity gate and report
 *     congruency section can consume
 *
 * REQUIRED fields: without these, the report cannot be legally defensible
 * OPTIONAL fields: missing values degrade confidence but do not block the report
 */

import { z } from "zod";

// ─── Required fields schema ────────────────────────────────────────────────────
// These fields MUST be present for the report to be considered decision-ready.
// A missing required field is a CG-2 integrity gate violation.

export const RequiredClaimFieldsSchema = z.object({
  vehicleRegistration: z.string().min(1, "Vehicle registration is required"),
  vehicleMake: z.string().min(1, "Vehicle make is required"),
  vehicleModel: z.string().min(1, "Vehicle model is required"),
  accidentDate: z.string().min(1, "Incident date is required"),
  incidentType: z.string().min(1, "Incident type is required"),
  estimatedCostUsd: z.number().positive("Estimated cost must be a positive number"),
});

// ─── Optional fields schema ────────────────────────────────────────────────────
// These fields improve report quality but their absence is a warning, not a block.

export const OptionalClaimFieldsSchema = z.object({
  vehicleYear: z.number().int().min(1900).max(2100).nullable().optional(),
  estimatedSpeedKmh: z.number().positive().nullable().optional(),
  policyNumber: z.string().nullable().optional(),
  excessAmountUsd: z.number().nonnegative().nullable().optional(),
  insurer: z.string().nullable().optional(),
  policeReportNumber: z.string().nullable().optional(),
  fraudScore: z.number().min(0).max(100).nullable().optional(),
  physicsConsistencyScore: z.number().min(0).max(100).nullable().optional(),
  dataCompletenessScore: z.number().min(0).max(100).nullable().optional(),
  photosDetected: z.boolean().nullable().optional(),
  photosIngested: z.boolean().nullable().optional(),
});

// ─── Full bridge output schema ─────────────────────────────────────────────────

export const ResolvedClaimRecordSchema = RequiredClaimFieldsSchema.merge(OptionalClaimFieldsSchema);

// ─── Validation result ─────────────────────────────────────────────────────────

export interface FieldValidationIssue {
  field: string;
  severity: "blocking" | "warning";
  message: string;
}

export interface ClaimRecordValidationResult {
  valid: boolean;
  blockingIssues: FieldValidationIssue[];
  warnings: FieldValidationIssue[];
  /** Fields that passed validation */
  validFields: string[];
  /** Overall schema compliance score (0–100) */
  complianceScore: number;
}

/**
 * Validate a ResolvedClaimRecord against the schema contract.
 * Returns a structured result — never throws.
 */
export function validateClaimRecordSchema(
  resolved: Record<string, unknown>
): ClaimRecordValidationResult {
  const blockingIssues: FieldValidationIssue[] = [];
  const warnings: FieldValidationIssue[] = [];
  const validFields: string[] = [];

  // Check required fields
  const requiredResult = RequiredClaimFieldsSchema.safeParse(resolved);
  if (!requiredResult.success) {
    for (const issue of requiredResult.error.issues) {
      const field = issue.path.join(".");
      blockingIssues.push({
        field,
        severity: "blocking",
        message: issue.message,
      });
    }
  } else {
    validFields.push(...Object.keys(RequiredClaimFieldsSchema.shape));
  }

  // Check optional fields — only warn, never block
  const optionalResult = OptionalClaimFieldsSchema.safeParse(resolved);
  if (!optionalResult.success) {
    for (const issue of optionalResult.error.issues) {
      const field = issue.path.join(".");
      // Only warn if the field has a value but it's the wrong type
      // (missing optional fields are fine)
      if (resolved[field] !== null && resolved[field] !== undefined) {
        warnings.push({
          field,
          severity: "warning",
          message: `Optional field has unexpected type: ${issue.message}`,
        });
      }
    }
  }

  // Add warnings for missing high-value optional fields
  const highValueOptionals: Array<{ field: string; label: string }> = [
    { field: "estimatedSpeedKmh", label: "Vehicle speed" },
    { field: "policyNumber", label: "Policy number" },
    { field: "policeReportNumber", label: "Police report number" },
    { field: "physicsConsistencyScore", label: "Physics consistency score" },
  ];
  for (const { field, label } of highValueOptionals) {
    const val = resolved[field];
    if (val === null || val === undefined || val === "") {
      warnings.push({
        field,
        severity: "warning",
        message: `${label} not extracted — report section will show estimated or N/A value`,
      });
    } else {
      validFields.push(field);
    }
  }

  const totalFields = Object.keys(RequiredClaimFieldsSchema.shape).length +
    highValueOptionals.length;
  const passedFields = validFields.length;
  const complianceScore = Math.round((passedFields / totalFields) * 100);

  return {
    valid: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    validFields,
    complianceScore,
  };
}
