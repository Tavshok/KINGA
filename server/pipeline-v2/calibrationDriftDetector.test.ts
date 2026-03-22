/**
 * calibrationDriftDetector.test.ts
 *
 * Comprehensive test suite for the Calibration Drift Detector engine.
 * Covers: empty input, cost drift detection, severity drift detection,
 * continuous drift, direction classification, scenario filtering,
 * severity escalation, recommendation generation, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  detectCalibrationDrift,
  buildDriftRecord,
  type DriftRecord,
  type CalibrationDriftInput,
} from "./calibrationDriftDetector";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000; // Fixed base timestamp (ms)
const DAY_MS = 24 * 60 * 60 * 1000;

function makeRecord(
  overrides: Partial<DriftRecord> & {
    claim_id?: number;
    ai_predicted_cost?: number;
    actual_cost?: number;
    ai_predicted_severity?: "minor" | "moderate" | "severe";
    actual_severity?: "minor" | "moderate" | "severe";
    timestamp_ms?: number;
    scenario_type?: string;
  } = {}
): DriftRecord {
  return {
    claim_id: overrides.claim_id ?? 1,
    scenario_type: overrides.scenario_type ?? "vehicle_collision",
    ai_predicted_cost: overrides.ai_predicted_cost ?? 10_000,
    actual_cost: overrides.actual_cost ?? 10_000,
    ai_predicted_severity: overrides.ai_predicted_severity ?? "moderate",
    actual_severity: overrides.actual_severity ?? "moderate",
    timestamp_ms: overrides.timestamp_ms ?? BASE_TS,
    quality_tier: overrides.quality_tier ?? "HIGH",
  };
}

/** Generate N records spread across M windows (windowSizeDays apart) */
function makeWindowedRecords(
  windows: number,
  recordsPerWindow: number,
  windowSizeDays: number,
  costOverridePerWindow: (windowIdx: number) => { ai: number; actual: number },
  severityOverridePerWindow?: (windowIdx: number) => {
    ai: "minor" | "moderate" | "severe";
    actual: "minor" | "moderate" | "severe";
  }
): DriftRecord[] {
  const records: DriftRecord[] = [];
  let id = 1;
  for (let w = 0; w < windows; w++) {
    const tsBase = BASE_TS + w * windowSizeDays * DAY_MS;
    const { ai, actual } = costOverridePerWindow(w);
    const sev = severityOverridePerWindow?.(w) ?? {
      ai: "moderate" as const,
      actual: "moderate" as const,
    };
    for (let r = 0; r < recordsPerWindow; r++) {
      records.push(
        makeRecord({
          claim_id: id++,
          ai_predicted_cost: ai,
          actual_cost: actual,
          ai_predicted_severity: sev.ai,
          actual_severity: sev.actual,
          timestamp_ms: tsBase + r * 1000,
        })
      );
    }
  }
  return records;
}

// ─── 1. Empty Input ────────────────────────────────────────────────────────────

describe("detectCalibrationDrift — empty input", () => {
  it("returns drift_detected=false with empty records array", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(result.drift_detected).toBe(false);
    expect(result.drift_areas).toHaveLength(0);
    expect(result.severity).toBe("LOW");
  });

  it("returns a helpful recommendation for empty input", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(result.recommendation.toLowerCase()).toContain("no validated");
  });

  it("returns zero statistics for empty input", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(result.statistics.total_records).toBe(0);
    expect(result.statistics.mean_cost_error_pct).toBe(0);
    expect(result.statistics.severity_mismatch_rate).toBe(0);
  });

  it("returns correct metadata for empty input", () => {
    const result = detectCalibrationDrift({
      records: [],
      cost_drift_threshold: 0.15,
      scenario_filter: "theft",
    });
    expect(result.metadata.records_analysed).toBe(0);
    expect(result.metadata.cost_drift_threshold).toBe(0.15);
    expect(result.metadata.scenario_filter).toBe("theft");
  });
});

