import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRunPhysicsStage,
  mockRunCausalReasoningEngine,
  mockRunIncidentNarrativeEngine,
} = vi.hoisted(() => ({
  mockRunPhysicsStage: vi.fn(),
  mockRunCausalReasoningEngine: vi.fn(),
  mockRunIncidentNarrativeEngine: vi.fn(),
}));

vi.mock("./stage-7-physics", () => ({
  runPhysicsStage: mockRunPhysicsStage,
}));

vi.mock("./stage-7b-causal-reasoning", () => ({
  runCausalReasoningEngine: mockRunCausalReasoningEngine,
}));

vi.mock("./incidentNarrativeEngine", () => ({
  runIncidentNarrativeEngine: mockRunIncidentNarrativeEngine,
}));

vi.mock("./severityConsensusEngine", () => ({
  buildSeverityConsensusInput: vi.fn(() => ({})),
  computeSeverityConsensus: vi.fn(() => ({
    final_severity: "unknown",
    source_alignment: "unavailable",
    confidence: 0,
    source_signals: {},
  })),
}));

import { runUnifiedStage7 } from "./stage-7-unified";

describe("unified Stage 7 causal P0 boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not invoke or return causal reasoning when P0 blocks collision physics", async () => {
    const physicsAnalysis = {
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
      physicsExecuted: false,
      physicsStatus: "SKIPPED_INSUFFICIENT_GEOMETRY",
      impactForceKn: 999,
      impactVector: { direction: "rear", magnitude: 999, angle: 0 },
      deltaVKmh: 155,
      estimatedSpeedKmh: 240,
      energyDistribution: {
        kineticEnergyJ: 999999,
        energyDissipatedJ: 999999,
        energyDissipatedKj: 999,
      },
      accidentSeverity: "catastrophic",
      damageConsistencyScore: 0,
    } as any;
    mockRunPhysicsStage.mockResolvedValue({
      status: "skipped",
      data: physicsAnalysis,
      durationMs: 1,
      savedToDb: false,
      assumptions: [],
      recoveryActions: [],
      degraded: false,
    });

    const log = vi.fn();
    const result = await runUnifiedStage7(
      {
        log,
        enrichedPhotosJson: null,
        vgeCalibrationResult: null,
        vgeReconciliationResult: null,
      } as any,
      {
        vehicle: { make: "", model: "", year: null, vin: null },
        accidentDetails: { description: "", incidentType: "collision" },
      } as any,
      {
        damagedParts: [{ crushDepthM: 0.8 }],
        damageZones: [],
      } as any,
      null,
      null,
      []
    );

    expect(mockRunCausalReasoningEngine).not.toHaveBeenCalled();
    expect(result.data.causalVerdict).toBeNull();
    expect(result.data.directionContradictionFlag).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "Stage 7b (CausalReasoning)",
      expect.stringContaining("P0 has no governing crush-depth evidence")
    );
  });
});
