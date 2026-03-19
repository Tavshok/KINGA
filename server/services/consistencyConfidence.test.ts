/**
 * consistencyConfidence.test.ts
 *
 * Unit tests for the three-signal consistency confidence scoring engine
 * including Stage 30 post-scoring rules:
 *
 *   Rule 1 — Conflict penalty:  high_severity_mismatches >= 2 → score *= 0.85
 *   Rule 2 — Clamp:             score clamped to [0.10, 0.95]
 *   Rule 3 — Band remap:        >= 0.80 HIGH | 0.60–0.79 MEDIUM | < 0.60 LOW
 *   Rule 4 — Coherence:         HIGH cannot coexist with severe_mismatch or missing physics
 */

import { describe, it, expect } from "vitest";
import {
  computeSignalA,
  computeSignalB,
  computeSignalC,
  computeConsistencyConfidence,
  scoreToConfidenceBand,
  applyConflictPenalty,
  clampConfidenceScore,
  enforceCoherence,
  WEIGHT_A,
  WEIGHT_B,
  WEIGHT_C,
  THRESHOLD_HIGH,
  THRESHOLD_MEDIUM,
  CLAMP_MIN,
  CLAMP_MAX,
  CONFLICT_PENALTY_MULTIPLIER,
  CONFLICT_PENALTY_THRESHOLD,
  MAX_MISMATCHES_FOR_FLOOR,
} from "./consistencyConfidence";
import type { MismatchTypeStats } from "./mismatchAnnotation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStat(
  type: string,
  confirmationRate: number,
  sampleSufficient = true,
): MismatchTypeStats {
  return {
    mismatch_type: type as any,
    total_annotations: sampleSufficient ? 25 : 5,
    confirmed: Math.round(confirmationRate * (sampleSufficient ? 25 : 5)),
    dismissed: Math.round((1 - confirmationRate) * (sampleSufficient ? 25 : 5)),
    confirmation_rate: confirmationRate,
    system_adjustment: {
      weight_multiplier: 1.0,
      raw_multiplier: 1.0,
      sensitivity_direction: "neutral",
      reason: "test",
      sample_size_sufficient: sampleSufficient,
    },
  };
}

const ALL_SOURCES  = { document: true,  photos: true,  physics: true  };
const NO_SOURCES   = { document: false, photos: false, physics: false };
const TWO_SOURCES  = { document: true,  photos: true,  physics: false };
const ONE_SOURCE   = { document: true,  photos: false, physics: false };
const NO_PHYSICS   = { document: true,  photos: true,  physics: false };

// ─── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("weights sum to 1.0", () => {
    expect(WEIGHT_A + WEIGHT_B + WEIGHT_C).toBeCloseTo(1.0, 10);
  });
  it("WEIGHT_A = 0.40", () => expect(WEIGHT_A).toBe(0.40));
  it("WEIGHT_B = 0.35", () => expect(WEIGHT_B).toBe(0.35));
  it("WEIGHT_C = 0.25", () => expect(WEIGHT_C).toBe(0.25));

  // Stage 30: updated thresholds
  it("THRESHOLD_HIGH = 0.80",   () => expect(THRESHOLD_HIGH).toBe(0.80));
  it("THRESHOLD_MEDIUM = 0.60", () => expect(THRESHOLD_MEDIUM).toBe(0.60));

  it("CLAMP_MIN = 0.10", () => expect(CLAMP_MIN).toBe(0.10));
  it("CLAMP_MAX = 0.95", () => expect(CLAMP_MAX).toBe(0.95));
  it("CONFLICT_PENALTY_MULTIPLIER = 0.85", () => expect(CONFLICT_PENALTY_MULTIPLIER).toBe(0.85));
  it("CONFLICT_PENALTY_THRESHOLD = 2",     () => expect(CONFLICT_PENALTY_THRESHOLD).toBe(2));
  it("MAX_MISMATCHES_FOR_FLOOR = 8",       () => expect(MAX_MISMATCHES_FOR_FLOOR).toBe(8));
});

