/**
 * Tests for the enforcement layer fixes:
 * 1. Cost extraction engine — no hardcoded costs, uses quote line items and learning DB
 * 2. Phase 1 data integrity — SA terminology preserved (en-ZA locale)
 * 3. Weighted fraud scoring — full_contributions returned for report display
 */

import { describe, it, expect } from "vitest";
import { extractCosts } from "./cost-extraction-engine";
import type { CostExtractionInput, QuoteLineItemInput, LearningBenchmarkInput } from "./cost-extraction-engine";

// ─── Cost Extraction Engine Tests ──────────────────────────────────────────────

describe("Cost Extraction Engine v2", () => {
  const baseDamageComponents = ["Front bumper", "Bonnet", "Left headlight"];

  it("CASE 1: uses actual quote line items when available", () => {
    const lineItems: QuoteLineItemInput[] = [
      { description: "Front bumper cover", category: "parts", quantity: 1, unitPrice: 4500, lineTotal: 4500 },
      { description: "Bonnet panel", category: "parts", quantity: 1, unitPrice: 8200, lineTotal: 8200 },
      { description: "Left headlight assembly", category: "parts", quantity: 1, unitPrice: 3800, lineTotal: 3800 },
      { description: "Panel beating labour", category: "labor", quantity: 8, unitPrice: 450, lineTotal: 3600 },
      { description: "Spray painting", category: "paint", quantity: 1, unitPrice: 2500, lineTotal: 2500 },
    ];

    const input: CostExtractionInput = {
      aiEstimatedCost: 15000,
      aiPartsCost: 10000,
      aiLabourCost: 5000,
      damageComponents: baseDamageComponents,
      accidentSeverity: "moderate",
      extractionConfidence: 75,
      quotedAmounts: [22600],
      quoteLineItems: lineItems,
      learningBenchmark: null,
    };

    const result = extractCosts(input);

    expect(result.source).toBe("quote_line_items");
    expect(result.itemised_parts.length).toBe(5);
    expect(result.itemised_parts[0].source).toBe("quote");
    expect(result.itemised_parts[0].component).toBe("Front bumper cover");
    expect(result.itemised_parts[0].total).toBe(4500);
    // Total should be sum of all line items
    expect(result.ai_estimate).toBe(4500 + 8200 + 3800 + 3600 + 2500);
    expect(result.parts).toBe(4500 + 8200 + 3800); // parts categories
    expect(result.labour).toBe(3600 + 2500); // labor + paint categories
    expect(result.confidence).toBeGreaterThan(80);
    expect(result.basis).toContain("5 line item");
  });

  it("CASE 2: uses AI estimate with learning DB benchmark when no line items", () => {
    const benchmark: LearningBenchmarkInput = {
      vehicleDescriptor: "Mazda BT-50 Pickup",
      componentCount: 3,
      collisionDirection: "front",
      marketRegion: "ZA",
      avgCostUsd: 12000,
      sampleSize: 8,
    };

    const input: CostExtractionInput = {
      aiEstimatedCost: 15000,
      aiPartsCost: 10000,
      aiLabourCost: 5000,
      damageComponents: baseDamageComponents,
      accidentSeverity: "moderate",
      extractionConfidence: 75,
      quotedAmounts: [18000],
      quoteLineItems: [],
      learningBenchmark: benchmark,
    };

    const result = extractCosts(input);

    expect(result.source).toBe("learning_db");
    expect(result.ai_estimate).toBe(15000);
    expect(result.itemised_parts.length).toBe(3);
    result.itemised_parts.forEach((part) => {
      expect(part.source).toBe("learning_db");
      expect(part.source_label).toContain("8 historical claims");
      expect(part.source_label).toContain("Mazda BT-50 Pickup");
    });
  });

  it("CASE 2b: shows insufficient data when no learning benchmark and no line items", () => {
    const input: CostExtractionInput = {
      aiEstimatedCost: 15000,
      aiPartsCost: 10000,
      aiLabourCost: 5000,
      damageComponents: baseDamageComponents,
      accidentSeverity: "moderate",
      extractionConfidence: 75,
      quotedAmounts: [18000],
      quoteLineItems: [],
      learningBenchmark: null,
    };

    const result = extractCosts(input);

    expect(result.source).toBe("extracted");
    expect(result.itemised_parts.length).toBe(3);
    result.itemised_parts.forEach((part) => {
      expect(part.source).toBe("insufficient_data");
      expect(part.source_label).toContain("Insufficient benchmark data");
      expect(part.total).toBe(0); // NO fabricated costs
    });
  });

  it("CASE 3: uses quote total when no AI estimate and no line items", () => {
    const input: CostExtractionInput = {
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "unknown",
      extractionConfidence: 0,
      quotedAmounts: [25000],
      quoteLineItems: [],
      learningBenchmark: null,
    };

    const result = extractCosts(input);

    expect(result.source).toBe("quote_line_items");
    expect(result.ai_estimate).toBe(25000);
    expect(result.itemised_parts[0].source).toBe("quote");
  });

  it("CASE 4: returns insufficient data when nothing available", () => {
    const input: CostExtractionInput = {
      aiEstimatedCost: 0,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: [],
      accidentSeverity: "unknown",
      extractionConfidence: 0,
      quotedAmounts: [],
      quoteLineItems: [],
      learningBenchmark: null,
    };

    const result = extractCosts(input);

    expect(result.source).toBe("insufficient_data");
    expect(result.ai_estimate).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.basis).toContain("Insufficient data");
  });

  it("NEVER produces hardcoded component costs", () => {
    // Even with damage components, if no line items and no learning data,
    // per-item costs should be 0 (not fabricated from a lookup table)
    const input: CostExtractionInput = {
      aiEstimatedCost: 20000,
      aiPartsCost: 0,
      aiLabourCost: 0,
      damageComponents: ["Front bumper", "Bonnet", "Radiator", "Fan cowling", "Headlight"],
      accidentSeverity: "severe",
      extractionConfidence: 60,
      quotedAmounts: [],
      quoteLineItems: [],
      learningBenchmark: null,
    };

    const result = extractCosts(input);

    // All per-item costs should be 0 — no fabrication
    result.itemised_parts.forEach((part) => {
      expect(part.total).toBe(0);
      expect(part.source).toBe("insufficient_data");
    });
  });

  it("requires minimum 3 samples for learning DB to be used", () => {
    const weakBenchmark: LearningBenchmarkInput = {
      vehicleDescriptor: "Mazda BT-50 Pickup",
      componentCount: 3,
      collisionDirection: "front",
      marketRegion: "ZA",
      avgCostUsd: 12000,
      sampleSize: 2, // Too few samples
    };

    const input: CostExtractionInput = {
      aiEstimatedCost: 15000,
      aiPartsCost: 10000,
      aiLabourCost: 5000,
      damageComponents: baseDamageComponents,
      accidentSeverity: "moderate",
      extractionConfidence: 75,
      quotedAmounts: [],
      quoteLineItems: [],
      learningBenchmark: weakBenchmark,
    };

    const result = extractCosts(input);

    // Should NOT use learning DB with only 2 samples
    result.itemised_parts.forEach((part) => {
      expect(part.source).toBe("insufficient_data");
    });
  });
});

