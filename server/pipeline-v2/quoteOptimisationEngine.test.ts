/**
 * quoteOptimisationEngine.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive unit tests for the Quote Optimisation Engine.
 *
 * Test coverage:
 *   - Empty input handling
 *   - Quote exclusion (no cost, zero coverage, invalid)
 *   - Outlier detection (>30% above median)
 *   - Structural gap detection and penalty
 *   - Weighted average computation
 *   - Cost spread calculation
 *   - Confidence score computation
 *   - Justification text generation
 *   - Component normalisation and synonym resolution
 *   - Edge cases (single quote, all excluded, identical costs)
 */

import { describe, it, expect } from "vitest";
import {
  optimiseRepairCost,
  type InputQuote,
  type QuoteOptimisationResult,
} from "./quoteOptimisationEngine";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeQuote(overrides: Partial<InputQuote> = {}): InputQuote {
  return {
    panel_beater: "Test Panel Beater",
    total_cost: 1000,
    currency: "USD",
    components: ["front bumper", "bonnet"],
    labour_defined: true,
    parts_defined: true,
    confidence: "high",
    ...overrides,
  };
}

// ─── Empty input ──────────────────────────────────────────────────────────────

describe("optimiseRepairCost — empty input", () => {
  it("returns zero cost and empty arrays when no quotes provided", () => {
    const result = optimiseRepairCost([], ["front bumper", "bonnet"], "sedan");
    expect(result.optimised_cost_usd).toBe(0);
    expect(result.selected_quotes).toHaveLength(0);
    expect(result.excluded_quotes).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(result.quotes_evaluated).toBe(0);
  });

  it("includes 'No quotes were provided' in justification", () => {
    const result = optimiseRepairCost([], [], "sedan");
    expect(result.justification).toContain("No quotes were provided");
  });
});

// ─── Quote exclusion ──────────────────────────────────────────────────────────

describe("optimiseRepairCost — quote exclusion", () => {
  it("excludes quotes with null total_cost", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: null })],
      ["front bumper"],
      "sedan"
    );
    expect(result.selected_quotes).toHaveLength(0);
    expect(result.excluded_quotes).toHaveLength(1);
    expect(result.excluded_quotes[0].exclusion_category).toBe("no_cost");
  });

  it("excludes quotes with zero total_cost", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: 0 })],
      ["front bumper"],
      "sedan"
    );
    expect(result.excluded_quotes[0].exclusion_category).toBe("no_cost");
  });

  it("excludes quotes with negative total_cost", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: -500 })],
      ["front bumper"],
      "sedan"
    );
    expect(result.excluded_quotes[0].exclusion_category).toBe("no_cost");
  });

  it("excludes quotes with zero component coverage when damage components are provided", () => {
    const result = optimiseRepairCost(
      [makeQuote({ components: ["exhaust pipe", "muffler"], total_cost: 800 })],
      ["front bumper", "bonnet", "headlamp"],
      "sedan"
    );
    expect(result.excluded_quotes).toHaveLength(1);
    expect(result.excluded_quotes[0].exclusion_category).toBe("zero_coverage");
  });

  it("does NOT exclude a quote with zero coverage when damage_components is empty", () => {
    const result = optimiseRepairCost(
      [makeQuote({ components: ["exhaust pipe"], total_cost: 800 })],
      [], // no damage components specified
      "sedan"
    );
    expect(result.selected_quotes).toHaveLength(1);
    expect(result.excluded_quotes).toHaveLength(0);
  });

  it("returns manual assessment message when all quotes are excluded", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: null }), makeQuote({ total_cost: null })],
      ["front bumper"],
      "sedan"
    );
    expect(result.justification).toContain("manual cost assessment is required");
    expect(result.optimised_cost_usd).toBe(0);
  });
});

// ─── Outlier detection ────────────────────────────────────────────────────────

