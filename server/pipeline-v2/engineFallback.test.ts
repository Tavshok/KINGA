/**
 * engineFallback.test.ts
 *
 * Stage 26: Defensive Output Contracts
 *
 * Tests for all five engine fallback factories and contract enforcement functions.
 *
 * Rules verified:
 *   1. NEVER return null, undefined, or empty objects
 *   2. Missing inputs → fallback output with { estimated: true, source: "fallback" }
 *   3. Minimum required fields always present per engine
 *   4. Low confidence → reduce confidence but DO NOT remove output
 */

import { describe, it, expect } from "vitest";
import {
  markFallback,
  markLowConfidence,
  applyConfidenceReduction,
  isFallbackOutput,
  getFallbackFields,
  // Physics
  buildPhysicsFallback,
  ensurePhysicsContract,
  // Damage
  buildDamageFallback,
  ensureDamageContract,
  // Fraud
  buildFraudFallback,
  ensureFraudContract,
  // Cost
  buildCostFallback,
  ensureCostContract,
  // Reconstruction
  buildReconstructionFallback,
} from "./engineFallback";

// ─── Utility tests ────────────────────────────────────────────────────────────

describe("markFallback", () => {
  it("marks an object with estimated: true and source: fallback", () => {
    const result = markFallback({ value: 42 });
    expect(result.estimated).toBe(true);
    expect(result.source).toBe("fallback");
    expect((result as any).value).toBe(42);
  });

  it("includes reason when provided", () => {
    const result = markFallback({ x: 1 }, "test_reason");
    expect((result as any).reason).toBe("test_reason");
  });

  it("handles empty objects", () => {
    const result = markFallback({});
    expect(result.estimated).toBe(true);
    expect(result.source).toBe("fallback");
  });
});

