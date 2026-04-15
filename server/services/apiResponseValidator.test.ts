/**
 * apiResponseValidator.test.ts
 *
 * Stage 27: API Response Validation & Auto-Healing Layer
 *
 * Tests for all mapping rules, auto-heal paths, and block conditions.
 */

import { describe, it, expect } from "vitest";
import {
  validateClaimAnalysisResponse,
  validateAndHeal,
  validateClaimAnalysisList,
  type ValidationResult,
} from "./apiResponseValidator";

// ─── Block conditions ─────────────────────────────────────────────────────────

describe("Block conditions", () => {
  it("blocks null response", () => {
    const result = validateClaimAnalysisResponse(null);
    expect(result.passed).toBe(false);
    expect(result.corrections[0].action).toBe("blocked");
  });

  it("blocks undefined response", () => {
    const result = validateClaimAnalysisResponse(undefined);
    expect(result.passed).toBe(false);
  });

  it("blocks non-object primitive", () => {
    const result = validateClaimAnalysisResponse(42);
    expect(result.passed).toBe(false);
  });

  it("blocks string response", () => {
    const result = validateClaimAnalysisResponse("error string");
    expect(result.passed).toBe(false);
  });

  it("passes valid object", () => {
    const result = validateClaimAnalysisResponse({ id: 1, fraudScore: 30 });
    expect(result.passed).toBe(true);
  });
});

// ─── Rule 2: Finite number enforcement ───────────────────────────────────────

describe("Rule 2: Finite number enforcement", () => {
  it("replaces NaN fraudScore with 0", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: NaN });
    expect(result.passed).toBe(true);
    expect((result.data as any).fraudScore).toBe(0);
    expect(result.healed).toBe(true);
  });

  it("replaces Infinity fraudRiskScore with 0", () => {
    const result = validateClaimAnalysisResponse({ fraudRiskScore: Infinity });
    expect(result.passed).toBe(true);
    expect((result.data as any).fraudRiskScore).toBe(0);
  });

  it("replaces -Infinity damageConsistencyScore with 0", () => {
    const result = validateClaimAnalysisResponse({ damageConsistencyScore: -Infinity });
    expect(result.passed).toBe(true);
    expect((result.data as any).damageConsistencyScore).toBe(0);
  });

  it("preserves valid finite numbers", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: 42, fraudRiskScore: 55 });
    expect((result.data as any).fraudScore).toBe(42);
    expect((result.data as any).fraudRiskScore).toBe(55);
    expect(result.healed).toBe(false);
  });
});

// ─── Rule 3: Confidence clamping ──────────────────────────────────────────────

describe("Rule 3: Confidence clamping [0, 100]", () => {
  it("clamps confidence above 100 to 100", () => {
    const result = validateClaimAnalysisResponse({ confidence: 150 });
    expect((result.data as any).confidence).toBe(100);
    expect(result.healed).toBe(true);
  });

  it("clamps confidence below 0 to 0", () => {
    const result = validateClaimAnalysisResponse({ confidence: -10 });
    expect((result.data as any).confidence).toBe(0);
  });

  it("preserves confidence in range", () => {
    const result = validateClaimAnalysisResponse({ confidence: 75 });
    expect((result.data as any).confidence).toBe(75);
    expect(result.healed).toBe(false);
  });
});

// ─── Rule 4: Fraud score clamping ─────────────────────────────────────────────

describe("Rule 4: Fraud score clamping [0, 100]", () => {
  it("clamps fraudScore above 100 to 100", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: 200 });
    expect((result.data as any).fraudScore).toBe(100);
  });

  it("clamps fraudScore below 0 to 0", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: -5 });
    expect((result.data as any).fraudScore).toBe(0);
  });
});

// ─── Rule 5: Field-name drift mappings ───────────────────────────────────────

