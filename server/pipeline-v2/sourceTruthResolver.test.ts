/**
 * sourceTruthResolver.test.ts
 * Stage 33 — Multi-Source Truth Resolution Engine Tests
 */
import { describe, it, expect } from "vitest";
import {
  resolveSourceTruth,
  getResolvedDirection,
  getResolvedSeverity,
  SOURCE_PRIORITY,
  type TruthResolutionInput,
} from "./sourceTruthResolver";
import type { Stage6Output, Stage7Output, ClaimRecord } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStage6(zone: string, severityScore: number): Stage6Output {
  return {
    damagedParts: [],
    damageZones: [{ zone, componentCount: 1, maxSeverity: "moderate" }],
    overallSeverityScore: severityScore,
    _fallback_fields: [],
  } as unknown as Stage6Output;
}

function makeStage7(direction: string, severity: string, executed = true): Stage7Output {
  return {
    physicsExecuted: executed,
    impactVector: { direction, magnitude: 30, deltaV: 15 },
    accidentSeverity: severity,
    estimatedSpeedKmh: 50,
    estimatedForceKN: 20,
  } as unknown as Stage7Output;
}

function makeClaimRecord(direction: string, zone?: string, severity?: string): ClaimRecord {
  return {
    accidentDetails: {
      collisionDirection: direction,
      impactPoint: zone ?? null,
    },
    damage: {
      components: severity
        ? [{ name: "bumper", severity, zone: zone ?? "front" }]
        : [],
    },
  } as unknown as ClaimRecord;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SOURCE_PRIORITY", () => {
  it("physics has highest priority (3)", () => {
    expect(SOURCE_PRIORITY.physics).toBe(3);
  });
  it("photo has medium priority (2)", () => {
    expect(SOURCE_PRIORITY.photo).toBe(2);
  });
  it("document has lowest priority (1)", () => {
    expect(SOURCE_PRIORITY.document).toBe(1);
  });
});

describe("resolveSourceTruth — no conflict", () => {
  it("returns resolution_applied=false when all sources agree", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("front", "moderate"),
      damageAnalysis: makeStage6("front", 50),
      claimRecord: makeClaimRecord("front", "front", "moderate"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolution_applied).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("resolved_truth.impact_direction equals the shared direction", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "minor"),
      damageAnalysis: makeStage6("rear", 30),
      claimRecord: makeClaimRecord("rear", "rear", "minor"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth.impact_direction).toBe("rear");
  });
});

describe("resolveSourceTruth — direction conflict", () => {
  it("physics overrides document on direction conflict", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth.impact_direction).toBe("rear");
    expect(result.dominant_source).toBe("physics");
    expect(result.resolution_applied).toBe(true);
  });

  it("conflict record includes source, issue, and resolution", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].source).toBe("document");
    expect(result.conflicts[0].resolution).toContain("physics_overridden");
  });

  it("document source is marked overridden when physics wins", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    const docSource = result.sources_used.find((s) => s.source === "document");
    expect(docSource?.conflict).toBe(true);
    expect(docSource?.overridden).toBe(true);
  });

  it("physics source is NOT marked overridden when it wins", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    const physSource = result.sources_used.find((s) => s.source === "physics");
    expect(physSource?.conflict).toBe(false);
    expect(physSource?.overridden).toBe(false);
  });
});

