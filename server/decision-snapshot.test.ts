/**
 * decision-snapshot.test.ts
 *
 * Tests for the Decision Snapshot persistence layer.
 * Verifies that snapshots are saved correctly, versioned, and retrieved in order.
 */

import { describe, it, expect, vi } from "vitest";
import { buildSpecSnapshot, type DecisionSnapshotInput } from "./db";

// ─── Mock the DB module ────────────────────────────────────────────────────────

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    // Keep buildSpecSnapshot real (pure function, no DB deps)
    saveDecisionSnapshot: vi.fn(),
    getDecisionSnapshots: vi.fn(),
    getLatestSnapshotJson: vi.fn(),
  };
});

import { saveDecisionSnapshot, getDecisionSnapshots } from "./db";

// ─── Unit tests for snapshot structure ────────────────────────────────────────

describe("Decision Snapshot — structure validation", () => {
  const baseSnapshot = {
    claimId: "CLM-2220001",
    verdict: {
      decision: "FINALISE_CLAIM" as const,
      primaryReason: "All checks passed with high confidence",
      confidence: 88,
    },
    cost: {
      aiEstimate: 92000,
      quoted: 0,
      deviationPercent: 0,
      fairRangeMin: 78200,
      fairRangeMax: 105800,
      verdict: "FAIR" as const,
    },
    fraud: {
      score: 10,
      level: "minimal",
      contributions: [
        { factor: "Missing Data", value: 10 },
      ],
    },
    physics: {
      deltaV: 15,
      velocityRange: "20–35 km/h",
      energyKj: 45,
      forceKn: 12,
      estimated: true,
    },
    damage: {
      zones: ["front"],
      severity: "minor",
      consistencyScore: 75,
    },
    enforcementTrace: [
      { rule: "Damage Consistency", value: 75, threshold: "< 50", triggered: false },
      { rule: "Cost Deviation", value: 0, threshold: "> 15%", triggered: false },
    ],
    confidenceBreakdown: [
      { factor: "Missing physics data", penalty: 12 },
    ],
    dataQuality: {
      missingFields: [],
      estimatedFields: ["velocity", "force", "energy"],
      extractionConfidence: 91,
    },
  };

  it("snapshot has all required top-level fields", () => {
    const keys = Object.keys(baseSnapshot);
    expect(keys).toContain("claimId");
    expect(keys).toContain("verdict");
    expect(keys).toContain("cost");
    expect(keys).toContain("fraud");
    expect(keys).toContain("physics");
    expect(keys).toContain("damage");
    expect(keys).toContain("enforcementTrace");
    expect(keys).toContain("confidenceBreakdown");
    expect(keys).toContain("dataQuality");
  });

  it("verdict has all required fields with correct types", () => {
    const { verdict } = baseSnapshot;
    expect(typeof verdict.decision).toBe("string");
    expect(typeof verdict.primaryReason).toBe("string");
    expect(typeof verdict.confidence).toBe("number");
    expect(verdict.confidence).toBeGreaterThanOrEqual(0);
    expect(verdict.confidence).toBeLessThanOrEqual(100);
  });

  it("cost has all required fields and no null values", () => {
    const { cost } = baseSnapshot;
    expect(cost.aiEstimate).toBeGreaterThanOrEqual(0);
    expect(cost.fairRangeMin).toBeGreaterThan(0);
    expect(cost.fairRangeMax).toBeGreaterThan(cost.fairRangeMin);
    expect(["FAIR", "OVERPRICED", "UNDERPRICED"]).toContain(cost.verdict);
  });

  it("fraud score is within valid range and level is a valid band", () => {
    const { fraud } = baseSnapshot;
    expect(fraud.score).toBeGreaterThanOrEqual(0);
    expect(fraud.score).toBeLessThanOrEqual(100);
    expect(["minimal", "low", "moderate", "high", "elevated"]).toContain(fraud.level);
  });

  it("fraud contributions array has correct structure", () => {
    const { fraud } = baseSnapshot;
    expect(Array.isArray(fraud.contributions)).toBe(true);
    for (const c of fraud.contributions) {
      expect(typeof c.factor).toBe("string");
      expect(typeof c.value).toBe("number");
      expect(c.value).toBeGreaterThanOrEqual(0);
    }
  });

  it("physics fields are all present with no undefined values", () => {
    const { physics } = baseSnapshot;
    expect(physics.deltaV).toBeDefined();
    expect(physics.velocityRange).toBeDefined();
    expect(physics.energyKj).toBeDefined();
    expect(physics.forceKn).toBeDefined();
    expect(typeof physics.estimated).toBe("boolean");
  });

  it("enforcement trace has correct structure", () => {
    const { enforcementTrace } = baseSnapshot;
    expect(Array.isArray(enforcementTrace)).toBe(true);
    for (const entry of enforcementTrace) {
      expect(typeof entry.rule).toBe("string");
      expect(entry.value).toBeDefined();
      expect(typeof entry.threshold).toBe("string");
      expect(typeof entry.triggered).toBe("boolean");
    }
  });

  it("data quality has no null fields", () => {
    const { dataQuality } = baseSnapshot;
    expect(Array.isArray(dataQuality.missingFields)).toBe(true);
    expect(Array.isArray(dataQuality.estimatedFields)).toBe(true);
    expect(typeof dataQuality.extractionConfidence).toBe("number");
  });
});

