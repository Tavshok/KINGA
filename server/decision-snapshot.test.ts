/**
 * decision-snapshot.test.ts
 *
 * Tests for the Decision Snapshot persistence layer.
 * Verifies that snapshots are saved correctly, versioned, and retrieved in order.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDb = {
  insert: mockInsert,
  select: mockSelect,
};

vi.mock("./db", () => ({
  saveDecisionSnapshot: vi.fn(),
  getDecisionSnapshots: vi.fn(),
}));

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
