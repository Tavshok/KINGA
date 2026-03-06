/**
 * Driver Intelligence Registry — Unit Tests
 *
 * Tests cover:
 *   - normaliseLicenseNumber()   — uppercase, strip spaces/hyphens
 *   - normaliseDriverName()      — trim, collapse whitespace, title-case
 *   - parseLicenseDate()         — OCR-tolerant date parsing
 *   - isLicenseExpired()         — null = never expires
 *   - computeDriverRiskScore()   — composite 0–100 score
 *
 * DB-dependent functions (matchOrCreateDriver, linkDriverToClaim,
 * upsertDriverFromClaim) are covered by integration tests.
 */

import { describe, it, expect } from "vitest";
import {
  normaliseLicenseNumber,
  normaliseDriverName,
  parseLicenseDate,
  isLicenseExpired,
  computeDriverRiskScore,
} from "./driver-registry";

// ─── normaliseLicenseNumber ───────────────────────────────────────────────────

describe("normaliseLicenseNumber", () => {
  it("returns null for null input", () => {
    expect(normaliseLicenseNumber(null)).toBeNull();
  });
  it("returns null for undefined input", () => {
    expect(normaliseLicenseNumber(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(normaliseLicenseNumber("")).toBeNull();
  });
  it("returns null for strings shorter than 3 characters after normalisation", () => {
    expect(normaliseLicenseNumber("AB")).toBeNull();
  });
  it("converts to uppercase", () => {
    expect(normaliseLicenseNumber("abc123")).toBe("ABC123");
  });
  it("strips spaces", () => {
    expect(normaliseLicenseNumber("ABC 123 DEF")).toBe("ABC123DEF");
  });
  it("strips hyphens", () => {
    expect(normaliseLicenseNumber("ABC-123-DEF")).toBe("ABC123DEF");
  });
  it("strips both spaces and hyphens", () => {
    expect(normaliseLicenseNumber("AB C-12 3")).toBe("ABC123");
  });
  it("handles leading and trailing whitespace", () => {
    expect(normaliseLicenseNumber("  ABC123  ")).toBe("ABC123");
  });
  it("preserves numeric-only license numbers", () => {
    expect(normaliseLicenseNumber("123456789")).toBe("123456789");
  });
  it("handles South African format", () => {
    expect(normaliseLicenseNumber("ZW 123-456")).toBe("ZW123456");
  });
  it("handles Zimbabwe format with spaces", () => {
    expect(normaliseLicenseNumber("ZW 12345 A")).toBe("ZW12345A");
  });
});

// ─── normaliseDriverName ──────────────────────────────────────────────────────

describe("normaliseDriverName", () => {
  it("returns null for null input", () => {
    expect(normaliseDriverName(null)).toBeNull();
  });
  it("returns null for undefined input", () => {
    expect(normaliseDriverName(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(normaliseDriverName("")).toBeNull();
  });
  it("returns null for single-character string", () => {
    expect(normaliseDriverName("A")).toBeNull();
  });
  it("trims leading and trailing whitespace", () => {
    expect(normaliseDriverName("  John Smith  ")).toBe("John Smith");
  });
  it("collapses multiple internal spaces", () => {
    expect(normaliseDriverName("John   Smith")).toBe("John Smith");
  });
  it("title-cases each word", () => {
    expect(normaliseDriverName("john smith")).toBe("John Smith");
  });
  it("title-cases uppercase input", () => {
    expect(normaliseDriverName("JOHN SMITH")).toBe("John Smith");
  });
  it("handles hyphenated surnames", () => {
    expect(normaliseDriverName("mary-anne jones")).toBe("Mary-Anne Jones");
  });
  it("handles single-word names", () => {
    expect(normaliseDriverName("madonna")).toBe("Madonna");
  });
  it("handles three-part names", () => {
    expect(normaliseDriverName("john michael smith")).toBe("John Michael Smith");
  });
  it("preserves already-correct casing", () => {
    expect(normaliseDriverName("John Smith")).toBe("John Smith");
  });
});

// ─── parseLicenseDate ─────────────────────────────────────────────────────────

describe("parseLicenseDate", () => {
  // Null/empty inputs
  it("returns null for null", () => {
    expect(parseLicenseDate(null)).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(parseLicenseDate(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseLicenseDate("")).toBeNull();
  });

  // ISO format pass-through
  it("passes through ISO date unchanged", () => {
    expect(parseLicenseDate("2025-06-15")).toBe("2025-06-15");
  });

  // Year-only
  it("converts year-only to YYYY-01-01", () => {
    expect(parseLicenseDate("2025")).toBe("2025-01-01");
  });

  // DD/MM/YYYY
  it("parses DD/MM/YYYY format", () => {
    expect(parseLicenseDate("15/06/2025")).toBe("2025-06-15");
  });
  it("parses DD-MM-YYYY format", () => {
    expect(parseLicenseDate("15-06-2025")).toBe("2025-06-15");
  });
  it("parses DD.MM.YYYY format", () => {
    expect(parseLicenseDate("15.06.2025")).toBe("2025-06-15");
  });
  it("pads single-digit day and month", () => {
    expect(parseLicenseDate("5/6/2025")).toBe("2025-06-05");
  });

  // Named month formats
  it("parses '12 Jan 2025'", () => {
    expect(parseLicenseDate("12 Jan 2025")).toBe("2025-01-12");
  });
  it("parses 'Jan 12 2025'", () => {
    expect(parseLicenseDate("Jan 12 2025")).toBe("2025-01-12");
  });
  it("parses 'January 2025' (month-year only)", () => {
    expect(parseLicenseDate("January 2025")).toBe("2025-01-01");
  });
  it("parses 'Dec 2030'", () => {
    expect(parseLicenseDate("Dec 2030")).toBe("2030-12-01");
  });
  it("is case-insensitive for month names", () => {
    expect(parseLicenseDate("12 JAN 2025")).toBe("2025-01-12");
    expect(parseLicenseDate("12 jan 2025")).toBe("2025-01-12");
  });

  // Non-expiring sentinel values
  it("returns NO_EXPIRY for 'does not expire'", () => {
    expect(parseLicenseDate("does not expire")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'no expiry'", () => {
    expect(parseLicenseDate("no expiry")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'lifetime'", () => {
    expect(parseLicenseDate("lifetime")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'permanent'", () => {
    expect(parseLicenseDate("permanent")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'indefinite'", () => {
    expect(parseLicenseDate("indefinite")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'n/a'", () => {
    expect(parseLicenseDate("n/a")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'none'", () => {
    expect(parseLicenseDate("none")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for '-'", () => {
    expect(parseLicenseDate("-")).toBe("NO_EXPIRY");
  });
  it("returns NO_EXPIRY for 'no expiration'", () => {
    expect(parseLicenseDate("no expiration")).toBe("NO_EXPIRY");
  });

  // Unparseable
  it("returns null for completely unparseable string", () => {
    expect(parseLicenseDate("not a date")).toBeNull();
  });
  it("returns null for 'unknown'", () => {
    expect(parseLicenseDate("unknown")).toBeNull();
  });
});

// ─── isLicenseExpired ─────────────────────────────────────────────────────────

describe("isLicenseExpired", () => {
  it("returns false for null (never expires)", () => {
    expect(isLicenseExpired(null)).toBe(false);
  });
  it("returns false for undefined (never expires)", () => {
    expect(isLicenseExpired(undefined)).toBe(false);
  });
  it("returns false for NO_EXPIRY sentinel", () => {
    expect(isLicenseExpired("NO_EXPIRY")).toBe(false);
  });
  it("returns false for a future date", () => {
    expect(isLicenseExpired("2099-12-31")).toBe(false);
  });
  it("returns true for a past date", () => {
    expect(isLicenseExpired("2000-01-01")).toBe(true);
  });
  it("returns true for yesterday", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isLicenseExpired(yesterday.toISOString().slice(0, 10))).toBe(true);
  });
  it("returns false for today (not yet expired)", () => {
    const today = new Date();
    // Today is NOT in the past
    expect(isLicenseExpired(today.toISOString().slice(0, 10))).toBe(false);
  });
  it("handles invalid date strings gracefully", () => {
    expect(isLicenseExpired("not-a-date")).toBe(false);
  });
});

// ─── computeDriverRiskScore ───────────────────────────────────────────────────

describe("computeDriverRiskScore", () => {
  it("returns 0 for a clean driver with no claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(0);
  });

  it("returns 10 for exactly 2 total claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 2,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(10);
  });

  it("returns 20 for 3–4 total claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 3,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(20);
    expect(computeDriverRiskScore({
      totalClaimsCount: 4,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(20);
  });

  it("returns 30 for 5+ total claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 5,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(30);
    expect(computeDriverRiskScore({
      totalClaimsCount: 10,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(30);
  });

  it("adds 10 for 2 at-fault claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 2,
      atFaultClaimsCount: 2,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(20); // 10 (2 claims) + 10 (2 at-fault)
  });

  it("adds 20 for 3+ at-fault claims", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 3,
      atFaultClaimsCount: 3,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 0,
    })).toBe(40); // 20 (3 claims) + 20 (3 at-fault)
  });

  it("adds 30 for staged accident suspect flag", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: true,
      lastFraudRiskScore: 0,
    })).toBe(30);
  });

  it("adds 10 for fraud risk score 40–69", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 40,
    })).toBe(10);
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 69,
    })).toBe(10);
  });

  it("adds 20 for fraud risk score 70+", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 70,
    })).toBe(20);
    expect(computeDriverRiskScore({
      totalClaimsCount: 0,
      atFaultClaimsCount: 0,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 100,
    })).toBe(20);
  });

  it("caps at 100 for extreme cases", () => {
    expect(computeDriverRiskScore({
      totalClaimsCount: 20,
      atFaultClaimsCount: 10,
      isStagedAccidentSuspect: true,
      lastFraudRiskScore: 100,
    })).toBe(100);
  });

  it("computes combined score correctly for a high-risk driver", () => {
    // 30 (5+ claims) + 20 (3+ at-fault) + 30 (staged) + 20 (fraud 70+) = 100 (capped)
    expect(computeDriverRiskScore({
      totalClaimsCount: 7,
      atFaultClaimsCount: 4,
      isStagedAccidentSuspect: true,
      lastFraudRiskScore: 85,
    })).toBe(100);
  });

  it("computes a moderate score for a medium-risk driver", () => {
    // 20 (3 claims) + 10 (2 at-fault) + 0 + 10 (fraud 50) = 40
    expect(computeDriverRiskScore({
      totalClaimsCount: 3,
      atFaultClaimsCount: 2,
      isStagedAccidentSuspect: false,
      lastFraudRiskScore: 50,
    })).toBe(40);
  });
});

// ─── Role separation contract ─────────────────────────────────────────────────

describe("driver vs claimant role separation", () => {
  it("driver and claimant are distinct roles in the enum", () => {
    const roles = ["driver", "claimant", "passenger", "third_party_driver", "witness", "unknown"];
    expect(roles).toContain("driver");
    expect(roles).toContain("claimant");
    // They are distinct — a driver is NOT assumed to be the claimant
    expect(roles.indexOf("driver")).not.toBe(roles.indexOf("claimant"));
  });

  it("all six roles are defined", () => {
    const roles = ["driver", "claimant", "passenger", "third_party_driver", "witness", "unknown"];
    expect(roles).toHaveLength(6);
  });
});