describe("markLowConfidence", () => {
  it("returns low confidence metadata", () => {
    const meta = markLowConfidence(80, 60, "test");
    expect(meta.estimated).toBe(true);
    expect(meta.source).toBe("low_confidence");
    expect(meta.original_confidence).toBe(80);
    expect(meta.reduced_confidence).toBe(60);
  });

  it("clamps reduced_confidence to not exceed original", () => {
    const meta = markLowConfidence(50, 90); // reduced > original → should clamp
    expect(meta.reduced_confidence).toBeLessThan(meta.original_confidence);
  });

  it("clamps reduced_confidence to minimum 0", () => {
    const meta = markLowConfidence(5, -10);
    expect(meta.reduced_confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("applyConfidenceReduction", () => {
  it("does not reduce confidence above threshold", () => {
    const result = applyConfidenceReduction(75, 30);
    expect(result.reduced).toBe(false);
    expect(result.confidence).toBe(75);
    expect(result.meta).toBeUndefined();
  });

  it("reduces confidence below threshold", () => {
    const result = applyConfidenceReduction(20, 30);
    expect(result.reduced).toBe(true);
    expect(result.confidence).toBeLessThan(20);
    expect(result.meta).toBeDefined();
  });

  it("NEVER removes output — only reduces confidence", () => {
    const result = applyConfidenceReduction(0, 30);
    // confidence is 0 but the result object is still present
    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("isFallbackOutput", () => {
  it("returns true for fallback output", () => {
    const output = buildPhysicsFallback();
    expect(isFallbackOutput(output)).toBe(true);
  });

  it("returns false for non-fallback output", () => {
    expect(isFallbackOutput({ score: 50 })).toBe(false);
    expect(isFallbackOutput(null)).toBe(false);
    expect(isFallbackOutput(undefined)).toBe(false);
  });
});

describe("getFallbackFields", () => {
  it("returns the list of fallback fields", () => {
    const output = buildPhysicsFallback();
    const fields = getFallbackFields(output);
    expect(Array.isArray(fields)).toBe(true);
    expect(fields.length).toBeGreaterThan(0);
  });

  it("returns empty array for non-fallback output", () => {
    expect(getFallbackFields({ score: 50 })).toEqual([]);
  });
});

// ─── Physics engine tests ─────────────────────────────────────────────────────

describe("Physics Engine — buildPhysicsFallback", () => {
  it("NEVER returns null or undefined", () => {
    const output = buildPhysicsFallback();
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });

  it("always includes required field: delta_v (deltaVKmh)", () => {
    const output = buildPhysicsFallback();
    expect(output.deltaVKmh).toBeDefined();
    expect(typeof output.deltaVKmh).toBe("number");
  });

  it("always includes required field: direction (impactVector.direction)", () => {
    const output = buildPhysicsFallback();
    expect(output.impactVector).toBeDefined();
    expect(output.impactVector.direction).toBeDefined();
    expect(typeof output.impactVector.direction).toBe("string");
  });

  it("always includes required field: estimated_force (impactForceKn)", () => {
    const output = buildPhysicsFallback();
    expect(output.impactForceKn).toBeDefined();
    expect(typeof output.impactForceKn).toBe("number");
  });

  it("marks output as fallback", () => {
    const output = buildPhysicsFallback();
    expect(output._fallback.estimated).toBe(true);
    expect(output._fallback.source).toBe("fallback");
  });

  it("includes a human-readable reconstruction summary", () => {
    const output = buildPhysicsFallback();
    expect(typeof output.accidentReconstructionSummary).toBe("string");
    expect(output.accidentReconstructionSummary.length).toBeGreaterThan(10);
  });
});

describe("Physics Engine — ensurePhysicsContract", () => {
  it("fills in missing deltaVKmh", () => {
    const output = ensurePhysicsContract({ impactForceKn: 10, impactVector: { direction: "frontal", magnitude: 10000, angle: 0 } });
    expect(output.deltaVKmh).toBeDefined();
    expect(output._fallback_fields).toContain("deltaVKmh");
  });

  it("fills in missing impactVector.direction", () => {
    const output = ensurePhysicsContract({ deltaVKmh: 30, impactForceKn: 10 });
    expect(output.impactVector.direction).toBeDefined();
    expect(output._fallback_fields).toContain("impactVector.direction");
  });

  it("fills in missing impactForceKn", () => {
    const output = ensurePhysicsContract({ deltaVKmh: 30, impactVector: { direction: "frontal", magnitude: 0, angle: 0 } });
    expect(output.impactForceKn).toBeDefined();
    expect(output._fallback_fields).toContain("impactForceKn");
  });

  it("preserves provided values", () => {
    const output = ensurePhysicsContract({ deltaVKmh: 45, impactForceKn: 25, impactVector: { direction: "rear", magnitude: 25000, angle: 0 } });
    expect(output.deltaVKmh).toBe(45);
    expect(output.impactForceKn).toBe(25);
    expect(output.impactVector.direction).toBe("rear");
    expect(output._fallback_fields).toEqual([]);
  });

  it("NEVER returns null or undefined", () => {
    const output = ensurePhysicsContract({});
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });
});

// ─── Damage engine tests ──────────────────────────────────────────────────────

describe("Damage Engine — buildDamageFallback", () => {
  it("NEVER returns null or undefined", () => {
    const output = buildDamageFallback();
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });

  it("NEVER returns empty damageZones array", () => {
    const output = buildDamageFallback();
    expect(output.damageZones.length).toBeGreaterThan(0);
  });

  it("sets no_damage_detected sentinel when zones are empty", () => {
    const output = buildDamageFallback();
    expect(output.no_damage_detected).toBe(true);
  });

  it("marks output as fallback", () => {
    const output = buildDamageFallback();
    expect(output._fallback.estimated).toBe(true);
    expect(output._fallback.source).toBe("fallback");
  });
});

describe("Damage Engine — ensureDamageContract", () => {
  it("adds sentinel zone when damageZones is empty", () => {
    const output = ensureDamageContract({ damagedParts: [], damageZones: [], overallSeverityScore: 0, structuralDamageDetected: false, totalDamageArea: 0 });
    expect(output.damageZones.length).toBeGreaterThan(0);
    expect(output.no_damage_detected).toBe(true);
    expect(output._fallback_fields).toContain("damageZones");
  });

  it("preserves existing zones when present", () => {
    const zones = [{ zone: "front", componentCount: 2, maxSeverity: "moderate" as any }];
    const output = ensureDamageContract({ damagedParts: [], damageZones: zones, overallSeverityScore: 50, structuralDamageDetected: false, totalDamageArea: 0 });
    expect(output.damageZones).toEqual(zones);
    expect(output.no_damage_detected).toBe(false);
    expect(output._fallback_fields).toEqual([]);
  });

  it("NEVER returns null or undefined", () => {
    const output = ensureDamageContract({});
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
    expect(output.damageZones.length).toBeGreaterThan(0);
  });
});

// ─── Fraud engine tests ───────────────────────────────────────────────────────

describe("Fraud Engine — buildFraudFallback", () => {
  it("NEVER returns null or undefined", () => {
    const output = buildFraudFallback();
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });

  it("always includes required field: score (fraudRiskScore)", () => {
    const output = buildFraudFallback();
    expect(output.fraudRiskScore).toBeDefined();
    expect(typeof output.fraudRiskScore).toBe("number");
  });

  it("always includes required field: level (fraudRiskLevel)", () => {
    const output = buildFraudFallback();
    expect(output.fraudRiskLevel).toBeDefined();
    expect(typeof output.fraudRiskLevel).toBe("string");
  });

  it("always includes at least 1 contributing factor (indicators)", () => {
    const output = buildFraudFallback();
    expect(output.indicators.length).toBeGreaterThanOrEqual(1);
  });

  it("marks output as fallback", () => {
    const output = buildFraudFallback();
    expect(output._fallback.estimated).toBe(true);
    expect(output._fallback.source).toBe("fallback");
  });

  it("uses neutral language — no wrongdoing implication in indicator description", () => {
    const output = buildFraudFallback();
    const descriptions = output.indicators.map(i => i.description.toLowerCase());
    // 'fraud' is the domain name (fraudRiskScore) and is acceptable;
    // these words imply deliberate wrongdoing and must not appear
    const wrongdoingWords = ["suspicious", "misreport", "conceal", "tamper", "inflate", "fabricat", "deceiv"];
    for (const desc of descriptions) {
      for (const word of wrongdoingWords) {
        expect(desc).not.toContain(word);
      }
    }
  });
});

describe("Fraud Engine — ensureFraudContract", () => {
  it("adds fallback indicator when indicators is empty", () => {
    const output = ensureFraudContract({ fraudRiskScore: 30, fraudRiskLevel: "low", indicators: [] });
    expect(output.indicators.length).toBeGreaterThanOrEqual(1);
    expect(output._fallback_fields).toContain("indicators");
  });

  it("preserves existing indicators when present", () => {
    const indicators = [{ indicator: "test", category: "documentation" as any, score: 10, description: "Test" }];
    const output = ensureFraudContract({ fraudRiskScore: 10, fraudRiskLevel: "low", indicators });
    expect(output.indicators).toEqual(indicators);
    expect(output._fallback_fields).not.toContain("indicators");
  });

  it("fills in missing score", () => {
    const output = ensureFraudContract({ fraudRiskLevel: "medium", indicators: [] });
    expect(output.fraudRiskScore).toBeDefined();
    expect(output._fallback_fields).toContain("fraudRiskScore");
  });

  it("fills in missing level", () => {
    const output = ensureFraudContract({ fraudRiskScore: 50, indicators: [] });
    expect(output.fraudRiskLevel).toBeDefined();
    expect(output._fallback_fields).toContain("fraudRiskLevel");
  });

  it("NEVER returns null or undefined", () => {
    const output = ensureFraudContract({});
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
    expect(output.fraudRiskScore).toBeDefined();
    expect(output.fraudRiskLevel).toBeDefined();
    expect(output.indicators.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Cost engine tests ────────────────────────────────────────────────────────

describe("Cost Engine — buildCostFallback", () => {
  it("NEVER returns null or undefined", () => {
    const output = buildCostFallback();
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });

  it("always includes required field: ai_estimate", () => {
    const output = buildCostFallback();
    expect(output.ai_estimate).toBeDefined();
    expect(typeof output.ai_estimate).toBe("number");
    expect(output.ai_estimate).toBeGreaterThan(0);
  });

  it("always includes required field: parts", () => {
    const output = buildCostFallback();
    expect(output.parts).toBeDefined();
    expect(typeof output.parts).toBe("number");
    expect(output.parts).toBeGreaterThan(0);
  });

  it("always includes required field: labour", () => {
    const output = buildCostFallback();
    expect(output.labour).toBeDefined();
    expect(typeof output.labour).toBe("number");
    expect(output.labour).toBeGreaterThan(0);
  });

  it("always includes required field: fair_range", () => {
    const output = buildCostFallback();
    expect(output.fair_range).toBeDefined();
    expect(output.fair_range.lowCents).toBeDefined();
    expect(output.fair_range.highCents).toBeDefined();
    expect(output.fair_range.highCents).toBeGreaterThan(output.fair_range.lowCents);
  });

  it("marks output as fallback", () => {
    const output = buildCostFallback();
    expect(output._fallback.estimated).toBe(true);
    expect(output._fallback.source).toBe("fallback");
  });

  it("ai_estimate equals parts + labour + paint", () => {
    const output = buildCostFallback();
    const expectedTotal = output.breakdown.partsCostCents + output.breakdown.labourCostCents + output.breakdown.paintCostCents;
    expect(output.ai_estimate).toBe(expectedTotal);
  });
});

describe("Cost Engine — ensureCostContract", () => {
  it("adds top-level required fields from breakdown", () => {
    const output = ensureCostContract({
      expectedRepairCostCents: 500000,
      breakdown: { partsCostCents: 300000, labourCostCents: 150000, paintCostCents: 50000, hiddenDamageCostCents: 0, totalCents: 500000 },
      recommendedCostRange: { lowCents: 400000, highCents: 600000 },
      quoteDeviationPct: null,
      savingsOpportunityCents: 0,
      labourRateUsdPerHour: 75,
      marketRegion: "US",
      currency: "USD",
      repairIntelligence: [],
      partsReconciliation: [],
    });
    expect(output.ai_estimate).toBe(500000);
    expect(output.parts).toBe(300000);
    expect(output.labour).toBe(150000);
    expect(output.fair_range).toEqual({ lowCents: 400000, highCents: 600000 });
    expect(output._fallback_fields).toEqual([]);
  });

  it("fills in all required fields when input is empty", () => {
    const output = ensureCostContract({});
    expect(output.ai_estimate).toBeGreaterThan(0);
    expect(output.parts).toBeGreaterThan(0);
    expect(output.labour).toBeGreaterThan(0);
    expect(output.fair_range.lowCents).toBeGreaterThan(0);
    expect(output._fallback_fields.length).toBeGreaterThan(0);
  });

  it("NEVER returns null or undefined", () => {
    const output = ensureCostContract({});
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });
});

// ─── Reconstruction engine tests ──────────────────────────────────────────────

describe("Reconstruction Engine — buildReconstructionFallback", () => {
  it("NEVER returns null or undefined", () => {
    const output = buildReconstructionFallback(1, 1);
    expect(output).not.toBeNull();
    expect(output).not.toBeUndefined();
  });

  it("always includes vehicle.make and vehicle.model", () => {
    const output = buildReconstructionFallback(1, 1);
    expect(output.vehicle.make).toBeDefined();
    expect(output.vehicle.model).toBeDefined();
    expect(typeof output.vehicle.make).toBe("string");
    expect(typeof output.vehicle.model).toBe("string");
  });

  it("always includes incident.type and incident.description", () => {
    const output = buildReconstructionFallback(1, 1);
    expect(output.incident.type).toBeDefined();
    expect(output.incident.description).toBeDefined();
    expect(output.incident.description.length).toBeGreaterThan(10);
  });

  it("marks output as fallback", () => {
    const output = buildReconstructionFallback(1, 1);
    expect(output._fallback.estimated).toBe(true);
    expect(output._fallback.source).toBe("fallback");
  });

  it("preserves claimId and tenantId", () => {
    const output = buildReconstructionFallback(42, 7);
    expect(output.claimId).toBe(42);
    expect(output.tenantId).toBe(7);
  });

  it("uses neutral language in description — no wrongdoing implication", () => {
    const output = buildReconstructionFallback(1, 1);
    const desc = output.incident.description.toLowerCase();
    const suspicionWords = ["fraud", "suspicious", "misreport", "conceal", "tamper"];
    for (const word of suspicionWords) {
      expect(desc).not.toContain(word);
    }
  });
});

// ─── Cross-engine contract rules ──────────────────────────────────────────────

describe("Cross-engine contract rules", () => {
  it("Rule 1: NEVER return null — all five fallback factories return objects", () => {
    expect(buildPhysicsFallback()).not.toBeNull();
    expect(buildDamageFallback()).not.toBeNull();
    expect(buildFraudFallback()).not.toBeNull();
    expect(buildCostFallback()).not.toBeNull();
    expect(buildReconstructionFallback(1, 1)).not.toBeNull();
  });

  it("Rule 2: All fallback outputs are marked with estimated: true, source: fallback", () => {
    const outputs = [
      buildPhysicsFallback(),
      buildDamageFallback(),
      buildFraudFallback(),
      buildCostFallback(),
      buildReconstructionFallback(1, 1),
    ];
    for (const output of outputs) {
      expect(isFallbackOutput(output)).toBe(true);
      expect(output._fallback.estimated).toBe(true);
      expect(output._fallback.source).toBe("fallback");
    }
  });

  it("Rule 3: All fallback outputs include _fallback_fields list", () => {
    const outputs = [
      buildPhysicsFallback(),
      buildDamageFallback(),
      buildFraudFallback(),
      buildCostFallback(),
    ];
    for (const output of outputs) {
      const fields = getFallbackFields(output);
      expect(Array.isArray(fields)).toBe(true);
    }
  });

  it("Rule 4: Low confidence reduces score but does NOT remove output", () => {
    // Physics: low damageConsistencyScore → output still present
    const physics = buildPhysicsFallback();
    const { confidence, reduced } = applyConfidenceReduction(physics.damageConsistencyScore, 30);
    expect(physics).toBeDefined(); // output still present
    if (reduced) {
      expect(confidence).toBeLessThan(physics.damageConsistencyScore);
    }

    // Fraud: low fraudRiskScore → output still present
    const fraud = buildFraudFallback();
    const { confidence: fraudConf } = applyConfidenceReduction(fraud.fraudRiskScore, 30);
    expect(fraud).toBeDefined(); // output still present
    expect(fraudConf).toBeGreaterThanOrEqual(0);
  });

  it("Rule 5: Damage engine — at least 1 zone OR no_damage_detected sentinel", () => {
    const output = buildDamageFallback();
    const hasZones = output.damageZones.length > 0;
    const hasSentinel = output.no_damage_detected === true;
    expect(hasZones || hasSentinel).toBe(true);
  });

  it("Rule 6: Fraud engine — at least 1 contributing factor always present", () => {
    const output = buildFraudFallback();
    expect(output.indicators.length).toBeGreaterThanOrEqual(1);
  });

  it("Rule 7: Cost engine — all four required top-level fields present", () => {
    const output = buildCostFallback();
    expect(output.ai_estimate).toBeDefined();
    expect(output.parts).toBeDefined();
    expect(output.labour).toBeDefined();
    expect(output.fair_range).toBeDefined();
  });

  it("Rule 8: Physics engine — delta_v, direction, and estimated_force always present", () => {
    const output = buildPhysicsFallback();
    expect(output.deltaVKmh).toBeDefined();
    expect(output.impactVector.direction).toBeDefined();
    expect(output.impactForceKn).toBeDefined();
  });
});
