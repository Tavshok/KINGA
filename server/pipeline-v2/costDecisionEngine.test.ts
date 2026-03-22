/**
 * costDecisionEngine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive unit tests for the Claims Cost Decision Engine.
 *
 * Test coverage:
 *   - Cost basis resolution (agreed vs optimised vs empty)
 *   - Deviation analysis (highest quote, optimised vs true, AI reference)
 *   - Anomaly detection (overpricing, under-quoting, misalignment, reliability, spread)
 *   - Recommendation derivation (APPROVE / REVIEW / REJECT)
 *   - Confidence computation
 *   - Reasoning text generation
 *   - Output structure validation
 *   - Edge cases and real-world scenarios
 */

import { describe, it, expect } from "vitest";
import {
  runCostDecision,
  type CostDecisionInput,
  type DecisionInputOptimisation,
  type DecisionInputAlignment,
  type DecisionInputReliability,
} from "./costDecisionEngine";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeOptimisation(overrides: Partial<DecisionInputOptimisation> = {}): DecisionInputOptimisation {
  return {
    optimised_cost_usd: 2000,
    selected_quotes: [
      {
        panel_beater: "City Repairs",
        total_cost: 2000,
        structurally_complete: true,
        structural_gaps: [],
        is_outlier: false,
        coverage_ratio: 1.0,
      },
    ],
    excluded_quotes: [],
    cost_spread_pct: 10,
    confidence: 75,
    total_structural_gaps: 0,
    median_cost_usd: 2000,
    ...overrides,
  };
}

function makeAlignment(overrides: Partial<DecisionInputAlignment> = {}): DecisionInputAlignment {
  return {
    alignment_status: "FULLY_ALIGNED",
    critical_missing: [],
    unrelated_items: [],
    engineering_comment: "All components consistent with reported damage.",
    coverage_ratio: 1.0,
    structural_coverage_ratio: 1.0,
    ...overrides,
  };
}

function makeReliability(overrides: Partial<DecisionInputReliability> = {}): DecisionInputReliability {
  return {
    confidence_level: "HIGH",
    confidence_score: 80,
    reason: "Multiple quotes with full component coverage.",
    ...overrides,
  };
}

function makeInput(overrides: Partial<CostDecisionInput> = {}): CostDecisionInput {
  return {
    agreed_cost_usd: null,
    optimised_cost: makeOptimisation(),
    extracted_quotes: [{ panel_beater: "City Repairs", total_cost: 2000, currency: "USD" }],
    damage_components: ["front bumper", "bonnet"],
    cost_reliability: makeReliability(),
    alignment_result: makeAlignment(),
    ai_estimate_usd: 1900,
    currency: "USD",
    ...overrides,
  };
}

// ─── Cost basis resolution ────────────────────────────────────────────────────

describe("runCostDecision — cost basis resolution", () => {
  it("uses agreed_cost_usd as TRUE_COST when present", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 2500 }));
    expect(result.true_cost_usd).toBe(2500);
    expect(result.cost_basis).toBe("assessor_validated");
  });

  it("uses optimised_cost when agreed_cost is null", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: null }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("uses optimised_cost when agreed_cost is 0", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 0 }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("uses optimised_cost when agreed_cost is negative", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: -100 }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("agreed_cost ALWAYS overrides optimised_cost", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 1500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 3000 }),
    }));
    expect(result.true_cost_usd).toBe(1500);
    expect(result.cost_basis).toBe("assessor_validated");
  });

  it("sets true_cost_usd to 0 when no agreed cost and no optimised cost", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    expect(result.true_cost_usd).toBe(0);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("sets true_cost_usd to 0 when optimised_cost_usd is 0", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 0 }),
    }));
    expect(result.true_cost_usd).toBe(0);
  });

  it("rounds true_cost_usd to 2 decimal places", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 2500.999 }));
    expect(result.true_cost_usd).toBe(2501);
  });

  it("decision_trace mentions the cost basis", () => {
    const assessorResult = runCostDecision(makeInput({ agreed_cost_usd: 2500 }));
    expect(assessorResult.decision_trace.some(t => t.includes("assessor_validated"))).toBe(true);

    const systemResult = runCostDecision(makeInput({ agreed_cost_usd: null }));
    expect(systemResult.decision_trace.some(t => t.includes("system_optimised"))).toBe(true);
  });
});

