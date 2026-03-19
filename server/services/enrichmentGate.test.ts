/**
 * enrichmentGate.test.ts
 *
 * Unit tests for the Stage 25 LLM Enrichment Gate.
 *
 * Covers:
 *   - computeNegativeFeedbackRate: sample size gate, boundary values, precision
 *   - evaluateEnrichmentGate: all four decision paths
 *   - Boundary conditions at exactly 0.20 threshold
 *   - Edge cases: zero counts, large counts, mixed sources
 */

import { describe, it, expect } from "vitest";
import {
  computeNegativeFeedbackRate,
  evaluateEnrichmentGate,
  MIN_FEEDBACK_SAMPLE,
  NEGATIVE_FEEDBACK_THRESHOLD,
} from "./enrichmentGate";

// ─── computeNegativeFeedbackRate ─────────────────────────────────────────────

describe("computeNegativeFeedbackRate", () => {
  it("returns 0.0 when both counts are zero (no annotations)", () => {
    expect(computeNegativeFeedbackRate(0, 0)).toBe(0.0);
  });

  it("returns 0.0 when total < MIN_FEEDBACK_SAMPLE (insufficient sample)", () => {
    // MIN_FEEDBACK_SAMPLE = 5; test with 4 total
    expect(computeNegativeFeedbackRate(3, 1)).toBe(0.0); // total = 4
    expect(computeNegativeFeedbackRate(0, 4)).toBe(0.0); // total = 4
    expect(computeNegativeFeedbackRate(4, 0)).toBe(0.0); // total = 4
  });

  it("returns 0.0 when total equals MIN_FEEDBACK_SAMPLE - 1", () => {
    expect(computeNegativeFeedbackRate(4, 0)).toBe(0.0); // total = 4
  });

  it("computes rate when total equals MIN_FEEDBACK_SAMPLE exactly", () => {
    // 5 total: 4 confirmed, 1 dismissed → 0.2
    expect(computeNegativeFeedbackRate(4, 1)).toBe(0.2);
  });

  it("computes rate when total > MIN_FEEDBACK_SAMPLE", () => {
    // 10 total: 8 confirmed, 2 dismissed → 0.2
    expect(computeNegativeFeedbackRate(8, 2)).toBe(0.2);
    // 10 total: 7 confirmed, 3 dismissed → 0.3
    expect(computeNegativeFeedbackRate(7, 3)).toBe(0.3);
  });

  it("returns 1.0 when all annotations are dismissals (sufficient sample)", () => {
    expect(computeNegativeFeedbackRate(0, 5)).toBe(1.0);
    expect(computeNegativeFeedbackRate(0, 100)).toBe(1.0);
  });

  it("returns 0.0 when all annotations are confirmations (sufficient sample)", () => {
    expect(computeNegativeFeedbackRate(5, 0)).toBe(0.0);
    expect(computeNegativeFeedbackRate(100, 0)).toBe(0.0);
  });

  it("rounds to 4 decimal places", () => {
    // 7 total: 6 confirmed, 1 dismissed → 1/7 ≈ 0.1429
    const rate = computeNegativeFeedbackRate(6, 1);
    expect(rate).toBe(0.1429);
  });

  it("handles large counts correctly", () => {
    // 1000 total: 800 confirmed, 200 dismissed → 0.2
    expect(computeNegativeFeedbackRate(800, 200)).toBe(0.2);
    // 1000 total: 750 confirmed, 250 dismissed → 0.25
    expect(computeNegativeFeedbackRate(750, 250)).toBe(0.25);
  });

  it("returns value in [0.0, 1.0] range for all valid inputs", () => {
    const cases = [
      [0, 10], [5, 5], [10, 0], [3, 7], [9, 1],
    ];
    for (const [confirmed, dismissed] of cases) {
      const rate = computeNegativeFeedbackRate(confirmed, dismissed);
      expect(rate).toBeGreaterThanOrEqual(0.0);
      expect(rate).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── evaluateEnrichmentGate — Condition 1: source is template ────────────────

describe("evaluateEnrichmentGate — Condition 1: source is 'template'", () => {
  it("allows enrichment when source is 'template' regardless of feedback rate", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "template",
      confirmedCount: 100,
      dismissedCount: 0, // 0% negative feedback
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("source_is_template");
    expect(result.current_source).toBe("template");
  });

  it("allows enrichment when source is 'template' with zero annotations", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "template",
      confirmedCount: 0,
      dismissedCount: 0,
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("source_is_template");
  });

  it("allows enrichment when source is 'template' even with high positive feedback", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "template",
      confirmedCount: 50,
      dismissedCount: 0,
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("source_is_template");
  });

  it("reports correct negative_feedback_rate even when enriching due to source", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "template",
      confirmedCount: 8,
      dismissedCount: 2, // 20% rate, total = 10 ≥ MIN_FEEDBACK_SAMPLE
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("source_is_template");
    expect(result.negative_feedback_rate).toBe(0.2);
  });
});

// ─── evaluateEnrichmentGate — Condition 2: high negative feedback rate ───────

describe("evaluateEnrichmentGate — Condition 2: high negative feedback rate", () => {
  it("allows enrichment when negative rate > 0.20 and source is 'llm_background'", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 7,
      dismissedCount: 3, // 30% rate, total = 10 ≥ MIN_FEEDBACK_SAMPLE
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("high_negative_feedback_rate");
    expect(result.negative_feedback_rate).toBe(0.3);
  });

  it("allows enrichment when negative rate > 0.20 and source is 'manual'", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "manual",
      confirmedCount: 3,
      dismissedCount: 7, // 70% rate, total = 10 ≥ MIN_FEEDBACK_SAMPLE
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("high_negative_feedback_rate");
    expect(result.negative_feedback_rate).toBe(0.7);
  });

  it("allows enrichment when all annotations are dismissals (sufficient sample)", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 0,
      dismissedCount: 10,
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("high_negative_feedback_rate");
    expect(result.negative_feedback_rate).toBe(1.0);
  });
});

