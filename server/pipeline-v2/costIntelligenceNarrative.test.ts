/**
 * costIntelligenceNarrative.test.ts
 */

import { describe, it, expect } from "vitest";
import { generateCostIntelligenceNarrative, type CostNarrativeInput } from "./costIntelligenceNarrative";

// ─── Isuzu D-Max AEX 6208 real-world test ────────────────────────────────────

const ISUZU_INPUT: CostNarrativeInput = {
  quotes: [
    { quote_id: "q1", panel_beater: "Avana Motors", total_cost: 4736.28 },
    { quote_id: "q2", panel_beater: "Panel Pro Harare", total_cost: 3850.00 },
    { quote_id: "q3", panel_beater: "Agreed (Native Loss Adjustors)", total_cost: 2576.00 },
  ],
  selected_quote_id: "q3",
  agreed_cost_usd: 2576.00,
  ai_estimate_usd: 3200.00,
  market_value_usd: 17000.00,
  median_cost: 3850.00,
  flags: ["photos_not_ingested"],
  alignment_status: "FULLY_ALIGNED",
  critical_missing: [],
  unrelated_items: [],
  engineering_comment: "All 12 components are consistent with a moderate chain rear-end collision.",
  coverage_ratio: 1.0,
  assessor_name: "Native Loss Adjustors",
  quote_count: 3,
};

describe("Isuzu D-Max AEX 6208 — real-world narrative", () => {
  it("should recommend APPROVE", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.recommendation).toBe("APPROVE");
  });

  it("should produce a narrative of 3–5 sentences", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    const sentences = result.narrative.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(3);
    expect(sentences.length).toBeLessThanOrEqual(5);
  });

  it("should mention the agreed cost of 2,576.00 in the narrative", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.narrative).toContain("2,576.00");
  });

  it("should mention the assessor name", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.narrative).toContain("Native Loss Adjustors");
  });

  it("should mention the quote spread", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.narrative).toContain("3 submitted quotes");
  });

  it("should mention repair-to-value ratio", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.narrative).toMatch(/15\.1%|15\.2%|repair-to-value/i);
  });

  it("should confirm FULLY_ALIGNED in the narrative", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.narrative.toLowerCase()).toContain("fully aligned");
  });

  it("should have high confidence", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.confidence).toBe("high");
  });

  it("should address photos_not_ingested flag", () => {
    const result = generateCostIntelligenceNarrative(ISUZU_INPUT);
    expect(result.flags_addressed).toContain("photos_not_ingested");
  });
});

// ─── REVIEW: misaligned quote ─────────────────────────────────────────────────

describe("REVIEW — misaligned quote", () => {
  it("should recommend REVIEW when alignment is MISALIGNED", () => {
    const input: CostNarrativeInput = {
      ...ISUZU_INPUT,
      alignment_status: "MISALIGNED",
      unrelated_items: ["engine block", "airbag"],
      flags: [],
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.recommendation).toBe("REVIEW");
    expect(result.narrative.toLowerCase()).toContain("misalignment");
  });

  it("should list unrelated items in the narrative", () => {
    const input: CostNarrativeInput = {
      ...ISUZU_INPUT,
      alignment_status: "MISALIGNED",
      unrelated_items: ["engine block"],
      flags: [],
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.narrative).toContain("engine block");
  });
});

// ─── REVIEW: partially aligned with structural gap ───────────────────────────

describe("REVIEW — partially aligned with structural gap", () => {
  it("should recommend REVIEW when structural components are missing from quote", () => {
    const input: CostNarrativeInput = {
      ...ISUZU_INPUT,
      alignment_status: "PARTIALLY_ALIGNED",
      critical_missing: ["radiator support panel"],
      flags: ["structural_gap"],
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.recommendation).toBe("REVIEW");
    expect(result.narrative).toContain("radiator support panel");
  });
});

// ─── REVIEW: repair-to-value near threshold ───────────────────────────────────

describe("REVIEW — repair-to-value near total-loss threshold", () => {
  it("should recommend REVIEW when RTV >= 70%", () => {
    const input: CostNarrativeInput = {
      ...ISUZU_INPUT,
      agreed_cost_usd: 12500.00,
      market_value_usd: 17000.00, // 73.5%
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.recommendation).toBe("REVIEW");
    expect(result.narrative.toLowerCase()).toContain("total-loss");
  });
});

// ─── Inflated quote detection ─────────────────────────────────────────────────

describe("Inflated quote detection", () => {
  it("should mention inflated quote in narrative when one quote exceeds median by 30%+", () => {
    const input: CostNarrativeInput = {
      quotes: [
        { quote_id: "q1", panel_beater: "Overpriced Motors", total_cost: 8000.00 },
        { quote_id: "q2", panel_beater: "Fair Repairs", total_cost: 3000.00 },
      ],
      selected_quote_id: "q2",
      agreed_cost_usd: 3000.00,
      ai_estimate_usd: 3200.00,
      market_value_usd: 20000.00,
      median_cost: 5500.00,
      flags: ["inflated_quote"],
      alignment_status: "FULLY_ALIGNED",
      critical_missing: [],
      unrelated_items: [],
      engineering_comment: null,
      coverage_ratio: 0.95,
      assessor_name: null,
      quote_count: 2,
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.narrative).toContain("Overpriced Motors");
    expect(result.flags_addressed).toContain("inflated_quote");
  });
});

// ─── Single quote (no spread) ─────────────────────────────────────────────────

describe("Single quote — no spread", () => {
  it("should produce a valid narrative with a single quote", () => {
    const input: CostNarrativeInput = {
      quotes: [{ quote_id: "q1", panel_beater: "Solo Repairs", total_cost: 2500.00 }],
      selected_quote_id: "q1",
      agreed_cost_usd: 2500.00,
      ai_estimate_usd: 2800.00,
      market_value_usd: 15000.00,
      median_cost: 2500.00,
      flags: [],
      alignment_status: "FULLY_ALIGNED",
      critical_missing: [],
      unrelated_items: [],
      engineering_comment: null,
      coverage_ratio: 1.0,
      assessor_name: null,
      quote_count: 1,
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.narrative.length).toBeGreaterThan(30);
    expect(result.recommendation).toBe("APPROVE");
  });
});

// ─── No data ─────────────────────────────────────────────────────────────────

describe("Edge case — no data", () => {
  it("should return fallback narrative when no quotes are provided", () => {
    const input: CostNarrativeInput = {
      quotes: [],
      selected_quote_id: "",
      agreed_cost_usd: null,
      ai_estimate_usd: null,
      market_value_usd: null,
      median_cost: null,
      flags: [],
      alignment_status: null,
      critical_missing: [],
      unrelated_items: [],
      engineering_comment: null,
      coverage_ratio: null,
      assessor_name: null,
      quote_count: 0,
    };
    const result = generateCostIntelligenceNarrative(input);
    expect(result.narrative).toContain("Insufficient data");
    expect(result.recommendation).toBe("APPROVE"); // no negative signals
  });
});
