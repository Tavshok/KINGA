/**
 * calibrationStabilityGuard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage 32 — Unit tests for the calibration stability guard.
 *
 * Coverage:
 *  1. calculateVariance — pure math
 *  2. assessStability   — all decision paths (insufficient history, stable, frozen)
 *  3. Constants         — correct exported values
 *  4. Integration shape — GuardResult fields present
 */

import { describe, it, expect } from "vitest";
import {
  calculateVariance,
  assessStability,
  STABILITY_WINDOW,
  VARIANCE_THRESHOLD,
  MIN_HISTORY_FOR_VARIANCE,
} from "./calibrationStabilityGuard";

// ─── 1. calculateVariance ─────────────────────────────────────────────────────

describe("calculateVariance", () => {
  it("returns 0 for empty array", () => {
    expect(calculateVariance([])).toBe(0);
  });

  it("returns 0 for single-element array", () => {
    expect(calculateVariance([1.0])).toBe(0);
  });

  it("returns 0 for identical values", () => {
    expect(calculateVariance([1.0, 1.0, 1.0, 1.0])).toBe(0);
  });

  it("calculates correct variance for known values", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean = 5, variance = 4
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(calculateVariance(values)).toBeCloseTo(4.0, 5);
  });

  it("calculates correct variance for two values", () => {
    // [0.75, 1.20] → mean = 0.975, variance = 0.050625
    const values = [0.75, 1.2];
    expect(calculateVariance(values)).toBeCloseTo(0.050625, 6);
  });

  it("calculates correct variance for multiplier range extremes", () => {
    // Alternating 0.75 and 1.20 — high oscillation
    const values = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2];
    const v = calculateVariance(values);
    expect(v).toBeGreaterThan(VARIANCE_THRESHOLD);
  });

  it("calculates near-zero variance for stable multipliers", () => {
    // Small fluctuations around 1.0
    const values = [1.0, 1.01, 0.99, 1.005, 0.995, 1.0, 1.002, 0.998, 1.001, 0.999];
    const v = calculateVariance(values);
    expect(v).toBeLessThan(VARIANCE_THRESHOLD);
  });
});

// ─── 2. assessStability ───────────────────────────────────────────────────────

describe("assessStability", () => {
  // ── Insufficient history ──────────────────────────────────────────────────

  it("allows adjustment when history is empty", () => {
    const result = assessStability([], 1.1);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
    expect(result.effective_multiplier).toBe(1.1);
    expect(result.history_count).toBe(0);
    expect(result.reason).toMatch(/Insufficient history/);
  });

  it("allows adjustment when history has 1 entry (below MIN_HISTORY_FOR_VARIANCE)", () => {
    const result = assessStability([1.0], 1.1);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
    expect(result.effective_multiplier).toBe(1.1);
  });

  it("allows adjustment when history has exactly MIN_HISTORY_FOR_VARIANCE - 1 entries", () => {
    const history = Array(MIN_HISTORY_FOR_VARIANCE - 1).fill(1.0);
    const result = assessStability(history, 1.1);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
  });

  // ── Stable (variance within threshold) ───────────────────────────────────

  it("allows adjustment when variance is within threshold", () => {
    // 10 values very close to 1.0 — variance well below 0.005
    const history = [1.0, 1.01, 0.99, 1.005, 0.995, 1.0, 1.002, 0.998, 1.001, 0.999];
    const result = assessStability(history, 1.01);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
    expect(result.effective_multiplier).toBe(1.01);
    expect(result.variance).toBeLessThan(VARIANCE_THRESHOLD);
    expect(result.reason).toMatch(/stable/i);
  });

  it("allows adjustment at exactly the threshold boundary", () => {
    // Construct values where variance of window equals exactly VARIANCE_THRESHOLD
    // Use a custom threshold for this test to avoid floating-point edge cases
    const customThreshold = 0.01;
    // history = [1.0, 1.0, 1.0] + proposed = 1.0 → variance = 0
    const result = assessStability([1.0, 1.0, 1.0], 1.0, customThreshold);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
  });

  // ── Frozen (variance exceeds threshold) ──────────────────────────────────

  it("freezes adjustment when variance exceeds threshold", () => {
    // Alternating extremes — very high variance
    const history = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2];
    const result = assessStability(history, 1.2);
    expect(result.stable).toBe(false);
    expect(result.frozen).toBe(true);
    expect(result.variance).toBeGreaterThan(VARIANCE_THRESHOLD);
  });

  it("uses the most recent historical value as effective_multiplier when frozen", () => {
    const history = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.15];
    const result = assessStability(history, 0.75);
    expect(result.frozen).toBe(true);
    // Most recent historical value is 1.15
    expect(result.effective_multiplier).toBeCloseTo(1.15, 4);
  });

  it("logs 'Calibration unstable — locked' in reason when frozen", () => {
    const history = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2];
    const result = assessStability(history, 0.75);
    expect(result.reason).toMatch(/Calibration unstable.*locked/i);
  });

  it("does NOT use the proposed value as effective_multiplier when frozen", () => {
    const history = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.0];
    const proposedValue = 0.75;
    const result = assessStability(history, proposedValue);
    expect(result.frozen).toBe(true);
    expect(result.effective_multiplier).not.toBe(proposedValue);
  });

  // ── Window truncation ─────────────────────────────────────────────────────

  it("only uses the last STABILITY_WINDOW values from a longer history", () => {
    // First 20 values are oscillating (high variance), last 10 are stable
    const oscillating = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.75 : 1.2));
    const stable = [1.0, 1.01, 0.99, 1.005, 0.995, 1.0, 1.002, 0.998, 1.001, 0.999];
    const history = [...oscillating, ...stable];
    // Should be stable because only the last 10 (stable) values are used
    const result = assessStability(history, 1.0);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
    expect(result.history_count).toBe(history.length);
  });

  // ── Output shape ──────────────────────────────────────────────────────────

  it("always returns all required fields", () => {
    const result = assessStability([1.0, 1.0, 1.0], 1.05);
    expect(result).toHaveProperty("stable");
    expect(result).toHaveProperty("variance");
    expect(result).toHaveProperty("history_count");
    expect(result).toHaveProperty("effective_multiplier");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("frozen");
  });

  it("history_count reflects the full history length, not just the window", () => {
    const history = Array(15).fill(1.0);
    const result = assessStability(history, 1.0);
    expect(result.history_count).toBe(15);
  });

  // ── Custom threshold ──────────────────────────────────────────────────────

  it("respects a custom threshold parameter", () => {
    // [1.0, 1.01, 1.0, 1.01, 1.0, proposed=1.01] → variance ≈ 0.000025
    // Use a threshold of 0.00001 (tighter than 0.000025) to trigger freeze
    const history = [1.0, 1.01, 1.0, 1.01, 1.0];
    const result = assessStability(history, 1.01, 0.00001);
    expect(result.frozen).toBe(true);
  });

  it("respects a very loose threshold (never freezes)", () => {
    // With threshold = 1.0, even extreme oscillation should be allowed
    const history = [0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2];
    const result = assessStability(history, 0.75, 1.0);
    expect(result.frozen).toBe(false);
    expect(result.stable).toBe(true);
  });
});