describe("resolveSourceTruth — zone conflict", () => {
  it("photo zone overrides document zone on conflict", () => {
    const input: TruthResolutionInput = {
      physicsOutput: null,
      damageAnalysis: makeStage6("rear", 50),
      claimRecord: makeClaimRecord("unknown", "front"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth.damage_zone).toBe("rear");
  });

  it("document source is marked overridden when photo wins zone", () => {
    const input: TruthResolutionInput = {
      physicsOutput: null,
      damageAnalysis: makeStage6("rear", 50),
      claimRecord: makeClaimRecord("unknown", "front"),
    };
    const result = resolveSourceTruth(input);
    const docSource = result.sources_used.find((s) => s.source === "document");
    expect(docSource?.conflict).toBe(true);
    expect(docSource?.overridden).toBe(true);
  });
});

describe("resolveSourceTruth — severity conflict", () => {
  it("physics severity overrides document severity", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("front", "severe"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front", "front", "minor"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth.severity).toBe("severe");
  });

  it("photo severity overrides document severity", () => {
    const input: TruthResolutionInput = {
      physicsOutput: null,
      damageAnalysis: makeStage6("front", 70), // 70 → severe
      claimRecord: makeClaimRecord("front", "front", "cosmetic"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth.severity).toBe("severe");
  });
});

describe("resolveSourceTruth — null/missing sources", () => {
  it("handles null physicsOutput gracefully", () => {
    const input: TruthResolutionInput = {
      physicsOutput: null,
      damageAnalysis: makeStage6("front", 40),
      claimRecord: makeClaimRecord("front"),
    };
    expect(() => resolveSourceTruth(input)).not.toThrow();
  });

  it("handles null damageAnalysis gracefully", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("rear"),
    };
    expect(() => resolveSourceTruth(input)).not.toThrow();
  });

  it("handles null claimRecord gracefully", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("front", "minor"),
      damageAnalysis: makeStage6("front", 30),
      claimRecord: null,
    };
    expect(() => resolveSourceTruth(input)).not.toThrow();
  });

  it("handles all null inputs gracefully", () => {
    const input: TruthResolutionInput = {
      physicsOutput: null,
      damageAnalysis: null,
      claimRecord: null,
    };
    const result = resolveSourceTruth(input);
    expect(result.resolution_applied).toBe(false);
    expect(result.resolved_truth.impact_direction).toBe("unknown");
  });

  it("physics with physicsExecuted=false is treated as no physics data", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "severe", false), // executed=false
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    // physics did not execute → document direction wins
    expect(result.resolved_truth.impact_direction).toBe("front");
    expect(result.resolution_applied).toBe(false);
  });
});

describe("resolveSourceTruth — output shape", () => {
  it("always returns resolved_truth with all three fields", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("side_left", "moderate"),
      damageAnalysis: makeStage6("side_left", 50),
      claimRecord: makeClaimRecord("side_left", "side_left", "moderate"),
    };
    const result = resolveSourceTruth(input);
    expect(result.resolved_truth).toHaveProperty("impact_direction");
    expect(result.resolved_truth).toHaveProperty("damage_zone");
    expect(result.resolved_truth).toHaveProperty("severity");
  });

  it("always returns sources_used with three entries", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("front", "minor"),
      damageAnalysis: makeStage6("front", 30),
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    expect(result.sources_used).toHaveLength(3);
    const names = result.sources_used.map((s) => s.source);
    expect(names).toContain("physics");
    expect(names).toContain("photo");
    expect(names).toContain("document");
  });

  it("dominant_source is set to the source that won the most dimensions", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "severe"),
      damageAnalysis: makeStage6("front", 30),
      claimRecord: makeClaimRecord("front", "front", "minor"),
    };
    const result = resolveSourceTruth(input);
    // physics wins direction + severity; photo wins zone
    expect(result.dominant_source).toBe("physics");
  });
});

describe("getResolvedDirection / getResolvedSeverity helpers", () => {
  it("getResolvedDirection returns resolved impact_direction", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("rear", "moderate"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front"),
    };
    const result = resolveSourceTruth(input);
    expect(getResolvedDirection(result)).toBe("rear");
  });

  it("getResolvedSeverity returns resolved severity", () => {
    const input: TruthResolutionInput = {
      physicsOutput: makeStage7("front", "severe"),
      damageAnalysis: null,
      claimRecord: makeClaimRecord("front", "front", "minor"),
    };
    const result = resolveSourceTruth(input);
    expect(getResolvedSeverity(result)).toBe("severe");
  });
});
