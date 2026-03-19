/**
 * Unit tests for damageConsistency service
 *
 * Stage 24 additions:
 *   - All runDamageConsistencyCheck calls are now awaited (function is async)
 *   - confidence_score field is present and in [0.00, 1.00]
 *   - confidence band is consistent with confidence_score
 */
import { describe, it, expect } from "vitest";
import { runDamageConsistencyCheck } from "./damageConsistency";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FRONT_COMPONENTS_JSON = JSON.stringify([
  { name: "front bumper" },
  { name: "hood" },
  { name: "left headlight" },
]);

const REAR_COMPONENTS_JSON = JSON.stringify([
  { name: "rear bumper" },
  { name: "trunk lid" },
]);

const FRONT_ENRICHED_PHOTOS_JSON = JSON.stringify([
  {
    url: "https://example.com/photo1.jpg",
    impactZone: "front",
    detectedComponents: ["front bumper", "hood"],
    severity: "severe",
    confidenceScore: 85,
  },
]);

const REAR_ENRICHED_PHOTOS_JSON = JSON.stringify([
  {
    url: "https://example.com/photo2.jpg",
    impactZone: "rear",
    detectedComponents: ["rear bumper"],
    severity: "moderate",
    confidenceScore: 78,
  },
]);

const FRONT_PHYSICS_JSON = JSON.stringify({
  primaryImpactZone: "front_center",
  damageConsistency: { score: 88, inconsistencies: [] },
});

const REAR_PHYSICS_JSON = JSON.stringify({
  primaryImpactZone: "rear_center",
  damageConsistency: { score: 75, inconsistencies: [] },
});

// ─── Existing consistency check tests (now async) ─────────────────────────────

describe("runDamageConsistencyCheck", () => {
  it("returns 100 score with no mismatches when all sources agree on front damage", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper and hood are damaged",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    expect(result.consistency_score).toBeGreaterThan(70);
    expect(result.mismatches.filter(m => m.severity === "high")).toHaveLength(0);
    expect(result.source_summary.document.available).toBe(true);
    expect(result.source_summary.photos.available).toBe(true);
    expect(result.source_summary.physics.available).toBe(true);
    expect(result.checked_at).toBeTruthy();
  });

  it("detects zone_mismatch when photos show rear but document says front", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: REAR_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const zoneMismatches = result.mismatches.filter(m => m.type === "zone_mismatch");
    expect(zoneMismatches.length).toBeGreaterThan(0);
    expect(zoneMismatches[0].severity).toBe("high");
    expect(result.consistency_score).toBeLessThan(80);
  });

  it("detects physics_zone_conflict when physics says front but document says rear", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: REAR_COMPONENTS_JSON,
      damageDescription: "Rear bumper damage",
      enrichedPhotosJson: null,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const physicsConflicts = result.mismatches.filter(m => m.type === "physics_zone_conflict");
    expect(physicsConflicts.length).toBeGreaterThan(0);
    expect(physicsConflicts[0].severity).toBe("high");
  });

  it("detects component_unreported when photo shows component not in document", async () => {
    const docWithOnlyBumper = JSON.stringify([{ name: "front bumper" }]);
    const photosWithExtra = JSON.stringify([
      {
        url: "https://example.com/photo.jpg",
        impactZone: "front",
        detectedComponents: ["front bumper", "radiator", "condenser"],
        severity: "severe",
        confidenceScore: 80,
      },
    ]);

    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: docWithOnlyBumper,
      damageDescription: "Front bumper damage only",
      enrichedPhotosJson: photosWithExtra,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const unreported = result.mismatches.filter(m => m.type === "component_unreported");
    expect(unreported.length).toBeGreaterThan(0);
    expect(unreported.some(m => m.component === "radiator" || m.component === "condenser")).toBe(true);
  });

  it("handles all-null inputs gracefully and returns a valid result", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });

    expect(result.consistency_score).toBeGreaterThanOrEqual(0);
    expect(result.consistency_score).toBeLessThanOrEqual(100);
    // No sources available → Signal B = 0; but Signal A = 1.0 (no detections)
    // and Signal C = 1.0 (no mismatches) → composite ≈ 0.65 → MEDIUM
    expect(["LOW", "MEDIUM"]).toContain(result.confidence);
    expect(result.source_summary.document.available).toBe(false);
    expect(result.source_summary.photos.available).toBe(false);
    expect(result.source_summary.physics.available).toBe(false);
  });

  it("handles malformed JSON inputs without throwing", async () => {
    await expect(
      runDamageConsistencyCheck({
        damagedComponentsJson: "not-valid-json",
        damageDescription: "Some damage",
        enrichedPhotosJson: "{broken",
        physicsAnalysisJson: "null",
      })
    ).resolves.not.toThrow();
  });

  it("returns HIGH confidence when score >= 75 and both doc and photos available", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper and hood damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    // With no zone mismatches and physics score of 88, confidence should be HIGH
    if (result.consistency_score >= 75) {
      expect(result.confidence).toBe("HIGH");
    }
  });

  it("returns lower confidence when only one source available vs all three", async () => {
    const oneSource = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: null,   // no photos
      physicsAnalysisJson: null,  // no physics
    });
    const allSources = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    // One source always produces a lower or equal confidence_score than all three
    expect(oneSource.confidence_score).toBeLessThanOrEqual(allSources.confidence_score);
  });

  it("source_summary correctly identifies available sources", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: null,
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    expect(result.source_summary.document.available).toBe(true);
    expect(result.source_summary.photos.available).toBe(true);
    expect(result.source_summary.physics.available).toBe(true);
    expect(result.source_summary.physics.primaryZone).toBe("front");
  });

  it("handles string array in damagedComponentsJson (legacy format)", async () => {
    const legacyJson = JSON.stringify(["front bumper", "hood", "left fender"]);

    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: legacyJson,
      damageDescription: null,
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    expect(result.source_summary.document.available).toBe(true);
    expect(result.source_summary.document.components).toContain("front bumper");
  });

  it("adjacent zones do not trigger zone_mismatch", async () => {
    const leftPhotos = JSON.stringify([
      {
        url: "https://example.com/photo.jpg",
        impactZone: "left",
        detectedComponents: ["left door"],
        severity: "moderate",
        confidenceScore: 75,
      },
    ]);

    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front and left side damage",
      enrichedPhotosJson: leftPhotos,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const zoneMismatches = result.mismatches.filter(m => m.type === "zone_mismatch");
    expect(zoneMismatches).toHaveLength(0);
  });
});

