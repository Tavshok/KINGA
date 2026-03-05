/**
 * Unit tests for the Repair Quote Intelligence layer.
 *
 * Tests cover:
 *   1. Part reconciliation (reconcileParts)
 *   2. Historical cost deviation (calculateHistoricalDeviation)
 *   3. Risk classification (classifyRisk)
 *   4. Parts dictionary normalisation (normalisePart)
 *
 * All DB-dependent tests use mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Parts Dictionary ─────────────────────────────────────────────────────────

import { normalisePart, isCanonicalPart } from "./parts-dictionary";

describe("normalisePart", () => {
  it("maps exact alias to canonical name", () => {
    expect(normalisePart("front bumper")).toBe("Front Bumper");
    expect(normalisePart("bonnet")).toBe("Hood");
    expect(normalisePart("windshield")).toBe("Windscreen");
  });

  it("is case-insensitive", () => {
    expect(normalisePart("FRONT BUMPER")).toBe("Front Bumper");
    expect(normalisePart("Front Bumper")).toBe("Front Bumper");
    expect(normalisePart("fRoNt BuMpEr")).toBe("Front Bumper");
  });

  it("strips noise words before lookup", () => {
    expect(normalisePart("front bumper assembly")).toBe("Front Bumper");
    expect(normalisePart("front bumper new")).toBe("Front Bumper");
    expect(normalisePart("genuine front bumper")).toBe("Front Bumper");
    expect(normalisePart("oem front bumper cover")).toBe("Front Bumper Cover");
  });

  it("maps LH/RH variants to left/right canonical names", () => {
    expect(normalisePart("front fender lh")).toBe("Front Fender Left");
    expect(normalisePart("front fender rh")).toBe("Front Fender Right");
    expect(normalisePart("lh headlight")).toBe("Headlight Left");
    expect(normalisePart("rh headlight")).toBe("Headlight Right");
  });

  it("returns title-cased original for unknown parts", () => {
    const result = normalisePart("custom turbo widget");
    expect(result).toBe("Custom Turbo Widget");
  });

  it("isCanonicalPart returns true for canonical names", () => {
    expect(isCanonicalPart("Front Bumper")).toBe(true);
    expect(isCanonicalPart("Windscreen")).toBe(true);
    expect(isCanonicalPart("Headlight Left")).toBe(true);
  });

  it("isCanonicalPart returns false for non-canonical names", () => {
    expect(isCanonicalPart("front bumper")).toBe(false);
    expect(isCanonicalPart("bonnet")).toBe(false);
    expect(isCanonicalPart("Custom Turbo Widget")).toBe(false);
  });
});

// ─── Part Reconciliation ──────────────────────────────────────────────────────

import { reconcileParts } from "./part-reconciliation";

describe("reconcileParts", () => {
  it("returns full coverage when all detected parts are quoted", () => {
    const detected = [
      { name: "Front Bumper" },
      { name: "Headlight Left" },
    ];
    const quoted = [
      { componentName: "Front Bumper" },
      { componentName: "Headlight Left" },
    ];
    const result = reconcileParts(detected, quoted);
    expect(result.coverageScore).toBe(1);
    expect(result.missingParts).toHaveLength(0);
    expect(result.extraParts).toHaveLength(0);
    expect(result.matchedParts).toHaveLength(2);
  });

  it("identifies missing parts when quote is incomplete", () => {
    const detected = [
      { name: "Front Bumper" },
      { name: "Headlight Left" },
      { name: "Radiator" },
    ];
    const quoted = [
      { componentName: "Front Bumper" },
    ];
    const result = reconcileParts(detected, quoted);
    expect(result.coverageScore).toBeCloseTo(1 / 3, 1);
    expect(result.missingParts).toContain("Headlight Left");
    expect(result.missingParts).toContain("Radiator");
    expect(result.missingParts).toHaveLength(2);
  });

  it("identifies extra parts when quote includes undetected items", () => {
    const detected = [{ name: "Front Bumper" }];
    const quoted = [
      { componentName: "Front Bumper" },
      { componentName: "Gearbox" },
      { componentName: "Engine" },
    ];
    const result = reconcileParts(detected, quoted);
    expect(result.extraParts).toContain("Gearbox");
    expect(result.extraParts).toContain("Engine");
    expect(result.extraParts).toHaveLength(2);
  });

  it("normalises aliases before comparison", () => {
    // AI detects "bonnet", quote uses "hood" — both normalise to "Hood"
    const detected = [{ name: "bonnet" }];
    const quoted = [{ componentName: "hood" }];
    const result = reconcileParts(detected, quoted);
    expect(result.coverageScore).toBe(1);
    expect(result.missingParts).toHaveLength(0);
  });

  it("normalises LH/RH variants correctly", () => {
    const detected = [{ name: "front fender lh" }];
    const quoted = [{ componentName: "Left Front Fender" }];
    const result = reconcileParts(detected, quoted);
    // Both should normalise to "Front Fender Left"
    expect(result.coverageScore).toBe(1);
  });

  it("returns coverageScore 1 when no parts are detected", () => {
    const result = reconcileParts([], [{ componentName: "Front Bumper" }]);
    expect(result.coverageScore).toBe(1);
    expect(result.detectedCount).toBe(0);
    expect(result.extraParts).toHaveLength(1);
  });

  it("returns coverageScore 1 when both lists are empty", () => {
    const result = reconcileParts([], []);
    expect(result.coverageScore).toBe(1);
    expect(result.missingParts).toHaveLength(0);
    expect(result.extraParts).toHaveLength(0);
  });

  it("deduplicates repeated parts before comparison", () => {
    const detected = [
      { name: "Front Bumper" },
      { name: "Front Bumper" }, // duplicate
    ];
    const quoted = [{ componentName: "Front Bumper" }];
    const result = reconcileParts(detected, quoted);
    expect(result.detectedCount).toBe(1);
    expect(result.coverageScore).toBe(1);
  });
});

// ─── Cost Deviation ───────────────────────────────────────────────────────────

import { calculateHistoricalDeviation } from "./cost-deviation";

// Mock the DB module
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db";

describe("calculateHistoricalDeviation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns noData when DB is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null as any);
    const result = await calculateHistoricalDeviation("tenant1", 100000);
    expect(result.sampleSize).toBe(0);
    expect(result.averageCost).toBeNull();
    expect(result.medianCost).toBeNull();
    expect(result.deviationPct).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("returns noData when no historical records exist", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await calculateHistoricalDeviation("tenant1", 100000);
    expect(result.sampleSize).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("calculates correct median for odd sample size", async () => {
    // 3 historical claims: R500, R1000, R1500 (in cents: 50000, 100000, 150000)
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { historicalClaimId: 1, totalCost: 500 },   // R500
        { historicalClaimId: 2, totalCost: 1000 },  // R1000
        { historicalClaimId: 3, totalCost: 1500 },  // R1500
      ]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    // Quoted: R1000 (100000 cents)
    const result = await calculateHistoricalDeviation("tenant1", 100000);
    expect(result.medianCost).toBe(100000); // R1000 in cents
    expect(result.averageCost).toBe(100000); // (500+1000+1500)/3 = 1000 → 100000 cents
    expect(result.deviationPct).toBe(0);
    expect(result.confidence).toBe("low"); // only 3 samples
  });

  it("calculates correct median for even sample size", async () => {
    // 4 historical claims: R500, R1000, R1500, R2000
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { historicalClaimId: 1, totalCost: 500 },
        { historicalClaimId: 2, totalCost: 1000 },
        { historicalClaimId: 3, totalCost: 1500 },
        { historicalClaimId: 4, totalCost: 2000 },
      ]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await calculateHistoricalDeviation("tenant1", 125000);
    // Median = (1000 + 1500) / 2 = 1250 → 125000 cents
    expect(result.medianCost).toBe(125000);
    expect(result.deviationPct).toBe(0);
  });

  it("returns medium confidence for 5-19 samples", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      historicalClaimId: i + 1,
      totalCost: 1000,
    }));
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await calculateHistoricalDeviation("tenant1", 100000);
    expect(result.confidence).toBe("medium");
  });

  it("returns high confidence for 20+ samples", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      historicalClaimId: i + 1,
      totalCost: 1000,
    }));
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    const result = await calculateHistoricalDeviation("tenant1", 100000);
    expect(result.confidence).toBe("high");
  });

  it("calculates positive deviation when quote exceeds median", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      historicalClaimId: i + 1,
      totalCost: 1000, // R1000 each
    }));
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    // Quoted R1500 = 150000 cents, median R1000 = 100000 cents
    // Deviation = (150000 - 100000) / 100000 * 100 = 50%
    const result = await calculateHistoricalDeviation("tenant1", 150000);
    expect(result.deviationPct).toBe(50);
  });

  it("calculates negative deviation when quote is below median", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      historicalClaimId: i + 1,
      totalCost: 1000,
    }));
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    // Quoted R700 = 70000 cents, median R1000 = 100000 cents
    // Deviation = (70000 - 100000) / 100000 * 100 = -30%
    const result = await calculateHistoricalDeviation("tenant1", 70000);
    expect(result.deviationPct).toBe(-30);
  });
});

// ─── Risk Classification ──────────────────────────────────────────────────────

import { classifyRisk } from "./risk-classifier";
import type { ReconciliationResult } from "./part-reconciliation";
import type { DeviationResult } from "./cost-deviation";

const makeReconciliation = (overrides: Partial<ReconciliationResult> = {}): ReconciliationResult => ({
  missingParts: [],
  extraParts: [],
  matchedParts: ["Front Bumper"],
  coverageScore: 1,
  detectedCount: 1,
  quotedCount: 1,
  ...overrides,
});

const makeDeviation = (overrides: Partial<DeviationResult> = {}): DeviationResult => ({
  averageCost: 100000,
  medianCost: 100000,
  deviationPct: 0,
  sampleSize: 20,
  confidence: "high",
  ...overrides,
});

describe("classifyRisk", () => {
  it("returns low risk when coverage is full and deviation is within range", () => {
    const result = classifyRisk(makeReconciliation(), makeDeviation());
    expect(result.riskLevel).toBe("low");
  });

  it("returns high risk when coverage is below 50%", () => {
    const result = classifyRisk(
      makeReconciliation({
        coverageScore: 0.3,
        detectedCount: 10,
        missingParts: ["A", "B", "C", "D", "E", "F", "G"],
      }),
      makeDeviation()
    );
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors.some((f) => f.includes("Low part coverage"))).toBe(true);
  });

  it("returns medium risk when coverage is 50-80%", () => {
    const result = classifyRisk(
      makeReconciliation({
        coverageScore: 0.65,
        detectedCount: 4,
        missingParts: ["Radiator", "Condenser"],
      }),
      makeDeviation({ deviationPct: 5 }) // low deviation
    );
    expect(result.riskLevel).toBe("medium");
  });

  it("returns high risk when deviation exceeds 40%", () => {
    const result = classifyRisk(
      makeReconciliation(), // perfect coverage
      makeDeviation({ deviationPct: 55, confidence: "high" })
    );
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors.some((f) => f.includes("55.0% above"))).toBe(true);
  });

  it("returns medium risk when deviation is 20-40%", () => {
    const result = classifyRisk(
      makeReconciliation(),
      makeDeviation({ deviationPct: 30, confidence: "high" })
    );
    expect(result.riskLevel).toBe("medium");
    expect(result.riskFactors.some((f) => f.includes("30.0% above"))).toBe(true);
  });

  it("does not flag deviation risk when confidence is low", () => {
    const result = classifyRisk(
      makeReconciliation(),
      makeDeviation({ deviationPct: 80, confidence: "low", sampleSize: 2 })
    );
    // High deviation but low confidence — should not escalate to high
    expect(result.riskLevel).toBe("low");
    expect(result.riskFactors.some((f) => f.includes("Insufficient historical data"))).toBe(true);
  });

  it("returns medium risk when more than 3 extra parts are quoted", () => {
    const result = classifyRisk(
      makeReconciliation({
        extraParts: ["Engine", "Gearbox", "Differential", "Exhaust System"],
      }),
      makeDeviation({ deviationPct: 5 })
    );
    expect(result.riskLevel).toBe("medium");
    expect(result.riskFactors.some((f) => f.includes("4 parts quoted"))).toBe(true);
  });

  it("escalates to high when both coverage is low and deviation is high", () => {
    const result = classifyRisk(
      makeReconciliation({
        coverageScore: 0.2,
        detectedCount: 5,
        missingParts: ["A", "B", "C", "D"],
      }),
      makeDeviation({ deviationPct: 60, confidence: "high" })
    );
    expect(result.riskLevel).toBe("high");
    // Both factors should be present
    expect(result.riskFactors.length).toBeGreaterThanOrEqual(2);
  });

  it("includes a positive message when risk is low and no issues found", () => {
    const result = classifyRisk(makeReconciliation(), makeDeviation({ deviationPct: 5 }));
    expect(result.riskLevel).toBe("low");
    expect(result.riskFactors.some((f) => f.includes("aligns with"))).toBe(true);
  });

  it("notes below-median quotes without escalating risk", () => {
    const result = classifyRisk(
      makeReconciliation(),
      makeDeviation({ deviationPct: -25, confidence: "high" })
    );
    // Below-median should not escalate risk level
    expect(result.riskLevel).toBe("low");
    expect(result.riskFactors.some((f) => f.includes("below the historical median"))).toBe(true);
  });
});
