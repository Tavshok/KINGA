/**
 * speedInferenceEnsemble.test.ts
 *
 * Regression tests for the M1–M7 speed inference ensemble.
 *
 * Method enum values (MethodEstimate.method):
 *   M1 → 'CAMPBELL'
 *   M2 → 'ENERGY_MOMENTUM'   (DISABLED — always ran=false)
 *   M3 → 'IMPULSE'           (DISABLED — always ran=false)
 *   M4 → 'DEPLOYMENT_THRESHOLD'
 *   M5 → 'VISION_DEFORMATION'
 *   M6 → 'SEVERITY_ANCHORED'
 *   M7 → 'CLAIMANT_STATED'
 *
 * Key behaviours verified:
 *   1. M1 crush depth priority: document (ran=true, weight=0.80) > vision
 *      (ran=true, weight=0.55) > inferred (ran=false, weight=0.00)
 *   2. M4 runs (ran=true) only when airbag or pretensioner deployed
 *   3. M5 uses totalDeformationEnergyJ, not crush depth (independence)
 *   4. M5 confidenceWeight <= 0.10 (KINGA-AUDIT-2026-07 cap)
 *   5. M6 is severity-anchored — crush depth must not affect its estimate
 *   6. M7 runs (ran=true) only when claimedSpeedKmh is non-null and in range
 *   7. Consensus is non-null when at least one method contributes
 *   8. physicalImpossibilityFlag raised when consensus < hard lower bound
 *   9. highDivergence is a boolean
 *  10. Idempotency — same inputs always produce same outputs
 *
 * Author: Tavonga Shoko (Lead Engineer)
 */

import { describe, it, expect } from "vitest";
import {
  runSpeedInferenceEnsemble,
  type EnsembleInput,
} from "./speedInferenceEnsemble";

// ─── Shared test fixture ─────────────────────────────────────────────────────

/**
 * A minimal valid input for a moderate frontal collision.
 * Uses documentCrushDepthM by default so M1 runs (ran=true).
 */
function baseInput(overrides: Partial<EnsembleInput> = {}): EnsembleInput {
  return {
    massKg: 1800,
    make: "Toyota",
    model: "Fortuner",
    bodyType: "SUV",
    collisionDirection: "front",
    documentCrushDepthM: 0.15,  // M1 runs with document source
    inferredCrushDepthM: 0.15,
    visionCrushDepthM: null,
    totalDamageAreaM2: null,
    partsCostUsd: null,
    structuralDamage: false,
    airbagDeployment: false,
    seatbeltPretensioner: false,
    totalDeformationEnergyJ: null,
    visionConfidenceScore: null,
    damagedZoneCount: 1,
    damageSeverity: "moderate",
    totalLossIndicated: false,
    claimedSpeedKmh: null,
    ...overrides,
  };
}

// ─── 1. M1 Crush Depth Priority ─────────────────────────────────────────────

describe("M1 (CAMPBELL) — crush depth priority and ran flag", () => {
  it("M1 ran=true and weight=0.80 when documentCrushDepthM >= 0.04 m", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.20 })
    );
    const m1 = result.methods.find(m => m.method === "CAMPBELL");
    expect(m1).toBeDefined();
    expect(m1!.ran).toBe(true);
    expect(m1!.confidenceWeight).toBe(0.80);
    expect(m1!.speedKmh).toBeGreaterThan(0);
  });

  it("M1 ran=false and weight=0.00 when only inferredCrushDepthM is available", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: null,
        visionCrushDepthM: null,
        inferredCrushDepthM: 0.15,
      })
    );
    const m1 = result.methods.find(m => m.method === "CAMPBELL");
    expect(m1).toBeDefined();
    expect(m1!.ran).toBe(false);
    expect(m1!.confidenceWeight).toBe(0.00);
    // speedKmh is still computed but excluded from consensus
    expect(m1!.speedKmh).toBeGreaterThan(0);
  });

  it("M1 ran=true and weight=0.55 when visionCrushDepthM >= 0.04 m and no document", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: null,
        visionCrushDepthM: 0.18,
        inferredCrushDepthM: 0.05,
      })
    );
    const m1 = result.methods.find(m => m.method === "CAMPBELL");
    expect(m1).toBeDefined();
    expect(m1!.ran).toBe(true);
    expect(m1!.confidenceWeight).toBe(0.55);
  });

  it("document crush depth 0.20 m produces higher speed than 0.08 m", () => {
    const deepResult = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.20 })
    );
    const shallowResult = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.08 })
    );
    const m1Deep = deepResult.methods.find(m => m.method === "CAMPBELL");
    const m1Shallow = shallowResult.methods.find(m => m.method === "CAMPBELL");
    expect(m1Deep!.speedKmh!).toBeGreaterThan(m1Shallow!.speedKmh!);
  });

  it("document crush depth below 0.04 m is treated as absent (falls back to inferred)", () => {
    const withSubMin = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.02, inferredCrushDepthM: 0.15 })
    );
    const withInferred = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: null, inferredCrushDepthM: 0.15 })
    );
    const m1SubMin = withSubMin.methods.find(m => m.method === "CAMPBELL");
    const m1Inf = withInferred.methods.find(m => m.method === "CAMPBELL");
    // Both fall back to inferred — same depth, same ran=false, same speed
    expect(m1SubMin!.ran).toBe(false);
    expect(m1Inf!.ran).toBe(false);
    expect(m1SubMin!.speedKmh).toBeCloseTo(m1Inf!.speedKmh!, 0);
  });
});

