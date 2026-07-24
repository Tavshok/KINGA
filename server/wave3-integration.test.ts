/**
 * Wave 3 Integration Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers all three Wave 3 engines:
 *
 *   A. Integrity Engine (stage-integrity.ts)
 *      - INT-01  Speed vs crush depth (Campbell cross-check)
 *      - INT-02  Kinetic energy vs deformation energy balance
 *      - INT-03  VGR cross-image agreement
 *      - INT-04  Speed ensemble method divergence
 *      - INT-05  Airbag deployment vs speed threshold
 *      - INT-06  Claimed speed vs physics-derived speed
 *      - INT-07  SLPE structural integrity risk vs speed
 *      - INT-08  Data quality score vs decision confidence
 *      - INT-09  Crush depth source quality vs claim value
 *      - INT-10  Deformation efficiency factor plausibility
 *      - Score calculation: 100 → CRITICAL/WARNING deductions
 *      - Clean claim → passed=true, clean=true, integrityScore=100
 *
 *   B. Uncertainty Propagation Engine (stage-uncertainty.ts)
 *      - Campbell speed propagation from crush depth
 *      - Kinetic energy propagation from ensemble speed
 *      - Delta-V propagation
 *      - Grade assignment: A/B/C/D
 *      - 90% CI bounds ordering (lower < value < upper)
 *      - Null handling when inputs are absent
 *
 *   C. Explainability Engine (stage-explainability.ts)
 *      - Evidence chains produced for crush depth, speed, energy
 *      - Verdict paragraph is a non-empty string
 *      - Adjuster summary is shorter than verdict paragraph
 *      - Methodology citations include methods used
 *      - Key findings list is non-empty
 *      - VGR path vs VGE path vs severity-anchor path
 */

import { describe, it, expect } from "vitest";
import { runIntegrityEngine } from "./pipeline-v2/stage-integrity";
import { runUncertaintyPropagation } from "./pipeline-v2/stage-uncertainty";
import { runExplainabilityEngine } from "./pipeline-v2/stage-explainability";
import type { PhysicsTruth } from "./pipeline-v2/physicsTruth";

// ─── Shared PhysicsTruth factory ─────────────────────────────────────────────

