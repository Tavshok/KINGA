/**
 * Shared Mileage Validation Utility
 *
 * Used by both the intake form (client-side) and the tRPC procedure (server-side)
 * to enforce a consistent rule: vehicleMileage must be a positive integer in km,
 * with no free-text values such as "unknown", "N/A", or "TBD".
 *
 * Rules:
 *  - Empty string / null / undefined → allowed (field is optional)
 *  - Purely numeric string (after stripping whitespace and optional commas) → allowed
 *  - Any non-numeric characters beyond commas and whitespace → rejected
 *  - Zero or negative → rejected
 *  - Greater than 2,000,000 km → rejected (implausible odometer)
 *
 * The function returns a typed result so callers can surface the exact reason.
 */

export type MileageValidationResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: string };

/** Sentinel strings that users commonly type when mileage is unknown */
const REJECT_PATTERNS = [
  /^unknown$/i,
  /^n\/?a$/i,
  /^tbd$/i,
  /^nil$/i,
  /^none$/i,
  /^-$/,
  /^not\s+available$/i,
  /^not\s+known$/i,
];

/**
 * Validate and parse a raw mileage string from the intake form.
 *
 * @param raw - The raw string value from the form field (may be empty).
 * @returns `{ ok: true, value: number | null }` on success,
 *          `{ ok: false, reason: string }` on failure.
 */
export function validateMileageInput(raw: string | null | undefined): MileageValidationResult {
  // Empty / absent → field is optional, treat as "not provided"
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: null };
  }

  const trimmed = raw.trim();

  // Reject known free-text sentinel values
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason: `"${trimmed}" is not a valid odometer reading. Please enter a number (e.g. 85000) or leave blank.`,
      };
    }
  }

  // Strip commas and spaces used as thousands separators (e.g. "85,000" or "85 000")
  const stripped = trimmed.replace(/[\s,]/g, "");

  // Must be entirely numeric at this point
  if (!/^\d+$/.test(stripped)) {
    return {
      ok: false,
      reason: "Odometer reading must be a number in km (e.g. 85000). Remove any letters or special characters.",
    };
  }

  const n = parseInt(stripped, 10);

  if (n <= 0) {
    return { ok: false, reason: "Odometer reading must be greater than 0 km." };
  }

  if (n > 2_000_000) {
    return {
      ok: false,
      reason: `${n.toLocaleString()} km exceeds the maximum plausible odometer reading (2,000,000 km). Please check the value.`,
    };
  }

  return { ok: true, value: n };
}

/**
 * Zod-compatible refinement for use in tRPC input schemas.
 *
 * Usage:
 *   vehicleMileage: z.string().optional().nullable()
 *     .refine(v => validateMileageInput(v).ok, {
 *       message: "Invalid mileage value — must be a positive integer in km or left blank.",
 *     })
 *
 * Or use `zodMileageSchema` directly (see below).
 */
export function isMileageValid(raw: string | null | undefined): boolean {
  return validateMileageInput(raw).ok;
}
