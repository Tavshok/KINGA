/**
 * shared/vehicleYearValidation.ts
 *
 * Shared vehicle year validation utility used by:
 *   - SubmitClaim.tsx  (client-side soft-warn)
 *   - server/routers.ts (Zod refinement on claims.submit input)
 *   - server/pipeline-v2/orchestrator.ts (Stage 4 OCR normalisation)
 *
 * Rules:
 *   1. Blank / null / undefined → valid (year is optional; pipeline will estimate)
 *   2. Two-digit years (0–99) → auto-expanded to 4-digit (e.g. 24 → 2024)
 *   3. Accepted range: 1950 – (current year + 1) inclusive
 *   4. Zero, negative, or > (current year + 1) → invalid
 *   5. Non-numeric strings → invalid
 */

export const VEHICLE_YEAR_MIN = 1950;

/** Returns the maximum accepted model year (current calendar year + 1). */
export function vehicleYearMax(): number {
  return new Date().getFullYear() + 1;
}

export type YearValidationResult =
  | { valid: true; year: number; expanded: boolean }
  | { valid: false; reason: string };

/**
 * Validate and normalise a raw vehicle year value.
 *
 * @param raw  The raw value from a form field or OCR extraction.
 *             May be a number, numeric string, two-digit string, or blank.
 * @returns    A discriminated union — `valid: true` with the normalised year,
 *             or `valid: false` with a human-readable reason.
 */
export function validateVehicleYear(raw: string | number | null | undefined): YearValidationResult {
  // Blank / null → acceptable (optional field)
  if (raw === null || raw === undefined || raw === "") {
    return { valid: true, year: 0, expanded: false };
  }

  const str = String(raw).trim();
  if (str === "") {
    return { valid: true, year: 0, expanded: false };
  }

  // Must be a whole number (no decimals, no letters)
  if (!/^\d+$/.test(str)) {
    return { valid: false, reason: "Vehicle year must be a whole number (e.g. 2019)." };
  }

  let year = parseInt(str, 10);
  let expanded = false;

  // Auto-expand two-digit years: 00–99 → 2000–2099
  // This handles the common OCR artefact where "2024" is read as "24"
  if (year >= 0 && year <= 99) {
    year = 2000 + year;
    expanded = true;
  }

  const maxYear = vehicleYearMax();

  if (year < VEHICLE_YEAR_MIN) {
    return {
      valid: false,
      reason: `Vehicle year ${year} is too old. Minimum accepted year is ${VEHICLE_YEAR_MIN}.`,
    };
  }

  if (year > maxYear) {
    return {
      valid: false,
      reason: `Vehicle year ${year} is in the future. Maximum accepted year is ${maxYear}.`,
    };
  }

  return { valid: true, year, expanded };
}

/**
 * Convenience predicate — returns true if the year is blank (optional) or valid.
 * Use this for Zod `.refine()` guards.
 */
export function isVehicleYearValid(raw: string | number | null | undefined): boolean {
  const result = validateVehicleYear(raw);
  return result.valid;
}

/**
 * Normalise an OCR-extracted year string for use in the pipeline.
 *
 * Returns:
 *   - The normalised numeric year if valid (with two-digit expansion applied)
 *   - `null` if the value is blank or invalid (pipeline should estimate)
 *
 * Also returns a `warning` string when the value was nulled due to being
 * out of range, so the caller can add a PipelineStageHealth warning entry.
 */
export function normaliseOcrYear(raw: string | number | null | undefined): {
  year: number | null;
  warning: string | null;
  expanded: boolean;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { year: null, warning: null, expanded: false };
  }

  const result = validateVehicleYear(raw);

  if (!result.valid) {
    return {
      year: null,
      warning: `Vehicle year "${raw}" could not be confirmed from documents (${result.reason}). Year will be estimated from registration date or assumed.`,
      expanded: false,
    };
  }

  // year === 0 means blank/optional
  if (result.year === 0) {
    return { year: null, warning: null, expanded: false };
  }

  return {
    year: result.year,
    warning: result.expanded
      ? `Vehicle year was extracted as "${raw}" (two-digit); auto-expanded to ${result.year}.`
      : null,
    expanded: result.expanded,
  };
}
