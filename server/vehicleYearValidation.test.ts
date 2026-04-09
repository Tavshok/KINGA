/**
 * server/vehicleYearValidation.test.ts
 *
 * Unit tests for shared/vehicleYearValidation.ts
 * Covers validateVehicleYear, isVehicleYearValid, and normaliseOcrYear.
 */

import { describe, it, expect } from "vitest";
import {
  validateVehicleYear,
  isVehicleYearValid,
  normaliseOcrYear,
  VEHICLE_YEAR_MIN,
  vehicleYearMax,
} from "../shared/vehicleYearValidation";

const CURRENT_YEAR = new Date().getFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

// ─── validateVehicleYear ──────────────────────────────────────────────────────

describe("validateVehicleYear", () => {
  // Blank / optional
  it("accepts null as valid (optional field)", () => {
    const r = validateVehicleYear(null);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.year).toBe(0);
  });

  it("accepts undefined as valid (optional field)", () => {
    const r = validateVehicleYear(undefined);
    expect(r.valid).toBe(true);
  });

  it("accepts empty string as valid (optional field)", () => {
    const r = validateVehicleYear("");
    expect(r.valid).toBe(true);
  });

  it("accepts whitespace-only string as valid (optional field)", () => {
    const r = validateVehicleYear("   ");
    expect(r.valid).toBe(true);
  });

  // Valid 4-digit years
  it("accepts minimum boundary year (1950)", () => {
    const r = validateVehicleYear(VEHICLE_YEAR_MIN);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.year).toBe(VEHICLE_YEAR_MIN);
  });

  it("accepts current year", () => {
    const r = validateVehicleYear(CURRENT_YEAR);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.year).toBe(CURRENT_YEAR);
  });

  it("accepts current year + 1 (next model year)", () => {
    const r = validateVehicleYear(MAX_YEAR);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.year).toBe(MAX_YEAR);
  });

  it("accepts a typical mid-range year (2019)", () => {
    const r = validateVehicleYear(2019);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.year).toBe(2019);
      expect(r.expanded).toBe(false);
    }
  });

  it("accepts year as numeric string", () => {
    const r = validateVehicleYear("2015");
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.year).toBe(2015);
  });

  // Two-digit auto-expansion
  it("auto-expands two-digit year 24 to 2024", () => {
    const r = validateVehicleYear(24);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.year).toBe(2024);
      expect(r.expanded).toBe(true);
    }
  });

  it("auto-expands two-digit year 0 to 2000", () => {
    const r = validateVehicleYear(0);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.year).toBe(2000);
      expect(r.expanded).toBe(true);
    }
  });

  it("rejects two-digit string '99' because 2099 exceeds MAX_YEAR", () => {
    // 99 expands to 2099 which is beyond current year + 1, so it must be rejected
    const r = validateVehicleYear("99");
    expect(r.valid).toBe(false);
  });

  // Out-of-range
  it("rejects year below minimum (1949)", () => {
    const r = validateVehicleYear(1949);
    expect(r.valid).toBe(false);
  });

  it("rejects year 1900", () => {
    const r = validateVehicleYear(1900);
    expect(r.valid).toBe(false);
  });

  it("rejects year above maximum (current + 2)", () => {
    const r = validateVehicleYear(CURRENT_YEAR + 2);
    expect(r.valid).toBe(false);
  });

  it("rejects year 9999", () => {
    const r = validateVehicleYear(9999);
    expect(r.valid).toBe(false);
  });

  // Non-numeric
  it("rejects 'unknown'", () => {
    const r = validateVehicleYear("unknown");
    expect(r.valid).toBe(false);
  });

  it("rejects 'N/A'", () => {
    const r = validateVehicleYear("N/A");
    expect(r.valid).toBe(false);
  });

  it("rejects alphanumeric '2019a'", () => {
    const r = validateVehicleYear("2019a");
    expect(r.valid).toBe(false);
  });

  it("rejects decimal '2019.5'", () => {
    const r = validateVehicleYear("2019.5");
    expect(r.valid).toBe(false);
  });

  it("rejects negative number -1", () => {
    const r = validateVehicleYear(-1);
    expect(r.valid).toBe(false);
  });
});

// ─── isVehicleYearValid ───────────────────────────────────────────────────────

describe("isVehicleYearValid", () => {
  it("returns true for blank (optional)", () => {
    expect(isVehicleYearValid(null)).toBe(true);
    expect(isVehicleYearValid("")).toBe(true);
  });

  it("returns true for valid year", () => {
    expect(isVehicleYearValid(2020)).toBe(true);
  });

  it("returns false for year below minimum", () => {
    expect(isVehicleYearValid(1900)).toBe(false);
  });

  it("returns false for non-numeric string", () => {
    expect(isVehicleYearValid("TBD")).toBe(false);
  });
});

// ─── normaliseOcrYear ─────────────────────────────────────────────────────────

describe("normaliseOcrYear", () => {
  it("returns null for blank input", () => {
    const r = normaliseOcrYear(null);
    expect(r.year).toBeNull();
    expect(r.warning).toBeNull();
    expect(r.expanded).toBe(false);
  });

  it("returns valid year unchanged", () => {
    const r = normaliseOcrYear(2018);
    expect(r.year).toBe(2018);
    expect(r.warning).toBeNull();
    expect(r.expanded).toBe(false);
  });

  it("auto-expands two-digit year and sets warning", () => {
    const r = normaliseOcrYear(23);
    expect(r.year).toBe(2023);
    expect(r.expanded).toBe(true);
    expect(r.warning).not.toBeNull();
    expect(r.warning).toContain("2023");
  });

  it("nulls out-of-range year and sets warning", () => {
    const r = normaliseOcrYear(1920);
    expect(r.year).toBeNull();
    expect(r.warning).not.toBeNull();
    expect(r.warning).toContain("1920");
  });

  it("nulls future year and sets warning", () => {
    const r = normaliseOcrYear(CURRENT_YEAR + 5);
    expect(r.year).toBeNull();
    expect(r.warning).not.toBeNull();
  });

  it("nulls non-numeric OCR artefact and sets warning", () => {
    const r = normaliseOcrYear("20l9"); // OCR misread '1' as 'l'
    expect(r.year).toBeNull();
    expect(r.warning).not.toBeNull();
  });

  it("returns null for string 'unknown' with warning", () => {
    const r = normaliseOcrYear("unknown");
    expect(r.year).toBeNull();
    expect(r.warning).not.toBeNull();
  });

  it("handles year at exact minimum boundary", () => {
    const r = normaliseOcrYear(VEHICLE_YEAR_MIN);
    expect(r.year).toBe(VEHICLE_YEAR_MIN);
    expect(r.warning).toBeNull();
  });

  it("handles year at exact maximum boundary (current + 1)", () => {
    const r = normaliseOcrYear(MAX_YEAR);
    expect(r.year).toBe(MAX_YEAR);
    expect(r.warning).toBeNull();
  });
});
