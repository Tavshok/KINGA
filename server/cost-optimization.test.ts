/**
 * Cost Optimization Engine Tests
 * 
 * Tests variance calculation, fraud detection, and negotiation strategy generation.
 */

import { describe, it, expect } from "vitest";
import {
  optimizeQuotes,
  calculateAssessorPerformanceScore,
  type QuoteAnalysis,
} from "./cost-optimization";

describe("Cost Optimization Engine", () => {
  describe("optimizeQuotes", () => {
    it("should identify lowest and highest quotes", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000, // $5,000
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 40000,
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 700000, // $7,000
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 60000,
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "oem",
          warrantyMonths: 24,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.lowestQuote.quoteId).toBe(1);
      expect(result.lowestQuote.totalCost).toBe(500000);
      expect(result.highestQuote.quoteId).toBe(2);
      expect(result.highestQuote.totalCost).toBe(700000);
      expect(result.costSpread).toBe(200000); // $2,000 difference
    });

    it("should calculate median and average costs correctly", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000,
          components: [],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 600000,
          components: [],
          partsQuality: "oem",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 3,
          panelBeaterId: 3,
          panelBeaterName: "Shop C",
          totalCost: 700000,
          components: [],
          partsQuality: "genuine",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.medianCost).toBe(600000);
      expect(result.averageCost).toBe(600000);
    });

    it("should detect component variance and flag high discrepancies", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000,
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 40000,
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 900000,
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 80000, // 60% higher than Shop A
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "oem",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.componentComparisons.length).toBeGreaterThan(0);
      const bumperComparison = result.componentComparisons.find(
        (c) => c.componentName === "Bumper"
      );
      expect(bumperComparison).toBeDefined();
      expect(bumperComparison!.variance).toBeGreaterThan(25); // More than 25% variance
      // Note: 80k vs 40k parts = 60k median, 90k total vs 50k total = 70k median
      // Variance is calculated from median, not from lowest
    });

    it("should generate negotiation strategies for overpriced quotes", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000,
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 40000,
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 750000,
          components: [
            {
              componentName: "Bumper",
              action: "replace",
              partsCost: 70000, // 75% higher
              laborCost: 10000,
              laborHours: 2,
            },
          ],
          partsQuality: "oem",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.negotiationTargets.length).toBeGreaterThan(0);
      const shopBNegotiation = result.negotiationTargets.find(
        (t) => t.panelBeaterName === "Shop B"
      );
      expect(shopBNegotiation).toBeDefined();
      expect(shopBNegotiation!.talkingPoints.length).toBeGreaterThan(0);
    });

    it("should detect fraud patterns - identical quotes", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000,
          components: [],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 500100, // 99.98% identical
          components: [],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.fraudFlags.length).toBeGreaterThan(0);
      expect(result.suspiciousPatterns).toContain("copy_quotation");
    });

    it("should detect fraud patterns - incomplete quotes", () => {
      const quotes: QuoteAnalysis[] = [
        {
          quoteId: 1,
          panelBeaterId: 1,
          panelBeaterName: "Shop A",
          totalCost: 500000,
          components: [
            { componentName: "Bumper", action: "replace", partsCost: 40000, laborCost: 10000, laborHours: 2 },
            { componentName: "Hood", action: "replace", partsCost: 50000, laborCost: 15000, laborHours: 3 },
            { componentName: "Headlight", action: "replace", partsCost: 30000, laborCost: 5000, laborHours: 1 },
          ],
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
        {
          quoteId: 2,
          panelBeaterId: 2,
          panelBeaterName: "Shop B",
          totalCost: 200000,
          components: [
            { componentName: "Bumper", action: "replace", partsCost: 40000, laborCost: 10000, laborHours: 2 },
          ], // Only 1 component vs 3 - missing 66%
          partsQuality: "aftermarket",
          warrantyMonths: 12,
          estimatedDuration: 3,
        },
      ];

      const result = optimizeQuotes(quotes);

      expect(result.fraudFlags.length).toBeGreaterThan(0);
      expect(result.suspiciousPatterns).toContain("incomplete_quote");
    });
  });

  describe("calculateAssessorPerformanceScore", () => {
    it("should give perfect score for exact match", () => {
      const result = calculateAssessorPerformanceScore(500000, 500000);

      expect(result.score).toBe(100);
      expect(result.variance).toBe(0);
      expect(result.rating).toBe("excellent");
    });

    it("should calculate score correctly for 10% variance", () => {
      const result = calculateAssessorPerformanceScore(550000, 500000);

      expect(result.variance).toBe(10);
      expect(result.score).toBe(80); // 100 - (10 * 2)
      expect(result.rating).toBe("good");
    });

    it("should calculate score correctly for 25% variance", () => {
      const result = calculateAssessorPerformanceScore(625000, 500000);

      expect(result.variance).toBe(25);
      expect(result.score).toBe(50); // 100 - (25 * 2)
      expect(result.rating).toBe("fair");
    });

    it("should give poor rating for high variance", () => {
      const result = calculateAssessorPerformanceScore(800000, 500000);

      expect(result.variance).toBe(60);
      expect(result.score).toBe(0); // Capped at 0
      expect(result.rating).toBe("poor");
    });

    it("should handle underestimation correctly", () => {
      const result = calculateAssessorPerformanceScore(400000, 500000);

      expect(result.variance).toBe(20);
      expect(result.score).toBe(60); // 100 - (20 * 2)
      expect(result.rating).toBe("fair");
    });
  });
});
