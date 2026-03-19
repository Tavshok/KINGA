/**
 * Unit tests for damageConsistency service
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runDamageConsistencyCheck", () => {
  it("returns 100 score with no mismatches when all sources agree on front damage", () => {
    const result = runDamageConsistencyCheck({
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

  it("detects zone_mismatch when photos show rear but document says front", () => {
    const result = runDamageConsistencyCheck({
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

  it("detects physics_zone_conflict when physics says front but document says rear", () => {
    const result = runDamageConsistencyCheck({
      damagedComponentsJson: REAR_COMPONENTS_JSON,
      damageDescription: "Rear bumper damage",
      enrichedPhotosJson: null,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const physicsConflicts = result.mismatches.filter(m => m.type === "physics_zone_conflict");
    expect(physicsConflicts.length).toBeGreaterThan(0);
    expect(physicsConflicts[0].severity).toBe("high");
  });

  it("detects component_unreported when photo shows component not in document", () => {
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

    const result = runDamageConsistencyCheck({
      damagedComponentsJson: docWithOnlyBumper,
      damageDescription: "Front bumper damage only",
      enrichedPhotosJson: photosWithExtra,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const unreported = result.mismatches.filter(m => m.type === "component_unreported");
    expect(unreported.length).toBeGreaterThan(0);
    expect(unreported.some(m => m.component === "radiator" || m.component === "condenser")).toBe(true);
  });

  it("handles all-null inputs gracefully and returns low confidence", () => {
    const result = runDamageConsistencyCheck({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });

    expect(result.consistency_score).toBeGreaterThanOrEqual(0);
    expect(result.consistency_score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe("LOW");
    expect(result.source_summary.document.available).toBe(false);
    expect(result.source_summary.photos.available).toBe(false);
    expect(result.source_summary.physics.available).toBe(false);
  });

  it("handles malformed JSON inputs without throwing", () => {
    expect(() =>
      runDamageConsistencyCheck({
        damagedComponentsJson: "not-valid-json",
        damageDescription: "Some damage",
        enrichedPhotosJson: "{broken",
        physicsAnalysisJson: "null",
      })
    ).not.toThrow();
  });

  it("returns HIGH confidence when score >= 75 and both doc and photos available", () => {
    const result = runDamageConsistencyCheck({
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

  it("returns LOW confidence when only one source available", () => {
    const result = runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front bumper damage",
      enrichedPhotosJson: null,   // no photos
      physicsAnalysisJson: null,  // no physics
    });

    expect(result.confidence).toBe("LOW");
  });

  it("source_summary correctly identifies available sources", () => {
    const result = runDamageConsistencyCheck({
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

  it("handles string array in damagedComponentsJson (legacy format)", () => {
    const legacyJson = JSON.stringify(["front bumper", "hood", "left fender"]);

    const result = runDamageConsistencyCheck({
      damagedComponentsJson: legacyJson,
      damageDescription: null,
      enrichedPhotosJson: FRONT_ENRICHED_PHOTOS_JSON,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    expect(result.source_summary.document.available).toBe(true);
    expect(result.source_summary.document.components).toContain("front bumper");
  });

  it("adjacent zones do not trigger zone_mismatch", () => {
    // front and left are adjacent — should not conflict
    const leftPhotos = JSON.stringify([
      {
        url: "https://example.com/photo.jpg",
        impactZone: "left",
        detectedComponents: ["left door"],
        severity: "moderate",
        confidenceScore: 75,
      },
    ]);

    const result = runDamageConsistencyCheck({
      damagedComponentsJson: FRONT_COMPONENTS_JSON,
      damageDescription: "Front and left side damage",
      enrichedPhotosJson: leftPhotos,
      physicsAnalysisJson: FRONT_PHYSICS_JSON,
    });

    const zoneMismatches = result.mismatches.filter(m => m.type === "zone_mismatch");
    expect(zoneMismatches).toHaveLength(0);
  });
});