describe("optimiseRepairCost — outlier detection", () => {
  it("flags quotes >30% above median as outliers", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper", "bonnet"] }),
      makeQuote({ panel_beater: "B", total_cost: 1050, components: ["front bumper", "bonnet"] }),
      makeQuote({ panel_beater: "C", total_cost: 1400, components: ["front bumper", "bonnet"] }), // 33% above median
    ];
    const result = optimiseRepairCost(quotes, ["front bumper", "bonnet"], "sedan");
    const outlier = result.selected_quotes.find(q => q.panel_beater === "C");
    expect(outlier).toBeDefined();
    expect(outlier!.is_outlier).toBe(true);
    expect(outlier!.outlier_reason).toContain("above median");
  });

  it("does NOT flag quotes exactly at the 30% threshold", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "C", total_cost: 1300, components: ["front bumper"] }), // exactly 30%
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const borderline = result.selected_quotes.find(q => q.panel_beater === "C");
    expect(borderline!.is_outlier).toBe(false);
  });

  it("outlier quotes are retained in selected_quotes at half weight", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "C", total_cost: 1500, components: ["front bumper"] }), // outlier
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const outlier = result.selected_quotes.find(q => q.panel_beater === "C");
    const nonOutlier = result.selected_quotes.find(q => q.panel_beater === "A");
    expect(outlier).toBeDefined();
    expect(nonOutlier).toBeDefined();
    // Outlier weight should be half of non-outlier weight (same coverage and confidence)
    expect(outlier!.weight).toBeLessThan(nonOutlier!.weight);
    expect(Math.abs(outlier!.weight - nonOutlier!.weight / 2)).toBeLessThan(0.01);
  });

  it("outlier justification mentions the 30% threshold", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "C", total_cost: 1500, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.justification).toContain("30%");
  });
});

// ─── Structural gap detection ─────────────────────────────────────────────────

describe("optimiseRepairCost — structural gap detection", () => {
  it("detects missing radiator support panel as a structural gap", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper", "bonnet"],
        total_cost: 1200,
      }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "bonnet", "radiator support panel"],
      "sedan"
    );
    const selected = result.selected_quotes[0];
    expect(selected.structural_gaps).toContain("radiator support panel");
    expect(selected.structurally_complete).toBe(false);
  });

  it("detects missing chassis/frame as a structural gap", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["rear bumper"], total_cost: 2000 }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["rear bumper", "chassis/frame"],
      "pickup"
    );
    const selected = result.selected_quotes[0];
    expect(selected.structural_gaps).toContain("chassis/frame");
  });

  it("applies structural penalty to quotes with 1 structural gap (0.20)", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper", "bonnet"],
        total_cost: 1200,
        confidence: "high",
      }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "bonnet", "radiator support panel"],
      "sedan"
    );
    const selected = result.selected_quotes[0];
    // coverage = 2/3 ≈ 0.667, confidence = 1.0, penalty = 0.20
    // weight = 0.667 * 1.0 * (1 - 0.20) = 0.667 * 0.80 ≈ 0.533
    expect(selected.structural_penalty).toBe(0.20);
    expect(selected.weight).toBeCloseTo(0.533, 2);
  });

  it("applies structural penalty of 0.40 for 2 structural gaps", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper"],
        total_cost: 1200,
        confidence: "high",
      }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "radiator support panel", "subframe"],
      "sedan"
    );
    const selected = result.selected_quotes[0];
    expect(selected.structural_penalty).toBe(0.40);
  });

  it("applies structural penalty of 0.60 for 3+ structural gaps", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper"],
        total_cost: 1200,
        confidence: "high",
      }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "radiator support panel", "subframe", "chassis/frame"],
      "sedan"
    );
    const selected = result.selected_quotes[0];
    expect(selected.structural_penalty).toBe(0.60);
  });

  it("marks quote as structurally complete when all structural components are covered", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper", "radiator support panel"],
        total_cost: 1500,
      }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "radiator support panel"],
      "sedan"
    );
    expect(result.selected_quotes[0].structurally_complete).toBe(true);
    expect(result.selected_quotes[0].structural_gaps).toHaveLength(0);
  });

  it("counts total structural gaps across all selected quotes", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", components: ["front bumper"], total_cost: 1000 }),
      makeQuote({ panel_beater: "B", components: ["front bumper", "radiator support panel"], total_cost: 1200 }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "radiator support panel"],
      "sedan"
    );
    // Quote A: missing radiator support panel (1 gap)
    // Quote B: no gaps
    expect(result.total_structural_gaps).toBe(1);
  });
});

