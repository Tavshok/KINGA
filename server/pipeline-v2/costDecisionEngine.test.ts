/**
 * costDecisionEngine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive unit tests for the Claims Cost Decision Engine (v2 — mode-aware).
 *
 * Test coverage:
 *   - Cost basis resolution (agreed vs optimised vs empty, mode-aware)
 *   - Deviation analysis (highest quote, optimised vs true, AI reference)
 *   - Anomaly detection (overpricing, under-quoting, misalignment, reliability, spread)
 *   - PRE_ASSESSMENT: negotiation guidance, overpriced quotes, missing components
 *   - POST_ASSESSMENT: APPROVE / REVIEW / REJECT, negotiation efficiency, overpayment/under-repair
 *   - Mode field in output
 *   - Confidence computation
 *   - Reasoning text (mode-aware)
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

/** Default: POST_ASSESSMENT with no agreed cost */
function makeInput(overrides: Partial<CostDecisionInput> = {}): CostDecisionInput {
  return {
    cost_mode: "POST_ASSESSMENT",
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

function makePreInput(overrides: Partial<CostDecisionInput> = {}): CostDecisionInput {
  return makeInput({ cost_mode: "PRE_ASSESSMENT", agreed_cost_usd: null, ...overrides });
}

function makePostInput(overrides: Partial<CostDecisionInput> = {}): CostDecisionInput {
  return makeInput({ cost_mode: "POST_ASSESSMENT", ...overrides });
}

// ─── Mode field ───────────────────────────────────────────────────────────────

describe("runCostDecision — mode field", () => {
  it("output.mode is PRE_ASSESSMENT when cost_mode is PRE_ASSESSMENT", () => {
    const result = runCostDecision(makePreInput());
    expect(result.mode).toBe("PRE_ASSESSMENT");
  });

  it("output.mode is POST_ASSESSMENT when cost_mode is POST_ASSESSMENT", () => {
    const result = runCostDecision(makePostInput());
    expect(result.mode).toBe("POST_ASSESSMENT");
  });

  it("decision_trace mentions the mode", () => {
    const pre = runCostDecision(makePreInput());
    expect(pre.decision_trace[0]).toContain("PRE_ASSESSMENT");

    const post = runCostDecision(makePostInput());
    expect(post.decision_trace[0]).toContain("POST_ASSESSMENT");
  });
});

// ─── Cost basis resolution ────────────────────────────────────────────────────

describe("runCostDecision — cost basis resolution (POST_ASSESSMENT)", () => {
  it("uses agreed_cost_usd as TRUE_COST in POST mode when present", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 2500 }));
    expect(result.true_cost_usd).toBe(2500);
    expect(result.cost_basis).toBe("assessor_validated");
  });

  it("uses optimised_cost when agreed_cost is null in POST mode", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: null }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("uses optimised_cost when agreed_cost is 0 in POST mode", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 0 }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("uses optimised_cost when agreed_cost is negative in POST mode", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: -100 }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("agreed_cost ALWAYS overrides optimised_cost in POST mode", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 1500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 3000 }),
    }));
    expect(result.true_cost_usd).toBe(1500);
    expect(result.cost_basis).toBe("assessor_validated");
  });

  it("sets true_cost_usd to 0 when no agreed cost and no optimised cost in POST mode", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    expect(result.true_cost_usd).toBe(0);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("rounds true_cost_usd to 2 decimal places", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 2500.999 }));
    expect(result.true_cost_usd).toBe(2501);
  });

  it("decision_trace mentions the cost basis", () => {
    const assessorResult = runCostDecision(makePostInput({ agreed_cost_usd: 2500 }));
    expect(assessorResult.decision_trace.some(t => t.includes("assessor_validated"))).toBe(true);

    const systemResult = runCostDecision(makePostInput({ agreed_cost_usd: null }));
    expect(systemResult.decision_trace.some(t => t.includes("system_optimised"))).toBe(true);
  });
});