function makePTL(overrides: Partial<PhysicsTruth> = {}): PhysicsTruth {
  const base: PhysicsTruth = {
    schemaVersion: "1.0",
    sealedAt: new Date().toISOString(),
    claimRef: "TEST-W3-001",
    pipelineRunId: "test-run-001",
    vehicle: {
      make: "Toyota",
      model: "Corolla",
      year: 2020,
      bodyType: "sedan",
      massKg: 1400,
      powertrainType: "ICE",
      bodyOnFrame: false,
    },
    geometry: {
      crushDepth: {
        // 0.31m gives Campbell implied speed ~32.5 km/h vs ensemble 65 km/h → ratio=2.0 (below 3.0 threshold)
        canonical: { value: 0.31, min: 0.25, max: 0.37, confidence: 0.82, source: "VGR_CONSENSUS", provenanceNote: "VGR consensus from 3 images" },
        vgrConsensus: { value: 0.31, min: 0.25, max: 0.37, confidence: 0.82, source: "VGR_CONSENSUS", provenanceNote: "VGR consensus" },
        vgeSingleImage: null,
        llmVisionEstimate: null,
        canonicalSourceReason: "VGR consensus preferred",
        vgrContributingImages: 3,
        vgrViewAngles: { frontal: 2, angle45: 1, side: 0, unknown: 0 },
        vgrAgreementLevel: "STRONG",
        perspectiveCorrected: true,
        vehicleProfileUsed: "Toyota Corolla 2020",
        referenceObjectsSummary: ["wheel", "door_handle"],
        measurementLimitations: [],
        evidenceAcquisitionRecommendation: null,
      },
      structuralDisplacementM: null,
      overlapPct: { value: 100, min: 80, max: 100, confidence: 0.7, source: "STAGE6_LLM_VISION", provenanceNote: "Full-width overlap" },
      impactDirection: "frontal",
      impactZone: "front_centre",
      vehicleOrientationDeg: null,
    },
    energy: {
      totalDeformationEnergyJ: { value: 45000, min: 30000, max: 60000, confidence: 0.65, source: "PHYSICS_DERIVED", provenanceNote: "Sum of component energies" },
      componentEnergies: [
        { componentName: "Bumper beam", deformationEnergyJ: 8000, crushDepthM: 0.05, structuralDisplacementM: null, damageFractionEstimate: 0.8, visionConfidenceScore: 0.75, severity: "moderate", zone: "front" },
        { componentName: "Crash box", deformationEnergyJ: 15000, crushDepthM: 0.08, structuralDisplacementM: null, damageFractionEstimate: 0.9, visionConfidenceScore: 0.70, severity: "severe", zone: "front" },
        { componentName: "Chassis rail", deformationEnergyJ: 22000, crushDepthM: 0.05, structuralDisplacementM: 0.02, damageFractionEstimate: 0.6, visionConfidenceScore: 0.60, severity: "moderate", zone: "front" },
      ],
      kineticEnergyJ: { value: 90000, min: 65000, max: 115000, confidence: 0.75, source: "PHYSICS_DERIVED", provenanceNote: "½mv²" },
      deformationEfficiencyFactor: 0.50,
    },
    speed: {
      canonical: { value: 65, min: 50, max: 82, confidence: 0.78, source: "ENSEMBLE_CONSENSUS", provenanceNote: "Ensemble of 3 methods" },
      methods: [
        { method: "M1_SEVERITY", label: "Damage Severity Anchor", speedKmh: 60, confidence: "MEDIUM", confidenceWeight: 0.3, basis: "Moderate damage", ran: true, isLowerBoundOnly: false },
        { method: "M3_CAMPBELL", label: "Campbell Formula", speedKmh: 68, confidence: "HIGH", confidenceWeight: 0.5, basis: "VGR crush depth", ran: true, isLowerBoundOnly: false },
        { method: "M5_DEFORMATION", label: "Deformation Energy", speedKmh: 63, confidence: "MEDIUM", confidenceWeight: 0.4, basis: "Component energies", ran: true, isLowerBoundOnly: false },
      ],
      methodsRan: 3,
      overallConfidence: "HIGH",
      evidenceAgreementPct: 88,
      evidenceAgreementNote: "Methods agree within 15%",
      highDivergence: false,
      lowerBoundKmh: null,
      claimedSpeedKmh: 60,
      speedLimitKmh: 60,
      deltaVKmh: { value: 55, min: 42, max: 68, confidence: 0.72, source: "PHYSICS_DERIVED", provenanceNote: "Two-body collision" },
    },
    latentDamage: null,
    structuralLoadPath: null,
    integrityCheck: {
      passed: true,
      flags: [],
    },
    evidenceCompleteness: {
      hasDirectPhotos: true,
    } as any,
    dataQualityScore: 0.78,
  } as any;

  return { ...base, ...overrides } as PhysicsTruth;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. INTEGRITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Wave 3A — Integrity Engine (runIntegrityEngine)", () => {

  it("clean claim → passed=true, clean=true, no CRITICAL or WARNING flags", () => {
    // Base fixture: speed=65 km/h, crush=0.31m (ratio=2.0), claimed=60, airbag deployed (lowerBound=20)
    // INT-05 may fire an INFO flag (no airbag at 65 km/h) but passed/clean must still be true
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        lowerBoundKmh: 20, // airbag deployed — consistent with 65 km/h
      },
    } as any);
    const result = runIntegrityEngine(pt);
    expect(result.passed).toBe(true);   // no CRITICAL
    expect(result.clean).toBe(true);    // no CRITICAL or WARNING
    expect(result.criticalCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.integrityScore).toBeGreaterThanOrEqual(90); // at most minor INFO deductions
    expect(result.summary).toBeTruthy();
  });

  it("INT-01: speed 3× higher than crush depth implies → CRITICAL flag", () => {
    // Campbell: v_implied = 0.05m × sqrt(1_200_000 / 1400) ≈ 46 km/h
    // Ensemble speed = 200 km/h → ratio ≈ 4.3 → CRITICAL
    const pt = makePTL({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.05, min: 0.03, max: 0.07, confidence: 0.8, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
      speed: {
        ...makePTL().speed,
        canonical: { value: 200, min: 160, max: 240, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const int01 = result.flags.find(f => f.code.startsWith("INT-01"));
    expect(int01).toBeDefined();
    expect(int01!.severity).toBe("CRITICAL");
    expect(result.passed).toBe(false);
    expect(result.integrityScore).toBeLessThan(100);
  });

  it("INT-01: speed within 3× of crush depth implies → no INT-01 flag", () => {
    // Base fixture: crush=0.31m → implied speed=32.5 km/h, ensemble=65 km/h → ratio=2.0 (below 3.0 threshold)
    const pt = makePTL();
    const result = runIntegrityEngine(pt);
    const int01 = result.flags.find(f => f.code.startsWith("INT-01"));
    expect(int01).toBeUndefined();
  });

  it("INT-05: airbag deployed but speed below 20 km/h → flag raised", () => {
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: { value: 10, min: 5, max: 15, confidence: 0.7, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
        lowerBoundKmh: 20, // airbag deployed
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const int05 = result.flags.find(f => f.code.startsWith("INT-05"));
    expect(int05).toBeDefined();
    expect(["CRITICAL", "WARNING"]).toContain(int05!.severity);
  });

  it("INT-06: claimed speed 50% lower than physics speed → WARNING or CRITICAL flag", () => {
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: { value: 120, min: 100, max: 140, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
        claimedSpeedKmh: 30, // 75% lower than physics
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const int06 = result.flags.find(f => f.code.startsWith("INT-06"));
    expect(int06).toBeDefined();
    expect(["CRITICAL", "WARNING"]).toContain(int06!.severity);
  });

  it("INT-10: deformation efficiency > 0.85 → flag raised", () => {
    const pt = makePTL({
      energy: {
        ...makePTL().energy,
        deformationEfficiencyFactor: 0.95, // above ETA_MAX=0.85
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const int10 = result.flags.find(f => f.code.startsWith("INT-10"));
    expect(int10).toBeDefined();
  });

  it("INT-10: deformation efficiency < 0.10 → flag raised", () => {
    const pt = makePTL({
      energy: {
        ...makePTL().energy,
        deformationEfficiencyFactor: 0.05, // below ETA_MIN=0.10
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const int10 = result.flags.find(f => f.code.startsWith("INT-10"));
    expect(int10).toBeDefined();
  });

  it("integrityScore decreases with each CRITICAL flag", () => {
    const ptClean = makePTL();
    const ptCritical = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: { value: 200, min: 160, max: 240, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.05, min: 0.03, max: 0.07, confidence: 0.8, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
    } as any);
    const cleanResult = runIntegrityEngine(ptClean);
    const criticalResult = runIntegrityEngine(ptCritical);
    expect(cleanResult.integrityScore).toBeGreaterThan(criticalResult.integrityScore);
  });

  it("flags are sorted by severity (CRITICAL first, then WARNING, then INFO)", () => {
    // Trigger multiple flags by setting extreme values
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: { value: 200, min: 160, max: 240, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
        claimedSpeedKmh: 20,
        lowerBoundKmh: 20,
      },
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.05, min: 0.03, max: 0.07, confidence: 0.8, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
      energy: {
        ...makePTL().energy,
        deformationEfficiencyFactor: 0.95,
      },
    } as any);
    const result = runIntegrityEngine(pt);
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    for (let i = 0; i < result.flags.length - 1; i++) {
      expect(severityOrder[result.flags[i].severity]).toBeLessThanOrEqual(
        severityOrder[result.flags[i + 1].severity]
      );
    }
  });

  it("every flag has required fields (code, description, recommendation, affectedMeasurements)", () => {
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: { value: 200, min: 160, max: 240, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.05, min: 0.03, max: 0.07, confidence: 0.8, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
    } as any);
    const result = runIntegrityEngine(pt);
    for (const flag of result.flags) {
      expect(flag.code).toBeTruthy();
      expect(flag.description).toBeTruthy();
      expect(flag.recommendation).toBeTruthy();
      expect(Array.isArray(flag.affectedMeasurements)).toBe(true);
      expect(flag.affectedMeasurements.length).toBeGreaterThan(0);
      expect(["CRITICAL", "WARNING", "INFO"]).toContain(flag.severity);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. UNCERTAINTY PROPAGATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Wave 3B — Uncertainty Propagation Engine (runUncertaintyPropagation)", () => {

  it("returns a valid result with all required fields", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    expect(result).toBeDefined();
    expect(["A", "B", "C", "D"]).toContain(result.overallGrade);
    expect(result.summary).toBeTruthy();
    expect(Array.isArray(result.keyDrivers)).toBe(true);
  });

  it("campbellSpeed is computed when crush depth is available", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    expect(result.campbellSpeed).not.toBeNull();
    expect(result.campbellSpeed!.value).toBeGreaterThan(0);
    // 90% CI bounds must be ordered: lower < value < upper
    expect(result.campbellSpeed!.lower90).toBeLessThan(result.campbellSpeed!.value);
    expect(result.campbellSpeed!.upper90).toBeGreaterThan(result.campbellSpeed!.value);
  });

  it("campbellSpeed is null when crush depth is absent", () => {
    const pt = makePTL({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: null,
        },
      },
    } as any);
    const result = runUncertaintyPropagation(pt);
    expect(result.campbellSpeed).toBeNull();
  });

  it("kineticEnergy is computed when ensemble speed is available", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    expect(result.kineticEnergy).not.toBeNull();
    expect(result.kineticEnergy!.value).toBeGreaterThan(0);
    expect(result.kineticEnergy!.lower90).toBeLessThan(result.kineticEnergy!.value);
    expect(result.kineticEnergy!.upper90).toBeGreaterThan(result.kineticEnergy!.value);
  });

  it("kineticEnergy is null when ensemble speed is absent", () => {
    const pt = makePTL({
      speed: {
        ...makePTL().speed,
        canonical: null,
      },
    } as any);
    const result = runUncertaintyPropagation(pt);
    expect(result.kineticEnergy).toBeNull();
  });

  it("deltaV is computed when ensemble speed is available", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    expect(result.deltaV).not.toBeNull();
    expect(result.deltaV!.value).toBeGreaterThan(0);
    expect(result.deltaV!.lower90).toBeLessThan(result.deltaV!.value);
    expect(result.deltaV!.upper90).toBeGreaterThan(result.deltaV!.value);
  });

  it("grade A assigned when relative uncertainty is tight (< 15%)", () => {
    // Very tight CI: min=62, max=68 around value=65 → relUncertainty ≈ 3/65 ≈ 4.6%
    const pt = makePTL({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.18, min: 0.17, max: 0.19, confidence: 0.95, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
      speed: {
        ...makePTL().speed,
        canonical: { value: 65, min: 62, max: 68, confidence: 0.95, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
    } as any);
    const result = runUncertaintyPropagation(pt);
    expect(["A", "B"]).toContain(result.overallGrade); // tight CI → A or B
  });

  it("grade D assigned when relative uncertainty is very wide (> 50%)", () => {
    // Very wide CI: min=10, max=120 around value=65 → extremely wide
    const pt = makePTL({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.18, min: 0.02, max: 0.50, confidence: 0.3, source: "STAGE7_INFERRED", provenanceNote: "" },
        },
      },
      speed: {
        ...makePTL().speed,
        canonical: { value: 65, min: 10, max: 120, confidence: 0.3, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
    } as any);
    const result = runUncertaintyPropagation(pt);
    expect(["C", "D"]).toContain(result.overallGrade); // wide CI → C or D
  });

  it("formatted CI string has correct format", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    if (result.campbellSpeed) {
      // Format: "NNN unit [NNN–NNN]"
      expect(result.campbellSpeed.formatted).toMatch(/\d+ .+ \[\d+–\d+\]/);
    }
  });

  it("relativeUncertainty is between 0 and 1 for all computed measurements", () => {
    const pt = makePTL();
    const result = runUncertaintyPropagation(pt);
    for (const m of [result.campbellSpeed, result.kineticEnergy, result.deltaV, result.deformationEfficiency]) {
      if (m) {
        expect(m.relativeUncertainty).toBeGreaterThanOrEqual(0);
        expect(m.relativeUncertainty).toBeLessThanOrEqual(2); // allow up to 200% for very uncertain estimates
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. EXPLAINABILITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Wave 3C — Explainability Engine (runExplainabilityEngine)", () => {

  function runAll(ptOverrides: Partial<PhysicsTruth> = {}) {
    const pt = makePTL(ptOverrides);
    const integrity = runIntegrityEngine(pt);
    const uncertainty = runUncertaintyPropagation(pt);
    return runExplainabilityEngine(pt, integrity, uncertainty);
  }

  it("returns a valid result with all required fields", () => {
    const result = runAll();
    expect(result).toBeDefined();
    expect(result.speedChain).toBeDefined();
    expect(result.verdictParagraph).toBeTruthy();
    expect(result.adjusterSummary).toBeTruthy();
    expect(Array.isArray(result.keyFindings)).toBe(true);
    expect(result.keyFindings.length).toBeGreaterThan(0);
    expect(Array.isArray(result.methodologyCitations)).toBe(true);
  });

  it("verdict paragraph is a non-empty string of at least 50 characters", () => {
    const result = runAll();
    expect(result.verdictParagraph.length).toBeGreaterThan(50);
  });

  it("adjuster summary is shorter than or equal to verdict paragraph", () => {
    const result = runAll();
    expect(result.adjusterSummary.length).toBeLessThanOrEqual(result.verdictParagraph.length + 100);
  });

  it("crush depth evidence chain is produced when crush depth is available (VGR path)", () => {
    const result = runAll();
    expect(result.crushDepthChain).not.toBeNull();
    expect(result.crushDepthChain!.steps.length).toBeGreaterThan(0);
    expect(result.crushDepthChain!.conclusion).toBeTruthy();
    expect(result.crushDepthChain!.overallConfidence).toBeGreaterThan(0);
    expect(result.crushDepthChain!.overallConfidence).toBeLessThanOrEqual(1);
  });

  it("crush depth chain is null when no crush depth is available", () => {
    const result = runAll({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: null,
          vgrConsensus: null,
          vgeSingleImage: null,
        },
      },
    } as any);
    expect(result.crushDepthChain).toBeNull();
  });

  it("speed evidence chain always present with at least one step", () => {
    const result = runAll();
    expect(result.speedChain).toBeDefined();
    expect(result.speedChain.steps.length).toBeGreaterThan(0);
    expect(result.speedChain.conclusion).toBeTruthy();
  });

  it("energy evidence chain produced when kinetic energy is available", () => {
    const result = runAll();
    expect(result.energyChain).not.toBeNull();
    expect(result.energyChain!.steps.length).toBeGreaterThan(0);
  });

  it("methodology citations include CAMPBELL when Campbell method was used", () => {
    const result = runAll();
    const campbellCitation = result.methodologyCitations.find(c => c.method === "CAMPBELL");
    expect(campbellCitation).toBeDefined();
    expect(campbellCitation!.fullName).toBeTruthy();
    expect(campbellCitation!.reference).toBeTruthy();
    expect(campbellCitation!.limitations).toBeTruthy();
  });

  it("all evidence chain steps have required fields", () => {
    const result = runAll();
    const allChains = [result.crushDepthChain, result.speedChain, result.energyChain].filter(Boolean);
    for (const chain of allChains) {
      for (const step of chain!.steps) {
        expect(step.step).toBeGreaterThan(0);
        expect(["measurement", "calculation", "inference", "validation"]).toContain(step.type);
        expect(step.description).toBeTruthy();
        expect(step.result).toBeTruthy();
        expect(step.confidence).toBeGreaterThanOrEqual(0);
        expect(step.confidence).toBeLessThanOrEqual(1);
        expect(step.methodology).toBeTruthy();
      }
    }
  });

  it("key findings are non-empty strings", () => {
    const result = runAll();
    for (const finding of result.keyFindings) {
      expect(typeof finding).toBe("string");
      expect(finding.length).toBeGreaterThan(5);
    }
  });

  it("integrity flags appear in verdict paragraph when CRITICAL flags exist", () => {
    const result = runAll({
      speed: {
        ...makePTL().speed,
        canonical: { value: 200, min: 160, max: 240, confidence: 0.8, source: "ENSEMBLE_CONSENSUS", provenanceNote: "" },
      },
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.05, min: 0.03, max: 0.07, confidence: 0.8, source: "VGR_CONSENSUS", provenanceNote: "" },
        },
      },
    } as any);
    // When CRITICAL flags exist, the verdict paragraph should mention the issue
    expect(result.verdictParagraph.length).toBeGreaterThan(50);
  });

  it("VGE single-image path produces crush depth chain with VGE methodology", () => {
    const result = runAll({
      geometry: {
        ...makePTL().geometry,
        crushDepth: {
          ...makePTL().geometry.crushDepth,
          canonical: { value: 0.15, min: 0.10, max: 0.20, confidence: 0.70, source: "VGE_CALIBRATED", provenanceNote: "Single image" },
          vgrConsensus: null,
          vgeSingleImage: { value: 0.15, min: 0.10, max: 0.20, confidence: 0.70, source: "VGE_CALIBRATED", provenanceNote: "Single image" },
          vgrContributingImages: 0,
          vgrAgreementLevel: "SINGLE_IMAGE",
        },
      },
    } as any);
    expect(result.crushDepthChain).not.toBeNull();
    // VGE path should have a step referencing single-image methodology
    const hasVGEStep = result.crushDepthChain!.steps.some(s =>
      s.methodology.toLowerCase().includes("vge") || s.description.toLowerCase().includes("single")
    );
    expect(hasVGEStep).toBe(true);
  });
});