// ─── Weighted average computation ─────────────────────────────────────────────

describe("optimiseRepairCost — weighted average", () => {
  it("computes weighted average correctly for two equal-weight quotes", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"], confidence: "high" }),
      makeQuote({ panel_beater: "B", total_cost: 2000, components: ["front bumper"], confidence: "high" }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    // Median of [1000, 2000] = 1500
    // Quote B (2000) is 33.3% above median → flagged as outlier → weight halved
    // weight_A = 1.0 (coverage=1.0, conf=1.0, no penalty)
    // weight_B = 0.5 (same but outlier halved)
    // Weighted avg = (1000*1.0 + 2000*0.5) / (1.0 + 0.5) = 2000/1.5 ≈ 1333.33
    expect(result.optimised_cost_usd).toBeCloseTo(1333.33, 0);
    // Quote B should be flagged as outlier
    const quoteB = result.selected_quotes.find(q => q.panel_beater === "B");
    expect(quoteB!.is_outlier).toBe(true);
  });

  it("gives higher weight to high-confidence quotes over low-confidence quotes", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"], confidence: "high" }),
      makeQuote({ panel_beater: "B", total_cost: 2000, components: ["front bumper"], confidence: "low" }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    // Median of [1000, 2000] = 1500; Quote B is 33.3% above median → outlier → weight halved
    // weight_A = coverage(1.0) * conf(1.0) = 1.0
    // weight_B = coverage(1.0) * conf(0.4) * outlier(0.5) = 0.2
    // Weighted avg = (1000*1.0 + 2000*0.2) / (1.0 + 0.2) = 1400/1.2 ≈ 1166.67
    expect(result.optimised_cost_usd).toBeCloseTo(1166.67, 0);
    // The optimised cost should be closer to the high-confidence quote (1000)
    expect(result.optimised_cost_usd).toBeLessThan(1500);
  });

  it("gives higher weight to quotes with better component coverage", () => {
    const quotes: InputQuote[] = [
      // Full coverage: 3/3 components
      makeQuote({ panel_beater: "A", total_cost: 1500, components: ["front bumper", "bonnet", "headlamp"], confidence: "high" }),
      // Partial coverage: 1/3 components
      makeQuote({ panel_beater: "B", total_cost: 800, components: ["front bumper"], confidence: "high" }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "bonnet", "headlamp"],
      "sedan"
    );
    // Quote A: coverage=1.0, weight=1.0
    // Quote B: coverage=0.333, weight=0.333
    // Weighted avg = (1500*1.0 + 800*0.333) / (1.0 + 0.333) = (1500 + 266.4) / 1.333 ≈ 1325
    expect(result.optimised_cost_usd).toBeGreaterThan(1200);
    expect(result.optimised_cost_usd).toBeLessThan(1500);
  });

  it("falls back to simple average when all weights are zero", () => {
    // When damage_components is empty, coverage = 1.0 for all quotes
    // Both quotes have low confidence (0.4) and same coverage
    // Median of [1000, 2000] = 1500; Quote B (2000) is 33.3% above → outlier → weight halved
    // weight_A = 1.0 * 0.4 = 0.4
    // weight_B = 1.0 * 0.4 * 0.5 = 0.2 (outlier)
    // Weighted avg = (1000*0.4 + 2000*0.2) / (0.4 + 0.2) = 800/0.6 ≈ 1333.33
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: [], confidence: "low" }),
      makeQuote({ panel_beater: "B", total_cost: 2000, components: [], confidence: "low" }),
    ];
    const result = optimiseRepairCost(quotes, [], "sedan");
    expect(result.optimised_cost_usd).toBeCloseTo(1333.33, 0);
  });

  it("returns the single valid quote cost when only one quote is valid", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1234.56, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: null }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.optimised_cost_usd).toBe(1234.56);
  });
});

