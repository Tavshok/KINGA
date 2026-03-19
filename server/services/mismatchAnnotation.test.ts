/**
 * mismatchAnnotation.test.ts
 *
 * Unit tests for the adaptive weight and confirmation-rate logic
 * in the mismatchAnnotation service.
 *
 * Stage 23 rules under test:
 *   1. MINIMUM SAMPLE GATE  — no adjustment when total_annotations < 20
 *   2. MULTIPLIER CLAMP     — raw multiplier constrained to [0.75, 1.20]
 *   3. SMOOTHING            — new_weight = (0.7 × current) + (0.3 × suggested)
 *   4. ADJUSTMENT LOG       — log entry written for every non-neutral adjustment
 */

import { describe, it, expect } from "vitest";
import {
  computeTypeStats,
  applySmoothing,
  clampMultiplier,
  MIN_SAMPLE_SIZE,
  MULTIPLIER_MIN,
  MULTIPLIER_MAX,
} from "./mismatchAnnotation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns computeTypeStats with enough annotations to pass the sample gate */
function statsAboveGate(
  confirmed: number,
  dismissed: number,
  currentMultiplier = 1.0,
) {
  // Pad to at least MIN_SAMPLE_SIZE if needed
  const total = confirmed + dismissed;
  const extra = Math.max(0, MIN_SAMPLE_SIZE - total);
  // Add extra as neutral (equal confirm/dismiss) to avoid shifting the rate
  const extraConfirm = Math.floor(extra / 2);
  const extraDismiss = extra - extraConfirm;
  return computeTypeStats(
    "zone_mismatch",
    confirmed + extraConfirm,
    dismissed + extraDismiss,
    currentMultiplier,
  );
}

// ─── computeTypeStats — confirmation rate ─────────────────────────────────────

describe("computeTypeStats — confirmation rate", () => {
  it("returns confirmation_rate 0 when there are no annotations", () => {
    const stats = computeTypeStats("zone_mismatch", 0, 0);
    expect(stats.confirmation_rate).toBe(0);
    expect(stats.total_annotations).toBe(0);
  });

  it("returns confirmation_rate 1.0 when all annotations are confirmations", () => {
    const stats = computeTypeStats("zone_mismatch", 10, 0);
    expect(stats.confirmation_rate).toBe(1.0);
  });

  it("returns confirmation_rate 0.0 when all annotations are dismissals", () => {
    const stats = computeTypeStats("zone_mismatch", 0, 10);
    expect(stats.confirmation_rate).toBe(0.0);
  });

  it("returns confirmation_rate 0.5 for equal confirm/dismiss", () => {
    const stats = computeTypeStats("zone_mismatch", 5, 5);
    expect(stats.confirmation_rate).toBe(0.5);
  });

  it("rounds confirmation_rate to 4 decimal places", () => {
    // 1 confirm, 2 dismiss → 1/3 ≈ 0.3333
    const stats = computeTypeStats("zone_mismatch", 1, 2);
    expect(stats.confirmation_rate).toBeCloseTo(0.3333, 4);
  });
});

// ─── Stage 23 Rule 1: Minimum sample gate ─────────────────────────────────────

