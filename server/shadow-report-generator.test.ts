/**
 * shadow-report-generator.test.ts
 *
 * Unit tests for the role-based shadow monitoring report generator.
 * Tests cover pure functions only (no DB required).
 */

import { describe, it, expect } from "vitest";
import {
  computeTrendDescription,
  computeDistribution,
} from "./shadow-report-generator";

// ─────────────────────────────────────────────────────────────────────────────
// computeTrendDescription
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTrendDescription", () => {
  it("returns insufficient data message for fewer than 4 data points", () => {
    const result = computeTrendDescription([
      { day: "2026-03-01", overrides: 2 },
      { day: "2026-03-02", overrides: 3 },
    ]);
    expect(result).toContain("Insufficient data");
  });

  it("returns no activity message when all values are zero", () => {
    const data = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-03-0${i + 1}`,
      overrides: 0,
    }));
    const result = computeTrendDescription(data);
    expect(result).toContain("No override activity");
  });

  it("detects stable trend when change is less than 10%", () => {
    const data = [
      { day: "2026-03-01", overrides: 5 },
      { day: "2026-03-02", overrides: 5 },
      { day: "2026-03-03", overrides: 5 },
      { day: "2026-03-04", overrides: 5 },
      { day: "2026-03-05", overrides: 5 },
      { day: "2026-03-06", overrides: 5 },
    ];
    const result = computeTrendDescription(data);
    expect(result).toContain("stable");
  });

  it("detects notable upward trend when second half is >30% higher", () => {
    const data = [
      { day: "2026-03-01", overrides: 2 },
      { day: "2026-03-02", overrides: 2 },
      { day: "2026-03-03", overrides: 2 },
      { day: "2026-03-04", overrides: 10 },
      { day: "2026-03-05", overrides: 10 },
      { day: "2026-03-06", overrides: 10 },
    ];
    const result = computeTrendDescription(data);
    expect(result).toContain("upward");
    expect(result).toContain("+");
  });

  it("detects notable downward trend when second half is >30% lower", () => {
    const data = [
      { day: "2026-03-01", overrides: 10 },
      { day: "2026-03-02", overrides: 10 },
      { day: "2026-03-03", overrides: 10 },
      { day: "2026-03-04", overrides: 2 },
      { day: "2026-03-05", overrides: 2 },
      { day: "2026-03-06", overrides: 2 },
    ];
    const result = computeTrendDescription(data);
    expect(result).toContain("downward");
  });

  it("detects modest upward trend when change is between 10% and 30%", () => {
    const data = [
      { day: "2026-03-01", overrides: 8 },
      { day: "2026-03-02", overrides: 8 },
      { day: "2026-03-03", overrides: 8 },
      { day: "2026-03-04", overrides: 10 },
      { day: "2026-03-05", overrides: 10 },
      { day: "2026-03-06", overrides: 10 },
    ];
    const result = computeTrendDescription(data);
    expect(result).toContain("upward");
  });

  it("handles first half average of zero with non-zero second half", () => {
    const data = [
      { day: "2026-03-01", overrides: 0 },
      { day: "2026-03-02", overrides: 0 },
      { day: "2026-03-03", overrides: 0 },
      { day: "2026-03-04", overrides: 5 },
      { day: "2026-03-05", overrides: 5 },
      { day: "2026-03-06", overrides: 5 },
    ];
    const result = computeTrendDescription(data);
    // Should not throw; should detect upward movement
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDistribution", () => {
  it("returns all zeros for empty input", () => {
    const dist = computeDistribution([]);
    expect(dist).toEqual({
      zero_overrides: 0,
      low_1_to_5: 0,
      medium_6_to_14: 0,
      high_15_plus: 0,
    });
  });

  it("correctly buckets zero-override users", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 0, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u2", user_name: null, override_count: 0, total_actions: 5, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.zero_overrides).toBe(2);
    expect(dist.low_1_to_5).toBe(0);
  });

  it("correctly buckets low-frequency users (1–5)", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 1, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u2", user_name: null, override_count: 5, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.low_1_to_5).toBe(2);
    expect(dist.medium_6_to_14).toBe(0);
  });

  it("correctly buckets medium-frequency users (6–14)", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 6, total_actions: 20, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u2", user_name: null, override_count: 14, total_actions: 20, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.medium_6_to_14).toBe(2);
    expect(dist.high_15_plus).toBe(0);
  });

  it("correctly buckets high-frequency users (15+)", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 15, total_actions: 30, unusual_pattern: true, pattern_notes: "High" },
      { user_id: "u2", user_name: null, override_count: 100, total_actions: 120, unusual_pattern: true, pattern_notes: "High" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.high_15_plus).toBe(2);
  });

  it("correctly distributes a mixed set of users", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 0, total_actions: 5, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u2", user_name: null, override_count: 3, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u3", user_name: null, override_count: 8, total_actions: 15, unusual_pattern: false, pattern_notes: "" },
      { user_id: "u4", user_name: null, override_count: 20, total_actions: 25, unusual_pattern: true, pattern_notes: "High" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.zero_overrides).toBe(1);
    expect(dist.low_1_to_5).toBe(1);
    expect(dist.medium_6_to_14).toBe(1);
    expect(dist.high_15_plus).toBe(1);
  });

  it("boundary: count of 5 goes into low, not medium", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 5, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.low_1_to_5).toBe(1);
    expect(dist.medium_6_to_14).toBe(0);
  });

  it("boundary: count of 6 goes into medium, not low", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 6, total_actions: 10, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.medium_6_to_14).toBe(1);
    expect(dist.low_1_to_5).toBe(0);
  });

  it("boundary: count of 14 goes into medium, not high", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 14, total_actions: 20, unusual_pattern: false, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.medium_6_to_14).toBe(1);
    expect(dist.high_15_plus).toBe(0);
  });

  it("boundary: count of 15 goes into high, not medium", () => {
    const rows = [
      { user_id: "u1", user_name: null, override_count: 15, total_actions: 20, unusual_pattern: true, pattern_notes: "" },
    ];
    const dist = computeDistribution(rows);
    expect(dist.high_15_plus).toBe(1);
    expect(dist.medium_6_to_14).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Report output shape invariants (pure logic, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("Shadow report output invariants", () => {
  it("computeTrendDescription always returns a non-empty string", () => {
    const cases = [
      [],
      [{ day: "2026-03-01", overrides: 0 }],
      Array.from({ length: 10 }, (_, i) => ({ day: `2026-03-${String(i + 1).padStart(2, "0")}`, overrides: i })),
    ];
    for (const c of cases) {
      const result = computeTrendDescription(c);
      expect(typeof result).toBe("string");
      expect(result.trim().length).toBeGreaterThan(0);
    }
  });

  it("computeDistribution totals always equal input row count", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      user_id: `u${i}`,
      user_name: null,
      override_count: i,
      total_actions: i + 5,
      unusual_pattern: i > 14,
      pattern_notes: "",
    }));
    const dist = computeDistribution(rows);
    const total = dist.zero_overrides + dist.low_1_to_5 + dist.medium_6_to_14 + dist.high_15_plus;
    expect(total).toBe(rows.length);
  });

  it("computeDistribution never returns negative values", () => {
    const dist = computeDistribution([]);
    for (const v of Object.values(dist)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
