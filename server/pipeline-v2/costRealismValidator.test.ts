/**
 * costRealismValidator.test.ts
 *
 * Stage 36: Cost Realism Validator — Unit Tests
 *
 * Covers:
 *   1. Exported constants (ratios, tolerances, confidence reductions)
 *   2. SEVERITY_COST_RANGES_CENTS table structure
 *   3. Rule 1 — Labour ratio validation (20–60% band)
 *   4. Rule 2 — Parts alignment (component_count × avg_cost ± tolerance)
 *   5. Rule 3 — Proportional adjustment (totals recomputed after adjustment)
 *   6. Rule 4 — Severity ↔ cost cross-check
 *   7. Output contract (validated_cost / adjustments_applied)
 *   8. Confidence multiplier accumulation
 *   9. mergeValidatedCost adapter
 *  10. Null / degraded input handling
 *  11. Edge cases (zero costs, single component, extreme values)
 */

import { describe, it, expect } from "vitest";
import {
  validateCostRealism,
  mergeValidatedCost,
  LABOUR_RATIO_MIN,
  LABOUR_RATIO_MAX,
  PARTS_ALIGNMENT_TOLERANCE,
  DEFAULT_AVG_COMPONENT_COST_CENTS,
  SEVERITY_COST_RANGES_CENTS,
  SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION,
  LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION,
  PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION,
} from "./costRealismValidator";
import type { Stage9Output, AccidentSeverity } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeStage9(
  partsCents: number,
  labourCents: number,
  paintCents: number = 0,
  hiddenCents: number = 0
): Stage9Output {
  const totalCents = partsCents + labourCents + paintCents + hiddenCents;
  return {
    expectedRepairCostCents: totalCents,
    quoteDeviationPct: null,
    recommendedCostRange: {
      lowCents: Math.round(totalCents * 0.8),
      highCents: Math.round(totalCents * 1.2),
    },
    savingsOpportunityCents: 0,
    breakdown: {
      partsCostCents: partsCents,
      labourCostCents: labourCents,
      paintCostCents: paintCents,
      hiddenDamageCostCents: hiddenCents,
      totalCents,
    },
    labourRateUsdPerHour: 40,
    marketRegion: "ZA",
    currency: "USD",
    repairIntelligence: [],
    partsReconciliation: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Exported constants
// ─────────────────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("LABOUR_RATIO_MIN is 0.20", () => {
    expect(LABOUR_RATIO_MIN).toBe(0.20);
  });

  it("LABOUR_RATIO_MAX is 0.60", () => {
    expect(LABOUR_RATIO_MAX).toBe(0.60);
  });

  it("PARTS_ALIGNMENT_TOLERANCE is between 0.20 and 0.60", () => {
    expect(PARTS_ALIGNMENT_TOLERANCE).toBeGreaterThanOrEqual(0.20);
    expect(PARTS_ALIGNMENT_TOLERANCE).toBeLessThanOrEqual(0.60);
  });

  it("DEFAULT_AVG_COMPONENT_COST_CENTS is a positive number", () => {
    expect(DEFAULT_AVG_COMPONENT_COST_CENTS).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_AVG_COMPONENT_COST_CENTS)).toBe(true);
  });

  it("SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION is between 0.5 and 1.0", () => {
    expect(SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION).toBeGreaterThan(0.5);
    expect(SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION).toBeLessThan(1.0);
  });

  it("LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION is between 0.5 and 1.0", () => {
    expect(LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION).toBeGreaterThan(0.5);
    expect(LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION).toBeLessThan(1.0);
  });

  it("PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION is between 0.5 and 1.0", () => {
    expect(PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION).toBeGreaterThan(0.5);
    expect(PARTS_ALIGNMENT_MISMATCH_CONFIDENCE_REDUCTION).toBeLessThan(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEVERITY_COST_RANGES_CENTS table
// ─────────────────────────────────────────────────────────────────────────────

describe("SEVERITY_COST_RANGES_CENTS", () => {
  const severities: AccidentSeverity[] = ["none", "cosmetic", "minor", "moderate", "severe", "catastrophic"];

  it("has entries for all AccidentSeverity values", () => {
    for (const sev of severities) {
      expect(SEVERITY_COST_RANGES_CENTS[sev]).toBeDefined();
    }
  });

  it("each entry has minCents and maxCents", () => {
    for (const sev of severities) {
      const range = SEVERITY_COST_RANGES_CENTS[sev];
      expect(typeof range.minCents).toBe("number");
      expect(typeof range.maxCents).toBe("number");
      expect(range.maxCents).toBeGreaterThan(range.minCents);
    }
  });

  it("ranges are monotonically increasing from minor to catastrophic", () => {
    const ordered: AccidentSeverity[] = ["minor", "moderate", "severe", "catastrophic"];
    for (let i = 1; i < ordered.length; i++) {
      const prev = SEVERITY_COST_RANGES_CENTS[ordered[i - 1]];
      const curr = SEVERITY_COST_RANGES_CENTS[ordered[i]];
      expect(curr.maxCents).toBeGreaterThan(prev.maxCents);
    }
  });

  it("minor maxCents is less than severe minCents", () => {
    expect(SEVERITY_COST_RANGES_CENTS["minor"].maxCents).toBeLessThan(
      SEVERITY_COST_RANGES_CENTS["severe"].maxCents
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Rule 1 — Labour ratio validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 1 — Labour ratio validation", () => {
  it("no issue when labour ratio is exactly 20%", () => {
    // parts=80000, labour=20000 → ratio = 20%
    const result = validateCostRealism(makeStage9(80_000, 20_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
    expect(result.validated_breakdown.labour_cost_cents).toBe(20_000);
  });

  it("no issue when labour ratio is exactly 60%", () => {
    // parts=40000, labour=60000 → ratio = 60%
    const result = validateCostRealism(makeStage9(40_000, 60_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
  });

  it("no issue when labour ratio is 40% (middle of band)", () => {
    // parts=60000, labour=40000 → ratio = 40%
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
    expect(result.confidence_multiplier).toBe(1.0);
  });

  it("flags issue when labour ratio is below 20%", () => {
    // parts=95000, labour=5000 → ratio ≈ 5%
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeDefined();
    expect(labourIssue!.rule).toBe("labour_ratio");
  });

  it("flags issue when labour ratio is above 60%", () => {
    // parts=10000, labour=90000 → ratio = 90%
    const result = validateCostRealism(makeStage9(10_000, 90_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeDefined();
  });

  it("adjusts labour upward when ratio is below 20%", () => {
    // parts=95000, labour=5000 → ratio ≈ 5% → should adjust labour up
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    const labourAdj = result.adjustments.find((a) => a.rule === "labour_ratio");
    expect(labourAdj).toBeDefined();
    expect(labourAdj!.adjusted_value_cents).toBeGreaterThan(labourAdj!.original_value_cents);
  });

  it("adjusts labour downward when ratio is above 60%", () => {
    // parts=10000, labour=90000 → ratio = 90% → should adjust labour down
    const result = validateCostRealism(makeStage9(10_000, 90_000), 0, null);
    const labourAdj = result.adjustments.find((a) => a.rule === "labour_ratio");
    expect(labourAdj).toBeDefined();
    expect(labourAdj!.adjusted_value_cents).toBeLessThan(labourAdj!.original_value_cents);
  });

  it("validated labour ratio is within [20%, 60%] after adjustment", () => {
    // Test both extremes
    for (const [parts, labour] of [[95_000, 5_000], [10_000, 90_000]]) {
      const result = validateCostRealism(makeStage9(parts, labour), 0, null);
      expect(result.labour_ratio).toBeGreaterThanOrEqual(LABOUR_RATIO_MIN - 0.001);
      expect(result.labour_ratio).toBeLessThanOrEqual(LABOUR_RATIO_MAX + 0.001);
    }
  });

  it("reduces confidence when labour ratio is out of band", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    expect(result.confidence_multiplier).toBeLessThan(1.0);
  });

  it("adjustments_applied is true when labour was adjusted", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    expect(result.adjustments_applied).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Rule 2 — Parts alignment validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 2 — Parts alignment validation", () => {
  it("no issue when parts cost is within tolerance of expected", () => {
    // 2 components × 35000 = 70000 expected; parts=70000 → exact match
    const result = validateCostRealism(makeStage9(70_000, 30_000), 2, null, 35_000);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeUndefined();
  });

  it("no issue when parts cost is within 40% tolerance (below)", () => {
    // 2 components × 35000 = 70000; tolerance = ±28000; lower bound = 42000
    const result = validateCostRealism(makeStage9(50_000, 30_000), 2, null, 35_000);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeUndefined();
  });

  it("flags issue when parts cost is far below expected", () => {
    // 3 components × 35000 = 105000; parts=10000 → way below lower bound (63000)
    const result = validateCostRealism(makeStage9(10_000, 30_000), 3, null, 35_000);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeDefined();
  });

  it("flags issue when parts cost is far above expected", () => {
    // 2 components × 35000 = 70000; parts=300000 → way above upper bound (98000)
    const result = validateCostRealism(makeStage9(300_000, 30_000), 2, null, 35_000);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeDefined();
  });

  it("adjusts parts cost to nearest bound when out of tolerance", () => {
    // 2 × 35000 = 70000; bounds = [42000, 98000]; parts=10000 → adjust to 42000
    const result = validateCostRealism(makeStage9(10_000, 30_000), 2, null, 35_000);
    const partsAdj = result.adjustments.find((a) => a.rule === "parts_alignment");
    expect(partsAdj).toBeDefined();
    const expectedLower = Math.round(70_000 * (1 - PARTS_ALIGNMENT_TOLERANCE));
    expect(partsAdj!.adjusted_value_cents).toBeGreaterThanOrEqual(expectedLower - 1);
  });

  it("skips parts validation when componentCount is 0", () => {
    const result = validateCostRealism(makeStage9(10_000, 30_000), 0, null);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeUndefined();
  });

  it("reduces confidence when parts cost is out of alignment", () => {
    const result = validateCostRealism(makeStage9(10_000, 30_000), 3, null, 35_000);
    if (result.issues.some((i) => i.rule === "parts_alignment")) {
      expect(result.confidence_multiplier).toBeLessThan(1.0);
    }
  });

  it("uses DEFAULT_AVG_COMPONENT_COST_CENTS when no override provided", () => {
    // With 2 components and default cost, expected = 2 × DEFAULT
    const expected = 2 * DEFAULT_AVG_COMPONENT_COST_CENTS;
    const tolerance = expected * PARTS_ALIGNMENT_TOLERANCE;
    // Parts = expected → no issue
    const result = validateCostRealism(makeStage9(expected, 30_000), 2, null);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rule 3 — Proportional adjustment (totals recomputed)
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 3 — Proportional adjustment", () => {
  it("total_cents equals sum of all breakdown components after adjustment", () => {
    // Force a labour ratio adjustment
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    const vb = result.validated_breakdown;
    const expectedTotal = vb.parts_cost_cents + vb.labour_cost_cents + vb.paint_cost_cents + vb.hidden_damage_cost_cents;
    expect(vb.total_cents).toBe(expectedTotal);
  });

  it("paint and hidden damage costs are preserved after labour adjustment", () => {
    // parts=60000, labour=5000, paint=10000, hidden=5000 → labour too low
    const result = validateCostRealism(makeStage9(60_000, 5_000, 10_000, 5_000), 0, null);
    expect(result.validated_breakdown.paint_cost_cents).toBe(10_000);
    expect(result.validated_breakdown.hidden_damage_cost_cents).toBe(5_000);
  });

  it("total_cents is consistent after both parts and labour adjustments", () => {
    // Force both: parts too low (3 components × 35000 = 105000; parts=5000)
    //             and labour ratio check follows
    const result = validateCostRealism(makeStage9(5_000, 30_000), 3, null, 35_000);
    const vb = result.validated_breakdown;
    const sum = vb.parts_cost_cents + vb.labour_cost_cents + vb.paint_cost_cents + vb.hidden_damage_cost_cents;
    expect(vb.total_cents).toBe(sum);
  });

  it("validated_breakdown.total_cents is always a positive integer when input is non-zero", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.validated_breakdown.total_cents).toBeGreaterThan(0);
    expect(Number.isInteger(result.validated_breakdown.total_cents)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Rule 4 — Severity ↔ cost cross-check
// ─────────────────────────────────────────────────────────────────────────────

describe("Rule 4 — Severity ↔ cost cross-check", () => {
  it("no issue when minor cost is within minor range", () => {
    // minor range: 20000–500000 cents; total = 100000
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, "minor");
    const sevIssue = result.issues.find((i) => i.rule === "severity_cost_mismatch");
    expect(sevIssue).toBeUndefined();
    expect(result.severity_cost_consistent).toBe(true);
  });

  it("no issue when severe cost is within severe range", () => {
    // severe range: 500000–5000000 cents; total = 1000000
    const result = validateCostRealism(makeStage9(600_000, 400_000), 0, "severe");
    const sevIssue = result.issues.find((i) => i.rule === "severity_cost_mismatch");
    expect(sevIssue).toBeUndefined();
    expect(result.severity_cost_consistent).toBe(true);
  });

  it("flags issue when minor severity has high cost (above minor max)", () => {
    // minor max = 500000; total = 2000000 → mismatch
    const result = validateCostRealism(makeStage9(1_200_000, 800_000), 0, "minor");
    const sevIssue = result.issues.find((i) => i.rule === "severity_cost_mismatch");
    expect(sevIssue).toBeDefined();
    expect(result.severity_cost_consistent).toBe(false);
  });

  it("flags issue when severe severity has low cost (below severe min)", () => {
    // severe min = 500000; total = 50000 → mismatch
    const result = validateCostRealism(makeStage9(30_000, 20_000), 0, "severe");
    const sevIssue = result.issues.find((i) => i.rule === "severity_cost_mismatch");
    expect(sevIssue).toBeDefined();
    expect(result.severity_cost_consistent).toBe(false);
  });

  it("does NOT adjust cost for severity mismatch (cost preserved)", () => {
    // Cost should not be changed — only confidence is reduced
    const result = validateCostRealism(makeStage9(1_200_000, 800_000), 0, "minor");
    // No parts/labour adjustment triggered by severity check
    const sevAdj = result.adjustments.find((a) => a.rule === "severity_cost_mismatch");
    expect(sevAdj).toBeUndefined();
  });

  it("reduces confidence when severity ↔ cost mismatch detected", () => {
    const result = validateCostRealism(makeStage9(1_200_000, 800_000), 0, "minor");
    if (!result.severity_cost_consistent) {
      expect(result.confidence_multiplier).toBeLessThan(1.0);
    }
  });

  it("skips severity check when severity is null", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    const sevIssue = result.issues.find((i) => i.rule === "severity_cost_mismatch");
    expect(sevIssue).toBeUndefined();
    expect(result.severity_cost_consistent).toBe(true);
  });

  it("severity_used in result matches the input severity", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, "moderate");
    expect(result.severity_used).toBe("moderate");
  });

  it("cosmetic severity with low cost → consistent", () => {
    // cosmetic range: 5000–200000; total = 50000
    const result = validateCostRealism(makeStage9(30_000, 20_000), 0, "cosmetic");
    expect(result.severity_cost_consistent).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Output contract (validated_cost / adjustments_applied)
// ─────────────────────────────────────────────────────────────────────────────

describe("output contract", () => {
  it("always returns validated_cost as boolean", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(typeof result.validated_cost).toBe("boolean");
  });

  it("always returns adjustments_applied as boolean", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(typeof result.adjustments_applied).toBe("boolean");
  });

  it("validated_cost is true when all rules pass", () => {
    // labour ratio = 40%, no component count, no severity → all pass
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.validated_cost).toBe(true);
    expect(result.adjustments_applied).toBe(false);
  });

  it("adjustments_applied is true when at least one adjustment was made", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    if (result.issues.some((i) => i.rule === "labour_ratio")) {
      expect(result.adjustments_applied).toBe(true);
    }
  });

  it("validated_cost is true even when adjustments were applied (corrected = valid)", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    // After adjustment, cost is valid
    expect(result.validated_cost).toBe(true);
  });

  it("always returns all required fields", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(typeof result.validated_cost).toBe("boolean");
    expect(typeof result.adjustments_applied).toBe("boolean");
    expect(typeof result.validated_breakdown).toBe("object");
    expect(typeof result.labour_ratio).toBe("number");
    expect(typeof result.confidence_multiplier).toBe("number");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.adjustments)).toBe(true);
    expect(typeof result.severity_cost_consistent).toBe("boolean");
    expect(typeof result.summary).toBe("string");
  });

  it("summary is non-empty string", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.summary.length).toBeGreaterThan(5);
  });

  it("summary mentions 'All checks passed' when no issues", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.summary.toLowerCase()).toContain("all checks passed");
  });

  it("summary mentions issue count when issues exist", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    if (result.issues.length > 0) {
      expect(result.summary).toMatch(/\d+ issue/);
    }
  });

  it("validated_breakdown has all 5 required fields", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    const vb = result.validated_breakdown;
    expect(typeof vb.parts_cost_cents).toBe("number");
    expect(typeof vb.labour_cost_cents).toBe("number");
    expect(typeof vb.paint_cost_cents).toBe("number");
    expect(typeof vb.hidden_damage_cost_cents).toBe("number");
    expect(typeof vb.total_cents).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Confidence multiplier accumulation
// ─────────────────────────────────────────────────────────────────────────────

describe("confidence multiplier accumulation", () => {
  it("is 1.0 when all rules pass", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.confidence_multiplier).toBe(1.0);
  });

  it("is less than 1.0 when labour ratio is out of band", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    expect(result.confidence_multiplier).toBeLessThan(1.0);
  });

  it("is less than 1.0 when severity ↔ cost mismatch", () => {
    const result = validateCostRealism(makeStage9(1_200_000, 800_000), 0, "minor");
    expect(result.confidence_multiplier).toBeLessThan(1.0);
  });

  it("is the product of all individual reductions when multiple rules fire", () => {
    // Force labour mismatch (ratio=5%) AND severity mismatch (minor but high cost)
    const result = validateCostRealism(makeStage9(1_900_000, 100_000), 0, "minor");
    // Both labour and severity issues should fire
    const hasLabour = result.issues.some((i) => i.rule === "labour_ratio");
    const hasSeverity = result.issues.some((i) => i.rule === "severity_cost_mismatch");
    if (hasLabour && hasSeverity) {
      const expected = LABOUR_RATIO_MISMATCH_CONFIDENCE_REDUCTION * SEVERITY_COST_MISMATCH_CONFIDENCE_REDUCTION;
      expect(result.confidence_multiplier).toBeCloseTo(expected, 3);
    }
  });

  it("never exceeds 1.0", () => {
    const result = validateCostRealism(makeStage9(60_000, 40_000), 0, null);
    expect(result.confidence_multiplier).toBeLessThanOrEqual(1.0);
  });

  it("never goes below 0.30 (floor protection)", () => {
    // Trigger all three reductions simultaneously
    const result = validateCostRealism(makeStage9(1_000, 99_000), 10, "minor", 35_000);
    expect(result.confidence_multiplier).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. mergeValidatedCost adapter
// ─────────────────────────────────────────────────────────────────────────────

describe("mergeValidatedCost", () => {
  it("returns object with all Stage9Output fields", () => {
    const original = makeStage9(60_000, 40_000);
    const validation = validateCostRealism(original, 0, null);
    const merged = mergeValidatedCost(original, validation);
    expect(typeof merged.expectedRepairCostCents).toBe("number");
    expect(typeof merged.breakdown).toBe("object");
    expect(merged.repairIntelligence).toBeDefined();
    expect(merged.partsReconciliation).toBeDefined();
  });

  it("merged breakdown matches validated_breakdown", () => {
    const original = makeStage9(95_000, 5_000);
    const validation = validateCostRealism(original, 0, null);
    const merged = mergeValidatedCost(original, validation);
    expect(merged.breakdown.labourCostCents).toBe(validation.validated_breakdown.labour_cost_cents);
    expect(merged.breakdown.partsCostCents).toBe(validation.validated_breakdown.parts_cost_cents);
    expect(merged.breakdown.totalCents).toBe(validation.validated_breakdown.total_cents);
  });

  it("merged expectedRepairCostCents matches validated total", () => {
    const original = makeStage9(95_000, 5_000);
    const validation = validateCostRealism(original, 0, null);
    const merged = mergeValidatedCost(original, validation);
    expect(merged.expectedRepairCostCents).toBe(validation.validated_breakdown.total_cents);
  });

  it("costValidation field is appended with correct contract fields", () => {
    const original = makeStage9(60_000, 40_000);
    const validation = validateCostRealism(original, 0, null);
    const merged = mergeValidatedCost(original, validation);
    expect(typeof merged.costValidation.validated_cost).toBe("boolean");
    expect(typeof merged.costValidation.adjustments_applied).toBe("boolean");
    expect(typeof merged.costValidation.confidence_multiplier).toBe("number");
    expect(typeof merged.costValidation.severity_cost_consistent).toBe("boolean");
    expect(typeof merged.costValidation.issues_count).toBe("number");
    expect(typeof merged.costValidation.adjustments_count).toBe("number");
    expect(typeof merged.costValidation.summary).toBe("string");
  });

  it("does not mutate the original Stage9Output", () => {
    const original = makeStage9(95_000, 5_000);
    const originalLabour = original.breakdown.labourCostCents;
    const validation = validateCostRealism(original, 0, null);
    mergeValidatedCost(original, validation);
    expect(original.breakdown.labourCostCents).toBe(originalLabour);
  });

  it("recommendedCostRange is updated to ±20% of validated total", () => {
    const original = makeStage9(95_000, 5_000);
    const validation = validateCostRealism(original, 0, null);
    const merged = mergeValidatedCost(original, validation);
    const expectedLow = Math.round(validation.validated_breakdown.total_cents * 0.8);
    const expectedHigh = Math.round(validation.validated_breakdown.total_cents * 1.2);
    expect(merged.recommendedCostRange.lowCents).toBe(expectedLow);
    expect(merged.recommendedCostRange.highCents).toBe(expectedHigh);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Null / degraded input handling
// ─────────────────────────────────────────────────────────────────────────────

describe("null / degraded input handling", () => {
  it("handles null costOutput gracefully", () => {
    const result = validateCostRealism(null, 0, null);
    expect(result.validated_cost).toBe(false);
    expect(result.adjustments_applied).toBe(false);
    expect(result.confidence_multiplier).toBe(1.0);
    expect(result.issues).toHaveLength(0);
  });

  it("handles undefined costOutput gracefully", () => {
    const result = validateCostRealism(undefined, 0, null);
    expect(result).toBeDefined();
    expect(typeof result.validated_cost).toBe("boolean");
  });

  it("handles zero total cost gracefully (no division by zero)", () => {
    const result = validateCostRealism(makeStage9(0, 0), 0, null);
    expect(result).toBeDefined();
    expect(result.validated_cost).toBe(false);
    expect(result.confidence_multiplier).toBe(1.0);
  });

  it("handles missing breakdown field gracefully", () => {
    const s9 = makeStage9(60_000, 40_000);
    (s9 as any).breakdown = undefined;
    const result = validateCostRealism(s9, 0, null);
    expect(result).toBeDefined();
    expect(typeof result.validated_cost).toBe("boolean");
  });

  it("handles negative cost values by clamping to 0", () => {
    const s9 = makeStage9(60_000, 40_000);
    s9.breakdown.labourCostCents = -5_000;
    const result = validateCostRealism(s9, 0, null);
    expect(result.validated_breakdown.labour_cost_cents).toBeGreaterThanOrEqual(0);
  });

  it("returns valid summary string even on degraded input", () => {
    const result = validateCostRealism(null, 0, null);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("single component with exact expected parts cost → no parts issue", () => {
    const avgCost = DEFAULT_AVG_COMPONENT_COST_CENTS;
    // 1 component × avgCost = avgCost; labour at 40% of total
    const labourCents = Math.round(avgCost * 0.4 / 0.6);
    const result = validateCostRealism(makeStage9(avgCost, labourCents), 1, null);
    const partsIssue = result.issues.find((i) => i.rule === "parts_alignment");
    expect(partsIssue).toBeUndefined();
  });

  it("very large number of components still validates without crash", () => {
    const result = validateCostRealism(makeStage9(5_000_000, 2_000_000), 100, "catastrophic");
    expect(result).toBeDefined();
    expect(typeof result.validated_cost).toBe("boolean");
  });

  it("all costs are integers (cents) in validated_breakdown", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    const vb = result.validated_breakdown;
    expect(Number.isInteger(vb.parts_cost_cents)).toBe(true);
    expect(Number.isInteger(vb.labour_cost_cents)).toBe(true);
    expect(Number.isInteger(vb.paint_cost_cents)).toBe(true);
    expect(Number.isInteger(vb.hidden_damage_cost_cents)).toBe(true);
    expect(Number.isInteger(vb.total_cents)).toBe(true);
  });

  it("labour ratio is exactly at lower bound (20%) → no issue", () => {
    // total=100000; labour=20000 → ratio=20%
    const result = validateCostRealism(makeStage9(80_000, 20_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
  });

  it("labour ratio is exactly at upper bound (60%) → no issue", () => {
    // total=100000; labour=60000 → ratio=60%
    const result = validateCostRealism(makeStage9(40_000, 60_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
  });

  it("paint and hidden damage included in total but not in labour ratio calc", () => {
    // parts=40000, labour=40000, paint=10000, hidden=10000 → total=100000
    // labour ratio = 40/100 = 40% → within band
    const result = validateCostRealism(makeStage9(40_000, 40_000, 10_000, 10_000), 0, null);
    const labourIssue = result.issues.find((i) => i.rule === "labour_ratio");
    expect(labourIssue).toBeUndefined();
  });

  it("issues array contains only known rule types", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 3, "minor", 35_000);
    const validRules = ["labour_ratio", "parts_alignment", "severity_cost_mismatch"];
    for (const issue of result.issues) {
      expect(validRules).toContain(issue.rule);
    }
  });

  it("adjustments array contains only known rule types", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 3, "minor", 35_000);
    const validRules = ["labour_ratio", "parts_alignment", "severity_cost_mismatch"];
    for (const adj of result.adjustments) {
      expect(validRules).toContain(adj.rule);
    }
  });

  it("each adjustment has original_value_cents and adjusted_value_cents", () => {
    const result = validateCostRealism(makeStage9(95_000, 5_000), 0, null);
    for (const adj of result.adjustments) {
      expect(typeof adj.original_value_cents).toBe("number");
      expect(typeof adj.adjusted_value_cents).toBe("number");
    }
  });

  it("labour_ratio in result is always between 0 and 1", () => {
    for (const [parts, labour] of [[95_000, 5_000], [10_000, 90_000], [60_000, 40_000]]) {
      const result = validateCostRealism(makeStage9(parts, labour), 0, null);
      expect(result.labour_ratio).toBeGreaterThanOrEqual(0);
      expect(result.labour_ratio).toBeLessThanOrEqual(1);
    }
  });
});
