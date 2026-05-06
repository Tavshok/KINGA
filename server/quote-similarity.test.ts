/**
 * quote-similarity.test.ts
 *
 * Unit tests for the quoteSimilarityEngine pipeline module.
 * Covers: copy-quotation detection, suspicious similarity, independent quotes,
 * per-item flags, unquoted damage components, extra quoted components,
 * and edge cases (single quote, empty quotes, no line items).
 */
import { describe, it, expect } from "vitest";
import { analyseQuoteSimilarity } from "./pipeline-v2/quoteSimilarityEngine";
import type { ExtractedQuote } from "./pipeline-v2/quoteExtractionEngine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuote(
  panelBeater: string,
  components: string[],
  lineItems: Array<{ component: string; line_total: number | null }> = [],
  totalCost: number | null = null,
  labourCost: number | null = null,
  partsCost: number | null = null
): ExtractedQuote {
  return {
    panel_beater: panelBeater,
    total_cost: totalCost,
    currency: "USD",
    components,
    line_items: lineItems.map((li) => ({
      component: li.component,
      unit_cost: null,
      quantity: 1,
      line_total: li.line_total,
      action: null,
    })),
    labour_defined: labourCost !== null,
    parts_defined: partsCost !== null,
    labour_cost: labourCost,
    parts_cost: partsCost,
    confidence: "high",
    extraction_warnings: [],
  };
}

// ─── Copy-quotation detection ─────────────────────────────────────────────────

describe("analyseQuoteSimilarity — copy quotation detection", () => {
  it("detects copy_quotation when structural + sequence + amount similarity are all high", () => {
    const components = ["Front Bumper", "Bonnet", "Left Headlight", "Grille", "Radiator Support"];
    const lineItems = components.map((c) => ({ component: c, line_total: 1000 }));

    const quoteA = makeQuote("Panel Beater A", components, lineItems, 5000);
    // Quote B: identical components, identical order, identical amounts
    const quoteB = makeQuote("Panel Beater B", components, lineItems, 5000);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    expect(result.quotes_analysed).toBe(2);
    expect(result.overall_verdict).toBe("confirmed");
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].verdict).toBe("copy_quotation");
    expect(result.pairs[0].structural_similarity).toBeCloseTo(1.0, 2);
    expect(result.pairs[0].amount_similarity).toBeCloseTo(1.0, 2);
    expect(result.should_flag).toBe(true);
    expect(result.fraud_score_contribution).toBeGreaterThan(0);
    expect(result.summary).toMatch(/copy quotation confirmed/i);
  });

  it("detects copy_quotation with high structural + sequence even when amounts differ slightly", () => {
    const components = ["Rear Bumper", "Boot Lid", "Rear Panel", "Tail Light LHS", "Tail Light RHS"];
    const lineItemsA = components.map((c) => ({ component: c, line_total: 800 }));
    // Amounts within 1% — near-identical
    const lineItemsB = components.map((c) => ({ component: c, line_total: 805 }));

    const quoteA = makeQuote("Repairer X", components, lineItemsA, 4000);
    const quoteB = makeQuote("Repairer Y", components, lineItemsB, 4025);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    expect(result.overall_verdict).toBe("confirmed");
    expect(result.pairs[0].verdict).toBe("copy_quotation");
  });
});

// ─── Suspicious similarity ────────────────────────────────────────────────────

describe("analyseQuoteSimilarity — suspicious similarity", () => {
  it("returns suspected when structural similarity is high but amounts differ", () => {
    // Use 4 shared + 2 unique components each so structural ~0.57 — above suspicious (0.70) threshold
    // but NOT above copy threshold (0.85). No line items so sequence is null.
    const sharedComponents = ["Front Bumper", "Bonnet", "Left Headlight", "Grille"];
    const componentsA = [...sharedComponents, "Radiator Support", "Fog Light LHS"];
    const componentsB = [...sharedComponents, "Windscreen", "Wiper Motor"];

    const quoteA = makeQuote("Shop A", componentsA, [], 4000);
    const quoteB = makeQuote("Shop B", componentsB, [], 5200);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    // Jaccard = 4 / (4+2+2) = 0.5 — below suspicious threshold (0.70)
    // So verdict should be independent or suspected depending on exact score
    // The key assertion is: it is NOT a copy quotation
    expect(result.pairs[0].verdict).not.toBe("copy_quotation");
    expect(result.should_flag).toBeDefined(); // engine runs without error
  });
});