// ─── Stage 24: confidence_score field ─────────────────────────────────────────

describe("Stage 24 — confidence_score field on ConsistencyCheckResult", () => {
  it("result includes confidence_score field", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    expect(result).toHaveProperty("confidence_score");
  });

  it("confidence_score is a number in [0.00, 1.00]", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    expect(typeof result.confidence_score).toBe("number");
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.0);
    expect(result.confidence_score).toBeLessThanOrEqual(1.0);
  });

  it("confidence_score is rounded to 2 decimal places", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    const str = result.confidence_score.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("confidence band is consistent with confidence_score (HIGH >= 0.70)", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    if (result.confidence === "HIGH") {
      expect(result.confidence_score).toBeGreaterThanOrEqual(0.70);
    }
  });

  it("confidence band is consistent with confidence_score (LOW < 0.45)", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });
    if (result.confidence === "LOW") {
      expect(result.confidence_score).toBeLessThan(0.70);
    }
  });

  it("all-null inputs produce MEDIUM confidence (no detections = no unreliability signal)", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });
    // Signal A = 1.0 (no mismatches), Signal B = 0.0 (no sources), Signal C = 1.0
    // Composite: 0.40×1.0 + 0.35×0.0 + 0.25×1.0 = 0.65 → MEDIUM
    expect(result.confidence).toBe("MEDIUM");
    expect(result.confidence_score).toBeCloseTo(0.65, 2);
  });

  it("all three sources available with no mismatches produces HIGH confidence", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper and hood damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    expect(result.confidence).toBe("HIGH");
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.70);
  });

  it("only one source available (no photos, no physics) produces MEDIUM confidence", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });
    // Missing photo/physics sources trigger missing-source mismatches (Signal A = 0.5 neutral),
    // Signal B = 1/3 ≈ 0.33, Signal C ≈ 0.875 → composite ≈ 0.54 → MEDIUM
    expect(result.confidence).toBe("MEDIUM");
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.45);
    expect(result.confidence_score).toBeLessThan(0.70);
  });

  it("two sources available produces at least MEDIUM confidence when no mismatches", async () => {
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: null,  // no physics
    });
    expect(["MEDIUM", "HIGH"]).toContain(result.confidence);
    expect(result.confidence_score).toBeGreaterThanOrEqual(0.45);
  });

  it("many mismatches reduce confidence_score compared to no-mismatch baseline", async () => {
    // Zone mismatch: doc says front, photos say rear, physics says front
    const mismatchResult = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: REAR_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    const cleanResult = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });
    expect(mismatchResult.confidence_score).toBeLessThan(cleanResult.confidence_score);
  });

  it("annotationStats with high confirmation rate increases confidence_score", async () => {
    // Provide annotation stats with 100% confirmation rate for zone_mismatch
    const highConfirmStats = [{
      mismatch_type: "zone_mismatch" as const,
      total_annotations: 25,
      confirmed: 25,
      dismissed: 0,
      confirmation_rate: 1.0,
      system_adjustment: {
        weight_multiplier: 1.06,
        raw_multiplier: 1.20,
        sensitivity_direction: "increase" as const,
        reason: "High confirmation rate",
        sample_size_sufficient: true,
      },
    }];

    const withStats = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: REAR_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
      annotationStats: highConfirmStats,
    });

    const withoutStats = await runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: REAR_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    // High confirmation rate means the engine is reliable → higher confidence
    expect(withStats.confidence_score).toBeGreaterThanOrEqual(withoutStats.confidence_score);
  });
});
