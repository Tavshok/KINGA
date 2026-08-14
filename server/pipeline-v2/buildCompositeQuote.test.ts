/**
 * buildCompositeQuote.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the per-component cross-quote L2 formula in buildCompositeQuote.
 *
 * CONFIRMED FORMULA (product owner, August 2026):
 *   For each component:
 *     lowestSubmitted_c = min price across all quotes for this component
 *     L2_c = lowestSubmitted_c
 *     Benchmark P25/P50/P75 remain comparative metadata only.
 *   L2_total = sum of L2_c
 *
 * NOTE: Component names are normalised through resolveToCanonical() inside the
 * engine. Tests must use the canonical names for benchmark keys and assertions.
 * Known mappings:
 *   "front bumper"  → "Front Bumper"
 *   "bonnet"        → "Bonnet (Hood)"
 *   "headlamp"      → "Headlight Assembly (Left)"
 *   "component a"   → "component a"  (unknown parts pass through lowercased)
 *   "component b"   → "component b"
 *   "exotic part"   → "exotic part"
 */

import { describe, it, expect } from "vitest";
import {
  buildCompositeQuote,
  type InputQuoteWithLineItems,
  type BenchmarkMap,
} from "./quoteOptimisationEngine";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeQuoteWithItems(
  repairer: string,
  items: Array<{ name: string; costUsd: number; scope?: 'repair' | 'replace' | 'bundled' }>
): InputQuoteWithLineItems {
  const total = items.reduce((sum, i) => sum + i.costUsd, 0);
  return {
    // InputQuote required fields
    panel_beater: repairer,
    total_cost: total,
    currency: 'USD',
    components: items.map(i => i.name),
    labour_defined: true,
    parts_defined: true,
    confidence: 'high',
    // Line items — engine reads item.componentName
    lineItems: items.map((item, idx) => ({
      id: idx,
      componentName: item.name,
      costUsd: item.costUsd,
      isRepair: (item.scope ?? 'repair') === 'repair',
      isReplacement: item.scope === 'replace',
      isNonPartCost: false,
    })),
  };
}

function makeBenchmarks(
  entries: Array<{ name: string; p25: number; p50: number; p75: number }>
): BenchmarkMap {
  const map: BenchmarkMap = {};
  for (const e of entries) {
    map[e.name] = { p25Usd: e.p25, p50Usd: e.p50, p75Usd: e.p75, sampleSize: 10 };
  }
  return map;
}

// ─── Core formula tests ───────────────────────────────────────────────────────