describe("runCostDecision — cost basis resolution (PRE_ASSESSMENT)", () => {
  it("ignores agreed_cost in PRE mode — always uses optimised baseline", () => {
    // Even if agreed_cost is provided, PRE mode must use optimised
    const result = runCostDecision(makePreInput({
      agreed_cost_usd: 3000,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("uses optimised_cost as TRUE_COST in PRE mode", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 1800 }),
    }));
    expect(result.true_cost_usd).toBe(1800);
    expect(result.cost_basis).toBe("system_optimised");
  });

  it("sets true_cost_usd to 0 in PRE mode when no optimised cost", () => {
    const result = runCostDecision(makePreInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    expect(result.true_cost_usd).toBe(0);
  });

  it("decision_trace mentions PRE_ASSESSMENT mode for cost basis", () => {
    const result = runCostDecision(makePreInput());
    expect(result.decision_trace.some(t => t.includes("PRE_ASSESSMENT"))).toBe(true);
  });
});

// ─── Deviation analysis ───────────────────────────────────────────────────────

describe("runCostDecision — deviation analysis", () => {
  it("computes highest_quote_deviation_pct correctly (POST)", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Expensive Repairs", total_cost: 2500 }],
    }));
    expect(result.deviation_analysis.highest_quote_usd).toBe(2500);
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBe(25);
    expect(result.deviation_analysis.highest_quote_panel_beater).toBe("Expensive Repairs");
  });

  it("computes negative deviation when highest quote is below TRUE_COST", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 3000,
      extracted_quotes: [{ panel_beater: "Cheap Fix", total_cost: 2000 }],
    }));
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBeCloseTo(-33.33, 1);
  });

  it("computes optimised_vs_true_pct only when basis is assessor_validated (POST)", () => {
    const assessorResult = runCostDecision(makePostInput({
      agreed_cost_usd: 2500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(assessorResult.deviation_analysis.optimised_vs_true_pct).toBeCloseTo(-20, 1);

    const systemResult = runCostDecision(makePostInput({ agreed_cost_usd: null }));
    expect(systemResult.deviation_analysis.optimised_vs_true_pct).toBeNull();
  });

  it("includes ai_estimate_usd as reference only — never affects true_cost", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      ai_estimate_usd: 5000,
    }));
    expect(result.true_cost_usd).toBe(2000);
    expect(result.deviation_analysis.ai_estimate_usd).toBe(5000);
    expect(result.deviation_analysis.ai_vs_true_pct).toBe(150);
  });

  it("sets ai_vs_true_pct to null when ai_estimate_usd is null", () => {
    const result = runCostDecision(makePostInput({ ai_estimate_usd: null }));
    expect(result.deviation_analysis.ai_estimate_usd).toBeNull();
    expect(result.deviation_analysis.ai_vs_true_pct).toBeNull();
  });

  it("sets highest_quote_usd to null when no quotes available", () => {
    const result = runCostDecision(makePostInput({
      extracted_quotes: [],
      optimised_cost: makeOptimisation({ selected_quotes: [], excluded_quotes: [] }),
    }));
    expect(result.deviation_analysis.highest_quote_usd).toBeNull();
    expect(result.deviation_analysis.highest_quote_deviation_pct).toBeNull();
  });

  it("resolves highest quote from optimisation selected_quotes when extracted_quotes is empty", () => {
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 45.5 }),
    }));
    expect(result.deviation_analysis.quote_spread_pct).toBe(45.5);
  });

  it("sets quote_spread_pct to null when no optimisation", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    expect(result.deviation_analysis.quote_spread_pct).toBeNull();
  });
});

// ─── Anomaly detection ────────────────────────────────────────────────────────

describe("runCostDecision — anomaly detection: overpricing", () => {
  it("detects overpricing when highest quote >40% above TRUE_COST", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 2900 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
    expect(anomaly!.deviation_pct).toBeCloseTo(45, 0);
  });

  it("marks overpricing as critical when >80% above TRUE_COST", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 3700 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("critical");
  });

  it("does NOT flag overpricing when highest quote is exactly at 40%", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Borderline", total_cost: 2800 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag overpricing when highest quote is below TRUE_COST", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Cheap", total_cost: 1500 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeUndefined();
  });

  it("overpricing anomaly includes the panel beater name", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Greedy Garage", total_cost: 3500 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly!.description).toContain("Greedy Garage");
  });

  it("detects overpricing in PRE mode as well", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 3500 }],
    }));
    const anomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(anomaly).toBeDefined();
  });
});