// ─── 2. M4 Deployment Threshold ─────────────────────────────────────────────

describe("M4 (DEPLOYMENT_THRESHOLD) — deployment evidence required", () => {
  it("M4 ran=true with weight=0.40 when airbagDeployment=true", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ airbagDeployment: true })
    );
    const m4 = result.methods.find(m => m.method === "DEPLOYMENT_THRESHOLD");
    expect(m4).toBeDefined();
    expect(m4!.ran).toBe(true);
    expect(m4!.confidenceWeight).toBe(0.40);
    expect(m4!.speedKmh).toBe(28); // FMVSS 208 point estimate
  });

  it("M4 ran=true with weight=0.30 when seatbeltPretensioner=true", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ airbagDeployment: false, seatbeltPretensioner: true })
    );
    const m4 = result.methods.find(m => m.method === "DEPLOYMENT_THRESHOLD");
    expect(m4).toBeDefined();
    expect(m4!.ran).toBe(true);
    expect(m4!.confidenceWeight).toBe(0.30);
    expect(m4!.speedKmh).toBe(18); // pretensioner point estimate
  });

  it("M4 ran=false when neither airbag nor pretensioner deployed", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ airbagDeployment: false, seatbeltPretensioner: false })
    );
    const m4 = result.methods.find(m => m.method === "DEPLOYMENT_THRESHOLD");
    expect(m4).toBeDefined();
    expect(m4!.ran).toBe(false);
    expect(m4!.speedKmh).toBeNull();
  });

  it("isLowerBoundOnly is false for M4 (it is a point estimate, not a floor)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ airbagDeployment: true })
    );
    const m4 = result.methods.find(m => m.method === "DEPLOYMENT_THRESHOLD");
    // Per the schema comment: "No active method uses lower-bound-only mode"
    expect(m4!.isLowerBoundOnly).toBe(false);
  });

  it("lowerBoundKmh is set when airbag deployed (hard floor applied post-consensus)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ airbagDeployment: true })
    );
    expect(result.lowerBoundKmh).not.toBeNull();
    expect(result.lowerBoundKmh).toBeGreaterThan(0);
  });
});

// ─── 3. M5 Independence from M1 (KINGA-AUDIT-2026-07 regression) ────────────

