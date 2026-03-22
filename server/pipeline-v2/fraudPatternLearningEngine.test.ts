/**
 * fraudPatternLearningEngine.test.ts
 *
 * Comprehensive test suite for the Fraud Pattern Learning Engine.
 * Tests cover:
 *  - Empty / minimal input edge cases
 *  - High-risk indicator identification (precision/recall/F1)
 *  - False positive pattern detection
 *  - Emerging pattern detection (trend analysis)
 *  - Scenario filtering
 *  - buildFraudLearningRecord helper
 *  - Metadata correctness
 *  - Sorting and capping behaviour
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  analyseFraudPatterns,
  buildFraudLearningRecord,
  type FraudLearningRecord,
  type FraudFlag,
  type FraudPatternInput,
} from "./fraudPatternLearningEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFlag(
  code: string,
  overrides: Partial<FraudFlag> = {}
): FraudFlag {
  return {
    code,
    label: code.replace(/_/g, " "),
    severity: "MEDIUM",
    score_contribution: 20,
    suppressed: false,
    ...overrides,
  };
}

function makeRecord(
  id: number,
  scenario: string,
  confirmed: boolean,
  cleared: boolean,
  flags: FraudFlag[],
  overrides: Partial<FraudLearningRecord> = {}
): FraudLearningRecord {
  return {
    claim_id: id,
    scenario_type: scenario,
    confirmed_fraud: confirmed,
    cleared_by_assessor: cleared,
    raised_flags: flags,
    fraud_score: confirmed ? 75 : 30,
    risk_level: confirmed ? "HIGH" : "LOW",
    quality_tier: "HIGH",
    timestamp_ms: Date.now(),
    ...overrides,
  };
}

/** Returns a timestamp N days ago */
function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

// ─── 1. Empty / Minimal Input ─────────────────────────────────────────────────

describe("analyseFraudPatterns — empty input", () => {
  it("returns empty arrays when no records provided", () => {
    const result = analyseFraudPatterns({ records: [] });
    expect(result.emerging_patterns).toEqual([]);
    expect(result.high_risk_indicators).toEqual([]);
    expect(result.false_positive_patterns).toEqual([]);
  });

  it("sets correct metadata for empty input", () => {
    const result = analyseFraudPatterns({ records: [] });
    expect(result.metadata.total_records_analysed).toBe(0);
    expect(result.metadata.confirmed_fraud_count).toBe(0);
    expect(result.metadata.cleared_count).toBe(0);
    expect(result.metadata.unresolved_count).toBe(0);
    expect(result.metadata.scenario_filter).toBeNull();
    expect(result.metadata.min_frequency).toBe(3);
    expect(result.metadata.min_precision).toBe(0.6);
    expect(result.metadata.emerging_window_days).toBe(90);
    expect(result.metadata.analysis_timestamp_ms).toBeGreaterThan(0);
  });

  it("returns empty arrays when all records are unresolved", () => {
    const records = [
      makeRecord(1, "theft", false, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", false, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", false, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records });
    expect(result.high_risk_indicators).toEqual([]);
    expect(result.false_positive_patterns).toEqual([]);
  });

  it("counts unresolved records correctly in metadata", () => {
    const records = [
      makeRecord(1, "theft", false, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records });
    expect(result.metadata.total_records_analysed).toBe(2);
    expect(result.metadata.confirmed_fraud_count).toBe(1);
    expect(result.metadata.unresolved_count).toBe(1);
  });
});

// ─── 2. High-Risk Indicators ──────────────────────────────────────────────────

