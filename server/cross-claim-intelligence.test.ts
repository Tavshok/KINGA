/**
 * Cross-Claim Intelligence Engine — Unit Tests
 * ─────────────────────────────────────────────
 * Tests all pure functions exported from cross-claim-intelligence.ts:
 *   - deriveConfidence
 *   - computeScoreContribution
 *   - highestConfidence
 *   - sumScoreContributions
 *   - parseDateMs
 *   - withinDays
 *   - SIGNAL_WEIGHTS (spot checks)
 */

import { describe, it, expect } from "vitest";
import {
  deriveConfidence,
  computeScoreContribution,
  highestConfidence,
  sumScoreContributions,
  parseDateMs,
  withinDays,
  SIGNAL_WEIGHTS,
  type DetectedSignal,
} from "./cross-claim-intelligence";

// ─── deriveConfidence ─────────────────────────────────────────────────────────

describe("deriveConfidence", () => {
  it("returns 'low' for 1 occurrence", () => {
    expect(deriveConfidence(1)).toBe("low");
  });

  it("returns 'medium' for 2 occurrences", () => {
    expect(deriveConfidence(2)).toBe("medium");
  });

  it("returns 'medium' for 3 occurrences", () => {
    expect(deriveConfidence(3)).toBe("medium");
  });

  it("returns 'high' for 4 occurrences", () => {
    expect(deriveConfidence(4)).toBe("high");
  });

  it("returns 'high' for 10 occurrences", () => {
    expect(deriveConfidence(10)).toBe("high");
  });

  it("handles 0 occurrences as low", () => {
    expect(deriveConfidence(0)).toBe("low");
  });
});

// ─── computeScoreContribution ─────────────────────────────────────────────────

describe("computeScoreContribution", () => {
  it("returns the correct weight for staged_accident_signal at high confidence", () => {
    expect(computeScoreContribution("staged_accident_signal", "high")).toBe(25);
  });

  it("returns the correct weight for staged_accident_signal at medium confidence", () => {
    expect(computeScoreContribution("staged_accident_signal", "medium")).toBe(15);
  });

  it("returns the correct weight for staged_accident_signal at low confidence", () => {
    expect(computeScoreContribution("staged_accident_signal", "low")).toBe(8);
  });

  it("returns the correct weight for total_loss_repeat_signal at high confidence", () => {
    expect(computeScoreContribution("total_loss_repeat_signal", "high")).toBe(30);
  });

  it("returns the correct weight for vehicle_high_claim_frequency at medium confidence", () => {
    expect(computeScoreContribution("vehicle_high_claim_frequency", "medium")).toBe(12);
  });

  it("returns the correct weight for repeat_damage_signal at low confidence", () => {
    expect(computeScoreContribution("repeat_damage_signal", "low")).toBe(5);
  });

  it("returns the correct weight for repairer_driver_collusion_signal at high confidence", () => {
    expect(computeScoreContribution("repairer_driver_collusion_signal", "high")).toBe(22);
  });

  it("returns the correct weight for claim_velocity_signal at high confidence", () => {
    expect(computeScoreContribution("claim_velocity_signal", "high")).toBe(18);
  });
});

// ─── SIGNAL_WEIGHTS spot checks ───────────────────────────────────────────────

describe("SIGNAL_WEIGHTS", () => {
  it("all 9 signal types are defined", () => {
    const expectedTypes = [
      "repeat_damage_signal",
      "driver_repeat_claim_signal",
      "repairer_repeat_pattern_signal",
      "vehicle_high_claim_frequency",
      "damage_zone_repeat_signal",
      "staged_accident_signal",
      "repairer_driver_collusion_signal",
      "claim_velocity_signal",
      "total_loss_repeat_signal",
    ];
    for (const type of expectedTypes) {
      expect(SIGNAL_WEIGHTS[type as keyof typeof SIGNAL_WEIGHTS]).toBeDefined();
    }
  });

  it("each signal type has low, medium, and high weights", () => {
    for (const [, weights] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(weights).toHaveProperty("low");
      expect(weights).toHaveProperty("medium");
      expect(weights).toHaveProperty("high");
    }
  });

  it("high weight is always >= medium weight for all signal types", () => {
    for (const [, weights] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(weights.high).toBeGreaterThanOrEqual(weights.medium);
    }
  });

  it("medium weight is always >= low weight for all signal types", () => {
    for (const [, weights] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(weights.medium).toBeGreaterThanOrEqual(weights.low);
    }
  });

  it("no signal type has a high weight exceeding 30", () => {
    for (const [, weights] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(weights.high).toBeLessThanOrEqual(30);
    }
  });

  it("no signal type has a low weight below 3", () => {
    for (const [, weights] of Object.entries(SIGNAL_WEIGHTS)) {
      expect(weights.low).toBeGreaterThanOrEqual(3);
    }
  });
});

// ─── highestConfidence ────────────────────────────────────────────────────────