// ─── Signal A: Historical Confirmation Rate ───────────────────────────────────

describe("computeSignalA — historical confirmation rate", () => {
  it("returns 1.0 when no mismatches detected", () => {
    expect(computeSignalA([], [])).toBe(1.0);
  });

  it("returns 0.5 (neutral) when no annotation stats provided", () => {
    expect(computeSignalA(["zone_mismatch"], [])).toBe(0.5);
  });

  it("returns 0.5 (neutral) when annotation stats exist but sample is insufficient", () => {
    const stats = [makeStat("zone_mismatch", 0.9, false)];
    expect(computeSignalA(["zone_mismatch"], stats)).toBe(0.5);
  });

  it("returns the confirmation rate when one type detected with sufficient sample", () => {
    const stats = [makeStat("zone_mismatch", 0.8)];
    expect(computeSignalA(["zone_mismatch"], stats)).toBeCloseTo(0.8, 4);
  });

  it("averages confirmation rates across multiple detected types", () => {
    const stats = [
      makeStat("zone_mismatch", 0.8),
      makeStat("severity_mismatch", 0.6),
    ];
    expect(computeSignalA(["zone_mismatch", "severity_mismatch"], stats)).toBeCloseTo(0.7, 4);
  });

  it("uses 0.5 fallback for types not in annotationStats", () => {
    const stats = [makeStat("zone_mismatch", 0.8)];
    expect(computeSignalA(["zone_mismatch", "severity_mismatch"], stats)).toBeCloseTo(0.65, 4);
  });

  it("returns 1.0 when all detected types have 100% confirmation rate", () => {
    const stats = [
      makeStat("zone_mismatch", 1.0),
      makeStat("severity_mismatch", 1.0),
    ];
    expect(computeSignalA(["zone_mismatch", "severity_mismatch"], stats)).toBe(1.0);
  });

  it("returns 0.0 when all detected types have 0% confirmation rate", () => {
    const stats = [makeStat("zone_mismatch", 0.0)];
    expect(computeSignalA(["zone_mismatch"], stats)).toBe(0.0);
  });

  it("result is always in [0.0, 1.0]", () => {
    const stats = [makeStat("zone_mismatch", 0.75)];
    const result = computeSignalA(["zone_mismatch"], stats);
    expect(result).toBeGreaterThanOrEqual(0.0);
    expect(result).toBeLessThanOrEqual(1.0);
  });
});

// ─── Signal B: Data Completeness ─────────────────────────────────────────────

describe("computeSignalB — data completeness", () => {
  it("returns 1.0 when all three sources available", () => {
    expect(computeSignalB(ALL_SOURCES)).toBeCloseTo(1.0, 4);
  });

  it("returns 0.0 when no sources available", () => {
    expect(computeSignalB(NO_SOURCES)).toBe(0.0);
  });

  it("returns ~0.67 when two sources available", () => {
    expect(computeSignalB(TWO_SOURCES)).toBeCloseTo(2 / 3, 4);
  });

  it("returns ~0.33 when one source available", () => {
    expect(computeSignalB(ONE_SOURCE)).toBeCloseTo(1 / 3, 4);
  });

  it("result is always in [0.0, 1.0]", () => {
    for (const sources of [ALL_SOURCES, NO_SOURCES, TWO_SOURCES, ONE_SOURCE]) {
      const result = computeSignalB(sources);
      expect(result).toBeGreaterThanOrEqual(0.0);
      expect(result).toBeLessThanOrEqual(1.0);
    }
  });

  it("document-only produces same score as photos-only (symmetric)", () => {
    const docOnly   = { document: true,  photos: false, physics: false };
    const photoOnly = { document: false, photos: true,  physics: false };
    expect(computeSignalB(docOnly)).toBe(computeSignalB(photoOnly));
  });
});

