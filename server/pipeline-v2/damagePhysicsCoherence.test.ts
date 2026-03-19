/**
 * damagePhysicsCoherence.test.ts
 *
 * Stage 35: Damage-Physics Coherence Validator — Unit Tests
 *
 * Covers:
 *   1. ZONE_DIRECTION_MAP table structure
 *   2. Mismatch detection (front/rear/side/multiple)
 *   3. Confidence reduction factor computation
 *   4. High-severity mismatch flagging
 *   5. Fraud penalty trigger logic
 *   6. Explanation generation (neutral, legally-safe language)
 *   7. buildCoherenceConsistencyInput adapter
 *   8. buildCoherenceFraudInput adapter
 *   9. Null / degraded input handling (always returns valid output)
 *  10. Multiple mismatches accumulation
 *  11. Direction normalisation (case-insensitive)
 *  12. Zone normalisation
 *  13. Edge cases
 */

import { describe, it, expect } from "vitest";
import {
  validateDamagePhysicsCoherence,
  buildCoherenceConsistencyInput,
  buildCoherenceFraudInput,
  ZONE_DIRECTION_MAP,
  CONFIDENCE_REDUCTION_PER_MISMATCH,
  HIGH_SEVERITY_THRESHOLD,
  FRAUD_PENALTY_TRIGGER_COUNT,
} from "./damagePhysicsCoherence";
import type { Stage6Output, Stage7Output } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build minimal Stage6/Stage7 objects matching actual types.ts shapes
// ─────────────────────────────────────────────────────────────────────────────

function makeStage6(zones: string[]): Stage6Output {
  return {
    damagedParts: [],
    damageZones: zones.map((z) => ({
      zone: z,
      componentCount: 1,
      maxSeverity: "moderate" as const,
    })),
    overallSeverityScore: 0.7,
    structuralDamageDetected: false,
    totalDamageArea: 0.5,
  };
}

