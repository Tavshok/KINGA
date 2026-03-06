/**
 * Repair Intelligence Memory — Unit Tests
 * ─────────────────────────────────────────
 * Tests all pure functions in repair-history.ts:
 *   - computeCostDeviation
 *   - computeCostRatio
 *   - computeComponentMatchScore
 *   - computeRepairQualityScore
 *   - derivePerformanceTier
 */

import { describe, it, expect } from "vitest";
import {
  computeCostDeviation,
  computeCostRatio,
  computeComponentMatchScore,
  computeRepairQualityScore,
  derivePerformanceTier,
} from "./repair-history";

// ─── computeCostDeviation ─────────────────────────────────────────────────────

describe("computeCostDeviation", () => {
  it("returns null when estimate is 0", () => {
    expect(computeCostDeviation(50000, 0)).toBeNull();
  });

  it("returns 0 when actual equals estimate", () => {
    expect(computeCostDeviation(100000, 100000)).toBe(0);
  });

  it("returns positive % when actual exceeds estimate (over-run)", () => {
    // 150k actual vs 100k estimate = +50%
    expect(computeCostDeviation(150000, 100000)).toBe(50);
  });

  it("returns negative % when actual is below estimate (under-run)", () => {
    // 80k actual vs 100k estimate = -20%
    expect(computeCostDeviation(80000, 100000)).toBe(-20);
  });

  it("handles fractional percentages correctly", () => {
    // 110k actual vs 100k estimate = +10%
    expect(computeCostDeviation(110000, 100000)).toBe(10);
  });

  it("rounds to 2 decimal places", () => {
    // 103333 actual vs 100000 estimate = 3.333% → rounds to 3.33
    expect(computeCostDeviation(103333, 100000)).toBe(3.33);
  });

  it("handles large over-runs", () => {
    // 300k actual vs 100k estimate = +200%
    expect(computeCostDeviation(300000, 100000)).toBe(200);
  });

  it("handles near-zero actual cost", () => {
    // 1 cent actual vs 100k estimate = -99.999% → rounds to -100
    const result = computeCostDeviation(1, 100000);
    expect(result).toBeLessThan(0);
    expect(result).toBeGreaterThan(-100.01);
  });
});

// ─── computeCostRatio ─────────────────────────────────────────────────────────

describe("computeCostRatio", () => {
  it("returns null when estimate is 0", () => {
    expect(computeCostRatio(50000, 0)).toBeNull();
  });

  it("returns 1.000 when actual equals estimate", () => {
    expect(computeCostRatio(100000, 100000)).toBe(1);
  });

  it("returns ratio > 1 when actual exceeds estimate", () => {
    expect(computeCostRatio(150000, 100000)).toBe(1.5);
  });

  it("returns ratio < 1 when actual is below estimate", () => {
    expect(computeCostRatio(80000, 100000)).toBe(0.8);
  });

  it("rounds to 3 decimal places", () => {
    // 200k / 300k = 0.6666... → 0.667
    expect(computeCostRatio(200000, 300000)).toBe(0.667);
  });

  it("handles zero actual cost", () => {
    expect(computeCostRatio(0, 100000)).toBe(0);
  });
});

// ─── computeComponentMatchScore ──────────────────────────────────────────────

describe("computeComponentMatchScore", () => {
  it("returns 100 when damaged count is 0 (avoid division by zero)", () => {
    expect(computeComponentMatchScore(5, 0)).toBe(100);
  });

  it("returns 100 when repaired count equals damaged count", () => {
    expect(computeComponentMatchScore(5, 5)).toBe(100);
  });

  it("returns 100 when repaired count exceeds damaged count (no penalty for extra work)", () => {
    expect(computeComponentMatchScore(7, 5)).toBe(100);
  });

  it("returns proportional score when fewer components repaired", () => {
    // 3 repaired / 5 damaged = 60%
    expect(computeComponentMatchScore(3, 5)).toBe(60);
  });

  it("returns 50 when half the components repaired", () => {
    expect(computeComponentMatchScore(1, 2)).toBe(50);
  });

  it("returns 0 when no components repaired but damage exists", () => {
    expect(computeComponentMatchScore(0, 5)).toBe(0);
  });

  it("handles single component correctly", () => {
    expect(computeComponentMatchScore(1, 1)).toBe(100);
    expect(computeComponentMatchScore(0, 1)).toBe(0);
  });
});