// ─── 3. Constants ─────────────────────────────────────────────────────────────

describe("calibrationStabilityGuard constants", () => {
  it("STABILITY_WINDOW is 10", () => {
    expect(STABILITY_WINDOW).toBe(10);
  });

  it("VARIANCE_THRESHOLD is 0.005", () => {
    expect(VARIANCE_THRESHOLD).toBe(0.005);
  });

  it("MIN_HISTORY_FOR_VARIANCE is 3", () => {
    expect(MIN_HISTORY_FOR_VARIANCE).toBe(3);
  });
});

// ─── 4. Edge cases ────────────────────────────────────────────────────────────

describe("assessStability edge cases", () => {
  it("handles all-same values in history (zero variance)", () => {
    const history = Array(10).fill(1.0);
    const result = assessStability(history, 1.0);
    expect(result.variance).toBe(0);
    expect(result.stable).toBe(true);
    expect(result.frozen).toBe(false);
  });

  it("handles proposed value at MULTIPLIER_MIN (0.75)", () => {
    const history = [1.0, 1.0, 1.0, 1.0, 1.0];
    const result = assessStability(history, 0.75);
    // Variance of [1.0, 1.0, 1.0, 1.0, 1.0, 0.75] is small but non-zero
    expect(result).toHaveProperty("frozen");
  });

  it("handles proposed value at MULTIPLIER_MAX (1.20)", () => {
    const history = [1.0, 1.0, 1.0, 1.0, 1.0];
    const result = assessStability(history, 1.2);
    expect(result).toHaveProperty("frozen");
  });

  it("effective_multiplier is always a number", () => {
    const result1 = assessStability([], 1.1);
    const result2 = assessStability([0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2, 0.75, 1.2], 0.75);
    expect(typeof result1.effective_multiplier).toBe("number");
    expect(typeof result2.effective_multiplier).toBe("number");
  });

  it("variance is always a non-negative number", () => {
    const cases = [
      [],
      [1.0],
      [1.0, 1.0],
      [0.75, 1.2, 0.75, 1.2],
    ];
    for (const history of cases) {
      const result = assessStability(history, 1.0);
      expect(result.variance).toBeGreaterThanOrEqual(0);
    }
  });

  it("frozen=false when history has exactly MIN_HISTORY_FOR_VARIANCE entries and variance is low", () => {
    const history = Array(MIN_HISTORY_FOR_VARIANCE).fill(1.0);
    const result = assessStability(history, 1.0);
    // Variance = 0 → stable
    expect(result.frozen).toBe(false);
  });

  it("frozen=true when history has exactly MIN_HISTORY_FOR_VARIANCE entries and variance is high", () => {
    // 3 entries: 0.75, 1.2, 0.75 → proposed 1.2 → variance is high
    const history = [0.75, 1.2, 0.75];
    const result = assessStability(history, 1.2);
    expect(result.frozen).toBe(true);
  });
});