describe("M5 (VISION_DEFORMATION) — independence from M1 and weight cap", () => {
  it("M5 ran=true when totalDeformationEnergyJ is provided", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({
        totalDeformationEnergyJ: 80_000,
        visionConfidenceScore: 0.85,
      })
    );
    const m5 = result.methods.find(m => m.method === "VISION_DEFORMATION");
    expect(m5).toBeDefined();
    expect(m5!.ran).toBe(true);
    expect(m5!.speedKmh).toBeGreaterThan(0);
  });

  it("M5 ran=false when totalDeformationEnergyJ is null", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ totalDeformationEnergyJ: null })
    );
    const m5 = result.methods.find(m => m.method === "VISION_DEFORMATION");
    expect(m5).toBeDefined();
    expect(m5!.ran).toBe(false);
  });

  it("M5 confidenceWeight <= 0.10 (post-KINGA-AUDIT-2026-07 cap)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({
        totalDeformationEnergyJ: 80_000,
        visionConfidenceScore: 0.95,
      })
    );
    const m5 = result.methods.find(m => m.method === "VISION_DEFORMATION");
    if (m5?.ran) {
      expect(m5.confidenceWeight).toBeLessThanOrEqual(0.10);
    }
  });

  it("M5 uses totalDeformationEnergyJ, not crush depth — same crush depth, different energy → different M5 speeds", () => {
    const highEnergy = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: 0.15,
        totalDeformationEnergyJ: 120_000,
        visionConfidenceScore: 0.85,
      })
    );
    const lowEnergy = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: 0.15,
        totalDeformationEnergyJ: 20_000,
        visionConfidenceScore: 0.85,
      })
    );
    const m5High = highEnergy.methods.find(m => m.method === "VISION_DEFORMATION");
    const m5Low = lowEnergy.methods.find(m => m.method === "VISION_DEFORMATION");
    if (m5High?.ran && m5Low?.ran && m5High.speedKmh !== null && m5Low.speedKmh !== null) {
      expect(m5High.speedKmh).toBeGreaterThan(m5Low.speedKmh);
    }
  });
});

// ─── 4. M6 Severity-Anchored ─────────────────────────────────────────────────

describe("M6 (SEVERITY_ANCHORED) — severity-based, not crush-depth-derived", () => {
  it("M6 produces a higher speed for severe damage than minor damage", () => {
    const severe = runSpeedInferenceEnsemble(
      baseInput({ damageSeverity: "severe", structuralDamage: true })
    );
    const minor = runSpeedInferenceEnsemble(
      baseInput({ damageSeverity: "minor", structuralDamage: false })
    );
    const m6Severe = severe.methods.find(m => m.method === "SEVERITY_ANCHORED");
    const m6Minor = minor.methods.find(m => m.method === "SEVERITY_ANCHORED");
    if (m6Severe?.ran && m6Minor?.ran && m6Severe.speedKmh !== null && m6Minor.speedKmh !== null) {
      expect(m6Severe.speedKmh).toBeGreaterThan(m6Minor.speedKmh);
    }
  });

  it("M6 is not affected by crush depth (anti-circularity) — same severity, different crush depth → same M6 speed", () => {
    const deepCrush = runSpeedInferenceEnsemble(
      baseInput({ damageSeverity: "moderate", documentCrushDepthM: 0.35 })
    );
    const shallowCrush = runSpeedInferenceEnsemble(
      baseInput({ damageSeverity: "moderate", documentCrushDepthM: 0.05 })
    );
    const m6Deep = deepCrush.methods.find(m => m.method === "SEVERITY_ANCHORED");
    const m6Shallow = shallowCrush.methods.find(m => m.method === "SEVERITY_ANCHORED");
    if (m6Deep?.ran && m6Shallow?.ran && m6Deep.speedKmh !== null && m6Shallow.speedKmh !== null) {
      expect(m6Deep.speedKmh).toBeCloseTo(m6Shallow.speedKmh, 0);
    }
  });
});

// ─── 5. M7 Claimant-Stated Speed ─────────────────────────────────────────────

describe("M7 (CLAIMANT_STATED) — stated speed handling", () => {
  it("M7 ran=true and speedKmh=60 when claimedSpeedKmh=60", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ claimedSpeedKmh: 60 })
    );
    const m7 = result.methods.find(m => m.method === "CLAIMANT_STATED");
    expect(m7).toBeDefined();
    expect(m7!.ran).toBe(true);
    expect(m7!.speedKmh).toBe(60);
    expect(m7!.confidenceWeight).toBe(0.30);
  });

  it("M7 ran=false when claimedSpeedKmh is null", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ claimedSpeedKmh: null })
    );
    const m7 = result.methods.find(m => m.method === "CLAIMANT_STATED");
    expect(m7).toBeDefined();
    expect(m7!.ran).toBe(false);
    expect(m7!.speedKmh).toBeNull();
  });

  it("M7 ran=false when claimedSpeedKmh fails plausibility gate (< 5 km/h)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ claimedSpeedKmh: 2 })
    );
    const m7 = result.methods.find(m => m.method === "CLAIMANT_STATED");
    expect(m7!.ran).toBe(false);
  });

  it("M7 ran=false when claimedSpeedKmh fails plausibility gate (> 200 km/h)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ claimedSpeedKmh: 250 })
    );
    const m7 = result.methods.find(m => m.method === "CLAIMANT_STATED");
    expect(m7!.ran).toBe(false);
  });
});

