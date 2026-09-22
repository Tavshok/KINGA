import { describe, expect, it, vi } from "vitest";

import {
  buildPhysicsSection,
  runReportGenerationStage,
} from "./stage-10-report";

describe("Stage 10 calibrated-geometry physics status", () => {
  const insufficientGeometryPhysics = {
    physicsExecuted: false,
    physicsStatus: "SKIPPED_INSUFFICIENT_GEOMETRY",
    impactForceKn: null,
    impactVector: { direction: "frontal", magnitude: null, angle: 0 },
    energyDistribution: {
      kineticEnergyJ: null,
      energyDissipatedJ: null,
      energyDissipatedKj: null,
    },
    estimatedSpeedKmh: null,
    deltaVKmh: null,
    decelerationG: null,
    accidentSeverity: "none",
    accidentReconstructionSummary: "Insufficient calibrated geometry",
    damageConsistencyScore: 0,
    latentDamageProbability: {
      engine: 0,
      transmission: 0,
      suspension: 0,
      frame: 0,
      electrical: 0,
    },
  } as any;

  async function runFullReportWithPhysics(
    physicsAnalysis: any,
    causalChain?: any
  ) {
    const log = vi.fn();
    const result = await runReportGenerationStage(
      {
        log,
        claimId: 1,
        claim: { claimNumber: "TEST-GEOMETRY-GATE" },
        pdfPageImageUrls: [],
      } as any,
      {
        claimId: 1,
        vehicle: {
          make: "Test",
          model: "Vehicle",
          year: 2020,
          registration: null,
          vin: null,
          colour: null,
          mileageKm: null,
          bodyType: "sedan",
          powertrain: "ICE",
          massKg: 1500,
          marketValueUsd: null,
        },
        driver: null,
        accidentDetails: {
          date: null,
          location: null,
          incidentType: "collision",
          collisionDirection: "frontal",
          description:
            "A test collision description that is sufficiently long.",
          estimatedSpeedKmh: null,
        },
        policeReport: { reportNumber: null, station: null },
        damage: { imageUrls: [], description: "Front-end damage" },
        repairQuote: { quoteTotalCents: null },
        dataQuality: {
          completenessScore: 50,
          missingFields: [],
          validationIssues: [],
        },
      } as any,
      null,
      physicsAnalysis,
      null,
      null,
      null,
      [],
      causalChain
    );
    return { log, result };
  }

  it("presents insufficient calibrated geometry as unavailable and review-required", () => {
    const section = buildPhysicsSection(insufficientGeometryPhysics);

    expect(section.content).toMatchObject({
      available: false,
      executed: false,
      reviewRequired: true,
    });
    expect((section.content as any).note).toMatch(/requires review/i);
  });

  it("rejects a false-unavailable P0 decision when Stage 6 still has raw crush evidence", () => {
    const section = buildPhysicsSection(
      {
        ...insufficientGeometryPhysics,
        quantitativeEvidence: {
          crushDepth: {
            contractVersion: "P0-1.0",
            field: "crush_depth_m",
            disposition: "UNAVAILABLE",
            governing: null,
            advisoryEvidence: [],
            reasonCode: "P0_UNAVAILABLE_NO_CANDIDATE",
            explanation: "No crush-depth candidate is available.",
          },
        },
      } as any,
      undefined,
      {
        damagedParts: [{ crushDepthM: 0.45 }],
      } as any
    );

    expect(
      (section.content as any).quantitativeEvidence.crushDepth
    ).toMatchObject({
      disposition: "UNAVAILABLE",
      reasonCode: "P0_UNAVAILABLE_INCONSISTENT_PRESERVED_DECISION",
    });
  });

  it("returns a degraded full report when collision physics is geometry-gated", async () => {
    const log = vi.fn();
    const result = await runReportGenerationStage(
      {
        log,
        claimId: 1,
        claim: { claimNumber: "TEST-GEOMETRY-GATE" },
        pdfPageImageUrls: [],
      } as any,
      {
        claimId: 1,
        vehicle: {
          make: "Test",
          model: "Vehicle",
          year: 2020,
          registration: null,
          vin: null,
          colour: null,
          mileageKm: null,
          bodyType: "sedan",
          powertrain: "ICE",
          massKg: 1500,
          marketValueUsd: null,
        },
        driver: null,
        accidentDetails: {
          date: null,
          location: null,
          incidentType: "collision",
          collisionDirection: "frontal",
          description:
            "A test collision description that is sufficiently long.",
          estimatedSpeedKmh: null,
        },
        policeReport: { reportNumber: null, station: null },
        damage: { imageUrls: [], description: "Front-end damage" },
        repairQuote: { quoteTotalCents: null },
        dataQuality: {
          completenessScore: 50,
          missingFields: [],
          validationIssues: [],
        },
      } as any,
      null,
      insufficientGeometryPhysics,
      null,
      null,
      null,
      []
    );

    expect(result.status).toBe("degraded");
    expect(result.degraded).toBe(true);
    expect(log).not.toHaveBeenCalledWith(
      "Stage 10",
      expect.stringContaining("Report generation failed")
    );
    expect(result.data.physicsReconstruction.content).toMatchObject({
      available: false,
      reviewRequired: true,
    });
    expect(result.data.degradationReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no qualifying calibrated vehicle geometry/i),
      ])
    );
  });

  it("returns a degraded full report when qualified physics fails without a numeric fallback", async () => {
    const physics = {
      ...insufficientGeometryPhysics,
      physicsStatus: "SKIPPED_ENGINE_FAILURE",
      accidentReconstructionSummary: "No numerical fallback was produced.",
    };
    const { log, result } = await runFullReportWithPhysics(physics);

    expect(result.status).toBe("degraded");
    expect(result.degraded).toBe(true);
    expect(log).not.toHaveBeenCalledWith(
      "Stage 10",
      expect.stringContaining("Report generation failed")
    );
    expect(result.data.physicsReconstruction.content).toMatchObject({
      available: false,
      executed: false,
      reviewRequired: true,
    });
    expect(result.data.degradationReasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/physics engine did not complete/i),
      ])
    );
  });

  it("does not publish a causal physics narrative when P0 blocks numerical physics", async () => {
    const { result } = await runFullReportWithPhysics(
      insufficientGeometryPhysics,
      {
        causal_chain: [
          {
            stage: "physics",
            finding: "Forged delta-V was 88 km/h.",
          },
        ],
        chain_summary: "Forged numerical physics narrative.",
        decision_outcome: "approve",
        escalation_required: false,
        step_count: 1,
        critical_step_count: 0,
        warning_step_count: 0,
      }
    );

    expect(
      result.data.fullReport.sections.physicsReconstruction
    ).not.toHaveProperty("narrative");
    expect(result.data.fullReport.sections).not.toHaveProperty(
      "decisionReport"
    );
    expect(JSON.stringify(result.data.fullReport)).not.toContain("88 km/h");
  });
});
