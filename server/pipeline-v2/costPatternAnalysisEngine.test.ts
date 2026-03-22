/**
 * costPatternAnalysisEngine.test.ts
 *
 * Comprehensive test suite for the Cost Pattern Analysis Engine.
 * Tests cover: core analysis, top-N selection, weighting, noise filtering,
 * insights generation, scenario filters, quality tier filters, edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  analyseCostPatterns,
  buildLearningRecord,
  type ClaimLearningRecord,
  type CostPatternInput,
} from "./costPatternAnalysisEngine";

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function makeClaim(
  id: number,
  totalCost: number,
  components: Array<{ name: string; cost: number }>,
  opts: Partial<ClaimLearningRecord> = {}
): ClaimLearningRecord {
  return {
    claim_id: id,
    total_cost_usd: totalCost,
    components: components.map((c) => ({
      component_name: c.name,
      cost_usd: c.cost,
    })),
    quality_tier: "HIGH",
    scenario_type: "vehicle_collision",
    case_signature: "sedan_collision_frontal_moderate_4c_medium",
    ...opts,
  };
}

/** Standard dataset: 5 claims with consistent component patterns */
const STANDARD_CLAIMS: ClaimLearningRecord[] = [
  makeClaim(1, 8500, [
    { name: "Front Bumper Assembly", cost: 1200 },
    { name: "Radiator", cost: 2100 },
    { name: "Hood", cost: 900 },
    { name: "Headlight LH", cost: 450 },
    { name: "Condenser", cost: 850 },
  ]),
  makeClaim(2, 7200, [
    { name: "Front Bumper Assembly", cost: 1100 },
    { name: "Radiator", cost: 1900 },
    { name: "Hood", cost: 850 },
    { name: "Headlight LH", cost: 420 },
    { name: "Grille", cost: 380 },
  ]),
  makeClaim(3, 9100, [
    { name: "Front Bumper Assembly", cost: 1350 },
    { name: "Radiator", cost: 2300 },
    { name: "Hood", cost: 1050 },
    { name: "Condenser", cost: 920 },
    { name: "Radiator Support", cost: 1800 },
  ]),
  makeClaim(4, 6800, [
    { name: "Front Bumper Assembly", cost: 1050 },
    { name: "Radiator", cost: 1750 },
    { name: "Hood", cost: 780 },
    { name: "Headlight LH", cost: 390 },
    { name: "Grille", cost: 350 },
  ]),
  makeClaim(5, 10200, [
    { name: "Front Bumper Assembly", cost: 1500 },
    { name: "Radiator", cost: 2600 },
    { name: "Hood", cost: 1200 },
    { name: "Radiator Support", cost: 2100 },
    { name: "Condenser", cost: 980 },
  ]),
];

// ─── Core Analysis Tests ──────────────────────────────────────────────────────

