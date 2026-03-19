/**
 * consistencyConfidence.test.ts
 *
 * Unit tests for the three-signal consistency confidence scoring engine.
 *
 * Signals under test:
 *   A — Historical confirmation rate  (weight 0.40)
 *   B — Data completeness             (weight 0.35)
 *   C — Mismatch frequency (inverse)  (weight 0.25)
 *
 * Band thresholds:
 *   HIGH   ≥ 0.70
 *   MEDIUM ≥ 0.45
 *   LOW    <  0.45
 */

import { describe, it, expect } from "vitest";
import {
  computeSignalA,
  computeSignalB,
  computeSignalC,
  computeConsistencyConfidence,
  scoreToConfidenceBand,
  WEIGHT_A,
  WEIGHT_B,
  WEIGHT_C,
  THRESHOLD_HIGH,
  THRESHOLD_MEDIUM,
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

const ALL_SOURCES = { document: true, photos: true, physics: true };
const NO_SOURCES  = { document: false, photos: false, physics: false };
const TWO_SOURCES = { document: true, photos: true, physics: false };
const ONE_SOURCE  = { document: true, photos: false, physics: false };

// ─── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("weights sum to 1.0", () => {
    expect(WEIGHT_A + WEIGHT_B + WEIGHT_C).toBeCloseTo(1.0, 10);
  });

  it("WEIGHT_A = 0.40", () => expect(WEIGHT_A).toBe(0.40));
  it("WEIGHT_B = 0.35", () => expect(WEIGHT_B).toBe(0.35));
  it("WEIGHT_C = 0.25", () => expect(WEIGHT_C).toBe(0.25));
  it("THRESHOLD_HIGH = 0.70",   () => expect(THRESHOLD_HIGH).toBe(0.70));
  it("THRESHOLD_MEDIUM = 0.45", () => expect(THRESHOLD_MEDIUM).toBe(0.45));
  it("MAX_MISMATCHES_FOR_FLOOR = 8", () => expect(MAX_MISMATCHES_FOR_FLOOR).toBe(8));
});

// ─── Signal A: Historical Confirmation Rate ───────────────────────────────────

