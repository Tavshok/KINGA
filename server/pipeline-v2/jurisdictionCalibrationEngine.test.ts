/**
 * jurisdictionCalibrationEngine.test.ts
 *
 * Comprehensive test suite for the Jurisdiction Calibration Engine.
 * Covers all resolution methods, confidence scoring, edge cases,
 * batch processing, and summary aggregation.
 */

import { describe, it, expect } from "vitest";
import {
  determineJurisdiction,
  determineJurisdictionBatch,
  aggregateJurisdictionSummary,
  COUNTRY_PROFILES,
  type JurisdictionCalibrationInput,
} from "./jurisdictionCalibrationEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jurisdiction(input: JurisdictionCalibrationInput) {
  return determineJurisdiction(input);
}

// ─── 1. Country ISO Alpha-2 Resolution ───────────────────────────────────────

describe("Country ISO alpha-2 resolution", () => {
  it("resolves 'ZW' to Zimbabwe with confidence 95", () => {
    const r = jurisdiction({ country: "ZW" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.confidence).toBe(95);
    expect(r.resolution_method).toBe("country_iso");
    expect(r.has_country_profile).toBe(true);
    expect(r.recommended_profile).toBe("ZW_2024");
  });

  it("resolves 'ZA' to South Africa", () => {
    const r = jurisdiction({ country: "ZA" });
    expect(r.jurisdiction).toBe("ZA");
    expect(r.confidence).toBe(95);
    expect(r.resolution_method).toBe("country_iso");
    expect(r.recommended_profile).toBe("ZA_2024");
  });

  it("resolves 'KE' to Kenya", () => {
    const r = jurisdiction({ country: "KE" });
    expect(r.jurisdiction).toBe("KE");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'NG' to Nigeria", () => {
    const r = jurisdiction({ country: "NG" });
    expect(r.jurisdiction).toBe("NG");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'GB' to United Kingdom", () => {
    const r = jurisdiction({ country: "GB" });
    expect(r.jurisdiction).toBe("GB");
    expect(r.confidence).toBe(95);
    expect(r.recommended_profile).toBe("GB_2024");
  });

  it("resolves 'US' to United States", () => {
    const r = jurisdiction({ country: "US" });
    expect(r.jurisdiction).toBe("US");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'AU' to Australia", () => {
    const r = jurisdiction({ country: "AU" });
    expect(r.jurisdiction).toBe("AU");
    expect(r.confidence).toBe(95);
  });

  it("handles lowercase alpha-2 by falling through to name match", () => {
    // "zw" is 2 chars but not uppercase — should match via name/alias
    const r = jurisdiction({ country: "zw" });
    // Either resolves via name match or falls through — must not be GLOBAL
    expect(r.jurisdiction).not.toBe("GLOBAL");
  });

  it("resolves with surrounding whitespace stripped", () => {
    const r = jurisdiction({ country: "  ZW  " });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.confidence).toBe(95);
  });
});

// ─── 2. Country ISO Alpha-3 Resolution ───────────────────────────────────────

