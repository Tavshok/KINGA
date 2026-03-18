import { describe, it, expect } from "vitest";
import { extractCosts } from "./cost-extraction-engine";

describe("CostExtractionEngine — no empty fields guarantee", () => {
  it("always returns all required fields even with no data", () => {
    const result = extractCosts({
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "minor",
      extractionConfidence: 0,
      quotedAmounts: [],
    });
    expect(result.ai_estimate).toBeGreaterThan(0);
    expect(result.parts).toBeGreaterThan(0);
    expect(result.labour).toBeGreaterThan(0);
    expect(result.fair_range.min).toBeGreaterThan(0);
    expect(result.fair_range.max).toBeGreaterThan(result.fair_range.min);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.itemised_parts.length).toBeGreaterThan(0);
    expect(result.source).toBeTruthy();
    expect(result.basis).toBeTruthy();
  });

  it("uses full AI extraction when all values present", () => {
    const result = extractCosts({
      aiEstimatedCost: 920,
      aiPartsCost: 620,
      aiLabourCost: 300,
      damageComponents: ["Front Bumper", "Grill", "Nudge Bar", "Reflectors"],
      accidentSeverity: "minor",
      extractionConfidence: 91,
      quotedAmounts: [],
    });
    expect(result.source).toBe("extracted");
    expect(result.ai_estimate).toBe(920);
    expect(result.parts).toBe(620);
    expect(result.labour).toBe(300);
    expect(result.confidence).toBe(91);
    expect(result.itemised_parts.length).toBe(4);
    // Fair range ±15% at 91% confidence
    expect(result.fair_range.min).toBeLessThan(920);
    expect(result.fair_range.max).toBeGreaterThan(920);
  });

  it("estimates parts/labour split when only total is available", () => {
    const result = extractCosts({
      aiEstimatedCost: 5000,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: ["door", "rear bumper"],
      accidentSeverity: "moderate",
      extractionConfidence: 75,
      quotedAmounts: [],
    });
    expect(result.source).toBe("estimated");
    expect(result.ai_estimate).toBe(5000);
    expect(result.parts).toBeGreaterThan(0);
    expect(result.labour).toBeGreaterThan(0);
    expect(result.parts + result.labour).toBe(5000);
    expect(result.itemised_parts.length).toBe(2);
  });

  it("uses component-based estimation when no AI cost available", () => {
    const result = extractCosts({
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: ["windshield", "hood"],
      accidentSeverity: "moderate",
      extractionConfidence: 60,
      quotedAmounts: [],
    });
    expect(result.source).toBe("estimated");
    expect(result.ai_estimate).toBeGreaterThan(0);
    expect(result.parts).toBeGreaterThan(0);
    expect(result.labour).toBeGreaterThan(0);
    expect(result.itemised_parts.length).toBe(2);
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.confidence).toBeLessThanOrEqual(65);
  });

  it("uses severity fallback when no components or AI cost", () => {
    const result = extractCosts({
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "severe",
      extractionConfidence: 0,
      quotedAmounts: [],
    });
    expect(result.source).toBe("severity_fallback");
    expect(result.ai_estimate).toBeGreaterThan(0);
    expect(result.confidence).toBe(30);
    expect(result.itemised_parts.length).toBe(1);
    // Severe range: min=8000, max=35000
    expect(result.fair_range.min).toBeGreaterThanOrEqual(8000);
    expect(result.fair_range.max).toBeLessThanOrEqual(35000);
  });

  it("uses ±25% fair range when confidence is low (Case 2: AI total only)", () => {
    const result = extractCosts({
      aiEstimatedCost: 1000,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "minor",
      extractionConfidence: 50,
      quotedAmounts: [],
    });
    // Case 2: AI total available, no parts/labour split
    // confidence = min(80, 50-10) = 40 → spread = 0.25 → min=750, max=1250
    expect(result.source).toBe("estimated");
    expect(result.fair_range.min).toBe(750);  // 1000 * 0.75
    expect(result.fair_range.max).toBe(1250); // 1000 * 1.25
  });

  it("uses ±15% fair range when confidence is high", () => {
    const result = extractCosts({
      aiEstimatedCost: 1000,
      aiPartsCost: 600,
      aiLabourCost: 400,
      damageComponents: [],
      accidentSeverity: "minor",
      extractionConfidence: 90,
      quotedAmounts: [],
    });
    // High confidence → ±15%
    expect(result.fair_range.min).toBe(850);
    expect(result.fair_range.max).toBe(1150);
  });
});