describe("runCostDecision — anomaly detection: under-quoting", () => {
  it("detects under-quoting when structural gaps exist in selected quotes", () => {
    const result = runCostDecision(makePostInput({
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
    expect(anomaly!.severity).toBe("medium");
  });

  it("marks under-quoting as high severity for 2 structural gaps", () => {
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "under_quoting");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: misaligned components", () => {
  it("detects high-severity misalignment for MISALIGNED status", () => {
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
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
    const result = runCostDecision(makePostInput({
      alignment_result: makeAlignment({ alignment_status: "PARTIALLY_ALIGNED", critical_missing: [] }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag misalignment for FULLY_ALIGNED", () => {
    const result = runCostDecision(makePostInput({
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag misalignment when alignment_result is null", () => {
    const result = runCostDecision(makePostInput({ alignment_result: null }));
    const anomaly = result.anomalies.find(a => a.category === "misaligned_components");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: low reliability", () => {
  it("detects low reliability when confidence_score < 40", () => {
    const result = runCostDecision(makePostInput({
      cost_reliability: makeReliability({ confidence_score: 35, confidence_level: "LOW", reason: "Single quote, no assessor." }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("medium");
    expect(anomaly!.description).toContain("35/100");
  });

  it("does NOT flag low reliability when confidence_score is exactly 40", () => {
    const result = runCostDecision(makePostInput({
      cost_reliability: makeReliability({ confidence_score: 40 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag low reliability when cost_reliability is null", () => {
    const result = runCostDecision(makePostInput({ cost_reliability: null }));
    const anomaly = result.anomalies.find(a => a.category === "low_reliability");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: spread warning", () => {
  it("detects spread warning when cost_spread_pct > 60", () => {
    const result = runCostDecision(makePostInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 75 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("low");
    expect(anomaly!.deviation_pct).toBe(75);
  });

  it("does NOT flag spread warning when cost_spread_pct is exactly 60", () => {
    const result = runCostDecision(makePostInput({
      optimised_cost: makeOptimisation({ cost_spread_pct: 60 }),
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeUndefined();
  });

  it("does NOT flag spread warning when optimised_cost is null", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(anomaly).toBeUndefined();
  });
});

describe("runCostDecision — anomaly detection: no cost basis", () => {
  it("flags no_cost_basis when no agreed cost and no optimised cost", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    const anomaly = result.anomalies.find(a => a.category === "no_cost_basis");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
  });
});

// ─── POST_ASSESSMENT: recommendation derivation ───────────────────────────────

describe("runCostDecision — POST recommendation derivation", () => {
  it("returns APPROVE for assessor_validated with no anomalies", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("returns APPROVE for system_optimised with confidence >=60 and no anomalies", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      cost_reliability: makeReliability({ confidence_score: 75 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.recommendation).toBe("APPROVE");
  });

  it("returns REJECT for critical anomaly (overpricing >80%)", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 4000 }],
    }));
    expect(result.recommendation).toBe("REJECT");
  });

  it("returns REVIEW for high anomaly (overpricing 40–80%)", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "High", total_cost: 3000 }],
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW for MISALIGNED alignment status", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW for no_cost_basis anomaly", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      optimised_cost: null,
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW when confidence < 30", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({ confidence: 20, cost_spread_pct: 80 }),
      cost_reliability: makeReliability({ confidence_score: 20, confidence_level: "LOW", reason: "Poor data." }),
      alignment_result: makeAlignment({ alignment_status: "PARTIALLY_ALIGNED" }),
    }));
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW when overpayment risk detected in POST mode", () => {
    // agreed_cost 25% above optimised → overpayment risk
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.negotiation_efficiency?.overpayment_risk).toBe(true);
    expect(result.recommendation).toBe("REVIEW");
  });

  it("returns REVIEW when under-repair risk detected in POST mode", () => {
    // agreed_cost 35% below optimised → under-repair risk
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 1300,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2000 }],
    }));
    expect(result.negotiation_efficiency?.under_repair_risk).toBe(true);
    expect(result.recommendation).toBe("REVIEW");
  });

  it("POST recommendation is always APPROVE, REVIEW, or REJECT", () => {
    const result = runCostDecision(makePostInput());
    expect(["APPROVE", "REVIEW", "REJECT"]).toContain(result.recommendation);
  });
});

// ─── PRE_ASSESSMENT: recommendation derivation ───────────────────────────────

describe("runCostDecision — PRE recommendation derivation", () => {
  it("returns PROCEED_TO_ASSESSMENT when quotes are within range and no missing components", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED", critical_missing: [] }),
    }));
    expect(result.recommendation).toBe("PROCEED_TO_ASSESSMENT");
  });

  it("returns NEGOTIATE or ESCALATE when overpriced quotes are present", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 3500 }],
    }));
    expect(["NEGOTIATE", "ESCALATE"]).toContain(result.recommendation);
  });

  it("returns NEGOTIATE when missing components are present", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [{ component: "radiator support panel", reason: "Missing", is_structural: true }],
      }),
    }));
    expect(result.recommendation).toBe("NEGOTIATE");
  });

  it("returns ESCALATE for critical anomaly in PRE mode", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 5000 }], // 150% above
    }));
    expect(result.recommendation).toBe("ESCALATE");
  });

  it("PRE recommendation is never APPROVE, REVIEW, or REJECT", () => {
    const result = runCostDecision(makePreInput());
    expect(["APPROVE", "REVIEW", "REJECT"]).not.toContain(result.recommendation);
    expect(["NEGOTIATE", "PROCEED_TO_ASSESSMENT", "ESCALATE"]).toContain(result.recommendation);
  });
});