describe("computeSignalA — historical confirmation rate", () => {
  it("returns 1.0 when no mismatches detected (no detections = fully reliable)", () => {
    expect(computeSignalA([], [])).toBe(1.0);
  });

  it("returns 0.5 (neutral) when no annotation stats provided", () => {
    expect(computeSignalA(["zone_mismatch"], [])).toBe(0.5);
  });

  it("returns 0.5 (neutral) when annotation stats exist but sample is insufficient", () => {
    const stats = [makeStat("zone_mismatch", 0.9, false)]; // sample insufficient
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
    // Average: (0.8 + 0.6) / 2 = 0.7
    expect(computeSignalA(["zone_mismatch", "severity_mismatch"], stats)).toBeCloseTo(0.7, 4);
  });

  it("uses 0.5 fallback for types not in annotationStats", () => {
    const stats = [makeStat("zone_mismatch", 0.8)];
    // zone_mismatch → 0.8, severity_mismatch → 0.5 (not in stats)
    // Average: (0.8 + 0.5) / 2 = 0.65
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
    const docOnly = { document: true, photos: false, physics: false };
    const photoOnly = { document: false, photos: true, physics: false };
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

// ─── scoreToConfidenceBand ────────────────────────────────────────────────────

describe("scoreToConfidenceBand", () => {
  it("returns HIGH for score = 1.0", () => expect(scoreToConfidenceBand(1.0)).toBe("HIGH"));
  it("returns HIGH for score = 0.70", () => expect(scoreToConfidenceBand(0.70)).toBe("HIGH"));
  it("returns HIGH for score = 0.85", () => expect(scoreToConfidenceBand(0.85)).toBe("HIGH"));
  it("returns MEDIUM for score = 0.69", () => expect(scoreToConfidenceBand(0.69)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.45", () => expect(scoreToConfidenceBand(0.45)).toBe("MEDIUM"));
  it("returns MEDIUM for score = 0.60", () => expect(scoreToConfidenceBand(0.60)).toBe("MEDIUM"));
  it("returns LOW for score = 0.44", () => expect(scoreToConfidenceBand(0.44)).toBe("LOW"));
  it("returns LOW for score = 0.0",  () => expect(scoreToConfidenceBand(0.0)).toBe("LOW"));
  it("returns LOW for score = 0.20", () => expect(scoreToConfidenceBand(0.20)).toBe("LOW"));
});

// ─── computeConsistencyConfidence — composite output ─────────────────────────

describe("computeConsistencyConfidence — composite output", () => {
  it("returns all required fields", () => {
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
    expect(out.breakdown).toHaveProperty("weight_a");
    expect(out.breakdown).toHaveProperty("weight_b");
    expect(out.breakdown).toHaveProperty("weight_c");
  });

  it("confidence_score is in [0.00, 1.00]", () => {
    const cases = [
      { detectedMismatchTypes: [], mismatchCount: 0, sourcesAvailable: ALL_SOURCES },
      { detectedMismatchTypes: ["zone_mismatch" as any], mismatchCount: 5, sourcesAvailable: NO_SOURCES },
      { detectedMismatchTypes: ["zone_mismatch" as any], mismatchCount: 0, sourcesAvailable: TWO_SOURCES },
    ];
    for (const input of cases) {
      const out = computeConsistencyConfidence(input);
      expect(out.confidence_score).toBeGreaterThanOrEqual(0.0);
      expect(out.confidence_score).toBeLessThanOrEqual(1.0);
    }
  });

  it("confidence band is consistent with confidence_score", () => {
    const cases = [
      { detectedMismatchTypes: [], mismatchCount: 0, sourcesAvailable: ALL_SOURCES },
      { detectedMismatchTypes: ["zone_mismatch" as any], mismatchCount: 5, sourcesAvailable: NO_SOURCES },
    ];
    for (const input of cases) {
      const out = computeConsistencyConfidence(input);
      expect(out.confidence).toBe(scoreToConfidenceBand(out.confidence_score));
    }
  });

  it("ideal case (no mismatches, all sources, high confirmation) → HIGH", () => {
    const stats = [makeStat("zone_mismatch", 0.9)];
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: stats,
    });
    expect(out.confidence).toBe("HIGH");
    expect(out.confidence_score).toBeGreaterThanOrEqual(0.70);
  });

  it("worst case (many mismatches, no sources, no annotation data) → LOW", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch", "severity_mismatch"] as any,
      mismatchCount: 10,
      sourcesAvailable: NO_SOURCES,
    });
    expect(out.confidence).toBe("LOW");
    expect(out.confidence_score).toBeLessThan(0.45);
  });

  it("composite score = weighted sum of three signals", () => {
    const stats = [makeStat("zone_mismatch", 0.8)];
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
      annotationStats: stats,
    });
    const expectedRaw =
      WEIGHT_A * out.breakdown.signal_a_confirmation_rate +
      WEIGHT_B * out.breakdown.signal_b_data_completeness +
      WEIGHT_C * out.breakdown.signal_c_mismatch_frequency;
    expect(out.confidence_score).toBeCloseTo(expectedRaw, 2);
  });

  it("no annotation stats → Signal A defaults to 0.5", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.signal_a_confirmation_rate).toBe(0.5);
  });

  it("no mismatches detected → Signal A = 1.0 (no detections = fully reliable)", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.signal_a_confirmation_rate).toBe(1.0);
  });

  it("all sources available → Signal B = 1.0", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.signal_b_data_completeness).toBeCloseTo(1.0, 4);
  });

  it("no sources available → Signal B = 0.0", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: NO_SOURCES,
    });
    expect(out.breakdown.signal_b_data_completeness).toBe(0.0);
  });

  it("0 mismatches → Signal C = 1.0", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.signal_c_mismatch_frequency).toBe(1.0);
  });

  it("8 mismatches → Signal C = 0.0", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 8,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.signal_c_mismatch_frequency).toBe(0.0);
  });

  it("breakdown weights match exported constants", () => {
    const out = computeConsistencyConfidence({
      detectedMismatchTypes: [],
      mismatchCount: 0,
      sourcesAvailable: ALL_SOURCES,
    });
    expect(out.breakdown.weight_a).toBe(WEIGHT_A);
    expect(out.breakdown.weight_b).toBe(WEIGHT_B);
    expect(out.breakdown.weight_c).toBe(WEIGHT_C);
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

  it("higher confirmation rate produces higher confidence_score (all else equal)", () => {
    const highStats = [makeStat("zone_mismatch", 0.9)];
    const lowStats  = [makeStat("zone_mismatch", 0.2)];

    const base = {
      detectedMismatchTypes: ["zone_mismatch"] as any,
      mismatchCount: 2,
      sourcesAvailable: ALL_SOURCES,
    };

    const highOut = computeConsistencyConfidence({ ...base, annotationStats: highStats });
    const lowOut  = computeConsistencyConfidence({ ...base, annotationStats: lowStats });

    expect(highOut.confidence_score).toBeGreaterThan(lowOut.confidence_score);
  });

  it("more sources available produces higher confidence_score (all else equal)", () => {
    const base = { detectedMismatchTypes: [] as any, mismatchCount: 0 };
    const allOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: ALL_SOURCES });
    const twoOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: TWO_SOURCES });
    const oneOut  = computeConsistencyConfidence({ ...base, sourcesAvailable: ONE_SOURCE });
    const noneOut = computeConsistencyConfidence({ ...base, sourcesAvailable: NO_SOURCES });

    expect(allOut.confidence_score).toBeGreaterThan(twoOut.confidence_score);
    expect(twoOut.confidence_score).toBeGreaterThan(oneOut.confidence_score);
    expect(oneOut.confidence_score).toBeGreaterThan(noneOut.confidence_score);
  });

  it("fewer mismatches produces higher confidence_score (all else equal)", () => {
    const base = { detectedMismatchTypes: ["zone_mismatch"] as any, sourcesAvailable: ALL_SOURCES };
    const clean   = computeConsistencyConfidence({ ...base, mismatchCount: 0 });
    const few     = computeConsistencyConfidence({ ...base, mismatchCount: 2 });
    const many    = computeConsistencyConfidence({ ...base, mismatchCount: 8 });

    expect(clean.confidence_score).toBeGreaterThan(few.confidence_score);
    expect(few.confidence_score).toBeGreaterThan(many.confidence_score);
  });
});