// ─── Cost spread ──────────────────────────────────────────────────────────────

describe("optimiseRepairCost — cost spread", () => {
  it("computes cost spread as (max - min) / min * 100", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1500, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    // spread = (1500 - 1000) / 1000 * 100 = 50%
    expect(result.cost_spread_pct).toBe(50);
  });

  it("returns 0 spread when only one valid quote", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: 1000 })],
      ["front bumper"],
      "sedan"
    );
    expect(result.cost_spread_pct).toBe(0);
  });

  it("returns 0 spread when all quotes have identical costs", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1000, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.cost_spread_pct).toBe(0);
  });
});

// ─── Confidence score ─────────────────────────────────────────────────────────

describe("optimiseRepairCost — confidence score", () => {
  it("returns 0 confidence when no quotes are selected", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: null })],
      ["front bumper"],
      "sedan"
    );
    expect(result.confidence).toBe(0);
  });

  it("returns higher confidence for 3+ quotes than 1 quote", () => {
    const singleQuote = optimiseRepairCost(
      [makeQuote({ total_cost: 1000, components: ["front bumper"] })],
      ["front bumper"],
      "sedan"
    );
    const threeQuotes = optimiseRepairCost(
      [
        makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
        makeQuote({ panel_beater: "B", total_cost: 1050, components: ["front bumper"] }),
        makeQuote({ panel_beater: "C", total_cost: 980, components: ["front bumper"] }),
      ],
      ["front bumper"],
      "sedan"
    );
    expect(threeQuotes.confidence).toBeGreaterThan(singleQuote.confidence);
  });

  it("penalises confidence for high cost spread (>60%)", () => {
    const lowSpread = optimiseRepairCost(
      [
        makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
        makeQuote({ panel_beater: "B", total_cost: 1050, components: ["front bumper"] }),
      ],
      ["front bumper"],
      "sedan"
    );
    const highSpread = optimiseRepairCost(
      [
        makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
        makeQuote({ panel_beater: "B", total_cost: 1700, components: ["front bumper"] }),
      ],
      ["front bumper"],
      "sedan"
    );
    expect(highSpread.confidence).toBeLessThan(lowSpread.confidence);
  });

  it("confidence is within 0–100 range", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: 1000, components: ["front bumper"] })],
      ["front bumper"],
      "sedan"
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ─── Component normalisation ──────────────────────────────────────────────────

describe("optimiseRepairCost — component normalisation and synonym resolution", () => {
  it("matches 'bonnet' in damage list to 'hood' in quote", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["hood", "front bumper"], total_cost: 1000 }),
    ];
    const result = optimiseRepairCost(quotes, ["bonnet", "front bumper"], "sedan");
    expect(result.selected_quotes[0].coverage_ratio).toBe(1.0);
  });

  it("matches 'radiator support' in quote to 'radiator support panel' in damage", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["radiator support", "front bumper"], total_cost: 1500 }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["radiator support panel", "front bumper"],
      "sedan"
    );
    expect(result.selected_quotes[0].structural_gaps).toHaveLength(0);
    expect(result.selected_quotes[0].structurally_complete).toBe(true);
  });

  it("matches 'f/bar' in quote to 'front bumper assembly' in damage", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["f/bar"], total_cost: 900 }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper assembly"], "sedan");
    expect(result.selected_quotes[0].coverage_ratio).toBe(1.0);
  });

  it("matches 'windscreen' to 'windshield/windscreen'", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["windscreen"], total_cost: 800 }),
    ];
    const result = optimiseRepairCost(quotes, ["windshield/windscreen"], "sedan");
    expect(result.selected_quotes[0].coverage_ratio).toBe(1.0);
  });

  it("identifies extra components not in damage list", () => {
    const quotes: InputQuote[] = [
      makeQuote({
        components: ["front bumper", "exhaust system", "muffler"],
        total_cost: 1200,
      }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const selected = result.selected_quotes[0];
    expect(selected.extra_components.length).toBeGreaterThan(0);
    expect(selected.extra_components.some(c => c.includes("exhaust") || c.includes("muffler"))).toBe(true);
  });
});

