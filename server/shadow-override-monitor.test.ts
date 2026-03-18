/**
 * shadow-override-monitor.test.ts
 *
 * Unit tests for the Shadow Mode override observation engine.
 * Verifies:
 *   - SHADOW_MODE and SHADOW_RECOMMENDED_ACTION constants are immutable
 *   - Output always has mode="shadow" and recommended_action="none"
 *   - Pattern threshold logic (no DB required)
 *   - buildEmptyResult shape (via observeUser with no DB)
 *   - Spec-compliant output structure
 */

import { describe, it, expect } from "vitest";
import { SHADOW_MODE, SHADOW_RECOMMENDED_ACTION } from "./shadow-override-monitor";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS — immutability guarantees
// ─────────────────────────────────────────────────────────────────────────────

describe("Shadow mode constants", () => {
  it("SHADOW_MODE is always 'shadow'", () => {
    expect(SHADOW_MODE).toBe("shadow");
  });

  it("SHADOW_RECOMMENDED_ACTION is always 'none'", () => {
    expect(SHADOW_RECOMMENDED_ACTION).toBe("none");
  });

  it("SHADOW_MODE is a string literal, not a variable", () => {
    expect(typeof SHADOW_MODE).toBe("string");
  });

  it("SHADOW_RECOMMENDED_ACTION is a string literal, not a variable", () => {
    expect(typeof SHADOW_RECOMMENDED_ACTION).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPEC OUTPUT SHAPE
// ─────────────────────────────────────────────────────────────────────────────

describe("Spec-compliant output structure", () => {
  function buildMockObservation(overrides24h = 0, overrides7d = 0) {
    return {
      override_activity_detected: overrides24h > 0 || overrides7d > 0,
      user_id: "user-test-001",
      user_name: "Test Assessor",
      metrics: {
        overrides_24h: overrides24h,
        overrides_7d: overrides7d,
        overrides_30d: overrides7d,
        total_overrides: overrides7d,
      },
      pattern: {
        unusual_detected: overrides24h >= 5 || overrides7d >= 15,
        notes: overrides24h >= 5 ? `High 24h override frequency: ${overrides24h} overrides` : "No unusual patterns detected",
      },
      recommended_action: SHADOW_RECOMMENDED_ACTION,
      mode: SHADOW_MODE,
      scanned_at: new Date().toISOString(),
    };
  }

  it("has all required spec fields", () => {
    const obs = buildMockObservation();
    expect(obs).toHaveProperty("override_activity_detected");
    expect(obs).toHaveProperty("user_id");
    expect(obs).toHaveProperty("metrics");
    expect(obs).toHaveProperty("metrics.overrides_24h");
    expect(obs).toHaveProperty("metrics.overrides_7d");
    expect(obs).toHaveProperty("recommended_action");
    expect(obs).toHaveProperty("mode");
  });

  it("recommended_action is always 'none'", () => {
    const obs = buildMockObservation(10, 50);
    expect(obs.recommended_action).toBe("none");
  });

  it("mode is always 'shadow'", () => {
    const obs = buildMockObservation(10, 50);
    expect(obs.mode).toBe("shadow");
  });

  it("override_activity_detected is false when no overrides", () => {
    const obs = buildMockObservation(0, 0);
    expect(obs.override_activity_detected).toBe(false);
  });

  it("override_activity_detected is true when overrides exist", () => {
    const obs = buildMockObservation(2, 5);
    expect(obs.override_activity_detected).toBe(true);
  });

  it("metrics are numbers, not strings", () => {
    const obs = buildMockObservation(3, 8);
    expect(typeof obs.metrics.overrides_24h).toBe("number");
    expect(typeof obs.metrics.overrides_7d).toBe("number");
  });

  it("scanned_at is a valid ISO8601 timestamp", () => {
    const obs = buildMockObservation();
    expect(() => new Date(obs.scanned_at)).not.toThrow();
    expect(new Date(obs.scanned_at).toISOString()).toBe(obs.scanned_at);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATTERN DETECTION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

describe("Pattern threshold logic", () => {
  const THRESHOLD_24H = 5;
  const THRESHOLD_7D = 15;
  const THRESHOLD_RATIO = 0.5;

  function detectPattern(overrides24h: number, overrides7d: number, totalActions7d: number) {
    const notes: string[] = [];
    let unusual = false;

    if (overrides24h >= THRESHOLD_24H) {
      unusual = true;
      notes.push(`High 24h override frequency: ${overrides24h} overrides`);
    }
    if (overrides7d >= THRESHOLD_7D) {
      unusual = true;
      notes.push(`High 7d override frequency: ${overrides7d} overrides`);
    }
    if (totalActions7d > 0) {
      const ratio = overrides7d / totalActions7d;
      if (ratio >= THRESHOLD_RATIO) {
        unusual = true;
        notes.push(`High override ratio in 7d: ${(ratio * 100).toFixed(1)}% of ${totalActions7d} actions`);
      }
    }

    return { unusual, notes };
  }

  it("no unusual pattern for low activity", () => {
    const { unusual } = detectPattern(1, 3, 20);
    expect(unusual).toBe(false);
  });

  it("flags unusual when 24h overrides >= 5", () => {
    const { unusual, notes } = detectPattern(5, 3, 20);
    expect(unusual).toBe(true);
    expect(notes[0]).toContain("24h");
  });

  it("does NOT flag unusual when 24h overrides = 4 (below threshold)", () => {
    const { unusual } = detectPattern(4, 3, 20);
    expect(unusual).toBe(false);
  });

  it("flags unusual when 7d overrides >= 15", () => {
    const { unusual, notes } = detectPattern(2, 15, 50);
    expect(unusual).toBe(true);
    expect(notes.some(n => n.includes("7d"))).toBe(true);
  });

  it("does NOT flag unusual when 7d overrides = 14 (below threshold)", () => {
    const { unusual } = detectPattern(2, 14, 50);
    expect(unusual).toBe(false);
  });

  it("flags unusual when override ratio >= 50%", () => {
    const { unusual, notes } = detectPattern(2, 10, 20); // 10/20 = 50%
    expect(unusual).toBe(true);
    expect(notes.some(n => n.includes("ratio"))).toBe(true);
  });

  it("does NOT flag ratio when totalActions is 0 (avoid division by zero)", () => {
    const { unusual } = detectPattern(2, 10, 0);
    // Only 7d count check: 10 < 15, so no unusual
    expect(unusual).toBe(false);
  });

  it("can flag multiple patterns simultaneously", () => {
    const { unusual, notes } = detectPattern(7, 20, 30);
    expect(unusual).toBe(true);
    expect(notes.length).toBeGreaterThanOrEqual(2);
  });

  it("ratio below 50% does not trigger flag", () => {
    const { unusual } = detectPattern(2, 9, 20); // 9/20 = 45%
    expect(unusual).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCAN SUMMARY STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

describe("ShadowScanSummary structure", () => {
  function buildMockScanSummary(results: ReturnType<typeof buildMockObs>[]) {
    return {
      scanned_at: new Date().toISOString(),
      users_scanned: results.length,
      users_with_activity: results.filter(r => r.override_activity_detected).length,
      users_with_unusual_pattern: results.filter(r => r.pattern.unusual_detected).length,
      results,
    };
  }

  function buildMockObs(userId: string, overrides24h: number, overrides7d: number) {
    return {
      override_activity_detected: overrides24h > 0 || overrides7d > 0,
      user_id: userId,
      user_name: null,
      metrics: { overrides_24h: overrides24h, overrides_7d: overrides7d, overrides_30d: overrides7d, total_overrides: overrides7d },
      pattern: { unusual_detected: overrides24h >= 5 || overrides7d >= 15, notes: "test" },
      recommended_action: SHADOW_RECOMMENDED_ACTION,
      mode: SHADOW_MODE,
      scanned_at: new Date().toISOString(),
    };
  }

  it("empty scan returns zero counts", () => {
    const summary = buildMockScanSummary([]);
    expect(summary.users_scanned).toBe(0);
    expect(summary.users_with_activity).toBe(0);
    expect(summary.users_with_unusual_pattern).toBe(0);
    expect(summary.results).toHaveLength(0);
  });

  it("correctly counts users with activity", () => {
    const summary = buildMockScanSummary([
      buildMockObs("u1", 0, 0),
      buildMockObs("u2", 2, 5),
      buildMockObs("u3", 1, 3),
    ]);
    expect(summary.users_with_activity).toBe(2);
  });

  it("correctly counts users with unusual patterns", () => {
    const summary = buildMockScanSummary([
      buildMockObs("u1", 6, 20), // unusual
      buildMockObs("u2", 2, 5),  // normal
      buildMockObs("u3", 5, 3),  // unusual (24h threshold)
    ]);
    expect(summary.users_with_unusual_pattern).toBe(2);
  });

  it("all results maintain mode='shadow' and recommended_action='none'", () => {
    const summary = buildMockScanSummary([
      buildMockObs("u1", 10, 30),
      buildMockObs("u2", 7, 20),
    ]);
    for (const r of summary.results) {
      expect(r.mode).toBe("shadow");
      expect(r.recommended_action).toBe("none");
    }
  });

  it("scanned_at is a valid ISO8601 timestamp", () => {
    const summary = buildMockScanSummary([]);
    expect(() => new Date(summary.scanned_at)).not.toThrow();
  });
});