describe("Rule 5: Physics field-name drift mappings", () => {
  it("maps delta_v → deltaVKmh", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { delta_v: 45, impactForceKn: 10 },
    });
    expect(result.passed).toBe(true);
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.deltaVKmh).toBe(45);
    expect("delta_v" in physics).toBe(false);
    expect(result.healed).toBe(true);
  });

  it("maps deltaV → deltaVKmh", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { deltaV: 30 },
    });
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.deltaVKmh).toBe(30);
    expect("deltaV" in physics).toBe(false);
  });

  it("maps impact_force_kn → impactForceKn", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { impact_force_kn: 15 },
    });
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.impactForceKn).toBe(15);
  });

  it("does not overwrite existing canonical field", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { deltaVKmh: 60, delta_v: 30 },
    });
    const physics = (result.data as any).physicsAnalysis;
    // canonical already present — alias should not overwrite
    expect(physics.deltaVKmh).toBe(60);
  });

  it("clamps physics deltaVKmh to [0, 300]", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { deltaVKmh: 500 },
    });
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.deltaVKmh).toBe(300);
  });

  it("clamps physics impactForceKn to [0, 10000]", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { impactForceKn: 99999 },
    });
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.impactForceKn).toBe(10000);
  });

  it("clamps physics damageConsistencyScore to [0, 100]", () => {
    const result = validateClaimAnalysisResponse({
      physicsAnalysis: { damageConsistencyScore: 2000 },
    });
    const physics = (result.data as any).physicsAnalysis;
    expect(physics.damageConsistencyScore).toBe(100);
  });
});

describe("Rule 5: Fraud field-name drift mappings", () => {
  it("maps fraud_risk_score → fraudRiskScore", () => {
    const result = validateClaimAnalysisResponse({
      fraudScoreBreakdownJson: { fraud_risk_score: 70, indicators: [] },
    });
    const fraud = (result.data as any).fraudScoreBreakdownJson;
    expect(fraud.fraudRiskScore).toBe(70);
    expect("fraud_risk_score" in fraud).toBe(false);
  });

  it("maps fraud_score → fraudRiskScore", () => {
    const result = validateClaimAnalysisResponse({
      fraudScoreBreakdownJson: { fraud_score: 40 },
    });
    const fraud = (result.data as any).fraudScoreBreakdownJson;
    expect(fraud.fraudRiskScore).toBe(40);
  });

  it("clamps fraudRiskScore in fraud object to [0, 100]", () => {
    const result = validateClaimAnalysisResponse({
      fraudScoreBreakdownJson: { fraudRiskScore: 150 },
    });
    const fraud = (result.data as any).fraudScoreBreakdownJson;
    expect(fraud.fraudRiskScore).toBe(100);
  });
});

describe("Rule 5: Cost field-name drift mappings", () => {
  it("maps expected_repair_cost_cents → expectedRepairCostCents", () => {
    const result = validateClaimAnalysisResponse({
      costIntelligenceJson: { expected_repair_cost_cents: 150000 },
    });
    const cost = (result.data as any).costIntelligenceJson;
    expect(cost.expectedRepairCostCents).toBe(150000);
  });
});

// ─── Rule 6: Decision contradiction ──────────────────────────────────────────

describe("Rule 6: Decision contradiction — ESCALATE wins", () => {
  it("resolves ESCALATE + APPROVE contradiction", () => {
    const result = validateClaimAnalysisResponse({
      recommendation: "APPROVE",
      aiVerdict: "ESCALATE",
    });
    expect(result.passed).toBe(true);
    expect((result.data as any).recommendation).toBe("ESCALATE");
    expect(result.healed).toBe(true);
  });

  it("resolves APPROVE + ESCALATE contradiction in reverse order", () => {
    const result = validateClaimAnalysisResponse({
      recommendation: "ESCALATE",
      aiVerdict: "APPROVE",
    });
    expect((result.data as any).aiVerdict).toBe("ESCALATE");
  });

  it("does not modify non-contradictory APPROVE", () => {
    const result = validateClaimAnalysisResponse({
      recommendation: "APPROVE",
      aiVerdict: "APPROVE",
    });
    expect((result.data as any).recommendation).toBe("APPROVE");
    expect(result.healed).toBe(false);
  });

  it("does not modify non-contradictory ESCALATE", () => {
    const result = validateClaimAnalysisResponse({
      recommendation: "ESCALATE",
      aiVerdict: "ESCALATE",
    });
    expect((result.data as any).recommendation).toBe("ESCALATE");
    expect(result.healed).toBe(false);
  });
});

