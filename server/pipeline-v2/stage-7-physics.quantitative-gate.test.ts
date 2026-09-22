import { describe, expect, it, vi } from "vitest";

const { mockAnalyzeAccidentPhysics } = vi.hoisted(() => ({
  mockAnalyzeAccidentPhysics: vi.fn(),
}));

vi.mock("../accidentPhysics", async importOriginal => {
  const actual = await importOriginal<typeof import("../accidentPhysics")>();
  mockAnalyzeAccidentPhysics.mockImplementation(actual.analyzeAccidentPhysics);
  return {
    ...actual,
    analyzeAccidentPhysics: mockAnalyzeAccidentPhysics,
  };
});

import { runPhysicsStage } from "./stage-7-physics";

describe("Stage 7 quantitative geometry gate", () => {
  it("does not admit raw Stage 6 crush values when VGE/VGR calibration is unavailable", async () => {
    const log = vi.fn();
    const ctx = {
      log,
      vgeCalibrationResult: {
        calibrationAvailable: false,
        calibratedCrushDepthM: null,
        confidenceLevel: "LOW",
      },
      vgeReconciliationResult: {
        reconciliationAvailable: false,
        consensusCrushDepthM: null,
        confidenceLevel: "LOW",
      },
    } as any;
    const claimRecord = {
      vehicle: {
        massKg: 1500,
        make: "Test",
        model: "Vehicle",
        bodyType: "sedan",
      },
      accidentDetails: {
        incidentType: "collision",
        collisionDirection: "frontal",
        estimatedSpeedKmh: 80,
        maxCrushDepthM: 0.45,
      },
      damage: { imageUrls: [], components: [] },
    } as any;
    const damageAnalysis = {
      damagedParts: [
        {
          name: "front bumper",
          location: "front",
          damageType: "crushed",
          severity: "severe",
          visible: true,
          crushDepthM: 0.45,
          structuralDisplacementM: 0.2,
          deformationEnergyJ: 50000,
        },
      ],
      damageZones: [],
      overallSeverityScore: 95,
      structuralDamageDetected: true,
      totalDamageArea: 2.5,
    } as any;

    const result = await runPhysicsStage(ctx, claimRecord, damageAnalysis);

    expect(result.status).toBe("skipped");
    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.physicsExecuted).toBe(false);
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.impactVector.magnitude).toBeNull();
    expect(result.data.decelerationG).toBeNull();
    expect(result.data.energyDistribution.kineticEnergyJ).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
    expect(result.data.speedInferenceEnsemble).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "Stage 7",
      expect.stringContaining("raw Stage 6 crush values were not admitted")
    );
  });

  it("fails closed before the parking-lot calculation when geometry is unavailable", async () => {
    const result = await runPhysicsStage(
      {
        log: vi.fn(),
        vgeCalibrationResult: {
          calibrationAvailable: false,
          calibratedCrushDepthM: null,
          confidenceLevel: "NONE",
        },
        vgeReconciliationResult: null,
      } as any,
      {
        vehicle: {
          massKg: 1500,
          make: "Test",
          model: "Vehicle",
          bodyType: "sedan",
        },
        accidentDetails: {
          incidentType: "collision",
          collisionDirection: "frontal",
          collisionScenario: "parking_lot",
          isParkingLotDamage: true,
          estimatedSpeedKmh: 15,
        },
        damage: { imageUrls: [], components: [] },
      } as any,
      {
        damagedParts: [
          {
            crushDepthM: 0.7,
            structuralDisplacementM: 0.4,
            deformationEnergyJ: 90000,
          },
        ],
        damageZones: [],
        overallSeverityScore: 95,
      } as any
    );

    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.energyDistribution.kineticEnergyJ).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
  });

  it("rejects LOW-confidence VGE/VGR values even when they contain numerical crush", async () => {
    const result = await runPhysicsStage(
      {
        log: vi.fn(),
        vgeCalibrationResult: {
          calibrationAvailable: true,
          calibratedCrushDepthM: 0.6,
          confidenceLevel: "LOW",
        },
        vgeReconciliationResult: {
          reconciliationAvailable: true,
          consensusCrushDepthM: 0.55,
          confidenceLevel: "LOW",
          imageEntries: [
            { contributesToConsensus: true },
            { contributesToConsensus: true },
          ],
          agreementAssessment: { contributingImages: 2 },
        },
      } as any,
      {
        vehicle: {
          massKg: 1500,
          make: "Test",
          model: "Vehicle",
          bodyType: "sedan",
        },
        accidentDetails: {
          incidentType: "collision",
          collisionDirection: "frontal",
          estimatedSpeedKmh: 90,
        },
        damage: { imageUrls: [], components: [] },
      } as any,
      { damagedParts: [], damageZones: [], overallSeverityScore: 95 } as any
    );

    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
  });

  it("retains even qualified visual geometry as advisory pending P1 qualification", async () => {
    const log = vi.fn();
    const ctx = {
      log,
      claimantStatedSpeedKmh: null,
      vgeCalibrationResult: {
        calibrationAvailable: true,
        calibratedCrushDepthM: 0.21,
        calibratedCrushDepthMinM: 0.18,
        calibratedCrushDepthMaxM: 0.24,
        overallCalibrationConfidence: 0.8,
        confidenceLevel: "MEDIUM",
        totalReferenceObjectsDetected: 2,
        vehicleProfileUsed: "Test Vehicle",
        geometryEvidenceBlock: {
          referenceObjectsSummary: ["wheel", "headlamp spacing"],
        },
        perImageResults: [],
      },
      vgeReconciliationResult: {
        reconciliationAvailable: true,
        consensusCrushDepthM: 0.23,
        consensusCrushDepthMinM: 0.2,
        consensusCrushDepthMaxM: 0.26,
        overallConfidence: 0.86,
        confidenceLevel: "HIGH",
        imageEntries: [
          { contributesToConsensus: true },
          { contributesToConsensus: true },
        ],
        agreementAssessment: {
          contributingImages: 2,
          agreementLevel: "STRONG",
        },
      },
    } as any;
    const claimRecord = {
      vehicle: {
        massKg: 1500,
        make: "Test",
        model: "Vehicle",
        bodyType: "sedan",
        year: 2020,
      },
      accidentDetails: {
        incidentType: "collision",
        collisionDirection: "frontal",
        estimatedSpeedKmh: 50,
        collisionScenario: "head_on",
        airbagDeployment: false,
        seatbeltPretensioner: false,
      },
      damage: { imageUrls: [], components: [] },
      valuation: null,
    } as any;
    const damageAnalysis = {
      damagedParts: [],
      damageZones: [],
      overallSeverityScore: 1,
      structuralDamageDetected: false,
      totalDamageArea: null,
      visionSourceReliability: "NONE",
    } as any;

    const result = await runPhysicsStage(ctx, claimRecord, damageAnalysis);

    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.physicsExecuted).toBe(false);
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
    expect(result.data.quantitativeEvidence?.crushDepth.governing).toBeNull();
    expect(result.data.quantitativeEvidence?.crushDepth.reasonCode).toBe(
      "P0_ADVISORY_LLM_MEDIATED_VISUAL_GEOMETRY"
    );
    expect(log).toHaveBeenCalledWith(
      "Stage 7",
      expect.stringContaining(
        "P0 classifies current VGE/VGR visual geometry as advisory"
      )
    );
  });

  it("does not invoke collision physics for visual geometry pending P1", async () => {
    mockAnalyzeAccidentPhysics.mockRejectedValueOnce(
      new Error("simulated physics failure")
    );
    const result = await runPhysicsStage(
      {
        log: vi.fn(),
        vgeCalibrationResult: {
          calibrationAvailable: true,
          calibratedCrushDepthM: 0.21,
          calibratedCrushDepthMinM: 0.18,
          calibratedCrushDepthMaxM: 0.24,
          overallCalibrationConfidence: 0.82,
          confidenceLevel: "HIGH",
        },
        vgeReconciliationResult: null,
      } as any,
      {
        vehicle: {
          massKg: 1500,
          make: "Test",
          model: "Vehicle",
          bodyType: "sedan",
          year: 2020,
        },
        accidentDetails: {
          incidentType: "collision",
          collisionDirection: "frontal",
          estimatedSpeedKmh: 80,
        },
        damage: { imageUrls: [], components: [] },
      } as any,
      {
        damagedParts: [
          {
            crushDepthM: 0.8,
            deformationEnergyJ: 999999,
            structuralDisplacementM: 0.4,
          },
        ],
        damageZones: [],
        overallSeverityScore: 99,
        structuralDamageDetected: true,
      } as any
    );

    expect(result.status).toBe("skipped");
    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.physicsExecuted).toBe(false);
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.impactVector.magnitude).toBeNull();
    expect(result.data.energyDistribution.kineticEnergyJ).toBeNull();
    expect(result.data.energyDistribution.energyDissipatedJ).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
    expect(result.data.deltaVKmh).toBeNull();
    expect(result.data.decelerationG).toBeNull();
    expect(result.data.accidentSeverity).toBe("none");
    expect(result.data.accidentReconstructionSummary).toMatch(
      /advisory pending P1/i
    );
    expect(result.recoveryActions).toEqual([]);
  });

  it("does not let animal-strike estimation bypass the P0 no-go boundary", async () => {
    const result = await runPhysicsStage(
      {
        log: vi.fn(),
        vgeCalibrationResult: null,
        vgeReconciliationResult: null,
      } as any,
      {
        vehicle: {
          massKg: 1500,
          make: "Test",
          model: "Vehicle",
          bodyType: "sedan",
        },
        accidentDetails: {
          incidentType: "animal_strike",
          collisionDirection: "frontal",
          estimatedSpeedKmh: 75,
          description: "Collision with a cow",
        },
        damage: { imageUrls: [], components: [] },
      } as any,
      { damagedParts: [], damageZones: [], overallSeverityScore: 95 } as any
    );

    expect(result.status).toBe("skipped");
    expect(result.data.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(result.data.physicsExecuted).toBe(false);
    expect(result.data.impactForceKn).toBeNull();
    expect(result.data.energyDistribution.kineticEnergyJ).toBeNull();
    expect(result.data.estimatedSpeedKmh).toBeNull();
    expect(result.data.deltaVKmh).toBeNull();
    expect(result.data.decelerationG).toBeNull();
    expect(result.data.animalStrikePhysics).toBeUndefined();
  });
});