// ─── 2. No Drift (within threshold) ───────────────────────────────────────────

describe("detectCalibrationDrift — no drift", () => {
  it("returns drift_detected=false when all predictions are exact", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ claim_id: i, ai_predicted_cost: 10_000, actual_cost: 10_000 })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.drift_detected).toBe(false);
    expect(result.drift_areas).toHaveLength(0);
    expect(result.severity).toBe("LOW");
  });

  it("returns drift_detected=false when cost error is exactly at threshold", () => {
    // 20% error exactly — should NOT flag (must be strictly greater than threshold)
    const records = [
      makeRecord({ ai_predicted_cost: 12_000, actual_cost: 10_000 }),
    ];
    const result = detectCalibrationDrift({
      records,
      cost_drift_threshold: 0.20,
    });
    // 20% error = exactly at threshold, not above → no drift
    expect(result.drift_detected).toBe(false);
  });

  it("returns drift_detected=false when cost error is 19% (below 20% threshold)", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_cost: 11_900,
        actual_cost: 10_000,
      })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.drift_detected).toBe(false);
  });

  it("returns drift_detected=false when severity mismatch is below threshold", () => {
    // 10% mismatch rate (1 of 10) — below 20% threshold
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      ...Array.from({ length: 9 }, (_, i) => makeRecord({ claim_id: i + 2 })),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.drift_detected).toBe(false);
  });

  it("returns a 'no drift' recommendation when clean", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.recommendation.toLowerCase()).toContain("no calibration drift");
  });
});

// ─── 3. Cost Drift Detection ───────────────────────────────────────────────────

describe("detectCalibrationDrift — cost drift", () => {
  it("detects cost drift when mean absolute error exceeds 20%", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_cost: 13_000,
        actual_cost: 10_000,
      })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.drift_detected).toBe(true);
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    expect(costArea).toBeDefined();
    expect(costArea!.measured_value).toBeGreaterThan(0.20);
  });

  it("classifies direction as over_estimate when AI consistently over-predicts", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_cost: 15_000,
        actual_cost: 10_000,
      })
    );
    const result = detectCalibrationDrift({ records });
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    expect(costArea?.direction).toBe("over_estimate");
  });

  it("classifies direction as under_estimate when AI consistently under-predicts", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_cost: 7_000,
        actual_cost: 10_000,
      })
    );
    const result = detectCalibrationDrift({ records });
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    expect(costArea?.direction).toBe("under_estimate");
  });

  it("classifies direction as mixed when errors are in both directions", () => {
    const records = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeRecord({ claim_id: i, ai_predicted_cost: 15_000, actual_cost: 10_000 })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRecord({ claim_id: i + 5, ai_predicted_cost: 5_000, actual_cost: 10_000 })
      ),
    ];
    const result = detectCalibrationDrift({ records });
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    // Mean absolute error is 50%, but mean signed error is ~0 → mixed
    expect(costArea?.direction).toBe("mixed");
  });

  it("reports correct affected_record_count for cost drift", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 3, ai_predicted_cost: 10_100, actual_cost: 10_000 }), // 1% — no drift
    ];
    const result = detectCalibrationDrift({ records });
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    // 2 records have >20% drift
    expect(costArea?.affected_record_count).toBe(2);
  });

  it("respects custom cost_drift_threshold", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i, ai_predicted_cost: 11_500, actual_cost: 10_000 })
    );
    // 15% error — above 10% threshold, below 20%
    const result = detectCalibrationDrift({
      records,
      cost_drift_threshold: 0.10,
    });
    expect(result.drift_detected).toBe(true);
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    expect(costArea).toBeDefined();
  });

  it("includes over_estimate language in recommendation", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i, ai_predicted_cost: 15_000, actual_cost: 10_000 })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.recommendation.toLowerCase()).toContain("over-estimat");
  });

  it("includes under_estimate language in recommendation", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i, ai_predicted_cost: 7_000, actual_cost: 10_000 })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.recommendation.toLowerCase()).toContain("under-estimat");
  });

  it("populates statistics.over_estimate_count correctly", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 3, ai_predicted_cost: 7_000, actual_cost: 10_000 }),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.over_estimate_count).toBe(2);
    expect(result.statistics.under_estimate_count).toBe(1);
  });

  it("populates mean_absolute_error_usd correctly", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 13_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, ai_predicted_cost: 7_000, actual_cost: 10_000 }),
    ];
    const result = detectCalibrationDrift({ records });
    // MAE = (3000 + 3000) / 2 = 3000
    expect(result.statistics.mean_absolute_error_usd).toBe(3000);
  });
});