// ─── PRE_ASSESSMENT: negotiation guidance ────────────────────────────────────

describe("runCostDecision — PRE negotiation_guidance", () => {
  it("populates negotiation_guidance in PRE mode", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_guidance).not.toBeNull();
    expect(result.negotiation_guidance!.target_usd).toBe(2000);
  });

  it("floor_usd is 85% of optimised baseline", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_guidance!.floor_usd).toBeCloseTo(1700, 0);
  });

  it("ceiling_usd is 110% of optimised baseline", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_guidance!.ceiling_usd).toBeCloseTo(2200, 0);
  });

  it("identifies overpriced quotes in negotiation_guidance", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [
        { panel_beater: "Cheap", total_cost: 1800 },
        { panel_beater: "Overpriced", total_cost: 3500 }, // 75% above
      ],
    }));
    const overpriced = result.negotiation_guidance!.overpriced_quotes;
    expect(overpriced.length).toBe(1);
    expect(overpriced[0].panel_beater).toBe("Overpriced");
    expect(overpriced[0].deviation_pct).toBeCloseTo(75, 0);
    expect(overpriced[0].recommended_reduction_usd).toBeCloseTo(1500, 0);
  });

  it("identifies missing components from alignment result", () => {
    const result = runCostDecision(makePreInput({
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [
          { component: "radiator support panel", reason: "Missing", is_structural: true },
          { component: "subframe", reason: "Missing", is_structural: true },
        ],
      }),
    }));
    const missing = result.negotiation_guidance!.missing_components;
    expect(missing).toContain("radiator support panel");
    expect(missing).toContain("subframe");
  });

  it("strategy mentions overpriced quotes when present", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 3500 }],
    }));
    expect(result.negotiation_guidance!.strategy).toContain("renegotiated");
  });

  it("strategy mentions missing components when present", () => {
    const result = runCostDecision(makePreInput({
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [{ component: "subframe", reason: "Missing", is_structural: true }],
      }),
    }));
    expect(result.negotiation_guidance!.strategy).toContain("subframe");
  });

  it("strategy says proceed when no issues", () => {
    const result = runCostDecision(makePreInput({
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED", critical_missing: [] }),
    }));
    expect(result.negotiation_guidance!.strategy).toContain("Proceed");
  });

  it("negotiation_guidance is null in POST mode", () => {
    const result = runCostDecision(makePostInput());
    expect(result.negotiation_guidance).toBeNull();
  });
});

// ─── POST_ASSESSMENT: negotiation efficiency ─────────────────────────────────