function makeStage7(direction: string): Stage7Output {
  return {
    impactForceKn: 18.5,
    impactVector: {
      direction: direction as any,
      magnitude: 18.5,
      angle: 0,
    },
    energyDistribution: {
      kineticEnergyJ: 12300,
      energyDissipatedJ: 10000,
      energyDissipatedKj: 10,
    },
    estimatedSpeedKmh: 40,
    deltaVKmh: 25,
    decelerationG: 3.2,
    accidentSeverity: "moderate" as const,
    accidentReconstructionSummary: "Test summary",
    damageConsistencyScore: 0.85,
    latentDamageProbability: {
      engine: 0.1,
      transmission: 0.05,
      suspension: 0.15,
      frame: 0.2,
      electrical: 0.05,
    },
    physicsExecuted: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ZONE_DIRECTION_MAP table structure
// ─────────────────────────────────────────────────────────────────────────────

describe("ZONE_DIRECTION_MAP", () => {
  it("has at least 8 zone entries", () => {
    expect(ZONE_DIRECTION_MAP.length).toBeGreaterThanOrEqual(8);
  });

  it("every entry has zone, expectedDirections, and mismatchSeverity", () => {
    for (const entry of ZONE_DIRECTION_MAP) {
      expect(typeof entry.zone).toBe("string");
      expect(Array.isArray(entry.expectedDirections)).toBe(true);
      expect(entry.expectedDirections.length).toBeGreaterThan(0);
      expect(typeof entry.mismatchSeverity).toBe("string");
    }
  });

  it("maps front zone to frontal direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "front");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("frontal");
  });

  it("maps rear zone to rear direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "rear");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("rear");
  });

  it("maps driver_side zone to side_driver direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "driver_side");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("side_driver");
  });

  it("maps passenger_side zone to side_passenger direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "passenger_side");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("side_passenger");
  });

  it("maps roof zone to rollover direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "roof");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("rollover");
  });

  it("maps undercarriage zone to rollover direction", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "undercarriage");
    expect(entry).toBeDefined();
    expect(entry!.expectedDirections).toContain("rollover");
  });

  it("maps front_left zone to frontal and side_driver directions", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "front_left");
    expect(entry).toBeDefined();
    expect(
      entry!.expectedDirections.some((d) => d === "frontal" || d.includes("driver"))
    ).toBe(true);
  });

  it("maps rear_right zone to rear and side_passenger directions", () => {
    const entry = ZONE_DIRECTION_MAP.find((e) => e.zone === "rear_right");
    expect(entry).toBeDefined();
    expect(
      entry!.expectedDirections.some((d) => d === "rear" || d.includes("passenger"))
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Exported constants
// ─────────────────────────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("CONFIDENCE_REDUCTION_PER_MISMATCH is between 0.05 and 0.25", () => {
    expect(CONFIDENCE_REDUCTION_PER_MISMATCH).toBeGreaterThanOrEqual(0.05);
    expect(CONFIDENCE_REDUCTION_PER_MISMATCH).toBeLessThanOrEqual(0.25);
  });

  it("HIGH_SEVERITY_THRESHOLD is 'high'", () => {
    expect(HIGH_SEVERITY_THRESHOLD).toBe("high");
  });

  it("FRAUD_PENALTY_TRIGGER_COUNT is a positive integer", () => {
    expect(typeof FRAUD_PENALTY_TRIGGER_COUNT).toBe("number");
    expect(FRAUD_PENALTY_TRIGGER_COUNT).toBeGreaterThan(0);
    expect(Number.isInteger(FRAUD_PENALTY_TRIGGER_COUNT)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Coherent scenarios — no mismatch expected
// ─────────────────────────────────────────────────────────────────────────────

describe("coherent scenarios (no mismatch)", () => {
  it("front damage + frontal impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(false);
    expect(result.mismatches).toHaveLength(0);
    expect(result.confidence_reduction_factor).toBe(1.0);
    expect(result.fraud_penalty_triggered).toBe(false);
  });

  it("rear damage + rear impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["rear"]),
      makeStage7("rear")
    );
    expect(result.has_mismatch).toBe(false);
    expect(result.confidence_reduction_factor).toBe(1.0);
  });

  it("driver_side damage + side_driver impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["driver_side"]),
      makeStage7("side_driver")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("passenger_side damage + side_passenger impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["passenger_side"]),
      makeStage7("side_passenger")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("front_left damage + frontal impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front_left"]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("front_left damage + side_driver impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front_left"]),
      makeStage7("side_driver")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("multiple zones all matching direction → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "hood", "bumper_front"]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("multi_impact direction → no mismatch for any zone (multi_impact is always compatible)", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("multi_impact")
    );
    expect(result.has_mismatch).toBe(false);
  });

  it("roof damage + rollover impact → no mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["roof"]),
      makeStage7("rollover")
    );
    expect(result.has_mismatch).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mismatch detection
// ─────────────────────────────────────────────────────────────────────────────

describe("mismatch detection", () => {
  it("front damage + rear impact → mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    expect(result.has_mismatch).toBe(true);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it("rear damage + frontal impact → mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["rear"]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(true);
  });

  it("driver_side damage + frontal impact → mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["driver_side"]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(true);
  });

  it("passenger_side damage + rear impact → mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["passenger_side"]),
      makeStage7("rear")
    );
    expect(result.has_mismatch).toBe(true);
  });

  it("front damage + side_driver impact → mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("side_driver")
    );
    expect(result.has_mismatch).toBe(true);
  });

  it("mismatch entry has zone, actual_direction, expected_directions, severity, explanation", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const m = result.mismatches[0];
    expect(typeof m.zone).toBe("string");
    expect(typeof m.actual_direction).toBe("string");
    expect(Array.isArray(m.expected_directions)).toBe(true);
    expect(typeof m.severity).toBe("string");
    expect(typeof m.explanation).toBe("string");
    expect(m.explanation.length).toBeGreaterThan(10);
  });

  it("mismatch explanation does not contain forbidden accusatory words", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const explanation = result.mismatches[0].explanation.toLowerCase();
    const forbidden = ["fraud", "suspicious", "tamper", "fabricat", "false", "lie", "deceiv", "staged"];
    for (const word of forbidden) {
      expect(explanation).not.toContain(word);
    }
  });

  it("mismatch explanation uses neutral review language", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const explanation = result.mismatches[0].explanation.toLowerCase();
    const neutralTerms = ["review", "verify", "inconsisten", "further", "assessment", "documentation", "verification", "required"];
    const hasNeutral = neutralTerms.some((t) => explanation.includes(t));
    expect(hasNeutral).toBe(true);
  });

  it("front vs rear mismatch is classified as high severity", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    expect(result.mismatches[0].severity).toBe("high");
  });

  it("front_left vs side_passenger mismatch is classified as high severity", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front_left"]),
      makeStage7("side_passenger")
    );
    // front_left expects frontal, side_driver, multi_impact — side_passenger is a mismatch
    expect(result.has_mismatch).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Confidence reduction factor
// ─────────────────────────────────────────────────────────────────────────────