// ─── 4. Severity Drift Detection ──────────────────────────────────────────────

describe("detectCalibrationDrift — severity drift", () => {
  it("detects severity drift when mismatch rate exceeds 20%", () => {
    // 3 mismatches out of 10 = 30%
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 2, ai_predicted_severity: "minor", actual_severity: "severe" }),
      makeRecord({ claim_id: 3, ai_predicted_severity: "moderate", actual_severity: "severe" }),
      ...Array.from({ length: 7 }, (_, i) => makeRecord({ claim_id: i + 4 })),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.drift_detected).toBe(true);
    const sevArea = result.drift_areas.find((a) => a.dimension === "severity");
    expect(sevArea).toBeDefined();
    expect(sevArea!.measured_value).toBeCloseTo(0.3, 2);
  });

  it("does not flag severity drift at exactly 20% mismatch rate", () => {
    // 2 mismatches out of 10 = 20% exactly — not above threshold
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 2, ai_predicted_severity: "minor", actual_severity: "severe" }),
      ...Array.from({ length: 8 }, (_, i) => makeRecord({ claim_id: i + 3 })),
    ];
    const result = detectCalibrationDrift({ records });
    const sevArea = result.drift_areas.find((a) => a.dimension === "severity");
    expect(sevArea).toBeUndefined();
  });

  it("builds correct severity confusion matrix", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 2, ai_predicted_severity: "severe", actual_severity: "minor" }),
      makeRecord({ claim_id: 3, ai_predicted_severity: "moderate", actual_severity: "severe" }),
      makeRecord({ claim_id: 4 }), // correct
    ];
    const result = detectCalibrationDrift({ records });
    const c = result.statistics.severity_confusion;
    expect(c.minor_predicted_as_moderate).toBe(1);
    expect(c.severe_predicted_as_minor).toBe(1);
    expect(c.moderate_predicted_as_severe).toBe(1);
    expect(c.correct).toBe(1);
  });

  it("respects custom severity_mismatch_threshold", () => {
    // 15% mismatch — above 10% custom threshold
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 2, ai_predicted_severity: "minor", actual_severity: "severe" }),
      ...Array.from({ length: 11 }, (_, i) => makeRecord({ claim_id: i + 3 })),
    ];
    const result = detectCalibrationDrift({
      records,
      severity_mismatch_threshold: 0.10,
    });
    const sevArea = result.drift_areas.find((a) => a.dimension === "severity");
    expect(sevArea).toBeDefined();
  });

  it("populates severity_mismatch_rate in statistics", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 2, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 3, ai_predicted_severity: "minor", actual_severity: "moderate" }),
      makeRecord({ claim_id: 4 }),
      makeRecord({ claim_id: 5 }),
    ];
    const result = detectCalibrationDrift({ records });
    // 3/5 = 0.6
    expect(result.statistics.severity_mismatch_rate).toBeCloseTo(0.6, 2);
  });

  it("severity area has direction=null (not applicable for severity)", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_severity: "minor",
        actual_severity: "severe",
      })
    );
    const result = detectCalibrationDrift({ records });
    const sevArea = result.drift_areas.find((a) => a.dimension === "severity");
    expect(sevArea?.direction).toBeNull();
  });
});

// ─── 5. Continuous Drift Detection ────────────────────────────────────────────