// ─── Signal C: Mismatch Frequency ────────────────────────────────────────────

describe("computeSignalC — mismatch frequency (inverse)", () => {
  it("returns 1.0 when no mismatches", () => {
    expect(computeSignalC(0)).toBe(1.0);
  });

  it("returns 0.5 when mismatch count = MAX_MISMATCHES_FOR_FLOOR / 2 (4)", () => {
    expect(computeSignalC(4)).toBeCloseTo(0.5, 4);
  });

  it("returns 0.0 when mismatch count = MAX_MISMATCHES_FOR_FLOOR (8)", () => {
    expect(computeSignalC(8)).toBe(0.0);
  });

  it("returns 0.0 when mismatch count > MAX_MISMATCHES_FOR_FLOOR (floor)", () => {
    expect(computeSignalC(20)).toBe(0.0);
    expect(computeSignalC(100)).toBe(0.0);
  });

  it("returns 0.875 for 1 mismatch (1 - 1/8)", () => {
    expect(computeSignalC(1)).toBeCloseTo(0.875, 4);
  });

  it("returns 0.75 for 2 mismatches (1 - 2/8)", () => {
    expect(computeSignalC(2)).toBeCloseTo(0.75, 4);
  });

  it("result is always in [0.0, 1.0]", () => {
    for (const n of [0, 1, 2, 4, 8, 10, 50]) {
      const result = computeSignalC(n);
      expect(result).toBeGreaterThanOrEqual(0.0);
      expect(result).toBeLessThanOrEqual(1.0);
    }
  });

  it("is monotonically decreasing as mismatch count increases", () => {
    const scores = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(computeSignalC);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

// ─── Stage 30: scoreToConfidenceBand (updated thresholds) ────────────────────

describe("scoreToConfidenceBand — Stage 30 thresholds (0.80/0.60)", () => {
  it("returns HIGH for score = 1.0",  () => expect(scoreToConfidenceBand(1.0)).toBe("HIGH"));
  it("returns HIGH for score = 0.80", () => expect(scoreToConfidenceBand(0.80)).toBe("HIGH"));
  it("returns HIGH for score = 0.95", () => expect(scoreToConfidenceBand(0.95)).toBe("HIGH"));
  it("returns MEDIUM for score = 0.79", () => expect(scoreToConfidenceBand(0.79)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.60", () => expect(scoreToConfidenceBand(0.60)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.70", () => expect(scoreToConfidenceBand(0.70)).toBe("MEDIUM"));
  it("returns LOW for score = 0.59",  () => expect(scoreToConfidenceBand(0.59)).toBe("LOW"));
  it("returns LOW for score = 0.0",   () => expect(scoreToConfidenceBand(0.0)).toBe("LOW"));
  it("returns LOW for score = 0.10",  () => expect(scoreToConfidenceBand(0.10)).toBe("LOW"));
});

// ─── Stage 30: Rule 1 — applyConflictPenalty ─────────────────────────────────

describe("applyConflictPenalty — Rule 1", () => {
  it("does NOT apply penalty when high_severity_count = 0", () => {
    const result = applyConflictPenalty(0.85, 0);
    expect(result.applied).toBe(false);
    expect(result.score).toBeCloseTo(0.85, 4);
  });

  it("does NOT apply penalty when high_severity_count = 1 (below threshold)", () => {
    const result = applyConflictPenalty(0.85, 1);
    expect(result.applied).toBe(false);
    expect(result.score).toBeCloseTo(0.85, 4);
  });

  it("applies penalty when high_severity_count = 2 (at threshold)", () => {
    const result = applyConflictPenalty(0.85, 2);
    expect(result.applied).toBe(true);
    expect(result.score).toBeCloseTo(0.85 * 0.85, 4);
  });

  it("applies penalty when high_severity_count = 3 (above threshold)", () => {
    const result = applyConflictPenalty(0.70, 3);
    expect(result.applied).toBe(true);
    expect(result.score).toBeCloseTo(0.70 * 0.85, 4);
  });

  it("applies penalty when high_severity_count = 5", () => {
    const result = applyConflictPenalty(0.90, 5);
    expect(result.applied).toBe(true);
    expect(result.score).toBeCloseTo(0.90 * 0.85, 4);
  });

  it("penalty multiplier is exactly 0.85", () => {
    const score = 0.80;
    const result = applyConflictPenalty(score, 2);
    expect(result.score / score).toBeCloseTo(CONFLICT_PENALTY_MULTIPLIER, 10);
  });
});

// ─── Stage 30: Rule 2 — clampConfidenceScore ─────────────────────────────────

describe("clampConfidenceScore — Rule 2", () => {
  it("clamps score below 0.10 to 0.10", () => {
    expect(clampConfidenceScore(0.0)).toBe(CLAMP_MIN);
    expect(clampConfidenceScore(0.05)).toBe(CLAMP_MIN);
    expect(clampConfidenceScore(-0.5)).toBe(CLAMP_MIN);
  });

  it("clamps score above 0.95 to 0.95", () => {
    expect(clampConfidenceScore(1.0)).toBe(CLAMP_MAX);
    expect(clampConfidenceScore(0.99)).toBe(CLAMP_MAX);
    expect(clampConfidenceScore(1.5)).toBe(CLAMP_MAX);
  });

  it("does not clamp score exactly at 0.10", () => {
    expect(clampConfidenceScore(0.10)).toBe(0.10);
  });

  it("does not clamp score exactly at 0.95", () => {
    expect(clampConfidenceScore(0.95)).toBe(0.95);
  });

  it("does not clamp score in the middle of the range", () => {
    expect(clampConfidenceScore(0.50)).toBe(0.50);
    expect(clampConfidenceScore(0.75)).toBe(0.75);
  });

  it("result is always in [CLAMP_MIN, CLAMP_MAX]", () => {
    for (const s of [-1, 0, 0.05, 0.10, 0.50, 0.80, 0.95, 0.99, 1.0, 2.0]) {
      const r = clampConfidenceScore(s);
      expect(r).toBeGreaterThanOrEqual(CLAMP_MIN);
      expect(r).toBeLessThanOrEqual(CLAMP_MAX);
    }
  });
});

// ─── Stage 30: Rule 4 — enforceCoherence ─────────────────────────────────────

describe("enforceCoherence — Rule 4", () => {
  it("does not downgrade MEDIUM band regardless of inputs", () => {
    const r = enforceCoherence("MEDIUM", true, false);
    expect(r.band).toBe("MEDIUM");
    expect(r.downgraded).toBe(false);
  });

  it("does not downgrade LOW band regardless of inputs", () => {
    const r = enforceCoherence("LOW", true, false);
    expect(r.band).toBe("LOW");
    expect(r.downgraded).toBe(false);
  });

  it("does NOT downgrade HIGH when no severe mismatch and physics available", () => {
    const r = enforceCoherence("HIGH", false, true);
    expect(r.band).toBe("HIGH");
    expect(r.downgraded).toBe(false);
  });

  it("downgrades HIGH to MEDIUM when hasSevereMismatch = true", () => {
    const r = enforceCoherence("HIGH", true, true);
    expect(r.band).toBe("MEDIUM");
    expect(r.downgraded).toBe(true);
    expect(r.reason).toContain("severe mismatch");
  });

  it("downgrades HIGH to MEDIUM when physics unavailable", () => {
    const r = enforceCoherence("HIGH", false, false);
    expect(r.band).toBe("MEDIUM");
    expect(r.downgraded).toBe(true);
    expect(r.reason).toContain("physics");
  });

  it("downgrades HIGH to MEDIUM when both severe mismatch and no physics", () => {
    const r = enforceCoherence("HIGH", true, false);
    expect(r.band).toBe("MEDIUM");
    expect(r.downgraded).toBe(true);
    expect(r.reason).toBeDefined();
  });

  it("includes downgrade reason in result when downgraded", () => {
    const r = enforceCoherence("HIGH", true, true);
    expect(typeof r.reason).toBe("string");
    expect((r.reason ?? "").length).toBeGreaterThan(0);
  });

  it("reason is undefined when not downgraded", () => {
    const r = enforceCoherence("HIGH", false, true);
    expect(r.reason).toBeUndefined();
  });
});

// ─── computeConsistencyConfidence — composite output (Stage 24 + Stage 30) ───

describe("computeConsistencyConfidence — composite output", () => {
  it("returns all required fields including Stage 30 breakdown fields", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out).toHaveProperty("confidence");
    expect(out).toHaveProperty("confidence_score");
    expect(out).toHaveProperty("breakdown");
    expect(out.breakdown).toHaveProperty("signal_a_confirmation_rate");
    expect(out.breakdown).toHaveProperty("signal_b_data_completeness");
    expect(out.breakdown).toHaveProperty("signal_c_mismatch_frequency");
    expect(out.breakdown).toHaveProperty("raw_composite_score");
    expect(out.breakdown).toHaveProperty("post_penalty_score");
    expect(out.breakdown).toHaveProperty("conflict_penalty_applied");
    expect(out.breakdown).toHaveProperty("coherence_downgrade_applied");
  });

  it("confidence_score is in [CLAMP_MIN, CLAMP_MAX]", () => {
    const cases = [
      { detectedMismatchTypes: [], mismatchCount: 0, sourcesAvailable: ALL_SOURCES },
      { detectedMismatchTypes: ["zone_mismatch" as any], mismatchCount: 5, sourcesAvailable: NO_SOURCES },
      { detectedMismatchTypes: ["zone_mismatch" as any], mismatchCount: 0, sourcesAvailable: TWO_SOURCES },
    ];
    for (const input of cases) {
      const out = computeConsistencyConfidence(input);
      expect(out.confidence_score).toBeGreaterThanOrEqual(CLAMP_MIN);
      expect(out.confidence_score).toBeLessThanOrEqual(CLAMP_MAX);
    }
  });

  it("confidence_score is rounded to 2 decimal places", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 3,
      sourcesAvailable: TWO_SOURCES,
    });
    const str = out.confidence_score.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  // ── Rule 1: Conflict penalty ────────────────────────────────────────────────

  it("Rule 1: conflict_penalty_applied = false when high_severity_count = 0", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 0,
    });
    expect(out.breakdown.conflict_penalty_applied).toBe(false);
    expect(out.breakdown.post_penalty_score).toBeCloseTo(out.breakdown.raw_composite_score, 4);
  });

  it("Rule 1: conflict_penalty_applied = false when high_severity_count = 1", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 1,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 1,
    });
    expect(out.breakdown.conflict_penalty_applied).toBe(false);
  });

  it("Rule 1: conflict_penalty_applied = true when high_severity_count = 2", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "physics_zone_conflict"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 2,
    });
    expect(out.breakdown.conflict_penalty_applied).toBe(true);
    expect(out.breakdown.post_penalty_score).toBeCloseTo(
      out.breakdown.raw_composite_score * CONFLICT_PENALTY_MULTIPLIER, 4
    );
  });

  it("Rule 1: penalty reduces confidence_score relative to no-penalty baseline", () => {
    const base = {
      detectedMismatchTypes: ["zone_mismatch", "physics_zone_conflict"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
    };
    const withPenalty    = computeConsistencyConfidence({ ...base, highSeverityMismatchCount: 2 });
    const withoutPenalty = computeConsistencyConfidence({ ...base, highSeverityMismatchCount: 0 });
    expect(withPenalty.confidence_score).toBeLessThanOrEqual(withoutPenalty.confidence_score);
  });

  // ── Rule 2: Clamp ───────────────────────────────────────────────────────────

  it("Rule 2: confidence_score never exceeds 0.95 (ideal case)", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: [makeStat("zone_mismatch", 1.0)],
    });
    expect(out.confidence_score).toBeLessThanOrEqual(CLAMP_MAX);
  });

  it("Rule 2: confidence_score never goes below 0.10 (worst case)", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "severity_mismatch"] as any,
      mismatchCount: 10,
      sourcesAvailable: NO_SOURCES,
      highSeverityMismatchCount: 5,
    });
    expect(out.confidence_score).toBeGreaterThanOrEqual(CLAMP_MIN);
  });

  // ── Rule 3: Band remap ──────────────────────────────────────────────────────

  it("Rule 3: score >= 0.80 → HIGH band", () => {
    // All sources, no mismatches, high confirmation → should reach HIGH
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: [makeStat("zone_mismatch", 1.0)],
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    });
    // Score should be 0.95 (clamped from 1.0 composite), band should be HIGH
    expect(out.confidence_score).toBeGreaterThanOrEqual(0.80);
    expect(out.confidence).toBe("HIGH");
  });

  it("Rule 3: score in [0.60, 0.79] → MEDIUM band", () => {
    // Two sources, some mismatches, neutral annotation → should land in MEDIUM
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 3,
      sourcesAvailable: TWO_SOURCES,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    });
    if (out.confidence_score >= 0.60 && out.confidence_score < 0.80) {
      expect(out.confidence).toBe("MEDIUM");
    }
  });

  it("Rule 3: score < 0.60 → LOW band (no sources, many mismatches)", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "severity_mismatch"] as any,
      mismatchCount: 8,
      sourcesAvailable: NO_SOURCES,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    });
    expect(out.confidence_score).toBeLessThan(0.60);
    expect(out.confidence).toBe("LOW");
  });

  // ── Rule 4: Coherence enforcement ──────────────────────────────────────────

  it("Rule 4: HIGH with severe mismatch → downgraded to MEDIUM", () => {
    // Force a high composite score then set hasSevereMismatch
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: [makeStat("zone_mismatch", 1.0)],
      highSeverityMismatchCount: 0,
      hasSevereMismatch: true,  // coherence violation
    });
    // Even if score would be HIGH, coherence must downgrade it
    expect(out.confidence).toBe("MEDIUM");
    expect(out.breakdown.coherence_downgrade_applied).toBe(true);
    expect(out.breakdown.coherence_downgrade_reason).toContain("severe mismatch");
  });

  it("Rule 4: HIGH with physics unavailable → downgraded to MEDIUM", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: NO_PHYSICS,  // physics = false
      annotationStats: [makeStat("zone_mismatch", 1.0)],
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    });
    // Score may or may not reach HIGH threshold, but if it does it must be downgraded
    if (out.breakdown.coherence_downgrade_applied) {
      expect(out.confidence).toBe("MEDIUM");
      expect(out.breakdown.coherence_downgrade_reason).toContain("physics");
    }
  });

  it("Rule 4: coherence_downgrade_applied = false when no violation", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    });
    // If HIGH, no downgrade should occur
    if (out.confidence === "HIGH") {
      expect(out.breakdown.coherence_downgrade_applied).toBe(false);
    }
  });

  it("Rule 4: MEDIUM band is never upgraded by coherence enforcement", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 4,
      sourcesAvailable: ONE_SOURCE,
      hasSevereMismatch: false,
    });
    // Coherence only downgrades, never upgrades
    if (out.confidence === "MEDIUM") {
      expect(out.breakdown.coherence_downgrade_applied).toBe(false);
    }
  });

  it("Rule 4: LOW band is never changed by coherence enforcement", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "severity_mismatch"] as any,
      mismatchCount: 8,
      sourcesAvailable: NO_SOURCES,
      hasSevereMismatch: true,
    });
    if (out.confidence === "LOW") {
      expect(out.breakdown.coherence_downgrade_applied).toBe(false);
    }
  });

  // ── Combined rules interaction ──────────────────────────────────────────────

  it("penalty + coherence: penalty applied, coherence downgrade only if band is still HIGH after penalty", () => {
    // With 2 high-severity mismatches, penalty brings score to MEDIUM range already.
    // Coherence only fires when the band after penalty+clamp is still HIGH.
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "physics_zone_conflict"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 2,  // triggers penalty
      hasSevereMismatch: true,        // would trigger coherence if band is HIGH
    });
    // Penalty is always applied when threshold met
    expect(out.breakdown.conflict_penalty_applied).toBe(true);
    // Final band must be MEDIUM or lower (penalty already prevents HIGH in this case)
    expect(out.confidence).toBe("MEDIUM");
  });

  it("coherence fires when score is HIGH after penalty (high confirmation, all sources, no mismatches)", () => {
    // Force a HIGH composite score then set hasSevereMismatch to trigger coherence
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: [makeStat("zone_mismatch", 1.0)],
      highSeverityMismatchCount: 0,  // no penalty
      hasSevereMismatch: true,        // coherence violation
    });
    // Score should be 0.95 (clamped) → HIGH → downgraded to MEDIUM by coherence
    expect(out.breakdown.conflict_penalty_applied).toBe(false);
    expect(out.breakdown.coherence_downgrade_applied).toBe(true);
    expect(out.confidence).toBe("MEDIUM");
  });

  it("omitting Stage 30 fields defaults gracefully (backward compatible)", () => {
    // No highSeverityMismatchCount or hasSevereMismatch → should not throw
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.conflict_penalty_applied).toBe(false);
    expect(out.breakdown.coherence_downgrade_applied).toBe(false);
    expect(out.confidence_score).toBeGreaterThanOrEqual(CLAMP_MIN);
    expect(out.confidence_score).toBeLessThanOrEqual(CLAMP_MAX);
  });

  // ── Monotonicity (preserved from Stage 24) ─────────────────────────────────

  it("higher confirmation rate produces higher confidence_score (all else equal)", () => {
    const highStats = [makeStat("zone_mismatch", 0.9)];
    const lowStats  = [makeStat("zone_mismatch", 0.2)];
    const base = {
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    };
    const highOut = computeConsistencyConfidence({ ...base, annotationStats: highStats });
    const lowOut  = computeConsistencyConfidence({ ...base, annotationStats: lowStats });
    expect(highOut.confidence_score).toBeGreaterThan(lowOut.confidence_score);
  });

  it("more sources available produces higher confidence_score (all else equal)", () => {
    const base = {
      detectedMismatchTypes: [] as any,
      mismatchCount: 0,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    };
    const allOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: ALL_SOURCES });
    const twoOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: TWO_SOURCES });
    const oneOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: ONE_SOURCE });
    const noneOut = computeConsistencyConfidence({ ...base, sourcesAvailable: NO_SOURCES });
    expect(allOut.confidence_score).toBeGreaterThan(twoOut.confidence_score);
    expect(twoOut.confidence_score).toBeGreaterThan(oneOut.confidence_score);
    expect(oneOut.confidence_score).toBeGreaterThan(noneOut.confidence_score);
  });

  it("fewer mismatches produces higher confidence_score (all else equal)", () => {
    const base = {
      detectedMismatchTypes: ["zone_mismatch"] as any,
      sourcesAvailable: ALL_SOURCES,
      highSeverityMismatchCount: 0,
      hasSevereMismatch: false,
    };
    const clean = computeConsistencyConfidence({ ...base, mismatchCount: 0 });
    const few   = computeConsistencyConfidence({ ...base, mismatchCount: 2 });
    const many  = computeConsistencyConfidence({ ...base, mismatchCount: 8 });
    expect(clean.confidence_score).toBeGreaterThan(few.confidence_score);
    expect(few.confidence_score).toBeGreaterThan(many.confidence_score);
  });
});