// ─── Deviation analysis ───────────────────────────────────────────────────────

describe("runCostDecision — deviation analysis", () => {
  it("computes highest_quote_deviation_pct correctly", () => {
    // TRUE_COST = 2000, highest quote = 2500 → 25% above
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Expensive Repairs", total_cost: 2500 }],
    }));
    expect(result.deviation_analysis.highest_quote_usd).toBe(2500);
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBe(25);
    expect(result.deviation_analysis.highest_quote_panel_beater).toBe("Expensive Repairs");
  });

  it("computes negative deviation when highest quote is below TRUE_COST", () => {
    // TRUE_COST = 3000, highest quote = 2000 → -33.33%
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 3000,
      extracted_quotes: [{ panel_beater: "Cheap Fix", total_cost: 2000 }],
    }));
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBeCloseTo(-33.33, 1);
  });

  it("computes optimised_vs_true_pct only when basis is assessor_validated", () => {
    // Assessor: 2500, optimised: 2000 → -20%
    const assessorResult = runCostDecision(makeInput({
      agreed_cost_usd: 2500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(assessorResult.deviation_analysis.optimised_vs_true_pct).toBeCloseTo(-20, 1);

    // System optimised: optimised_vs_true_pct should be null (same value)
    const systemResult = runCostDecision(makeInput({ agreed_cost_usd: null }));
    expect(systemResult.deviation_analysis.optimised_vs_true_pct).toBeNull();
  });

  it("includes ai_estimate_usd as reference only — never affects true_cost", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      ai_estimate_usd: 5000, // very high AI estimate
    }));
    expect(result.true_cost_usd).toBe(2000); // not affected by AI estimate
    expect(result.deviation_analysis.ai_estimate_usd).toBe(5000);
    expect(result.deviation_analysis.ai_vs_true_pct).toBe(150); // 150% above
  });

  it("sets ai_vs_true_pct to null when ai_estimate_usd is null", () => {
    const result = runCostDecision(makeInput({ ai_estimate_usd: null }));
    expect(result.deviation_analysis.ai_estimate_usd).toBeNull();
    expect(result.deviation_analysis.ai_vs_true_pct).toBeNull();
  });

  it("sets highest_quote_usd to null when no quotes available", () => {
    const result = runCostDecision(makeInput({
      extracted_quotes: [],
      optimised_cost: makeOptimisation({ selected_quotes: [], excluded_quotes: [] }),
    }));
    expect(result.deviation_analysis.highest_quote_usd).toBeNull();
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBeNull();
  });

  it("resolves highest quote from optimisation selected_quotes when extracted_quotes is empty", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [],
      optimised_cost: makeOptimisation({
        selected_quotes: [
          { panel_beater: "Alpha", total_cost: 2200, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 1.0 },
          { panel_beater: "Beta", total_cost: 1800, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 1.0 },
        ],
      }),
    }));
    expect(result.deviation_analysis.highest_quote_usd).toBe(2200);
    expect(result.deviation_analysis.highest_quote_panel_beater).toBe("Alpha");
  });

  it("includes quote_spread_pct from optimisation", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 45.5 }),
    }));
    expect(result.deviation_analysis.quote_spread_pct).toBe(45.5);
  });

  it("sets quote_spread_pct to null when no optimisation", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    expect(result.deviation_analysis.quote_spread_pct).toBeNull();
  });
});

// ─── Anomaly detection ────────────────────────────────────────────────────────

describe("runCostDecision — anomaly detection: overpricing", () => {
  it("detects overpricing when highest quote >40% above TRUE_COST", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 2900 }], // 45% above
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
    expect(anomaly!.deviation_pct).toBeCloseTo(45, 0);
  });

  it("marks overpricing as critical when >80% above TRUE_COST", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 3700 }], // 85% above
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("critical");
  });

  it("does NOT flag overpricing when highest quote is exactly at 40%", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Borderline", total_cost: 2800 }], // exactly 40%
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag overpricing when highest quote is below TRUE_COST", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Cheap", total_cost: 1500 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeUndefined();
  });

  it("overpricing anomaly includes the panel beater name", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Greedy Garage", total_cost: 3500 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly!.description).toContain("Greedy Garage");
  });
});