// ─── evaluateEnrichmentGate — Skip path ──────────────────────────────────────

describe("evaluateEnrichmentGate — Skip path (neither condition met)", () => {
  it("skips enrichment when source is 'llm_background' and rate is 0%", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 10,
      dismissedCount: 0,
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
    expect(result.negative_feedback_rate).toBe(0.0);
  });

  it("skips enrichment when source is 'manual' and rate is 0%", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "manual",
      confirmedCount: 20,
      dismissedCount: 0,
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
  });

  it("skips enrichment when source is 'llm_background' and rate is exactly 0.20 (not above)", () => {
    // Rate = 0.20 exactly — threshold is STRICTLY greater than 0.20
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 8,
      dismissedCount: 2, // 20% rate, total = 10 ≥ MIN_FEEDBACK_SAMPLE
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
    expect(result.negative_feedback_rate).toBe(0.2);
  });

  it("skips enrichment when source is 'llm_background' and rate is 15%", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 17,
      dismissedCount: 3, // 15% rate, total = 20 ≥ MIN_FEEDBACK_SAMPLE
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
    expect(result.negative_feedback_rate).toBe(0.15);
  });

  it("skips enrichment when source is 'llm_background' and sample is insufficient (< 5)", () => {
    // Only 4 annotations → rate treated as 0.0 → below threshold
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 0,
      dismissedCount: 4, // 100% rate but total < MIN_FEEDBACK_SAMPLE → rate = 0.0
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
    expect(result.negative_feedback_rate).toBe(0.0);
  });

  it("skips enrichment when source is 'llm_background' and zero annotations", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 0,
      dismissedCount: 0,
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.reason).toBe("skip");
    expect(result.negative_feedback_rate).toBe(0.0);
  });
});

// ─── evaluateEnrichmentGate — Boundary at threshold ──────────────────────────

describe("evaluateEnrichmentGate — threshold boundary (0.20)", () => {
  it("skips at exactly 0.20 (not strictly greater)", () => {
    // 4 confirmed, 1 dismissed → 1/5 = 0.2 exactly
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 4,
      dismissedCount: 1,
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.negative_feedback_rate).toBe(0.2);
  });

  it("enriches at just above 0.20 (e.g. 0.2001)", () => {
    // 4 confirmed, 1.0005 dismissed is not possible with integers;
    // use 39 confirmed, 10 dismissed → 10/49 ≈ 0.2041
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 39,
      dismissedCount: 10, // 10/49 ≈ 0.2041 > 0.20
    });
    expect(result.shouldEnrich).toBe(true);
    expect(result.reason).toBe("high_negative_feedback_rate");
    expect(result.negative_feedback_rate).toBeGreaterThan(0.20);
  });

  it("skips at 0.19 (below threshold)", () => {
    // 21 confirmed, 5 dismissed → 5/26 ≈ 0.1923
    const result = evaluateEnrichmentGate({
      currentVersionSource: "llm_background",
      confirmedCount: 21,
      dismissedCount: 5,
    });
    expect(result.shouldEnrich).toBe(false);
    expect(result.negative_feedback_rate).toBeLessThanOrEqual(0.20);
  });
});

// ─── evaluateEnrichmentGate — Output shape ───────────────────────────────────

describe("evaluateEnrichmentGate — output shape", () => {
  it("always returns all four fields", () => {
    const result = evaluateEnrichmentGate({
      currentVersionSource: "template",
      confirmedCount: 5,
      dismissedCount: 5,
    });
    expect(result).toHaveProperty("shouldEnrich");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("negative_feedback_rate");
    expect(result).toHaveProperty("current_source");
  });

  it("current_source reflects the input value", () => {
    const sources = ["template", "llm_background", "manual", "unknown_source"];
    for (const src of sources) {
      const result = evaluateEnrichmentGate({
        currentVersionSource: src,
        confirmedCount: 10,
        dismissedCount: 0,
      });
      expect(result.current_source).toBe(src);
    }
  });

  it("negative_feedback_rate is always in [0.0, 1.0]", () => {
    const cases = [
      { confirmed: 0, dismissed: 0 },
      { confirmed: 10, dismissed: 0 },
      { confirmed: 0, dismissed: 10 },
      { confirmed: 5, dismissed: 5 },
      { confirmed: 3, dismissed: 7 },
    ];
    for (const { confirmed, dismissed } of cases) {
      const result = evaluateEnrichmentGate({
        currentVersionSource: "llm_background",
        confirmedCount: confirmed,
        dismissedCount: dismissed,
      });
      expect(result.negative_feedback_rate).toBeGreaterThanOrEqual(0.0);
      expect(result.negative_feedback_rate).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────

describe("enrichmentGate constants", () => {
  it("MIN_FEEDBACK_SAMPLE is 5", () => {
    expect(MIN_FEEDBACK_SAMPLE).toBe(5);
  });

  it("NEGATIVE_FEEDBACK_THRESHOLD is 0.20", () => {
    expect(NEGATIVE_FEEDBACK_THRESHOLD).toBe(0.20);
  });
});