// ─── Phase 1 Data Integrity — SA Terminology Tests ─────────────────────────────

describe("Phase 1 Data Integrity — SA Terminology", () => {
  it("should preserve SA terms when locale is en-ZA", async () => {
    // Import the phase1 module
    const { runPhase1 } = await import("./phase1-data-integrity");

    // Create a mock assessment with SA terminology
    const mockAssessment = {
      estimatedCost: "1500000", // in cents
      estimatedPartsCost: "1000000",
      estimatedLaborCost: "500000",
      currencyCode: "ZAR",
      incidentType: "animal_strike",
      accidentDescription: "Vehicle struck a kudu at 90km/h on the N1",
      damageComponents: JSON.stringify(["bonnet", "fan cowling", "bumper cover", "wing mirror"]),
      confidenceScore: 75,
      photosDetected: 1,
      vehicleMake: "Mazda",
      vehicleModel: "BT-50",
    };

    const result = runPhase1(mockAssessment as any, "ZAR");

    // Check that the locale is en-ZA
    expect(result.locale).toBe("en-ZA");

    // Check that SA terms are preserved (not converted to US/UK equivalents)
    const g5 = result.gates.find((g: any) => (g.gate ?? g.name ?? "").includes("G5") || (g.gate ?? g.name ?? "").includes("TERMINOLOGY"));
    if (g5) {
      // The corrections should NOT contain conversions from SA to US terms
      const saToUsConversions = (g5.corrections ?? []).filter((c: string) =>
        c.includes("hood latch") || c.includes("radiator fan shroud") || c.includes("trunk lid") || c.includes("side mirror")
      );
      expect(saToUsConversions.length).toBe(0);
    }
  });
});

// ─── Weighted Fraud Scoring — full_contributions Tests ──────────────────────────

describe("Weighted Fraud Scoring — full_contributions", () => {
  it("returns full_contributions with all factors including untriggered", async () => {
    const { computeWeightedFraudScore } = await import("./weighted-fraud-scoring");

    const result = computeWeightedFraudScore({
      consistencyScore: 80,
      aiEstimatedCost: 15000,
      quotedAmount: 16000,
      impactDirection: "front",
      damageZones: ["front_bumper", "hood"],
      hasPreviousClaims: false,
      missingDataCount: 0,
      damageSeverity: "moderate",
      aiConfidence: 75,
    });

    // Should have full_contributions array
    expect(result.full_contributions).toBeDefined();
    expect(Array.isArray(result.full_contributions)).toBe(true);
    expect(result.full_contributions.length).toBeGreaterThan(0);

    // Each contribution should have factor, value, triggered, detail
    result.full_contributions.forEach((c: any) => {
      expect(c).toHaveProperty("factor");
      expect(c).toHaveProperty("value");
      expect(c).toHaveProperty("triggered");
      expect(c).toHaveProperty("detail");
      expect(typeof c.factor).toBe("string");
      expect(typeof c.value).toBe("number");
      expect(typeof c.triggered).toBe("boolean");
      expect(typeof c.detail).toBe("string");
    });

    // Should also have level and explanation
    expect(result.level).toBeDefined();
    expect(result.explanation).toBeDefined();
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("returns high score when multiple factors triggered", async () => {
    const { computeWeightedFraudScore } = await import("./weighted-fraud-scoring");

    const result = computeWeightedFraudScore({
      consistencyScore: 30, // triggers damage inconsistency (+20)
      aiEstimatedCost: 10000,
      quotedAmount: 20000, // triggers cost deviation (+15)
      impactDirection: "front",
      damageZones: ["rear_bumper"], // triggers direction mismatch (+15)
      hasPreviousClaims: true, // triggers repeat claim (+20)
      missingDataCount: 3, // triggers missing data (+10)
      damageSeverity: "severe",
      aiConfidence: 30,
    });

    expect(result.score).toBeGreaterThanOrEqual(60);
    const triggered = result.full_contributions.filter((c: any) => c.triggered);
    expect(triggered.length).toBeGreaterThanOrEqual(4);
  });
});
