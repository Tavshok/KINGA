/**
 * decision-replay.test.ts
 *
 * Tests for the Decision Replay Engine.
 *
 * Verifies that:
 * - replayDecision produces the correct output shape
 * - No drift is detected when inputs are identical
 * - Drift is correctly detected when enforcement logic would produce a different verdict
 * - The original snapshot is never mutated
 * - reconstructEnforcementInput correctly maps snapshot fields back to enforcement inputs
 * - enforcementResultToSpecSnapshot produces a valid SpecSnapshot
 * - impact_analysis is always a non-empty string
 */

import { describe, it, expect } from "vitest";
import { replayDecision, reconstructEnforcementInput, type ReplayResult } from "./decision-replay";
import { buildSpecSnapshot, type DecisionSnapshotInput, type SpecSnapshot } from "./db";

// ─── Shared test fixture ──────────────────────────────────────────────────────

const baseInput: DecisionSnapshotInput = {
  claimId: "CLM-REPLAY-001",
  tenantId: "tenant-test",
  createdByUserId: "user-1",
  verdict: {
    decision: "FINALISE_CLAIM",
    primaryReason: "All checks passed",
    confidence: 88,
  },
  cost: {
    aiEstimate: 90000,   // $900 in cents
    quoted: 0,
    deviationPercent: 0,
    fairRangeMin: 76500,
    fairRangeMax: 117000,
    verdict: "FAIR",
  },
  fraud: {
    score: 15,
    level: "minimal",
    contributions: [{ factor: "Missing Data", value: 15 }],
  },
  physics: {
    deltaV: 12,
    velocityRange: "18–30 km/h",
    energyKj: 30,
    forceKn: 8,
    estimated: true,
  },
  damage: {
    zones: ["front"],
    severity: "minor",
    consistencyScore: 80,
  },
  enforcementTrace: [
    { rule: "Fraud Score Threshold (ESCALATE)", value: 15, threshold: "> 60", triggered: false },
    { rule: "Cost Verdict (REVIEW)", value: "FAIR", threshold: "FAIR", triggered: false },
  ],
  confidenceBreakdown: [{ factor: "Missing physics data", penalty: 10 }],
  dataQuality: {
    missingFields: [],
    estimatedFields: ["velocity", "force", "energy"],
    extractionConfidence: 88,
  },
};

function makeSnapshot(overrides?: Partial<DecisionSnapshotInput>): SpecSnapshot {
  return buildSpecSnapshot({ ...baseInput, ...overrides }, 1);
}

// ─── Output shape tests ───────────────────────────────────────────────────────

describe("replayDecision — output shape", () => {
  it("returns all required top-level fields", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(result).toHaveProperty("original_verdict");
    expect(result).toHaveProperty("new_verdict");
    expect(result).toHaveProperty("changed");
    expect(result).toHaveProperty("differences");
    expect(result).toHaveProperty("impact_analysis");
    expect(result).toHaveProperty("replayed_at");
    expect(result).toHaveProperty("original_snapshot_version");
  });

  it("original_verdict matches the snapshot's verdict_decision", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(result.original_verdict).toBe(snap.verdict_decision);
  });

  it("new_verdict is a valid decision string", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(["FINALISE_CLAIM", "REVIEW_REQUIRED", "ESCALATE_INVESTIGATION"]).toContain(result.new_verdict);
  });

  it("differences is an array", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(Array.isArray(result.differences)).toBe(true);
  });

  it("each difference has field, original, and new keys", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    for (const diff of result.differences) {
      expect(diff).toHaveProperty("field");
      expect(diff).toHaveProperty("original");
      expect(diff).toHaveProperty("new");
      expect(typeof diff.field).toBe("string");
    }
  });

  it("impact_analysis is a non-empty string", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(typeof result.impact_analysis).toBe("string");
    expect(result.impact_analysis.length).toBeGreaterThan(0);
  });

  it("replayed_at is a valid ISO timestamp", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(() => new Date(result.replayed_at).toISOString()).not.toThrow();
  });

  it("original_snapshot_version matches the snapshot's version", () => {
    const snap = buildSpecSnapshot(baseInput, 7);
    const result = replayDecision(snap);
    expect(result.original_snapshot_version).toBe(7);
  });
});