describe("detectCalibrationDrift — continuous drift", () => {
  it("detects continuous cost drift across 3+ consecutive windows", () => {
    // 4 windows, each with 30% over-estimate
    const records = makeWindowedRecords(
      4,
      5,
      30,
      () => ({ ai: 13_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    expect(result.statistics.continuous_drift_detected).toBe(true);
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    expect(costArea?.is_continuous).toBe(true);
    expect(costArea?.consecutive_window_count).toBeGreaterThanOrEqual(3);
  });

  it("escalates to HIGH severity when drift is continuous", () => {
    const records = makeWindowedRecords(
      4,
      5,
      30,
      () => ({ ai: 14_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    expect(result.severity).toBe("HIGH");
  });

  it("does not flag continuous drift with only 2 windows (below default threshold of 3)", () => {
    const records = makeWindowedRecords(
      2,
      5,
      30,
      () => ({ ai: 13_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    // 2 consecutive windows < 3 threshold → not continuous
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    if (costArea) {
      expect(costArea.is_continuous).toBe(false);
    }
  });

  it("detects continuous drift with custom window count of 2", () => {
    const records = makeWindowedRecords(
      2,
      5,
      30,
      () => ({ ai: 13_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 2,
    });
    expect(result.statistics.continuous_drift_detected).toBe(true);
  });

  it("does not flag continuous drift when direction alternates between windows", () => {
    // Alternating over/under estimate — not continuous in one direction
    const records = makeWindowedRecords(
      4,
      5,
      30,
      (w) =>
        w % 2 === 0
          ? { ai: 13_000, actual: 10_000 } // over
          : { ai: 7_000, actual: 10_000 }  // under
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    const costArea = result.drift_areas.find((a) => a.dimension === "cost");
    if (costArea) {
      expect(costArea.is_continuous).toBe(false);
    }
  });

  it("continuous drift recommendation includes URGENT escalation language", () => {
    const records = makeWindowedRecords(
      4,
      5,
      30,
      () => ({ ai: 14_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    expect(result.recommendation.toUpperCase()).toContain("URGENT");
  });

  it("reports windows_analysed count correctly", () => {
    const records = makeWindowedRecords(4, 3, 30, () => ({ ai: 10_000, actual: 10_000 }));
    const result = detectCalibrationDrift({ records, window_size_days: 30 });
    expect(result.statistics.windows_analysed).toBe(4);
  });
});

// ─── 6. Severity Escalation ────────────────────────────────────────────────────

describe("detectCalibrationDrift — severity escalation", () => {
  it("returns LOW severity when no drift detected", () => {
    const records = Array.from({ length: 5 }, (_, i) => makeRecord({ claim_id: i }));
    const result = detectCalibrationDrift({ records });
    expect(result.severity).toBe("LOW");
  });

  it("returns MEDIUM severity for single drift area (non-continuous)", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i, ai_predicted_cost: 15_000, actual_cost: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    // Single window → not continuous → MEDIUM
    expect(result.severity).toBe("MEDIUM");
  });

  it("returns HIGH severity when both cost and severity drift simultaneously", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({
        claim_id: i,
        ai_predicted_cost: 15_000,
        actual_cost: 10_000,
        ai_predicted_severity: "minor",
        actual_severity: "severe",
      })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.severity).toBe("HIGH");
  });

  it("returns HIGH severity for continuous drift even with single drift area", () => {
    const records = makeWindowedRecords(
      4,
      5,
      30,
      () => ({ ai: 13_000, actual: 10_000 })
    );
    const result = detectCalibrationDrift({
      records,
      window_size_days: 30,
      continuous_drift_window_count: 3,
    });
    expect(result.severity).toBe("HIGH");
  });
});

// ─── 7. Scenario Filtering ────────────────────────────────────────────────────

describe("detectCalibrationDrift — scenario filtering", () => {
  it("filters records to the specified scenario", () => {
    const records = [
      makeRecord({ claim_id: 1, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, scenario_type: "vehicle_collision", ai_predicted_cost: 10_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 3, scenario_type: "vehicle_collision", ai_predicted_cost: 10_000, actual_cost: 10_000 }),
    ];
    const result = detectCalibrationDrift({
      records,
      scenario_filter: "vehicle_collision",
    });
    expect(result.metadata.records_analysed).toBe(2);
    expect(result.drift_detected).toBe(false);
  });

  it("detects drift only in the filtered scenario", () => {
    const records = [
      makeRecord({ claim_id: 1, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 3, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 4, scenario_type: "vehicle_collision" }),
    ];
    const result = detectCalibrationDrift({
      records,
      scenario_filter: "theft",
    });
    expect(result.drift_detected).toBe(true);
    expect(result.metadata.records_analysed).toBe(3);
  });

  it("returns empty result when scenario filter matches no records", () => {
    const records = [makeRecord({ scenario_type: "vehicle_collision" })];
    const result = detectCalibrationDrift({
      records,
      scenario_filter: "fire",
    });
    expect(result.drift_detected).toBe(false);
    expect(result.metadata.records_analysed).toBe(0);
  });

  it("stores scenario_filter in metadata", () => {
    const result = detectCalibrationDrift({
      records: [],
      scenario_filter: "flood",
    });
    expect(result.metadata.scenario_filter).toBe("flood");
  });

  it("stores null scenario_filter when not provided", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(result.metadata.scenario_filter).toBeNull();
  });
});

// ─── 8. Per-Scenario Statistics ────────────────────────────────────────────────

describe("detectCalibrationDrift — per-scenario statistics", () => {
  it("computes by_scenario stats for each scenario", () => {
    const records = [
      makeRecord({ claim_id: 1, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 2, scenario_type: "theft", ai_predicted_cost: 15_000, actual_cost: 10_000 }),
      makeRecord({ claim_id: 3, scenario_type: "fire", ai_predicted_cost: 10_000, actual_cost: 10_000 }),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.by_scenario["theft"]).toBeDefined();
    expect(result.statistics.by_scenario["fire"]).toBeDefined();
    expect(result.statistics.by_scenario["theft"].cost_drift_flagged).toBe(true);
    expect(result.statistics.by_scenario["fire"].cost_drift_flagged).toBe(false);
  });

  it("reports correct record_count per scenario", () => {
    const records = [
      makeRecord({ claim_id: 1, scenario_type: "theft" }),
      makeRecord({ claim_id: 2, scenario_type: "theft" }),
      makeRecord({ claim_id: 3, scenario_type: "fire" }),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.by_scenario["theft"].record_count).toBe(2);
    expect(result.statistics.by_scenario["fire"].record_count).toBe(1);
  });

  it("flags severity drift per scenario when mismatch rate exceeds threshold", () => {
    const records = [
      makeRecord({ claim_id: 1, scenario_type: "theft", ai_predicted_severity: "minor", actual_severity: "severe" }),
      makeRecord({ claim_id: 2, scenario_type: "theft", ai_predicted_severity: "minor", actual_severity: "severe" }),
      makeRecord({ claim_id: 3, scenario_type: "theft", ai_predicted_severity: "minor", actual_severity: "severe" }),
      makeRecord({ claim_id: 4, scenario_type: "fire" }),
    ];
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.by_scenario["theft"].severity_drift_flagged).toBe(true);
    expect(result.statistics.by_scenario["fire"].severity_drift_flagged).toBe(false);
  });
});

// ─── 9. Statistics Accuracy ────────────────────────────────────────────────────

describe("detectCalibrationDrift — statistics accuracy", () => {
  it("computes mean_cost_error_pct correctly", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 13_000, actual_cost: 10_000 }), // 30%
      makeRecord({ claim_id: 2, ai_predicted_cost: 11_000, actual_cost: 10_000 }), // 10%
    ];
    const result = detectCalibrationDrift({ records });
    // Mean absolute error = (30% + 10%) / 2 = 20%
    expect(result.statistics.mean_cost_error_pct).toBeCloseTo(20, 0);
  });

  it("computes median_cost_error_pct correctly", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 13_000, actual_cost: 10_000 }), // 30%
      makeRecord({ claim_id: 2, ai_predicted_cost: 11_000, actual_cost: 10_000 }), // 10%
      makeRecord({ claim_id: 3, ai_predicted_cost: 15_000, actual_cost: 10_000 }), // 50%
    ];
    const result = detectCalibrationDrift({ records });
    // Sorted: [10, 30, 50] → median = 30%
    expect(result.statistics.median_cost_error_pct).toBeCloseTo(30, 0);
  });

  it("handles zero actual_cost gracefully (treats as 100% error)", () => {
    const records = [
      makeRecord({ claim_id: 1, ai_predicted_cost: 5_000, actual_cost: 0 }),
    ];
    // Should not throw
    expect(() => detectCalibrationDrift({ records })).not.toThrow();
  });

  it("handles equal predicted and actual costs (0% error)", () => {
    const records = [makeRecord({ ai_predicted_cost: 10_000, actual_cost: 10_000 })];
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.mean_cost_error_pct).toBe(0);
  });

  it("populates total_records correctly", () => {
    const records = Array.from({ length: 7 }, (_, i) => makeRecord({ claim_id: i }));
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.total_records).toBe(7);
  });
});