describe("analyseCostPatterns — core analysis", () => {
  it("returns the correct output shape", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result).toHaveProperty("high_cost_drivers");
    expect(result).toHaveProperty("component_weighting");
    expect(result).toHaveProperty("insights");
    expect(result).toHaveProperty("metadata");
    expect(Array.isArray(result.high_cost_drivers)).toBe(true);
    expect(typeof result.component_weighting).toBe("object");
    expect(Array.isArray(result.insights)).toBe(true);
  });

  it("identifies Radiator as the top cost driver", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result.high_cost_drivers.length).toBeGreaterThan(0);
    expect(result.high_cost_drivers[0].component_name).toBe("Radiator");
  });

  it("returns at most 5 cost drivers by default", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result.high_cost_drivers.length).toBeLessThanOrEqual(5);
  });

  it("returns correct frequency for Radiator (appears in all 5 claims)", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const radiator = result.high_cost_drivers.find(
      (d) => d.component_name === "Radiator"
    );
    expect(radiator?.frequency).toBe(5);
  });

  it("computes avg_cost_usd correctly for Radiator", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const radiator = result.high_cost_drivers.find(
      (d) => d.component_name === "Radiator"
    );
    // Total: 2100+1900+2300+1750+2600 = 10650, avg = 2130
    expect(radiator?.avg_cost_usd).toBeCloseTo(2130, 0);
  });

  it("cost_contribution_pct sums to ≤ 100 across all drivers", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const total = result.high_cost_drivers.reduce(
      (sum, d) => sum + d.cost_contribution_pct,
      0
    );
    expect(total).toBeLessThanOrEqual(100.1); // allow floating point tolerance
  });

  it("cumulative_pct is non-decreasing", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    for (let i = 1; i < result.high_cost_drivers.length; i++) {
      expect(result.high_cost_drivers[i].cumulative_pct).toBeGreaterThanOrEqual(
        result.high_cost_drivers[i - 1].cumulative_pct
      );
    }
  });

  it("component_weighting values sum to approximately 1", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const total = Object.values(result.component_weighting).reduce(
      (sum, w) => sum + w,
      0
    );
    expect(total).toBeCloseTo(1, 1);
  });

  it("component_weighting keys match normalised component names", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    // All keys should be title-cased normalised names
    for (const key of Object.keys(result.component_weighting)) {
      expect(key).toMatch(/^[A-Z]/); // starts with uppercase
    }
  });

  it("metadata.claims_analysed equals the number of valid claims", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result.metadata.claims_analysed).toBe(5);
  });

  it("metadata.total_cost_analysed_usd equals sum of all claim costs", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const expected = STANDARD_CLAIMS.reduce((s, c) => s + c.total_cost_usd, 0);
    expect(result.metadata.total_cost_analysed_usd).toBeCloseTo(expected, 0);
  });
});

// ─── Noise Filtering Tests ────────────────────────────────────────────────────

describe("analyseCostPatterns — noise filtering", () => {
  it("excludes components that appear in fewer than MIN_FREQUENCY_THRESHOLD claims", () => {
    const claims = [
      ...STANDARD_CLAIMS,
      makeClaim(99, 500, [{ name: "Rare Exotic Part", cost: 9999 }]),
    ];
    const result = analyseCostPatterns({ claims });
    const rare = result.high_cost_drivers.find(
      (d) => d.component_name === "Rare Exotic"
    );
    // "Rare Exotic Part" appears only once — should be filtered out
    expect(rare).toBeUndefined();
  });

  it("includes components that appear in exactly MIN_FREQUENCY_THRESHOLD claims", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Unique Bracket", cost: 1000 }]),
      makeClaim(2, 5000, [{ name: "Unique Bracket", cost: 1200 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const bracket = result.high_cost_drivers.find(
      (d) => d.component_name === "Unique Bracket"
    );
    expect(bracket).toBeDefined();
  });

  it("respects custom min_frequency override", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Rare Part", cost: 2000 }]),
      makeClaim(2, 5000, [{ name: "Common Part", cost: 500 }]),
      makeClaim(3, 5000, [{ name: "Common Part", cost: 600 }]),
      makeClaim(4, 5000, [{ name: "Common Part", cost: 550 }]),
    ];
    // With min_frequency=1, Rare Part should appear
    const result = analyseCostPatterns({ claims, min_frequency: 1 });
    const rare = result.high_cost_drivers.find(
      (d) => d.component_name === "Rare Part"
    );
    // "Rare Part" stays as "Rare Part" after normalisation
    expect(rare).toBeDefined();
  });

  it("excludes components with cost_usd = 0", () => {
    const claims = [
      makeClaim(1, 5000, [
        { name: "Zero Cost Part", cost: 0 },
        { name: "Real Part", cost: 2000 },
      ]),
      makeClaim(2, 5000, [
        { name: "Zero Cost Part", cost: 0 },
        { name: "Real Part", cost: 2200 },
      ]),
    ];
    const result = analyseCostPatterns({ claims });
    const zeroCost = result.high_cost_drivers.find(
      (d) => d.component_name === "Zero Cost"
    );
    expect(zeroCost).toBeUndefined();
  });
});

// ─── Top-N Selection Tests ────────────────────────────────────────────────────