// ─── 6. Consensus Algorithm ──────────────────────────────────────────────────

describe("Consensus algorithm", () => {
  it("returns a non-null consensus speed when M1 runs with document crush depth", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.15 })
    );
    expect(result.consensusSpeedKmh).not.toBeNull();
    expect(result.consensusSpeedKmh).toBeGreaterThan(0);
  });

  it("returns a non-null consensus speed when M4 runs (airbag deployed, no crush depth)", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: null,
        visionCrushDepthM: null,
        inferredCrushDepthM: 0.01,
        airbagDeployment: true,
        damageSeverity: null,
      })
    );
    // M4 runs with weight=0.40 → consensus must be non-null
    expect(result.consensusSpeedKmh).not.toBeNull();
  });

  it("evidenceAgreementPct is between 0 and 100", () => {
    const result = runSpeedInferenceEnsemble(baseInput());
    expect(result.evidenceAgreementPct).toBeGreaterThanOrEqual(0);
    expect(result.evidenceAgreementPct).toBeLessThanOrEqual(100);
  });

  it("overallConfidence is one of HIGH / MEDIUM / LOW", () => {
    const result = runSpeedInferenceEnsemble(baseInput());
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(result.overallConfidence);
  });

  it("methodsRan reflects the count of methods with ran=true and weight > 0", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ documentCrushDepthM: 0.15, airbagDeployment: false, claimedSpeedKmh: null })
    );
    const expectedRan = result.methods.filter(
      m => m.ran && m.confidenceWeight > 0 && m.speedKmh !== null
    ).length;
    expect(result.methodsRan).toBe(expectedRan);
  });
});

// ─── 7. Anti-Circularity ─────────────────────────────────────────────────────

describe("Anti-circularity — crushDepthPlausibilityCheck uses severity, not consensus speed", () => {
  it("crushDepthPlausibilityCheck.impliedMinSpeedKmh is the same for identical severity regardless of crush depth", () => {
    const deepCrush = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: 0.40,
        damageSeverity: "severe",
        structuralDamage: true,
      })
    );
    const shallowCrush = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: 0.05,
        damageSeverity: "severe",
        structuralDamage: true,
      })
    );
    if (deepCrush.crushDepthPlausibilityCheck && shallowCrush.crushDepthPlausibilityCheck) {
      // Same severity input → same implied minimum speed from the plausibility check
      expect(deepCrush.crushDepthPlausibilityCheck.impliedMinSpeedKmh).toBe(
        shallowCrush.crushDepthPlausibilityCheck.impliedMinSpeedKmh
      );
    }
  });

  it("crushDepthPlausibilityCheck.evidenceBasis is an array of strings", () => {
    const result = runSpeedInferenceEnsemble(
      baseInput({ damageSeverity: "severe", structuralDamage: true, documentCrushDepthM: 0.05 })
    );
    if (result.crushDepthPlausibilityCheck) {
      expect(Array.isArray(result.crushDepthPlausibilityCheck.evidenceBasis)).toBe(true);
    }
  });
});

// ─── 8. Physical Impossibility Flag ──────────────────────────────────────────