describe("Stage 23 Rule 1 — minimum sample gate (MIN_SAMPLE_SIZE = 20)", () => {
  it("MIN_SAMPLE_SIZE constant is 20", () => {
    expect(MIN_SAMPLE_SIZE).toBe(20);
  });

  it("returns neutral multiplier (1.0) when total < 20", () => {
    // 19 annotations — just below the gate
    const stats = computeTypeStats("zone_mismatch", 16, 3); // 19 total, 84% confirm
    expect(stats.system_adjustment.sample_size_sufficient).toBe(false);
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
    expect(stats.system_adjustment.sensitivity_direction).toBe("neutral");
  });

  it("does NOT adjust weight for 1 annotation even with 100% confirmation", () => {
    const stats = computeTypeStats("zone_mismatch", 1, 0);
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
    expect(stats.system_adjustment.sample_size_sufficient).toBe(false);
  });

  it("does NOT adjust weight for 10 annotations even with 100% confirmation", () => {
    const stats = computeTypeStats("zone_mismatch", 10, 0);
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
    expect(stats.system_adjustment.sample_size_sufficient).toBe(false);
  });

  it("does NOT adjust weight for 19 annotations even with 100% confirmation", () => {
    const stats = computeTypeStats("zone_mismatch", 19, 0);
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
    expect(stats.system_adjustment.sample_size_sufficient).toBe(false);
  });

  it("DOES allow adjustment at exactly 20 annotations", () => {
    // 20 annotations, 80% confirmation → should fire increase
    const stats = computeTypeStats("zone_mismatch", 16, 4); // 80%, n=20
    expect(stats.system_adjustment.sample_size_sufficient).toBe(true);
    expect(stats.system_adjustment.sensitivity_direction).toBe("increase");
  });

  it("DOES allow adjustment above 20 annotations", () => {
    const stats = computeTypeStats("zone_mismatch", 21, 0); // 100%, n=21
    expect(stats.system_adjustment.sample_size_sufficient).toBe(true);
    expect(stats.system_adjustment.sensitivity_direction).toBe("increase");
  });

  it("reason string mentions the gate when sample is insufficient", () => {
    const stats = computeTypeStats("zone_mismatch", 5, 5);
    expect(stats.system_adjustment.reason).toMatch(/insufficient sample/i);
    expect(stats.system_adjustment.reason).toContain("20");
  });
});

// ─── Stage 23 Rule 2: Multiplier clamp ────────────────────────────────────────

describe("Stage 23 Rule 2 — multiplier clamp [0.75, 1.20]", () => {
  it("MULTIPLIER_MIN constant is 0.75", () => {
    expect(MULTIPLIER_MIN).toBe(0.75);
  });

  it("MULTIPLIER_MAX constant is 1.20", () => {
    expect(MULTIPLIER_MAX).toBe(1.20);
  });

  it("clampMultiplier(0.6) returns 0.75 (lower bound)", () => {
    expect(clampMultiplier(0.6)).toBe(0.75);
  });

  it("clampMultiplier(1.25) returns 1.20 (upper bound)", () => {
    expect(clampMultiplier(1.25)).toBe(1.20);
  });

  it("clampMultiplier(1.0) returns 1.0 (within range)", () => {
    expect(clampMultiplier(1.0)).toBe(1.0);
  });

  it("clampMultiplier(0.75) returns 0.75 (at lower bound)", () => {
    expect(clampMultiplier(0.75)).toBe(0.75);
  });

  it("clampMultiplier(1.20) returns 1.20 (at upper bound)", () => {
    expect(clampMultiplier(1.20)).toBe(1.20);
  });

  it("clampMultiplier(0.0) returns 0.75 (far below lower bound)", () => {
    expect(clampMultiplier(0.0)).toBe(0.75);
  });

  it("clampMultiplier(2.0) returns 1.20 (far above upper bound)", () => {
    expect(clampMultiplier(2.0)).toBe(1.20);
  });

  it("high confirmation rate: final weight_multiplier <= 1.20", () => {
    // 20 annotations, 100% confirm
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment.weight_multiplier).toBeLessThanOrEqual(1.20);
  });

  it("low confirmation rate: final weight_multiplier >= 0.75", () => {
    // 20 annotations, 0% confirm
    const stats = computeTypeStats("zone_mismatch", 0, 20, 1.0);
    expect(stats.system_adjustment.weight_multiplier).toBeGreaterThanOrEqual(0.75);
  });

  it("weight_multiplier is always within [0.75, 1.20] regardless of input", () => {
    const cases: [number, number][] = [
      [20, 0],  // 100% confirm
      [0, 20],  // 0% confirm
      [15, 5],  // 75% confirm
      [5, 15],  // 25% confirm
      [10, 10], // 50% confirm (neutral)
    ];
    for (const [c, d] of cases) {
      const stats = computeTypeStats("zone_mismatch", c, d, 1.0);
      expect(stats.system_adjustment.weight_multiplier).toBeGreaterThanOrEqual(0.75);
      expect(stats.system_adjustment.weight_multiplier).toBeLessThanOrEqual(1.20);
    }
  });

  // Old behaviour (1.25 / 0.6) must no longer appear as final multiplier
  it("weight_multiplier is NOT 1.25 for high confirmation (old raw value is now smoothed/clamped)", () => {
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment.weight_multiplier).not.toBe(1.25);
  });

  it("weight_multiplier is NOT 0.6 for low confirmation (old raw value is now smoothed/clamped)", () => {
    const stats = computeTypeStats("zone_mismatch", 0, 20, 1.0);
    expect(stats.system_adjustment.weight_multiplier).not.toBe(0.6);
  });
});