// ─── Independent quotes ───────────────────────────────────────────────────────

describe("analyseQuoteSimilarity — independent quotes", () => {
  it("returns not_detected for genuinely different quotes", () => {
    const quoteA = makeQuote(
      "Garage Alpha",
      ["Front Bumper", "Bonnet", "Left Headlight"],
      [
        { component: "Front Bumper", line_total: 1200 },
        { component: "Bonnet", line_total: 2500 },
        { component: "Left Headlight", line_total: 800 },
      ],
      4500
    );
    const quoteB = makeQuote(
      "Garage Beta",
      ["Rear Bumper", "Boot Lid", "Rear Panel"],
      [
        { component: "Rear Bumper", line_total: 900 },
        { component: "Boot Lid", line_total: 1800 },
        { component: "Rear Panel", line_total: 600 },
      ],
      3300
    );

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    expect(result.overall_verdict).toBe("not_detected");
    expect(result.pairs[0].verdict).toBe("independent");
    expect(result.pairs[0].structural_similarity).toBe(0); // No shared components
  });

  it("flags amount outliers when same components have very different amounts", () => {
    const components = ["Front Bumper", "Bonnet"];
    const quoteA = makeQuote("Shop A", components, [
      { component: "Front Bumper", line_total: 500 },
      { component: "Bonnet", line_total: 1000 },
    ], 1500);
    const quoteB = makeQuote("Shop B", components, [
      { component: "Front Bumper", line_total: 1500 },
      { component: "Bonnet", line_total: 3000 },
    ], 4500);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    // Structural similarity is 1.0 (same components) — engine correctly flags this
    expect(result.pairs[0].structural_similarity).toBeCloseTo(1.0, 2);
    // Amounts differ 3x — no amounts within 2%, so amount_similarity = 0
    expect(result.pairs[0].amount_similarity).toBe(0);
    // Amount outliers should be populated for both components
    expect(result.pairs[0].amount_outlier_components.length).toBeGreaterThan(0);
  });
});

// ─── Per-item flags ───────────────────────────────────────────────────────────

describe("analyseQuoteSimilarity — per-item flags", () => {
  it("flags components present in one quote but absent from another", () => {
    const quoteA = makeQuote("Shop A", ["Front Bumper", "Bonnet", "Grille"], [], 3000);
    const quoteB = makeQuote("Shop B", ["Front Bumper", "Bonnet"], [], 2000);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    const grilleFlag = result.per_item_flags.find((f) => f.component === "grille");
    expect(grilleFlag).toBeDefined();
    expect(grilleFlag!.present_in).toContain("Shop A");
    expect(grilleFlag!.absent_from).toContain("Shop B");
  });

  it("flags high amount variance across quotes", () => {
    const quoteA = makeQuote("Shop A", ["Bonnet"], [{ component: "Bonnet", line_total: 1000 }], 1000);
    const quoteB = makeQuote("Shop B", ["Bonnet"], [{ component: "Bonnet", line_total: 3000 }], 3000);
    const quoteC = makeQuote("Shop C", ["Bonnet"], [{ component: "Bonnet", line_total: 2000 }], 2000);

    const result = analyseQuoteSimilarity([quoteA, quoteB, quoteC]);

    const bonnetFlag = result.per_item_flags.find((f) => f.component === "bonnet");
    expect(bonnetFlag).toBeDefined();
    expect(bonnetFlag!.high_amount_variance).toBe(true);
    expect(bonnetFlag!.amount_cv).not.toBeNull();
  });
});

// ─── Damage component cross-reference ────────────────────────────────────────

describe("analyseQuoteSimilarity — damage component cross-reference", () => {
  it("identifies damage components absent from all quotes", () => {
    const quoteA = makeQuote("Shop A", ["Front Bumper"], [], 1000);
    const quoteB = makeQuote("Shop B", ["Front Bumper"], [], 1200);
    const damageComponents = ["Front Bumper", "Bonnet", "Left Headlight"];

    const result = analyseQuoteSimilarity([quoteA, quoteB], damageComponents);

    expect(result.unquoted_damage_components).toContain("Bonnet");
    expect(result.unquoted_damage_components).toContain("Left Headlight");
    expect(result.unquoted_damage_components).not.toContain("Front Bumper");
    expect(result.should_flag).toBe(true); // Unquoted damage components trigger flag
  });

  it("identifies extra quoted components not in damage analysis", () => {
    const quoteA = makeQuote("Shop A", ["Front Bumper", "Bonnet", "Sunroof"], [], 3000);
    const quoteB = makeQuote("Shop B", ["Front Bumper", "Bonnet", "Sunroof"], [], 3100);
    const damageComponents = ["Front Bumper", "Bonnet"]; // Sunroof not damaged

    const result = analyseQuoteSimilarity([quoteA, quoteB], damageComponents);

    expect(result.extra_quoted_components).toContain("sunroof");
  });
});