// ─── 10. Metadata ──────────────────────────────────────────────────────────────

describe("detectCalibrationDrift — metadata", () => {
  it("stores default thresholds in metadata when not overridden", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(result.metadata.cost_drift_threshold).toBe(0.20);
    expect(result.metadata.severity_mismatch_threshold).toBe(0.20);
    expect(result.metadata.continuous_drift_window_count).toBe(3);
    expect(result.metadata.window_size_days).toBe(30);
  });

  it("stores custom thresholds in metadata", () => {
    const result = detectCalibrationDrift({
      records: [],
      cost_drift_threshold: 0.15,
      severity_mismatch_threshold: 0.10,
      continuous_drift_window_count: 4,
      window_size_days: 14,
    });
    expect(result.metadata.cost_drift_threshold).toBe(0.15);
    expect(result.metadata.severity_mismatch_threshold).toBe(0.10);
    expect(result.metadata.continuous_drift_window_count).toBe(4);
    expect(result.metadata.window_size_days).toBe(14);
  });

  it("populates analysis_timestamp_ms as a recent timestamp", () => {
    const before = Date.now();
    const result = detectCalibrationDrift({ records: [] });
    const after = Date.now();
    expect(result.metadata.analysis_timestamp_ms).toBeGreaterThanOrEqual(before);
    expect(result.metadata.analysis_timestamp_ms).toBeLessThanOrEqual(after);
  });

  it("handles null threshold overrides by using defaults", () => {
    const result = detectCalibrationDrift({
      records: [],
      cost_drift_threshold: null,
      severity_mismatch_threshold: null,
    });
    expect(result.metadata.cost_drift_threshold).toBe(0.20);
    expect(result.metadata.severity_mismatch_threshold).toBe(0.20);
  });
});

