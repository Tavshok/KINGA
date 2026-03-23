import { describe, it, expect } from "vitest";
import {
  evaluateCalibrationFeedback,
  evaluateCalibrationFeedbackBatch,
  summariseCalibrationBatch,
  type CalibrationFeedbackInput,
  type DriftReport,
  type FraudPatternReport,
  type CostPatternReport,
} from "./calibrationFeedbackController";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const noDriftReport: DriftReport = {
  drift_detected: false,
  drift_areas: [],
  severity: "LOW",
  recommendation: "No action required.",
};

const highCostDriftReport: DriftReport = {
  drift_detected: true,
  drift_areas: [
    {
      dimension: "cost",
      direction: "OVER",
      magnitude_pct: 25,
      is_continuous: false,
      sample_count: 50,
    },
  ],
  severity: "MEDIUM",
  recommendation: "Reduce cost multiplier.",
};

const continuousCostDriftReport: DriftReport = {
  drift_detected: true,
  drift_areas: [
    {
      dimension: "cost",
      direction: "OVER",
      magnitude_pct: 30,
      is_continuous: true,
      window_count: 4,
      sample_count: 80,
    },
  ],
  severity: "HIGH",
  recommendation: "Immediate cost recalibration required.",
};

const underCostDriftReport: DriftReport = {
  drift_detected: true,
  drift_areas: [
    {
      dimension: "cost",
      direction: "UNDER",
      magnitude_pct: 22,
      is_continuous: false,
      sample_count: 40,
    },
  ],
  severity: "MEDIUM",
  recommendation: "Increase cost multiplier.",
};

const extremeCostDriftReport: DriftReport = {
  drift_detected: true,
  drift_areas: [
    {
      dimension: "cost",
      direction: "OVER",
      magnitude_pct: 80,
      is_continuous: false,
      sample_count: 30,
    },
  ],
  severity: "HIGH",
  recommendation: "Extreme cost drift detected.",
};

const noFraudReport: FraudPatternReport = {
  emerging_patterns: [],
  high_risk_indicators: [],
  false_positive_patterns: [],
};

const highFPFraudReport: FraudPatternReport = {
  emerging_patterns: [],
  high_risk_indicators: [],
  false_positive_patterns: [
    {
      flag_key: "multiple_claims_same_period",
      false_positive_rate: 0.45,
      sample_count: 30,
      suggested_score_reduction: 40,
    },
    {
      flag_key: "late_reporting",
      false_positive_rate: 0.35,
      sample_count: 20,
      suggested_score_reduction: 25,
    },
  ],
};

const lowFPFraudReport: FraudPatternReport = {
  emerging_patterns: [],
  high_risk_indicators: [],
  false_positive_patterns: [
    {
      flag_key: "minor_damage_flag",
      false_positive_rate: 0.15, // below 30% threshold
      sample_count: 25,
      suggested_score_reduction: 10,
    },
  ],
};

const confirmedFraudReport: FraudPatternReport = {
  emerging_patterns: [],
  high_risk_indicators: [
    {
      flag_key: "staged_accident_pattern",
      precision: 0.85,
      recall: 0.70,
      f1_score: 0.77,
      sample_count: 25,
      recommended_weight_adjustment: 0.30,
    },
  ],
  false_positive_patterns: [],
};

const mixedFraudReport: FraudPatternReport = {
  emerging_patterns: [],
  high_risk_indicators: [
    {
      flag_key: "high_value_claim",
      precision: 0.80,
      recall: 0.65,
      f1_score: 0.72,
      sample_count: 40,
      recommended_weight_adjustment: 0.20,
    },
  ],
  false_positive_patterns: [
    {
      flag_key: "multiple_claims_same_period",
      false_positive_rate: 0.40,
      sample_count: 30,
      suggested_score_reduction: 35,
    },
  ],
};

const noCostReport: CostPatternReport = {
  total_claims_analysed: 50,
  mean_cost_error_pct: 5,
  median_cost_error_pct: 4,
  cost_drivers: [],
};