// ─── computeRepairQualityScore ────────────────────────────────────────────────

describe("computeRepairQualityScore", () => {
  it("returns 100 for a perfect repair (exact match, no deviation, fast, no repeat)", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 3,
      repeatDamageWithin12Months: false,
    });
    expect(score).toBe(100);
  });

  it("returns 0 for a completely failed repair", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 0,
      costDeviationPct: 50, // 50% over-run → cost score 0
      repairDurationDays: 30, // max duration → 0
      repeatDamageWithin12Months: true, // repeat → 0
    });
    expect(score).toBe(0);
  });

  it("penalises cost over-runs proportionally", () => {
    const noDeviation = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    const withDeviation = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 25, // 25% over-run
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    expect(withDeviation).toBeLessThan(noDeviation);
  });

  it("penalises cost under-runs the same as over-runs", () => {
    const overRun = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 25,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    const underRun = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: -25,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    expect(overRun).toBe(underRun);
  });

  it("gives full duration score for repairs completed in ≤7 days", () => {
    const sevenDays = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    const threeDays = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 3,
      repeatDamageWithin12Months: false,
    });
    expect(sevenDays).toBe(threeDays);
    expect(sevenDays).toBe(100);
  });

  it("gives zero duration score for repairs taking ≥30 days", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 30,
      repeatDamageWithin12Months: false,
    });
    // component 40 + cost 100*0.3 + duration 0*0.2 + repeat 100*0.1
    // = 40 + 30 + 0 + 10 = 80
    expect(score).toBe(80);
  });

  it("applies 10% penalty for repeat damage", () => {
    const noRepeat = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    const withRepeat = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: 7,
      repeatDamageWithin12Months: true,
    });
    expect(withRepeat).toBe(noRepeat - 10);
  });

  it("handles null cost deviation gracefully (full cost score)", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: null,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    expect(score).toBe(100);
  });

  it("handles null repair duration gracefully (full duration score)", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 100,
      costDeviationPct: 0,
      repairDurationDays: null,
      repeatDamageWithin12Months: false,
    });
    expect(score).toBe(100);
  });

  it("clamps output to [0, 100]", () => {
    const score = computeRepairQualityScore({
      componentMatchScore: 200, // intentionally out of range
      costDeviationPct: -100, // extreme under-run
      repairDurationDays: 0,
      repeatDamageWithin12Months: false,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("weights components at 40%", () => {
    // All other factors perfect, component score 50 → 50*0.4 + 100*0.3 + 100*0.2 + 100*0.1 = 20+30+20+10 = 80
    const score = computeRepairQualityScore({
      componentMatchScore: 50,
      costDeviationPct: 0,
      repairDurationDays: 7,
      repeatDamageWithin12Months: false,
    });
    expect(score).toBe(80);
  });
});

// ─── derivePerformanceTier ────────────────────────────────────────────────────

describe("derivePerformanceTier", () => {
  it("returns 'unrated' for null score", () => {
    expect(derivePerformanceTier(null)).toBe("unrated");
  });

  it("returns 'A' for scores ≥80", () => {
    expect(derivePerformanceTier(80)).toBe("A");
    expect(derivePerformanceTier(95)).toBe("A");
    expect(derivePerformanceTier(100)).toBe("A");
  });

  it("returns 'B' for scores 60–79", () => {
    expect(derivePerformanceTier(60)).toBe("B");
    expect(derivePerformanceTier(70)).toBe("B");
    expect(derivePerformanceTier(79)).toBe("B");
  });

  it("returns 'C' for scores 40–59", () => {
    expect(derivePerformanceTier(40)).toBe("C");
    expect(derivePerformanceTier(50)).toBe("C");
    expect(derivePerformanceTier(59)).toBe("C");
  });

  it("returns 'D' for scores below 40", () => {
    expect(derivePerformanceTier(0)).toBe("D");
    expect(derivePerformanceTier(20)).toBe("D");
    expect(derivePerformanceTier(39)).toBe("D");
  });

  it("handles boundary values correctly", () => {
    expect(derivePerformanceTier(79.9)).toBe("B");
    expect(derivePerformanceTier(80.0)).toBe("A");
    expect(derivePerformanceTier(59.9)).toBe("C");
    expect(derivePerformanceTier(60.0)).toBe("B");
    expect(derivePerformanceTier(39.9)).toBe("D");
    expect(derivePerformanceTier(40.0)).toBe("C");
  });
});