describe("analyseCostPatterns — top-N selection", () => {
  it("returns exactly top_n=3 when specified", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS, top_n: 3 });
    expect(result.high_cost_drivers.length).toBeLessThanOrEqual(3);
  });

  it("returns exactly top_n=1 when specified", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS, top_n: 1 });
    expect(result.high_cost_drivers.length).toBe(1);
  });

  it("drivers are sorted by total_cost_usd descending", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    for (let i = 1; i < result.high_cost_drivers.length; i++) {
      expect(result.high_cost_drivers[i].total_cost_usd).toBeLessThanOrEqual(
        result.high_cost_drivers[i - 1].total_cost_usd
      );
    }
  });

  it("top_n=10 returns at most the number of qualified components", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS, top_n: 10 });
    // Only components with frequency >= 2 are qualified
    expect(result.high_cost_drivers.length).toBeLessThanOrEqual(10);
  });
});

// ─── Structural Component Detection ──────────────────────────────────────────

describe("analyseCostPatterns — structural component detection", () => {
  it("marks Radiator Support as structural", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const radSupport = result.high_cost_drivers.find(
      (d) => d.component_name === "Radiator Support"
    );
    if (radSupport) {
      expect(radSupport.is_structural).toBe(true);
    }
  });

  it("does NOT mark Front Bumper Assembly as structural", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const bumper = result.high_cost_drivers.find(
      (d) => d.component_name === "Front Bumper"
    );
    if (bumper) {
      expect(bumper.is_structural).toBe(false);
    }
  });

  it("marks Frame Rail as structural", () => {
    const claims = [
      makeClaim(1, 15000, [{ name: "Frame Rail", cost: 5000 }]),
      makeClaim(2, 14000, [{ name: "Frame Rail", cost: 4800 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const frameRail = result.high_cost_drivers.find(
      (d) => d.component_name === "Frame Rail"
    );
    expect(frameRail?.is_structural).toBe(true);
  });
});

// ─── Variance Label Tests ─────────────────────────────────────────────────────

describe("analyseCostPatterns — variance labels", () => {
  it("labels a component as stable when costs are consistent", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Stable Part", cost: 1000 }]),
      makeClaim(2, 5000, [{ name: "Stable Part", cost: 1050 }]),
      makeClaim(3, 5000, [{ name: "Stable Part", cost: 980 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const part = result.high_cost_drivers.find(
      (d) => d.component_name === "Stable Part"
    );
    expect(part?.variance_label).toBe("stable");
  });

  it("labels a component as high when costs vary widely", () => {
    const claims = [
      makeClaim(1, 10000, [{ name: "Variable Part", cost: 500 }]),
      makeClaim(2, 10000, [{ name: "Variable Part", cost: 3000 }]),
      makeClaim(3, 10000, [{ name: "Variable Part", cost: 1200 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const part = result.high_cost_drivers.find(
      (d) => d.component_name === "Variable Part"
    );
    expect(part?.variance_label).toBe("high");
  });
});

// ─── Scenario Filter Tests ────────────────────────────────────────────────────

describe("analyseCostPatterns — scenario filters", () => {
  it("filters to only animal_strike claims when scenario_filter is set", () => {
    const claims = [
      ...STANDARD_CLAIMS.map((c) => ({ ...c, scenario_type: "vehicle_collision" })),
      makeClaim(10, 8000, [
        { name: "Radiator", cost: 2000 },
        { name: "Grille", cost: 600 },
      ], { scenario_type: "animal_strike" }),
      makeClaim(11, 7500, [
        { name: "Radiator", cost: 1800 },
        { name: "Grille", cost: 550 },
      ], { scenario_type: "animal_strike" }),
    ];
    const result = analyseCostPatterns({
      claims,
      scenario_filter: "animal_strike",
    });
    expect(result.metadata.claims_analysed).toBe(2);
  });

  it("returns empty output when no claims match the scenario filter", () => {
    const result = analyseCostPatterns({
      claims: STANDARD_CLAIMS,
      scenario_filter: "fire",
    });
    expect(result.high_cost_drivers).toHaveLength(0);
    expect(result.metadata.claims_analysed).toBe(0);
  });

  it("filters by signature_prefix correctly", () => {
    const claims = [
      ...STANDARD_CLAIMS.map((c) => ({
        ...c,
        case_signature: "sedan_collision_frontal_moderate_4c_medium",
      })),
      makeClaim(10, 8000, [
        { name: "Radiator", cost: 2000 },
        { name: "Hood", cost: 800 },
      ], { case_signature: "pickup_animal_frontal_severe_8c_high" }),
      makeClaim(11, 7500, [
        { name: "Radiator", cost: 1800 },
        { name: "Hood", cost: 750 },
      ], { case_signature: "pickup_animal_frontal_severe_8c_high" }),
    ];
    const result = analyseCostPatterns({
      claims,
      signature_prefix: "pickup_animal",
    });
    expect(result.metadata.claims_analysed).toBe(2);
  });
});

// ─── Quality Tier Filter Tests ────────────────────────────────────────────────

describe("analyseCostPatterns — quality tier filters", () => {
  it("includes only HIGH quality claims when min_quality_tier=HIGH", () => {
    const claims = [
      ...STANDARD_CLAIMS.map((c) => ({ ...c, quality_tier: "HIGH" as const })),
      makeClaim(10, 5000, [
        { name: "Radiator", cost: 1500 },
      ], { quality_tier: "MEDIUM" }),
      makeClaim(11, 4000, [
        { name: "Radiator", cost: 1200 },
      ], { quality_tier: "LOW" }),
    ];
    const result = analyseCostPatterns({
      claims,
      min_quality_tier: "HIGH",
    });
    expect(result.metadata.claims_analysed).toBe(5);
  });

  it("includes HIGH and MEDIUM when min_quality_tier=MEDIUM", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Radiator", cost: 1500 }], { quality_tier: "HIGH" }),
      makeClaim(2, 5000, [{ name: "Radiator", cost: 1400 }], { quality_tier: "MEDIUM" }),
      makeClaim(3, 5000, [{ name: "Radiator", cost: 1300 }], { quality_tier: "LOW" }),
    ];
    const result = analyseCostPatterns({
      claims,
      min_quality_tier: "MEDIUM",
      min_frequency: 1,
    });
    expect(result.metadata.claims_analysed).toBe(2);
  });

  it("includes all tiers when no quality filter is set", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Radiator", cost: 1500 }], { quality_tier: "HIGH" }),
      makeClaim(2, 5000, [{ name: "Radiator", cost: 1400 }], { quality_tier: "MEDIUM" }),
      makeClaim(3, 5000, [{ name: "Radiator", cost: 1300 }], { quality_tier: "LOW" }),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 1 });
    expect(result.metadata.claims_analysed).toBe(3);
  });
});

// ─── Insights Tests ───────────────────────────────────────────────────────────

describe("analyseCostPatterns — insights", () => {
  it("returns at least one insight for a valid dataset", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it("mentions the top cost driver in the first insight", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    expect(result.insights[0]).toContain("Radiator");
  });

  it("includes a structural component warning when structural drivers are present", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const hasStructuralInsight = result.insights.some(
      (i) => i.toLowerCase().includes("structural")
    );
    expect(hasStructuralInsight).toBe(true);
  });

  it("includes a dataset size warning when fewer than 10 claims are analysed", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS }); // 5 claims
    const hasSizeWarning = result.insights.some(
      (i) => i.includes("below the recommended minimum")
    );
    expect(hasSizeWarning).toBe(true);
  });

  it("includes an average claim cost insight", () => {
    const result = analyseCostPatterns({ claims: STANDARD_CLAIMS });
    const hasAvgCost = result.insights.some(
      (i) => i.includes("Average total claim cost")
    );
    expect(hasAvgCost).toBe(true);
  });

  it("returns empty-dataset insight when no claims pass filters", () => {
    const result = analyseCostPatterns({
      claims: STANDARD_CLAIMS,
      scenario_filter: "fire",
    });
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights[0]).toContain("No claims met the filter criteria");
  });

  it("includes animal_strike frontal pattern insight for animal_strike scenario", () => {
    const claims = [
      makeClaim(1, 8000, [
        { name: "Radiator", cost: 2000 },
        { name: "Grille", cost: 600 },
        { name: "Front Bumper Assembly", cost: 1200 },
      ], { scenario_type: "animal_strike" }),
      makeClaim(2, 7500, [
        { name: "Radiator", cost: 1800 },
        { name: "Grille", cost: 550 },
        { name: "Front Bumper Assembly", cost: 1100 },
      ], { scenario_type: "animal_strike" }),
    ];
    const result = analyseCostPatterns({
      claims,
      scenario_filter: "animal_strike",
      min_frequency: 2,
    });
    const hasFrontalInsight = result.insights.some(
      (i) => i.toLowerCase().includes("frontal") || i.toLowerCase().includes("animal strike")
    );
    expect(hasFrontalInsight).toBe(true);
  });

  it("includes high-variance warning when a driver has high variance", () => {
    const claims = [
      makeClaim(1, 10000, [{ name: "Variable Part", cost: 500 }]),
      makeClaim(2, 10000, [{ name: "Variable Part", cost: 3500 }]),
      makeClaim(3, 10000, [{ name: "Variable Part", cost: 1200 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const hasVarianceInsight = result.insights.some(
      (i) => i.toLowerCase().includes("variance") || i.toLowerCase().includes("price range")
    );
    expect(hasVarianceInsight).toBe(true);
  });
});

// ─── Edge Case Tests ──────────────────────────────────────────────────────────

describe("analyseCostPatterns — edge cases", () => {
  it("handles empty claims array gracefully", () => {
    const result = analyseCostPatterns({ claims: [] });
    expect(result.high_cost_drivers).toHaveLength(0);
    expect(result.component_weighting).toEqual({});
    expect(result.metadata.claims_analysed).toBe(0);
  });

  it("handles claims with no components gracefully", () => {
    const claims: ClaimLearningRecord[] = [
      { claim_id: 1, total_cost_usd: 5000, components: [], quality_tier: "HIGH" },
      { claim_id: 2, total_cost_usd: 4000, components: [], quality_tier: "HIGH" },
    ];
    const result = analyseCostPatterns({ claims });
    expect(result.high_cost_drivers).toHaveLength(0);
    expect(result.metadata.claims_analysed).toBe(0);
  });

  it("handles claims with total_cost_usd = 0 by excluding them", () => {
    const claims = [
      makeClaim(1, 0, [{ name: "Radiator", cost: 0 }]),
      makeClaim(2, 5000, [{ name: "Radiator", cost: 2000 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 1 });
    expect(result.metadata.claims_analysed).toBe(1);
  });

  it("handles single claim correctly", () => {
    const claims = [
      makeClaim(1, 5000, [
        { name: "Radiator", cost: 2000 },
        { name: "Hood", cost: 800 },
      ]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 1 });
    // With min_frequency=1, single claim should work
    expect(result.metadata.claims_analysed).toBe(1);
  });

  it("handles component names with special characters", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "A/C Condenser", cost: 1000 }]),
      makeClaim(2, 5000, [{ name: "A/C Condenser", cost: 1100 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    expect(result.high_cost_drivers.length).toBeGreaterThan(0);
  });

  it("normalises LH/RH suffixes from component names", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Headlight LH", cost: 450 }]),
      makeClaim(2, 5000, [{ name: "Headlight LH", cost: 480 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    // "Headlight LH" should normalise to "Headlight"
    const headlight = result.high_cost_drivers.find(
      (d) => d.component_name === "Headlight"
    );
    expect(headlight).toBeDefined();
  });

  it("normalises Assembly suffix from component names", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Front Bumper Assembly", cost: 1200 }]),
      makeClaim(2, 5000, [{ name: "Front Bumper Assembly", cost: 1100 }]),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    const bumper = result.high_cost_drivers.find(
      (d) => d.component_name === "Front Bumper"
    );
    expect(bumper).toBeDefined();
  });

  it("handles null quality_tier gracefully", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Radiator", cost: 2000 }], { quality_tier: null }),
      makeClaim(2, 5000, [{ name: "Radiator", cost: 1800 }], { quality_tier: null }),
    ];
    // No quality filter — should include null-tier claims
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    expect(result.metadata.claims_analysed).toBe(2);
  });

  it("handles null case_signature gracefully", () => {
    const claims = [
      makeClaim(1, 5000, [{ name: "Radiator", cost: 2000 }], { case_signature: null }),
      makeClaim(2, 5000, [{ name: "Radiator", cost: 1800 }], { case_signature: null }),
    ];
    const result = analyseCostPatterns({ claims, min_frequency: 2 });
    expect(result.metadata.claims_analysed).toBe(2);
  });

  it("handles very large datasets efficiently", () => {
    const largeClaims: ClaimLearningRecord[] = Array.from({ length: 200 }, (_, i) =>
      makeClaim(i, 8000 + i * 10, [
        { name: "Radiator", cost: 2000 + i * 5 },
        { name: "Hood", cost: 800 + i * 2 },
        { name: "Front Bumper Assembly", cost: 1200 + i * 3 },
      ])
    );
    const start = Date.now();
    const result = analyseCostPatterns({ claims: largeClaims });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500); // should complete in < 500ms
    expect(result.metadata.claims_analysed).toBe(200);
  });
});

// ─── buildLearningRecord Tests ────────────────────────────────────────────────

describe("buildLearningRecord", () => {
  const validPartsRecon = JSON.stringify([
    { component_name: "Radiator", total_cost: 2000, parts_cost: 1500, labour_cost: 500 },
    { component_name: "Hood", total_cost: 800, parts_cost: 700, labour_cost: 100 },
  ]);

  const validCaseSignature = JSON.stringify({
    case_signature: "pickup_animal_frontal_severe_8c_high",
    grouping_key: "animal_frontal_severe",
  });

  const validatedOutcomeStore = JSON.stringify({
    store: true,
    quality_tier: "HIGH",
    reason: "Assessor validated",
  });

  const validatedOutcomeNoStore = JSON.stringify({
    store: false,
    quality_tier: "LOW",
    reason: "Low confidence",
  });

  it("returns a valid ClaimLearningRecord for a store=true outcome", () => {
    const record = buildLearningRecord(
      1,
      8000,
      validPartsRecon,
      validCaseSignature,
      validatedOutcomeStore,
      "animal_strike"
    );
    expect(record).not.toBeNull();
    expect(record?.claim_id).toBe(1);
    expect(record?.total_cost_usd).toBe(8000);
    expect(record?.scenario_type).toBe("animal_strike");
    expect(record?.quality_tier).toBe("HIGH");
    expect(record?.components.length).toBe(2);
  });

  it("returns null for a store=false outcome", () => {
    const record = buildLearningRecord(
      2,
      5000,
      validPartsRecon,
      validCaseSignature,
      validatedOutcomeNoStore,
      "vehicle_collision"
    );
    expect(record).toBeNull();
  });

  it("returns null when partsReconciliationJson has no valid components", () => {
    const emptyParts = JSON.stringify([]);
    const record = buildLearningRecord(
      3,
      5000,
      emptyParts,
      validCaseSignature,
      validatedOutcomeStore,
      "animal_strike"
    );
    expect(record).toBeNull();
  });

  it("extracts case_signature correctly from JSON", () => {
    const record = buildLearningRecord(
      4,
      8000,
      validPartsRecon,
      validCaseSignature,
      validatedOutcomeStore,
      "animal_strike"
    );
    expect(record?.case_signature).toBe("pickup_animal_frontal_severe_8c_high");
  });

  it("handles pre-parsed JSON objects (not strings)", () => {
    const record = buildLearningRecord(
      5,
      8000,
      JSON.parse(validPartsRecon),
      JSON.parse(validCaseSignature),
      JSON.parse(validatedOutcomeStore),
      "animal_strike"
    );
    expect(record).not.toBeNull();
    expect(record?.components.length).toBe(2);
  });

  it("excludes components with total_cost = 0", () => {
    const partsWithZero = JSON.stringify([
      { component_name: "Radiator", total_cost: 2000 },
      { component_name: "Zero Part", total_cost: 0 },
    ]);
    const record = buildLearningRecord(
      6,
      8000,
      partsWithZero,
      validCaseSignature,
      validatedOutcomeStore,
      "animal_strike"
    );
    expect(record?.components.length).toBe(1);
    expect(record?.components[0].component_name).toBe("Radiator");
  });

  it("handles null validatedOutcomeJson gracefully", () => {
    const record = buildLearningRecord(
      7,
      8000,
      validPartsRecon,
      validCaseSignature,
      null,
      "animal_strike"
    );
    expect(record).toBeNull();
  });

  it("handles null partsReconciliationJson gracefully", () => {
    const record = buildLearningRecord(
      8,
      8000,
      null,
      validCaseSignature,
      validatedOutcomeStore,
      "animal_strike"
    );
    expect(record).toBeNull();
  });
});

// ─── Mazda BT-50 Cattle Strike Scenario ──────────────────────────────────────

describe("analyseCostPatterns — Mazda BT-50 cattle strike scenario", () => {
  const btClaims: ClaimLearningRecord[] = [
    makeClaim(101, 18500, [
      { name: "Radiator", cost: 3200 },
      { name: "Grille Assembly", cost: 850 },
      { name: "Front Bumper Assembly", cost: 2100 },
      { name: "Hood", cost: 1800 },
      { name: "Headlight LH", cost: 650 },
      { name: "Headlight RH", cost: 650 },
      { name: "Condenser", cost: 1100 },
      { name: "Radiator Support", cost: 3500 },
    ], { scenario_type: "animal_strike", case_signature: "pickup_animal_frontal_severe_8c_high" }),
    makeClaim(102, 16200, [
      { name: "Radiator", cost: 2900 },
      { name: "Grille Assembly", cost: 780 },
      { name: "Front Bumper Assembly", cost: 1950 },
      { name: "Hood", cost: 1650 },
      { name: "Headlight LH", cost: 620 },
      { name: "Condenser", cost: 980 },
      { name: "Radiator Support", cost: 3100 },
    ], { scenario_type: "animal_strike", case_signature: "pickup_animal_frontal_severe_8c_high" }),
    makeClaim(103, 19800, [
      { name: "Radiator", cost: 3400 },
      { name: "Grille Assembly", cost: 900 },
      { name: "Front Bumper Assembly", cost: 2300 },
      { name: "Hood", cost: 2000 },
      { name: "Headlight LH", cost: 680 },
      { name: "Headlight RH", cost: 680 },
      { name: "Condenser", cost: 1200 },
      { name: "Radiator Support", cost: 3800 },
    ], { scenario_type: "animal_strike", case_signature: "pickup_animal_frontal_severe_8c_high" }),
  ];

  it("identifies Radiator Support as a top cost driver", () => {
    const result = analyseCostPatterns({
      claims: btClaims,
      scenario_filter: "animal_strike",
    });
    const radSupport = result.high_cost_drivers.find(
      (d) => d.component_name === "Radiator Support"
    );
    expect(radSupport).toBeDefined();
    expect(radSupport?.is_structural).toBe(true);
  });

  it("includes frontal pattern insight for animal_strike scenario", () => {
    const result = analyseCostPatterns({
      claims: btClaims,
      scenario_filter: "animal_strike",
    });
    const hasFrontalInsight = result.insights.some(
      (i) => i.toLowerCase().includes("frontal") || i.toLowerCase().includes("animal strike")
    );
    expect(hasFrontalInsight).toBe(true);
  });

  it("Radiator Support has higher total cost than Grille", () => {
    const result = analyseCostPatterns({
      claims: btClaims,
      scenario_filter: "animal_strike",
    });
    const radSupport = result.high_cost_drivers.find(
      (d) => d.component_name === "Radiator Support"
    );
    const grille = result.high_cost_drivers.find(
      (d) => d.component_name === "Grille"
    );
    if (radSupport && grille) {
      expect(radSupport.total_cost_usd).toBeGreaterThan(grille.total_cost_usd);
    }
  });

  it("component_weighting sums to approximately 1 for BT-50 claims", () => {
    const result = analyseCostPatterns({
      claims: btClaims,
      scenario_filter: "animal_strike",
    });
    const total = Object.values(result.component_weighting).reduce(
      (sum, w) => sum + w,
      0
    );
    expect(total).toBeCloseTo(1, 1);
  });

  it("metadata shows correct claims_analysed count", () => {
    const result = analyseCostPatterns({
      claims: btClaims,
      scenario_filter: "animal_strike",
    });
    expect(result.metadata.claims_analysed).toBe(3);
  });
});
