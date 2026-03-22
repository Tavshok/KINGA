/**
 * costReliabilityScorer.test.ts
 */

import { describe, it, expect } from "vitest";
import { scoreCostReliability, type CostReliabilityInput } from "./costReliabilityScorer";

// ─── HIGH confidence cases ────────────────────────────────────────────────────

describe("HIGH confidence", () => {
  it("assessor cost + 3 quotes + FULLY_ALIGNED → HIGH", () => {
    const result = scoreCostReliability({
      number_of_quotes: 3,
      presence_of_assessor_cost: true,
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("HIGH");
    expect(result.confidence_score).toBeGreaterThanOrEqual(75);
    expect(result.reason).toContain("3 quotes");
  });

  it("assessor cost + 1 quote + FULLY_ALIGNED → HIGH", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: true,
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("HIGH");
    expect(result.confidence_score).toBeGreaterThanOrEqual(75);
  });

  it("assessor cost + 2 quotes + FULLY_ALIGNED → HIGH", () => {
    const result = scoreCostReliability({
      number_of_quotes: 2,
      presence_of_assessor_cost: true,
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("HIGH");
  });

  it("no assessor cost + 3 quotes + FULLY_ALIGNED → HIGH", () => {
    const result = scoreCostReliability({
      number_of_quotes: 3,
      presence_of_assessor_cost: false,
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("HIGH");
    expect(result.confidence_score).toBeGreaterThanOrEqual(75);
  });

  // Isuzu D-Max AEX 6208 real-world case
  it("Isuzu D-Max: assessor cost + 3 quotes + FULLY_ALIGNED + photos_not_ingested → HIGH", () => {
    const result = scoreCostReliability({
      number_of_quotes: 3,
      presence_of_assessor_cost: true,
      alignment_status: "FULLY_ALIGNED",
      flags: ["photos_not_ingested"],
    });
    expect(result.confidence_level).toBe("HIGH");
    expect(result.confidence_score).toBeGreaterThanOrEqual(75);
    expect(result.reason).toContain("Assessor-agreed cost");
  });
});

// ─── MEDIUM confidence cases ──────────────────────────────────────────────────

describe("MEDIUM confidence", () => {
  it("assessor cost + PARTIALLY_ALIGNED + structural_gap → MEDIUM", () => {
    const result = scoreCostReliability({
      number_of_quotes: 2,
      presence_of_assessor_cost: true,
      alignment_status: "PARTIALLY_ALIGNED",
      flags: ["structural_gap"],
    });
    expect(result.confidence_level).toBe("MEDIUM");
    expect(result.confidence_score).toBeGreaterThanOrEqual(45);
    expect(result.confidence_score).toBeLessThan(75);
  });

  it("single quote + FULLY_ALIGNED + no flags → MEDIUM", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: false,
      alignment_status: "FULLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("MEDIUM");
    expect(result.reason).toContain("single quote");
  });

  it("2 quotes + PARTIALLY_ALIGNED + no flags → MEDIUM", () => {
    const result = scoreCostReliability({
      number_of_quotes: 2,
      presence_of_assessor_cost: false,
      alignment_status: "PARTIALLY_ALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("MEDIUM");
  });

  it("assessor cost + null alignment + photos_not_ingested → MEDIUM", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: true,
      alignment_status: null,
      flags: ["photos_not_ingested", "description_not_mapped"],
    });
    expect(result.confidence_level).toBe("MEDIUM");
  });
});

// ─── LOW confidence cases ─────────────────────────────────────────────────────

describe("LOW confidence", () => {
  it("no quotes + no assessor + MISALIGNED → LOW", () => {
    const result = scoreCostReliability({
      number_of_quotes: 0,
      presence_of_assessor_cost: false,
      alignment_status: "MISALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("LOW");
    expect(result.confidence_score).toBeLessThan(45);
    expect(result.reason).toContain("no quote");
  });

  it("single quote + MISALIGNED → LOW", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: false,
      alignment_status: "MISALIGNED",
      flags: [],
    });
    expect(result.confidence_level).toBe("LOW");
    expect(result.reason).toContain("mechanically inconsistent");
  });

  it("single quote + structural_gap + quote_not_mapped → LOW", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: false,
      alignment_status: "PARTIALLY_ALIGNED",
      flags: ["structural_gap", "quote_not_mapped", "ocr_failure"],
    });
    expect(result.confidence_level).toBe("LOW");
  });

  it("no quotes at all → LOW", () => {
    const result = scoreCostReliability({
      number_of_quotes: 0,
      presence_of_assessor_cost: false,
      alignment_status: null,
      flags: [],
    });
    expect(result.confidence_level).toBe("LOW");
    expect(result.confidence_score).toBeLessThan(45);
  });
});

// ─── Score breakdown ──────────────────────────────────────────────────────────

describe("Score breakdown", () => {
  it("should return a complete score_breakdown object", () => {
    const result = scoreCostReliability({
      number_of_quotes: 3,
      presence_of_assessor_cost: true,
      alignment_status: "FULLY_ALIGNED",
      flags: ["photos_not_ingested"],
    });
    expect(result.score_breakdown).toHaveProperty("base_score", 50);
    expect(result.score_breakdown).toHaveProperty("assessor_bonus", 25);
    expect(result.score_breakdown).toHaveProperty("quote_count_bonus", 15);
    expect(result.score_breakdown).toHaveProperty("alignment_modifier", 10);
    expect(result.score_breakdown).toHaveProperty("flag_penalty", 5);
    expect(result.score_breakdown.final_score).toBe(95);
  });

  it("flag penalty should be capped at 40", () => {
    const result = scoreCostReliability({
      number_of_quotes: 1,
      presence_of_assessor_cost: false,
      alignment_status: "PARTIALLY_ALIGNED",
      flags: ["structural_gap", "quote_not_mapped", "ocr_failure", "inflated_quote", "under_repair_risk", "description_not_mapped"],
    });
    expect(result.score_breakdown.flag_penalty).toBeLessThanOrEqual(40);
  });

  it("score should be clamped to 0–100", () => {
    const result = scoreCostReliability({
      number_of_quotes: 0,
      presence_of_assessor_cost: false,
      alignment_status: "MISALIGNED",
      flags: ["structural_gap", "quote_not_mapped", "ocr_failure", "inflated_quote"],
    });
    expect(result.confidence_score).toBeGreaterThanOrEqual(0);
    expect(result.confidence_score).toBeLessThanOrEqual(100);
  });
});

// ─── Reason quality ───────────────────────────────────────────────────────────

describe("Reason quality", () => {
  it("reason should be a non-empty string for all inputs", () => {
    const cases: CostReliabilityInput[] = [
      { number_of_quotes: 3, presence_of_assessor_cost: true, alignment_status: "FULLY_ALIGNED", flags: [] },
      { number_of_quotes: 1, presence_of_assessor_cost: false, alignment_status: "PARTIALLY_ALIGNED", flags: ["structural_gap"] },
      { number_of_quotes: 0, presence_of_assessor_cost: false, alignment_status: null, flags: [] },
    ];
    for (const c of cases) {
      const result = scoreCostReliability(c);
      expect(result.reason.length).toBeGreaterThan(10);
    }
  });
});