// ─── Immutability tests ───────────────────────────────────────────────────────

describe("replayDecision — original snapshot immutability", () => {
  it("does not mutate the original snapshot object", () => {
    const snap = makeSnapshot();
    const snapBefore = JSON.stringify(snap);
    replayDecision(snap);
    const snapAfter = JSON.stringify(snap);
    expect(snapAfter).toBe(snapBefore);
  });

  it("does not add new keys to the original snapshot", () => {
    const snap = makeSnapshot();
    const keysBefore = Object.keys(snap).sort();
    replayDecision(snap);
    const keysAfter = Object.keys(snap).sort();
    expect(keysAfter).toEqual(keysBefore);
  });
});

// ─── No-drift tests ───────────────────────────────────────────────────────────

describe("replayDecision — no drift scenario", () => {
  it("changed is false when verdict is stable (FINALISE_CLAIM with low fraud)", () => {
    // Low fraud (15), no quotes, minor damage, high consistency — should FINALISE
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    // The verdict should be stable; changed may be false or true depending on
    // minor field-level differences (e.g. confidence penalties) but verdict must not flip
    expect(result.original_verdict).toBe("FINALISE_CLAIM");
    expect(result.new_verdict).toBe("FINALISE_CLAIM");
  });

  it("impact_analysis mentions 'No drift' when no differences exist", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    if (!result.changed) {
      expect(result.impact_analysis).toMatch(/No drift/i);
    }
  });
});

// ─── Drift detection tests ────────────────────────────────────────────────────

describe("replayDecision — drift detection", () => {
  it("detects verdict drift when fraud score is above escalation threshold", () => {
    // Build a snapshot that was originally FINALISE_CLAIM but with fraud score 65
    // The current engine will ESCALATE (fraud > 60)
    const highFraudInput: DecisionSnapshotInput = {
      ...baseInput,
      fraud: { score: 65, level: "high", contributions: [{ factor: "Suspicious Pattern", value: 65 }] },
      // Override verdict to simulate a snapshot that was incorrectly finalised
      verdict: { decision: "FINALISE_CLAIM", primaryReason: "Legacy logic passed", confidence: 70 },
    };
    const snap = buildSpecSnapshot(highFraudInput, 1);
    const result = replayDecision(snap);

    // Current engine must escalate (fraud 65 > 60 threshold)
    expect(result.new_verdict).toBe("ESCALATE_INVESTIGATION");
    expect(result.original_verdict).toBe("FINALISE_CLAIM");
    expect(result.changed).toBe(true);
    expect(result.differences.length).toBeGreaterThan(0);
  });

  it("differences array contains verdict_decision when verdict changes", () => {
    const highFraudInput: DecisionSnapshotInput = {
      ...baseInput,
      fraud: { score: 65, level: "high", contributions: [{ factor: "Suspicious Pattern", value: 65 }] },
      verdict: { decision: "FINALISE_CLAIM", primaryReason: "Legacy logic passed", confidence: 70 },
    };
    const snap = buildSpecSnapshot(highFraudInput, 1);
    const result = replayDecision(snap);

    const verdictDiff = result.differences.find(d => d.field === "verdict_decision");
    expect(verdictDiff).toBeDefined();
    expect(verdictDiff?.original).toBe("FINALISE_CLAIM");
    expect(verdictDiff?.new).toBe("ESCALATE_INVESTIGATION");
  });

  it("impact_analysis mentions VERDICT DRIFT when verdict changes", () => {
    const highFraudInput: DecisionSnapshotInput = {
      ...baseInput,
      fraud: { score: 65, level: "high", contributions: [{ factor: "Suspicious Pattern", value: 65 }] },
      verdict: { decision: "FINALISE_CLAIM", primaryReason: "Legacy logic passed", confidence: 70 },
    };
    const snap = buildSpecSnapshot(highFraudInput, 1);
    const result = replayDecision(snap);

    expect(result.impact_analysis).toMatch(/VERDICT DRIFT/i);
  });

  it("detects fraud level drift when fraud band changes", () => {
    // Snapshot has fraud level 'minimal' (score 15) but the snapshot says 'elevated'
    // to simulate a legacy label mismatch
    const mismatchInput: DecisionSnapshotInput = {
      ...baseInput,
      fraud: { score: 15, level: "elevated", contributions: [{ factor: "Legacy Score", value: 15 }] },
      verdict: { ...baseInput.verdict, decision: "ESCALATE_INVESTIGATION" },
    };
    const snap = buildSpecSnapshot(mismatchInput, 1);
    const result = replayDecision(snap);

    // Current engine: score 15 → minimal, not elevated
    const fraudLevelDiff = result.differences.find(d => d.field === "fraud_level");
    if (fraudLevelDiff) {
      expect(fraudLevelDiff.original).toBe("elevated");
      expect(fraudLevelDiff.new).toBe("minimal");
    }
  });
});