// ─── 11. buildDriftRecord Helper ──────────────────────────────────────────────

describe("buildDriftRecord", () => {
  it("returns a valid DriftRecord for correct inputs", () => {
    const record = buildDriftRecord(
      1,
      "vehicle_collision",
      12_000,
      10_000,
      "moderate",
      "moderate",
      BASE_TS
    );
    expect(record).not.toBeNull();
    expect(record!.claim_id).toBe(1);
    expect(record!.ai_predicted_cost).toBe(12_000);
    expect(record!.actual_cost).toBe(10_000);
    expect(record!.ai_predicted_severity).toBe("moderate");
    expect(record!.actual_severity).toBe("moderate");
  });

  it("returns null when ai_predicted_cost is null", () => {
    const record = buildDriftRecord(1, "theft", null, 10_000, "minor", "minor", BASE_TS);
    expect(record).toBeNull();
  });

  it("returns null when actual_cost is null", () => {
    const record = buildDriftRecord(1, "theft", 10_000, null, "minor", "minor", BASE_TS);
    expect(record).toBeNull();
  });

  it("returns null when actual_cost is zero", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 0, "minor", "minor", BASE_TS);
    expect(record).toBeNull();
  });

  it("returns null when actual_cost is negative", () => {
    const record = buildDriftRecord(1, "theft", 10_000, -500, "minor", "minor", BASE_TS);
    expect(record).toBeNull();
  });

  it("returns null when ai_predicted_severity is invalid", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "catastrophic" as never, "minor", BASE_TS);
    expect(record).toBeNull();
  });

  it("returns null when actual_severity is invalid", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "minor", "unknown" as never, BASE_TS);
    expect(record).toBeNull();
  });

  it("normalises severity values to lowercase", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "MODERATE" as never, "SEVERE" as never, BASE_TS);
    expect(record?.ai_predicted_severity).toBe("moderate");
    expect(record?.actual_severity).toBe("severe");
  });

  it("uses current timestamp when timestamp_ms is null", () => {
    const before = Date.now();
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "minor", "minor", null);
    const after = Date.now();
    expect(record?.timestamp_ms).toBeGreaterThanOrEqual(before);
    expect(record?.timestamp_ms).toBeLessThanOrEqual(after);
  });

  it("stores quality_tier when provided", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "minor", "minor", BASE_TS, "HIGH");
    expect(record?.quality_tier).toBe("HIGH");
  });

  it("stores null quality_tier when not provided", () => {
    const record = buildDriftRecord(1, "theft", 10_000, 10_000, "minor", "minor", BASE_TS);
    expect(record?.quality_tier).toBeNull();
  });

  it("returns null when ai_predicted_cost is null and actual_cost is valid", () => {
    const record = buildDriftRecord(1, "theft", undefined, 10_000, "minor", "minor", BASE_TS);
    expect(record).toBeNull();
  });
});