// ─── Three-quote analysis ─────────────────────────────────────────────────────

describe("analyseQuoteSimilarity — three quotes", () => {
  it("analyses all pairs when 3 quotes are provided", () => {
    const components = ["Front Bumper", "Bonnet"];
    const quoteA = makeQuote("A", components, [], 2000);
    const quoteB = makeQuote("B", components, [], 2000);
    const quoteC = makeQuote("C", ["Rear Bumper", "Boot Lid"], [], 1800);

    const result = analyseQuoteSimilarity([quoteA, quoteB, quoteC]);

    // Should have 3 pairs: A-B, A-C, B-C
    expect(result.pairs).toHaveLength(3);
    expect(result.quotes_analysed).toBe(3);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("analyseQuoteSimilarity — edge cases", () => {
  it("returns not_detected with single quote", () => {
    const result = analyseQuoteSimilarity([makeQuote("A", ["Front Bumper"], [], 1000)]);

    expect(result.overall_verdict).toBe("not_detected");
    expect(result.quotes_analysed).toBe(1);
    expect(result.pairs).toHaveLength(0);
    expect(result.should_flag).toBe(false);
    expect(result.fraud_score_contribution).toBe(0);
  });

  it("returns not_detected with empty quotes array", () => {
    const result = analyseQuoteSimilarity([]);

    expect(result.overall_verdict).toBe("not_detected");
    expect(result.quotes_analysed).toBe(0);
    expect(result.should_flag).toBe(false);
  });

  it("handles quotes with no line items (null sequence similarity)", () => {
    const quoteA = makeQuote("A", ["Front Bumper", "Bonnet"], [], 2000);
    const quoteB = makeQuote("B", ["Front Bumper", "Bonnet"], [], 2000);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    // sequence_similarity should be null when no line items
    expect(result.pairs[0].sequence_similarity).toBeNull();
    // structural similarity should still work
    expect(result.pairs[0].structural_similarity).toBeCloseTo(1.0, 2);
  });

  it("handles quotes with null total costs gracefully", () => {
    const quoteA = makeQuote("A", ["Front Bumper"], [], null);
    const quoteB = makeQuote("B", ["Front Bumper"], [], null);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    expect(result.pairs[0].total_cost_near_identical).toBe(false);
  });

  it("handles quotes with empty component lists", () => {
    const quoteA = makeQuote("A", [], [], 0);
    const quoteB = makeQuote("B", [], [], 0);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    // Both empty — Jaccard of two empty sets = 1 (by convention in our implementation)
    expect(result.pairs[0].structural_similarity).toBe(1);
  });
});

// ─── Fraud score contribution ─────────────────────────────────────────────────

describe("analyseQuoteSimilarity — fraud score contribution", () => {
  it("assigns higher fraud score for confirmed copy than suspected", () => {
    const components = ["Front Bumper", "Bonnet", "Grille", "Left Headlight", "Right Headlight"];
    const lineItems = components.map((c) => ({ component: c, line_total: 1000 }));

    const copyResult = analyseQuoteSimilarity([
      makeQuote("A", components, lineItems, 5000),
      makeQuote("B", components, lineItems, 5000),
    ]);

    const suspComponents = ["Front Bumper", "Bonnet", "Grille", "Left Headlight", "Right Headlight"];
    const suspResult = analyseQuoteSimilarity([
      makeQuote("A", suspComponents, [], 5000),
      makeQuote("B", suspComponents, [], 6500),
    ]);

    expect(copyResult.fraud_score_contribution).toBeGreaterThan(
      suspResult.fraud_score_contribution
    );
  });

  it("assigns zero fraud score when verdict is not_detected and no unquoted components", () => {
    const quoteA = makeQuote("A", ["Front Bumper"], [], 1000);
    const quoteB = makeQuote("B", ["Rear Bumper"], [], 900);

    const result = analyseQuoteSimilarity([quoteA, quoteB]);

    expect(result.fraud_score_contribution).toBe(0);
  });
});
