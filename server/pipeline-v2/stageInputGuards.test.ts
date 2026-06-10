/**
 * stageInputGuards.test.ts
 *
 * Unit tests for:
 *   1. stageInputGuards — per-stage input completeness checks
 *   2. db-pipeline partial resume helpers (saveStageResult / loadCompletedStages)
 *      tested via pure logic (no DB connection required)
 *
 * Design principles:
 *   - Guards must NEVER throw — tested with null / partial inputs
 *   - Quality-gate logic: degraded results must not be cached
 *   - promptPreamble must be empty when no gaps exist
 */

import { describe, it, expect } from "vitest";
import {
  checkStage6Inputs,
  checkStage7Inputs,
  checkStage8Inputs,
  checkStage9Inputs,
} from "./stageInputGuards";
import type { ClaimRecord, Stage6Output, Stage7Output } from "./types";

// ─── Minimal fixtures ─────────────────────────────────────────────────────────

const minimalClaimRecord: ClaimRecord = {
  vehicle: { make: "Toyota", model: "Corolla", year: 2018, registrationNumber: "ABC123" },
  accidentDetails: {
    collisionDirection: "front",
    description: "Vehicle was involved in a frontal collision at an intersection.",
    estimatedSpeedKmh: 60,
    maxCrushDepthM: 0.3,
  },
  damage: { imageUrls: ["https://example.com/photo1.jpg"] },
} as unknown as ClaimRecord;

const minimalDamageAnalysis: Stage6Output = {
  damagedParts: [{ partName: "Front bumper", severity: "moderate" }],
} as unknown as Stage6Output;

const minimalPhysicsAnalysis: Stage7Output = {
  damageConsistencyScore: 75,
  estimatedDeltaVKmh: 25,
} as unknown as Stage7Output;

// ─── Stage 6 guard ────────────────────────────────────────────────────────────

describe("checkStage6Inputs", () => {
  it("returns critical gap when claimRecord is null", () => {
    const report = checkStage6Inputs(null);
    expect(report.hasCriticalGaps).toBe(true);
    expect(report.gaps.some((g) => g.field === "claimRecord")).toBe(true);
    expect(report.promptPreamble).toContain("DATA_GAPS_WARNING");
  });

  it("returns no gaps for a complete claim record", () => {
    const report = checkStage6Inputs(minimalClaimRecord);
    expect(report.hasCriticalGaps).toBe(false);
    expect(report.hasMajorGaps).toBe(false);
    expect(report.promptPreamble).toBe("");
  });

  it("flags major gap when vehicle make and model are both absent", () => {
    const cr = {
      ...minimalClaimRecord,
      vehicle: { ...minimalClaimRecord.vehicle, make: undefined, model: undefined },
    } as unknown as ClaimRecord;
    const report = checkStage6Inputs(cr);
    expect(report.hasMajorGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("vehicle.make"))).toBe(true);
  });

  it("flags major gap when collision direction is unknown", () => {
    const cr = {
      ...minimalClaimRecord,
      accidentDetails: { ...minimalClaimRecord.accidentDetails, collisionDirection: "unknown" },
    } as unknown as ClaimRecord;
    const report = checkStage6Inputs(cr);
    expect(report.hasMajorGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("collisionDirection"))).toBe(true);
  });

  it("flags major gap when no damage photos are available", () => {
    const cr = {
      ...minimalClaimRecord,
      damage: { imageUrls: [] },
    } as unknown as ClaimRecord;
    const report = checkStage6Inputs(cr);
    expect(report.hasMajorGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("imageUrls"))).toBe(true);
  });

  it("never throws even with completely empty object", () => {
    expect(() => checkStage6Inputs({} as any)).not.toThrow();
  });
});

// ─── Stage 7 guard ────────────────────────────────────────────────────────────

describe("checkStage7Inputs", () => {
  it("returns critical gap when claimRecord is null", () => {
    const report = checkStage7Inputs(null, minimalDamageAnalysis);
    expect(report.hasCriticalGaps).toBe(true);
  });

  it("returns critical gap when damageAnalysis has no damaged parts", () => {
    const emptyDamage = { damagedParts: [] } as unknown as Stage6Output;
    const report = checkStage7Inputs(minimalClaimRecord, emptyDamage);
    expect(report.hasCriticalGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("damagedParts"))).toBe(true);
  });

  it("returns no gaps for complete inputs", () => {
    const report = checkStage7Inputs(minimalClaimRecord, minimalDamageAnalysis);
    expect(report.hasCriticalGaps).toBe(false);
    expect(report.hasMajorGaps).toBe(false);
    expect(report.promptPreamble).toBe("");
  });

  it("flags major gap when speed is absent", () => {
    const cr = {
      ...minimalClaimRecord,
      accidentDetails: { ...minimalClaimRecord.accidentDetails, estimatedSpeedKmh: null },
    } as unknown as ClaimRecord;
    const report = checkStage7Inputs(cr, minimalDamageAnalysis);
    expect(report.hasMajorGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("estimatedSpeedKmh"))).toBe(true);
  });

  it("flags major gap when description is too brief", () => {
    const cr = {
      ...minimalClaimRecord,
      accidentDetails: { ...minimalClaimRecord.accidentDetails, description: "Hit car." },
    } as unknown as ClaimRecord;
    const report = checkStage7Inputs(cr, minimalDamageAnalysis);
    expect(report.hasMajorGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("description"))).toBe(true);
  });

  it("never throws with null damage analysis", () => {
    expect(() => checkStage7Inputs(minimalClaimRecord, null)).not.toThrow();
  });
});