// ─── 12. Edge Cases ────────────────────────────────────────────────────────────

describe("detectCalibrationDrift — edge cases", () => {
  it("handles single record without throwing", () => {
    const records = [makeRecord({ ai_predicted_cost: 15_000, actual_cost: 10_000 })];
    expect(() => detectCalibrationDrift({ records })).not.toThrow();
  });

  it("handles records all in the same time window", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ claim_id: i, timestamp_ms: BASE_TS })
    );
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.windows_analysed).toBe(1);
  });

  it("handles very large cost values without overflow", () => {
    const records = [
      makeRecord({ ai_predicted_cost: 10_000_000, actual_cost: 8_000_000 }),
    ];
    expect(() => detectCalibrationDrift({ records })).not.toThrow();
    const result = detectCalibrationDrift({ records });
    expect(result.statistics.mean_cost_error_pct).toBeCloseTo(25, 0);
  });

  it("handles all records having the same scenario type", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ claim_id: i, scenario_type: "flood" })
    );
    const result = detectCalibrationDrift({ records });
    expect(Object.keys(result.statistics.by_scenario)).toEqual(["flood"]);
  });

  it("drift_areas is always an array (never undefined)", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(Array.isArray(result.drift_areas)).toBe(true);
  });

  it("recommendation is always a non-empty string", () => {
    const result = detectCalibrationDrift({ records: [] });
    expect(typeof result.recommendation).toBe("string");
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it("severity is always one of LOW | MEDIUM | HIGH", () => {
    const results = [
      detectCalibrationDrift({ records: [] }),
      detectCalibrationDrift({
        records: [makeRecord({ ai_predicted_cost: 15_000, actual_cost: 10_000 })],
      }),
    ];
    for (const r of results) {
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(r.severity);
    }
  });
});