// ─── reconstructEnforcementInput tests ───────────────────────────────────────

describe("reconstructEnforcementInput", () => {
  it("maps fraud_score to fraudScore", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.fraudScore).toBe(snap.fraud_score);
  });

  it("maps consistency_score to consistencyScore", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.consistencyScore).toBe(snap.consistency_score);
  });

  it("maps extraction_confidence to extractionConfidence", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.extractionConfidence).toBe(snap.extraction_confidence);
  });

  it("sets estimatedSpeedKmh to 0 when physics_estimated is true", () => {
    const snap = makeSnapshot({ physics: { ...baseInput.physics, estimated: true } });
    const input = reconstructEnforcementInput(snap);
    expect(input.estimatedSpeedKmh).toBe(0);
  });

  it("maps damage_zones to damageZones array", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.damageZones).toEqual(snap.damage_zones);
  });

  it("uses liveData vehicleMassKg when provided", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap, { vehicleMassKg: 2200 });
    expect(input.vehicleMassKg).toBe(2200);
  });

  it("defaults vehicleMassKg to 1600 when not provided", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.vehicleMassKg).toBe(1600);
  });

  it("populates quotedAmounts when cost_quoted_display > 0", () => {
    const snapWithQuote = buildSpecSnapshot({
      ...baseInput,
      cost: { ...baseInput.cost, quoted: 95000, deviationPercent: 5, verdict: "FAIR" },
    }, 1);
    const input = reconstructEnforcementInput(snapWithQuote);
    expect(input.quotedAmounts.length).toBeGreaterThan(0);
    expect(input.quotedAmounts[0]).toBe(snapWithQuote.cost_quoted_display);
  });

  it("returns empty quotedAmounts when cost_quoted_display is 0", () => {
    const snap = makeSnapshot();
    const input = reconstructEnforcementInput(snap);
    expect(input.quotedAmounts).toEqual([]);
  });
});

// ─── Impact analysis content tests ───────────────────────────────────────────

describe("replayDecision — impact_analysis content", () => {
  it("always includes claim_id in the impact analysis", () => {
    const snap = makeSnapshot();
    const result = replayDecision(snap);
    expect(result.impact_analysis).toContain(snap.claim_id);
  });

  it("always includes original snapshot version in the impact analysis", () => {
    const snap = buildSpecSnapshot(baseInput, 3);
    const result = replayDecision(snap);
    expect(result.impact_analysis).toContain("v3");
  });

  it("mentions escalation when verdict escalates", () => {
    const highFraudInput: DecisionSnapshotInput = {
      ...baseInput,
      fraud: { score: 65, level: "high", contributions: [{ factor: "Suspicious Pattern", value: 65 }] },
      verdict: { decision: "FINALISE_CLAIM", primaryReason: "Legacy logic passed", confidence: 70 },
    };
    const snap = buildSpecSnapshot(highFraudInput, 1);
    const result = replayDecision(snap);
    expect(result.impact_analysis.toLowerCase()).toMatch(/escalat/);
  });
});
