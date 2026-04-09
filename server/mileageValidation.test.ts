/**
 * Unit tests for the shared mileage validation utility.
 *
 * These tests cover the full contract of validateMileageInput:
 *   - Empty / null / undefined → ok, value: null
 *   - Numeric strings (plain, comma-separated, space-separated) → ok, parsed value
 *   - Sentinel free-text values → not ok
 *   - Non-numeric strings → not ok
 *   - Zero / negative → not ok
 *   - Implausibly large values → not ok
 *   - Boundary values → ok
 */

import { describe, it, expect } from "vitest";
import { validateMileageInput, isMileageValid } from "../shared/mileageValidation";

describe("validateMileageInput", () => {
  // ── Blank / absent ──────────────────────────────────────────────────────────
  it("returns ok with null for empty string", () => {
    const result = validateMileageInput("");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("returns ok with null for null", () => {
    const result = validateMileageInput(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("returns ok with null for undefined", () => {
    const result = validateMileageInput(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("returns ok with null for whitespace-only string", () => {
    const result = validateMileageInput("   ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  // ── Valid numeric inputs ────────────────────────────────────────────────────
  it("parses a plain integer string", () => {
    const result = validateMileageInput("85000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(85000);
  });

  it("parses a comma-separated number (85,000)", () => {
    const result = validateMileageInput("85,000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(85000);
  });

  it("parses a space-separated number (85 000)", () => {
    const result = validateMileageInput("85 000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(85000);
  });

  it("parses a number with leading/trailing whitespace", () => {
    const result = validateMileageInput("  120000  ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(120000);
  });

  it("accepts the boundary value of 1 km", () => {
    const result = validateMileageInput("1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1);
  });

  it("accepts the boundary value of 2,000,000 km", () => {
    const result = validateMileageInput("2000000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(2_000_000);
  });

  // ── Sentinel free-text values ───────────────────────────────────────────────
  it("rejects 'unknown' (case-insensitive)", () => {
    expect(validateMileageInput("unknown").ok).toBe(false);
    expect(validateMileageInput("Unknown").ok).toBe(false);
    expect(validateMileageInput("UNKNOWN").ok).toBe(false);
  });

  it("rejects 'N/A' (case-insensitive)", () => {
    expect(validateMileageInput("N/A").ok).toBe(false);
    expect(validateMileageInput("n/a").ok).toBe(false);
    expect(validateMileageInput("NA").ok).toBe(false);
  });

  it("rejects 'TBD'", () => {
    expect(validateMileageInput("TBD").ok).toBe(false);
    expect(validateMileageInput("tbd").ok).toBe(false);
  });

  it("rejects 'nil'", () => {
    expect(validateMileageInput("nil").ok).toBe(false);
  });

  it("rejects 'none'", () => {
    expect(validateMileageInput("none").ok).toBe(false);
  });

  it("rejects 'not available'", () => {
    expect(validateMileageInput("not available").ok).toBe(false);
  });

  it("rejects 'not known'", () => {
    expect(validateMileageInput("not known").ok).toBe(false);
  });

  it("rejects a bare hyphen '-'", () => {
    expect(validateMileageInput("-").ok).toBe(false);
  });

  // ── Non-numeric strings ─────────────────────────────────────────────────────
  it("rejects a string with letters mixed in (85000km)", () => {
    expect(validateMileageInput("85000km").ok).toBe(false);
  });

  it("rejects a string with letters mixed in (approx 85000)", () => {
    expect(validateMileageInput("approx 85000").ok).toBe(false);
  });

  it("rejects a decimal number (85000.5)", () => {
    // Decimals contain a '.' which is not a digit, comma, or space
    expect(validateMileageInput("85000.5").ok).toBe(false);
  });

  // ── Out-of-range values ─────────────────────────────────────────────────────
  it("rejects zero", () => {
    expect(validateMileageInput("0").ok).toBe(false);
  });

  it("rejects a value over 2,000,000 km", () => {
    expect(validateMileageInput("2000001").ok).toBe(false);
    expect(validateMileageInput("9999999").ok).toBe(false);
  });
});

describe("isMileageValid (boolean helper)", () => {
  it("returns true for valid numeric input", () => {
    expect(isMileageValid("85000")).toBe(true);
  });

  it("returns true for blank input", () => {
    expect(isMileageValid("")).toBe(true);
    expect(isMileageValid(null)).toBe(true);
  });

  it("returns false for 'unknown'", () => {
    expect(isMileageValid("unknown")).toBe(false);
  });

  it("returns false for non-numeric string", () => {
    expect(isMileageValid("85000km")).toBe(false);
  });
});