// ─── Justification text ───────────────────────────────────────────────────────

describe("optimiseRepairCost — justification text", () => {
  it("mentions the vehicle type in justification", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: 1000, components: ["front bumper"] })],
      ["front bumper"],
      "pickup truck"
    );
    expect(result.justification).toContain("pickup truck");
  });

  it("mentions excluded quotes in justification", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "Good Repairs", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "Missing Cost", total_cost: null }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.justification).toContain("Missing Cost");
  });

  it("mentions structural components in justification when present", () => {
    const quotes: InputQuote[] = [
      makeQuote({ components: ["front bumper", "radiator support panel"], total_cost: 1500 }),
    ];
    const result = optimiseRepairCost(
      quotes,
      ["front bumper", "radiator support panel"],
      "sedan"
    );
    expect(result.justification).toContain("radiator support panel");
  });

  it("mentions weighted average in justification for multiple quotes", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1100, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.justification).toContain("weighted average");
  });

  it("mentions cost spread warning when spread exceeds 40%", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1500, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    // spread = 50% > 40% → should mention adjuster review
    expect(result.justification).toContain("adjuster review");
  });

  it("does not use AI/model terminology in justification", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const lower = result.justification.toLowerCase();
    expect(lower).not.toContain("machine learning");
    expect(lower).not.toContain("neural network");
    expect(lower).not.toContain("ai model");
    expect(lower).not.toContain("training data");
    expect(lower).not.toContain("prediction");
  });
});

// ─── Output structure ─────────────────────────────────────────────────────────

describe("optimiseRepairCost — output structure", () => {
  it("returns all required output fields", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: 1000, components: ["front bumper"] })],
      ["front bumper"],
      "sedan"
    );
    expect(result).toHaveProperty("optimised_cost_usd");
    expect(result).toHaveProperty("selected_quotes");
    expect(result).toHaveProperty("excluded_quotes");
    expect(result).toHaveProperty("cost_spread_pct");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("justification");
    expect(result).toHaveProperty("median_cost_usd");
    expect(result).toHaveProperty("quotes_evaluated");
    expect(result).toHaveProperty("total_structural_gaps");
  });

  it("quotes_evaluated reflects total input count including excluded", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: null }),
      makeQuote({ panel_beater: "C", total_cost: 1100, components: ["front bumper"] }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    expect(result.quotes_evaluated).toBe(3);
    expect(result.selected_quotes).toHaveLength(2);
    expect(result.excluded_quotes).toHaveLength(1);
  });

  it("selected_quotes contain quote_index matching original array position", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: null }), // index 0 — excluded
      makeQuote({ panel_beater: "B", total_cost: 1000, components: ["front bumper"] }), // index 1
      makeQuote({ panel_beater: "C", total_cost: 1100, components: ["front bumper"] }), // index 2
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const indices = result.selected_quotes.map(q => q.quote_index);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
    expect(indices).not.toContain(0);
  });

  it("optimised_cost_usd is rounded to 2 decimal places", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"], confidence: "high" }),
      makeQuote({ panel_beater: "B", total_cost: 1100, components: ["front bumper"], confidence: "low" }),
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    const str = result.optimised_cost_usd.toString();
    const decimalPart = str.includes(".") ? str.split(".")[1] : "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });

  it("median_cost_usd is null when all quotes have no cost", () => {
    const result = optimiseRepairCost(
      [makeQuote({ total_cost: null }), makeQuote({ total_cost: null })],
      ["front bumper"],
      "sedan"
    );
    expect(result.median_cost_usd).toBeNull();
  });

  it("median_cost_usd is computed from all valid costs including excluded quotes", () => {
    const quotes: InputQuote[] = [
      makeQuote({ panel_beater: "A", total_cost: 1000, components: ["front bumper"] }),
      makeQuote({ panel_beater: "B", total_cost: 1200, components: ["front bumper"] }),
      makeQuote({ panel_beater: "C", total_cost: null }), // excluded
    ];
    const result = optimiseRepairCost(quotes, ["front bumper"], "sedan");
    // median of [1000, 1200] = 1100
    expect(result.median_cost_usd).toBe(1100);
  });
});

