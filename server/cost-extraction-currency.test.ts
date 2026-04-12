/**
 * cost-extraction-currency.test.ts
 *
 * Tests for currency-aware cost extraction engine.
 * Verifies that:
 * 1. currencyCode is passed through and used in basis strings
 * 2. Currency symbols are correctly mapped (USD=$, ZAR=R, ZIG=ZiG, ZMW=ZMW)
 * 3. No hardcoded '$' appears in output when non-USD currency is used
 * 4. Defaults to USD when currencyCode is not provided
 */

import { describe, it, expect } from "vitest";
import { extractCosts, type CostExtractionInput } from "./cost-extraction-engine";

const baseInput: CostExtractionInput = {
  aiEstimatedCost: 5000,
  aiPartsCost: 3000,
  aiLabourCost: 2000,
  damageComponents: ["bonnet", "front bumper", "radiator"],
  accidentSeverity: "moderate",
  extractionConfidence: 75,
  quotedAmounts: [],
};

describe("extractCosts — currency awareness", () => {
  it("defaults to USD when currencyCode is not provided", () => {
    const result = extractCosts(baseInput);
    expect(result.basis).toContain("USD");
    expect(result.ai_estimate).toBe(5000);
  });

  it("uses USD symbol in basis when currencyCode is USD", () => {
    const result = extractCosts({ ...baseInput, currencyCode: "USD" });
    expect(result.basis).toContain("USD");
    expect(result.source).toBe("extracted");
  });

  it("uses ZAR code in basis when currencyCode is ZAR", () => {
    const result = extractCosts({ ...baseInput, currencyCode: "ZAR" });
    expect(result.basis).toContain("ZAR");
    // Should NOT contain '$' in basis
    expect(result.basis).not.toContain("$");
  });

  it("uses ZIG code in basis when currencyCode is ZIG", () => {
    const result = extractCosts({ ...baseInput, currencyCode: "ZIG" });
    expect(result.basis).toContain("ZIG");
    expect(result.basis).not.toContain("$");
  });

  it("uses ZMW code in basis when currencyCode is ZMW", () => {
    const result = extractCosts({ ...baseInput, currencyCode: "ZMW" });
    expect(result.basis).toContain("ZMW");
    expect(result.basis).not.toContain("$");
  });

  it("includes learning benchmark with correct currency in basis", () => {
    const result = extractCosts({
      ...baseInput,
      currencyCode: "ZIG",
      learningBenchmark: {
        vehicleDescriptor: "mazda bt-50",
        componentCount: 3,
        collisionDirection: "front",
        marketRegion: "ZIG",
        avgCostUsd: 4500,
        sampleSize: 5,
      },
    });
    expect(result.basis).toContain("ZIG");
    expect(result.basis).toContain("4500");
    expect(result.basis).not.toContain("$4500");
    expect(result.source).toBe("learning_db");
  });

  it("uses quote line items with correct currency label", () => {
    const result = extractCosts({
      ...baseInput,
      currencyCode: "ZMW",
      quoteLineItems: [
        { description: "Bonnet replacement", category: "parts", quantity: 1, unitPrice: 2500, lineTotal: 2500 },
        { description: "Paint and refinish", category: "paint", quantity: 1, unitPrice: 800, lineTotal: 800 },
      ],
    });
    expect(result.source).toBe("quote_line_items");
    expect(result.basis).toContain("ZMW");
    expect(result.ai_estimate).toBe(3300); // 2500 + 800
    expect(result.parts).toBe(2500);
    expect(result.labour).toBe(800);
  });

  it("uses quote total with correct currency when no line items", () => {
    const result = extractCosts({
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "minor",
      extractionConfidence: 0,
      quotedAmounts: [6000],
      currencyCode: "ZAR",
    });
    expect(result.source).toBe("quote_line_items");
    expect(result.basis).toContain("ZAR");
    expect(result.basis).not.toContain("$6000");
    expect(result.ai_estimate).toBe(6000);
  });

  it("returns insufficient_data when no data and no currency", () => {
    const result = extractCosts({
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "minor",
      extractionConfidence: 0,
      quotedAmounts: [],
    });
    expect(result.source).toBe("insufficient_data");
    expect(result.ai_estimate).toBe(0);
  });

  it("fair range is computed correctly for quote line items", () => {
    const result = extractCosts({
      ...baseInput,
      currencyCode: "USD",
      quoteLineItems: [
        { description: "Repair", category: "parts", quantity: 1, unitPrice: 1000, lineTotal: 1000 },
      ],
    });
    // High confidence (95+), so ±15%
    expect(result.fair_range.min).toBe(Math.round(1000 * 0.85));
    expect(result.fair_range.max).toBe(Math.round(1000 * 1.15));
  });
});

describe("extractCosts — learning benchmark segregation", () => {
  it("uses marketRegion from learningBenchmark (should match currency)", () => {
    const result = extractCosts({
      ...baseInput,
      currencyCode: "ZIG",
      learningBenchmark: {
        vehicleDescriptor: "mazda bt-50",
        componentCount: 3,
        collisionDirection: "front",
        marketRegion: "ZIG", // Should match currencyCode
        avgCostUsd: 3200,
        sampleSize: 8,
      },
    });
    expect(result.source).toBe("learning_db");
    // Benchmark note should reference the learning data
    expect(result.basis).toContain("3200");
    expect(result.basis).toContain("8 claims");
  });

  it("falls back to extracted when learning benchmark has insufficient samples", () => {
    const result = extractCosts({
      ...baseInput,
      currencyCode: "USD",
      learningBenchmark: {
        vehicleDescriptor: "mazda bt-50",
        componentCount: 3,
        collisionDirection: "front",
        marketRegion: "USD",
        avgCostUsd: 3200,
        sampleSize: 2, // Below threshold of 3
      },
    });
    // sampleSize < 3 means benchmark is not used
    expect(result.source).toBe("extracted");
    expect(result.itemised_parts[0].source).toBe("insufficient_data");
  });
});