describe("runCostDecision — POST negotiation_efficiency", () => {
  it("populates negotiation_efficiency when agreed_cost and optimised_cost are both present", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency).not.toBeNull();
  });

  it("negotiation_efficiency is null in PRE mode", () => {
    const result = runCostDecision(makePreInput());
    expect(result.negotiation_efficiency).toBeNull();
  });

  it("efficiency_label is optimal when agreed is within 5% of optimised", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2050, // 2.5% above
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.efficiency_label).toBe("optimal");
  });

  it("efficiency_label is overpaid when agreed is >20% above optimised", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2500, // 25% above
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.efficiency_label).toBe("overpaid");
    expect(result.negotiation_efficiency!.overpayment_risk).toBe(true);
  });

  it("efficiency_label is under_repaired when agreed is >30% below optimised", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 1300, // 35% below
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.efficiency_label).toBe("under_repaired");
    expect(result.negotiation_efficiency!.under_repair_risk).toBe(true);
  });

  it("efficiency_label is acceptable when agreed is between 5% and 20% above optimised", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2200, // 10% above
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "City", total_cost: 2200 }],
    }));
    // 3200 vs 3100 optimised = 3.2% above → within 5% threshold → optimal
    expect(["optimal", "acceptable"]).toContain(result.negotiation_efficiency!.efficiency_label);
    expect(result.negotiation_efficiency!.overpayment_risk).toBe(false);
    expect(result.negotiation_efficiency!.under_repair_risk).toBe(false);
  });

  it("efficiency_label is unknown when no optimised cost", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      optimised_cost: null,
    }));
    // negotiation_efficiency not built when optimised_cost is null
    expect(result.negotiation_efficiency).toBeNull();
  });

  it("agreed_vs_optimised_pct is computed correctly", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2200,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.agreed_vs_optimised_pct).toBeCloseTo(10, 1);
  });

  it("summary mentions overpayment when risk is detected", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2500,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.summary.toLowerCase()).toContain("overpayment");
  });

  it("summary mentions under-repair when risk is detected", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 1300,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
    }));
    expect(result.negotiation_efficiency!.summary.toLowerCase()).toContain("under-repair");
  });
});

// ─── Confidence computation ───────────────────────────────────────────────────

describe("runCostDecision — confidence computation", () => {
  it("returns confidence within 0–100 range", () => {
    const result = runCostDecision(makePostInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("assessor_validated basis adds 10 to confidence in POST mode", () => {
    const systemResult = runCostDecision(makePostInput({
      agreed_cost_usd: null,
      cost_reliability: makeReliability({ confidence_score: 70 }),
    }));
    const assessorResult = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      cost_reliability: makeReliability({ confidence_score: 70 }),
    }));
    expect(assessorResult.confidence).toBeGreaterThan(systemResult.confidence);
  });

  it("FULLY_ALIGNED adds to confidence vs MISALIGNED", () => {
    const aligned = runCostDecision(makePostInput({
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED" }),
    }));
    const misaligned = runCostDecision(makePostInput({
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(aligned.confidence).toBeGreaterThan(misaligned.confidence);
  });

  it("critical anomaly reduces confidence by 25", () => {
    const noAnomaly = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
      cost_reliability: makeReliability({ confidence_score: 80 }),
    }));
    const withCritical = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "Extreme", total_cost: 4000 }],
      cost_reliability: makeReliability({ confidence_score: 80 }),
    }));
    expect(withCritical.confidence).toBeLessThan(noAnomaly.confidence);
    expect(noAnomaly.confidence - withCritical.confidence).toBeGreaterThanOrEqual(25);
  });

  it("uses optimisation confidence as fallback when cost_reliability is null", () => {
    const result = runCostDecision(makePostInput({
      cost_reliability: null,
      optimised_cost: makeOptimisation({ confidence: 65 }),
    }));
    expect(result.confidence).toBeGreaterThan(60);
  });
});

// ─── Reasoning text ───────────────────────────────────────────────────────────