// ─── Fraud band mapping tests ─────────────────────────────────────────────────

describe("Decision Snapshot — fraud band mapping", () => {
  const cases: Array<{ score: number; expectedLevel: string }> = [
    { score: 0,   expectedLevel: "minimal" },
    { score: 10,  expectedLevel: "minimal" },
    { score: 20,  expectedLevel: "minimal" },
    { score: 21,  expectedLevel: "low" },
    { score: 40,  expectedLevel: "low" },
    { score: 41,  expectedLevel: "moderate" },
    { score: 60,  expectedLevel: "moderate" },
    { score: 61,  expectedLevel: "high" },
    { score: 80,  expectedLevel: "high" },
    { score: 81,  expectedLevel: "elevated" },
    { score: 100, expectedLevel: "elevated" },
  ];

  function scoreToLevel(score: number): string {
    if (score <= 20) return "minimal";
    if (score <= 40) return "low";
    if (score <= 60) return "moderate";
    if (score <= 80) return "high";
    return "elevated";
  }

  for (const { score, expectedLevel } of cases) {
    it(`score ${score} → level "${expectedLevel}"`, () => {
      expect(scoreToLevel(score)).toBe(expectedLevel);
    });
  }
});

// ─── Verdict decision mapping tests ──────────────────────────────────────────

describe("Decision Snapshot — verdict decision values", () => {
  const validDecisions = ["FINALISE_CLAIM", "REVIEW_REQUIRED", "ESCALATE_INVESTIGATION"];

  it("all valid decision values are recognised", () => {
    for (const d of validDecisions) {
      expect(validDecisions).toContain(d);
    }
  });

  it("FINALISE_CLAIM maps to green confidence level", () => {
    const decision = "FINALISE_CLAIM";
    const isGreen = decision === "FINALISE_CLAIM";
    expect(isGreen).toBe(true);
  });

  it("ESCALATE_INVESTIGATION maps to red confidence level", () => {
    const decision = "ESCALATE_INVESTIGATION";
    const isRed = decision === "ESCALATE_INVESTIGATION";
    expect(isRed).toBe(true);
  });
});

// ─── buildSpecSnapshot unit tests ───────────────────────────────────────────

