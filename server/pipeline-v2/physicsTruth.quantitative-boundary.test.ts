import { describe, expect, it } from "vitest";

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
    stage6LlmCrushDepthM: 0.3,
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
    expect(result.geometry.crushDepth.canonicalSourceReason).toMatch(
      /two independent/i
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
});