describe("analyseFraudPatterns — high_risk_indicators", () => {
  it("identifies a flag with 100% precision as high-risk", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.high_risk_indicators.length).toBeGreaterThan(0);
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator).toBeDefined();
    expect(indicator!.precision).toBe(1);
    expect(indicator!.true_positives).toBe(3);
    expect(indicator!.false_positives).toBe(0);
  });

  it("excludes flags below min_precision threshold", () => {
    // 1 TP, 2 FP → precision = 0.33 < 0.6
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("single_vehicle")]),
      makeRecord(2, "theft", false, true, [makeFlag("single_vehicle")]),
      makeRecord(3, "theft", false, true, [makeFlag("single_vehicle")]),
    ];
    const result = analyseFraudPatterns({ records, min_precision: 0.6 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "single_vehicle"
    );
    expect(indicator).toBeUndefined();
  });

  it("excludes flags below min_frequency threshold", () => {
    // Only 2 resolved records but min_frequency = 3
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(2, "theft", true, false, [makeFlag("theft_no_recovery")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "theft_no_recovery"
    );
    expect(indicator).toBeUndefined();
  });

  it("calculates recall correctly", () => {
    // 3 fraud claims, flag raised on 2 → recall = 2/3
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(2, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(3, "theft", true, false, []), // no flag
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 2 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "theft_no_recovery"
    );
    expect(indicator).toBeDefined();
    expect(indicator!.recall).toBeCloseTo(0.667, 2);
  });

  it("calculates F1 score correctly", () => {
    // precision = 1.0, recall = 2/3 → F1 = 2*(1*0.667)/(1+0.667) ≈ 0.8
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(2, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(3, "theft", true, false, []),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 2 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "theft_no_recovery"
    );
    expect(indicator).toBeDefined();
    expect(indicator!.f1_score).toBeGreaterThan(0.7);
    expect(indicator!.f1_score).toBeLessThanOrEqual(1.0);
  });

  it("sorts indicators by F1 score descending", () => {
    // flag_a: precision=1, recall=1 → F1=1
    // flag_b: precision=0.75, recall=0.5 → F1≈0.6
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("flag_a"), makeFlag("flag_b")]),
      makeRecord(2, "theft", true, false, [makeFlag("flag_a"), makeFlag("flag_b")]),
      makeRecord(3, "theft", true, false, [makeFlag("flag_a")]),
      makeRecord(4, "theft", false, true, [makeFlag("flag_b")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 2 });
    const f1Scores = result.high_risk_indicators.map((i) => i.f1_score);
    for (let i = 1; i < f1Scores.length; i++) {
      expect(f1Scores[i]).toBeLessThanOrEqual(f1Scores[i - 1]);
    }
  });

  it("skips suppressed flags", () => {
    const records = [
      makeRecord(1, "animal_strike", true, false, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
      makeRecord(2, "animal_strike", true, false, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
      makeRecord(3, "animal_strike", true, false, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.high_risk_indicators).toEqual([]);
  });

  it("identifies effective_scenarios for a flag", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator?.effective_scenarios).toContain("theft");
  });

  it("handles zero fraud claims (recall = 0)", () => {
    const records = [
      makeRecord(1, "theft", false, true, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", false, true, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", false, true, [makeFlag("no_police_report")]),
    ];
    // All cleared — no fraud, so precision = 0/3 = 0 → excluded from high-risk
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.high_risk_indicators).toEqual([]);
  });

  it("uses known flag labels from the label map", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator?.label).toBe("No Police Report");
  });
});

// ─── 3. False Positive Patterns ───────────────────────────────────────────────

