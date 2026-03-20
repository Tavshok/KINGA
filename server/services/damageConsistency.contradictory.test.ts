/**
 * damageConsistency.contradictory.test.ts
 *
 * Regression suite for contradictory claim scenarios.
 *
 * The primary focus is the "frontal description + rear damage" contradiction
 * pattern — a common fraud vector where the claimant describes a frontal
 * collision but the photographic and/or physics evidence shows rear damage.
 *
 * Each test verifies that the consistency engine:
 *   1. Detects the zone conflict as a high-severity mismatch.
 *   2. Produces a low consistency_score (≤ 50).
 *   3. Returns confidence = "LOW".
 *   4. Includes at least one mismatch of type "zone_mismatch" or
 *      "physics_zone_conflict" or "photo_zone_conflict".
 */

import { describe, it, expect } from "vitest";
import { runDamageConsistencyCheck } from "./damageConsistency";
import type { ConsistencyCheckInput } from "./damageConsistency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ConsistencyCheckInput>): ConsistencyCheckInput {
  return {
    damagedComponentsJson: null,
    damageDescription: null,
    enrichedPhotosJson: null,
    physicsAnalysisJson: null,
    triggerSource: "manual",
    ...overrides,
  };
}

/** Build a JSON string of damaged components for the document source */
function docComponents(names: string[]): string {
  return JSON.stringify(names.map((name) => ({ name })));
}

/** Build a JSON string of enriched photos for the photo source */
function enrichedPhotos(zones: string[], components: string[] = []): string {
  return JSON.stringify([
    {
      impactZone: zones[0] ?? "unknown",
      detectedComponents: components,
      confidence: 0.9,
    },
    ...zones.slice(1).map((z) => ({
      impactZone: z,
      detectedComponents: [],
      confidence: 0.85,
    })),
  ]);
}

/** Build a JSON string of physics analysis for the physics source */
function physicsAnalysis(primaryZone: string, score = 80): string {
  return JSON.stringify({
    primaryImpactZone: primaryZone,
    damageConsistency: {
      score,
      inconsistencies: [],
    },
  });
}

// ─── Contradiction Scenarios ──────────────────────────────────────────────────

describe("Contradictory claim: frontal description + rear photo damage", () => {
  it("flags zone_mismatch when document says front bumper but photos show rear bumper", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper", "hood", "grille"]),
        damageDescription: "Vehicle collided head-on. Front bumper and hood are damaged.",
        enrichedPhotosJson: enrichedPhotos(["rear"], ["rear bumper", "trunk"]),
        physicsAnalysisJson: physicsAnalysis("front"),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const contradictionTypes = ["zone_mismatch", "photo_zone_conflict", "physics_zone_conflict"];
    const hasConflict = result.mismatches.some((m) => contradictionTypes.includes(m.type));
    expect(hasConflict).toBe(true);
    expect(result.consistency_score).toBeLessThanOrEqual(50);
    expect(result.confidence).toBe("LOW");
  });

  it("flags physics_zone_conflict when physics says rear but document describes frontal collision", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper", "headlight"]),
        damageDescription: "Hit another car from the front at an intersection.",
        enrichedPhotosJson: enrichedPhotos(["front"], ["front bumper"]),
        physicsAnalysisJson: physicsAnalysis("rear", 30),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const hasPhysicsConflict = result.mismatches.some(
      (m) => m.type === "physics_zone_conflict" || m.type === "zone_mismatch"
    );
    expect(hasPhysicsConflict).toBe(true);
    expect(result.consistency_score).toBeLessThanOrEqual(75);
  });

  it("detects high-severity mismatch when photos show rear damage and document lists only front components", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper", "radiator", "front fender"]),
        damageDescription: "Frontal impact at 60 km/h. Radiator and front bumper destroyed.",
        enrichedPhotosJson: enrichedPhotos(["rear", "rear"], ["rear bumper", "trunk lid", "tail light"]),
        physicsAnalysisJson: physicsAnalysis("front"),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const highSeverityMismatches = result.mismatches.filter((m) => m.severity === "high");
    expect(highSeverityMismatches.length).toBeGreaterThanOrEqual(1);
    expect(result.consistency_score).toBeLessThanOrEqual(50);
  });

  it("produces a low consistency score for complete front-rear inversion (all sources contradict)", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper", "hood", "headlight left"]),
        damageDescription: "Vehicle was struck from the front. Hood is crumpled.",
        enrichedPhotosJson: enrichedPhotos(["rear"], ["rear bumper", "spare tyre cover"]),
        physicsAnalysisJson: physicsAnalysis("rear", 20),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    // All three sources conflict: document=front, photos=rear, physics=rear
    expect(result.consistency_score).toBeLessThanOrEqual(40);
    expect(result.confidence).toBe("LOW");
    expect(result.mismatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Contradictory claim: side-impact description + roof/undercarriage damage", () => {
  it("flags physics_zone_conflict when physics says undercarriage but document only lists left-fender components", async () => {
    // Use only components that map to a single unambiguous zone ("left").
    // "left" is NOT adjacent to "undercarriage", so a physics_zone_conflict must be raised.
    // Avoid using 'driver mirror' which maps to the ambiguous 'side' zone.
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["left door", "left fender", "left quarter"]),
        damageDescription: "Another vehicle sideswiped my car on the driver side.",
        enrichedPhotosJson: enrichedPhotos(["left"], ["left door"]),
        physicsAnalysisJson: physicsAnalysis("undercarriage"),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    // Physics says undercarriage; document says left. These are not adjacent.
    const hasPhysicsConflict = result.mismatches.some(
      (m) => m.type === "physics_zone_conflict"
    );
    expect(hasPhysicsConflict).toBe(true);
    expect(result.consistency_score).toBeLessThanOrEqual(75);
  });

  it("does NOT flag a zone conflict when left-door document and front photo are adjacent (control)", async () => {
    // "left" and "front" are adjacent — the engine should NOT raise a zone conflict.
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["left door", "left fender"]),
        damageDescription: "Sideswiped on the driver side at a junction.",
        enrichedPhotosJson: enrichedPhotos(["front"], ["front bumper"]),
        physicsAnalysisJson: physicsAnalysis("front"),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const zoneConflicts = result.mismatches.filter((m) =>
      ["zone_mismatch", "photo_zone_conflict", "physics_zone_conflict"].includes(m.type)
    );
    // Adjacent zones should not produce a zone conflict
    expect(zoneConflicts.length).toBe(0);
  });
});