describe("highestConfidence", () => {
  it("returns null for empty signals array", () => {
    expect(highestConfidence([])).toBeNull();
  });

  it("returns 'high' when any signal is high", () => {
    const signals: DetectedSignal[] = [
      { signalType: "repeat_damage_signal", signalLabel: "test", confidence: "low", scoreContribution: 5, evidence: {} },
      { signalType: "staged_accident_signal", signalLabel: "test", confidence: "high", scoreContribution: 25, evidence: {} },
    ];
    expect(highestConfidence(signals)).toBe("high");
  });

  it("returns 'medium' when highest is medium", () => {
    const signals: DetectedSignal[] = [
      { signalType: "repeat_damage_signal", signalLabel: "test", confidence: "low", scoreContribution: 5, evidence: {} },
      { signalType: "driver_repeat_claim_signal", signalLabel: "test", confidence: "medium", scoreContribution: 10, evidence: {} },
    ];
    expect(highestConfidence(signals)).toBe("medium");
  });

  it("returns 'low' when all signals are low", () => {
    const signals: DetectedSignal[] = [
      { signalType: "repeat_damage_signal", signalLabel: "test", confidence: "low", scoreContribution: 5, evidence: {} },
      { signalType: "claim_velocity_signal", signalLabel: "test", confidence: "low", scoreContribution: 5, evidence: {} },
    ];
    expect(highestConfidence(signals)).toBe("low");
  });

  it("returns 'high' for a single high-confidence signal", () => {
    const signals: DetectedSignal[] = [
      { signalType: "total_loss_repeat_signal", signalLabel: "test", confidence: "high", scoreContribution: 30, evidence: {} },
    ];
    expect(highestConfidence(signals)).toBe("high");
  });
});

// ─── sumScoreContributions ────────────────────────────────────────────────────

describe("sumScoreContributions", () => {
  it("returns 0 for empty signals array", () => {
    expect(sumScoreContributions([])).toBe(0);
  });

  it("sums contributions correctly", () => {
    const signals: DetectedSignal[] = [
      { signalType: "repeat_damage_signal", signalLabel: "test", confidence: "low", scoreContribution: 5, evidence: {} },
      { signalType: "staged_accident_signal", signalLabel: "test", confidence: "high", scoreContribution: 25, evidence: {} },
    ];
    expect(sumScoreContributions(signals)).toBe(30);
  });

  it("caps at 100", () => {
    const signals: DetectedSignal[] = Array(10).fill({
      signalType: "total_loss_repeat_signal",
      signalLabel: "test",
      confidence: "high",
      scoreContribution: 30,
      evidence: {},
    });
    expect(sumScoreContributions(signals)).toBe(100);
  });

  it("handles a single signal", () => {
    const signals: DetectedSignal[] = [
      { signalType: "vehicle_high_claim_frequency", signalLabel: "test", confidence: "medium", scoreContribution: 12, evidence: {} },
    ];
    expect(sumScoreContributions(signals)).toBe(12);
  });

  it("does not exceed 100 for large contributions", () => {
    const signals: DetectedSignal[] = [
      { signalType: "staged_accident_signal", signalLabel: "test", confidence: "high", scoreContribution: 60, evidence: {} },
      { signalType: "total_loss_repeat_signal", signalLabel: "test", confidence: "high", scoreContribution: 60, evidence: {} },
    ];
    expect(sumScoreContributions(signals)).toBe(100);
  });
});

// ─── parseDateMs ─────────────────────────────────────────────────────────────

describe("parseDateMs", () => {
  it("returns null for null input", () => {
    expect(parseDateMs(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseDateMs(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDateMs("")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(parseDateMs("not-a-date")).toBeNull();
  });

  it("returns a number for a valid ISO date string", () => {
    const result = parseDateMs("2026-01-15");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("returns a number for a valid ISO datetime string", () => {
    const result = parseDateMs("2026-01-15T10:30:00Z");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("number");
  });

  it("returns consistent values for the same date", () => {
    const a = parseDateMs("2026-03-01");
    const b = parseDateMs("2026-03-01");
    expect(a).toBe(b);
  });

  it("returns larger value for later date", () => {
    const earlier = parseDateMs("2026-01-01");
    const later = parseDateMs("2026-06-01");
    expect(later!).toBeGreaterThan(earlier!);
  });
});

// ─── withinDays ───────────────────────────────────────────────────────────────

describe("withinDays", () => {
  it("returns false when either date is null", () => {
    expect(withinDays(null, "2026-01-15", 30)).toBe(false);
    expect(withinDays("2026-01-15", null, 30)).toBe(false);
    expect(withinDays(null, null, 30)).toBe(false);
  });

  it("returns false when either date is invalid", () => {
    expect(withinDays("not-a-date", "2026-01-15", 30)).toBe(false);
    expect(withinDays("2026-01-15", "not-a-date", 30)).toBe(false);
  });

  it("returns true when dates are the same", () => {
    expect(withinDays("2026-01-15", "2026-01-15", 30)).toBe(true);
  });

  it("returns true when dates are within the threshold", () => {
    expect(withinDays("2026-01-01", "2026-01-15", 30)).toBe(true);
  });

  it("returns false when dates exceed the threshold", () => {
    expect(withinDays("2026-01-01", "2026-03-01", 30)).toBe(false);
  });

  it("handles exactly on the boundary (30 days apart)", () => {
    expect(withinDays("2026-01-01", "2026-01-31", 30)).toBe(true);
  });

  it("handles dates in reverse order (absolute difference)", () => {
    expect(withinDays("2026-01-15", "2026-01-01", 30)).toBe(true);
    expect(withinDays("2026-03-01", "2026-01-01", 30)).toBe(false);
  });

  it("works with a 90-day window", () => {
    expect(withinDays("2026-01-01", "2026-03-15", 90)).toBe(true);
    expect(withinDays("2026-01-01", "2026-05-01", 90)).toBe(false);
  });

  it("works with a 12-month (365-day) window", () => {
    expect(withinDays("2026-01-01", "2026-12-01", 365)).toBe(true);
    expect(withinDays("2026-01-01", "2027-02-01", 365)).toBe(false);
  });
});
