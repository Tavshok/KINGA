/**
 * outOfDomainDetector.test.ts
 *
 * Comprehensive test suite for the Out-of-Domain Detector.
 * Covers exact matches, grouping matches, partial matches, no matches,
 * edge cases, batch processing, and summary aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  detectOutOfDomain,
  detectOutOfDomainBatch,
  aggregateOutOfDomainSummary,
  OUT_OF_DOMAIN_CONFIDENCE_CAP,
  IN_DOMAIN_CONFIDENCE,
  type SignatureRecord,
  type OutOfDomainInput,
} from "./outOfDomainDetector";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_DB: SignatureRecord[] = [
  { case_signature: "pickup_animal_frontal_severe_8c_high", count: 15 },
  { case_signature: "pickup_animal_frontal_severe_6c_high", count: 12 },
  { case_signature: "pickup_animal_frontal_moderate_5c_medium", count: 8 },
  { case_signature: "sedan_collision_rear_moderate_4c_medium", count: 22 },
  { case_signature: "sedan_collision_rear_minor_2c_low", count: 18 },
  { case_signature: "sedan_collision_frontal_severe_7c_high", count: 10 },
  { case_signature: "suv_collision_side_moderate_5c_medium", count: 14 },
  { case_signature: "suv_collision_frontal_severe_9c_high", count: 9 },
  { case_signature: "van_flood_unknown_moderate_6c_medium", count: 5 },
  { case_signature: "hatchback_theft_unknown_minor_1c_low", count: 7 },
];

function detect(input: OutOfDomainInput) {
  return detectOutOfDomain(input);
}

// ─── 1. Exact Match ───────────────────────────────────────────────────────────

describe("Exact match", () => {
  it("returns in_domain=true for an exact signature match", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.in_domain).toBe(true);
    expect(r.match_tier).toBe("exact");
  });

  it("returns confidence_cap=100 for an exact match", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.confidence_cap).toBe(IN_DOMAIN_CONFIDENCE);
  });

  it("returns the exact signature as best_match_signature", () => {
    const r = detect({
      case_signature: "sedan_collision_rear_moderate_4c_medium",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.best_match_signature).toBe("sedan_collision_rear_moderate_4c_medium");
  });

  it("returns similarity_score=1 for an exact match", () => {
    const r = detect({
      case_signature: "sedan_collision_rear_moderate_4c_medium",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.similarity_score).toBe(1);
  });

  it("match_count reflects the count field from the database record", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: SAMPLE_DB,
    });
    // count=15 for exact + count=12 for grouping match (same grouping key)
    expect(r.match_count).toBeGreaterThanOrEqual(15);
  });

  it("all token_overlap fields are true for an exact match", () => {
    const r = detect({
      case_signature: "sedan_collision_rear_minor_2c_low",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.token_overlap?.vehicle).toBe(true);
    expect(r.token_overlap?.scenario).toBe(true);
    expect(r.token_overlap?.impact).toBe(true);
    expect(r.token_overlap?.severity).toBe(true);
    expect(r.token_overlap?.component_count).toBe(true);
    expect(r.token_overlap?.cost_tier).toBe(true);
  });
});

// ─── 2. Grouping Key Match ────────────────────────────────────────────────────

describe("Grouping key match", () => {
  it("returns in_domain=true for a grouping key match (different component count)", () => {
    // "pickup_animal_frontal_severe_10c_high" — same grouping key as "pickup_animal_frontal_severe_8c_high"
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_10c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.in_domain).toBe(true);
    expect(r.match_tier).toBe("grouping");
  });

  it("returns confidence_cap=100 for a grouping key match", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_10c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.confidence_cap).toBe(IN_DOMAIN_CONFIDENCE);
  });

  it("returns in_domain=true for grouping match with different cost tier", () => {
    // "sedan_collision_rear_moderate_4c_high" — same grouping key as "sedan_collision_rear_moderate_4c_medium"
    const r = detect({
      case_signature: "sedan_collision_rear_moderate_4c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.in_domain).toBe(true);
  });

  it("reasoning mentions grouping key match", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_10c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.reasoning.toLowerCase()).toContain("grouping");
  });
});

// ─── 3. Partial Match ─────────────────────────────────────────────────────────

describe("Partial match", () => {
  it("returns in_domain=true for a high partial match (same vehicle+scenario+impact)", () => {
    // "pickup_animal_frontal_minor_3c_low" — vehicle/scenario/impact match but severity differs
    const r = detect({
      case_signature: "pickup_animal_frontal_minor_3c_low",
      known_signatures_database: SAMPLE_DB,
    });
    // scenario(0.30)+vehicle(0.15)+impact(0.15) = 0.60 ≥ 0.50 threshold
    expect(r.in_domain).toBe(true);
    expect(r.match_tier).toBe("partial");
  });

  it("returns confidence_cap=100 for a sufficient partial match", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_minor_3c_low",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.confidence_cap).toBe(IN_DOMAIN_CONFIDENCE);
  });

  it("partial match reasoning mentions similarity score", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_minor_3c_low",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.reasoning).toMatch(/\d+%/);
  });
});

// ─── 4. No Match / Out-of-Domain ─────────────────────────────────────────────

describe("No match — out-of-domain", () => {
  it("returns in_domain=false when no similar cases exist", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.in_domain).toBe(false);
  });

  it("returns confidence_cap=60 when out-of-domain", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.confidence_cap).toBe(OUT_OF_DOMAIN_CONFIDENCE_CAP);
    expect(r.confidence_cap).toBe(60);
  });

  it("returns match_tier=none when no match found", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.match_tier).toBe("none");
  });

  it("returns match_count=0 when no match found", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.match_count).toBe(0);
  });

  it("reasoning mentions confidence cap when out-of-domain", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.reasoning).toContain("60");
  });

  it("confidence_cap is never above 60 when out-of-domain", () => {
    const signatures = [
      "truck_flood_unknown_severe_15c_total_loss",
      "bus_fire_unknown_severe_20c_total_loss",
      "motorcycle_theft_unknown_minor_1c_low",
    ];
    for (const sig of signatures) {
      const r = detect({ case_signature: sig, known_signatures_database: SAMPLE_DB });
      if (!r.in_domain) {
        expect(r.confidence_cap).toBeLessThanOrEqual(60);
      }
    }
  });
});

// ─── 5. Empty / Missing Inputs ────────────────────────────────────────────────

describe("Empty and missing inputs", () => {
  it("returns in_domain=false when case_signature is null", () => {
    const r = detect({ case_signature: null, known_signatures_database: SAMPLE_DB });
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("returns in_domain=false when case_signature is undefined", () => {
    const r = detect({ case_signature: undefined, known_signatures_database: SAMPLE_DB });
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("returns in_domain=false when case_signature is empty string", () => {
    const r = detect({ case_signature: "", known_signatures_database: SAMPLE_DB });
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("returns in_domain=false when database is empty", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: [] });
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("adds warning when database is empty", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: [] });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain("empty");
  });

  it("adds warning when case_signature is missing", () => {
    const r = detect({ case_signature: null, known_signatures_database: SAMPLE_DB });
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("returns in_domain=false for unparseable signature", () => {
    const r = detect({ case_signature: "invalid_sig", known_signatures_database: SAMPLE_DB });
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("adds warning for unparseable signature", () => {
    const r = detect({ case_signature: "invalid_sig", known_signatures_database: SAMPLE_DB });
    expect(r.warnings.some((w) => w.includes("parse"))).toBe(true);
  });
});

// ─── 6. Output Shape ──────────────────────────────────────────────────────────

describe("Output shape", () => {
  it("always returns all required fields", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB });
    expect(r).toHaveProperty("in_domain");
    expect(r).toHaveProperty("confidence_cap");
    expect(r).toHaveProperty("reasoning");
    expect(r).toHaveProperty("match_count");
    expect(r).toHaveProperty("best_match_signature");
    expect(r).toHaveProperty("similarity_score");
    expect(r).toHaveProperty("match_tier");
    expect(r).toHaveProperty("token_overlap");
    expect(r).toHaveProperty("domain_coverage_vehicle");
    expect(r).toHaveProperty("domain_coverage_scenario");
    expect(r).toHaveProperty("warnings");
  });

  it("reasoning is always a non-empty string", () => {
    const cases: OutOfDomainInput[] = [
      { case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB },
      { case_signature: null, known_signatures_database: SAMPLE_DB },
      { case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: [] },
    ];
    for (const c of cases) {
      const r = detect(c);
      expect(typeof r.reasoning).toBe("string");
      expect(r.reasoning.length).toBeGreaterThan(0);
    }
  });

  it("confidence_cap is always 60 or 100", () => {
    const cases: OutOfDomainInput[] = [
      { case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB },
      { case_signature: "motorcycle_fire_unknown_severe_12c_total_loss", known_signatures_database: SAMPLE_DB },
      { case_signature: null, known_signatures_database: SAMPLE_DB },
      { case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: [] },
    ];
    for (const c of cases) {
      const r = detect(c);
      expect([60, 100]).toContain(r.confidence_cap);
    }
  });

  it("similarity_score is between 0 and 1", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB });
    expect(r.similarity_score).toBeGreaterThanOrEqual(0);
    expect(r.similarity_score).toBeLessThanOrEqual(1);
  });

  it("warnings is always an array", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB });
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});

// ─── 7. Domain Coverage ───────────────────────────────────────────────────────

describe("Domain coverage", () => {
  it("domain_coverage_vehicle is > 0 for a known vehicle type", () => {
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: SAMPLE_DB });
    expect(r.domain_coverage_vehicle).toBeGreaterThan(0);
  });

  it("domain_coverage_scenario is > 0 for a known scenario type", () => {
    const r = detect({ case_signature: "sedan_collision_rear_moderate_4c_medium", known_signatures_database: SAMPLE_DB });
    expect(r.domain_coverage_scenario).toBeGreaterThan(0);
  });

  it("domain_coverage_vehicle is 0 for an unknown vehicle type", () => {
    const r = detect({ case_signature: "motorcycle_fire_unknown_severe_12c_total_loss", known_signatures_database: SAMPLE_DB });
    expect(r.domain_coverage_vehicle).toBe(0);
  });

  it("domain_coverage_scenario is 0 for an unknown scenario type", () => {
    const r = detect({ case_signature: "motorcycle_fire_unknown_severe_12c_total_loss", known_signatures_database: SAMPLE_DB });
    expect(r.domain_coverage_scenario).toBe(0);
  });

  it("domain_coverage values are between 0 and 1", () => {
    const r = detect({ case_signature: "sedan_collision_rear_moderate_4c_medium", known_signatures_database: SAMPLE_DB });
    expect(r.domain_coverage_vehicle).toBeGreaterThanOrEqual(0);
    expect(r.domain_coverage_vehicle).toBeLessThanOrEqual(1);
    expect(r.domain_coverage_scenario).toBeGreaterThanOrEqual(0);
    expect(r.domain_coverage_scenario).toBeLessThanOrEqual(1);
  });
});

// ─── 8. Custom Thresholds ─────────────────────────────────────────────────────

describe("Custom thresholds", () => {
  it("respects min_match_threshold — requires more matches to be in-domain", () => {
    // "van_flood_unknown_moderate_6c_medium" has count=5 in SAMPLE_DB
    const r = detect({
      case_signature: "van_flood_unknown_moderate_6c_medium",
      known_signatures_database: SAMPLE_DB,
      min_match_threshold: 10, // requires 10 matches
    });
    // count=5 < threshold=10 → out-of-domain
    expect(r.in_domain).toBe(false);
    expect(r.confidence_cap).toBe(60);
  });

  it("respects min_match_threshold=1 (default) — single match is enough", () => {
    const r = detect({
      case_signature: "hatchback_theft_unknown_minor_1c_low",
      known_signatures_database: SAMPLE_DB,
      min_match_threshold: 1,
    });
    expect(r.in_domain).toBe(true);
  });

  it("respects similarity_threshold — stricter threshold rejects partial matches", () => {
    // "pickup_animal_frontal_minor_3c_low" scores ~0.60 against SAMPLE_DB
    const r = detect({
      case_signature: "pickup_animal_frontal_minor_3c_low",
      known_signatures_database: SAMPLE_DB,
      similarity_threshold: 0.95, // very strict
    });
    // With strict threshold, partial match won't count
    // grouping key won't match either (severity differs), so out-of-domain
    expect(r.confidence_cap).toBe(60);
  });
});

// ─── 9. Token Overlap ─────────────────────────────────────────────────────────

describe("Token overlap", () => {
  it("token_overlap is null when no match found", () => {
    const r = detect({
      case_signature: "motorcycle_fire_unknown_severe_12c_total_loss",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.token_overlap).toBeNull();
  });

  it("token_overlap.scenario is true when scenario matches", () => {
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.token_overlap?.scenario).toBe(true);
  });

  it("token_overlap.component_count is true when within ±2", () => {
    // incoming: 8c, db: 6c → difference is 2 → should be true
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: [{ case_signature: "pickup_animal_frontal_severe_6c_high" }],
    });
    expect(r.token_overlap?.component_count).toBe(true);
  });

  it("token_overlap.component_count is false when difference > 2", () => {
    // incoming: 8c, db: 3c → difference is 5 → should be false
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_8c_high",
      known_signatures_database: [{ case_signature: "pickup_animal_frontal_severe_3c_high" }],
    });
    expect(r.token_overlap?.component_count).toBe(false);
  });
});

// ─── 10. Batch Processing ─────────────────────────────────────────────────────

describe("Batch processing", () => {
  it("processes multiple claims and returns correct count", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },
      { claim_id: 2, case_signature: "sedan_collision_rear_moderate_4c_medium" },
      { claim_id: 3, case_signature: "motorcycle_fire_unknown_severe_12c_total_loss" },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    expect(results.length).toBe(3);
  });

  it("preserves claim_id in batch results", () => {
    const claims = [
      { claim_id: 42, case_signature: "pickup_animal_frontal_severe_8c_high" },
      { claim_id: "CLM-001", case_signature: "sedan_collision_rear_moderate_4c_medium" },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    expect(results[0].claim_id).toBe(42);
    expect(results[1].claim_id).toBe("CLM-001");
  });

  it("each result has a valid OutOfDomainResult", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },
      { claim_id: 2, case_signature: null },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    for (const r of results) {
      expect(r.result).toHaveProperty("in_domain");
      expect(r.result).toHaveProperty("confidence_cap");
      expect(r.result).toHaveProperty("reasoning");
    }
  });

  it("handles empty claims array", () => {
    const results = detectOutOfDomainBatch([], SAMPLE_DB);
    expect(results).toEqual([]);
  });

  it("passes options to each individual detection", () => {
    const claims = [
      { claim_id: 1, case_signature: "van_flood_unknown_moderate_6c_medium" },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB, { min_match_threshold: 10 });
    expect(results[0].result.in_domain).toBe(false);
  });
});

// ─── 11. Summary Aggregation ──────────────────────────────────────────────────

describe("Summary aggregation", () => {
  it("counts total correctly", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },
      { claim_id: 2, case_signature: "sedan_collision_rear_moderate_4c_medium" },
      { claim_id: 3, case_signature: "motorcycle_fire_unknown_severe_12c_total_loss" },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    const summary = aggregateOutOfDomainSummary(results);
    expect(summary.total).toBe(3);
  });

  it("counts in_domain and out_of_domain correctly", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },   // in-domain
      { claim_id: 2, case_signature: "sedan_collision_rear_moderate_4c_medium" }, // in-domain
      { claim_id: 3, case_signature: "motorcycle_fire_unknown_severe_12c_total_loss" }, // out-of-domain
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    const summary = aggregateOutOfDomainSummary(results);
    expect(summary.in_domain_count).toBe(2);
    expect(summary.out_of_domain_count).toBe(1);
  });

  it("calculates in_domain_rate correctly", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },
      { claim_id: 2, case_signature: "motorcycle_fire_unknown_severe_12c_total_loss" },
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    const summary = aggregateOutOfDomainSummary(results);
    expect(summary.in_domain_rate).toBe(0.5);
  });

  it("counts by_match_tier correctly", () => {
    const claims = [
      { claim_id: 1, case_signature: "pickup_animal_frontal_severe_8c_high" },   // exact
      { claim_id: 2, case_signature: "motorcycle_fire_unknown_severe_12c_total_loss" }, // none
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    const summary = aggregateOutOfDomainSummary(results);
    expect(summary.by_match_tier.exact).toBe(1);
    expect(summary.by_match_tier.none).toBe(1);
  });

  it("returns 0 values for empty batch", () => {
    const summary = aggregateOutOfDomainSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.in_domain_count).toBe(0);
    expect(summary.out_of_domain_count).toBe(0);
    expect(summary.in_domain_rate).toBe(0);
    expect(summary.average_similarity_score).toBe(0);
  });

  it("counts claims_with_warnings correctly", () => {
    const claims = [
      { claim_id: 1, case_signature: null },                                       // warning
      { claim_id: 2, case_signature: "pickup_animal_frontal_severe_8c_high" },     // no warning
    ];
    const results = detectOutOfDomainBatch(claims, SAMPLE_DB);
    const summary = aggregateOutOfDomainSummary(results);
    expect(summary.claims_with_warnings).toBe(1);
  });
});

// ─── 12. Edge Cases ───────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles database records with empty case_signature gracefully", () => {
    const db: SignatureRecord[] = [
      { case_signature: "" },
      { case_signature: "pickup_animal_frontal_severe_8c_high", count: 5 },
    ];
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: db });
    expect(r.in_domain).toBe(true);
    expect(r.warnings.some((w) => w.includes("empty"))).toBe(true);
  });

  it("handles database records with unparseable signatures gracefully", () => {
    const db: SignatureRecord[] = [
      { case_signature: "invalid_format" },
      { case_signature: "pickup_animal_frontal_severe_8c_high", count: 5 },
    ];
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: db });
    expect(r.in_domain).toBe(true);
  });

  it("handles a single-entry database", () => {
    const db: SignatureRecord[] = [{ case_signature: "pickup_animal_frontal_severe_8c_high", count: 1 }];
    const r = detect({ case_signature: "pickup_animal_frontal_severe_8c_high", known_signatures_database: db });
    expect(r.in_domain).toBe(true);
    expect(r.match_tier).toBe("exact");
  });

  it("handles a large database efficiently", () => {
    const db: SignatureRecord[] = Array.from({ length: 5000 }, (_, i) => ({
      case_signature: `sedan_collision_rear_moderate_${(i % 10) + 1}c_medium`,
      count: 1,
    }));
    const start = Date.now();
    const r = detect({ case_signature: "sedan_collision_rear_moderate_4c_medium", known_signatures_database: db });
    const elapsed = Date.now() - start;
    expect(r.in_domain).toBe(true);
    expect(elapsed).toBeLessThan(500); // should complete in under 500ms
  });

  it("handles whitespace in case_signature", () => {
    const r = detect({
      case_signature: "  pickup_animal_frontal_severe_8c_high  ",
      known_signatures_database: SAMPLE_DB,
    });
    expect(r.in_domain).toBe(true);
  });

  it("database records with pre-computed grouping_key are used correctly", () => {
    const db: SignatureRecord[] = [
      {
        case_signature: "pickup_animal_frontal_severe_8c_high",
        grouping_key: "pickup_animal_frontal_severe",
        count: 5,
      },
    ];
    const r = detect({
      case_signature: "pickup_animal_frontal_severe_10c_high",
      known_signatures_database: db,
    });
    expect(r.in_domain).toBe(true);
    expect(r.match_tier).toBe("grouping");
  });
});