// ─── Real-world scenario ──────────────────────────────────────────────────────

describe("optimiseRepairCost — real-world scenario", () => {
  it("handles a typical frontal collision with 3 quotes correctly", () => {
    const damageComponents = [
      "front bumper assembly",
      "bonnet/hood",
      "radiator support panel",
      "headlamp assembly",
      "front grille",
    ];

    const quotes: InputQuote[] = [
      {
        panel_beater: "City Panel Beaters",
        total_cost: 3200,
        currency: "USD",
        components: ["front bumper", "bonnet", "radiator support", "headlamp", "grille"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
      },
      {
        panel_beater: "Quick Fix Auto",
        total_cost: 2100, // under-quotes — missing structural
        currency: "USD",
        components: ["front bumper", "bonnet", "headlamp"],
        labour_defined: false,
        parts_defined: true,
        confidence: "medium",
      },
      {
        panel_beater: "Premium Repairs",
        total_cost: 4800, // outlier — inflated
        currency: "USD",
        components: ["front bumper", "bonnet", "radiator support", "headlamp", "grille"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
      },
    ];

    const result = optimiseRepairCost(quotes, damageComponents, "sedan");

    // All 3 quotes should be selected (outlier is retained at half weight)
    expect(result.selected_quotes).toHaveLength(3);
    expect(result.excluded_quotes).toHaveLength(0);

    // Premium Repairs should be flagged as outlier
    const premiumQuote = result.selected_quotes.find(q => q.panel_beater === "Premium Repairs");
    expect(premiumQuote!.is_outlier).toBe(true);

    // Quick Fix should have structural gap (missing radiator support)
    const quickFix = result.selected_quotes.find(q => q.panel_beater === "Quick Fix Auto");
    expect(quickFix!.structurally_complete).toBe(false);
    expect(quickFix!.structural_gaps.length).toBeGreaterThan(0);

    // City Panel Beaters should be structurally complete
    const city = result.selected_quotes.find(q => q.panel_beater === "City Panel Beaters");
    expect(city!.structurally_complete).toBe(true);

    // Optimised cost should be between 2100 and 4800, weighted toward City Panel Beaters
    expect(result.optimised_cost_usd).toBeGreaterThan(2100);
    expect(result.optimised_cost_usd).toBeLessThan(4800);

    // Confidence should be reasonable (3 quotes, good coverage)
    expect(result.confidence).toBeGreaterThan(30);

    // Justification should be non-empty
    expect(result.justification.length).toBeGreaterThan(50);

    // Cost spread should be significant
    expect(result.cost_spread_pct).toBeGreaterThan(50);

    // quotes_evaluated = 3
    expect(result.quotes_evaluated).toBe(3);
  });

  it("handles a rear collision with only one valid quote", () => {
    const damageComponents = ["rear bumper assembly", "boot/trunk lid", "tail lamp assembly"];

    const quotes: InputQuote[] = [
      {
        panel_beater: "Rear Specialists",
        total_cost: 1800,
        currency: "USD",
        components: ["rear bumper", "boot lid", "tail light"],
        labour_defined: true,
        parts_defined: true,
        confidence: "high",
      },
      {
        panel_beater: "No Cost Quote",
        total_cost: null,
        currency: "USD",
        components: ["rear bumper"],
        labour_defined: false,
        parts_defined: false,
        confidence: "low",
      },
    ];

    const result = optimiseRepairCost(quotes, damageComponents, "hatchback");

    expect(result.selected_quotes).toHaveLength(1);
    expect(result.excluded_quotes).toHaveLength(1);
    expect(result.optimised_cost_usd).toBe(1800);
    expect(result.cost_spread_pct).toBe(0);
    expect(result.justification).toContain("one valid quote");
  });
});
