/**
 * Unit tests for the new Repair Cost Optimisation intelligence layers.
 *
 * Tests cover:
 *   1. calculateQuoteComparisonStats (Layer 1)
 *   2. calculateRepairRatio (Layer 2)
 *   3. calculatePartsCertainty (Layer 5)
 *   4. calculateConfidenceScore (Layer 6)
 *   5. updateRepairCostIntelligence — learning loop (Layer 8)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateQuoteComparisonStats,
  calculateRepairRatio,
  calculatePartsCertainty,
  calculateConfidenceScore,
  type QuoteEntry,
} from "./quote-comparison-stats";

// ─── Layer 1: Quote Comparison Statistics ────────────────────────────────────

describe("calculateQuoteComparisonStats", () => {
  it("returns zero stats for empty quotes", () => {
    const result = calculateQuoteComparisonStats([]);
    expect(result.quoteCount).toBe(0);
    expect(result.medianQuote).toBe(0);
    expect(result.outliers).toHaveLength(0);
  });

  it("calculates correct median for odd number of quotes", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 320000 },
      { garageName: "B", totalAmount: 540000 },
      { garageName: "C", totalAmount: 310000 },
    ];
    const result = calculateQuoteComparisonStats(quotes);
    // Sorted: 310000, 320000, 540000 → median = 320000
    expect(result.medianQuote).toBe(320000);
    expect(result.minQuote).toBe(310000);
    expect(result.maxQuote).toBe(540000);
  });

  it("calculates correct median for even number of quotes", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 200000 },
      { garageName: "B", totalAmount: 400000 },
      { garageName: "C", totalAmount: 300000 },
      { garageName: "D", totalAmount: 100000 },
    ];
    const result = calculateQuoteComparisonStats(quotes);
    // Sorted: 100000, 200000, 300000, 400000 → median = (200000+300000)/2 = 250000
    expect(result.medianQuote).toBe(250000);
  });

  it("flags outliers above median × 1.35", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "Garage A", totalAmount: 320000 },
      { garageName: "Garage B", totalAmount: 540000 }, // 540000 > 320000 × 1.35 = 432000
      { garageName: "Garage C", totalAmount: 310000 },
    ];
    const result = calculateQuoteComparisonStats(quotes);
    expect(result.outliers).toHaveLength(1);
    expect(result.outliers[0].garageName).toBe("Garage B");
    expect(result.outliers[0].flag).toBe("Potential cost outlier");
  });

  it("does not flag quotes at exactly the threshold", () => {
    // median = 300000, threshold = 300000 × 1.35 = 405000
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 300000 },
      { garageName: "B", totalAmount: 405000 }, // exactly at threshold — NOT an outlier
    ];
    const result = calculateQuoteComparisonStats(quotes);
    // median = (300000+405000)/2 = 352500, threshold = 352500 × 1.35 = 475875
    // 405000 < 475875 → not an outlier
    expect(result.outliers).toHaveLength(0);
  });

  it("calculates spread percentage correctly", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 100000 },
      { garageName: "B", totalAmount: 200000 },
      { garageName: "C", totalAmount: 300000 },
    ];
    const result = calculateQuoteComparisonStats(quotes);
    // median = 200000, spread = (300000 - 100000) / 200000 × 100 = 100%
    expect(result.spreadPercentage).toBe(100);
  });

  it("sets fair range low to lowest non-outlier quote", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 310000 },
      { garageName: "B", totalAmount: 320000 },
      { garageName: "C", totalAmount: 540000 }, // outlier
    ];
    const result = calculateQuoteComparisonStats(quotes);
    expect(result.fairRangeLow).toBe(310000);
    expect(result.recommendedQuote).toBe(310000);
  });

  it("handles single quote with no outlier", () => {
    const quotes: QuoteEntry[] = [{ garageName: "A", totalAmount: 500000 }];
    const result = calculateQuoteComparisonStats(quotes);
    expect(result.quoteCount).toBe(1);
    expect(result.medianQuote).toBe(500000);
    expect(result.outliers).toHaveLength(0);
  });
});

// ─── Layer 2: Repair-to-Vehicle Value Ratio ───────────────────────────────────

describe("calculateRepairRatio", () => {
  it("returns unknown category when vehicle value is null", () => {
    const result = calculateRepairRatio(300000, null);
    expect(result.category).toBe("unknown");
    expect(result.ratio).toBeNull();
    expect(result.ratioPercentage).toBeNull();
  });

  it("returns unknown category when vehicle value is zero", () => {
    const result = calculateRepairRatio(300000, 0);
    expect(result.category).toBe("unknown");
  });

  it("classifies minor repair correctly (<20%)", () => {
    // R3000 repair / R20000 vehicle = 15%
    const result = calculateRepairRatio(300000, 2000000);
    expect(result.category).toBe("minor");
    expect(result.ratioPercentage).toBe(15);
  });

  it("classifies moderate repair correctly (20–40%)", () => {
    // R6000 repair / R20000 vehicle = 30%
    const result = calculateRepairRatio(600000, 2000000);
    expect(result.category).toBe("moderate");
    expect(result.ratioPercentage).toBe(30);
  });

  it("classifies major repair correctly (40–60%)", () => {
    // R10000 repair / R20000 vehicle = 50%
    const result = calculateRepairRatio(1000000, 2000000);
    expect(result.category).toBe("major");
    expect(result.ratioPercentage).toBe(50);
  });

  it("classifies near write-off correctly (>60%)", () => {
    // R14000 repair / R20000 vehicle = 70%
    const result = calculateRepairRatio(1400000, 2000000);
    expect(result.category).toBe("near_write_off");
    expect(result.ratioPercentage).toBe(70);
  });

  it("stores repair cost and vehicle value in result", () => {
    const result = calculateRepairRatio(300000, 2000000);
    expect(result.repairCost).toBe(300000);
    expect(result.vehicleMarketValue).toBe(2000000);
  });
});

// ─── Layer 5: Parts Certainty Score ──────────────────────────────────────────

describe("calculatePartsCertainty", () => {
  it("returns high certainty when all parts are OEM", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 300000, partsQuality: "oem" },
      { garageName: "B", totalAmount: 320000, partsQuality: "genuine" },
    ];
    const result = calculatePartsCertainty(quotes);
    expect(result.level).toBe("high");
    expect(result.oemCount).toBe(2);
    expect(result.unknownCount).toBe(0);
  });

  it("returns high certainty when all parts are aftermarket", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 300000, partsQuality: "aftermarket" },
    ];
    const result = calculatePartsCertainty(quotes);
    expect(result.level).toBe("high");
    expect(result.aftermarketCount).toBe(1);
  });

  it("returns low certainty when all parts are unspecified", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 300000, partsQuality: null },
      { garageName: "B", totalAmount: 320000, partsQuality: "" },
    ];
    const result = calculatePartsCertainty(quotes);
    expect(result.level).toBe("low");
    expect(result.unknownCount).toBe(2);
  });

  it("returns medium certainty when half are unknown", () => {
    const quotes: QuoteEntry[] = [
      { garageName: "A", totalAmount: 300000, partsQuality: "oem" },
      { garageName: "B", totalAmount: 320000, partsQuality: null },
    ];
    const result = calculatePartsCertainty(quotes);
    expect(result.level).toBe("medium");
  });

  it("handles empty quotes array", () => {
    const result = calculatePartsCertainty([]);
    expect(result.level).toBe("low");
    expect(result.totalParts).toBe(0);
  });
});

// ─── Layer 6: Confidence Score ────────────────────────────────────────────────

describe("calculateConfidenceScore", () => {
  it("returns minimum score of 10 for worst case", () => {
    const result = calculateConfidenceScore({
      quoteCount: 0,
      historicalConfidence: "low",
      partsCertainty: "low",
      hasVehicleMarketValue: false,
      historicalSampleSize: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(10);
  });

  it("returns high score for ideal conditions", () => {
    const result = calculateConfidenceScore({
      quoteCount: 3,
      historicalConfidence: "high",
      partsCertainty: "high",
      hasVehicleMarketValue: true,
      historicalSampleSize: 25,
    });
    // 10 (base) + 25 (3 quotes) + 30 (high historical) + 20 (high parts) + 15 (vehicle value) = 100
    expect(result.score).toBe(100);
  });

  it("caps score at 100", () => {
    const result = calculateConfidenceScore({
      quoteCount: 5,
      historicalConfidence: "high",
      partsCertainty: "high",
      hasVehicleMarketValue: true,
      historicalSampleSize: 50,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("reduces score when parts certainty is low", () => {
    const withHighParts = calculateConfidenceScore({
      quoteCount: 3,
      historicalConfidence: "medium",
      partsCertainty: "high",
      hasVehicleMarketValue: false,
      historicalSampleSize: 10,
    });
    const withLowParts = calculateConfidenceScore({
      quoteCount: 3,
      historicalConfidence: "medium",
      partsCertainty: "low",
      hasVehicleMarketValue: false,
      historicalSampleSize: 10,
    });
    expect(withHighParts.score).toBeGreaterThan(withLowParts.score);
  });

  it("includes vehicle market value factor in explanations", () => {
    const result = calculateConfidenceScore({
      quoteCount: 2,
      historicalConfidence: "low",
      partsCertainty: "low",
      hasVehicleMarketValue: true,
      historicalSampleSize: 0,
    });
    expect(result.factors.some((f) => f.includes("vehicle market value"))).toBe(true);
  });

  it("includes no historical data explanation when sample size is 0", () => {
    const result = calculateConfidenceScore({
      quoteCount: 2,
      historicalConfidence: "low",
      partsCertainty: "low",
      hasVehicleMarketValue: false,
      historicalSampleSize: 0,
    });
    expect(result.factors.some((f) => f.includes("no historical data"))).toBe(true);
  });
});

// ─── Layer 8: Learning Loop ───────────────────────────────────────────────────

import { updateRepairCostIntelligence } from "./learning-loop";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";

describe("updateRepairCostIntelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not-updated when DB is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    const result = await updateRepairCostIntelligence(1);
    expect(result.updated).toBe(false);
    expect(result.reason).toContain("Database unavailable");
  });

  it("skips simulated claims", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: 1,
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehicleYear: 2020,
        status: "closed",
        metadata: null,
        isSimulated: 1, // simulated!
      }]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await updateRepairCostIntelligence(1);
    expect(result.updated).toBe(false);
    expect(result.reason).toContain("Simulated claim");
  });

  it("skips claims that are not completed or closed", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: 1,
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehicleYear: 2020,
        status: "under_assessment",
        metadata: null,
        isSimulated: 0,
      }]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await updateRepairCostIntelligence(1);
    expect(result.updated).toBe(false);
    expect(result.reason).toContain("under_assessment");
  });

  it("returns not-updated when claim has no vehicle make/model", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: 1,
        vehicleMake: null,
        vehicleModel: null,
        vehicleYear: null,
        status: "closed",
        metadata: null,
        isSimulated: 0,
      }]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await updateRepairCostIntelligence(1);
    expect(result.updated).toBe(false);
    expect(result.reason).toContain("Vehicle make/model not available");
  });

  it("returns not-updated when claim is not found", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await updateRepairCostIntelligence(999);
    expect(result.updated).toBe(false);
    expect(result.reason).toContain("Claim not found");
  });
});