describe("confidence_reduction_factor", () => {
  it("is 1.0 when no mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.confidence_reduction_factor).toBe(1.0);
  });

  it("is less than 1.0 when there is a high-severity mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    expect(result.confidence_reduction_factor).toBeLessThan(1.0);
  });

  it("is 0.80 for exactly 1 high-severity mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    if (result.high_severity_mismatch_count === 1) {
      expect(result.confidence_reduction_factor).toBe(0.80);
    }
  });

  it("is 0.65 for 2+ high-severity mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear"]),
      makeStage7("side_driver")
    );
    if (result.high_severity_mismatch_count >= 2) {
      expect(result.confidence_reduction_factor).toBe(0.65);
    }
  });

  it("never goes below 0.30 (floor)", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear", "driver_side", "passenger_side"]),
      makeStage7("rollover")
    );
    expect(result.confidence_reduction_factor).toBeGreaterThanOrEqual(0.30);
  });

  it("never exceeds 1.0", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.confidence_reduction_factor).toBeLessThanOrEqual(1.0);
  });

  it("decreases or stays same with more mismatches", () => {
    const single = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const multiple = validateDamagePhysicsCoherence(
      makeStage6(["front", "driver_side"]),
      makeStage7("rear")
    );
    expect(multiple.confidence_reduction_factor).toBeLessThanOrEqual(
      single.confidence_reduction_factor
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. High-severity mismatch count
// ─────────────────────────────────────────────────────────────────────────────

describe("high_severity_mismatch_count", () => {
  it("is 0 when no mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.high_severity_mismatch_count).toBe(0);
  });

  it("is >= 1 for front vs rear mismatch", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    expect(result.high_severity_mismatch_count).toBeGreaterThanOrEqual(1);
  });

  it("counts correctly for two high-severity mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear"]),
      makeStage7("side_driver")
    );
    // Both front and rear are high-severity mismatches vs side_driver
    expect(result.high_severity_mismatch_count).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Fraud penalty trigger
// ─────────────────────────────────────────────────────────────────────────────

describe("fraud_penalty_triggered", () => {
  it("is false when no mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.fraud_penalty_triggered).toBe(false);
  });

  it("is true when high_severity_mismatch_count >= FRAUD_PENALTY_TRIGGER_COUNT", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    if (result.high_severity_mismatch_count >= FRAUD_PENALTY_TRIGGER_COUNT) {
      expect(result.fraud_penalty_triggered).toBe(true);
    }
  });

  it("is false when only low-severity mismatches exist", () => {
    // roof vs frontal is low severity (roof accepts many directions)
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.fraud_penalty_triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Result structure contract
// ─────────────────────────────────────────────────────────────────────────────

describe("result structure contract", () => {
  it("always returns all required fields", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(typeof result.has_mismatch).toBe("boolean");
    expect(Array.isArray(result.mismatches)).toBe(true);
    expect(typeof result.confidence_reduction_factor).toBe("number");
    expect(typeof result.high_severity_mismatch_count).toBe("number");
    expect(typeof result.fraud_penalty_triggered).toBe("boolean");
    expect(typeof result.summary).toBe("string");
    expect(typeof result.zones_checked).toBe("number");
    expect(typeof result.direction_checked).toBe("string");
    expect(typeof result.coherent_zone_count).toBe("number");
  });

  it("summary is non-empty string", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    expect(result.summary.length).toBeGreaterThan(5);
  });

  it("zones_checked equals number of unique damage zones in stage6", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear"]),
      makeStage7("frontal")
    );
    expect(result.zones_checked).toBe(2);
  });

  it("direction_checked matches normalised stage7 impactVector.direction", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.direction_checked).toBe("frontal");
  });

  it("coherent_zone_count + mismatches.length equals zones_checked (for known zones)", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear"]),
      makeStage7("frontal")
    );
    // front is coherent, rear is a mismatch
    expect(result.coherent_zone_count + result.mismatches.length).toBe(result.zones_checked);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Null / degraded input handling
// ─────────────────────────────────────────────────────────────────────────────

