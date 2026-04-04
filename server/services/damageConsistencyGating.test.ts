/**
 * Tests for the pre-condition gating logic in damageConsistency service.
 * Verifies that runDamageConsistencyCheck returns pending_inputs when any
 * required condition is missing, and returns a complete result when all
 * three conditions are met.
 */

import { describe, it, expect } from "vitest";
import {
  checkPreConditions,
  runDamageConsistencyCheck,
  type ConsistencyCheckInput,
} from "./damageConsistency";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_COMPONENTS_JSON = JSON.stringify([
  { name: "Front Bumper", severity: "moderate" },
  { name: "Hood", severity: "minor" },
]);

const VALID_ENRICHED_PHOTOS_JSON = JSON.stringify([
  {
    url: "https://example.com/photo1.jpg",
    impactZone: "front",
    detectedComponents: ["Front Bumper"],
    severity: "moderate",
    confidence: 82,
    caption: "Front bumper damage",
    imageQuality: "good",
  },
]);

const VALID_PHYSICS_JSON = JSON.stringify({
  primaryImpactZone: "front",
  deltaV: 28,
  impactAngle: 0,
  energyDissipation: 65,
  consistencyScore: 80,
  inconsistencies: [],
});

const FULL_INPUT: ConsistencyCheckInput = {
  damagedComponentsJson: VALID_COMPONENTS_JSON,
  damageDescription: "Front bumper and hood damaged",
  enrichedPhotosJson: VALID_ENRICHED_PHOTOS_JSON,
  physicsAnalysisJson: VALID_PHYSICS_JSON,
  triggerSource: "auto",
};

// ─── checkPreConditions ───────────────────────────────────────────────────────

describe("checkPreConditions", () => {
  it("returns null when all three conditions are met", () => {
    const result = checkPreConditions(FULL_INPUT);
    expect(result).toBeNull();
  });

  it("returns pending_inputs when damagedComponentsJson is null", () => {
    const result = checkPreConditions({ ...FULL_INPUT, damagedComponentsJson: null });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("document_extraction"))).toBe(true);
  });

  it("returns pending_inputs when damagedComponentsJson is empty array", () => {
    const result = checkPreConditions({ ...FULL_INPUT, damagedComponentsJson: "[]" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("document_extraction"))).toBe(true);
  });

  it("returns pending_inputs when enrichedPhotosJson is null", () => {
    const result = checkPreConditions({ ...FULL_INPUT, enrichedPhotosJson: null });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("photo_enrichment"))).toBe(true);
  });

  it("returns pending_inputs when enrichedPhotosJson is empty array", () => {
    const result = checkPreConditions({ ...FULL_INPUT, enrichedPhotosJson: "[]" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("photo_enrichment"))).toBe(true);
  });

  it("returns pending_inputs when physicsAnalysisJson is null", () => {
    const result = checkPreConditions({ ...FULL_INPUT, physicsAnalysisJson: null });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("physics_analysis"))).toBe(true);
  });

  it("returns pending_inputs when physics has no primaryImpactZone", () => {
    const noZone = JSON.stringify({ deltaV: 28, impactAngle: 0 });
    const result = checkPreConditions({ ...FULL_INPUT, physicsAnalysisJson: noZone });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("pending_inputs");
    expect(result!.missing_conditions.some(c => c.includes("physics_analysis"))).toBe(true);
  });

  it("lists all three missing conditions when all inputs are null", () => {
    const result = checkPreConditions({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
    });
    expect(result).not.toBeNull();
    expect(result!.missing_conditions.length).toBe(3);
  });

  it("includes a checked_at ISO timestamp in pending result", () => {
    const result = checkPreConditions({ ...FULL_INPUT, damagedComponentsJson: null });
    expect(result).not.toBeNull();
    expect(() => new Date(result!.checked_at)).not.toThrow();
    expect(new Date(result!.checked_at).getFullYear()).toBeGreaterThan(2020);
  });
});

// ─── runDamageConsistencyCheck with gating ────────────────────────────────────

describe("runDamageConsistencyCheck gating", () => {
  it("returns pending_inputs when conditions are not met (auto trigger)", async () => {
    // Pre-condition guard only fires for auto-triggered calls
    const result = await runDamageConsistencyCheck({
      damagedComponentsJson: null,
      damageDescription: null,
      enrichedPhotosJson: null,
      physicsAnalysisJson: null,
      triggerSource: "auto",
    });
    expect(result.status).toBe("pending_inputs");
  });

  it("returns complete result when all conditions are met", async () => {
    const result = await runDamageConsistencyCheck(FULL_INPUT);
    expect(result.status).toBe("complete");
  });

  it("marks result source as auto when triggerSource is auto", async () => {
    const result = await runDamageConsistencyCheck({ ...FULL_INPUT, triggerSource: "auto" });
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.source).toBe("auto");
    }
  });

  it("marks result source as manual when triggerSource is manual", async () => {
    const result = await runDamageConsistencyCheck({ ...FULL_INPUT, triggerSource: "manual" });
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.source).toBe("manual");
    }
  });

  it("defaults source to manual when triggerSource is omitted", async () => {
    const { triggerSource: _, ...inputWithoutSource } = FULL_INPUT;
    const result = await runDamageConsistencyCheck(inputWithoutSource);
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.source).toBe("manual");
    }
  });

  it("returns consistency_score between 0 and 100 for complete result", async () => {
    const result = await runDamageConsistencyCheck(FULL_INPUT);
    if (result.status === "complete") {
      expect(result.consistency_score).toBeGreaterThanOrEqual(0);
      expect(result.consistency_score).toBeLessThanOrEqual(100);
    }
  });

  it("does not run check when only 2 of 3 conditions are met (auto trigger)", async () => {
    // Missing physics — guard only fires for auto-triggered calls
    const result = await runDamageConsistencyCheck({
      ...FULL_INPUT,
      physicsAnalysisJson: null,
      triggerSource: "auto",
    });
    expect(result.status).toBe("pending_inputs");
    if (result.status === "pending_inputs") {
      expect(result.missing_conditions.length).toBe(1);
      expect(result.missing_conditions[0]).toContain("physics_analysis");
    }
  });
});
