/**
 * mismatchAnnotation.test.ts
 *
 * Unit tests for the adaptive weight and confirmation-rate logic
 * in the mismatchAnnotation service.
 */

import { describe, it, expect } from "vitest";
import { computeTypeStats } from "./mismatchAnnotation";

// ─── computeTypeStats ─────────────────────────────────────────────────────────

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

describe("computeTypeStats — sample size guard", () => {
  it("returns neutral with sample_size_sufficient=false when n < 5", () => {
    const stats = computeTypeStats("zone_mismatch", 3, 1);
    expect(stats.system_adjustment.sample_size_sufficient).toBe(false);
    expect(stats.system_adjustment.sensitivity_direction).toBe("neutral");
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
  });

  it("returns sample_size_sufficient=true when n >= 5", () => {
    const stats = computeTypeStats("zone_mismatch", 4, 1); // n=5
    expect(stats.system_adjustment.sample_size_sufficient).toBe(true);
  });
});

describe("computeTypeStats — adaptive weight direction", () => {
  it("returns neutral when confirmation rate is between 25% and 75%", () => {
    const stats = computeTypeStats("zone_mismatch", 4, 4); // 50%, n=8
    expect(stats.system_adjustment.sensitivity_direction).toBe("neutral");
    expect(stats.system_adjustment.weight_multiplier).toBe(1.0);
  });

  it("increases sensitivity when confirmation rate >= 75% and n >= 5", () => {
    // 8 confirm, 2 dismiss → 80%, n=10
    const stats = computeTypeStats("zone_mismatch", 8, 2);
    expect(stats.system_adjustment.sensitivity_direction).toBe("increase");
    expect(stats.system_adjustment.weight_multiplier).toBeGreaterThan(1.0);
  });

  it("decreases sensitivity when confirmation rate <= 25% and n >= 5", () => {
    // 1 confirm, 9 dismiss → 10%, n=10
    const stats = computeTypeStats("zone_mismatch", 1, 9);
    expect(stats.system_adjustment.sensitivity_direction).toBe("decrease");
    expect(stats.system_adjustment.weight_multiplier).toBeLessThan(1.0);
  });

  it("weight_multiplier is 1.25 for high confirmation rate", () => {
    const stats = computeTypeStats("physics_zone_conflict", 8, 2);
    expect(stats.system_adjustment.weight_multiplier).toBe(1.25);
  });

  it("weight_multiplier is 0.6 for low confirmation rate", () => {
    const stats = computeTypeStats("severity_mismatch", 1, 9);
    expect(stats.system_adjustment.weight_multiplier).toBe(0.6);
  });
});

describe("computeTypeStats — output structure", () => {
  it("includes all required output fields", () => {
    const stats = computeTypeStats("component_unreported", 6, 4);
    expect(stats).toHaveProperty("mismatch_type", "component_unreported");
    expect(stats).toHaveProperty("total_annotations", 10);
    expect(stats).toHaveProperty("confirmed", 6);
    expect(stats).toHaveProperty("dismissed", 4);
    expect(stats).toHaveProperty("confirmation_rate");
    expect(stats).toHaveProperty("system_adjustment");
    expect(stats.system_adjustment).toHaveProperty("weight_multiplier");
    expect(stats.system_adjustment).toHaveProperty("sensitivity_direction");
    expect(stats.system_adjustment).toHaveProperty("reason");
    expect(stats.system_adjustment).toHaveProperty("sample_size_sufficient");
  });

  it("reason string is non-empty", () => {
    const stats = computeTypeStats("zone_mismatch", 5, 5);
    expect(stats.system_adjustment.reason.length).toBeGreaterThan(0);
  });

  it("total_annotations equals confirmed + dismissed", () => {
    const stats = computeTypeStats("no_photo_evidence", 7, 3);
    expect(stats.total_annotations).toBe(stats.confirmed + stats.dismissed);
  });
});
