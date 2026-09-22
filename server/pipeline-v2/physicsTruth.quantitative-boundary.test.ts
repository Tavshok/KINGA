import { describe, expect, it } from "vitest";

import { assessCrushDepthEligibility } from "../evidence-governance/quantitativeFieldGovernance";
import { buildPhysicsTruth } from "./physicsTruth";

describe("Physics Truth calibrated-crush boundary", () => {
  const baseInput = {
    claimRef: "TEST-QUANTITATIVE-BOUNDARY",
    pipelineRunId: "test-run",
    vehicle: {
      make: "Test",
      model: "Vehicle",
      year: 2020,
      bodyType: "sedan",
      massKg: 1500,
      powertrainType: "ICE",
      bodyOnFrame: false,
    },
    vgeResult: null,
    vgrResult: null,
    stage6Components: [],
    stage6RawCrushDepthCandidatePresent: true,
    crushDepthEligibility: assessCrushDepthEligibility({
      rawStage6CrushDepthCandidatePresent: true,
    }),
    speedEnsemble: null,
    deltaVKmh: null,
    claimedSpeedKmh: null,
    speedLimitKmh: null,
    airbagDeployment: false,
    seatbeltPretensioner: false,
    impactDirection: "frontal",
    impactZone: "front",
  } as const;

  it("does not promote a raw Stage 6 LLM crush estimate when calibration is unavailable", () => {
    const result = buildPhysicsTruth(baseInput);

    expect(result.geometry.crushDepth.canonical).toBeNull();
    expect(result.geometry.crushDepth.llmVisionEstimate).toBeNull();
    expect(result.geometry.crushDepth.eligibility).toMatchObject({
      disposition: "ADVISORY",
      reasonCode: "P0_ADVISORY_RAW_STAGE6_ONLY",
    });
    expect(result.geometry.crushDepth.canonicalSourceReason).toMatch(
      /advisory until P1/i
    );
  });

  it("does not canonicalize numerically populated LOW or unavailable geometry", () => {
    const result = buildPhysicsTruth({
      ...baseInput,
      vgeResult: {
        calibrationAvailable: true,
        calibratedCrushDepthM: 0.42,
        calibratedCrushDepthMinM: 0.35,
        calibratedCrushDepthMaxM: 0.49,
        overallCalibrationConfidence: 0.49,
        confidenceLevel: "LOW",
        perImageResults: [
          { scaleAvailable: true },
          { scaleAvailable: true },
          { scaleAvailable: true },
        ],
        vehicleProfileUsed: "Test Vehicle",
        geometryEvidenceBlock: { referenceObjectsSummary: [] },
      },
      vgrResult: {
        reconciliationAvailable: false,
        consensusCrushDepthM: 0.45,
        consensusCrushDepthMinM: 0.4,
        consensusCrushDepthMaxM: 0.5,
        overallConfidence: 0.9,
        confidenceLevel: "HIGH",
        imageEntries: [{ contributesToConsensus: true }],
        agreementAssessment: { contributingImages: 1, agreementLevel: "WEAK" },
      },
    } as any);

    expect(result.geometry.crushDepth.canonical).toBeNull();
    expect(result.geometry.crushDepth.vgeSingleImage).toBeNull();
    expect(result.geometry.crushDepth.vgrConsensus).toBeNull();
    expect(result.evidenceCompleteness.hasVGECalibration).toBe(false);
    expect(result.evidenceCompleteness.hasVGRConsensus).toBe(false);
    expect(result.evidenceCompleteness.calibratedPhotoCount).toBe(0);
    expect(result.evidenceCompleteness.dataQualityScore).toBe(0);
  });

  it("does not leak numerical causation flags from an adversarial speed ensemble", () => {
    const result = buildPhysicsTruth({
      ...baseInput,
      speedEnsemble: {
        consensusSpeedKmh: 100,
        confidenceInterval: [95, 105],
        overallConfidence: "HIGH",
        methodsRan: 1,
        evidenceAgreementPct: 100,
        evidenceAgreementNote: "Forged numerical ensemble.",
        methods: [
          {
            method: "forged",
            label: "Forged",
            speedKmh: 100,
            confidence: "HIGH",
            confidenceWeight: 1,
            basis: "forged",
            ran: true,
            isLowerBoundOnly: false,
          },
        ],
      },
      deltaVKmh: 80,
      impactCausation: "SELF_REVERSING",
      causationSpeedCeilingKmh: 20,
      reversingNarrativeContradiction: true,
    } as any);
    const serialized = JSON.stringify(result);

    expect(result.speed.canonical).toBeNull();
    expect(result.speed.deltaVKmh).toBeNull();
    expect(result.speed.methods).toEqual([]);
    expect(result.energy.kineticEnergyJ).toBeNull();
    expect(result.energy.deformationEfficiencyFactor).toBeNull();
    expect(result.integrityCheck).toEqual({
      passed: false,
      flags: [
        {
          severity: "INFO",
          code: "P0_COLLISION_PHYSICS_UNAVAILABLE",
          description: expect.stringMatching(/non-governing pending P1/i),
          affectedMeasurements: [],
          recommendation: expect.stringMatching(/manual review/i),
        },
      ],
    });
    expect(serialized).not.toContain("CAUSATION_SPEED_CEILING_BREACH");
    expect(serialized).not.toContain("physically impossible");
    expect(serialized).not.toContain("100 km/h");
  });
});