describe("analyseFraudPatterns — false_positive_patterns", () => {
  it("identifies a flag with high FP rate", () => {
    // 1 TP, 3 FP → FP rate = 0.75
    const records = [
      makeRecord(1, "animal_strike", true, false, [makeFlag("no_witnesses")]),
      makeRecord(2, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(3, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(4, "animal_strike", false, true, [makeFlag("no_witnesses")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fp = result.false_positive_patterns.find(
      (p) => p.flag_code === "no_witnesses"
    );
    expect(fp).toBeDefined();
    expect(fp!.false_positive_rate).toBeGreaterThanOrEqual(0.7);
    expect(fp!.false_positive_count).toBe(3);
    expect(fp!.true_positive_count).toBe(1);
  });

  it("excludes flags with FP rate below 30%", () => {
    // 3 TP, 1 FP → FP rate = 0.25 < 0.3
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(2, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(3, "theft", true, false, [makeFlag("theft_no_recovery")]),
      makeRecord(4, "theft", false, true, [makeFlag("theft_no_recovery")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fp = result.false_positive_patterns.find(
      (p) => p.flag_code === "theft_no_recovery"
    );
    expect(fp).toBeUndefined();
  });

  it("provides a recommendation for high FP flags", () => {
    const records = [
      makeRecord(1, "animal_strike", true, false, [makeFlag("no_witnesses")]),
      makeRecord(2, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(3, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(4, "animal_strike", false, true, [makeFlag("no_witnesses")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fp = result.false_positive_patterns.find(
      (p) => p.flag_code === "no_witnesses"
    );
    expect(fp?.recommendation).toBeTruthy();
    expect(fp?.recommendation.length).toBeGreaterThan(10);
  });

  it("suggests a positive score reduction for high FP flags", () => {
    const records = [
      makeRecord(1, "animal_strike", true, false, [makeFlag("no_witnesses", { score_contribution: 30 })]),
      makeRecord(2, "animal_strike", false, true, [makeFlag("no_witnesses", { score_contribution: 30 })]),
      makeRecord(3, "animal_strike", false, true, [makeFlag("no_witnesses", { score_contribution: 30 })]),
      makeRecord(4, "animal_strike", false, true, [makeFlag("no_witnesses", { score_contribution: 30 })]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fp = result.false_positive_patterns.find(
      (p) => p.flag_code === "no_witnesses"
    );
    expect(fp?.suggested_score_reduction).toBeGreaterThan(0);
  });

  it("sorts false positive patterns by FP rate descending", () => {
    // flag_a: 4 FP, 0 TP → FP rate = 1.0
    // flag_b: 2 FP, 1 TP → FP rate = 0.67
    const records = [
      makeRecord(1, "theft", false, true, [makeFlag("flag_a"), makeFlag("flag_b")]),
      makeRecord(2, "theft", false, true, [makeFlag("flag_a"), makeFlag("flag_b")]),
      makeRecord(3, "theft", false, true, [makeFlag("flag_a")]),
      makeRecord(4, "theft", false, true, [makeFlag("flag_a")]),
      makeRecord(5, "theft", true, false, [makeFlag("flag_b")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fpRates = result.false_positive_patterns.map((p) => p.false_positive_rate);
    for (let i = 1; i < fpRates.length; i++) {
      expect(fpRates[i]).toBeLessThanOrEqual(fpRates[i - 1]);
    }
  });

  it("identifies problematic scenarios for false positive flags", () => {
    const records = [
      makeRecord(1, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(2, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(3, "animal_strike", false, true, [makeFlag("no_witnesses")]),
      makeRecord(4, "animal_strike", true, false, [makeFlag("no_witnesses")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const fp = result.false_positive_patterns.find(
      (p) => p.flag_code === "no_witnesses"
    );
    expect(fp?.problematic_scenarios).toContain("animal_strike");
  });

  it("excludes suppressed flags from FP analysis", () => {
    const records = [
      makeRecord(1, "animal_strike", false, true, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
      makeRecord(2, "animal_strike", false, true, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
      makeRecord(3, "animal_strike", false, true, [
        makeFlag("no_witnesses", { suppressed: true }),
      ]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.false_positive_patterns).toEqual([]);
  });
});

// ─── 4. Emerging Patterns ─────────────────────────────────────────────────────

describe("analyseFraudPatterns — emerging_patterns", () => {
  it("detects a new pattern (only in recent window)", () => {
    const recentMs = daysAgo(10); // 10 days ago = within 90-day window
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const pattern = result.emerging_patterns.find((p) =>
      p.flag_codes.includes("no_police_report")
    );
    expect(pattern).toBeDefined();
    expect(pattern!.is_new).toBe(true);
    expect(pattern!.trend).toBe("INCREASING");
  });

  it("marks a pattern as DECREASING when only in historical window", () => {
    const oldMs = daysAgo(120); // 120 days ago = outside 90-day window
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: oldMs }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: oldMs }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: oldMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    // DECREASING patterns without is_new are excluded
    const pattern = result.emerging_patterns.find((p) =>
      p.flag_codes.includes("no_police_report")
    );
    expect(pattern).toBeUndefined();
  });

  it("detects co-occurrence patterns (2 flags)", () => {
    const recentMs = daysAgo(5);
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report"), makeFlag("theft_no_recovery")], { timestamp_ms: recentMs }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report"), makeFlag("theft_no_recovery")], { timestamp_ms: recentMs }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report"), makeFlag("theft_no_recovery")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const coPattern = result.emerging_patterns.find(
      (p) => p.flag_codes.length === 2 &&
        p.flag_codes.includes("no_police_report") &&
        p.flag_codes.includes("theft_no_recovery")
    );
    expect(coPattern).toBeDefined();
    expect(coPattern!.fraud_confirmation_rate).toBe(1);
  });

  it("excludes patterns with fraud confirmation rate below 50%", () => {
    const recentMs = daysAgo(5);
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("single_vehicle")], { timestamp_ms: recentMs }),
      makeRecord(2, "theft", false, true, [makeFlag("single_vehicle")], { timestamp_ms: recentMs }),
      makeRecord(3, "theft", false, true, [makeFlag("single_vehicle")], { timestamp_ms: recentMs }),
    ];
    // fraud_confirmation_rate = 1/3 = 0.33 < 0.5 → excluded
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const pattern = result.emerging_patterns.find((p) =>
      p.flag_codes.includes("single_vehicle")
    );
    expect(pattern).toBeUndefined();
  });

  it("caps emerging patterns at 20", () => {
    const recentMs = daysAgo(5);
    // Create many different flags to generate many patterns
    const records: FraudLearningRecord[] = [];
    const flagCodes = ["f1", "f2", "f3", "f4", "f5", "f6"];
    for (let i = 0; i < 20; i++) {
      records.push(
        makeRecord(i + 1, "theft", true, false,
          flagCodes.map((c) => makeFlag(c)),
          { timestamp_ms: recentMs }
        )
      );
    }
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.emerging_patterns.length).toBeLessThanOrEqual(20);
  });

  it("puts is_new patterns first in the sorted list", () => {
    const recentMs = daysAgo(5);
    const oldMs = daysAgo(120);
    const records = [
      // Old pattern (historical only) — but it's STABLE if we add some recent too
      makeRecord(10, "theft", true, false, [makeFlag("flag_old")], { timestamp_ms: oldMs }),
      makeRecord(11, "theft", true, false, [makeFlag("flag_old")], { timestamp_ms: oldMs }),
      makeRecord(12, "theft", true, false, [makeFlag("flag_old")], { timestamp_ms: recentMs }),
      makeRecord(13, "theft", true, false, [makeFlag("flag_old")], { timestamp_ms: recentMs }),
      makeRecord(14, "theft", true, false, [makeFlag("flag_old")], { timestamp_ms: recentMs }),
      // New pattern (recent only)
      makeRecord(20, "theft", true, false, [makeFlag("flag_new")], { timestamp_ms: recentMs }),
      makeRecord(21, "theft", true, false, [makeFlag("flag_new")], { timestamp_ms: recentMs }),
      makeRecord(22, "theft", true, false, [makeFlag("flag_new")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const newPatterns = result.emerging_patterns.filter((p) => p.is_new);
    const nonNewPatterns = result.emerging_patterns.filter((p) => !p.is_new);
    if (newPatterns.length > 0 && nonNewPatterns.length > 0) {
      const firstNonNewIndex = result.emerging_patterns.findIndex((p) => !p.is_new);
      const lastNewIndex = result.emerging_patterns.reduce(
        (acc, p, i) => (p.is_new ? i : acc), -1
      );
      expect(lastNewIndex).toBeLessThan(firstNonNewIndex);
    }
  });

  it("includes example claim IDs in emerging patterns", () => {
    const recentMs = daysAgo(5);
    const records = [
      makeRecord(100, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(101, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(102, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const pattern = result.emerging_patterns.find((p) =>
      p.flag_codes.includes("no_police_report")
    );
    expect(pattern?.example_claim_ids.length).toBeGreaterThan(0);
    expect(pattern?.example_claim_ids).toContain(100);
  });

  it("includes scenario_types in emerging patterns", () => {
    const recentMs = daysAgo(5);
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const pattern = result.emerging_patterns.find((p) =>
      p.flag_codes.includes("no_police_report")
    );
    expect(pattern?.scenario_types).toContain("theft");
  });

  it("generates a non-empty pattern_id", () => {
    const recentMs = daysAgo(5);
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: recentMs }),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const pattern = result.emerging_patterns[0];
    expect(pattern?.pattern_id).toBeTruthy();
    expect(pattern?.pattern_id.startsWith("PAT_")).toBe(true);
  });
});

// ─── 5. Scenario Filtering ────────────────────────────────────────────────────

describe("analyseFraudPatterns — scenario filtering", () => {
  it("filters records to the specified scenario", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(4, "fire", true, false, [makeFlag("fire_no_investigation")]),
      makeRecord(5, "fire", true, false, [makeFlag("fire_no_investigation")]),
      makeRecord(6, "fire", true, false, [makeFlag("fire_no_investigation")]),
    ];
    const result = analyseFraudPatterns({ records, scenario_filter: "theft" });
    expect(result.metadata.total_records_analysed).toBe(3);
    expect(result.metadata.scenario_filter).toBe("theft");
    const fireIndicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "fire_no_investigation"
    );
    expect(fireIndicator).toBeUndefined();
  });

  it("returns empty results when scenario filter matches nothing", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, scenario_filter: "fire" });
    expect(result.metadata.total_records_analysed).toBe(0);
    expect(result.high_risk_indicators).toEqual([]);
  });

  it("includes all scenarios when scenario_filter is null", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "fire", true, false, [makeFlag("fire_no_investigation")]),
    ];
    const result = analyseFraudPatterns({ records, scenario_filter: null });
    expect(result.metadata.total_records_analysed).toBe(2);
    expect(result.metadata.scenario_filter).toBeNull();
  });

  it("stores scenario_filter in metadata", () => {
    const result = analyseFraudPatterns({
      records: [],
      scenario_filter: "animal_strike",
    });
    expect(result.metadata.scenario_filter).toBe("animal_strike");
  });
});

// ─── 6. Custom Thresholds ─────────────────────────────────────────────────────

describe("analyseFraudPatterns — custom thresholds", () => {
  it("respects custom min_frequency = 2", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 2 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator).toBeDefined();
  });

  it("respects custom min_precision = 0.8", () => {
    // 3 TP, 1 FP → precision = 0.75 < 0.8 → excluded
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")]),
      makeRecord(4, "theft", false, true, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_precision: 0.8 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator).toBeUndefined();
  });

  it("stores custom thresholds in metadata", () => {
    const result = analyseFraudPatterns({
      records: [],
      min_frequency: 5,
      min_precision: 0.75,
      emerging_window_days: 30,
    });
    expect(result.metadata.min_frequency).toBe(5);
    expect(result.metadata.min_precision).toBe(0.75);
    expect(result.metadata.emerging_window_days).toBe(30);
  });
});

// ─── 7. Metadata Correctness ──────────────────────────────────────────────────

describe("analyseFraudPatterns — metadata", () => {
  it("counts confirmed_fraud, cleared, and unresolved correctly", () => {
    const records = [
      makeRecord(1, "theft", true, false, []),
      makeRecord(2, "theft", true, false, []),
      makeRecord(3, "theft", false, true, []),
      makeRecord(4, "theft", false, false, []),
    ];
    const result = analyseFraudPatterns({ records });
    expect(result.metadata.confirmed_fraud_count).toBe(2);
    expect(result.metadata.cleared_count).toBe(1);
    expect(result.metadata.unresolved_count).toBe(1);
    expect(result.metadata.total_records_analysed).toBe(4);
  });

  it("includes analysis_timestamp_ms as a recent timestamp", () => {
    const before = Date.now();
    const result = analyseFraudPatterns({ records: [] });
    const after = Date.now();
    expect(result.metadata.analysis_timestamp_ms).toBeGreaterThanOrEqual(before);
    expect(result.metadata.analysis_timestamp_ms).toBeLessThanOrEqual(after);
  });
});

// ─── 8. buildFraudLearningRecord ──────────────────────────────────────────────

describe("buildFraudLearningRecord", () => {
  const validFraudBreakdown = JSON.stringify({
    scenarioFraudResult: {
      flags: [
        { code: "no_police_report", label: "No Police Report", severity: "HIGH", score_contribution: 25 },
      ],
      fraud_score: 70,
      risk_level: "HIGH",
    },
  });

  const validOutcome = JSON.stringify({ store: true, quality_tier: "HIGH" });

  it("returns a valid record for confirmed fraud", () => {
    const record = buildFraudLearningRecord(
      42, "theft", validFraudBreakdown, validOutcome, "confirmed_fraud"
    );
    expect(record).not.toBeNull();
    expect(record!.claim_id).toBe(42);
    expect(record!.scenario_type).toBe("theft");
    expect(record!.confirmed_fraud).toBe(true);
    expect(record!.cleared_by_assessor).toBe(false);
    expect(record!.raised_flags.length).toBe(1);
    expect(record!.fraud_score).toBe(70);
    expect(record!.risk_level).toBe("HIGH");
    expect(record!.quality_tier).toBe("HIGH");
  });

  it("returns a valid record for cleared claim", () => {
    const record = buildFraudLearningRecord(
      43, "animal_strike", validFraudBreakdown, validOutcome, "cleared"
    );
    expect(record).not.toBeNull();
    expect(record!.confirmed_fraud).toBe(false);
    expect(record!.cleared_by_assessor).toBe(true);
  });

  it("returns null when fraudScoreBreakdownJson is null", () => {
    const record = buildFraudLearningRecord(1, "theft", null, validOutcome);
    expect(record).toBeNull();
  });

  it("returns null when validatedOutcomeJson is null", () => {
    const record = buildFraudLearningRecord(1, "theft", validFraudBreakdown, null);
    expect(record).toBeNull();
  });

  it("returns null when store = false in validated outcome", () => {
    const noStoreOutcome = JSON.stringify({ store: false, quality_tier: "LOW" });
    const record = buildFraudLearningRecord(1, "theft", validFraudBreakdown, noStoreOutcome);
    expect(record).toBeNull();
  });

  it("returns null when validatedOutcomeJson is invalid JSON", () => {
    const record = buildFraudLearningRecord(1, "theft", validFraudBreakdown, "not-json");
    expect(record).toBeNull();
  });

  it("handles object input for fraudScoreBreakdownJson", () => {
    const fraudObj = {
      scenarioFraudResult: {
        flags: [],
        fraud_score: 30,
        risk_level: "LOW",
      },
    };
    const outcomeObj = { store: true, quality_tier: "MEDIUM" };
    const record = buildFraudLearningRecord(5, "fire", fraudObj, outcomeObj, "cleared");
    expect(record).not.toBeNull();
    expect(record!.fraud_score).toBe(30);
    expect(record!.quality_tier).toBe("MEDIUM");
  });

  it("falls back to top-level fraudScore when scenarioFraudResult is absent", () => {
    const fallbackBreakdown = JSON.stringify({
      fraudScore: 55,
      riskLevel: "MEDIUM",
    });
    const record = buildFraudLearningRecord(
      6, "vandalism", fallbackBreakdown, validOutcome, "unresolved"
    );
    expect(record).not.toBeNull();
    expect(record!.fraud_score).toBe(55);
    expect(record!.risk_level).toBe("MEDIUM");
    expect(record!.raised_flags).toEqual([]);
  });

  it("sets confirmed_fraud=false and cleared=false for unresolved outcome", () => {
    const record = buildFraudLearningRecord(
      7, "flood", validFraudBreakdown, validOutcome, "unresolved"
    );
    expect(record!.confirmed_fraud).toBe(false);
    expect(record!.cleared_by_assessor).toBe(false);
  });

  it("sets confirmed_fraud=false and cleared=false when assessorOutcome is undefined", () => {
    const record = buildFraudLearningRecord(
      8, "flood", validFraudBreakdown, validOutcome
    );
    expect(record!.confirmed_fraud).toBe(false);
    expect(record!.cleared_by_assessor).toBe(false);
  });
});

// ─── 9. Edge Cases ────────────────────────────────────────────────────────────

describe("analyseFraudPatterns — edge cases", () => {
  it("handles a single record without error", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    expect(() => analyseFraudPatterns({ records })).not.toThrow();
  });

  it("handles records with no flags without error", () => {
    const records = [
      makeRecord(1, "theft", true, false, []),
      makeRecord(2, "theft", false, true, []),
    ];
    const result = analyseFraudPatterns({ records });
    expect(result.high_risk_indicators).toEqual([]);
    expect(result.false_positive_patterns).toEqual([]);
  });

  it("handles records with null timestamp_ms gracefully", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: null }),
      makeRecord(2, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: null }),
      makeRecord(3, "theft", true, false, [makeFlag("no_police_report")], { timestamp_ms: null }),
    ];
    expect(() => analyseFraudPatterns({ records })).not.toThrow();
  });

  it("handles large number of records without error", () => {
    const records: FraudLearningRecord[] = [];
    for (let i = 0; i < 500; i++) {
      records.push(
        makeRecord(i, "theft", i % 3 !== 0, i % 3 === 0, [makeFlag("no_police_report")], {
          timestamp_ms: daysAgo(i % 100),
        })
      );
    }
    expect(() => analyseFraudPatterns({ records })).not.toThrow();
    const result = analyseFraudPatterns({ records });
    expect(result.metadata.total_records_analysed).toBe(500);
  });

  it("handles multiple scenarios in one analysis", () => {
    const scenarios = ["theft", "fire", "flood", "vandalism", "animal_strike"];
    const records: FraudLearningRecord[] = [];
    scenarios.forEach((s, i) => {
      for (let j = 0; j < 3; j++) {
        records.push(
          makeRecord(i * 10 + j, s, true, false, [makeFlag("no_police_report")])
        );
      }
    });
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    expect(result.metadata.total_records_analysed).toBe(15);
  });

  it("does not include the same flag in both high_risk and false_positive lists", () => {
    // A flag with precision = 0.5 should be in neither list (below 0.6 precision, below 0.3 FP threshold)
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_witnesses")]),
      makeRecord(2, "theft", false, true, [makeFlag("no_witnesses")]),
      makeRecord(3, "theft", true, false, [makeFlag("no_witnesses")]),
      makeRecord(4, "theft", false, true, [makeFlag("no_witnesses")]),
    ];
    // precision = 0.5, FP rate = 0.5
    const result = analyseFraudPatterns({ records, min_frequency: 3 });
    const inHighRisk = result.high_risk_indicators.some((i) => i.flag_code === "no_witnesses");
    const inFalsePos = result.false_positive_patterns.some((p) => p.flag_code === "no_witnesses");
    // Can be in false_positive (FP rate = 0.5 >= 0.3) but not high_risk (precision = 0.5 < 0.6)
    expect(inHighRisk).toBe(false);
    expect(inFalsePos).toBe(true);
  });

  it("handles min_frequency = 1 correctly", () => {
    const records = [
      makeRecord(1, "theft", true, false, [makeFlag("no_police_report")]),
    ];
    const result = analyseFraudPatterns({ records, min_frequency: 1 });
    const indicator = result.high_risk_indicators.find(
      (i) => i.flag_code === "no_police_report"
    );
    expect(indicator).toBeDefined();
    expect(indicator!.precision).toBe(1);
  });
});