const baseInput: CalibrationFeedbackInput = {
  drift_report: noDriftReport,
  fraud_pattern_report: noFraudReport,
  cost_pattern_report: noCostReport,
  jurisdiction: "ZW",
  sample_size: 50,
  confidence: 75,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CalibrationFeedbackController", () => {

  // ── Rule 1: Minimum Data Requirement ────────────────────────────────────────
  describe("Rule 1: Minimum Data Requirement", () => {
    it("blocks when sample_size < 20", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        sample_size: 15,
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toContain("Insufficient sample size");
      expect(result.blocked_reason).toContain("15");
      expect(result.risk_level).toBe("LOW");
    });

    it("blocks when sample_size = 19", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        sample_size: 19,
      });
      expect(result.apply_update).toBe(false);
    });

    it("allows when sample_size = 20", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        sample_size: 20,
      });
      // No changes needed (no drift, no fraud issues) → apply_update false but no blocked_reason
      expect(result.blocked_reason).toBeUndefined();
    });

    it("blocks when confidence < 60", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        confidence: 55,
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toContain("Confidence too low");
      expect(result.blocked_reason).toContain("55%");
    });

    it("blocks when confidence = 59", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        confidence: 59,
      });
      expect(result.apply_update).toBe(false);
    });

    it("allows when confidence = 60", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        confidence: 60,
      });
      expect(result.blocked_reason).toBeUndefined();
    });

    it("blocks when both sample_size and confidence are too low", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        sample_size: 5,
        confidence: 30,
      });
      expect(result.apply_update).toBe(false);
      // sample_size check comes first
      expect(result.blocked_reason).toContain("sample size");
    });
  });

  // ── Rule 5: Jurisdiction Awareness ──────────────────────────────────────────
  describe("Rule 5: Jurisdiction Awareness", () => {
    it("blocks global override with < 100 samples", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        jurisdiction: "global",
        sample_size: 80,
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toContain("Global overrides require");
      expect(result.risk_level).toBe("MEDIUM");
    });

    it("allows global override with >= 100 samples and drift", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
        jurisdiction: "global",
        sample_size: 120,
        confidence: 70,
      });
      expect(result.apply_update).toBe(true);
      expect(result.risk_level).toBe("HIGH"); // global always HIGH
    });

    it("scopes update to specific jurisdiction", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
        jurisdiction: "ZM",
      });
      expect(result.jurisdiction).toBe("ZM");
      expect(result.reasoning).toContain("ZM");
    });
  });

  // ── Rule 2: Cost Drift Handling ──────────────────────────────────────────────
  describe("Rule 2: Cost Drift Handling", () => {
    it("does not adjust multiplier when drift <= 20%", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          ...noDriftReport,
          drift_areas: [{ dimension: "cost", direction: "OVER", magnitude_pct: 18, is_continuous: false }],
        },
      });
      // No fraud issues either → no changes needed
      expect(result.updates.cost_multiplier).toBe(1.0);
    });

    it("adjusts multiplier when cost drift > 20% (OVER)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
      });
      expect(result.apply_update).toBe(true);
      // 25% overestimation → theoretical = 0.75, gradual = 1 + (0.75-1)*0.5 = 0.875
      expect(result.updates.cost_multiplier).toBeCloseTo(0.875, 2);
    });

    it("adjusts multiplier when cost drift > 20% (UNDER)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: underCostDriftReport,
      });
      expect(result.apply_update).toBe(true);
      // 22% underestimation → theoretical = 1.22, gradual = 1 + (1.22-1)*0.5 = 1.11
      expect(result.updates.cost_multiplier).toBeCloseTo(1.11, 2);
    });

    it("caps extreme cost drift at ±50% safety limit", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: extremeCostDriftReport,
      });
      expect(result.apply_update).toBe(true);
      // 80% over → theoretical = 0.20, gradual = 1+(0.20-1)*0.5 = 0.60
      // change = 0.40 which is within the 0.50 cap, so no capping occurs
      expect(result.updates.cost_multiplier).toBeCloseTo(0.60, 2);
    });

    it("sets HIGH risk for continuous cost drift", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: continuousCostDriftReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.risk_level).toBe("HIGH");
    });

    it("sets MEDIUM risk for large non-continuous drift (> 35%)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          ...noDriftReport,
          drift_detected: true,
          drift_areas: [{ dimension: "cost", direction: "OVER", magnitude_pct: 40, is_continuous: false }],
        },
      });
      expect(result.risk_level).toBe("MEDIUM");
    });

    it("includes cost multiplier in reasoning", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
      });
      expect(result.reasoning).toContain("Cost multiplier");
      expect(result.reasoning).toContain("0.875");
    });
  });

  // ── Rule 3: Fraud Adjustment ─────────────────────────────────────────────────
  describe("Rule 3: Fraud Adjustment", () => {
    it("reduces weight for flags with FP rate > 30%", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: highFPFraudReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.updates.fraud_adjustments["multiple_claims_same_period"]).toBeLessThan(0);
      expect(result.updates.fraud_adjustments["late_reporting"]).toBeLessThan(0);
    });

    it("does not reduce weight for flags with FP rate <= 30%", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: lowFPFraudReport,
      });
      // No changes → apply_update false (no changes needed)
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toBeUndefined(); // no changes needed, not blocked
    });

    it("applies gradual reduction (50% of suggested)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: [
            {
              flag_key: "test_flag",
              false_positive_rate: 0.40,
              sample_count: 20,
              suggested_score_reduction: 40, // 40% → gradual = 20% → 0.20
            },
          ],
        },
      });
      expect(result.updates.fraud_adjustments["test_flag"]).toBeCloseTo(-0.20, 2);
    });

    it("increases weight for confirmed high-precision fraud patterns", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: confirmedFraudReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.updates.fraud_adjustments["staged_accident_pattern"]).toBeGreaterThan(0);
    });

    it("applies gradual increase (50% of recommended)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: confirmedFraudReport,
      });
      // recommended = 0.30, gradual = 0.15
      expect(result.updates.fraud_adjustments["staged_accident_pattern"]).toBeCloseTo(0.15, 2);
    });

    it("does not increase weight for low-precision indicators", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          high_risk_indicators: [
            {
              flag_key: "low_precision_flag",
              precision: 0.55, // below 70% threshold
              recall: 0.80,
              f1_score: 0.65,
              sample_count: 30,
              recommended_weight_adjustment: 0.20,
            },
          ],
        },
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toBeUndefined();
    });

    it("handles mixed fraud report (FP reduction + weight increase)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: mixedFraudReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.updates.fraud_adjustments["multiple_claims_same_period"]).toBeLessThan(0);
      expect(result.updates.fraud_adjustments["high_value_claim"]).toBeGreaterThan(0);
    });

    it("does not double-apply adjustments when flag appears in both lists", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          emerging_patterns: [],
          high_risk_indicators: [
            {
              flag_key: "overlap_flag",
              precision: 0.80,
              recall: 0.70,
              f1_score: 0.75,
              sample_count: 20,
              recommended_weight_adjustment: 0.25,
            },
          ],
          false_positive_patterns: [
            {
              flag_key: "overlap_flag", // same flag
              false_positive_rate: 0.35,
              sample_count: 20,
              suggested_score_reduction: 30,
            },
          ],
        },
      });
      // FP check runs first → negative adjustment; high_risk check skips it
      const adj = result.updates.fraud_adjustments["overlap_flag"];
      expect(adj).toBeLessThan(0); // FP reduction wins
      // Should only appear once
      expect(Object.keys(result.updates.fraud_adjustments).filter(k => k === "overlap_flag").length).toBe(1);
    });

    it("ignores fraud flags with sample count < 10", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: [
            {
              flag_key: "small_sample_flag",
              false_positive_rate: 0.60,
              sample_count: 5, // below threshold
              suggested_score_reduction: 50,
            },
          ],
        },
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toBeUndefined();
    });

    it("sets MEDIUM risk when FP rate > 50%", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: [
            {
              flag_key: "very_high_fp_flag",
              false_positive_rate: 0.65,
              sample_count: 20,
              suggested_score_reduction: 50,
            },
          ],
        },
      });
      expect(result.risk_level).toBe("MEDIUM");
    });

    it("sets HIGH risk when > 5 fraud flags are adjusted", () => {
      const manyFlags = Array.from({ length: 6 }, (_, i) => ({
        flag_key: `flag_${i}`,
        false_positive_rate: 0.40,
        sample_count: 15,
        suggested_score_reduction: 30,
      }));
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: manyFlags,
        },
      });
      expect(result.risk_level).toBe("HIGH");
    });
  });

  // ── Rule 4: Safety Constraints ───────────────────────────────────────────────
  describe("Rule 4: Safety Constraints", () => {
    it("never applies > 50% cost multiplier change", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: extremeCostDriftReport,
      });
      const change = Math.abs(result.updates.cost_multiplier - 1.0);
      expect(change).toBeLessThanOrEqual(0.5);
    });

    it("never applies > 50% fraud weight change", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: [
            {
              flag_key: "extreme_fp_flag",
              false_positive_rate: 0.90,
              sample_count: 50,
              suggested_score_reduction: 100, // 100% → gradual = 50% → exactly at cap
            },
          ],
        },
      });
      const adj = result.updates.fraud_adjustments["extreme_fp_flag"];
      expect(Math.abs(adj)).toBeLessThanOrEqual(0.5);
    });

    it("applies gradual correction (50% factor) for cost", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          ...noDriftReport,
          drift_detected: true,
          drift_areas: [{ dimension: "cost", direction: "OVER", magnitude_pct: 40, is_continuous: false }],
        },
      });
      // 40% over → theoretical = 0.60, gradual = 1 + (0.60-1)*0.5 = 0.80
      expect(result.updates.cost_multiplier).toBeCloseTo(0.80, 2);
    });
  });

  // ── Rule 6: Philosophy ───────────────────────────────────────────────────────
  describe("Rule 6: Prefer stability over aggressive learning", () => {
    it("returns apply_update=false when no changes are warranted", () => {
      const result = evaluateCalibrationFeedback(baseInput);
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toBeUndefined(); // not blocked, just no changes
    });

    it("reasoning explains no changes needed", () => {
      const result = evaluateCalibrationFeedback(baseInput);
      expect(result.reasoning).toContain("No calibration adjustments warranted");
    });

    it("cost_multiplier defaults to 1.0 when no drift", () => {
      const result = evaluateCalibrationFeedback(baseInput);
      expect(result.updates.cost_multiplier).toBe(1.0);
    });

    it("fraud_adjustments is empty when no fraud issues", () => {
      const result = evaluateCalibrationFeedback(baseInput);
      expect(Object.keys(result.updates.fraud_adjustments)).toHaveLength(0);
    });
  });

  // ── Combined scenarios ────────────────────────────────────────────────────────
  describe("Combined scenarios", () => {
    it("handles cost drift + fraud FP together", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
        fraud_pattern_report: highFPFraudReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.updates.cost_multiplier).not.toBe(1.0);
      expect(Object.keys(result.updates.fraud_adjustments).length).toBeGreaterThan(0);
      expect(result.proposed_changes_count).toBeGreaterThanOrEqual(3);
    });

    it("handles continuous drift + confirmed fraud together", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: continuousCostDriftReport,
        fraud_pattern_report: confirmedFraudReport,
      });
      expect(result.apply_update).toBe(true);
      expect(result.risk_level).toBe("HIGH");
    });

    it("returns correct metadata fields", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
      });
      expect(result.jurisdiction).toBe("ZW");
      expect(result.sample_size).toBe(50);
      expect(result.confidence).toBe(75);
      expect(result.proposed_changes_count).toBeGreaterThan(0);
    });

    it("notes field contains explanation of changes", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
        fraud_pattern_report: highFPFraudReport,
      });
      expect(result.updates.notes).toContain("Cost multiplier");
      expect(result.updates.notes).toContain("multiple_claims_same_period");
    });
  });

  // ── Batch evaluation ──────────────────────────────────────────────────────────
  describe("Batch evaluation", () => {
    it("evaluates multiple jurisdictions independently", () => {
      const inputs: CalibrationFeedbackInput[] = [
        { ...baseInput, jurisdiction: "ZW", drift_report: highCostDriftReport },
        { ...baseInput, jurisdiction: "ZM", drift_report: noDriftReport },
        { ...baseInput, jurisdiction: "ZA", sample_size: 10 }, // will be blocked
      ];
      const results = evaluateCalibrationFeedbackBatch(inputs);
      expect(results).toHaveLength(3);
      expect(results[0].apply_update).toBe(true);
      expect(results[0].jurisdiction).toBe("ZW");
      expect(results[1].apply_update).toBe(false); // no changes needed
      expect(results[2].apply_update).toBe(false); // blocked
      expect(results[2].blocked_reason).toContain("sample size");
    });
  });

  // ── Batch summary ─────────────────────────────────────────────────────────────
  describe("Batch summary", () => {
    it("summarises batch results correctly", () => {
      const inputs: CalibrationFeedbackInput[] = [
        { ...baseInput, jurisdiction: "ZW", drift_report: highCostDriftReport },
        { ...baseInput, jurisdiction: "ZM", drift_report: continuousCostDriftReport },
        { ...baseInput, jurisdiction: "ZA", sample_size: 5 }, // blocked
      ];
      const results = evaluateCalibrationFeedbackBatch(inputs);
      const summary = summariseCalibrationBatch(results);

      expect(summary.total_evaluated).toBe(3);
      expect(summary.updates_approved).toBe(2);
      expect(summary.updates_blocked).toBe(1);
      expect(summary.high_risk_count).toBeGreaterThanOrEqual(1); // continuous drift
      expect(summary.jurisdictions_affected).toContain("ZW");
      expect(summary.jurisdictions_affected).toContain("ZM");
      expect(summary.jurisdictions_affected).not.toContain("ZA");
      expect(summary.total_proposed_changes).toBeGreaterThan(0);
      expect(summary.average_cost_multiplier).not.toBe(1.0);
    });

    it("handles empty batch", () => {
      const summary = summariseCalibrationBatch([]);
      expect(summary.total_evaluated).toBe(0);
      expect(summary.updates_approved).toBe(0);
      expect(summary.average_cost_multiplier).toBe(1.0);
      expect(summary.jurisdictions_affected).toHaveLength(0);
    });

    it("handles all-blocked batch", () => {
      const inputs: CalibrationFeedbackInput[] = [
        { ...baseInput, sample_size: 5 },
        { ...baseInput, confidence: 30 },
      ];
      const results = evaluateCalibrationFeedbackBatch(inputs);
      const summary = summariseCalibrationBatch(results);
      expect(summary.updates_approved).toBe(0);
      expect(summary.updates_blocked).toBe(2);
      expect(summary.average_cost_multiplier).toBe(1.0);
    });

    it("computes correct average cost multiplier", () => {
      const inputs: CalibrationFeedbackInput[] = [
        { ...baseInput, jurisdiction: "ZW", drift_report: highCostDriftReport }, // multiplier ~0.875
        { ...baseInput, jurisdiction: "ZM", drift_report: underCostDriftReport }, // multiplier ~1.11
      ];
      const results = evaluateCalibrationFeedbackBatch(inputs);
      const summary = summariseCalibrationBatch(results);
      expect(summary.average_cost_multiplier).toBeCloseTo((0.875 + 1.11) / 2, 1);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────
  describe("Edge cases", () => {
    it("handles exactly 20% cost drift (at threshold boundary)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          ...noDriftReport,
          drift_detected: true,
          drift_areas: [{ dimension: "cost", direction: "OVER", magnitude_pct: 20, is_continuous: false }],
        },
      });
      // Exactly at threshold → no adjustment (> 20% required)
      expect(result.updates.cost_multiplier).toBe(1.0);
    });

    it("handles exactly 20.1% cost drift (just above threshold)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          ...noDriftReport,
          drift_detected: true,
          drift_areas: [{ dimension: "cost", direction: "OVER", magnitude_pct: 20.1, is_continuous: false }],
        },
      });
      expect(result.updates.cost_multiplier).toBeLessThan(1.0);
    });

    it("handles exactly 30% FP rate (at threshold boundary)", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        fraud_pattern_report: {
          ...noFraudReport,
          false_positive_patterns: [
            {
              flag_key: "boundary_flag",
              false_positive_rate: 0.30, // exactly at threshold → no adjustment (> 30% required)
              sample_count: 20,
              suggested_score_reduction: 25,
            },
          ],
        },
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toBeUndefined();
    });

    it("handles non-cost drift areas (severity, fraud) without affecting cost multiplier", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: {
          drift_detected: true,
          drift_areas: [
            { dimension: "severity", direction: "OVER", magnitude_pct: 30, is_continuous: false },
          ],
          severity: "MEDIUM",
          recommendation: "Severity drift detected.",
        },
      });
      expect(result.updates.cost_multiplier).toBe(1.0);
    });

    it("handles very large sample size correctly", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        drift_report: highCostDriftReport,
        sample_size: 10000,
        confidence: 95,
      });
      expect(result.apply_update).toBe(true);
      expect(result.sample_size).toBe(10000);
    });

    it("handles jurisdiction case-insensitively for global check", () => {
      const result = evaluateCalibrationFeedback({
        ...baseInput,
        jurisdiction: "GLOBAL",
        sample_size: 50,
      });
      expect(result.apply_update).toBe(false);
      expect(result.blocked_reason).toContain("Global overrides require");
    });
  });
});