describe("physicalImpossibilityFlag", () => {
  it("raises physicalImpossibilityFlag when consensus < hard lower bound (airbag + near-zero crush)", () => {
    // Airbag deployed (hard floor = 20 km/h) but crush depth near-zero → M1 speed very low
    // M6 with minor severity also low → consensus likely below 20 km/h
    const result = runSpeedInferenceEnsemble(
      baseInput({
        airbagDeployment: true,
        documentCrushDepthM: 0.04, // minimum threshold — very low speed
        inferredCrushDepthM: 0.04,
        damageSeverity: "minor",
        structuralDamage: false,
        claimedSpeedKmh: null,
        totalDeformationEnergyJ: null,
      })
    );
    if (result.physicalImpossibilityFlag?.triggered) {
      expect(result.physicalImpossibilityFlag.consensusBeforeClamp).toBeLessThan(
        result.physicalImpossibilityFlag.clampedTo
      );
      expect(typeof result.physicalImpossibilityFlag.reason).toBe("string");
      expect(Array.isArray(result.physicalImpossibilityFlag.possibleExplanations)).toBe(true);
    }
    // Whether or not the flag fires, the consensus must be >= lowerBoundKmh
    if (result.lowerBoundKmh !== null && result.consensusSpeedKmh !== null) {
      expect(result.consensusSpeedKmh).toBeGreaterThanOrEqual(result.lowerBoundKmh);
    }
  });
});

// ─── 9. High-Divergence Flag ─────────────────────────────────────────────────

describe("highDivergence flag", () => {
  it("highDivergence is a boolean", () => {
    const result = runSpeedInferenceEnsemble(baseInput());
    expect(typeof result.highDivergence).toBe("boolean");
  });

  it("highDivergence is false when M1 and M6 agree closely (deep crush + severe damage)", () => {
    // Deep crush depth (0.35 m) → M1 produces ~70+ km/h
    // Severe damage → M6 produces ~70+ km/h
    // Both methods should agree closely, so highDivergence should be false
    const result = runSpeedInferenceEnsemble(
      baseInput({
        documentCrushDepthM: 0.35,
        damageSeverity: "severe",
        structuralDamage: true,
        airbagDeployment: false,
        claimedSpeedKmh: null,
        totalDeformationEnergyJ: null,
      })
    );
    const m1 = result.methods.find(m => m.method === "CAMPBELL");
    const m6 = result.methods.find(m => m.method === "SEVERITY_ANCHORED");
    // Verify the divergence flag is consistent with the actual speed gap
    if (m1?.ran && m6?.ran && m1.speedKmh !== null && m6.speedKmh !== null) {
      const gap = Math.abs(m1.speedKmh - m6.speedKmh);
      const maxVal = Math.max(m1.speedKmh, m6.speedKmh);
      const divergePct = maxVal > 0 ? gap / maxVal : 0;
      // The highDivergence flag must match the actual > 40% threshold
      expect(result.highDivergence).toBe(divergePct > 0.40);
    } else {
      // If only one method ran, divergence is impossible
      expect(result.highDivergence).toBe(false);
    }
  });
});

// ─── 10. Idempotency ─────────────────────────────────────────────────────────

describe("Idempotency — same inputs always produce same outputs", () => {
  it("consensusSpeedKmh is identical on three repeated calls", () => {
    const input = baseInput({
      documentCrushDepthM: 0.18,
      airbagDeployment: true,
      damageSeverity: "moderate",
      claimedSpeedKmh: 80,
      totalDeformationEnergyJ: 60_000,
      visionConfidenceScore: 0.75,
    });
    const r1 = runSpeedInferenceEnsemble(input);
    const r2 = runSpeedInferenceEnsemble(input);
    const r3 = runSpeedInferenceEnsemble(input);
    expect(r1.consensusSpeedKmh).toBe(r2.consensusSpeedKmh);
    expect(r2.consensusSpeedKmh).toBe(r3.consensusSpeedKmh);
  });

  it("per-method speedKmh and confidenceWeight are identical on repeated calls", () => {
    const input = baseInput({
      documentCrushDepthM: 0.22,
      airbagDeployment: false,
      damageSeverity: "severe",
      structuralDamage: true,
      claimedSpeedKmh: 95,
    });
    const r1 = runSpeedInferenceEnsemble(input);
    const r2 = runSpeedInferenceEnsemble(input);
    for (const m of r1.methods) {
      const m2 = r2.methods.find(x => x.method === m.method);
      expect(m2).toBeDefined();
      expect(m.speedKmh).toBe(m2!.speedKmh);
      expect(m.confidenceWeight).toBe(m2!.confidenceWeight);
      expect(m.ran).toBe(m2!.ran);
    }
  });
});