describe("Consistent claim: frontal description + frontal damage (control group)", () => {
  it("produces a high consistency score when all sources agree on front zone", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper", "hood", "grille", "headlight"]),
        damageDescription: "Frontal collision at low speed. Front bumper and hood damaged.",
        enrichedPhotosJson: enrichedPhotos(["front"], ["front bumper", "grille"]),
        physicsAnalysisJson: physicsAnalysis("front", 85),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    // No zone conflicts expected — all sources agree on "front"
    const zoneConflicts = result.mismatches.filter((m) =>
      ["zone_mismatch", "photo_zone_conflict", "physics_zone_conflict"].includes(m.type)
    );
    expect(zoneConflicts.length).toBe(0);
    expect(result.consistency_score).toBeGreaterThanOrEqual(60);
  });

  it("produces a high consistency score when rear-end collision has consistent rear evidence", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["rear bumper", "trunk", "tail light"]),
        damageDescription: "I was rear-ended at a traffic light. Rear bumper and trunk are damaged.",
        enrichedPhotosJson: enrichedPhotos(["rear"], ["rear bumper", "trunk"]),
        physicsAnalysisJson: physicsAnalysis("rear", 90),
      })
    );

    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const zoneConflicts = result.mismatches.filter((m) =>
      ["zone_mismatch", "photo_zone_conflict", "physics_zone_conflict"].includes(m.type)
    );
    expect(zoneConflicts.length).toBe(0);
    expect(result.consistency_score).toBeGreaterThanOrEqual(60);
  });
});

describe("Edge cases", () => {
  it("handles missing photo source gracefully (no crash, returns pending or partial result)", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: docComponents(["front bumper"]),
        damageDescription: "Frontal collision.",
        enrichedPhotosJson: null,
        physicsAnalysisJson: physicsAnalysis("front"),
      })
    );

    // Should not throw; status is either "complete" or "pending_inputs"
    expect(["complete", "pending_inputs"]).toContain(result.status);
  });

  it("handles empty component arrays without throwing", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: JSON.stringify([]),
        damageDescription: null,
        enrichedPhotosJson: enrichedPhotos(["rear"]),
        physicsAnalysisJson: physicsAnalysis("rear"),
      })
    );

    expect(["complete", "pending_inputs"]).toContain(result.status);
  });

  it("handles malformed JSON inputs without throwing", async () => {
    const result = await runDamageConsistencyCheck(
      makeInput({
        damagedComponentsJson: "{ not valid json",
        damageDescription: "Some damage.",
        enrichedPhotosJson: "also not json",
        physicsAnalysisJson: null,
      })
    );

    expect(["complete", "pending_inputs"]).toContain(result.status);
  });
});
