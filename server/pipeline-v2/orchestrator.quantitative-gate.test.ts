import { describe, expect, it, vi } from "vitest";

import {
  applyP0CausalPublicationGate,
  buildResult,
  buildUnifiedStage7FailurePhysics,
  readReusableUnifiedStage7Cache,
  runP0GatedCausalRerun,
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

    expect(physics.physicsStatus).toBe("SKIPPED_INSUFFICIENT_GEOMETRY");
    expect(physics.physicsExecuted).toBe(false);
    expect(physics.impactForceKn).toBeNull();
    expect(physics.impactVector.magnitude).toBeNull();
    expect(physics.energyDistribution.kineticEnergyJ).toBeNull();
    expect(physics.energyDistribution.energyDissipatedJ).toBeNull();
    expect(physics.estimatedSpeedKmh).toBeNull();
    expect(physics.deltaVKmh).toBeNull();
    expect(physics.decelerationG).toBeNull();
    expect(physics.accidentReconstructionSummary).toMatch(
      /advisory pending P1/i
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

describe("P0 causal output publication boundary", () => {
  const advisoryPhysics = {
    physicsExecuted: true,
    physicsStatus: "EXECUTED",
    impactVector: { direction: "rear", magnitude: 999, angle: 0 },
    deltaVKmh: 155,
    accidentSeverity: "catastrophic",
    quantitativeEvidence: {
      crushDepth: {
        contractVersion: "P0-1.0",
        field: "crush_depth_m",
        disposition: "ADVISORY",
        governing: null,
        advisoryEvidence: [
          {
            sourceKind: "STAGE6_LLM_VISUAL_NUMERIC",
            reason: "RAW_STAGE6_NUMERIC_REMAINS_DESCRIPTIVE",
            carriesNumericValue: false,
          },
        ],
        reasonCode: "P0_ADVISORY_RAW_STAGE6_ONLY",
        explanation:
          "A raw Stage 6 visual crush-depth number is descriptive evidence only. It cannot supply governing crush, force, energy, speed, delta-V, fraud, cost, confidence, or learning input.",
      },
    },
  } as any;
  const rawCrushDamage = { damagedParts: [{ crushDepthM: 0.8 }] } as any;

  it("does not invoke the actual Pass 2 causal executor when P0 blocks collision physics", async () => {
    const executeCausalReasoning = vi.fn();
    const log = vi.fn();

    const verdict = await runP0GatedCausalRerun({
      stage6Data: rawCrushDamage,
      stage7Data: advisoryPhysics,
      stage8Data: {
        fraudRiskScore: 20,
        fraudRiskLevel: "low",
        indicators: [],
      } as any,
      stage9Data: {
        expectedRepairCostCents: 100_000,
        quoteDeviationPct: null,
        currency: "USD",
      } as any,
      claimRecord: { claimId: 1 } as any,
      skipStage7bPass2: false,
      enrichedPhotosJson: null,
      log,
      executeCausalReasoning,
    });

    expect(executeCausalReasoning).not.toHaveBeenCalled();
    expect(verdict).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "Stage 7b (re-run)",
      expect.stringContaining("P0 has no governing crush-depth evidence")
    );
  });

  it("does not publish forged causal verdicts or chains through the actual final result projection", () => {
    const forgedCausalChain = {
      causal_chain: [
        {
          key: "impact_direction_determined",
          description: "Forged physics reconstruction",
        },
      ],
      chain_summary: "Forged physics causal chain",
      decision_outcome: "reject_pending",
    } as any;
    const forgedCausalVerdict = {
      inferredCause: "Forged collision causation",
      inferredCollisionDirection: "rear",
      plausibilityScore: 99,
    } as any;

    const gate = applyP0CausalPublicationGate(
      advisoryPhysics,
      rawCrushDamage,
      forgedCausalChain,
      forgedCausalVerdict
    );
    const finalOutput = (buildResult as any)(
      {},
      0,
      1,
      null,
      null,
      rawCrushDamage,
      advisoryPhysics,
      null,
      null,
      null,
      null,
      forgedCausalChain,
      null,
      null,
      null,
      null,
      forgedCausalVerdict,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      { causalChain: forgedCausalChain, otherForensicEvidence: true }
    );

    expect(gate.collisionPhysicsCausationAvailable).toBe(false);
    expect(finalOutput.causalChain).toBeNull();
    expect(finalOutput.causalVerdict).toBeNull();
    expect(finalOutput.forensicAnalysis).toMatchObject({
      causalChain: null,
      otherForensicEvidence: true,
    });
  });
});