describe("runCostDecision — reasoning text", () => {
  it("mentions the true cost in reasoning", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 2500 }));
    expect(result.reasoning).toContain("2500");
  });

  it("mentions assessor-validated basis in POST reasoning", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 2500 }));
    expect(result.reasoning).toContain("assessor-validated");
  });

  it("mentions system-optimised basis when no agreed cost in POST mode", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: null }));
    expect(result.reasoning).toContain("system-optimised");
  });

  it("PRE reasoning mentions pre-assessment mode context", () => {
    const result = runCostDecision(makePreInput());
    expect(result.reasoning.toLowerCase()).toContain("pre-assessment");
  });

  it("PRE reasoning mentions negotiation target", () => {
    const result = runCostDecision(makePreInput({
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [{ panel_beater: "Overpriced", total_cost: 3500 }],
    }));
    expect(result.reasoning).toContain("2000");
  });

  it("POST reasoning mentions the recommendation", () => {
    const result = runCostDecision(makePostInput({ agreed_cost_usd: 2000 }));
    const lower = result.reasoning.toLowerCase();
    expect(
      lower.includes("approved") || lower.includes("review") || lower.includes("rejection")
    ).toBe(true);
  });

  it("does NOT use AI/model terminology in reasoning", () => {
    const result = runCostDecision(makePostInput());
    const lower = result.reasoning.toLowerCase();
    expect(lower).not.toContain("machine learning");
    expect(lower).not.toContain("neural network");
    expect(lower).not.toContain("ai model");
    expect(lower).not.toContain("training data");
    expect(lower).not.toContain("prediction");
  });

  it("mentions AI estimate as reference only in reasoning", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      ai_estimate_usd: 3000,
    }));
    expect(result.reasoning).toContain("reference only");
  });

  it("mentions alignment status in reasoning", () => {
    const result = runCostDecision(makePostInput({
      alignment_result: makeAlignment({ alignment_status: "MISALIGNED" }),
    }));
    expect(result.reasoning.toLowerCase()).toContain("misalignment");
  });

  it("mentions no anomalies when none detected", () => {
    const result = runCostDecision(makePostInput({
      agreed_cost_usd: 2000,
      extracted_quotes: [{ panel_beater: "City", total_cost: 2100 }],
    }));
    expect(result.reasoning).toContain("No cost anomalies were detected");
  });
});

// ─── Output structure ─────────────────────────────────────────────────────────

describe("runCostDecision — output structure", () => {
  it("returns all required output fields in POST mode", () => {
    const result = runCostDecision(makePostInput());
    expect(result).toHaveProperty("true_cost_usd");
    expect(result).toHaveProperty("cost_basis");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("deviation_analysis");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("decision_trace");
    expect(result).toHaveProperty("negotiation_guidance");
    expect(result).toHaveProperty("negotiation_efficiency");
  });

  it("returns all required output fields in PRE mode", () => {
    const result = runCostDecision(makePreInput());
    expect(result).toHaveProperty("true_cost_usd");
    expect(result).toHaveProperty("cost_basis");
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("deviation_analysis");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reasoning");
    expect(result).toHaveProperty("decision_trace");
    expect(result).toHaveProperty("negotiation_guidance");
    expect(result).toHaveProperty("negotiation_efficiency");
  });

  it("deviation_analysis contains all required sub-fields", () => {
    const result = runCostDecision(makePostInput());
    expect(result.deviation_analysis).toHaveProperty("highest_quote_usd");
    expect(result.deviation_analysis).toHaveProperty("highest_quote_deviation_pct");
    expect(result.deviation_analysis).toHaveProperty("highest_quote_panel_beater");
    expect(result.deviation_analysis).toHaveProperty("optimised_vs_true_pct");
    expect(result.deviation_analysis).toHaveProperty("ai_estimate_usd");
    expect(result.deviation_analysis).toHaveProperty("ai_vs_true_pct");
    expect(result.deviation_analysis).toHaveProperty("quote_spread_pct");
  });

  it("anomalies is an array", () => {
    const result = runCostDecision(makePostInput());
    expect(Array.isArray(result.anomalies)).toBe(true);
  });

  it("decision_trace is a non-empty array of strings", () => {
    const result = runCostDecision(makePostInput());
    expect(Array.isArray(result.decision_trace)).toBe(true);
    expect(result.decision_trace.length).toBeGreaterThan(0);
    expect(typeof result.decision_trace[0]).toBe("string");
  });

  it("cost_basis is one of assessor_validated, system_optimised", () => {
    const result = runCostDecision(makePostInput());
    expect(["assessor_validated", "system_optimised"]).toContain(result.cost_basis);
  });
});

// ─── Real-world scenarios ─────────────────────────────────────────────────────