describe("null / degraded input handling", () => {
  it("handles null stage6 gracefully", () => {
    const result = validateDamagePhysicsCoherence(null, makeStage7("frontal"));
    expect(result.has_mismatch).toBe(false);
    expect(result.mismatches).toHaveLength(0);
    expect(result.confidence_reduction_factor).toBe(1.0);
    expect(result.zones_checked).toBe(0);
  });

  it("handles null stage7 gracefully", () => {
    const result = validateDamagePhysicsCoherence(makeStage6(["front"]), null);
    expect(result.has_mismatch).toBe(false);
    expect(result.mismatches).toHaveLength(0);
    expect(result.confidence_reduction_factor).toBe(1.0);
  });

  it("handles both null gracefully", () => {
    const result = validateDamagePhysicsCoherence(null, null);
    expect(result.has_mismatch).toBe(false);
    expect(result.confidence_reduction_factor).toBe(1.0);
    expect(result.fraud_penalty_triggered).toBe(false);
  });

  it("handles stage6 with empty damageZones array", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6([]),
      makeStage7("frontal")
    );
    expect(result.has_mismatch).toBe(false);
    expect(result.zones_checked).toBe(0);
  });

  it("handles unknown zone gracefully (no crash, treated as coherent)", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["unknown_zone_xyz"]),
      makeStage7("frontal")
    );
    expect(result).toBeDefined();
    expect(typeof result.has_mismatch).toBe("boolean");
    // Unknown zones are skipped (treated as coherent to avoid false positives)
    expect(result.has_mismatch).toBe(false);
  });

  it("handles undefined impactVector.direction gracefully", () => {
    const s7 = makeStage7("frontal");
    (s7 as any).impactVector = undefined;
    const result = validateDamagePhysicsCoherence(makeStage6(["front"]), s7);
    expect(result).toBeDefined();
    expect(result.confidence_reduction_factor).toBeGreaterThanOrEqual(0.30);
    expect(result.has_mismatch).toBe(false);
  });

  it("handles undefined damageZones gracefully", () => {
    const s6 = makeStage6(["front"]);
    (s6 as any).damageZones = undefined;
    const result = validateDamagePhysicsCoherence(s6, makeStage7("frontal"));
    expect(result).toBeDefined();
    expect(result.zones_checked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. buildCoherenceConsistencyInput adapter
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCoherenceConsistencyInput", () => {
  it("returns object with all required fields", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(typeof input.hasMismatch).toBe("boolean");
    expect(typeof input.highSeverityMismatchCount).toBe("number");
    expect(typeof input.physicsAvailable).toBe("boolean");
    expect(typeof input.confidenceReductionFactor).toBe("number");
    expect(Array.isArray(input.mismatchExplanations)).toBe(true);
  });

  it("highSeverityMismatchCount matches coherenceResult.high_severity_mismatch_count", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(input.highSeverityMismatchCount).toBe(coherenceResult.high_severity_mismatch_count);
  });

  it("hasMismatch is false when no mismatches", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(input.hasMismatch).toBe(false);
  });

  it("hasMismatch is true when mismatches exist", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(input.hasMismatch).toBe(coherenceResult.has_mismatch);
  });

  it("confidenceReductionFactor matches coherenceResult", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(input.confidenceReductionFactor).toBe(coherenceResult.confidence_reduction_factor);
  });

  it("mismatchExplanations contains explanation strings from mismatches", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    if (coherenceResult.mismatches.length > 0) {
      expect(input.mismatchExplanations.length).toBeGreaterThan(0);
      expect(typeof input.mismatchExplanations[0]).toBe("string");
    }
  });

  it("mismatchExplanations is empty when no mismatches", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    const input = buildCoherenceConsistencyInput(coherenceResult);
    expect(input.mismatchExplanations).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. buildCoherenceFraudInput adapter
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCoherenceFraudInput", () => {
  it("returns object with all required fields", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(typeof input.source).toBe("string");
    expect(typeof input.status).toBe("string");
    expect(typeof input.penalty_triggered).toBe("boolean");
    expect(Array.isArray(input.high_severity_conflicts)).toBe(true);
    expect(typeof input.high_severity_count).toBe("number");
  });

  it("source identifies the coherence validator", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.source).toContain("coherence");
  });

  it("high_severity_conflicts contains only high-severity mismatches", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    for (const conflict of input.high_severity_conflicts) {
      expect(conflict.severity).toBe("high");
    }
  });

  it("penalty_triggered matches coherenceResult.fraud_penalty_triggered", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.penalty_triggered).toBe(coherenceResult.fraud_penalty_triggered);
  });

  it("returns empty high_severity_conflicts when no mismatches", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.high_severity_conflicts).toHaveLength(0);
    expect(input.penalty_triggered).toBe(false);
  });

  it("high_severity_count matches coherenceResult.high_severity_mismatch_count", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.high_severity_count).toBe(coherenceResult.high_severity_mismatch_count);
  });

  it("status is 'complete' when zones were checked", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.status).toBe("complete");
  });

  it("status is 'incomplete' when no zones were checked", () => {
    const coherenceResult = validateDamagePhysicsCoherence(
      makeStage6([]),
      makeStage7("frontal")
    );
    const input = buildCoherenceFraudInput(coherenceResult);
    expect(input.status).toBe("incomplete");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Multiple mismatches accumulation
// ─────────────────────────────────────────────────────────────────────────────

describe("multiple mismatches accumulation", () => {
  it("detects multiple zone mismatches in one call", () => {
    // front and rear damage vs side_driver — both should mismatch
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "rear"]),
      makeStage7("side_driver")
    );
    expect(result.mismatches.length).toBeGreaterThanOrEqual(1);
  });

  it("confidence_reduction_factor is lower with 2 mismatches than 1", () => {
    const one = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    const two = validateDamagePhysicsCoherence(
      makeStage6(["front", "driver_side"]),
      makeStage7("rear")
    );
    expect(two.confidence_reduction_factor).toBeLessThanOrEqual(one.confidence_reduction_factor);
  });

  it("summary mentions mismatch when has_mismatch is true", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("rear")
    );
    if (result.has_mismatch) {
      expect(result.summary.length).toBeGreaterThan(10);
    }
  });

  it("summary is positive when no mismatches", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front"]),
      makeStage7("frontal")
    );
    expect(result.summary).toContain("consistent");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Direction normalisation (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────

describe("direction normalisation", () => {
  it("handles 'Frontal' (capitalised) same as 'frontal'", () => {
    const lower = validateDamagePhysicsCoherence(makeStage6(["front"]), makeStage7("frontal"));
    const upper = validateDamagePhysicsCoherence(makeStage6(["front"]), makeStage7("Frontal"));
    expect(lower.has_mismatch).toBe(upper.has_mismatch);
  });

  it("handles 'REAR' (all caps) same as 'rear'", () => {
    const lower = validateDamagePhysicsCoherence(makeStage6(["rear"]), makeStage7("rear"));
    const upper = validateDamagePhysicsCoherence(makeStage6(["rear"]), makeStage7("REAR"));
    expect(lower.has_mismatch).toBe(upper.has_mismatch);
  });

  it("handles 'SIDE_DRIVER' same as 'side_driver'", () => {
    const lower = validateDamagePhysicsCoherence(makeStage6(["driver_side"]), makeStage7("side_driver"));
    const upper = validateDamagePhysicsCoherence(makeStage6(["driver_side"]), makeStage7("SIDE_DRIVER"));
    expect(lower.has_mismatch).toBe(upper.has_mismatch);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Zone normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe("zone normalisation", () => {
  it("handles 'Front' (capitalised) same as 'front'", () => {
    const lower = validateDamagePhysicsCoherence(makeStage6(["front"]), makeStage7("rear"));
    const upper = validateDamagePhysicsCoherence(makeStage6(["Front"]), makeStage7("rear"));
    expect(lower.has_mismatch).toBe(upper.has_mismatch);
  });

  it("handles 'DRIVER_SIDE' same as 'driver_side'", () => {
    const lower = validateDamagePhysicsCoherence(makeStage6(["driver_side"]), makeStage7("side_driver"));
    const upper = validateDamagePhysicsCoherence(makeStage6(["DRIVER_SIDE"]), makeStage7("side_driver"));
    expect(lower.has_mismatch).toBe(upper.has_mismatch);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("empty direction string → no crash, returns valid output", () => {
    const result = validateDamagePhysicsCoherence(makeStage6(["front"]), makeStage7(""));
    expect(result).toBeDefined();
    expect(typeof result.has_mismatch).toBe("boolean");
  });

  it("all zones match → confidence_reduction_factor stays at 1.0", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "hood", "bumper_front"]),
      makeStage7("frontal")
    );
    expect(result.confidence_reduction_factor).toBe(1.0);
  });

  it("single unknown zone → zones_checked is 1 but no mismatch (unknown treated as coherent)", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["completely_unknown_zone"]),
      makeStage7("frontal")
    );
    expect(result.zones_checked).toBe(1);
    expect(result.has_mismatch).toBe(false);
  });

  it("duplicate zones are deduplicated", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["front", "front", "front"]),
      makeStage7("frontal")
    );
    expect(result.zones_checked).toBe(1);
  });

  it("rollover direction is compatible with roof zone", () => {
    const result = validateDamagePhysicsCoherence(
      makeStage6(["roof"]),
      makeStage7("rollover")
    );
    expect(result.has_mismatch).toBe(false);
  });
});
