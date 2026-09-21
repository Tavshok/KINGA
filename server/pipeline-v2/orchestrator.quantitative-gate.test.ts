import { describe, expect, it } from "vitest";

import {
  buildUnifiedStage7FailurePhysics,
  readReusableUnifiedStage7Cache,
} from "./orchestrator";

describe("unified Stage 7 failure geometry boundary", () => {
  const claimRecord = {
    accidentDetails: { collisionDirection: "frontal" },
  } as any;

  it("retains null-valued review physics after a timeout without qualifying geometry", () => {
    const physics = buildUnifiedStage7FailurePhysics(
      {
        vgeCalibrationResult: {
          calibrationAvailable: false,
          calibratedCrushDepthM: null,
          confidenceLevel: "NONE",
        },
        vgeReconciliationResult: null,
      } as any,
      claimRecord,
      "stage_timeout"
    );

    expect(physics.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(physics.impactForceKn).toBeNull();
    expect(physics.estimatedSpeedKmh).toBeNull();
    expect(physics.energyDistribution.kineticEnergyJ).toBeNull();
    expect(physics.decelerationG).toBeNull();
  });

  it("rejects a numerically populated LOW-confidence VGR after a thrown exception", () => {
    const physics = buildUnifiedStage7FailurePhysics(
      {
        vgeCalibrationResult: null,
        vgeReconciliationResult: {
          reconciliationAvailable: true,
          consensusCrushDepthM: 0.5,
          confidenceLevel: "LOW",
          imageEntries: [
            { contributesToConsensus: true },
            { contributesToConsensus: true },
          ],
          agreementAssessment: { contributingImages: 2 },
        },
      } as any,
      claimRecord,
      "engine_failure"
    );

    expect(physics.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(physics.impactForceKn).toBeNull();
    expect(physics.energyDistribution.energyDissipatedJ).toBeNull();
  });

  it("does not emit generic numeric fallback physics when qualified geometry fails", () => {
    const physics = buildUnifiedStage7FailurePhysics(
      {
        vgeCalibrationResult: {
          calibrationAvailable: true,
          calibratedCrushDepthM: 0.21,
          calibratedCrushDepthMinM: 0.18,
          calibratedCrushDepthMaxM: 0.24,
          overallCalibrationConfidence: 0.8,
          confidenceLevel: "HIGH",
        },
        vgeReconciliationResult: null,
      } as any,
      claimRecord,
      "stage_timeout"
    );

    expect(physics.physicsStatus).toBe("SKIPPED_ENGINE_FAILURE");
    expect(physics.physicsExecuted).toBe(false);
    expect(physics.impactForceKn).toBeNull();
    expect(physics.impactVector.magnitude).toBeNull();
    expect(physics.energyDistribution.kineticEnergyJ).toBeNull();
    expect(physics.energyDistribution.energyDissipatedJ).toBeNull();
    expect(physics.estimatedSpeedKmh).toBeNull();
    expect(physics.deltaVKmh).toBeNull();
    expect(physics.decelerationG).toBeNull();
    expect(physics.accidentReconstructionSummary).toMatch(
      /no numerical fallback/i
    );
  });

  it("never resumes an unversioned cached physics payload", () => {
    const preCorrectionCache = {
      physicsAnalysis: {
        physicsStatus: "EXECUTED",
        impactForceKn: 999,
        estimatedSpeedKmh: 120,
      },
    };

    expect(readReusableUnifiedStage7Cache(preCorrectionCache)).toBeUndefined();
  });
});