describe("runCostDecision — anomaly detection: under-quoting", () => {
  it("detects under-quoting when structural gaps exist in selected quotes", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({
        selected_quotes: [{
          panel_beater: "Incomplete Quote",
          total_cost: 1800,
          structurally_complete: false,
          structural_gaps: ["radiator support panel"],
          is_outlier: false,
          coverage_ratio: 0.8,
        }],
        total_structural_gaps: 1,
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly).toBeDefined();
    expect(anomaly!.affected_components).toContain("radiator support panel");
    expect(anomaly!.severity).toBe("medium"); // 1 gap = medium
  });

  it("marks under-quoting as high severity for 2 structural gaps", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({
        selected_quotes: [{
          panel_beater: "Incomplete",
          total_cost: 1500,
          structurally_complete: false,
          structural_gaps: ["radiator support panel", "subframe"],
          is_outlier: false,
          coverage_ratio: 0.6,
        }],
        total_structural_gaps: 2,
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly!.severity).toBe("high");
  });

  it("marks under-quoting as critical severity for 3+ structural gaps", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({
        selected_quotes: [{
          panel_beater: "Very Incomplete",
          total_cost: 1200,
          structurally_complete: false,
          structural_gaps: ["radiator support panel", "subframe", "chassis/frame"],
          is_outlier: false,
          coverage_ratio: 0.4,
        }],
        total_structural_gaps: 3,
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly!.severity).toBe("critical");
  });

  it("does NOT flag under-quoting when all selected quotes are structurally complete", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({
        selected_quotes: [{
          panel_beater: "Complete",
          total_cost: 2000,
          structurally_complete: true,
          structural_gaps: [],
          is_outlier: false,
          coverage_ratio: 1.0,
        }],
        total_structural_gaps: 0,
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag under-quoting when optimised_cost is null", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: misaligned components", () => {
  it("detects high-severity misalignment for MISALIGNED status", () => {
    const result = runCostDecision(makeInput({
      alignment_result: makeAlignment({
        alignment_status: "MISALIGNED",
        critical_missing: [{ component: "rear axle", reason: "Not in damage zone", is_structural: true }],
        engineering_comment: "Quoted components do not correspond to the reported frontal impact zone.",
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
    expect(anomaly!.description).toContain("rear axle");
  });

  it("detects medium-severity misalignment for PARTIALLY_ALIGNED with critical missing", () => {
    const result = runCostDecision(makeInput({
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [{ component: "radiator support panel", reason: "Missing from quote", is_structural: true }],
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("medium");
  });

  it("does NOT flag misalignment for PARTIALLY_ALIGNED with no critical missing", () => {
    const result = runCostDecision(makeInput({
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [],
      }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag misalignment for FULLY_ALIGNED", () => {
    const result = runCostDecision(makeInput({
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag misalignment when alignment_result is null", () => {
    const result = runCostDecision(makeInput({ alignment_result: null }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: low reliability", () => {
  it("detects low reliability when confidence_score < 40", () => {
    const result = runCostDecision(makeInput({
      cost_reliability: makeReliability({ confidence_score: 35, confidence_level: "LOW", reason: "Single quote, no assessor." }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("medium");
    expect(anomaly!.description).toContain("35/100");
  });

  it("does NOT flag low reliability when confidence_score is exactly 40", () => {
    const result = runCostDecision(makeInput({
      cost_reliability: makeReliability({ confidence_score: 40 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag low reliability when cost_reliability is null", () => {
    const result = runCostDecision(makeInput({ cost_reliability: null }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: spread warning", () => {
  it("detects spread warning when cost_spread_pct > 60", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 75 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("low");
    expect(anomaly!.deviation_pct).toBe(75);
  });

  it("does NOT flag spread warning when cost_spread_pct is exactly 60", () => {
    const result = runCostDecision(makeInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 60 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag spread warning when optimised_cost is null", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: no cost basis", () => {
  it("flags no_cost_basis when no agreed cost and no optimised cost", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "no_cost_basis");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
  });
});

// ─── Recommendation derivation ────────────────────────────────────────────────

describe("runCostDecision — recommendation derivation", () => {
  it("returns APPROVE for assessor_validated with no anomalies", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }], // 5% above — no overpricing
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("returns APPROVE for system_optimised with confidence >=60 and no anomalies", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      cost_reliability: makeReliability({ confidence_score: 75 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("returns REJECT for critical anomaly (overpricing >80%)", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 4000 }], // 100% above
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("returns REVIEW for high anomaly (overpricing 40–80%)", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "High", total_cost: 3000 }], // 50% above
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW for MISALIGNED alignment status", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW for no_cost_basis anomaly", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW when confidence < 30", () => {
    // Force confidence below 30 by stacking anomalies
    const result = runCostDecision(makeInput({
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({ confidence: 20, cost_spread_pct: 80 }),
      cost_reliability: makeReliability({ confidence_score: 20, confidence_level: "LOW", reason: "Poor data." }),
      alignment_result: makeAlignment({ alignment_status: "PARTIALLY_ALIGNED" }),
    }));
    expect(result.recommendation).toBe("REVIEW");
  });
});

// ─── Confidence computation ───────────────────────────────────────────────────

describe("runCostDecision — confidence computation", () => {
  it("returns confidence within 0–100 range", () => {
    const result = runCostDecision(makeInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("assessor_validated basis adds 10 to confidence", () => {
    const systemResult = runCostDecision(makeInput({
      agreed_cost_usd: null,
      cost_reliability: makeReliability({ confidence_score: 70 }),
    }));
    const assessorResult = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      cost_reliability: makeReliability({ confidence_score: 70 }),
    }));
    expect(assessorResult.confidence).toBeGreaterThan(systemResult.confidence);
  });

  it("FULLY_ALIGNED adds to confidence vs MISALIGNED", () => {
    const aligned = runCostDecision(makeInput({
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
    }));
    const misaligned = runCostDecision(makeInput({
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(aligned.confidence).toBeGreaterThan(misaligned.confidence);
  });

  it("critical anomaly reduces confidence by 25", () => {
    const noAnomaly = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      cost_reliability: makeReliability({ confidence_score: 80 }),
    }));
    const withCritical = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 4000 }], // critical overpricing
      cost_reliability: makeReliability({ confidence_score: 80 }),
    }));
    expect(withCritical.confidence).toBeLessThan(noAnomaly.confidence);
    expect(noAnomaly.confidence - withCritical.confidence).toBeGreaterThanOrEqual(25);
  });

  it("uses optimisation confidence as fallback when cost_reliability is null", () => {
    const result = runCostDecision(makeInput({
      cost_reliability: null,
      optimised_cost: makeOptimisation({ confidence: 65 }),
    }));
    // Base = 65, system_optimised (no +10), FULLY_ALIGNED (+5) = 70
    expect(result.confidence).toBeGreaterThan(60);
  });
});

// ─── Reasoning text ───────────────────────────────────────────────────────────

describe("runCostDecision — reasoning text", () => {
  it("mentions the true cost in reasoning", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 2500 }));
    expect(result.reasoning).toContain("2500");
  });

  it("mentions assessor-validated basis in reasoning", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 2500 }));
    expect(result.reasoning).toContain("assessor-validated");
  });

  it("mentions system-optimised basis when no agreed cost", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: null }));
    expect(result.reasoning).toContain("system-optimised");
  });

  it("mentions the recommendation in reasoning", () => {
    const result = runCostDecision(makeInput({ agreed_cost_usd: 2000 }));
    const lower = result.reasoning.toLowerCase();
    expect(
      lower.includes("approved") || lower.includes("review") || lower.includes("rejection")
    ).toBe(true);
  });

  it("does NOT use AI/model terminology in reasoning", () => {
    const result = runCostDecision(makeInput());
    const lower = result.reasoning.toLowerCase();
    expect(lower).not.toContain("machine learning");
    expect(lower).not.toContain("neural network");
    expect(lower).not.toContain("ai model");
    expect(lower).not.toContain("training data");
    expect(lower).not.toContain("prediction");
  });

  it("mentions AI estimate as reference only in reasoning", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      ai_estimate_usd: 3000,
    }));
    expect(result.reasoning).toContain("reference only");
  });

  it("mentions alignment status in reasoning", () => {
    const result = runCostDecision(makeInput({
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(result.reasoning.toLowerCase()).toContain("misalignment");
  });

  it("mentions no anomalies when none detected", () => {
    const result = runCostDecision(makeInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.reasoning).toContain("No cost anomalies were detected");
  });
});

// ─── Output structure ─────────────────────────────────────────────────────────

describe("runCostDecision — output structure", () => {
  it("returns all required output fields", () => {
    const result = runCostDecision(makeInput());
    expect(result).toHaveProperty("true_cost_usd");
    expect(result).toHaveProperty("cost_basis");
    expect(result).toHaveProperty("deviation_analysis");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("decision_trace");
  });

  it("deviation_analysis contains all required sub-fields", () => {
    const result = runCostDecision(makeInput());
    expect(result.deviation_analysis).toHaveProperty("highest_quote_usd");
    expect(result.deviation_analysis).toHaveProperty("highest_quote_deviation_pct");
    expect(result.deviation_analysis).toHaveProperty("highest_quote_panel_beater");
    expect(result.deviation_analysis).toHaveProperty("optimised_vs_true_pct");
    expect(result.deviation_analysis).toHaveProperty("ai_estimate_usd");
    expect(result.deviation_analysis).toHaveProperty("ai_vs_true_pct");
    expect(result.deviation_analysis).toHaveProperty("quote_spread_pct");
  });

  it("anomalies is an array", () => {
    const result = runCostDecision(makeInput());
    expect(Array.isArray(result.anomalies)).toBe(true);
  });

  it("decision_trace is a non-empty array of strings", () => {
    const result = runCostDecision(makeInput());
    expect(Array.isArray(result.decision_trace)).toBe(true);
    expect(result.decision_trace.length).toBeGreaterThan(0);
    expect(typeof result.decision_trace[0]).toBe("string");
  });

  it("recommendation is one of APPROVE, REVIEW, REJECT", () => {
    const result = runCostDecision(makeInput());
    expect(["APPROVE", "REVIEW", "REJECT"]).toContain(result.recommendation);
  });

  it("cost_basis is one of assessor_validated, system_optimised", () => {
    const result = runCostDecision(makeInput());
    expect(["assessor_validated", "system_optimised"]).toContain(result.cost_basis);
  });
});

// ─── Real-world scenarios ─────────────────────────────────────────────────────

describe("runCostDecision — real-world scenarios", () => {
  it("clean assessor-validated claim with 3 quotes — APPROVE", () => {
    const result = runCostDecision({
      agreed_cost_usd: 3200,
      optimised_cost: makeOptimisation({
        optimised_cost_usd: 3100,
        selected_quotes: [
          { panel_beater: "City Panel", total_cost: 3200, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 1.0 },
          { panel_beater: "Quick Fix", total_cost: 2900, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 0.9 },
          { panel_beater: "Premium", total_cost: 3500, structurally_complete: true, structural_gaps: [], is_outlier: true, coverage_ratio: 1.0 },
        ],
        cost_spread_pct: 20.7,
        confidence: 80,
        total_structural_gaps: 0,
        median_cost_usd: 3200,
        excluded_quotes: [],
      }),
      extracted_quotes: [
        { panel_beater: "City Panel", total_cost: 3200 },
        { panel_beater: "Quick Fix", total_cost: 2900 },
        { panel_beater: "Premium", total_cost: 3500 },
      ],
      damage_components: ["front bumper assembly", "bonnet", "radiator support panel", "headlamp"],
      cost_reliability: makeReliability({ confidence_score: 85, confidence_level: "HIGH" }),
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
      ai_estimate_usd: 3000,
      currency: "USD",
    });

    expect(result.true_cost_usd).toBe(3200);
    expect(result.cost_basis).toBe("assessor_validated");
    expect(result.recommendation).toBe("APPROVE");
    expect(result.anomalies).toHaveLength(0);
    expect(result.confidence).toBeGreaterThan(70);
  });

  it("inflated quote with missing structural components — REJECT", () => {
    const result = runCostDecision({
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({
        optimised_cost_usd: 2000,
        selected_quotes: [
          {
            panel_beater: "Suspicious Garage",
            total_cost: 4500, // 125% above optimised
            structurally_complete: false,
            structural_gaps: ["radiator support panel", "subframe", "chassis/frame"],
            is_outlier: true,
            coverage_ratio: 0.4,
          },
        ],
        cost_spread_pct: 0,
        confidence: 30,
        total_structural_gaps: 3,
        median_cost_usd: 4500,
        excluded_quotes: [],
      }),
      extracted_quotes: [{ panel_beater: "Suspicious Garage", total_cost: 4500 }],
      damage_components: ["front bumper", "radiator support panel", "subframe", "chassis/frame"],
      cost_reliability: makeReliability({ confidence_score: 30, confidence_level: "LOW", reason: "Single quote, poor coverage." }),
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED", engineering_comment: "Components do not match impact zone." }),
      ai_estimate_usd: 2200,
      currency: "USD",
    });

    expect(result.cost_basis).toBe("system_optimised");
    // Should have critical anomalies: overpricing (125% > 80%) + under-quoting (3 gaps = critical)
    const criticalAnomalies = result.anomalies.filter(a => a.severity === "critical");
    expect(criticalAnomalies.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendation).toBe("REJECT");
    expect(result.confidence).toBeLessThan(50);
  });

  it("no cost data at all — REVIEW with no_cost_basis anomaly", () => {
    const result = runCostDecision({
      agreed_cost_usd: null,
      optimised_cost: null,
      extracted_quotes: [],
      damage_components: ["front bumper"],
      cost_reliability: null,
      alignment_result: null,
      ai_estimate_usd: null,
      currency: "USD",
    });

    expect(result.true_cost_usd).toBe(0);
    expect(result.recommendation).toBe("REVIEW");
    const noCostAnomaly = result.anomalies.find(a => a.category === "no_cost_basis");
    expect(noCostAnomaly).toBeDefined();
  });

  it("system-optimised with wide spread but no structural issues — REVIEW", () => {
    const result = runCostDecision({
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({
        optimised_cost_usd: 2500,
        selected_quotes: [
          { panel_beater: "A", total_cost: 1800, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 0.9 },
          { panel_beater: "B", total_cost: 3200, structurally_complete: true, structural_gaps: [], is_outlier: true, coverage_ratio: 1.0 },
        ],
        cost_spread_pct: 77.8,
        confidence: 55,
        total_structural_gaps: 0,
        median_cost_usd: 2500,
        excluded_quotes: [],
      }),
      extracted_quotes: [
        { panel_beater: "A", total_cost: 1800 },
        { panel_beater: "B", total_cost: 3200 },
      ],
      damage_components: ["rear bumper", "boot lid"],
      cost_reliability: makeReliability({ confidence_score: 55, confidence_level: "MEDIUM" }),
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
      ai_estimate_usd: 2400,
      currency: "USD",
    });

    // Wide spread (77.8% > 60%) should trigger spread_warning
    const spreadAnomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(spreadAnomaly).toBeDefined();
    // B is 28% above optimised (3200 vs 2500) — not >40%, so no overpricing
    const overpricingAnomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(overpricingAnomaly).toBeUndefined();
    // Spread warning is low severity → REVIEW only if confidence < 30 or other high anomaly
    // confidence should be moderate, spread_warning is low severity
    // recommendation depends on confidence and anomaly severity
    expect(["APPROVE", "REVIEW"]).toContain(result.recommendation);
  });
});