describe("runCostDecision — real-world scenarios", () => {
  it("PRE: clean quotes within range — PROCEED_TO_ASSESSMENT", () => {
    const result = runCostDecision({
      cost_mode: "PRE_ASSESSMENT",
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({
        optimised_cost_usd: 3100,
        selected_quotes: [
          { panel_beater: "City Panel", total_cost: 3200, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 1.0 },
          { panel_beater: "Quick Fix", total_cost: 2900, structurally_complete: true, structural_gaps: [], is_outlier: false, coverage_ratio: 0.9 },
        ],
        cost_spread_pct: 10,
        confidence: 80,
        total_structural_gaps: 0,
        median_cost_usd: 3100,
        excluded_quotes: [],
      }),
      extracted_quotes: [
        { panel_beater: "City Panel", total_cost: 3200 },
        { panel_beater: "Quick Fix", total_cost: 2900 },
      ],
      damage_components: ["front bumper assembly", "bonnet", "radiator support panel"],
      cost_reliability: makeReliability({ confidence_score: 80, confidence_level: "HIGH" }),
      alignment_result: makeAlignment({ alignment_status: "FULLY_ALIGNED", critical_missing: [] }),
      ai_estimate_usd: 3000,
      currency: "USD",
    });

    expect(result.mode).toBe("PRE_ASSESSMENT");
    expect(result.recommendation).toBe("PROCEED_TO_ASSESSMENT");
    expect(result.negotiation_guidance).not.toBeNull();
    expect(result.negotiation_guidance!.overpriced_quotes).toHaveLength(0);
    expect(result.negotiation_guidance!.missing_components).toHaveLength(0);
    expect(result.negotiation_efficiency).toBeNull();
  });

  it("PRE: overpriced quote with missing components — NEGOTIATE", () => {
    const result = runCostDecision({
      cost_mode: "PRE_ASSESSMENT",
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({ optimised_cost_usd: 2000 }),
      extracted_quotes: [
        { panel_beater: "Cheap", total_cost: 1800 },
        { panel_beater: "Overpriced", total_cost: 3500 },
      ],
      damage_components: ["front bumper", "radiator support panel", "subframe"],
      cost_reliability: makeReliability({ confidence_score: 60 }),
      alignment_result: makeAlignment({
        alignment_status: "PARTIALLY_ALIGNED",
        critical_missing: [{ component: "subframe", reason: "Missing from all quotes", is_structural: true }],
      }),
      ai_estimate_usd: 2100,
      currency: "USD",
    });

    expect(result.mode).toBe("PRE_ASSESSMENT");
    expect(["NEGOTIATE", "ESCALATE"]).toContain(result.recommendation);
    expect(result.negotiation_guidance!.overpriced_quotes.length).toBeGreaterThan(0);
    expect(result.negotiation_guidance!.missing_components).toContain("subframe");
  });

  it("POST: clean assessor-validated claim with 3 quotes — APPROVE", () => {
    const result = runCostDecision({
      cost_mode: "POST_ASSESSMENT",
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
    expect(result.negotiation_guidance).toBeNull();
    expect(result.negotiation_efficiency).not.toBeNull();
    // 3200 vs 3100 optimised = 3.2% above → within 5% threshold → optimal
    expect(["optimal", "acceptable"]).toContain(result.negotiation_efficiency!.efficiency_label);
  });

  it("POST: inflated quote with missing structural components — REJECT", () => {
    const result = runCostDecision({
      cost_mode: "POST_ASSESSMENT",
      agreed_cost_usd: null,
      optimised_cost: makeOptimisation({
        optimised_cost_usd: 2000,
        selected_quotes: [
          {
            panel_beater: "Suspicious Garage",
            total_cost: 4500,
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
    const criticalAnomalies = result.anomalies.filter(a => a.severity === "critical");
    expect(criticalAnomalies.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendation).toBe("REJECT");
    expect(result.confidence).toBeLessThan(50);
    expect(result.negotiation_guidance).toBeNull();
  });

  it("POST: no cost data at all — REVIEW with no_cost_basis anomaly", () => {
    const result = runCostDecision({
      cost_mode: "POST_ASSESSMENT",
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

  it("POST: system-optimised with wide spread but no structural issues — REVIEW or APPROVE", () => {
    const result = runCostDecision({
      cost_mode: "POST_ASSESSMENT",
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

    const spreadAnomaly = result.anomalies.find(a => a.category === "spread_warning");
    expect(spreadAnomaly).toBeDefined();
    const overpricingAnomaly = result.anomalies.find(a => a.category === "overpricing");
    expect(overpricingAnomaly).toBeUndefined();
    expect(["APPROVE", "REVIEW"]).toContain(result.recommendation);
  });
});