// ─── Stage 8 guard ────────────────────────────────────────────────────────────

describe("checkStage8Inputs", () => {
  it("returns critical gap when claimRecord is null", () => {
    const report = checkStage8Inputs(null, minimalDamageAnalysis, minimalPhysicsAnalysis);
    expect(report.hasCriticalGaps).toBe(true);
  });

  it("returns critical gap when physicsAnalysis has no damageConsistencyScore", () => {
    const physics = { damageConsistencyScore: null } as unknown as Stage7Output;
    const report = checkStage8Inputs(minimalClaimRecord, minimalDamageAnalysis, physics);
    expect(report.hasCriticalGaps).toBe(true);
    expect(report.gaps.some((g) => g.field.includes("damageConsistencyScore"))).toBe(true);
  });

  it("returns no gaps for complete inputs", () => {
    const report = checkStage8Inputs(minimalClaimRecord, minimalDamageAnalysis, minimalPhysicsAnalysis);
    expect(report.hasCriticalGaps).toBe(false);
    expect(report.promptPreamble).toBe("");
  });

  it("never throws with all nulls", () => {
    expect(() => checkStage8Inputs(null, null, null)).not.toThrow();
  });
});

// ─── Stage 9 guard ────────────────────────────────────────────────────────────

describe("checkStage9Inputs", () => {
  it("returns critical gap when claimRecord is null", () => {
    const report = checkStage9Inputs(null, minimalDamageAnalysis, minimalPhysicsAnalysis);
    expect(report.hasCriticalGaps).toBe(true);
  });

  it("returns no gaps for complete inputs", () => {
    const report = checkStage9Inputs(minimalClaimRecord, minimalDamageAnalysis, minimalPhysicsAnalysis);
    expect(report.hasCriticalGaps).toBe(false);
  });

  it("never throws with all nulls", () => {
    expect(() => checkStage9Inputs(null, null, null)).not.toThrow();
  });
});

// ─── Partial resume quality-gate logic ───────────────────────────────────────

describe("Partial resume quality-gate logic", () => {
  /**
   * These tests validate the DECISION LOGIC for caching, not the DB writes.
   * The actual DB helpers (saveStageResult / loadCompletedStages) are
   * integration-tested separately; here we test the guard conditions.
   */

  function shouldCache(status: string, degraded: boolean, alreadyCached: boolean): boolean {
    // Mirrors the condition in orchestrator.ts:
    //   if (ctx.runId && s.status === "success" && !s.degraded && !_sCached)
    return status === "success" && !degraded && !alreadyCached;
  }

  it("caches a clean successful result", () => {
    expect(shouldCache("success", false, false)).toBe(true);
  });

  it("does NOT cache a degraded result (even if status is success)", () => {
    expect(shouldCache("success", true, false)).toBe(false);
  });

  it("does NOT cache a failed result", () => {
    expect(shouldCache("failed", false, false)).toBe(false);
  });

  it("does NOT cache a degraded result with failed status", () => {
    expect(shouldCache("degraded", true, false)).toBe(false);
  });

  it("does NOT re-cache if already cached from a prior run", () => {
    expect(shouldCache("success", false, true)).toBe(false);
  });

  it("does NOT cache a timed-out result (degraded=true)", () => {
    // Timeouts always produce degraded=true in the orchestrator
    expect(shouldCache("success", true, false)).toBe(false);
  });
});

// ─── promptPreamble format ────────────────────────────────────────────────────

describe("StageInputReport.promptPreamble format", () => {
  it("is empty string when there are no gaps", () => {
    const report = checkStage6Inputs(minimalClaimRecord);
    expect(report.promptPreamble).toBe("");
  });

  it("starts with DATA_GAPS_WARNING when gaps exist", () => {
    const report = checkStage6Inputs(null);
    expect(report.promptPreamble.startsWith("DATA_GAPS_WARNING")).toBe(true);
  });

  it("includes severity tags in the preamble", () => {
    const cr = {
      ...minimalClaimRecord,
      vehicle: { ...minimalClaimRecord.vehicle, make: undefined, model: undefined },
    } as unknown as ClaimRecord;
    const report = checkStage6Inputs(cr);
    expect(report.promptPreamble).toContain("[MAJOR]");
  });

  it("lists each gap field in the preamble", () => {
    const cr = {
      ...minimalClaimRecord,
      vehicle: { ...minimalClaimRecord.vehicle, make: undefined, model: undefined },
      accidentDetails: { ...minimalClaimRecord.accidentDetails, collisionDirection: "unknown" },
    } as unknown as ClaimRecord;
    const report = checkStage6Inputs(cr);
    expect(report.promptPreamble).toContain("vehicle.make");
    expect(report.promptPreamble).toContain("collisionDirection");
  });
});