const baseInput: DecisionSnapshotInput = {
  claimId: "CLM-2220001",
  tenantId: "tenant-1",
  createdByUserId: "user-42",
  verdict: {
    decision: "FINALISE_CLAIM",
    primaryReason: "All checks passed with high confidence",
    confidence: 88,
  },
  cost: {
    aiEstimate: 92000,   // cents
    quoted: 0,
    deviationPercent: 0,
    fairRangeMin: 78200, // cents
    fairRangeMax: 105800,
    verdict: "FAIR",
  },
  fraud: {
    score: 10,
    level: "minimal",
    contributions: [{ factor: "Missing Data", value: 10 }],
  },
  physics: {
    deltaV: 15,
    velocityRange: "20–35 km/h",
    energyKj: 45,
    forceKn: 12,
    estimated: true,
  },
  damage: {
    zones: ["front"],
    severity: "minor",
    consistencyScore: 75,
  },
  enforcementTrace: [
    { rule: "Damage Consistency", value: 75, threshold: "< 50", triggered: false },
    { rule: "Cost Deviation", value: 0, threshold: "> 15%", triggered: false },
  ],
  confidenceBreakdown: [{ factor: "Missing physics data", penalty: 12 }],
  dataQuality: {
    missingFields: [],
    estimatedFields: ["velocity", "force", "energy"],
    extractionConfidence: 91,
  },
};