describe("buildCompositeQuote — per-component L2 formula", () => {
  it("returns EMPTY_RESULT when no quotes are provided", () => {
    const result = buildCompositeQuote([], {}, 0);
    expect(result.compositeLineItems).toHaveLength(0);
    expect(result.compositeOptimisedCostUsd).toBe(0);
    expect(result.negotiationSavingsUsd).toBe(0);
  });

  it("selects the benchmark when it is within 30% of the lowest submitted price", () => {
    // "front bumper" normalises to "Front Bumper"
    // Qmin = 1000, benchmark P50 = 900 → 11.1% variance → L2 = 900.
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "front bumper", costUsd: 1000 }]),
      makeQuoteWithItems("Repairer B", [{ name: "front bumper", costUsd: 1200 }]),
    ];
    // Benchmark key must use canonical name
    const benchmarks = makeBenchmarks([{ name: "Front Bumper", p25: 800, p50: 900, p75: 1000 }]);
    const result = buildCompositeQuote(quotes, benchmarks, 1000);

    const item = result.compositeLineItems.find(i => i.componentName === "Front Bumper");
    expect(item).toBeDefined();
    expect(item!.selectedCostUsd).toBe(900);
    expect(item!.selectedFromQuote).toBe("KINGA Market Benchmark (P50)");
    expect(item!.selectedSubmittedFromQuote).toBe("Repairer A");
    expect(item!.isBenchmarkFill).toBe(false);
    expect(item!.kingaOptimisedTier).toBe("T2");
    expect(item!.l2SelectionMethod).toBe("BENCHMARK_WITHIN_30_PCT");
    expect(item!.benchmarkWithinTolerance).toBe(true);
    expect(item!.scopeDecisionRule).toBe("COST_COMPARISON");
    expect(item!.p50Usd).toBe(900);
  });

  it("selects the lower benchmark when it differs materially below Qmin", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "front bumper", costUsd: 1000 }]),
      makeQuoteWithItems("Repairer B", [{ name: "front bumper", costUsd: 1200 }]),
    ];
    const benchmarks = makeBenchmarks([{ name: "Front Bumper", p25: 500, p50: 600, p75: 700 }]);
    const result = buildCompositeQuote(quotes, benchmarks, 1000);

    const item = result.compositeLineItems.find(i => i.componentName === "Front Bumper");
    expect(item).toBeDefined();
    expect(item!.selectedCostUsd).toBe(600);
    expect(item!.isBenchmarkFill).toBe(false);
    expect(item!.l2SelectionMethod).toBe("LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT");
    expect(item!.benchmarkWithinTolerance).toBe(false);
  });

  it("selects the lower benchmark when it is far below Qmin", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "front bumper", costUsd: 1400 }]),
      makeQuoteWithItems("Repairer B", [{ name: "front bumper", costUsd: 1600 }]),
    ];
    const benchmarks = makeBenchmarks([{ name: "Front Bumper", p25: 300, p50: 400, p75: 500 }]);
    const result = buildCompositeQuote(quotes, benchmarks, 1400);

    const item = result.compositeLineItems.find(i => i.componentName === "Front Bumper");
    expect(item).toBeDefined();
    expect(item!.selectedCostUsd).toBe(400);
    expect(item!.isBenchmarkFill).toBe(false);
    expect(item!.scopeDecisionRule).toBe("COST_COMPARISON");
  });

  it("selects the benchmark when it is within tolerance above Qmin", () => {
    // Qmin = 1000, B = 1200 → 16.7% variance → L2 = 1200
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "front bumper", costUsd: 1000 }]),
    ];
    const benchmarks = makeBenchmarks([{ name: "Front Bumper", p25: 1100, p50: 1200, p75: 1300 }]);
    const result = buildCompositeQuote(quotes, benchmarks, 1000);

    const item = result.compositeLineItems.find(i => i.componentName === "Front Bumper");
    expect(item).toBeDefined();
    expect(item!.selectedCostUsd).toBe(1200);
    expect(item!.isBenchmarkFill).toBe(false);
    expect(item!.scopeDecisionRule).toBe("SINGLE_SCOPE_AVAILABLE");
  });

  it("uses lowestSubmitted when no benchmark exists for component", () => {
    // "exotic part" → "exotic part" (unknown, passes through)
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "exotic part", costUsd: 500 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 500);

    const item = result.compositeLineItems.find(i => i.componentName === "exotic part");
    expect(item).toBeDefined();
    expect(item!.selectedCostUsd).toBe(500);
    expect(item!.isBenchmarkFill).toBe(false);
    expect(item!.p50Usd).toBeNull();
  });

  it("selects lowest price across all quotes for each component (cross-quote)", () => {
    // "component a" → "component a", "component b" → "component b" (unknown parts)
    // Component a: Repairer 1 = 1000, Repairer 2 = 800 → lowest = 800
    // Component b: Repairer 1 = 500, Repairer 2 = 700 → lowest = 500
    const quotes = [
      makeQuoteWithItems("Repairer 1", [
        { name: "component a", costUsd: 1000 },
        { name: "component b", costUsd: 500 },
      ]),
      makeQuoteWithItems("Repairer 2", [
        { name: "component a", costUsd: 800 },
        { name: "component b", costUsd: 700 },
      ]),
    ];
    const result = buildCompositeQuote(quotes, {}, 1500);

    const itemA = result.compositeLineItems.find(i => i.componentName === "component a");
    const itemB = result.compositeLineItems.find(i => i.componentName === "component b");
    expect(itemA).toBeDefined();
    expect(itemB).toBeDefined();
    expect(itemA!.selectedCostUsd).toBe(800);
    expect(itemA!.selectedFromQuote).toBe("Repairer 2");
    expect(itemB!.selectedCostUsd).toBe(500);
    expect(itemB!.selectedFromQuote).toBe("Repairer 1");
  });

  it("L2_total = sum of benchmark-validated component values", () => {
    // component a: Qmin 800, B 700 within 30% → 700.
    // component b: Qmin 500, B 100 outside 30% → lower value 100.
    const quotes = [
      makeQuoteWithItems("Repairer 1", [
        { name: "component a", costUsd: 1000 },
        { name: "component b", costUsd: 500 },
      ]),
      makeQuoteWithItems("Repairer 2", [
        { name: "component a", costUsd: 800 },
      ]),
    ];
    const benchmarks = makeBenchmarks([
      { name: "component a", p25: 600, p50: 700, p75: 800 },
      { name: "component b", p25: 80, p50: 100, p75: 120 },
    ]);
    const result = buildCompositeQuote(quotes, benchmarks, 1500);
    expect(result.compositeOptimisedCostUsd).toBe(800);
  });

  it("cherry-pick across quotes produces lower L2 than best package deal", () => {
    // Repairer 1: component a = 1000, component b = 2000 → total = 3000
    // Repairer 2: component a = 1500, component b = 1200 → total = 2700
    // L1 = 2700 (Repairer 2 total)
    // No benchmarks → L2_a = 1000 (Repairer 1), L2_b = 1200 (Repairer 2)
    // L2_total = 2200 < L1 = 2700 → savings = 500
    const quotes = [
      makeQuoteWithItems("Repairer 1", [
        { name: "component a", costUsd: 1000 },
        { name: "component b", costUsd: 2000 },
      ]),
      makeQuoteWithItems("Repairer 2", [
        { name: "component a", costUsd: 1500 },
        { name: "component b", costUsd: 1200 },
      ]),
    ];
    const result = buildCompositeQuote(quotes, {}, 2700);

    expect(result.compositeOptimisedCostUsd).toBe(2200);
    expect(result.negotiationSavingsUsd).toBe(500);
  });

  it("allQuotedPrices contains entries for all repairers that quoted the component", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "component a", costUsd: 1000 }]),
      makeQuoteWithItems("Repairer B", [{ name: "component a", costUsd: 1100 }]),
      makeQuoteWithItems("Repairer C", [{ name: "component a", costUsd: 900 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 900);

    const item = result.compositeLineItems.find(i => i.componentName === "component a");
    expect(item).toBeDefined();
    expect(item!.allQuotedPrices).toHaveLength(3);
    const repairers = item!.allQuotedPrices.map(p => p.quote);
    expect(repairers).toContain("Repairer A");
    expect(repairers).toContain("Repairer B");
    expect(repairers).toContain("Repairer C");
  });

  it("benchmarkCoverageComponents counts components with a P50 benchmark", () => {
    // "front bumper" → "Front Bumper", "bonnet" → "Bonnet (Hood)", "exotic part" → "exotic part"
    const quotes = [
      makeQuoteWithItems("Repairer A", [
        { name: "front bumper", costUsd: 1000 },
        { name: "bonnet", costUsd: 800 },
        { name: "exotic part", costUsd: 300 },
      ]),
    ];
    const benchmarks = makeBenchmarks([
      { name: "Front Bumper", p25: 700, p50: 800, p75: 900 },
      { name: "Bonnet (Hood)", p25: 600, p50: 700, p75: 800 },
      // no benchmark for "exotic part"
    ]);
    const result = buildCompositeQuote(quotes, benchmarks, 2100);
    expect(result.benchmarkCoverageComponents).toBe(2);
  });

  it("benchmarkReferenceCostUsd is sum of P50 for all benchmarked components", () => {
    // "front bumper" → "Front Bumper", "bonnet" → "Bonnet (Hood)"
    const quotes = [
      makeQuoteWithItems("Repairer A", [
        { name: "front bumper", costUsd: 1000 },
        { name: "bonnet", costUsd: 800 },
      ]),
    ];
    const benchmarks = makeBenchmarks([
      { name: "Front Bumper", p25: 700, p50: 850, p75: 950 },
      { name: "Bonnet (Hood)", p25: 600, p50: 750, p75: 850 },
    ]);
    const result = buildCompositeQuote(quotes, benchmarks, 1800);
    // P50 sum = 850 + 750 = 1600
    expect(result.benchmarkReferenceCostUsd).toBe(1600);
  });

  it("uses l1TotalUsd hint when provided and > 0", () => {
    // "exotic part" → "exotic part", lowestSubmitted = 1000, no benchmark → L2 = 1000
    // l1TotalUsd hint = 950 → L1 = 950
    // negotiationSavingsUsd = L1 - L2 = 950 - 1000 = -50
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "exotic part", costUsd: 1000 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 950);
    expect(result.negotiationSavingsUsd).toBe(-50);
  });

  it("falls back to normalised total when l1TotalUsd hint is 0", () => {
    // "exotic part" → "exotic part", lowestSubmitted = 1000, no benchmark → L2 = 1000
    // l1TotalUsd hint = 0 → fall back to normalisedL1 = 1000
    // negotiationSavingsUsd = 1000 - 1000 = 0
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "exotic part", costUsd: 1000 }]),
      makeQuoteWithItems("Repairer B", [{ name: "exotic part", costUsd: 1200 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 0);
    expect(result.negotiationSavingsUsd).toBe(0);
  });

  it("selects the lower benchmark outside tolerance while retaining submitted evidence", () => {
    // "front bumper" → "Front Bumper", "bonnet" → "Bonnet (Hood)", "headlamp" → "Headlight Assembly (Left)"
    const quotes = [
      makeQuoteWithItems("Cedric Jonker", [
        { name: "front bumper", costUsd: 1400 },
        { name: "bonnet", costUsd: 800 },
        { name: "headlamp", costUsd: 350 },
      ]),
      makeQuoteWithItems("Swiss Motors", [
        { name: "front bumper", costUsd: 1500 },
        { name: "bonnet", costUsd: 850 },
        { name: "headlamp", costUsd: 380 },
      ]),
      makeQuoteWithItems("Grand Auto", [
        { name: "front bumper", costUsd: 1350 },
        { name: "bonnet", costUsd: 780 },
        { name: "headlamp", costUsd: 340 },
      ]),
    ];
    // Each benchmark is materially below Qmin, so the approved rule selects the lower benchmark.
    const benchmarks = makeBenchmarks([
      { name: "Front Bumper", p25: 300, p50: 400, p75: 500 },
      { name: "Bonnet (Hood)", p25: 180, p50: 220, p75: 280 },
      { name: "Headlight Assembly (Left)", p25: 80, p50: 100, p75: 130 },
    ]);
    // L1 = Grand Auto total = 2470
    const result = buildCompositeQuote(quotes, benchmarks, 2470);

    // L2_front_bumper = 400, L2_bonnet = 220, L2_headlamp = 100.
    expect(result.compositeOptimisedCostUsd).toBe(720);

    // All items retain submitted source evidence but select the lower benchmark.
    for (const item of result.compositeLineItems) {
      expect(item.isBenchmarkFill).toBe(false);
      expect(item.l2SelectionMethod).toBe("LOWER_OF_BENCHMARK_AND_SUBMITTED_OUTSIDE_30_PCT");
    }

    expect(result.negotiationSavingsUsd).toBe(1750);
  });

  it("adds a verification remark when like-for-like submitted prices exceed 20% spread", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "component a", costUsd: 100 }]),
      makeQuoteWithItems("Repairer B", [{ name: "component a", costUsd: 130 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 100);
    const item = result.compositeLineItems.find(i => i.componentName === "component a");

    expect(item!.lineItemSpreadPct).toBe(30);
    expect(item!.highLineItemVariance).toBe(true);
    expect(item!.lineItemVarianceRemark).toContain("verify component scope");
  });

  it("does not add a high-variance remark at the exact 20% spread boundary", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "component a", costUsd: 100 }]),
      makeQuoteWithItems("Repairer B", [{ name: "component a", costUsd: 120 }]),
    ];
    const result = buildCompositeQuote(quotes, {}, 100);
    const item = result.compositeLineItems.find(i => i.componentName === "component a");

    expect(item!.lineItemSpreadPct).toBe(20);
    expect(item!.highLineItemVariance).toBe(false);
    expect(item!.lineItemVarianceRemark).toBeNull();
  });
});

  it("includes paint and sundries in composite when isNonPartCost=true (no benchmark needed)", () => {
    // Verifies the fix: paint/sundries must NOT be excluded from the component matrix.
    // When no benchmark exists, the engine uses the lowest submitted price (T3).
    const quotes: InputQuoteWithLineItems[] = [
      {
        panel_beater: "Repairer A",
        total_cost: 890,
        currency: "USD",
        components: ["Front Bumper", "paint", "sundries"],
        labour_defined: false,
        parts_defined: true,
        confidence: "high",
        lineItems: [
          { componentName: "Front Bumper", costUsd: 540, isRepair: false, isReplacement: false, isNonPartCost: false },
          { componentName: "paint",        costUsd: 300, isRepair: false, isReplacement: false, isNonPartCost: true },
          { componentName: "sundries",     costUsd: 50,  isRepair: false, isReplacement: false, isNonPartCost: true },
        ],
      },
      {
        panel_beater: "Repairer B",
        total_cost: 1060,
        currency: "USD",
        components: ["Front Bumper", "paint", "sundries"],
        labour_defined: false,
        parts_defined: true,
        confidence: "high",
        lineItems: [
          { componentName: "Front Bumper", costUsd: 620, isRepair: false, isReplacement: false, isNonPartCost: false },
          { componentName: "paint",        costUsd: 380, isRepair: false, isReplacement: false, isNonPartCost: true },
          { componentName: "sundries",     costUsd: 60,  isRepair: false, isReplacement: false, isNonPartCost: true },
        ],
      },
    ];
    const result = buildCompositeQuote(quotes, {}, 890);
    // All 3 components should appear in the composite
    const names = result.compositeLineItems.map(i => i.componentName);
    expect(names).toContain("Front Bumper");
    expect(names).toContain("paint");
    expect(names).toContain("sundries");
    // Each should use lowest submitted price (no benchmark)
    const bumper = result.compositeLineItems.find(i => i.componentName === "Front Bumper")!;
    expect(bumper.selectedCostUsd).toBe(540);
    expect(bumper.isBenchmarkFill).toBe(false);
    const paint = result.compositeLineItems.find(i => i.componentName === "paint")!;
    expect(paint.selectedCostUsd).toBe(300);
    expect(paint.isBenchmarkFill).toBe(false);
    const sundries = result.compositeLineItems.find(i => i.componentName === "sundries")!;
    expect(sundries.selectedCostUsd).toBe(50);
    expect(sundries.isBenchmarkFill).toBe(false);
    // L2 total = 540 + 300 + 50 = 890
    expect(result.compositeOptimisedCostUsd).toBe(890);
  });

  it("uses submitted VAT and workshop-fee rows only when they are explicitly quoted", () => {
    const quotes: InputQuoteWithLineItems[] = [
      {
        panel_beater: "Repairer A",
        total_cost: 700,
        currency: "USD",
        components: ["Front Bumper"],
        labour_defined: false,
        parts_defined: true,
        confidence: "high",
        lineItems: [
          { componentName: "Front Bumper", costUsd: 540, isRepair: false, isReplacement: false, isNonPartCost: false },
          { componentName: "vat",          costUsd: 100, isRepair: false, isReplacement: false, isNonPartCost: true },
          { componentName: "workshop fee", costUsd: 60,  isRepair: false, isReplacement: false, isNonPartCost: true },
        ],
      },
    ];
    const result = buildCompositeQuote(quotes, {}, 700);
    // All payable rows must be included so L2 uses the same all-in basis as L1.
    expect(result.compositeLineItems.map(item => item.componentName)).toEqual(
      expect.arrayContaining(["Front Bumper", "vat", "workshop fee"])
    );
    expect(result.compositeOptimisedCostUsd).toBe(700);
    expect(result.isComplete).toBe(true);
    expect(result.allInReconciliationRequired).toBe(false);
    expect(result.quoteReconciliations[0]).toMatchObject({
      submittedHeaderTotalUsd: 700,
      submittedItemisedTotalUsd: 700,
      status: "reconciled",
    });
  });

  it("publishes L2 from submitted component evidence while retaining an unreconciled quote header as a quote issue", () => {
    const quotes: InputQuoteWithLineItems[] = [{
      panel_beater: "Repairer A",
      sourceQuoteId: "quote-101",
      total_cost: 1100,
      currency: "USD",
      components: ["Front Bumper"],
      labour_defined: false,
      parts_defined: true,
      confidence: "high",
      lineItems: [{
        sourceQuoteId: "quote-101",
        sourceLineItemId: "line-101",
        componentName: "Front Bumper",
        costUsd: 1000,
        isRepair: false,
        isReplacement: true,
        isNonPartCost: false,
      }],
    }];

    const result = buildCompositeQuote(quotes, {}, 1100, undefined, ["Front Bumper"]);

    expect(result.compositeOptimisedCostUsd).toBe(1000);
    expect(result.partialPricedScopeUsd).toBe(1000);
    expect(result.isComplete).toBe(true);
    expect(result.allInReconciliationRequired).toBe(true);
    expect(result.quoteReconciliations).toEqual([expect.objectContaining({
      quoteId: "quote-101",
      submittedHeaderTotalUsd: 1100,
      submittedItemisedTotalUsd: 1000,
      unexplainedResidualUsd: 100,
      status: "reconciliation_required",
    })]);
    expect(result.compositeLineItems[0]).toMatchObject({
      selectedCostUsd: 1000,
      selectedFromQuote: "Repairer A",
      selectedQuoteId: "quote-101",
      selectedLineItemIds: ["line-101"],
      isBenchmarkFill: false,
    });
  });

  it("suppresses numeric L2 when a confirmed repair component has no traceable price", () => {
    const quotes = [
      makeQuoteWithItems("Repairer A", [{ name: "front bumper", costUsd: 540 }]),
    ];

    const result = buildCompositeQuote(
      quotes,
      {},
      540,
      undefined,
      ["front bumper", "radiator"]
    );

    expect(result.isComplete).toBe(false);
    expect(result.compositeOptimisedCostUsd).toBeNull();
    expect(result.partialPricedScopeUsd).toBe(540);
    expect(result.missingRequiredComponents).toContain("Radiator Assembly");
    expect(result.compositeLineItems.find(item => item.componentName === "Radiator Assembly")).toMatchObject({
      dataGap: true,
      selectedFromQuote: "data_gap",
    });
  });

  it("withholds L2 when the only required component value is an inferred extraction fallback", () => {
    const result = buildCompositeQuote([{
      panel_beater: "Repairer A",
      total_cost: 540,
      currency: "USD",
      components: ["Front bumper"],
      confidence: "high",
      lineItems: [{
        componentName: "Front bumper",
        costUsd: 540,
        sourcePricingVerified: false,
        isRepair: true,
        isReplacement: false,
        isNonPartCost: false,
      }],
    }], {}, 540, undefined, ["Front bumper"]);

    expect(result).toMatchObject({
      isComplete: false,
      compositeOptimisedCostUsd: null,
    });
    expect(result.missingRequiredComponents).toContain("Front Bumper");
  });

  it("continues L2 from remaining eligible submitted evidence when another quote has only inferred pricing", () => {
    const result = buildCompositeQuote([
      {
        panel_beater: "Eligible Repairs",
        total_cost: 500,
        currency: "USD",
        components: ["Front bumper"],
        confidence: "high",
        lineItems: [{
          componentName: "Front bumper",
          costUsd: 500,
          sourcePricingVerified: true,
          isRepair: true,
          isReplacement: false,
          isNonPartCost: false,
        }],
      },
      {
        panel_beater: "Defective Extraction",
        total_cost: 650,
        currency: "USD",
        components: ["Front bumper"],
        confidence: "low",
        lineItems: [{
          componentName: "Front bumper",
          costUsd: 650,
          sourcePricingVerified: false,
          isRepair: true,
          isReplacement: false,
          isNonPartCost: false,
        }],
      },
    ], {}, 500, undefined, ["Front bumper"]);

    expect(result).toMatchObject({
      isComplete: true,
      compositeOptimisedCostUsd: 500,
      missingRequiredComponents: [],
    });
    expect(result.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentName: "Front Bumper",
        selectedSubmittedFromQuote: "Eligible Repairs",
        lowestEligibleSubmittedCostUsd: 500,
      }),
    ]));
  });

  it("continues L2 when another active quote is total-only and therefore contributes no component price", () => {
    const result = buildCompositeQuote([
      {
        panel_beater: "Eligible Repairs",
        total_cost: 500,
        currency: "USD",
        components: ["Front bumper"],
        confidence: "high",
        lineItems: [{ componentName: "Front bumper", costUsd: 500, sourcePricingVerified: true, isRepair: true, isReplacement: false, isNonPartCost: false }],
      },
      {
        panel_beater: "Total-only quotation",
        total_cost: 650,
        currency: "USD",
        components: ["Front bumper"],
        confidence: "medium",
        lineItems: [],
      },
    ], {}, 500, undefined, ["Front bumper"]);

    expect(result).toMatchObject({
      isComplete: true,
      compositeOptimisedCostUsd: 500,
      missingRequiredComponents: [],
    });
    expect(result.compositeLineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ componentName: "Front Bumper", selectedSubmittedFromQuote: "Eligible Repairs" }),
    ]));
  });