describe("Country ISO alpha-3 resolution", () => {
  it("resolves 'ZWE' to Zimbabwe", () => {
    const r = jurisdiction({ country: "ZWE" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.confidence).toBe(95);
    expect(r.resolution_method).toBe("country_iso");
  });

  it("resolves 'ZAF' to South Africa", () => {
    const r = jurisdiction({ country: "ZAF" });
    expect(r.jurisdiction).toBe("ZA");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'KEN' to Kenya", () => {
    const r = jurisdiction({ country: "KEN" });
    expect(r.jurisdiction).toBe("KE");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'NGA' to Nigeria", () => {
    const r = jurisdiction({ country: "NGA" });
    expect(r.jurisdiction).toBe("NG");
    expect(r.confidence).toBe(95);
  });

  it("resolves 'GBR' to United Kingdom", () => {
    const r = jurisdiction({ country: "GBR" });
    expect(r.jurisdiction).toBe("GB");
  });

  it("resolves 'USA' to United States", () => {
    const r = jurisdiction({ country: "USA" });
    expect(r.jurisdiction).toBe("US");
  });

  it("resolves 'AUS' to Australia", () => {
    const r = jurisdiction({ country: "AUS" });
    expect(r.jurisdiction).toBe("AU");
  });
});

// ─── 3. Country Name Resolution ───────────────────────────────────────────────

describe("Country name resolution", () => {
  it("resolves 'Zimbabwe' by name", () => {
    const r = jurisdiction({ country: "Zimbabwe" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.confidence).toBe(85);
    expect(r.resolution_method).toBe("country_name");
  });

  it("resolves 'south africa' (lowercase) by alias", () => {
    const r = jurisdiction({ country: "south africa" });
    expect(r.jurisdiction).toBe("ZA");
    expect(r.confidence).toBe(85);
  });

  it("resolves 'United Kingdom' by name", () => {
    const r = jurisdiction({ country: "United Kingdom" });
    expect(r.jurisdiction).toBe("GB");
    expect(r.confidence).toBe(85);
  });

  it("resolves 'United States' by name", () => {
    const r = jurisdiction({ country: "United States" });
    expect(r.jurisdiction).toBe("US");
    expect(r.confidence).toBe(85);
  });

  it("resolves 'kenya' (lowercase) by name", () => {
    const r = jurisdiction({ country: "kenya" });
    expect(r.jurisdiction).toBe("KE");
    expect(r.confidence).toBe(85);
  });

  it("resolves 'RSA' alias for South Africa", () => {
    const r = jurisdiction({ country: "RSA" });
    expect(r.jurisdiction).toBe("ZA");
  });

  it("resolves 'ZIM' alias for Zimbabwe", () => {
    const r = jurisdiction({ country: "ZIM" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("resolves 'ZIMB' alias for Zimbabwe", () => {
    const r = jurisdiction({ country: "ZIMB" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("resolves 'Australia' by name", () => {
    const r = jurisdiction({ country: "Australia" });
    expect(r.jurisdiction).toBe("AU");
    expect(r.confidence).toBe(85);
  });

  it("resolves 'United States of America' by alias", () => {
    const r = jurisdiction({ country: "United States of America" });
    expect(r.jurisdiction).toBe("US");
  });
});

// ─── 4. Country + Region Resolution ──────────────────────────────────────────

describe("Country + region resolution", () => {
  it("resolves ZW + Harare to ZW:harare", () => {
    const r = jurisdiction({ country: "ZW", region: "Harare" });
    expect(r.jurisdiction).toBe("ZW:harare");
    expect(r.has_region_profile).toBe(true);
    expect(r.confidence).toBe(95);
  });

  it("resolves ZW + Bulawayo to ZW:bulawayo", () => {
    const r = jurisdiction({ country: "ZW", region: "Bulawayo" });
    expect(r.jurisdiction).toBe("ZW:bulawayo");
    expect(r.has_region_profile).toBe(true);
  });

  it("resolves ZA + Gauteng to ZA:gauteng", () => {
    const r = jurisdiction({ country: "ZA", region: "Gauteng" });
    expect(r.jurisdiction).toBe("ZA:gauteng");
    expect(r.has_region_profile).toBe(true);
  });

  it("resolves ZA + Western Cape to ZA:western_cape", () => {
    const r = jurisdiction({ country: "ZA", region: "Western Cape" });
    expect(r.jurisdiction).toBe("ZA:western_cape");
  });

  it("adds warning when region is unknown for a known country", () => {
    const r = jurisdiction({ country: "ZW", region: "UnknownProvince" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain("UnknownProvince");
  });

  it("resolves KE + Nairobi to KE:nairobi", () => {
    const r = jurisdiction({ country: "KE", region: "Nairobi" });
    expect(r.jurisdiction).toBe("KE:nairobi");
  });

  it("resolves GB + London to GB:london", () => {
    const r = jurisdiction({ country: "GB", region: "London" });
    expect(r.jurisdiction).toBe("GB:london");
  });
});

// ─── 5. Region-Only Resolution ────────────────────────────────────────────────

describe("Region-only resolution (no country provided)", () => {
  it("infers ZW from region 'Harare'", () => {
    const r = jurisdiction({ region: "Harare" });
    expect(r.jurisdiction).toContain("ZW");
    expect(r.resolution_method).toBe("region");
    expect(r.confidence).toBe(70);
  });

  it("infers ZA from region 'Gauteng'", () => {
    const r = jurisdiction({ region: "Gauteng" });
    expect(r.jurisdiction).toContain("ZA");
    expect(r.resolution_method).toBe("region");
  });

  it("infers KE from region 'Nairobi'", () => {
    const r = jurisdiction({ region: "Nairobi" });
    expect(r.jurisdiction).toContain("KE");
    expect(r.resolution_method).toBe("region");
  });

  it("infers ZA from region 'KwaZulu-Natal'", () => {
    const r = jurisdiction({ region: "KwaZulu-Natal" });
    expect(r.jurisdiction).toContain("ZA");
  });

  it("falls through to location inference when region is unknown", () => {
    const r = jurisdiction({ region: "UnknownRegion", claim_location: "Harare CBD" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.resolution_method).toBe("location_inference");
  });
});

// ─── 6. Location Inference ────────────────────────────────────────────────────

describe("Location inference fallback", () => {
  it("infers ZW from 'Harare CBD'", () => {
    const r = jurisdiction({ claim_location: "Harare CBD" });
    expect(r.jurisdiction).toBe("ZW");
    expect(r.resolution_method).toBe("location_inference");
    expect(r.confidence).toBe(60);
  });

  it("infers ZW from 'Bulawayo Road'", () => {
    const r = jurisdiction({ claim_location: "Bulawayo Road" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("infers ZA from 'Johannesburg CBD'", () => {
    const r = jurisdiction({ claim_location: "Johannesburg CBD" });
    expect(r.jurisdiction).toBe("ZA");
    expect(r.resolution_method).toBe("location_inference");
  });

  it("infers KE from 'Nairobi Westlands'", () => {
    const r = jurisdiction({ claim_location: "Nairobi Westlands" });
    expect(r.jurisdiction).toBe("KE");
  });

  it("infers GB from 'London Bridge'", () => {
    const r = jurisdiction({ claim_location: "London Bridge" });
    expect(r.jurisdiction).toBe("GB");
  });

  it("infers US from 'Los Angeles freeway'", () => {
    const r = jurisdiction({ claim_location: "Los Angeles freeway" });
    expect(r.jurisdiction).toBe("US");
  });

  it("infers AU from 'Sydney Harbour area'", () => {
    const r = jurisdiction({ claim_location: "Sydney Harbour area" });
    expect(r.jurisdiction).toBe("AU");
  });

  it("adds a warning about inference when using location text", () => {
    const r = jurisdiction({ claim_location: "Harare CBD" });
    expect(r.warnings.some((w) => w.includes("inferred from location text"))).toBe(true);
  });

  it("infers ZW from 'Victoria Falls road'", () => {
    const r = jurisdiction({ claim_location: "Victoria Falls road" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("infers NG from 'Lagos Island'", () => {
    const r = jurisdiction({ claim_location: "Lagos Island" });
    expect(r.jurisdiction).toBe("NG");
  });
});

// ─── 7. Global Fallback ───────────────────────────────────────────────────────

describe("Global fallback", () => {
  it("falls back to GLOBAL when all inputs are empty", () => {
    const r = jurisdiction({});
    expect(r.jurisdiction).toBe("GLOBAL");
    expect(r.confidence).toBe(10);
    expect(r.resolution_method).toBe("global_fallback");
    expect(r.has_country_profile).toBe(false);
    expect(r.recommended_profile).toBe("GLOBAL_2024");
  });

  it("falls back to GLOBAL when all inputs are null", () => {
    const r = jurisdiction({ country: null, region: null, claim_location: null });
    expect(r.jurisdiction).toBe("GLOBAL");
    expect(r.confidence).toBe(10);
  });

  it("falls back to GLOBAL when country is unrecognised and no region/location", () => {
    const r = jurisdiction({ country: "XYZ_UNKNOWN" });
    expect(r.jurisdiction).toBe("GLOBAL");
    expect(r.confidence).toBe(10);
  });

  it("includes a warning about reduced accuracy in global fallback", () => {
    const r = jurisdiction({});
    expect(r.warnings.some((w) => w.includes("Global calibration"))).toBe(true);
  });

  it("notes missing fields in global fallback", () => {
    const r = jurisdiction({});
    expect(r.notes).toContain("country");
  });

  it("falls back to GLOBAL when only whitespace is provided", () => {
    const r = jurisdiction({ country: "   ", region: "  ", claim_location: "  " });
    expect(r.jurisdiction).toBe("GLOBAL");
  });
});

// ─── 8. Priority Order ────────────────────────────────────────────────────────

describe("Resolution priority order", () => {
  it("prefers country over region when both are provided", () => {
    const r = jurisdiction({ country: "ZW", region: "Gauteng" });
    // Gauteng is ZA, but country ZW should win
    expect(r.jurisdiction).toContain("ZW");
    expect(r.resolution_method).toBe("country_iso");
  });

  it("prefers country over location inference", () => {
    const r = jurisdiction({ country: "ZW", claim_location: "Johannesburg CBD" });
    expect(r.jurisdiction).toContain("ZW");
    expect(r.resolution_method).toBe("country_iso");
  });

  it("prefers region over location inference when country is absent", () => {
    const r = jurisdiction({ region: "Harare", claim_location: "Johannesburg CBD" });
    // Harare → ZW, Johannesburg → ZA; region wins
    expect(r.jurisdiction).toContain("ZW");
    expect(r.resolution_method).toBe("region");
  });

  it("falls to location inference when country and region both fail", () => {
    const r = jurisdiction({ country: "UNKNOWN", region: "UNKNOWN", claim_location: "Nairobi CBD" });
    expect(r.jurisdiction).toBe("KE");
    expect(r.resolution_method).toBe("location_inference");
  });
});

// ─── 9. Confidence Scoring ────────────────────────────────────────────────────

describe("Confidence scoring", () => {
  it("ISO alpha-2 match → confidence 95", () => {
    expect(jurisdiction({ country: "ZW" }).confidence).toBe(95);
  });

  it("ISO alpha-3 match → confidence 95", () => {
    expect(jurisdiction({ country: "ZWE" }).confidence).toBe(95);
  });

  it("Country name match → confidence 85", () => {
    expect(jurisdiction({ country: "Zimbabwe" }).confidence).toBe(85);
  });

  it("Region match → confidence 70", () => {
    expect(jurisdiction({ region: "Harare" }).confidence).toBe(70);
  });

  it("Location inference (high confidence keyword) → confidence 60", () => {
    const r = jurisdiction({ claim_location: "Harare CBD" });
    expect(r.confidence).toBe(60);
  });

  it("Global fallback → confidence 10", () => {
    expect(jurisdiction({}).confidence).toBe(10);
  });
});

// ─── 10. Output Shape ─────────────────────────────────────────────────────────

describe("Output shape", () => {
  it("always returns all required fields", () => {
    const r = jurisdiction({ country: "ZW" });
    expect(r).toHaveProperty("jurisdiction");
    expect(r).toHaveProperty("confidence");
    expect(r).toHaveProperty("notes");
    expect(r).toHaveProperty("resolution_method");
    expect(r).toHaveProperty("has_country_profile");
    expect(r).toHaveProperty("has_region_profile");
    expect(r).toHaveProperty("recommended_profile");
    expect(r).toHaveProperty("warnings");
    expect(Array.isArray(r.warnings)).toBe(true);
  });

  it("notes is a non-empty string", () => {
    const r = jurisdiction({ country: "ZW" });
    expect(typeof r.notes).toBe("string");
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("confidence is between 0 and 100", () => {
    const cases: JurisdictionCalibrationInput[] = [
      { country: "ZW" },
      { country: "Zimbabwe" },
      { region: "Harare" },
      { claim_location: "Harare CBD" },
      {},
    ];
    for (const c of cases) {
      const r = jurisdiction(c);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });
});

// ─── 11. COUNTRY_PROFILES Data Integrity ─────────────────────────────────────

describe("COUNTRY_PROFILES data integrity", () => {
  it("all profiles have required fields", () => {
    for (const [code, profile] of Object.entries(COUNTRY_PROFILES)) {
      expect(typeof profile.name).toBe("string");
      expect(Array.isArray(profile.aliases)).toBe(true);
      expect(typeof profile.alpha3).toBe("string");
      expect(profile.alpha3.length).toBe(3);
      expect(typeof profile.currency).toBe("string");
      expect(typeof profile.profile_id).toBe("string");
      expect(code.length).toBe(2);
    }
  });

  it("Zimbabwe profile has expected regions", () => {
    const zw = COUNTRY_PROFILES["ZW"];
    expect(zw.regions).toContain("harare");
    expect(zw.regions).toContain("bulawayo");
    expect(zw.regions).toContain("masvingo");
  });

  it("South Africa profile has expected regions", () => {
    const za = COUNTRY_PROFILES["ZA"];
    expect(za.regions).toContain("gauteng");
    expect(za.regions).toContain("western cape");
  });
});

// ─── 12. Batch Processing ─────────────────────────────────────────────────────

describe("Batch processing", () => {
  it("processes multiple claims and returns correct count", () => {
    const inputs = [
      { claim_id: 1, country: "ZW" },
      { claim_id: 2, country: "ZA" },
      { claim_id: 3, region: "Nairobi" },
      { claim_id: 4, claim_location: "Lagos Island" },
      { claim_id: 5 },
    ];
    const results = determineJurisdictionBatch(inputs);
    expect(results.length).toBe(5);
  });

  it("preserves claim_id in batch results", () => {
    const inputs = [
      { claim_id: 42, country: "ZW" },
      { claim_id: "CLM-001", country: "KE" },
    ];
    const results = determineJurisdictionBatch(inputs);
    expect(results[0].claim_id).toBe(42);
    expect(results[1].claim_id).toBe("CLM-001");
  });

  it("each result has a valid JurisdictionCalibrationResult", () => {
    const inputs = [{ claim_id: 1, country: "ZW" }, { claim_id: 2 }];
    const results = determineJurisdictionBatch(inputs);
    for (const r of results) {
      expect(r.result).toHaveProperty("jurisdiction");
      expect(r.result).toHaveProperty("confidence");
      expect(r.result).toHaveProperty("notes");
    }
  });

  it("handles empty batch", () => {
    const results = determineJurisdictionBatch([]);
    expect(results).toEqual([]);
  });
});

// ─── 13. Summary Aggregation ──────────────────────────────────────────────────

describe("Summary aggregation", () => {
  it("counts total correctly", () => {
    const inputs = [
      { claim_id: 1, country: "ZW" },
      { claim_id: 2, country: "ZA" },
      { claim_id: 3 },
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.total).toBe(3);
  });

  it("counts global fallback correctly", () => {
    const inputs = [
      { claim_id: 1 },
      { claim_id: 2 },
      { claim_id: 3, country: "ZW" },
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.global_fallback_count).toBe(2);
  });

  it("calculates average confidence correctly", () => {
    const inputs = [
      { claim_id: 1, country: "ZW" },  // confidence 95
      { claim_id: 2 },                  // confidence 10
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.average_confidence).toBe(Math.round((95 + 10) / 2));
  });

  it("counts by_method correctly", () => {
    const inputs = [
      { claim_id: 1, country: "ZW" },
      { claim_id: 2, country: "Zimbabwe" },
      { claim_id: 3, region: "Harare" },
      { claim_id: 4, claim_location: "Harare CBD" },
      { claim_id: 5 },
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.by_method.country_iso).toBe(1);
    expect(summary.by_method.country_name).toBe(1);
    expect(summary.by_method.region).toBe(1);
    expect(summary.by_method.location_inference).toBe(1);
    expect(summary.by_method.global_fallback).toBe(1);
  });

  it("groups by_jurisdiction correctly", () => {
    const inputs = [
      { claim_id: 1, country: "ZW" },
      { claim_id: 2, country: "ZW" },
      { claim_id: 3, country: "ZA" },
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.by_jurisdiction["ZW"]).toBe(2);
    expect(summary.by_jurisdiction["ZA"]).toBe(1);
  });

  it("counts claims_with_warnings correctly", () => {
    const inputs = [
      { claim_id: 1, country: "ZW", region: "UnknownRegion" },  // has warning
      { claim_id: 2, country: "ZW", region: "Harare" },          // no warning
    ];
    const results = determineJurisdictionBatch(inputs);
    const summary = aggregateJurisdictionSummary(results);
    expect(summary.claims_with_warnings).toBe(1);
  });

  it("returns 0 average confidence for empty batch", () => {
    const summary = aggregateJurisdictionSummary([]);
    expect(summary.average_confidence).toBe(0);
    expect(summary.total).toBe(0);
  });
});

// ─── 14. Edge Cases ───────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles very long location strings", () => {
    const longLocation = "A".repeat(1000) + " Harare CBD " + "B".repeat(1000);
    const r = jurisdiction({ claim_location: longLocation });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("handles location with special characters", () => {
    const r = jurisdiction({ claim_location: "Harare, Zimbabwe (CBD) - Near Samora Machel Ave" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("handles country with mixed case", () => {
    const r = jurisdiction({ country: "ZiMbAbWe" });
    expect(r.jurisdiction).toBe("ZW");
  });

  it("handles all three inputs pointing to different countries — country wins", () => {
    const r = jurisdiction({
      country: "ZW",
      region: "Gauteng",       // ZA region
      claim_location: "Lagos", // NG location
    });
    expect(r.jurisdiction).toContain("ZW");
  });

  it("returns has_region_profile false when only country is matched", () => {
    const r = jurisdiction({ country: "ZW" });
    expect(r.has_region_profile).toBe(false);
  });

  it("returns has_region_profile true when region is matched", () => {
    const r = jurisdiction({ country: "ZW", region: "Harare" });
    expect(r.has_region_profile).toBe(true);
  });

  it("handles numeric-like country string gracefully", () => {
    const r = jurisdiction({ country: "123" });
    expect(r.jurisdiction).toBe("GLOBAL");
  });

  it("handles empty string country", () => {
    const r = jurisdiction({ country: "" });
    expect(r.jurisdiction).toBe("GLOBAL");
  });
});