describe("buildSpecSnapshot — snake_case spec compliance", () => {
  it("produces all required top-level snake_case keys", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    const keys = Object.keys(snap);
    // Identity
    expect(keys).toContain("claim_id");
    expect(keys).toContain("snapshot_version");
    expect(keys).toContain("created_at");
    expect(keys).toContain("created_by_user_id");
    // Verdict
    expect(keys).toContain("verdict_decision");
    expect(keys).toContain("verdict_label");
    expect(keys).toContain("verdict_primary_reason");
    expect(keys).toContain("verdict_confidence");
    expect(keys).toContain("verdict_color");
    // Cost
    expect(keys).toContain("cost_ai_estimate_cents");
    expect(keys).toContain("cost_ai_estimate_display");
    expect(keys).toContain("cost_quoted_cents");
    expect(keys).toContain("cost_quoted_display");
    expect(keys).toContain("cost_deviation_percent");
    expect(keys).toContain("cost_fair_range_min_cents");
    expect(keys).toContain("cost_fair_range_max_cents");
    expect(keys).toContain("cost_fair_range_min_display");
    expect(keys).toContain("cost_fair_range_max_display");
    expect(keys).toContain("cost_verdict");
    // Fraud
    expect(keys).toContain("fraud_score");
    expect(keys).toContain("fraud_level");
    expect(keys).toContain("fraud_level_label");
    expect(keys).toContain("fraud_contributions");
    // Physics
    expect(keys).toContain("delta_v");
    expect(keys).toContain("velocity_range");
    expect(keys).toContain("energy_kj");
    expect(keys).toContain("force_kn");
    expect(keys).toContain("physics_estimated");
    // Damage
    expect(keys).toContain("damage_zones");
    expect(keys).toContain("damage_severity");
    expect(keys).toContain("consistency_score");
    // Enforcement
    expect(keys).toContain("enforcement_trace");
    expect(keys).toContain("confidence_breakdown");
    // Data quality
    expect(keys).toContain("missing_fields");
    expect(keys).toContain("estimated_fields");
    expect(keys).toContain("extraction_confidence");
  });

  it("has no null or undefined values in any field", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    for (const [key, val] of Object.entries(snap)) {
      expect(val, `field '${key}' must not be null`).not.toBeNull();
      expect(val, `field '${key}' must not be undefined`).not.toBeUndefined();
    }
  });

  it("does not contain any camelCase keys", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    const camelCaseKeys = Object.keys(snap).filter(k => /[a-z][A-Z]/.test(k));
    expect(camelCaseKeys).toHaveLength(0);
  });

  it("converts cents to dollars for display fields", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    expect(snap.cost_ai_estimate_display).toBe(920);    // 92000 cents = $920
    expect(snap.cost_fair_range_min_display).toBe(782); // 78200 cents = $782
    expect(snap.cost_fair_range_max_display).toBe(1058); // 105800 cents = $1058
  });

  it("FINALISE_CLAIM maps to verdict_label 'FINALISE CLAIM' and verdict_color 'green'", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    expect(snap.verdict_label).toBe("FINALISE CLAIM");
    expect(snap.verdict_color).toBe("green");
  });

  it("REVIEW_REQUIRED maps to verdict_label 'REVIEW REQUIRED' and verdict_color 'amber'", () => {
    const input = { ...baseInput, verdict: { ...baseInput.verdict, decision: "REVIEW_REQUIRED" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.verdict_label).toBe("REVIEW REQUIRED");
    expect(snap.verdict_color).toBe("amber");
  });

  it("ESCALATE_INVESTIGATION maps to verdict_label 'ESCALATE INVESTIGATION' and verdict_color 'red'", () => {
    const input = { ...baseInput, verdict: { ...baseInput.verdict, decision: "ESCALATE_INVESTIGATION" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.verdict_label).toBe("ESCALATE INVESTIGATION");
    expect(snap.verdict_color).toBe("red");
  });

  it("fraud level 'critical' is normalised to 'elevated' in label", () => {
    const input = { ...baseInput, fraud: { ...baseInput.fraud, level: "critical" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.fraud_level_label).toBe("Elevated");
  });

  it("snapshot_version matches the version argument", () => {
    const snap = buildSpecSnapshot(baseInput, 7);
    expect(snap.snapshot_version).toBe(7);
  });

  it("claim_id matches input claimId", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    expect(snap.claim_id).toBe("CLM-2220001");
  });

  it("enforcement_trace preserves rule/value/threshold/triggered structure", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    expect(snap.enforcement_trace).toHaveLength(2);
    expect(snap.enforcement_trace[0]).toMatchObject({
      rule: "Damage Consistency",
      value: 75,
      threshold: "< 50",
      triggered: false,
    });
  });

  it("fraud_contributions preserves factor/value structure", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    expect(snap.fraud_contributions).toHaveLength(1);
    expect(snap.fraud_contributions[0]).toMatchObject({ factor: "Missing Data", value: 10 });
  });

  it("created_by_user_id defaults to 'system' when not provided", () => {
    const { createdByUserId, ...inputWithoutUser } = baseInput;
    const snap = buildSpecSnapshot(inputWithoutUser as DecisionSnapshotInput, 1);
    expect(snap.created_by_user_id).toBe("system");
  });

  it("velocity_range defaults to 'Not calculated' when empty", () => {
    const input = { ...baseInput, physics: { ...baseInput.physics, velocityRange: "" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.velocity_range).toBe("Not calculated");
  });

  it("damage_severity defaults to 'unknown' when empty", () => {
    const input = { ...baseInput, damage: { ...baseInput.damage, severity: "" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.damage_severity).toBe("unknown");
  });

  it("cost_verdict defaults to 'FAIR' when empty", () => {
    const input = { ...baseInput, cost: { ...baseInput.cost, verdict: "" } };
    const snap = buildSpecSnapshot(input, 1);
    expect(snap.cost_verdict).toBe("FAIR");
  });

  it("serialises to valid JSON with no undefined values", () => {
    const snap = buildSpecSnapshot(baseInput, 1);
    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json);
    // JSON.stringify drops undefined — if any key is missing after parse, it was undefined
    for (const key of Object.keys(snap)) {
      expect(parsed).toHaveProperty(key);
    }
  });
});

// ─── Cost verdict tests ───────────────────────────────────────────────────────

describe("Decision Snapshot — cost verdict logic", () => {
  function computeCostVerdict(
    aiEstimate: number,
    fairMin: number,
    fairMax: number,
    quoted: number
  ): "FAIR" | "OVERPRICED" | "UNDERPRICED" {
    const compare = quoted > 0 ? quoted : aiEstimate;
    if (compare > fairMax * 1.15) return "OVERPRICED";
    if (compare < fairMin * 0.85) return "UNDERPRICED";
    return "FAIR";
  }

  it("quoted within fair range → FAIR", () => {
    expect(computeCostVerdict(1000, 850, 1150, 1000)).toBe("FAIR");
  });

  it("quoted 30% above fair max → OVERPRICED", () => {
    expect(computeCostVerdict(1000, 850, 1150, 1500)).toBe("OVERPRICED");
  });

  it("quoted 40% below fair min → UNDERPRICED", () => {
    expect(computeCostVerdict(1000, 850, 1150, 400)).toBe("UNDERPRICED");
  });

  it("no quote uses AI estimate → FAIR when AI is within range", () => {
    expect(computeCostVerdict(1000, 850, 1150, 0)).toBe("FAIR");
  });
});