// ─── Rule 7: Empty string normalisation ──────────────────────────────────────

describe("Rule 7: Empty string → null normalisation", () => {
  it("normalises empty recommendation to null", () => {
    const result = validateClaimAnalysisResponse({ recommendation: "" });
    expect((result.data as any).recommendation).toBeNull();
    expect(result.healed).toBe(true);
  });

  it("normalises whitespace-only incidentType to null", () => {
    const result = validateClaimAnalysisResponse({ incidentType: "   " });
    expect((result.data as any).incidentType).toBeNull();
  });

  it("preserves non-empty strings", () => {
    const result = validateClaimAnalysisResponse({ recommendation: "APPROVE" });
    expect((result.data as any).recommendation).toBe("APPROVE");
    expect(result.healed).toBe(false);
  });
});

// ─── Rule 8: Array normalisation ─────────────────────────────────────────────

describe("Rule 8: Null/undefined array fields → []", () => {
  it("normalises null damagedParts to []", () => {
    const result = validateClaimAnalysisResponse({ damagedParts: null });
    expect((result.data as any).damagedParts).toEqual([]);
    expect(result.healed).toBe(true);
  });

  it("normalises undefined indicators to []", () => {
    const result = validateClaimAnalysisResponse({ indicators: undefined });
    expect((result.data as any).indicators).toEqual([]);
  });

  it("preserves existing arrays", () => {
    const arr = [{ name: "bumper" }];
    const result = validateClaimAnalysisResponse({ damagedParts: arr });
    expect((result.data as any).damagedParts).toEqual(arr);
    expect(result.healed).toBe(false);
  });
});

// ─── validateAndHeal ──────────────────────────────────────────────────────────

describe("validateAndHeal", () => {
  it("returns healed data for valid input", () => {
    const data = validateAndHeal({ fraudScore: 150, confidence: 200 });
    expect((data as any).fraudScore).toBe(100);
    expect((data as any).confidence).toBe(100);
  });

  it("throws for blocked input (null)", () => {
    expect(() => validateAndHeal(null)).toThrow();
  });

  it("throws for blocked input (undefined)", () => {
    expect(() => validateAndHeal(undefined)).toThrow();
  });
});

// ─── validateClaimAnalysisList ────────────────────────────────────────────────

describe("validateClaimAnalysisList", () => {
  it("filters out blocked items and heals valid ones", () => {
    const input = [
      { fraudScore: 30 },
      null,
      { fraudScore: 200 }, // will be healed to 100
      undefined,
      { confidence: 80 },
    ];
    const result = validateClaimAnalysisList(input as unknown[]);
    expect(result.length).toBe(3);
    expect((result[1] as any).fraudScore).toBe(100);
  });

  it("returns empty array when all items are blocked", () => {
    const result = validateClaimAnalysisList([null, undefined, "string"]);
    expect(result).toEqual([]);
  });

  it("returns all items when all pass", () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = validateClaimAnalysisList(input);
    expect(result.length).toBe(3);
  });
});

// ─── Correction log structure ─────────────────────────────────────────────────

describe("Correction log structure", () => {
  it("includes timestamp on every correction", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: 200 });
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.corrections[0].timestamp).toBeDefined();
    expect(typeof result.corrections[0].timestamp).toBe("string");
  });

  it("includes original and corrected values", () => {
    const result = validateClaimAnalysisResponse({ fraudScore: 200 });
    const c = result.corrections[0];
    expect(c.original_value).toBe(200);
    expect(c.corrected_value).toBe(100);
  });

  it("includes validated_at timestamp on result", () => {
    const result = validateClaimAnalysisResponse({ id: 1 });
    expect(result.validated_at).toBeDefined();
    expect(typeof result.validated_at).toBe("string");
  });

  it("healed flag is false when no corrections applied", () => {
    const result = validateClaimAnalysisResponse({ id: 1, fraudScore: 50, confidence: 80 });
    expect(result.healed).toBe(false);
    expect(result.corrections.length).toBe(0);
  });
});