// ─── Stage 23 Rule 3: Smoothing ───────────────────────────────────────────────

describe("Stage 23 Rule 3 — smoothing formula: (0.7 × current) + (0.3 × suggested)", () => {
  it("applySmoothing(1.0, 1.20) = 1.06", () => {
    // 0.7 × 1.0 + 0.3 × 1.20 = 0.70 + 0.36 = 1.06
    expect(applySmoothing(1.0, 1.20)).toBeCloseTo(1.06, 4);
  });

  it("applySmoothing(1.0, 0.75) = 0.925", () => {
    // 0.7 × 1.0 + 0.3 × 0.75 = 0.70 + 0.225 = 0.925
    expect(applySmoothing(1.0, 0.75)).toBeCloseTo(0.925, 4);
  });

  it("applySmoothing(1.0, 1.0) = 1.0 (neutral stays neutral)", () => {
    expect(applySmoothing(1.0, 1.0)).toBeCloseTo(1.0, 4);
  });

  it("applySmoothing respects lower clamp: result >= 0.75", () => {
    // Even with very low suggested, result must be >= 0.75
    expect(applySmoothing(0.75, 0.75)).toBeGreaterThanOrEqual(0.75);
  });

  it("applySmoothing respects upper clamp: result <= 1.20", () => {
    expect(applySmoothing(1.20, 1.20)).toBeLessThanOrEqual(1.20);
  });

  it("applySmoothing(1.0, 1.20) result is clamped to 1.20 if smoothed exceeds it", () => {
    // 0.7 × 1.20 + 0.3 × 1.20 = 1.20 — exactly at boundary
    expect(applySmoothing(1.20, 1.20)).toBe(1.20);
  });

  it("computeTypeStats high-confirm: smoothed multiplier = (0.7 × 1.0) + (0.3 × 1.20)", () => {
    // Raw high = 1.25, clamped to 1.20, then smoothed from current=1.0
    // Expected: 0.7 × 1.0 + 0.3 × 1.20 = 1.06
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment.weight_multiplier).toBeCloseTo(1.06, 4);
  });

  it("computeTypeStats low-confirm: smoothed multiplier = (0.7 × 1.0) + (0.3 × 0.75)", () => {
    // Raw low = 0.6, clamped to 0.75, then smoothed from current=1.0
    // Expected: 0.7 × 1.0 + 0.3 × 0.75 = 0.925
    const stats = computeTypeStats("zone_mismatch", 0, 20, 1.0);
    expect(stats.system_adjustment.weight_multiplier).toBeCloseTo(0.925, 4);
  });

  it("computeTypeStats with non-default current: smoothing blends from current correctly", () => {
    // current = 1.06 (from a previous run), raw high = 1.25 → clamped 1.20
    // Expected: 0.7 × 1.06 + 0.3 × 1.20 = 0.742 + 0.36 = 1.102
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.06);
    expect(stats.system_adjustment.weight_multiplier).toBeCloseTo(1.102, 3);
  });

  it("raw_multiplier is exposed on the adjustment for audit purposes", () => {
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment).toHaveProperty("raw_multiplier");
    expect(stats.system_adjustment.raw_multiplier).toBe(1.20); // clamped from 1.25
  });

  it("raw_multiplier for low-confirm is 0.75 (clamped from 0.6)", () => {
    const stats = computeTypeStats("zone_mismatch", 0, 20, 1.0);
    expect(stats.system_adjustment.raw_multiplier).toBe(0.75);
  });
});

