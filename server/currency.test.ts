/**
 * Multi-Currency Support Tests
 *
 * Validates the shared currency formatting utilities introduced for the
 * Zimbabwe deployment (primary currency: USD, secondary: ZIG).
 *
 * Requirements covered:
 *   - USD  → "US$" symbol
 *   - ZIG  → "ZIG" symbol
 *   - ZAR  → "R" symbol
 *   - Others → Intl narrow symbol or code fallback
 *   - formatCurrency: cents → formatted string
 *   - formatCurrencyByCode: code-based formatting
 *   - compact notation (K / M)
 *   - null / undefined / NaN safety
 */

import { describe, it, expect } from "vitest";
import {
  getCurrencySymbolForCode,
  formatCurrency,
  formatCurrencyByCode,
  formatCurrencyRaw,
  formatCurrencyRawByCode,
} from "../shared/currency";

// ─── getCurrencySymbolForCode ─────────────────────────────────────────────────

describe("getCurrencySymbolForCode", () => {
  it("returns 'US$' for USD", () => {
    expect(getCurrencySymbolForCode("USD")).toBe("US$");
  });

  it("returns 'US$' for lowercase 'usd'", () => {
    expect(getCurrencySymbolForCode("usd")).toBe("US$");
  });

  it("returns 'ZIG' for ZIG", () => {
    expect(getCurrencySymbolForCode("ZIG")).toBe("ZIG");
  });

  it("returns 'R' for ZAR", () => {
    expect(getCurrencySymbolForCode("ZAR")).toBe("R");
  });

  it("falls back to 'USD' symbol when code is null", () => {
    expect(getCurrencySymbolForCode(null)).toBe("US$");
  });

  it("falls back to 'USD' symbol when code is undefined", () => {
    expect(getCurrencySymbolForCode(undefined)).toBe("US$");
  });

  it("returns the code itself for an unrecognised currency", () => {
    // 'XYZ' is not a valid ISO 4217 code — should return 'XYZ'
    expect(getCurrencySymbolForCode("XYZ")).toBe("XYZ");
  });
});

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats USD cents correctly", () => {
    expect(formatCurrency(150000, "US$")).toBe("US$1,500.00");
  });

  it("formats ZIG cents correctly", () => {
    expect(formatCurrency(250000, "ZIG")).toBe("ZIG2,500.00");
  });

  it("formats ZAR cents correctly", () => {
    expect(formatCurrency(309680, "R")).toBe("R3,096.80");
  });

  it("handles zero correctly", () => {
    expect(formatCurrency(0, "US$")).toBe("US$0.00");
  });

  it("handles null safely", () => {
    expect(formatCurrency(null, "US$")).toBe("US$0.00");
  });

  it("handles undefined safely", () => {
    expect(formatCurrency(undefined, "US$")).toBe("US$0.00");
  });

  it("handles NaN safely", () => {
    expect(formatCurrency(NaN, "US$")).toBe("US$0.00");
  });

  it("defaults to 'US$' symbol when no symbol provided", () => {
    expect(formatCurrency(100000)).toBe("US$1,000.00");
  });

  it("respects custom decimals option", () => {
    expect(formatCurrency(100000, "US$", { decimals: 0 })).toBe("US$1,000");
  });

  it("uses compact K notation for values >= 1,000", () => {
    expect(formatCurrency(1500000, "US$", { compact: true })).toBe("US$15.0K");
  });

  it("uses compact M notation for values >= 1,000,000", () => {
    expect(formatCurrency(150000000, "US$", { compact: true })).toBe("US$1.5M");
  });

  it("does not use compact notation below 1,000 even with compact:true", () => {
    expect(formatCurrency(50000, "US$", { compact: true })).toBe("US$500.00");
  });
});

// ─── formatCurrencyByCode ─────────────────────────────────────────────────────

describe("formatCurrencyByCode", () => {
  it("formats USD by code", () => {
    expect(formatCurrencyByCode(150000, "USD")).toBe("US$1,500.00");
  });

  it("formats ZIG by code", () => {
    expect(formatCurrencyByCode(250000, "ZIG")).toBe("ZIG2,500.00");
  });

  it("formats ZAR by code", () => {
    expect(formatCurrencyByCode(309680, "ZAR")).toBe("R3,096.80");
  });

  it("falls back to USD when code is null", () => {
    expect(formatCurrencyByCode(100000, null)).toBe("US$1,000.00");
  });

  it("falls back to USD when code is undefined", () => {
    expect(formatCurrencyByCode(100000, undefined)).toBe("US$1,000.00");
  });
});

// ─── formatCurrencyRaw ────────────────────────────────────────────────────────

describe("formatCurrencyRaw", () => {
  it("formats a raw decimal value (already in major units)", () => {
    expect(formatCurrencyRaw(1500.0, "US$")).toBe("US$1,500.00");
  });

  it("handles null safely", () => {
    expect(formatCurrencyRaw(null, "US$")).toBe("US$0.00");
  });
});

// ─── formatCurrencyRawByCode ──────────────────────────────────────────────────

describe("formatCurrencyRawByCode", () => {
  it("formats a raw decimal value using a currency code", () => {
    expect(formatCurrencyRawByCode(3096.8, "ZAR")).toBe("R3,096.80");
  });

  it("falls back to USD when code is null", () => {
    expect(formatCurrencyRawByCode(1000, null)).toBe("US$1,000.00");
  });
});

// ─── Zimbabwe deployment smoke test ──────────────────────────────────────────

describe("Zimbabwe deployment smoke test", () => {
  it("correctly formats a USD claim cost (R3,096.80 legacy → US$30.97 if stored as cents)", () => {
    // Claim 1080068: estimatedCost = 309680 cents → US$3,096.80
    expect(formatCurrencyByCode(309680, "USD")).toBe("US$3,096.80");
  });

  it("correctly formats a ZIG amount", () => {
    expect(formatCurrencyByCode(500000, "ZIG")).toBe("ZIG5,000.00");
  });

  it("getCurrencySymbolForCode('USD') returns 'US$' not '$'", () => {
    // Requirement: USD → "US$" (not bare "$")
    expect(getCurrencySymbolForCode("USD")).not.toBe("$");
    expect(getCurrencySymbolForCode("USD")).toBe("US$");
  });
});