// ─── Stage 23 Rule 4: Adjustment log (unit-level) ─────────────────────────────

describe("Stage 23 Rule 4 — adjustment log fields are present on non-neutral adjustments", () => {
  it("system_adjustment includes raw_multiplier field", () => {
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment).toHaveProperty("raw_multiplier");
  });

  it("system_adjustment includes weight_multiplier field (smoothed)", () => {
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    expect(stats.system_adjustment).toHaveProperty("weight_multiplier");
  });

  it("system_adjustment.reason includes both raw and smoothed multipliers for traceability", () => {
    const stats = computeTypeStats("zone_mismatch", 20, 0, 1.0);
    // Reason should mention the raw and smoothed values
    expect(stats.system_adjustment.reason).toMatch(/1\.20|1\.06/);
  });

  it("neutral adjustment does NOT expose raw/smoothed multiplier detail in reason", () => {
    const stats = computeTypeStats("zone_mismatch", 10, 10, 1.0); // 50%, neutral
    // Neutral reason should just say "no adjustment applied"
    expect(stats.system_adjustment.reason).toMatch(/no adjustment/i);
  });
});

// ─── computeTypeStats — output structure ──────────────────────────────────────

describe("computeTypeStats — output structure", () => {
  it("includes all required output fields", () => {
    const stats = computeTypeStats("component_unreported", 15, 5); // 75%, n=20
    expect(stats).toHaveProperty("mismatch_type", "component_unreported");
    expect(stats).toHaveProperty("total_annotations", 20);
    expect(stats).toHaveProperty("confirmed", 15);
    expect(stats).toHaveProperty("dismissed", 5);
    expect(stats).toHaveProperty("confirmation_rate");
    expect(stats).toHaveProperty("system_adjustment");
    expect(stats.system_adjustment).toHaveProperty("weight_multiplier");
    expect(stats.system_adjustment).toHaveProperty("raw_multiplier");
    expect(stats.system_adjustment).toHaveProperty("sensitivity_direction");
    expect(stats.system_adjustment).toHaveProperty("reason");
    expect(stats.system_adjustment).toHaveProperty("sample_size_sufficient");
  });

  it("reason string is non-empty", () => {
    const stats = computeTypeStats("zone_mismatch", 10, 10);
    expect(stats.system_adjustment.reason.length).toBeGreaterThan(0);
  });

  it("total_annotations equals confirmed + dismissed", () => {
    const stats = computeTypeStats("no_photo_evidence", 14, 6);
    expect(stats.total_annotations).toBe(stats.confirmed + stats.dismissed);
  });

  it("returns neutral direction for mid-range confirmation rate (50%)", () => {
    const stats = computeTypeStats("zone_mismatch", 10, 10); // n=20, 50%
    expect(stats.system_adjustment.sensitivity_direction).toBe("neutral");
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
  });

  it("returns increase direction for high confirmation rate (80%, n=20)", () => {
    const stats = computeTypeStats("zone_mismatch", 16, 4); // n=20, 80%
    expect(stats.system_adjustment.sensitivity_direction).toBe("increase");
    expect(stats.system_adjustment.weight_multiplier).toBeGreaterThan(1.0);
  });

  it("returns decrease direction for low confirmation rate (20%, n=20)", () => {
    const stats = computeTypeStats("zone_mismatch", 4, 16); // n=20, 20%
    expect(stats.system_adjustment.sensitivity_direction).toBe("decrease");
    expect(stats.system_adjustment.weight_multiplier).toBeLessThan(1.0);
  });
});

// ─── applySmoothing edge cases ────────────────────────────────────────────────

describe("applySmoothing — edge cases", () => {
  it("returns a number rounded to 4 decimal places", () => {
    const result = applySmoothing(1.0, 1.20);
    const str = result.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it("is deterministic — same inputs always produce same output", () => {
    expect(applySmoothing(1.0, 1.20)).toBe(applySmoothing(1.0, 1.20));
    expect(applySmoothing(0.9, 0.75)).toBe(applySmoothing(0.9, 0.75));
  });
});
